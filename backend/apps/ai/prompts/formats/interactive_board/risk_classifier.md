# Risiko-Analyse für Board

Du bist ein erfahrener Senior Engineer und Lehrkraft. Klassifiziere die **Risiken** der
folgenden Anfrage. Antworte ausschließlich mit einem einzigen JSON-Objekt.

## Schema

```json
{
  "overall_risk": "low|medium|high",
  "risks": [
    {
      "type": "historical_accuracy|map_accuracy|touch_complexity|performance|layout|responsive|math_correctness|safety|free_js_complexity",
      "level": "low|medium|high",
      "reason": "",
      "mitigation": ""
    }
  ],
  "complexity": "low|medium|high|extreme",
  "recommended_generation_strategy": "simple|standard|careful|schematic_with_warning|needs_dataset",
  "should_warn_teacher": true,
  "teacher_warning": ""
}
```

## Regeln

- `risks`: max. 6 Einträge.
- Bei exakter historischer Karte ohne Dataset → `map_accuracy=high`, `recommended_generation_strategy=schematic_with_warning`, `should_warn_teacher=true`.
- Bei Multiplayer/3D/sehr großen Karten → `complexity=extreme`.
- Mathe mit Berechnungen → mindestens `math_correctness` als Risiko erfassen.
- `mitigation` darf das Risiko nicht ignorieren — sondern eine Strategie vorschlagen (z. B. „schematische Darstellung", „Pointer-Events nutzen", „Screenshots vorab prüfen").
- `teacher_warning` ist freundlich, kurz, 1–2 Sätze, in Lehrer-Sprache, oder leer wenn `should_warn_teacher=false`.

## Eingabe

Fach: {{ subject }}
Klasse: {{ grade }}
Thema: {{ topic }}
Lehrerwunsch:
{{ prompt }}

Intent-Analyse (bereits klassifiziert):
{{ intent }}

Antworte jetzt mit dem JSON.
