# Design: Bakgrunnsanimasjon for title-slides

**Dato:** 2026-03-21
**Status:** Godkjend

## Samandrag

Legg til ei subtil, flytande ASCII-symbol-animasjon i bakgrunnen på presentasjonens første slide (`00-title.html`) og siste slide (`08-closing.html`). Animasjonen er identisk på begge slides og brukar presentasjonens eksisterande fargepalett.

## Arkitektur

Éin ny fil: `assets/js/title-bg-animation.js`
Éin tillegg i `index.html`: ein vanleg `<script src="assets/js/title-bg-animation.js">` (ikkje `type="module"`) plassert etter slide-loader-scriptet, slik at `Reveal` er tilgjengeleg som global.
Ingen endringar i slide-HTML-filene.

## Komponent: `title-bg-animation.js`

**Ansvar:** Injisere og animere ein `<canvas>` bak innhaldet på `.title-slide`-seksjonar.

**Grensesnitt:** Sjølvstartar; eksporterer ingenting. Registrerer Reveal.js-handlers øvst i fila.

**Avhengigheit:** `Reveal` global, tilgjengeleg fordi scriptet er lasta etter Reveal-biblioteket og `slide-loader.js`.

### Oppstart

Registrer tre Reveal.js-events:

```
Reveal.on('ready',        e => handleSlide(e.currentSlide))
Reveal.on('slidechanged', e => handleSlide(e.currentSlide))
Reveal.on('resize',       ()=> resizeCanvas())
```

`handleSlide(slideEl)`:
- Viss `slideEl.classList.contains('title-slide')` → kall `startAnimation(slideEl)`
- Elles → kall `stopAnimation()`

### Canvas-injeksjon (`startAnimation(slideEl)`)

1. Viss canvas allereie finst i sliden: hopp over injeksjon, gå rett til (re)start av animasjon.
2. Lag `<canvas id="title-bg-canvas">` med:
   ```css
   position: absolute; inset: 0; z-index: 0; pointer-events: none;
   ```
3. Set canvas-størrelse til `Reveal.getConfig().width × Reveal.getConfig().height` (ikkje `offsetWidth`/`offsetHeight`).
4. Legg til canvas som første barn av `slideEl`.
5. Set `position: relative; z-index: 1` på alle direkte born av `slideEl` **unntatt** `canvas` og `aside`-element.
6. Start `requestAnimationFrame`-løkka.

### Stopp (`stopAnimation()`)

1. Avbryt `requestAnimationFrame` med `cancelAnimationFrame(rafId)`.
2. Fjern inline-stilane (`position`, `z-index`) frå alle direkte born som fekk dei i `startAnimation`.
3. Fjern `<canvas>`-elementet frå DOM.
4. Nullstill intern tilstand (`rafId = null`, `activeSlide = null`).

### Resize-handtering (`resizeCanvas()`)

Viss ein canvas er aktiv: oppdater `canvas.width` og `canvas.height` til oppdatert `Reveal.getConfig().width × Reveal.getConfig().height`, og re-initialiser partiklar (tilfeldig posisjon innanfor ny størrelse).

### Partiklar

- **Antal:** ~80 partiklar
- **Symbol:** `{ } [ ] ( ) < > | = + - * / \ # · ○ × → ← ↑ ↓ ▲ ▼ ◆ □ ■ ░ ▓ │ ─ ┼`
- **Storleik:** 10–22px monospace, tilfeldig per partikkel
- **Farge:** `#450d21` (CSS `--col-heading`) med opacity 0.07–0.20, tilfeldig per partikkel
- **Rørsle:** Langsom drift — kvar partikkel har ein `driftAngle` som aukar med +0.003 per frame, kombinert med lite tilfeldig `vx`/`vy`-offset (maks ±0.4px/frame)
- **Svak rotasjon:** Kvar partikkel roterer svakt (±0.002 rad/frame)
- **Wrap:** Partiklar som forsvinn ut av canvas-kanten dukkar opp på motsatt side (med 30px margin)

### Render-løkke

```
ctx.clearRect(0, 0, W, H)   // rein frame, ingen fade-trail
for each particle:
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.globalAlpha = p.alpha
  ctx.fillStyle = '#450d21'
  ctx.font = `${p.size}px monospace`
  ctx.fillText(p.ch, 0, 0)
  ctx.restore()
  update position, rotation, driftAngle
  wrap edges
rafId = requestAnimationFrame(loop)
```

## Visuelt resultat

Lyse, varme ASCII-symbol flyt sakte og uregelmessig over kremfargebakgrunnen. Tittelinnhald (`h1`, `p`, `hr`) ligg tydeleg over. Animasjonen er kontinuerleg så lenge sliden er aktiv, og stoppar/ryddast opp ved slide-bytte.

## Filer som endrast

| Fil | Endring |
|-----|---------|
| `assets/js/title-bg-animation.js` | Ny fil — heile animasjonsmodulen |
| `index.html` | Legg til `<script src="assets/js/title-bg-animation.js"></script>` etter eksisterande script-tags |
