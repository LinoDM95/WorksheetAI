**Geltungsbereich:** Diese Regeln gelten **zusätzlich**, sobald du **`phaser` in `used_libraries`** einträgst **oder** im JavaScript **`Phaser.`** verwendest. Ziel: stabile **Phaser 3.80.x**-Umsetzung in der **1280×720**-Sandbox — **kein** Phaser-4-Code, **keine** veralteten Phaser-2-Muster aus älteren Tutorials.

### Version & API

- **Nur Phaser 3.x** (projektseitig **3.80.x**): Konfiguration über **`new Phaser.Game(config)`** mit **`type: Phaser.AUTO`** (oder `Phaser.WEBGL` / `Phaser.CANVAS`, wenn du es bewusst festlegst).
- **Keine** APIs aus Phaser-4-Blogs, **kein** Mix mit **Pixi v8**-Mustern; bei Unsicherheit: **offizielle Phaser-3-Doku** mental zugrunde legen, nicht „irgendein LLM-Snippet“.

### Bühne & einbetten

- **`parent`**: Verweise auf ein **im HTML vorhandenes** Element innerhalb von **`.free-board`** (z. B. `<div id="phaser-host"></div>`). **Vor** `new Phaser.Game` sicherstellen, dass der Container existiert (`getElementById` + Abbruch bei `null`).
- **Auflösung:** Spielbreite/-höhe **an die feste Bühne koppeln** — typisch **`width: 1280`**, **`height: 720`** (oder **`scale`-Mode**, der **ohne** zweites globales Skalieren auskommt; **nicht** noch einmal die ganze `.free-board` per CSS `transform: scale` skalieren — das übernimmt der Loader).
- **Ein** `Phaser.Game`-Objekt pro Board; kein zweites paralleles „Mini-Game“ in derselben Seite.

### Szenen-Architektur (Best Practice)

- Logik in **`Phaser.Scene`** auslagern: **`preload`**, **`create`**, **`update`**, optional **`shutdown`**.
- Szenen in der Game-Config unter **`scene: [ … ]`** registrieren; für lineare Didaktik: Szenenwechsel mit **`this.scene.start('Key')`** statt riesiger Monolith-Funktionen in `create`.
- In **`shutdown`** / beim Verlassen der Szene: **Tweens stoppen**, **Timer/Event-Listener** der Szene beenden, die Phaser dokumentiert — vermeidet „Geister-Input“ und Speicherlecks in langen Sitzungen.

### Assets & Sandbox

- **Nur lokale Pfade** unter **`/board-assets/...`** (oder erlaubte Registry-Assets) in **`this.load.image` / `audio` / `json`** usw. — **keine** externen URLs, kein `fetch` neben dem Loader.
- Alles, was in **`preload`** geladen wird, muss **vor Nutzung in `create`** verfügbar sein; Keys **sprechend** wählen und **konsistent** halten.

### Eingabe & Smartboard (Touch-first)

- Interaktive Game-Objekte: **`setInteractive(...)`** mit **ausreichender Hit-Area**; für Schaltflächen lieber **`Phaser.GameObjects.Zone`** oder große Sprites als **pixelkleine** Ziele.
- **Zeiger:** `useHandCursor` ist **optional**; Pflicht ist **zuverlässiger Tap** — dieselben **44×44 px**-Mindestgrößen wie im allgemeinen Touch-Block (notfalls unsichtbare Zone vergrößern).
- **Nicht** von **`pointerover`** / Hover abhängig machen, was nur mit Tap erreichbar sein muss.

### Graphics, Geometrie, Canvas

- **`Phaser.GameObjects.Graphics` (v3):** Farbe und Linien **wie in Phaser 3** — typischerweise **`fillStyle`** / **`lineStyle`** als **eigene** Aufrufe, dann **`fillRect`**, **`strokeRect`**, **`fillRoundedRect`** usw. **Kein** Fantasie-Chaining (z. B. Rückgabewert von `fillStyle` wie ein Builder behandeln).
- **`Phaser.Geom.*`:** Konstruktoren **`new Phaser.Geom.Rectangle(...)`**, **`new Phaser.Geom.Circle(...)`**, **`new Phaser.Geom.RoundedRectangle(...)`** — so wie in **Phaser 3** dokumentiert.
- **Kein** `canvas.getContext('2d').createRadialGradient` auf dem **Phaser-Haupt-Rendering-Canvas**, wenn du dir unsicher bist — lieber **Phaser-Texturen**, **Graphics**, oder ein **eigenes** zusätzliches DOM-`<canvas>` **neben** dem Game (klar getrennt), nicht das Interne des Game-Canvas „anfassen“.

### Text & Lesbarkeit

- **`this.add.text`:** Schriftgrößen **klassenzimmertauglich** (oft **≥ 22–28 px** je nach Anteil der UI); **Kontrast** zur Scene-Hintergrundfarbe; kurze Labels statt Absatz-Wände auf dem Game-Layer — längere Texte **besser** im DOM/HTML mit kontrolliertem Scroll (siehe allgemeine Bühne-Regeln).

### Physik

- **Arcade Physics:** **`this.physics.add.sprite`**, **`setCollideWorldBounds(true)`** wo sinnvoll; **Gruppen** (`physics.group`) für viele gleichartige Objekte statt Einzel-Collider-Chaos.
- **Nicht** parallel die schwere **`matterjs`**-Sandbox-Library **und** ein voll zweites Matter-Setup ohne Not — **eine** klare Physik-Quelle pro Board.

### Performance & Stabilität

- Objektanzahl **moderat**; bei vielen gleichartigen Dingern **Groups** / **Pools** bevorzugen.
- **`update`** schlank halten — keine schweren Allokationen pro Frame.
- Fehler im Scene-Code **abfangen** (äußeres **`try/catch`** der IIFE bleibt); in `create` keine Annahme, dass Assets „schon irgendwo“ existieren, ohne sie in `preload` geladen zu haben.

### Kurz-Check vor Auslieferung

1. **`used_libraries`** enthält **`phaser`**, sobald **`Phaser.`** im Code vorkommt.  
2. **Kein** Phaser-4- / falscher **Graphics**-API-Mix.  
3. Game-**`parent`**-Element ist im HTML da; Größe passt zur **1280×720**-Logik.  
4. Steuerung **ohne Hover-only**; ausreichende Touch-Ziele.  
5. Nur **lokale** Asset-Pfade; Szenen sauber strukturiert (`preload` → `create` → `update`).
