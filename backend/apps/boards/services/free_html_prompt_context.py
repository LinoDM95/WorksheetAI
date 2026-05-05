"""Bündelt Library-/Asset-/Dataset-Zusammenfassungen für den KI-Prompt."""
from __future__ import annotations

from .visual_resource_registry import (
    summarize_assets,
    summarize_datasets,
    summarize_libraries,
)


def build_resource_context() -> dict[str, str]:
    return {
        'libraries_summary': summarize_libraries(),
        'assets_summary': summarize_assets(),
        'datasets_summary': summarize_datasets(),
    }
