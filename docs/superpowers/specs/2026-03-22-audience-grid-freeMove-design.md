# Design: Audience Emoji Grid + Fri 2D-rørsle

**Dato:** 2026-03-22
**Status:** Godkjent

---

## Oversikt

To endringar til publikumssystemet:
1. Emote-velgaren på `audience.html` blir eit CSS grid
2. Karakterar kan bevege seg fritt i 2D på presentasjonsskjermen med ein 4-veg d-pad

---

## Del 1: Emoji-grid på audience.html

### Noverande tilstand
Emote-knappane er i ei rad (flex/list). 18 emojiar.

### Ny tilstand
- CSS grid med **6 kolonnar**, gir 3 rader × 6 = 18 celler
- Kvar knapp: ~48×48px, touch-venleg
- Ingen endringar i meldingsformat — `audience-emote` er uendra

---

## Del 2: Fri 2D-rørsle

### Posisjonssystem
- Kvar klient får ein `(x, y)` posisjon lagra på serveren, i prosent (0–100) av skjermstorleiken
- **Startposisjon:** `x = random(20, 80)`, `y = 95` (langs botnen)
- **Grenser:** `x: 2–98`, `y: 10–98`

### Meldingsflyt
1. Brukar held inne d-pad-knapp på `audience.html`
2. Client sender `audience-move { direction: 'up'|'down'|'left'|'right' }` kvart **100ms**
3. Server oppdaterer `(x, y)` med **+/- 1 prosenteining** per melding, clampar til grenser
4. Server broadcaster `audience-position { clientId, x, y }` til presenter
5. Presenter oppdaterer karakterposisjon i neste `requestAnimationFrame`

### Fjerning av party-bar
- `#party-bar-wrap` og tilhøyrande CSS/logikk fjernast
- Karakterar rendrar som `position: absolute` element på eit nytt overlegg

### Presenter-overlegg
- Nytt element: `#audience-overlay`, `position: fixed`, `inset: 0`, `pointer-events: none`
- **z-index lågare enn Reveal.js-innhald** (t.d. `z-index: 10` vs Reveal sin `z-index: 1000+`)
- Kvart karakter: `position: absolute`, `left: {x}%`, `bottom: {100-y}%`
- `requestAnimationFrame`-loop les ein kø av posisjonsmeldingar og appliserer dei

---

## Del 3: D-pad UI på audience.html

### Layout
CSS grid `3×3`, berre 4 retningsceller har knapper:
```
[ ]  [↑]  [ ]
[←]  [ ]  [→]
[ ]  [↓]  [ ]
```

### Interaksjon
- `pointerdown`: start `setInterval(100ms)` som sender move-melding
- `pointerup` / `pointerleave` / `pointercancel`: `clearInterval`
- Fungerer med touch og mus

### Storleik
- Kvar knapp: 52×52px (same som eksisterande ← → knapper)

---

## Endringar per fil

| Fil | Endring |
|-----|---------|
| `audience.html` | Emote-velgar → 6-kol grid; ← → knapper → 4-veg d-pad |
| `assets/css/party-bar.css` | Fjern party-bar-stilar; legg til `#audience-overlay` og absolutt-posisjonerte `.party-slot` |
| `assets/js/audience-manager.js` | Fjern `moveChar()` swap-logikk; legg til `audience-position`-lyttar; rAF-renderloop |
| `server.js` | Legg til `(x, y)` per klient; handter `audience-move` med koordinat-oppdatering; send `audience-position` |

---

## Ytingsvurdering

- 40 brukarar × 10 meldingar/sek = 400 msg/sek til server
- Server sender 400 msg/sek til presenter
- Presenter handterer dette via rAF-loop (maks 60 renderingar/sek uavhengig av meldingsrate)
- WebSocket-server på Fly.io handterer dette utan problem
