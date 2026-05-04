# Referenz: LaTeX für Schulmaterial — abgestimmt auf KaTeX (Browser)

Dieser Anhang wird **automatisch an den Generierungs-Prompt angehängt**. Er fasst **didaktische und typografische Konventionen** zusammen, die mit eurer Darstellung (KaTeX im Frontend) **zuverlässig funktionieren**.

## Quellen (Inspiration, kein Volltext im Repo)

- **schulmathematik** (Keno Wehr): LaTeX-Befehle und Dokumentenklassen für Schulmathematik und -physik — *manuelle Kurzreferenz für Konventionen* (z. B. Komma in Formeln, Achsen/Graphen-Ideen); viele Paket-Makros gelten **nicht** in KaTeX.
- **Tutorial Arbeitsblätter mit LaTeX** (Xenia Rendtel, 2010): allgemeine Struktur von Arbeitsblättern, Tabellen, Mathe-Setzung — **Konzepte**, nicht 1:1 LaTeX-Umgebungen übernehmen.
- **Reddit r/lehrerzimmer** — Diskussion *Tipps für die Nutzung von LaTeX* (Praxiserfahrung Lehrkräfte); siehe z. B. https://www.reddit.com/r/lehrerzimmer/comments/1eauub7/tipps_f%C3%BCr_die_nutzung_von_latex/

**Wichtig:** Euer MVP rendert **kein vollständiges LaTeX-PDF** mit `schulma`/TikZ, sondern **Formelfragmente in JSON-Strings** via **KaTeX**. Nur Befehle nutzen, die [KaTeX unterstützt](https://katex.org/docs/supported.html).

---

## Pflicht-Subset (sicher für KaTeX)

- **Grundlagen:** `+ − = < > ≤ ≥ ≠ ≈ ± · × ÷`, Hoch-/Tiefstellung `x^2`, `x_{10}`, Klammern `\left( \right)`, Brüche `\frac{a}{b}`, Wurzel `\sqrt{x}`, `\sqrt[n]{x}`, Betrag `|x|` oder `\lvert x\rvert`.
- **Mengen / Zahlbereiche:** `\mathbb{N}`, `\mathbb{Z}`, `\mathbb{Q}`, `\mathbb{R}`, `\mathbb{C}` (sofern im Kontext sinnvoll).
- **Griechische Buchstaben:** `\alpha`, `\beta`, `\gamma`, `\pi`, `\Delta`, …
- **Funktionen:** `\sin`, `\cos`, `\tan`, `\ln`, `\log`, `\exp`; Index `f'(x)`, `\overline{AB}` wo nötig.
- **Mehrzeilig:** abgesetzt mit `\[ ... \]` oder `$$ ... $$` im JSON-String (Backslashes in JSON escapen: `\\`).
- **Matrizen / lineare Algebra:** z. B. `\begin{pmatrix} a & b \\ c & d \end{pmatrix}` nur wenn nötig und **kurz** (lange Matrizen sprengen die Zeile).
- **Text in Formeln (Einheiten, kurze Wörter):** `\text{cm}`, `\text{m/s}` — keine komplexen `\SI`/`siunitx`-Befehle.
- **Dezimalkomma (D-A-CH):** In einer Zahl oft `6{,}28` oder `\comma` vermeiden — KaTeX: **`$6{,}28$`** oder Fließtext außerhalb der Formel. Bei Funktionen **`f(x,\ t)$`** oder Leerzeichen nach dem Komma, wenn das Komma **trennt** (vgl. schulmathematik zu icomma — hier pragmatisch: **einheitlich lesbar** für Schülerinnen und Schüler).

## Unbedingt vermeiden (bricht oft oder ist unsicher)

- **Präambel / Pakete:** `\usepackage`, `\documentclass`, eigene `.sty`-Makros, **`schulma`-spezifische Befehle** (außer du weißt sicher, dass KaTeX sie kennt — Standard ist: **nein**).
- **Grafik / Layout:** `tikz`, `pgfplots`, `includegraphics`, `circuitikz`, lange `align`-Umgebungen mit vielen `&` (KaTeX: begrenzt; lieber **eine** klare Formel pro Display).
- **Chemie / komplexe Physik:** `\ce{...}` (mhchem nur eingeschränkt) — lieber Klartext + einfache Formel.
- **HTML oder Markdown** in Mathe-Strings.

## Didaktik (übernommen aus „guter Schulpraxis“)

- **Altersgerecht:** Klare Symbolik, nicht überfrachten; Schwierigkeit an `difficulty` / Klassenstufe koppeln.
- **Lesbarkeit:** Lange Ausdrücke **aufteilen** oder in **zwei Zeilen** (`\[ \]` getrennt), statt einer unlesbaren Monsterzeile.
- **Aufgabenstellung:** Mathe **in LaTeX**, Erklärtext davor/dazwischen in normaler Sprache — so wie in eurem Hauptprompt beschrieben.

## Kurzfassung für die Modellantwort

> Nutze **standardkonformes LaTeX im KaTeX-Subset**, deutsche **Komma-Konventionen** in Formeln beachten, **keine** Paket-Umgebungen oder TikZ — **nur** Fragmente, die sicher in `$…$`, `\(...\)`, `\[…\]` gesetzt werden.
