"""QualityReportService — aggregiert alle Pipeline-Audits in einen Report.

Pure Aggregation, keine KI. Wird im Board gespeichert und im Frontend als Ampel +
Sektionen angezeigt.
"""
from __future__ import annotations

from typing import Any


def _section_status(score: int) -> str:
    if score >= 85:
        return 'passed'
    if score >= 60:
        return 'warning'
    return 'failed'


def _bool_to_score(passed: bool, *, when_passed: int = 90, when_failed: int = 50) -> int:
    return when_passed if passed else when_failed


def _shorten(items: list[Any], max_items: int = 6, max_len: int = 240) -> list[str]:
    out: list[str] = []
    for entry in items[:max_items] if isinstance(items, list) else []:
        s = str(entry).strip()
        if not s:
            continue
        out.append(s[:max_len])
    return out


def _score_security(validation_errors: list[str]) -> tuple[int, list[str]]:
    if not validation_errors:
        return 100, []
    forbidden = [e for e in validation_errors if 'JavaScript enthält' in e or 'iframe' in e or 'javascript:' in e]
    if forbidden:
        return 30, _shorten(forbidden)
    return 60, _shorten(validation_errors)


def _score_browser(browser_test_result: dict | None) -> tuple[int, list[str]]:
    if not browser_test_result:
        return 80, ['Headless-Browser-Test wurde nicht ausgeführt.']
    if browser_test_result.get('ran') is False:
        return 70, [browser_test_result.get('reason') or 'Browser-Test übersprungen.']
    errors = browser_test_result.get('errors') or []
    if errors:
        return 40, _shorten(errors)
    return 95, []


def _score_touch(touch: dict | None) -> tuple[int, list[str]]:
    if not touch:
        return 70, ['Touch-Audit wurde nicht ausgeführt.']
    score = touch.get('score')
    if isinstance(score, (int, float)):
        score = max(0, min(100, int(score)))
    else:
        score = _bool_to_score(bool(touch.get('passed', True)))
    issues = touch.get('issues') or []
    msgs = [i.get('message') for i in issues if isinstance(i, dict) and i.get('message')]
    return score, _shorten(msgs)


def _score_design(screenshot: dict | None) -> tuple[int, list[str]]:
    if not screenshot:
        return 70, []
    if screenshot.get('ran') is False:
        return 70, [screenshot.get('reason') or 'Screenshot-Judge nicht aktiv.']
    score = int(screenshot.get('overall_score') or 70)
    issues = screenshot.get('issues') or []
    return max(0, min(100, score)), _shorten(issues)


def _score_content(risk: dict | None) -> tuple[int, list[str]]:
    if not risk:
        return 80, []
    high_risks = [r for r in (risk.get('risks') or [])
                  if isinstance(r, dict) and (r.get('level') == 'high')]
    if not high_risks:
        return 90, []
    score = max(50, 90 - 10 * len(high_risks))
    msgs = [f'{r.get("type")}: {r.get("mitigation") or r.get("reason") or ""}'.strip(': ').strip()
            for r in high_risks]
    return score, _shorten(msgs)


def _score_performance(touch: dict | None, validation_warnings: list[str]) -> tuple[int, list[str]]:
    issues: list[str] = []
    score = 90
    for w in (validation_warnings or []):
        if 'setInterval' in w or 'crypto' in w:
            issues.append(w)
            score -= 10
    el_count = (touch or {}).get('element_count')
    if isinstance(el_count, int) and el_count > 80:
        issues.append(f'Sehr viele Bedienelemente ({el_count}) — kann Performance/Übersicht beeinträchtigen.')
        score -= 10
    return max(0, score), _shorten(issues)


