from pathlib import Path
from datetime import timedelta
import environ

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY = env('DJANGO_SECRET_KEY', default='dev-secret-key')
DEBUG = env.bool('DJANGO_DEBUG', default=True)
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS', default=['localhost','127.0.0.1'])

INSTALLED_APPS = [
    'django.contrib.admin','django.contrib.auth','django.contrib.contenttypes','django.contrib.sessions','django.contrib.messages','django.contrib.staticfiles',
    'rest_framework','rest_framework_simplejwt','corsheaders',
    'apps.accounts','apps.curriculum','apps.curricula','apps.patterns','apps.worksheets','apps.boards','apps.ai','apps.assets',
]
MIDDLEWARE = ['corsheaders.middleware.CorsMiddleware','django.middleware.security.SecurityMiddleware','django.contrib.sessions.middleware.SessionMiddleware','django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware','django.contrib.auth.middleware.AuthenticationMiddleware','django.contrib.messages.middleware.MessageMiddleware','django.middleware.clickjacking.XFrameOptionsMiddleware']
ROOT_URLCONF='config.urls'
TEMPLATES=[{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[],'APP_DIRS':True,'OPTIONS':{'context_processors':['django.template.context_processors.request','django.contrib.auth.context_processors.auth','django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION='config.wsgi.application'
ASGI_APPLICATION='config.asgi.application'
DATABASES={'default': env.db('DATABASE_URL', default='sqlite:///db.sqlite3')}
LANGUAGE_CODE='de-de'
TIME_ZONE='Europe/Berlin'
USE_I18N=True
USE_TZ=True
STATIC_URL='static/'
MEDIA_URL='/media/'
MEDIA_ROOT=BASE_DIR / 'media'
DEFAULT_AUTO_FIELD='django.db.models.BigAutoField'
CORS_ALLOWED_ORIGINS=env.list('CORS_ALLOWED_ORIGINS', default=['http://localhost:5173'])
CORS_ALLOW_CREDENTIALS = env.bool('CORS_ALLOW_CREDENTIALS', default=True)
# SPA (anderer Port als API): CSRF-Prüfung bei Cookie-Requests mit Origin/Referer absichern
CSRF_TRUSTED_ORIGINS = env.list(
    'CSRF_TRUSTED_ORIGINS',
    default=['http://localhost:5173', 'http://127.0.0.1:5173'],
)
API_REQUIRE_AUTH = env.bool('API_REQUIRE_AUTH', default=True)
REST_FRAMEWORK={
    'DEFAULT_AUTHENTICATION_CLASSES': ('apps.accounts.authentication.CookieJWTAuthentication',),
    'DEFAULT_PERMISSION_CLASSES': (
        ('rest_framework.permissions.IsAuthenticated',)
        if API_REQUIRE_AUTH
        else ('rest_framework.permissions.AllowAny',)
    ),
}
SIMPLE_JWT={'ACCESS_TOKEN_LIFETIME': timedelta(minutes=120), 'REFRESH_TOKEN_LIFETIME': timedelta(days=7)}
# JWT in HttpOnly-Cookies (Login setzt Cookies; Bearer-Header bleibt über CookieJWTAuthentication möglich)
JWT_AUTH_COOKIE_ACCESS = env('JWT_AUTH_COOKIE_ACCESS', default='access')
JWT_AUTH_COOKIE_REFRESH = env('JWT_AUTH_COOKIE_REFRESH', default='refresh')
JWT_AUTH_COOKIE_SECURE = env.bool('JWT_AUTH_COOKIE_SECURE', default=not DEBUG)
JWT_AUTH_COOKIE_SAMESITE = env('JWT_AUTH_COOKIE_SAMESITE', default='Lax')
JWT_AUTH_COOKIE_HTTPONLY = env.bool('JWT_AUTH_COOKIE_HTTPONLY', default=True)
JWT_AUTH_COOKIE_PATH = env('JWT_AUTH_COOKIE_PATH', default='/')
JWT_AUTH_COOKIE_DOMAIN = env('JWT_AUTH_COOKIE_DOMAIN', default=None) or None
# Nur für Tests/Debug: Klartext-Tokens in Login/Refresh-JSON zusätzlich ausgeben (Standard aus)
JWT_AUTH_EXPOSE_BODY_TOKENS = env.bool('JWT_AUTH_EXPOSE_BODY_TOKENS', default=False)

# ── KI-Credits (Abrechnung aus geschätzten USD-Tokenkosten → EUR → Credits)
# 10000 Credits = 10 EUR ⇒ USER_CREDITS_PER_EUR=1000
AI_CREDITS_ENABLED = env.bool('AI_CREDITS_ENABLED', default=True)
USER_CREDITS_INITIAL_BALANCE = env.int('USER_CREDITS_INITIAL_BALANCE', default=10000)
USER_CREDITS_REFERENCE_CAP = env.int('USER_CREDITS_REFERENCE_CAP', default=10000)
USER_CREDITS_PER_EUR = env.int('USER_CREDITS_PER_EUR', default=1000)
AI_COST_USD_TO_EUR = env.float('AI_COST_USD_TO_EUR', default=0.92)

AI_PROVIDER=env('AI_PROVIDER', default='gemini')
GEMINI_API_KEY=env('GEMINI_API_KEY', default='')
# Optional: Anthropic Claude — `AI_PROVIDER=claude` oder Ultra-Modus für Boards (`ai_quality_tier: ultra`).
CLAUDE_API_KEY=env('CLAUDE_API_KEY', default='')
CLAUDE_MODEL=env('CLAUDE_MODEL', default='claude-sonnet-4-20250514')
CLAUDE_MAX_OUTPUT_TOKENS=env.int('CLAUDE_MAX_OUTPUT_TOKENS', default=32768)
CLAUDE_TIMEOUT_SECONDS=env.float('CLAUDE_TIMEOUT_SECONDS', default=600.0)
CLAUDE_WORKSHEET_TEMPERATURE=env.float('CLAUDE_WORKSHEET_TEMPERATURE', default=0.35)
# Neuere Claude-Modelle (z. B. 4.6/4.7) geben 400, wenn ``temperature`` gesetzt ist.
# True = Legacy-Verhalten für ältere Modell-IDs, die Temperatur noch erwarten.
CLAUDE_SEND_TEMPERATURE=env.bool('CLAUDE_SEND_TEMPERATURE', default=False)
# Standard: Pro (Qualität). Alternativen: gemini-2.5-pro, gemini-3.1-pro-preview (Preview, siehe Google AI Modelle).
GEMINI_MODEL=env('GEMINI_MODEL', default='gemini-2.5-pro')
# Bei „model not found“ / ungültiger Modell-ID: zweites Modell versuchen (leere Variable = aus).
GEMINI_MODEL_FALLBACK=env('GEMINI_MODEL_FALLBACK', default='gemini-2.5-pro')
GEMINI_TEMPERATURE=env.float('GEMINI_TEMPERATURE', default=0.35)
# Max. Wartezeit des HTTP-Clients bis zur Antwort (Sekunden). Unabhängig von Googles eigenem
# DEADLINE_EXCEEDED (serverseitige Generierungsgrenze) — dieses Timeout nur höher setzen, wenn
# echte ReadTimeouts im Log stehen, nicht bei schnellem DEADLINE_EXCEEDED.
GEMINI_TIMEOUT_SECONDS=env.int('GEMINI_TIMEOUT_SECONDS', default=600)
# Bei DEADLINE_EXCEEDED: automatische Wiederholungen (transiente Google-Limits).
# GEMINI_DEADLINE_RETRIES = Anzahl der *Zusatz*versuche nach dem ersten Fehlschlag
# (Default 4 → bis zu 5 API-Aufrufe insgesamt).
# Pause vor jedem erneuten Versuch: GEMINI_DEADLINE_RETRY_DELAY_SECONDS (Default 60 s).
# GEMINI_DEADLINE_RETRY_EXPONENTIAL=True verdoppelt die Wartezeit je Fehlschlag (60, 120, 240, …).
GEMINI_DEADLINE_RETRIES=env.int('GEMINI_DEADLINE_RETRIES', default=4)
GEMINI_DEADLINE_RETRY_DELAY_SECONDS=env.float('GEMINI_DEADLINE_RETRY_DELAY_SECONDS', default=60.0)
GEMINI_DEADLINE_RETRY_EXPONENTIAL=env.bool('GEMINI_DEADLINE_RETRY_EXPONENTIAL', default=False)
# Ohne explizites Limit kann die API die Ausgabe bei ~8k Tokens kappen (kaputtes / unvollständiges JSON).
# gemini-2.5-pro erlaubt bis ca. 65k Ausgabe-Tokens; andere Modelle ggf. in .env runtersetzen.
GEMINI_MAX_OUTPUT_TOKENS=env.int('GEMINI_MAX_OUTPUT_TOKENS', default=65536)
# Zweiter API-Durchgang: Lückentext-Redundanzen, Linien vs. Aufgabe, Fläche, Fach-Kohärenz (doppelte Kosten/Latenz).
GEMINI_ENABLE_REVIEW_PASS=env.bool('GEMINI_ENABLE_REVIEW_PASS', default=False)
# Max. zusätzliche pages am Ende, die der Review-Durchgang anfügen darf (Schutz vor Ausreißern).
GEMINI_REVIEW_MAX_EXTRA_PAGES=env.int('GEMINI_REVIEW_MAX_EXTRA_PAGES', default=10)
# Eingabe-Prompt: kompaktes JSON (weniger Whitespace) spart Token bei langen Lehrer-Texten / großen Blueprints.
GEMINI_COMPACT_PROMPT_JSON=env.bool('GEMINI_COMPACT_PROMPT_JSON', default=True)
# Regelwerk als system_instruction, variable Daten als Nutzer-Text (bessere Zuordnung + optionales API-Caching).
GEMINI_PROMPT_SPLIT_SYSTEM_USER=env.bool('GEMINI_PROMPT_SPLIT_SYSTEM_USER', default=True)
# Unterordner unter apps/ai/prompts/formats/ — Prompt-Bündel pro Ausgabeformat (MVP: html_a4_worksheet).
AI_PROMPT_WORKSHEET_FORMAT=env('AI_PROMPT_WORKSHEET_FORMAT', default='html_a4_worksheet')
DEFAULT_PAGE_SETUP={
    'format':'A4',
    'orientation': env('DEFAULT_PAGE_ORIENTATION', default='portrait'),
    # 12 mm = gleicher Default wie Wizard Schritt „Design & Seite“
    'margins_mm': {
        'top': env.float('DEFAULT_MARGIN_TOP_MM', default=12),
        'right': env.float('DEFAULT_MARGIN_RIGHT_MM', default=12),
        'bottom': env.float('DEFAULT_MARGIN_BOTTOM_MM', default=12),
        'left': env.float('DEFAULT_MARGIN_LEFT_MM', default=12),
    }
}
# A4-Zeilenbudget (KI-Prompt): LaTeX-\\baselineskip in pt (11pt Standard ≈ 13.6 pt).
WORKSHEET_LINE_BUDGET_BASELINESKIP_PT = env.float('WORKSHEET_LINE_BUDGET_BASELINESKIP_PT', default=13.6)
# Platz für App-Kopf (Titelzeile) bzw. Fuß (u. a. Seitenhinweis), von safe_area-Höhe abziehen.
WORKSHEET_LINE_BUDGET_HEADER_RESERVE_MM = env.float('WORKSHEET_LINE_BUDGET_HEADER_RESERVE_MM', default=26.0)
WORKSHEET_LINE_BUDGET_FOOTER_RESERVE_MM = env.float('WORKSHEET_LINE_BUDGET_FOOTER_RESERVE_MM', default=16.0)
# 0.35–1.0: Anteil der rein physischen Zeilen, der als Obergrenze für gemischte Blöcke gilt (HTML ≠ TeX).
WORKSHEET_LINE_BUDGET_CONTENT_FACTOR = env.float('WORKSHEET_LINE_BUDGET_CONTENT_FACTOR', default=0.70)

# Boards (Interaktive Free-HTML5-Boards)
# Provider-Override: 'default' nutzt AI_PROVIDER, 'mock' erzwingt den Mock-Generator (offline).
BOARDS_AI_PROVIDER = env('BOARDS_AI_PROVIDER', default='default')
BOARDS_FREE_HTML_GENERATION_TEMPERATURE = env.float('BOARDS_FREE_HTML_GENERATION_TEMPERATURE', default=0.55)
BOARDS_FREE_HTML_REVISION_TEMPERATURE = env.float('BOARDS_FREE_HTML_REVISION_TEMPERATURE', default=0.4)
BOARDS_FREE_HTML_REPAIR_TEMPERATURE = env.float('BOARDS_FREE_HTML_REPAIR_TEMPERATURE', default=0.25)
# Nach Erst- oder Revisions-Generierung: max. zusätzliche KI-Reparaturrunden bei serverseitigen Validierungsfehlern (0–5).
# Standard jetzt **1**: ein einziger struktureller Reparatur-Versuch, kein iterative „bis grün“.
BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS = env.int('BOARDS_FREE_HTML_MAX_REPAIR_ATTEMPTS', default=1)
# Visuelle QA (Playwright/Chromium): URL des Frontends, damit <base href> /board-libs und /board-assets auflöst.
BOARDS_VISUAL_QA_DOCUMENT_BASE = env('BOARDS_VISUAL_QA_DOCUMENT_BASE', default='http://127.0.0.1:5173/')
# Visuelle Layout-QA (Playwright): bei True läuft sie bei jeder Board-Erzeugung und -Revision
# (kein UI-Toggle). Deaktivieren nur, wenn kein Chromium/keine Basis-URL verfügbar.
BOARDS_VISUAL_QA_ALLOWED = env.bool('BOARDS_VISUAL_QA_ALLOWED', default=True)

# Bausteinmodus: optionaler KI-Feinschliff (Theme-Wahl + Mikrotexte) — niemals Code.
# Bei False werden Theme/Notizen/Hinweise rein deterministisch aus der Spec befüllt.
BOARDS_BLOCKS_FINISHING_ENABLED = env.bool('BOARDS_BLOCKS_FINISHING_ENABLED', default=True)

# ---------------------------------------------------------------------------
# Smartboard Kreativmodus-Pipeline
# Klein(e) Kontroll-Schritte + ein großer Code-Schritt + einmaliges Validierungsrepair;
# zusätzlicher großer Nachbesserungspass nach Audits optional per Setting (default aus).
# ---------------------------------------------------------------------------
SMARTBOARD_SMALL_MODEL_PROVIDER = env('SMARTBOARD_SMALL_MODEL_PROVIDER', default='gemini')
SMARTBOARD_SMALL_MODEL = env('SMARTBOARD_SMALL_MODEL', default='gemini-2.5-flash')
SMARTBOARD_LARGE_MODEL_PROVIDER = env('SMARTBOARD_LARGE_MODEL_PROVIDER', default='gemini')
SMARTBOARD_LARGE_MODEL = env('SMARTBOARD_LARGE_MODEL', default='gemini-2.5-pro')
SMARTBOARD_USE_PIPELINE = env.bool('SMARTBOARD_USE_PIPELINE', default=True)
# Nach Touch/Screenshot-Audit: zusätzlicher großer „RepairAgent“-Pass (oft redundant zu Validierungsrepair).
# Default **aus**, um keine zweite Groß-Reparaturschleife zu bezahlen.
SMARTBOARD_ENABLE_PIPELINE_REPAIR_AGENT = env.bool('SMARTBOARD_ENABLE_PIPELINE_REPAIR_AGENT', default=False)
# Im ausgeschalteten Phase-6-Pfad ohne Bedarf: höchstens dieser Cap, wenn ihr den Agent aktiv habt (0–5).
SMARTBOARD_MAX_AUTO_REPAIRS = env.int('SMARTBOARD_MAX_AUTO_REPAIRS', default=1)
SMARTBOARD_ENABLE_SCREENSHOT_JUDGE = env.bool('SMARTBOARD_ENABLE_SCREENSHOT_JUDGE', default=True)
SMARTBOARD_ENABLE_TOUCH_AUDIT = env.bool('SMARTBOARD_ENABLE_TOUCH_AUDIT', default=True)
# Bei fehlgeschlagenem Touch-Audit optional **ein** zusätzlicher Reparatur-LLM (nur wenn nötig).
SMARTBOARD_TOUCH_ONLY_REPAIR = env.bool('SMARTBOARD_TOUCH_ONLY_REPAIR', default=True)
SMARTBOARD_ENABLE_BROWSER_SMOKE_TEST = env.bool('SMARTBOARD_ENABLE_BROWSER_SMOKE_TEST', default=True)
SMARTBOARD_ENABLE_CREATIVE_BRIEF = env.bool('SMARTBOARD_ENABLE_CREATIVE_BRIEF', default=True)
SMARTBOARD_ENABLE_STYLE_DNA = env.bool('SMARTBOARD_ENABLE_STYLE_DNA', default=True)
# Vision-Pfad für Screenshot-Judge — aktuell als TODO-Hook. Siehe README.
SMARTBOARD_ENABLE_VISION_JUDGE = env.bool('SMARTBOARD_ENABLE_VISION_JUDGE', default=False)
SMARTBOARD_CODE_MAX_HTML_CHARS = env.int('SMARTBOARD_CODE_MAX_HTML_CHARS', default=80000)
SMARTBOARD_CODE_MAX_CSS_CHARS = env.int('SMARTBOARD_CODE_MAX_CSS_CHARS', default=120000)
SMARTBOARD_CODE_MAX_JS_CHARS = env.int('SMARTBOARD_CODE_MAX_JS_CHARS', default=120000)
SMARTBOARD_DEFAULT_QUALITY_MODE = env('SMARTBOARD_DEFAULT_QUALITY_MODE', default='balanced')
SMARTBOARD_PREMIUM_QUALITY_MODE = env('SMARTBOARD_PREMIUM_QUALITY_MODE', default='full')

# ── Asset-Engine (Smartboard) ─────────────────────────────────────────────────
# Steuert die professionelle SVG-/Asset-Pipeline für den Kreativmodus. Wenn
# deaktiviert, läuft der Kreativmodus weiterhin ohne eigene Asset-Pipeline.
ASSET_ENGINE_ENABLED = env.bool('ASSET_ENGINE_ENABLED', default=True)
ASSET_MAX_ASSETS_PER_PACK = env.int('ASSET_MAX_ASSETS_PER_PACK', default=8)
ASSET_MAX_REPAIR_ATTEMPTS = env.int('ASSET_MAX_REPAIR_ATTEMPTS', default=1)
ASSET_ENABLE_HERO_VARIANTS = env.bool('ASSET_ENABLE_HERO_VARIANTS', default=True)
ASSET_HERO_VARIANT_COUNT = env.int('ASSET_HERO_VARIANT_COUNT', default=2)
ASSET_ENABLE_QUALITY_JUDGE = env.bool('ASSET_ENABLE_QUALITY_JUDGE', default=True)
# Zusätzliches kleines LLM für Asset-QA (promptet mit SVG-Teasern) — ohne True nur Heuristiken.
ASSET_QUALITY_JUDGE_LLM = env.bool('ASSET_QUALITY_JUDGE_LLM', default=False)
ASSET_ENABLE_SVG_RENDER_PREVIEW = env.bool('ASSET_ENABLE_SVG_RENDER_PREVIEW', default=True)
ASSET_DEFAULT_STYLE_FAMILY = env('ASSET_DEFAULT_STYLE_FAMILY', default='auto')
ASSET_USE_EXISTING_REUSABLE_FIRST = env.bool('ASSET_USE_EXISTING_REUSABLE_FIRST', default=True)
ASSET_ALLOW_SVG_FREE_DRAW = env.bool('ASSET_ALLOW_SVG_FREE_DRAW', default=True)
ASSET_PREFER_PROCEDURAL_FOR_SIMPLE = env.bool('ASSET_PREFER_PROCEDURAL_FOR_SIMPLE', default=True)
# Modell-Routing für Asset-Engine (Fallback auf SMARTBOARD_*).
ASSET_SMALL_MODEL_PROVIDER = env('ASSET_SMALL_MODEL_PROVIDER', default=SMARTBOARD_SMALL_MODEL_PROVIDER)
ASSET_SMALL_MODEL = env('ASSET_SMALL_MODEL', default=SMARTBOARD_SMALL_MODEL)
ASSET_LARGE_MODEL_PROVIDER = env('ASSET_LARGE_MODEL_PROVIDER', default=SMARTBOARD_LARGE_MODEL_PROVIDER)
ASSET_LARGE_MODEL = env('ASSET_LARGE_MODEL', default=SMARTBOARD_LARGE_MODEL)
# Inline vs. URL-Auslieferung: Schwellwert in Bytes für Inline-Embedding ins Board-HTML.
ASSET_INLINE_MAX_BYTES = env.int('ASSET_INLINE_MAX_BYTES', default=8000)
ASSET_INLINE_SIMPLE_IN_BOARD_HTML = env.bool('ASSET_INLINE_SIMPLE_IN_BOARD_HTML', default=True)

# Grobe Token-Kosten (USD pro **1 Million** Tokens) für geschätztes ``AIUsageLog.estimated_cost_cents``.
# Über ``AI_COST_USD_TO_EUR`` und ``USER_CREDITS_PER_EUR`` werden Nutzer-Credits abgeleitet (``apps.accounts.services.credits``).
# Preise beim Anbieter nachschlagen und setzen — sonst bleiben die Cent-Schätzungen 0 und es werden keine Credits abgezogen.
AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_FLASH_INPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_FLASH_OUTPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_FLASH_LITE_INPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_FLASH_LITE_INPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_FLASH_LITE_OUTPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_FLASH_LITE_OUTPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_PREVIEW_INPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_PREVIEW_INPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_PREVIEW_OUTPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_PREVIEW_OUTPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_25_PRO_INPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_25_PRO_INPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_25_PRO_OUTPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_25_PRO_OUTPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_PRO_INPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_PRO_INPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_PRO_OUTPUT_PRICE_PER_MILLION_USD = env.float('AI_GEMINI_PRO_OUTPUT_PRICE_PER_MILLION_USD', default=0)
AI_GEMINI_COUNT_THINKING_TOKENS_AS_OUTPUT = env.bool('AI_GEMINI_COUNT_THINKING_TOKENS_AS_OUTPUT', default=False)
AI_CLAUDE_INPUT_PRICE_PER_MILLION_USD = env.float('AI_CLAUDE_INPUT_PRICE_PER_MILLION_USD', default=0)
AI_CLAUDE_OUTPUT_PRICE_PER_MILLION_USD = env.float('AI_CLAUDE_OUTPUT_PRICE_PER_MILLION_USD', default=0)


CURRICULUM_EXTRACTION_PROVIDER = env('CURRICULUM_EXTRACTION_PROVIDER', default='')
CURRICULUM_REQUIRE_HUMAN_REVIEW = env.bool('CURRICULUM_REQUIRE_HUMAN_REVIEW', default=True)
CURRICULUM_MAX_PAGES_PER_EXTRACTION = env.int('CURRICULUM_MAX_PAGES_PER_EXTRACTION', default=8)
CURRICULUM_STORE_SOURCE_EXCERPTS = env.bool('CURRICULUM_STORE_SOURCE_EXCERPTS', default=True)
CURRICULUM_SHOW_USAGE_TO_TEACHERS = env.bool('CURRICULUM_SHOW_USAGE_TO_TEACHERS', default=True)
CURRICULUM_MAX_SOURCE_UPLOAD_MB = env.int('CURRICULUM_MAX_SOURCE_UPLOAD_MB', default=50)
# Auto-Modus (RLP-PDF in einem Rutsch): Discovery + Map-Reduce-Extraktion
CURRICULUM_AUTO_DISCOVERY_PROVIDER = env('CURRICULUM_AUTO_DISCOVERY_PROVIDER', default='')
CURRICULUM_AUTO_MAX_PAGES_PER_SLICE = env.int('CURRICULUM_AUTO_MAX_PAGES_PER_SLICE', default=12)
CURRICULUM_AUTO_MAX_TOTAL_SLICES = env.int('CURRICULUM_AUTO_MAX_TOTAL_SLICES', default=80)
# Nach TOC-Einträgen dynamisches Ceiling (mindestens MAX_TOTAL_SLICES, höchstens dieses Cap)
CURRICULUM_AUTO_MAX_TOTAL_SLICES_HARD_CAP = env.int('CURRICULUM_AUTO_MAX_TOTAL_SLICES_HARD_CAP', default=400)
CURRICULUM_AUTO_DISCOVERY_MAX_ROUNDS = env.int('CURRICULUM_AUTO_DISCOVERY_MAX_ROUNDS', default=6)
CURRICULUM_AUTO_TOC_PAGES = env.int('CURRICULUM_AUTO_TOC_PAGES', default=14)
CURRICULUM_AUTO_RETRY_LIMIT = env.int('CURRICULUM_AUTO_RETRY_LIMIT', default=2)
CURRICULUM_AUTO_DISCOVERY_TEMPERATURE = env.float('CURRICULUM_AUTO_DISCOVERY_TEMPERATURE', default=0.0)
