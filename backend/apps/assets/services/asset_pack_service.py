"""AssetPackGenerationService — Orchestrator der Asset-Engine.

Aufgaben:
1. ``AssetPack`` aus Plan anlegen + ``AssetGenerationJob`` pro Asset.
2. Pro Asset: Strategie wählen → SVG erzeugen (Compiler/Procedural/FreeDraw)
   → Validate → Normalize → Quality-Judge → ggf. Repair.
3. Hero-Variants generieren und Best-of auswählen.
4. Konsistenz prüfen + ``status`` setzen (``ready`` / ``partially_failed`` / ``failed``).

Service ist synchron: Frontend nutzt ihn direkt aus der Pipeline. Asynchron
(Celery) wäre einfache Spätoption — Service bleibt entkoppelt.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.boards.services.ai_model_router import SmartboardAIModelRouter

from ..models import AssetGenerationJob, AssetPack, GeneratedAsset
from . import asset_pack_consistency
from .asset_generation import SvgFreeDrawService
from .asset_quality_judge import AssetQualityJudge
from .asset_repair_agent import SUPPORTED_MODES as REPAIR_MODES, AssetRepairAgent
from .asset_strategy_router import AssetStrategyRouter
from .mascot_compiler import compile_mascot
from .procedural_generators import render as render_procedural
from .svg_normalizer import normalize_svg
from .svg_validation import validate_svg


logger = logging.getLogger(__name__)

DBG_PREFIX_ASSET = '[AssetEngine]'


def _dbg_asset(message: str) -> None:
    print(f'{DBG_PREFIX_ASSET} {message}', flush=True)


class AssetPackGenerationService:
    """Erzeugt vollständige AssetPacks aus einem AssetPlanner-Plan."""

    def __init__(self, *, user=None, board=None) -> None:
        self.user = user
        self.board = board
        complexity = 'medium'
        if board is not None:
            complexity = (board.intent_analysis or {}).get('complexity', 'medium')
        self.router = SmartboardAIModelRouter(user=user, board=board, complexity=complexity)
        self.strategy_router = AssetStrategyRouter(router=self.router)
        self.svg_free_draw = SvgFreeDrawService(router=self.router)
        if getattr(settings, 'ASSET_ENABLE_QUALITY_JUDGE', True):
            judge_router = self.router if getattr(settings, 'ASSET_QUALITY_JUDGE_LLM', False) else None
        else:
            judge_router = None
        self.judge = AssetQualityJudge(router=judge_router)
        self.repair_agent = AssetRepairAgent(router=self.router)

    # --------- Public API ---------

    def generate(self, plan: dict[str, Any]) -> AssetPack:
        from apps.boards.services.pipeline_ai_meter import generation_meter_context, get_active_meter

        if get_active_meter() is not None:
            return self._generate_impl(plan)
        with generation_meter_context(user=self.user) as meter:
            pack = self._generate_impl(plan)
            meter.flush_logs_to_db(
                board=self.board,
                metadata_extra={'context': 'asset_pack', 'asset_pack_id': str(pack.pk)},
            )
            return pack

    @transaction.atomic
    def _generate_impl(self, plan: dict[str, Any]) -> AssetPack:
        if not isinstance(plan, dict):
            raise ValueError('Plan muss ein Dict sein.')
        assets_plan: list[dict[str, Any]] = list(plan.get('assets') or [])
        if not assets_plan:
            raise ValueError('Plan enthält keine Assets.')

        _dbg_asset(
            f'Pack-Start name={plan.get("asset_pack_name")!r} assets={len(assets_plan)} '
            f'keys={[a.get("key") for a in assets_plan[:8]]!s}{"…" if len(assets_plan) > 8 else ""}',
        )

        pack = AssetPack.objects.create(
            owner=self.user,
            created_by=self.user,
            board=self.board,
            name=str(plan.get('asset_pack_name') or 'Asset-Pack')[:120],
            description='',
            subject=getattr(self.board, 'subject', '') or '',
            grade=getattr(self.board, 'grade', '') or '',
            topic=getattr(self.board, 'topic', '') or '',
            style_family=str(plan.get('style_family') or 'soft_cartoon'),
            style_dna=plan.get('style_dna') or {},
            design_tokens=plan.get('design_tokens') or {},
            palette=plan.get('palette') or {},
            asset_plan=plan,
            status='generating',
        )

        for asset_request in assets_plan:
            self._build_one_asset(pack, asset_request)

        self._finalize_pack(pack)
        _dbg_asset(
            f'Pack-Fertig id={pack.pk} status={pack.status!r} quality_score={pack.quality_score!r} '
            f'assets_in_db={pack.assets.count()}',
        )
        return pack

    def repair_pack(self, pack: AssetPack) -> AssetPack:
        from apps.boards.services.pipeline_ai_meter import generation_meter_context, get_active_meter

        if get_active_meter() is not None:
            return self._repair_pack_impl(pack)
        with generation_meter_context(user=self.user) as meter:
            out = self._repair_pack_impl(pack)
            meter.flush_logs_to_db(
                board=self.board,
                metadata_extra={'context': 'asset_pack_repair', 'asset_pack_id': str(out.pk)},
            )
            return out

    @transaction.atomic
    def _repair_pack_impl(self, pack: AssetPack) -> AssetPack:
        """Reparieren aller Assets eines Packs (auf Basis der Quality Judge Vorschläge)."""
        for asset in pack.assets.all():
            self.repair_asset(asset, pack=pack)
        self._finalize_pack(pack)
        return pack

    def repair_asset(self, asset: GeneratedAsset, *, pack: AssetPack | None = None) -> GeneratedAsset:
        from apps.boards.services.pipeline_ai_meter import generation_meter_context, get_active_meter

        if get_active_meter() is not None:
            return self._repair_asset_impl(asset, pack=pack)
        with generation_meter_context(user=self.user) as meter:
            out = self._repair_asset_impl(asset, pack=pack)
            resolved = pack or asset.asset_pack
            meter.flush_logs_to_db(
                board=self.board,
                metadata_extra={
                    'context': 'asset_asset_repair',
                    'asset_pack_id': str(resolved.pk),
                    'generated_asset_key': str(getattr(asset, 'key', '') or ''),
                },
            )
            return out

    @transaction.atomic
    def _repair_asset_impl(self, asset: GeneratedAsset, *, pack: AssetPack | None = None) -> GeneratedAsset:
        """Repariere ein einzelnes Asset (basierend auf seinem Quality Report)."""
        pack = pack or asset.asset_pack
        suggested = (asset.quality_report or {}).get('suggested_repair') or 'fix_validation'
        if suggested not in REPAIR_MODES:
            suggested = 'fix_validation'
        for attempt in range(int(getattr(settings, 'ASSET_MAX_REPAIR_ATTEMPTS', 2))):
            repair_result = self.repair_agent.repair(
                asset.normalized_svg or asset.svg or '',
                mode=suggested,
                asset_request=self._asset_request_from_asset(asset, pack),
                style_family=getattr(pack, 'style_family', '') or '',
                palette=getattr(pack, 'palette', None) or {},
                design_tokens=getattr(pack, 'design_tokens', None) or {},
                critique=(asset.quality_report or {}).get('ai_critique', ''),
                validation_errors=asset.validation_errors or [],
                validation_warnings=asset.validation_warnings or [],
            )
            normalized = normalize_svg(
                repair_result['svg'],
                title=asset.title,
                description=asset.description,
                id_prefix=str(asset.key),
            )
            validation = validate_svg(normalized, background_mode=asset.background_mode, asset_type=asset.asset_type)
            judge = self.judge.evaluate(
                normalized,
                asset_type=asset.asset_type,
                background_mode=asset.background_mode,
                style_family=getattr(pack, 'style_family', '') or '',
                palette_size=len(getattr(pack, 'palette', {}) or {}),
            )
            asset.svg = repair_result['svg']
            asset.normalized_svg = normalized
            asset.validation_errors = validation.errors
            asset.validation_warnings = validation.warnings
            asset.quality_report = judge
            asset.quality_score = judge.get('score')
            asset.repair_history = [*(asset.repair_history or []), {
                'attempt': attempt + 1,
                'mode': suggested,
                'changes': repair_result.get('changes', []),
                'notes': repair_result.get('notes', ''),
                'source': repair_result.get('source'),
            }]
            asset.save()
            if validation.ok and (judge.get('score') or 0) >= 70:
                break
            suggested = judge.get('suggested_repair') or 'simplify'
        return asset

    # --------- Internals ---------

    def _build_one_asset(self, pack: AssetPack, asset_request: dict[str, Any]) -> Optional[GeneratedAsset]:
        key = (asset_request.get('key') or '').strip().lower()
        if not key:
            return None
        job = AssetGenerationJob.objects.create(
            asset_pack=pack,
            asset_key=key,
            request=asset_request,
            status='running',
            started_at=timezone.now(),
        )
        try:
            decision = self.strategy_router.decide(asset_request)
            strategy = decision.get('strategy') or 'svg_free_draw'
            _dbg_asset(
                f'Asset key={key!r} strategy={strategy!r} priority={asset_request.get("priority")!r}',
            )
            job.selected_strategy = strategy
            variants_recommended = int(decision.get('variants_recommended') or 1)
            is_hero = (asset_request.get('priority') or '').lower() == 'hero'
            if is_hero and getattr(settings, 'ASSET_ENABLE_HERO_VARIANTS', True):
                variants_recommended = max(
                    variants_recommended,
                    int(getattr(settings, 'ASSET_HERO_VARIANT_COUNT', 3)),
                )
            variants = []
            n_var = max(1, variants_recommended)
            _dbg_asset(f'Asset key={key!r} Varianten={n_var} (Hero={is_hero}).')
            for variant_idx in range(n_var):
                svg_data = self._produce_variant(asset_request, strategy, pack, variant_idx)
                normalized = normalize_svg(
                    svg_data['svg'],
                    title=asset_request.get('title') or key,
                    description=asset_request.get('subject_text') or asset_request.get('title') or key,
                    id_prefix=f'{key}-v{variant_idx}',
                )
                validation = validate_svg(
                    normalized,
                    background_mode=asset_request.get('background_mode') or 'transparent_cutout',
                    asset_type=asset_request.get('asset_type'),
                )
                judge = self.judge.evaluate(
                    normalized,
                    asset_type=asset_request.get('asset_type', ''),
                    background_mode=asset_request.get('background_mode', 'transparent_cutout'),
                    style_family=pack.style_family,
                    palette_size=len(pack.palette or {}),
                )
                variants.append({
                    'index': variant_idx,
                    'svg': svg_data['svg'],
                    'normalized_svg': normalized,
                    'source': svg_data.get('source'),
                    'validation': validation,
                    'judge': judge,
                    'meta': {
                        'notes': svg_data.get('notes', ''),
                        'used_style_rules': svg_data.get('used_style_rules', []),
                        'warnings': svg_data.get('warnings', []),
                    },
                })
            best = self._select_best_variant(variants)
            _dbg_asset(
                f'Asset key={key!r} beste Variante idx={best.get("index")!r} '
                f'source={best.get("source")!r} score={best["judge"].get("score")!r} '
                f'valid={best["validation"].ok}',
            )
            asset = self._persist_asset(pack, asset_request, strategy, best)
            # Initial-Repair, wenn validation oder score zu schwach.
            if not best['validation'].ok or (best['judge'].get('score') or 0) < 60:
                _dbg_asset(
                    f'Asset key={key!r} Initial-Repair (valid_ok={best["validation"].ok} '
                    f'score={(best["judge"].get("score") or 0)!r}).',
                )
                self.repair_asset(asset, pack=pack)
            job.result_asset = asset
            job.status = 'completed' if asset.validation_errors == [] else 'repaired'
            job.warnings = list(best['validation'].warnings) + list(best['meta'].get('warnings') or [])
            job.completed_at = timezone.now()
            job.attempts = max(1, len(variants))
            job.save()
            _dbg_asset(
                f'Asset key={key!r} Job abgeschlossen status={job.status!r}',
            )
            return asset
        except Exception as exc:  # noqa: BLE001
            logger.exception('AssetPackGenerationService: Asset-Build fehlgeschlagen (%s)', key)
            _dbg_asset(f'Asset key={key!r} FEHLER: {exc!s}')
            job.status = 'failed'
            job.errors = [str(exc)[:300]]
            job.completed_at = timezone.now()
            job.save()
            return None

    def _produce_variant(
        self,
        asset_request: dict[str, Any],
        strategy: str,
        pack: AssetPack,
        variant_idx: int,
    ) -> dict[str, Any]:
        if strategy == 'compiler':
            return self._compile_compiler(asset_request, pack, variant_idx)
        if strategy == 'procedural':
            return self._compile_procedural(asset_request, pack)
        if strategy == 'template_remix':
            # Aktuell: prozedural als Template — Free Draw als Polish optional.
            return self._compile_procedural(asset_request, pack)
        if strategy == 'asset_library':
            # MVP: noch leer → Fallback auf Free Draw (oder Procedural, falls möglich).
            return self.svg_free_draw.generate(asset_request, style_family=pack.style_family,
                                               palette=pack.palette, design_tokens=pack.design_tokens)
        if strategy == 'fallback_simple':
            return self._compile_fallback(asset_request, pack)
        # default: svg_free_draw
        return self.svg_free_draw.generate(asset_request, style_family=pack.style_family,
                                           palette=pack.palette, design_tokens=pack.design_tokens)

    def _compile_compiler(self, asset_request: dict[str, Any], pack: AssetPack, variant_idx: int) -> dict[str, Any]:
        species = self._species_from_request(asset_request)
        poses = ['standing', 'wave', 'pointing', 'holding_book']
        expressions = ['happy', 'curious', 'excited']
        pose = poses[variant_idx % len(poses)]
        expression = expressions[variant_idx % len(expressions)]
        spec = {
            'species': species,
            'pose': pose,
            'expression': expression,
            'palette': pack.palette,
            'design_tokens': pack.design_tokens,
            'accessories': asset_request.get('accessories') or [],
        }
        compiled = compile_mascot(spec)
        return {
            'svg': compiled['svg'],
            'source': 'compiler',
            'notes': f'Mascot-Kompilation {species} ({pose}/{expression})',
            'used_style_rules': ['mascot_compiler', species],
            'warnings': [],
        }

    def _compile_procedural(self, asset_request: dict[str, Any], pack: AssetPack) -> dict[str, Any]:
        key = asset_request.get('key') or asset_request.get('subject_text') or 'sticker_frame'
        result = render_procedural(
            key,
            palette=pack.palette,
            design_tokens=pack.design_tokens,
            label=asset_request.get('title', '')[:14],
        )
        if not result:
            result = render_procedural('sticker_frame', palette=pack.palette, design_tokens=pack.design_tokens)
        return {
            'svg': (result or {}).get('svg') or '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"/>',
            'source': 'procedural',
            'notes': f'Prozedurale Generation: {key}',
            'used_style_rules': ['procedural'],
            'warnings': [],
        }

    def _compile_fallback(self, asset_request: dict[str, Any], pack: AssetPack) -> dict[str, Any]:
        result = render_procedural(
            'sticker_frame',
            palette=pack.palette,
            design_tokens=pack.design_tokens,
        )
        return {
            'svg': (result or {}).get('svg') or '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"/>',
            'source': 'fallback_simple',
            'notes': 'Fallback-Sticker (Karten/Heuristik geblockt).',
            'used_style_rules': ['fallback_simple'],
            'warnings': ['fallback_simple_used'],
        }

    def _species_from_request(self, asset_request: dict[str, Any]) -> str:
        text = (asset_request.get('subject_text') or asset_request.get('key') or '').lower()
        for s in ('bear', 'rabbit', 'monster'):
            if s in text:
                return s
        if 'bär' in text or 'baer' in text:
            return 'bear'
        if 'hase' in text:
            return 'rabbit'
        if 'monster' in text or 'alien' in text:
            return 'monster'
        return 'generic'

    def _select_best_variant(self, variants: list[dict[str, Any]]) -> dict[str, Any]:
        if not variants:
            raise RuntimeError('Keine Varianten erzeugt.')
        # 1. valide Varianten bevorzugen, dann höchster Quality Score.
        def _key(v: dict[str, Any]) -> tuple[int, float]:
            ok = 1 if v['validation'].ok else 0
            score = float(v['judge'].get('score') or 0.0)
            return (ok, score)

        return max(variants, key=_key)

    def _persist_asset(
        self,
        pack: AssetPack,
        request: dict[str, Any],
        strategy: str,
        variant: dict[str, Any],
    ) -> GeneratedAsset:
        validation = variant['validation']
        judge = variant['judge']
        meta = variant['meta']
        return GeneratedAsset.objects.create(
            asset_pack=pack,
            owner=self.user,
            board=self.board,
            created_by=self.user,
            key=request.get('key'),
            title=request.get('title') or request.get('key'),
            description=request.get('subject_text') or '',
            asset_type=request.get('asset_type') or 'other',
            subject_text=request.get('subject_text') or '',
            style_family=pack.style_family,
            strategy=strategy,
            priority=(request.get('priority') or 'medium').lower(),
            background_mode=(request.get('background_mode') or 'transparent_cutout').lower(),
            asset_spec=request,
            svg=variant['svg'],
            normalized_svg=variant['normalized_svg'],
            width=512,
            height=512,
            viewbox='0 0 512 512',
            generation_prompt='',
            ai_raw_output={'notes': meta.get('notes', ''), 'used_style_rules': meta.get('used_style_rules', [])},
            validation_errors=validation.errors,
            validation_warnings=validation.warnings,
            quality_report=judge,
            quality_score=judge.get('score'),
            tags=[t for t in (request.get('tags') or []) if isinstance(t, str)][:8],
            metadata={'variant_source': variant.get('source'), 'variant_index': variant.get('index', 0)},
        )

    def _asset_request_from_asset(self, asset: GeneratedAsset, pack: AssetPack | None) -> dict[str, Any]:
        return {
            'key': asset.key,
            'title': asset.title,
            'asset_type': asset.asset_type,
            'subject_text': asset.subject_text,
            'priority': asset.priority,
            'background_mode': asset.background_mode,
            'tags': asset.tags or [],
        }

    def _finalize_pack(self, pack: AssetPack) -> None:
        assets = list(pack.assets.all())
        consistency = asset_pack_consistency.evaluate_pack([
            {
                'svg': a.normalized_svg or a.svg,
                'style_family': a.style_family,
                'key': a.key,
            } for a in assets
        ])
        scores = [a.quality_score for a in assets if a.quality_score is not None]
        warnings = [w for a in assets for w in (a.validation_warnings or [])]
        if not assets:
            status = 'failed'
        else:
            invalid = [a for a in assets if a.validation_errors]
            if invalid and len(invalid) == len(assets):
                status = 'failed'
            elif invalid:
                status = 'partially_failed'
            else:
                status = 'ready'
        pack.consistency_report = consistency
        pack.warnings = list(set(warnings))[:24]
        pack.status = status
        pack.quality_score = round(sum(scores) / len(scores), 1) if scores else None
        pack.save()
        _dbg_asset(
            f'Pack finalisiert id={pack.pk} status={status!r} '
            f'consistency_score={(consistency or {}).get("score")!r} '
            f'avg_score={pack.quality_score!r}',
        )
