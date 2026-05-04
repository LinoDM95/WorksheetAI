import json, yaml

KNOWN_SLOT_TYPES={'text','rich_text','task','task_list','arithmetic_task_list','multiple_choice','true_false','matching','fill_blank','table','writing_lines','drawing_box','checklist','solution_list','teacher_notes','rubric'}

class PatternBlueprintValidator:
    def validate(self, blueprint: dict) -> list[str]:
        errors=[]
        for key in ['id','name','metadata','layout','slots']:
            if key not in blueprint: errors.append(f'Missing required key: {key}')
        slots=blueprint.get('slots', [])
        if not isinstance(slots, list) or not slots: errors.append('slots must be a non-empty list')
        for idx, slot in enumerate(slots):
            if not slot.get('key'): errors.append(f'slots[{idx}] missing key')
            if slot.get('type') not in KNOWN_SLOT_TYPES: errors.append(f'slots[{idx}] unknown type: {slot.get("type")}')
        md=blueprint.get('metadata', {})
        if not md.get('subjects'): errors.append('metadata.subjects must not be empty')
        if not md.get('grades'): errors.append('metadata.grades must not be empty')
        layout=blueprint.get('layout', {})
        if not layout.get('template_id'): errors.append('layout.template_id missing')
        rules=blueprint.get('generation_rules', {})
        if rules.get('min_tasks') and rules.get('max_tasks') and rules['min_tasks'] > rules['max_tasks']:
            errors.append('generation_rules.min_tasks must be <= max_tasks')
        return errors

def parse_blueprint(filename: str, data: bytes) -> tuple[dict, str]:
    text=data.decode('utf-8')
    if filename.endswith(('.yaml','.yml')):
        return yaml.safe_load(text), 'yaml'
    if filename.endswith('.json'):
        return json.loads(text), 'json'
    raise ValueError('Unsupported file format. Use .yaml, .yml or .json')

class PatternMatcher:
    def score(self, pattern, payload: dict):
        bp=pattern.blueprint or {}; md=bp.get('metadata',{}); score=0; reasons=[]
        subject=payload.get('subject_name') or payload.get('subject') or ''
        grade=int(payload.get('grade_value') or payload.get('grade') or 0)
        topic=(payload.get('topic') or '').lower()
        if subject in md.get('subjects',[]): score+=40; reasons.append('Fach passt')
        if grade in md.get('grades',[]): score+=30; reasons.append('Klasse passt')
        for t in md.get('suitable_topics',[]):
            if t.lower() in topic or topic in t.lower(): score+=20; reasons.append('Thema passt'); break
        if pattern.status=='active': score+=10
        score+=min(pattern.quality_score, 10)
        return score, reasons
    def find_best(self, patterns, payload, limit=5):
        ranked=[]
        for p in patterns:
            s,r=self.score(p,payload)
            if s>0: ranked.append({'pattern':p,'score':s,'reasons':r})
        return sorted(ranked, key=lambda x:x['score'], reverse=True)[:limit]
