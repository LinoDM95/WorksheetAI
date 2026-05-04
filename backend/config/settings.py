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
    'apps.accounts','apps.curriculum','apps.patterns','apps.worksheets','apps.ai',
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
API_REQUIRE_AUTH = env.bool('API_REQUIRE_AUTH', default=True)
REST_FRAMEWORK={
    'DEFAULT_AUTHENTICATION_CLASSES': ('rest_framework_simplejwt.authentication.JWTAuthentication',),
    'DEFAULT_PERMISSION_CLASSES': (
        ('rest_framework.permissions.IsAuthenticated',)
        if API_REQUIRE_AUTH
        else ('rest_framework.permissions.AllowAny',)
    ),
}
SIMPLE_JWT={'ACCESS_TOKEN_LIFETIME': timedelta(minutes=120), 'REFRESH_TOKEN_LIFETIME': timedelta(days=7)}

AI_PROVIDER=env('AI_PROVIDER', default='gemini')
GEMINI_API_KEY=env('GEMINI_API_KEY', default='')
# Standard: Pro (Qualität). Alternativen: gemini-2.5-pro, gemini-3.1-pro-preview (Preview, siehe Google AI Modelle).
GEMINI_MODEL=env('GEMINI_MODEL', default='gemini-2.5-pro')
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
