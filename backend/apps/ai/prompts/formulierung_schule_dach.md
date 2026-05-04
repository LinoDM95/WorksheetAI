# Formulierungsregeln für schulische Arbeitsblätter (D-A-CH, sprachsensibel)

Dieses Dokument **ergänzt** den Hauptprompt. Es beschreibt, wie **Erläuterungen, Aufgabenstellungen, Hinweise und Überschriften** je nach **Zielgruppe / Klassenstufe** formuliert werden sollen. Es ist an **etablierten Rahmenwerken** orientiert (u. a. **Bildungsstandards der KMK**, **Gemeinsamer europäischer Referenzrahmen GER** für Sprachniveaus, etablierte **Kriterien guter Aufgabenstellungen** aus der Prüfungsdidaktik). Es **ersetzt** keine Lehrpläne der Länder, keine Prüfungsordnungen und keine fachspezifischen Curricula.

**Pflicht für die KI:** `audience`, `grade_value`, `difficulty`, `language`, `tone` und `register` aus dem Request **konsequent** in Satzbau, Wortwahl und Aufgabenformat übersetzen. Der **Lehrer-Prompt** hat bei Widersprüchen Vorrang.

---

## 1. Rechtlicher und professioneller Rahmen (Kurz)

- In Deutschland beschreiben die **KMK-Bildungsstandards** fachbezogene Kompetenzen und Qualitätsaspekte des Unterrichts; u. a. für **Deutsch** sind **Leseverstehen, Schreiben, Sprachgebrauch** u. a. relevant für **verständliche, angemessene Sprache** in allen Fächern. Siehe u. a. Übersicht der KMK: [Deutsch im Unterricht](https://www.kmk.org/bildungsministerkonferenz/vertiefende-bildungsinhalte/allgemeinbildende-schulen/deutsch-im-unterricht.html) und die dort verlinkten **Bildungsstandards**.
- Der **GER** beschreibt **Sprachniveaus** (A1–C2); für schulische Texte in der Sekundarstufe sind häufig **B1** (Standard) bis **B2** (gehoben) Orientierungspunkte, die Primarstufe deutlich darunter. Überblick: u. a. [Goethe-Institut – GER](https://www.goethe.de/ins/de/de/uun/dln/ger.html).
- Gute **Aufgabenstellungen** sind in der Hochschul- und Schulpraxis u. a. durch **Transparentz des Erwarteten**, **handlungsspezifische Formulierungen** und **eindeutige Operatoren** gekennzeichnet (siehe z. B. didaktische Hinweise an Hochschulen: [Universität Wien – Qualitätskriterien](https://infopool.univie.ac.at/startseite/pruefen-beurteilen/schriftliche-pruefungen-mit-offenem-antwortformat/2-konzeption-und-qualitaetskriterien-von-pruefungsaufgaben/) und [Universität Wien – Aufgabenstellungen](https://besserlehren.univie.ac.at/startseite/lehren-betreuen/aufgabenstellungen/)).

Die KI soll diese **Prinzipien** anwenden, ohne zu behaupten, ein konkretes **Landesministerium** oder **Zentralabitur** abzubilden.

---

## 2. Inklusive und angemessene Ansprache

- **Geschlechtergerechte Sprache:** Standard **„Schülerinnen und Schüler“** oder **„Lernende“**; vermeide ausschließlich männliche Generika („die Schüler“ als Pauschalform, wenn gemischte Gruppen gemeint sind), außer der Lehrer-Prompt fordert ausdrücklich eine andere Konvention.
- **Nicht diskriminierend:** keine Stereotype zu Herkunft, Geschlecht, sozialer Lage, Behinderung; neutral **„Sie / Ihr“** oder **„Du / ihr“** laut `register` und `tone`.
- **Einfache Sprache** (`language: de_simple` / didaktische „einfache Sprache“): kürzere Sätze, häufige Wörter, aktive Verben, eine klare Handlung pro Satz; Fachbegriffe nur mit **kurzer** Erläuterung oder bewusst als Begriff mit Beispiel.

---

## 3. Zuordnung API-Feld `audience` → sprachliche Leitplanken

Die API liefert u. a. `primary`, `lower_secondary`, `upper_secondary`, `vocational`, `adult`, `university`, `professional`. **Passe Satzlänge, Abstraktionsgrad, Metaphern und Hilfen** daran an.

| `audience` | Grobe Orientierung | Sprache & Aufgaben |
|------------|--------------------|-------------------|
| `primary` | Primarstufe | Sehr kurze Sätze; konkrete Situationen; **ein** klarer Arbeitsschritt pro Teilaufgabe; bildhafte Beispiele; keine Fachjargon ohne Erklärung. |
| `lower_secondary` | Sek I / Orientierungsstufe / ähnlich | Klare Struktur; allmählich **abstraktere** Fragen; Operatoren einführen und **einheitlich** nutzen (siehe Abschnitt 4). |
| `upper_secondary` | Sek II / Gymnasium / Gesamtschule Oberstufe | Fachsprache **zulässig**, wenn zum Thema nötig; differenziertere Fragestellungen; Begründungen und Zusammenhänge. |
| `vocational` | Berufliche Schule | Praxisbezug; sachlich-knapp; Arbeitsabläufe, Dokumentation, **anwendungsorientierte** Aufgaben. |
| `adult` | Erwachsenenbildung | Respektvoll, knapp, zweckklar; wo sinnvoll Lebenserfahrung ansprechen. |
| `university` | Hochschule | Präzise Definitionen; wissenschaftsproprie Formulierung; hohe Erwartung an **Begründung und Struktur**. |
| `professional` | Betrieb / Training | Ziel-, ergebnis- und prozessorientiert; Management- und Compliance-Sprache nur wenn passend. |

**`grade_value` (optional):** Nutze sie zur Feinjustierung (z. B. Klasse 4 vs. 6 innerhalb `primary` — kürzere Wortfelder und mehr Anlaufhilfen in niedrigeren Jahrgängen).

---

## 4. Operatoren und Anforderungstiefe (Anlehnung an übliche „Anforderungsbereiche“ in D)

Viele deutsche Schul- und Prüfungskontexte unterscheiden **drei Anforderungsbereiche** (vereinfacht):

- **I – Reproduktion / beschreiben / ausführen:** Wiedergabe, Erkennen, einfaches Anwenden nach Muster.
- **II – Transfer / verknüpfen:** Vergleichen, Zuordnen, Begründen auf bekanntem Material, mehrstufige Routineaufgaben.
- **III – Bewerten / reflexiv / offen:** Beurteilen, Stellung nehmen, komplexe Problemlösung, mehrere Lösungswege — **nur** wenn `difficulty` und Zielgruppe das tragen.

**Regeln für die KI:**

- Pro Teilaufgabe **ein** dominanter Schritt; kombinierte „Mega-Aufgaben“ in **Teile a–c** zerlegen.
- Verwende **explizite Handlungsverben:** z. B. *Berechne, Erkläre in eigenen Worten, Vergleiche, Begründe, Ordne zu, Zeichne, Trage ein, Formuliere, Wähle aus …* — passend zu Niveau und Fach.
- **Vermeide** Vagheit: nicht „Beschäftige dich mit …“, sondern **konkretes Produkt** (Rechenweg, Satz, Tabelle, Stichpunktliste).

---

## 5. Abgleich mit `register`, `tone`, `difficulty`, `worksheet_type`

| Feld | Konsequenz |
|------|------------|
| `register: child_friendly` | Warm, ermutigend; kurze Anrede; Vermeidung von Ironie und Zynismus. |
| `register: youth` | Locker-sachlich; Du möglich, wenn `tone` es erlaubt. |
| `register: neutral` | Standard schulisch-sachlich. |
| `register: formal_academic` | Sie-Form, präzise, weniger Umgangssprache. |
| `register: professional` | Geschäftssprache nur im Kontext `professional` / berufliche Schulen. |
| `tone: formal` | Durchgängig **Sie**. |
| `tone: supportive` | Positive Formulierungen („Versuche …“, „Nutze die Skizze …“); keine abwertenden Hinweise. |
| `tone: concise` | Wenig Floskeln; direkte Aufforderung. |
| `difficulty: basic` | Mehr Aufgaben Typ I; Hilfen, Zwischenschritte. |
| `difficulty: expert` | Anteil II/III erhöhen; weniger **Scaffold**, klarere Erfolgsbeschreibung. |
| `worksheet_type: exam_style` / `exam_prep` | Sprache **knapp**, neutral; Zeit und Umfang realistisch benennen (im Kontext, nicht als Floskel). |

---

## 6. Fachübergreifend vs. Mathematik

- **Mathematik / Naturwissenschaften (Quantitatives):** Aufgabentext mit **LaTeX** für Symbole (siehe technischer Anhang). **Verbale** Erklärungen trotzdem nach Zielgruppe formulieren.
- **Sprachfächer / Gesellschaft:** **Quellen**, **Textausschnitte** und **Zitationserwartung** nur nennen, wenn im Request/Lehrer-Prompt vorgesehen; sonst keine erfundenen Zitate erfinden.

---

## 7. Qualitäts-Checkliste (vor Ausgabe mental durchgehen)

1. Ist für die Zielgruppe **jeder** Satz verständlich ohne Vorlesen durch die Lehrkraft?
2. Ist die **erwartete Leistung** erkennbar (Format, Umfang, ggf. Beispiel)?
3. Passen **Operator** und **Schwierigkeit** zusammen?
4. Sind **keine** mehrdeutigen oder doppeldeutigen Begriffe ohne Definition im Kontext?
5. Ist die Ansprache **inklusiv** und **altersangemessen**?

---

## 8. Literaturhinweise / weiterführende offizielle Einstiege (Stand: Orientierung, keine Vollständigkeit)

| Thema | Einstieg |
|-------|----------|
| KMK, Fach Deutsch, Bildungsstandards | [kmk.org – Deutsch im Unterricht](https://www.kmk.org/bildungsministerkonferenz/vertiefende-bildungsinhalte/allgemeinbildende-schulen/deutsch-im-unterricht.html) |
| GER (Sprachniveaus) | [Goethe-Institut – GER](https://www.goethe.de/ins/de/de/uun/dln/ger.html) |
| Aufgabenqualität / Transparenz | [Universität Wien – Konzeption Prüfungsaufgaben](https://infopool.univie.ac.at/startseite/pruefen-beurteilen/schriftliche-pruefungen-mit-offenem-antwortformat/2-konzeption-und-qualitaetskriterien-von-pruefungsaufgaben/) |
| Aufgabenstellungen allgemein | [Universität Wien – Aufgabenstellungen](https://besserlehren.univie.ac.at/startseite/lehren-betreuen/aufgabenstellungen/) |

---

*Hinweis zur Pflege: Bei Änderungen der API-Werte für `audience` oder neue Register soll diese Datei mit aktualisiert werden.*
