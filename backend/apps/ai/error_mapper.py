"""AI-Provider-Fehler → konsistente HTTP-Antworten.

Vorher waren die Heuristiken in `apps/worksheets/views.py` als drei freie
Funktionen verstreut (`_ai_http_status`, `_ai_error_code`, `_ai_http_detail`).
Diese Klasse kapselt sie an *einer* Stelle, damit Generieren, Seiten-
Regenerieren und alle künftigen KI-Endpunkte denselben Vertrag liefern.
"""
from __future__ import annotations

from typing import Tuple

from rest_framework import response


class AIErrorMapper:
    """Mappt eine ``Exception`` aus dem AI-Provider-Layer auf (status, code, detail)."""

    def __init__(self, exc: BaseException) -> None:
        self.exc = exc
        self._technical = (str(exc).strip() or repr(exc))

    @classmethod
    def to_response(cls, exc: BaseException, *, detail_prefix: str = "") -> response.Response:
        """Komfort-API für Views: ``return AIErrorMapper.to_response(exc)``."""
        mapper = cls(exc)
        status, code, detail = mapper.parts()
        if detail_prefix:
            detail = f"{detail_prefix}: {detail}"
        return response.Response({"detail": detail, "error_code": code}, status=status)

    def parts(self) -> Tuple[int, str, str]:
        return self.http_status(), self.error_code(), self.detail()

    def http_status(self) -> int:
        if self._is_provider_config_missing():
            return 503

        api_err = self._google_api_error()
        if api_err is not None:
            st = (getattr(api_err, "status", None) or "")
            msg = (getattr(api_err, "message", None) or "")
            combined = f"{st} {msg}".upper()
            if st == "DEADLINE_EXCEEDED" or "DEADLINE_EXCEEDED" in combined:
                return 504
            if (
                st == "RESOURCE_EXHAUSTED"
                or "RESOURCE_EXHAUSTED" in combined
                or "429" in str(api_err)
            ):
                return 429
            return 502

        s = self._technical
        s_upper = s.upper()
        if "DEADLINE_EXCEEDED" in s_upper or ("504" in s and "DEADLINE" in s_upper):
            return 504
        if "RESOURCE_EXHAUSTED" in s_upper or "429" in s:
            return 429
        if "ReadTimeout" in s or ("timed out" in s.lower() and "DEADLINE_EXCEEDED" not in s_upper):
            return 504
        return 502

    def error_code(self) -> str:
        if self._is_provider_config_missing():
            return "provider_config"
        st = self.http_status()
        if st == 504:
            return "deadline_exceeded"
        if st == 429:
            return "resource_exhausted"
        return "ai_error"

    def detail(self) -> str:
        api_err = self._google_api_error()
        if api_err is not None:
            return self._format_google_api_error(api_err)
        return self._format_generic()

    def _is_provider_config_missing(self) -> bool:
        return isinstance(self.exc, RuntimeError) and "GEMINI_API_KEY" in str(self.exc)

    def _google_api_error(self):
        try:
            from google.genai import errors as genai_errors
        except ImportError:
            return None
        return self.exc if isinstance(self.exc, genai_errors.APIError) else None

    def _format_google_api_error(self, api_err) -> str:
        st = getattr(api_err, "status", None) or ""
        msg = getattr(api_err, "message", None) or ""
        code = getattr(api_err, "code", None)
        technical = f"{code} {st}".strip()
        if msg:
            technical = f"{technical}. {msg}".strip() if technical else msg

        upper = (st + " " + msg).upper()
        if st == "DEADLINE_EXCEEDED" or "DEADLINE_EXCEEDED" in upper:
            return (
                "Die Gemini-API hat mit DEADLINE_EXCEEDED abgebrochen. Das ist fast immer ein "
                "serverseitiges Limit (Bearbeitungszeit/Kapazität beim Generieren), nicht dasselbe wie "
                "GEMINI_TIMEOUT_SECONDS in der .env — ein schneller Abbruch (unter einer Minute) spricht dafür.\n\n"
                "Das Backend wiederholt solche Anfragen standardmäßig automatisch mehrfach mit langen Pausen "
                "(GEMINI_DEADLINE_RETRIES, GEMINI_DEADLINE_RETRY_DELAY_SECONDS, optional "
                "GEMINI_DEADLINE_RETRY_EXPONENTIAL). Wenn es danach noch fehlschlägt: "
                "kürzerer Lehrer-Prompt (weniger Seiten/kleinere Struktur), GEMINI_MAX_OUTPUT_TOKENS vorübergehend "
                "senken, Modell z. B. gemini-2.5-flash testen, später erneut versuchen. "
                "GEMINI_TIMEOUT_SECONDS erhöhen behebt diesen Fehlertyp meist nicht.\n\n"
                f"Technisch: {technical}"
            )

        if st == "RESOURCE_EXHAUSTED" or "RESOURCE_EXHAUSTED" in upper or "429" in technical:
            return (
                "Kapazitäts- oder Kontingentgrenze (RESOURCE_EXHAUSTED / 429). "
                "Später erneut versuchen, kleinere Anfrage, oder in Google AI Studio Quota prüfen.\n\n"
                f"Technisch: {technical}"
            )

        if "token" in msg.lower() and ("limit" in msg.lower() or "exceed" in msg.lower()):
            return (
                "Token- oder Längenlimit der API. Kürzeren Prompt wählen oder `GEMINI_MAX_OUTPUT_TOKENS` anpassen.\n\n"
                f"Technisch: {technical}"
            )

        return f"Gemini-API-Fehler ({st or 'ohne Status'}).\n\nTechnisch: {technical}"

    def _format_generic(self) -> str:
        s = self._technical
        s_upper = s.upper()
        if (
            "DEADLINE_EXCEEDED" in s_upper
            or "504" in s
            or "timed out" in s.lower()
            or "ReadTimeout" in s
        ):
            if "ReadTimeout" in s or ("timeout" in s.lower() and "DEADLINE_EXCEEDED" not in s_upper):
                return (
                    "Netzwerk- oder Client-Timeout beim Aufruf der KI. "
                    "`GEMINI_TIMEOUT_SECONDS` in `backend/.env` erhöhen, Server neu starten; "
                    "oder schnelleres Modell: `GEMINI_MODEL=gemini-2.5-flash`.\n\n"
                    f"Technisch: {s}"
                )
            return (
                "Abbruch mit DEADLINE_EXCEEDED (häufig serverseitig bei Google, nicht dein lokales HTTP-Timeout). "
                "Kleinerer Prompt / weniger Ausgabe (GEMINI_MAX_OUTPUT_TOKENS), anderer Modellname, erneuter Versuch.\n\n"
                f"Technisch: {s}"
            )
        return s
