class MockWorksheetProvider:
    def review_worksheet(self, content, request, page_setup, pattern):
        return content

    def generate(self, payload):
        req = payload.get('request', {})
        topic = req.get('topic') or 'Arbeitsblatt'
        grade = int(req.get('grade_value') or req.get('grade') or 2)
        subject = req.get('subject_name') or req.get('subject') or 'Mathematik'
        pres = {
            'register': 'child_friendly',
            'text_scale': 'lg',
            'task_text_scale': 'xl',
            'heading_scale': '2xl',
            'line_height': 'relaxed',
            'density': 'sparse',
            'planning_rationale': 'Mock: eine Seite, große Schrift für Klasse %s.' % grade,
        }
        if 'addition' in topic.lower() or 'plus' in topic.lower():
            pairs = [(1, 2), (3, 4), (5, 5), (7, 8), (9, 1), (6, 6), (2, 8), (10, 5)]
            return {
                'title': 'Plusaufgaben bis 20',
                'subtitle': '%s · Klasse %s' % (subject, grade),
                'presentation': pres,
                'pages': [{
                    'page_label': '',
                    'blocks': [
                        {'id': 'b1', 'type': 'task_grid', 'title': 'Rechne aus.', 'items': [{'label': str(i + 1), 'text': r'$%s+%s=$' % (a, b), 'answer': '$%s$' % (a + b)} for i, (a, b) in enumerate(pairs)]},
                        {'id': 'b2', 'type': 'drawing_box', 'title': 'Bonus', 'instruction': 'Erfinde zwei eigene Plusaufgaben mit Ergebnis 20.', 'height_mm': 45, 'expand_to_page_bottom': False},
                    ],
                }],
                'solutions': [{'label': str(i + 1), 'answer': '$%s$' % (a + b)} for i, (a, b) in enumerate(pairs)],
                'design_notes': ['Große Antwortkästchen, klare Struktur.'],
            }
        return {
            'title': topic,
            'subtitle': '%s · Klasse %s' % (subject, grade),
            'presentation': {
                'register': 'neutral',
                'text_scale': 'md',
                'task_text_scale': 'md',
                'heading_scale': 'xl',
                'line_height': 'normal',
                'density': 'normal',
                'planning_rationale': 'Mock: Standardumfang, eine Seite.',
            },
            'pages': [{
                'page_label': '',
                'blocks': [
                    {'id': 'b1', 'type': 'text', 'title': 'Einstieg', 'content': 'Bearbeite die Aufgaben zum Thema %s.' % topic},
                    {'id': 'b2', 'type': 'task_list', 'title': 'Aufgaben', 'items': [
                        {'label': '1', 'text': 'Erkläre den wichtigsten Begriff.', 'answer_lines': 6},
                        {'label': '2', 'text': 'Nenne zwei Beispiele.', 'answer_lines': 5},
                        {'label': '3', 'text': 'Bearbeite eine eigene Transferfrage.', 'answer_lines': 8},
                    ]},
                ],
            }],
            'solutions': [{'label': '1', 'answer': 'Individuelle Musterlösung.'}],
            'design_notes': ['Sachlich strukturiert.'],
        }

    def regenerate_page(self, payload):
        old = payload.get('current_page') or {}
        blocks = list(old.get('blocks') or [])
        blocks.append({
            'id': 'mock-regen',
            'type': 'text',
            'title': 'Mock KI (ohne API)',
            'content': (
                'Diese Seite wurde im Mock-Modus ergänzt. '
                'Mit echtem Gemini wird die Seite vollständig neu strukturiert.'
            ),
        })
        return {'page_label': old.get('page_label', '') or '', 'blocks': blocks}
