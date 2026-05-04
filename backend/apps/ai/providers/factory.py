from django.conf import settings
from .mock import MockWorksheetProvider
from .gemini import GeminiWorksheetProvider

def get_provider():
    name = (getattr(settings, 'AI_PROVIDER', None) or 'gemini').strip().lower()
    if name == 'mock':
        return MockWorksheetProvider()
    return GeminiWorksheetProvider()
