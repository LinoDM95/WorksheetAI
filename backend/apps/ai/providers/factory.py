from django.conf import settings
from .claude import ClaudeWorksheetProvider
from .mock import MockWorksheetProvider
from .gemini import GeminiWorksheetProvider


def get_provider():
    name = (getattr(settings, 'AI_PROVIDER', None) or 'gemini').strip().lower()
    if name == 'mock':
        return MockWorksheetProvider()
    if name == 'claude':
        return ClaudeWorksheetProvider()
    return GeminiWorksheetProvider()
