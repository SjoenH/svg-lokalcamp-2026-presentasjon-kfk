# Design: Bakgrunnsanimasjon for title-slides

**Dato:** 2026-03-21
**Status:** Godkjend

## Samandrag

Legg til ei subtil, flytande ASCII-symbol-animasjon i bakgrunnen på presentasjonens første slide (`00-title.html`) og siste slide (`08-closing.html`). Animasjonen er identisk på begge slides og brukar presentasjonens eksisterande fargepalett.

## Arkitektur

Éin ny fil: `assets/js/title-bg-animation.js`
Éin ny import i `index.html` (eller der Reveal.js er initialisert).
Ingen endringar i slide-HTML-filene.

## Komponent: `title-bg-animation.js`

**Ansvar:** Injisere og animere ein `<canvas>` bak innhaldet på `.title-slide`-seksjonar.

**Grensesnitt:** Sjølvstartar via Reveal.js-events. Eksporterer ingenting.

**Avhengigheit:** `Reveal` (global) med `ready` og `slidechanged`-events.

### Oppstart

- Lyttar på `Reveal.on('ready', ...)` og `Reveal.on('slidechanged', ...)`
- Ved kvar event: sjekk om gjeldande slide har klassen `.title-slide`
- Viss ja: kall `startAnimation(slideEl)`
- Viss nei: kall `stopAnimation()`

### Canvas-injeksjon

- Lag `<canvas>` med `position: absolute; inset: 0; z-index: 0; pointer-events: none`
- Legg til som første barn i slide-elementet
- Set `position: relative; z-index: 1` på alle direkte born av sliden (for å ligge over canvas)
- Ved `stopAnimation()`: fjern canvas-elementet og nullstill `requestAnimationFrame`

### Partiklar

- **Antal:** ~80 partiklar
- **Symbol:** `{ } [ ] ( ) < > | = + - * / \ # · ○ × → ← ↑ ↓ ▲ ▼ ◆ □ ■ ░ ▓ │ ─ ┼`
- **Storleik:** 10–22px monospace, tilfeldig per partikkel
- **Farge:** `#450d21` (CSS `--col-heading`) med opacity 0.07–0.20, tilfeldig per partikkel
- **Rørsle:** Langsom drift — kvar partikkel har ein `driftAngle` som roterer sakte (+0.003 per frame), kombinert med eit lite tilfeldig `vx`/`vy`-offset (maks ±0.4px/frame)
- **Svak rotasjon:** Kvar partikkel roterer svakt (±0.002 rad/frame)
- **Wrap:** Partiklar som forsvinn ut av canvas-kanten dukkar opp på motsatt side

### Ytelse

- Brukar `requestAnimationFrame`, avbroten med `cancelAnimationFrame` ved slide-bytte
- Canvas-storleik settast til slide-elementets `offsetWidth × offsetHeight` ved oppstart
- `ctx.clearRect` kvar frame (ingen fade-trail — rein, minimalistisk)

## Visuelt resultat

Lyse, varme ASCII-symbol flyt sakte og uregelmessig over kremfargebakgrunnen. Tittelinnhald (`h1`, `p`, `hr`) ligg tydeleg over. Animasjonen er kontinuerleg så lenge sliden er aktiv, og stoppar/ryddast opp ved slide-bytte.

## Filer som endrast

| Fil | Endring |
|-----|---------|
| `assets/js/title-bg-animation.js` | Ny fil — heile animasjonsmodulen |
| `index.html` | Legg til `<script type="module" src="assets/js/title-bg-animation.js">` |