def _next_actions(*, security_score: int, touch_score: int, design_score: int,
                  content_score: int, performance_score: int) -> list[str]:
    suggestions: list[str] = []
    if security_score < 80:
        suggestions.append('Sicherheitswarnungen prüfen und Auto-Reparatur ausführen.')
    if touch_score < 80:
        suggestions.append('Touch verbessern (Touchflächen ≥ 56 px, Pointer-Events).')
    if design_score < 70:
        suggestions.append('Design verbessern (Hierarchie, Akzent sparsam).')
    if content_score < 80:
        suggestions.append('Inhaltliche Hinweise prüfen, ggf. fachliche Warnung ergänzen.')
    if performance_score < 80:
        suggestions.append('Performance verbessern (Animationen reduzieren, setInterval prüfen).')
    return suggestions[:5]


def build_quality_report(
    *,
    validation_errors: list[str] | None = None,
    validation_warnings: list[str] | None = None,
    browser_test_result: dict | None = None,
    touch_audit_result: dict | None = None,
    screenshot_quality_result: dict | None = None,
    repair_history: list[dict] | None = None,
    risk_analysis: dict | None = None,
    style_dna: dict | None = None,  # noqa: ARG001 — derzeit nur für künftige Bewertungen
) -> dict[str, Any]:
    """Aggregiert Audits zu einem Quality Report.

    Schwellwerte:
    - overall_score >= 85 → ``passed``
    - overall_score in [60, 85) → ``warning``
    - sonst → ``failed``
    """
    verrs = list(validation_errors or [])
    vwarns = list(validation_warnings or [])
    sec_score, sec_msgs = _score_security(verrs)
    browser_score, browser_msgs = _score_browser(browser_test_result)
    touch_score, touch_msgs = _score_touch(touch_audit_result)
    design_score, design_msgs = _score_design(screenshot_quality_result)
    content_score, content_msgs = _score_content(risk_analysis)
    perf_score, perf_msgs = _score_performance(touch_audit_result, vwarns)

    sections = {
        'security': {'score': sec_score, 'status': _section_status(sec_score), 'issues': sec_msgs},
        'browser': {'score': browser_score, 'status': _section_status(browser_score), 'issues': browser_msgs},
        'touch': {'score': touch_score, 'status': _section_status(touch_score), 'issues': touch_msgs},
        'design': {'score': design_score, 'status': _section_status(design_score), 'issues': design_msgs},
        'content': {'score': content_score, 'status': _section_status(content_score), 'issues': content_msgs},
        'performance': {'score': perf_score, 'status': _section_status(perf_score), 'issues': perf_msgs},
    }
    weights = {
        'security': 0.25, 'browser': 0.10, 'touch': 0.20,
        'design': 0.20, 'content': 0.15, 'performance': 0.10,
    }
    overall_score = round(sum(sections[k]['score'] * w for k, w in weights.items()))
    overall_status = (
        'failed' if overall_score < 60 or sec_score < 50
        else 'warning' if overall_score < 85
        else 'passed'
    )

    summary_bits = []
    if verrs:
        summary_bits.append(f'{len(verrs)} Validierungsfehler')
    if touch_audit_result and not touch_audit_result.get('passed', True):
        summary_bits.append('Touch-Probleme')
    if screenshot_quality_result and (screenshot_quality_result.get('overall_score') or 100) < 75:
        summary_bits.append('Designhinweise')
    if not summary_bits:
        summary_bits.append('keine wesentlichen Probleme')
    teacher_summary = 'Geprüft: ' + ', '.join(summary_bits) + '.'

    warnings_collected: list[str] = []
    warnings_collected.extend(_shorten(vwarns, max_items=10))
    if risk_analysis and risk_analysis.get('teacher_warning'):
        warnings_collected.append(str(risk_analysis['teacher_warning'])[:240])

    return {
        'overall_status': overall_status,
        'overall_score': overall_score,
        'sections': sections,
        'teacher_facing_summary': teacher_summary,
        'warnings': warnings_collected[:10],
        'suggested_next_actions': _next_actions(
            security_score=sec_score, touch_score=touch_score, design_score=design_score,
            content_score=content_score, performance_score=perf_score,
        ),
        'repair_count': len(repair_history or []),
    }
