# Easter Eggs — Design Spec

**Date:** 2026-03-21
**Feature:** Soundboard + audience prompts ("Fun" page on remote)

---

## Overview

A hidden "Fun" page on the mobile remote that lets the presenter trigger theatrical moments: each button simultaneously plays a sound on the laptop/projector and displays a large emoji overlay on the presentation screen. Both effects auto-dismiss after 3 seconds.

---

## Architecture

### New WebRTC message type

```js
{ action: 'fun', id: 'aww' }
```

Remote sends this when a Fun button is tapped. The existing remote→presenter convention uses `action` as the discriminator (matching `action: 'next'` / `action: 'prev'`), so `action: 'fun'` is used here for consistency. The `id` field names the specific effect. The presenter receives it, plays the corresponding audio, and shows the overlay. No response is sent back. If `id` is not found in `FUN_CONFIG`, the presenter silently ignores the message (no-op, no error thrown).

### Audio files

Six mp3 clips bundled in `assets/audio/`. Audio is preloaded on the **presenter side only** (see below).

| id           | file                          | display text | emoji |
|--------------|-------------------------------|--------------|-------|
| `applause`   | `assets/audio/applause.mp3`   | Klapp!       | 👏    |
| `laugh`      | `assets/audio/laugh.mp3`      | hahaha       | 😂    |
| `aww`        | `assets/audio/aww.mp3`        | aww...       | 🥺    |
| `drum-roll`  | `assets/audio/drum-roll.mp3`  | 🥁           | 🥁    |
| `airhorn`    | `assets/audio/airhorn.mp3`    | LUFTHORN     | 📯    |
| `rimshot`    | `assets/audio/rimshot.mp3`    | ba dum tss   | 🎵    |

---

## Shared config — `assets/js/fun-config.js`

`FUN_CONFIG` is extracted to a new standalone script loaded by **both** `index.html` and `remote.html` via `<script src="assets/js/fun-config.js"></script>`. It defines a global `window.FUN_CONFIG` array:

```js
window.FUN_CONFIG = [
  { id: 'applause',  emoji: '👏', label: 'Applaus',       text: 'Klapp!',      src: 'assets/audio/applause.mp3'  },
  { id: 'laugh',     emoji: '😂', label: 'Le',            text: 'hahaha',      src: 'assets/audio/laugh.mp3'     },
  { id: 'aww',       emoji: '🥺', label: 'Aww',           text: 'aww...',      src: 'assets/audio/aww.mp3'       },
  { id: 'drum-roll', emoji: '🥁', label: 'Trommehvirvel', text: '🥁',          src: 'assets/audio/drum-roll.mp3' },
  { id: 'airhorn',   emoji: '📯', label: 'Lufthorn',      text: 'LUFTHORN',    src: 'assets/audio/airhorn.mp3'   },
  { id: 'rimshot',   emoji: '🎵', label: 'Ba dum tss',    text: 'ba dum tss',  src: 'assets/audio/rimshot.mp3'   },
];
```

Both files reference `window.FUN_CONFIG` directly (no import/export — consistent with the existing vanilla JS IIFE pattern).

The path `assets/js/fun-config.js` is relative to the document root. Both `index.html` and `remote.html` are served from the project root alongside the `assets/` directory (the same setup used by all other `assets/js/` scripts in the project), so the path resolves correctly in both dev and GitHub Pages deployments.

---

## Remote changes (`remote.html`)

### Navigation

A 🎉 button (`btn-fun`) is added to the main remote controls row. The updated flex layout is:

```
← (flex:1) | ⚙ (flex:none) | 🎉 (flex:none) | → (flex:1)
```

`btn-fun` matches `btn-gear` exactly: `flex: none`, same circular size, same border-radius. `btn-prev` and `btn-next` retain `flex: 1` and continue to share the remaining width equally. Tapping `btn-fun` transitions the view to the `fun` state.

The remote already uses a simple view-state pattern (`main` / `settings`). A third state `fun` is added following the same `display: none` / `display: block` show/hide pattern used for `viewSettings`.

### Script load order in `remote.html`

The inline `<script>` block is the last element before `</body>`. Add the `fun-config.js` tag immediately before that inline script block:

```html
  <script src="assets/js/fun-config.js"></script>
  <script>
    // ... existing inline script ...
  </script>
</body>
```

This ensures `window.FUN_CONFIG` is defined before the inline script runs.

### Keyboard navigation guard

The existing keydown handler guards navigation when settings is open:
```js
if (viewSettings.style.display !== 'none') return;
```
This must be updated to also suppress navigation when the fun page is active:
```js
if (viewSettings.style.display !== 'none') return;
if (viewFun.style.display !== 'none') return;
```

### Fun page layout

- Back button top-left ("← tilbake") returns to `main` view
- Page title "🎉 Fun" centered in top bar
- 2×3 grid of large tap targets, each showing an emoji + Norwegian label (rendered from `FUN_CONFIG`)
- On tap: call the existing `send()` helper with `{ action: 'fun', id }`; the helper already guards against offline silently (no-op when not connected). Briefly flash the button (scale down + highlight) for tactile feedback regardless of connection state.

---

## Presenter changes (`index.html`)

### Overlay element

A single `<div id="fun-overlay">` is added to the presenter DOM, positioned fixed over the entire viewport, hidden by default:

```css
#fun-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(2px);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  pointer-events: none; /* permanently non-interactive — overlay must never block presenter navigation */
  z-index: 9999;
  opacity: 0; visibility: hidden;
  transition: opacity 0.2s;
}
#fun-overlay.visible {
  opacity: 1; visibility: visible;
}
```

`display: none` is intentionally not used (unlike the settings view pattern) so that the CSS `opacity` transition works on show/hide. Because the overlay is `position: fixed` with `pointer-events: none`, it does not affect document layout when hidden. `pointer-events: none` must not be removed — the overlay must never intercept clicks or touches on the presenter screen.

Contains:
- `.fun-emoji` — large emoji; a `@keyframes` scale bounce (`cubic-bezier(0.34, 1.56, 0.64, 1)`) is applied to it whenever `.visible` is added to `#fun-overlay`
- `.fun-text` — large white bold text
- `.fun-progress` — thin bar fixed at the bottom of the overlay, `width: 100%` by default; animated to `width: 0%` over 3s via a CSS `@keyframes`. The `.animated` class applies this keyframe animation. After dismiss, `.animated` remains on the element — it is only removed at the start of the next trigger (the reflow trick in step 7 handles the reset). No cleanup of `.animated` is needed on dismiss.

### State variables (declared at IIFE scope in `remote-control.js`)

```js
let funPrevAudio = null;      // reference to the most recently triggered Audio object
let funDismissTimeout = null; // handle for the auto-dismiss setTimeout
const funAudio = {};          // keyed by id, populated at init
```

All three are declared at the same IIFE scope level, not inside a nested init function, so they are accessible both during initialisation and in the trigger handler.

### Trigger logic (in `remote-control.js`)

On receiving `{ action: 'fun', id }`:

Steps must be executed in this exact order (steps 2 and 4 share the same `funAudio[id]` object when the same `id` fires twice; step 2 must complete before step 4 to avoid calling `play()` on an object mid-pause):

1. Look up the config entry: `const cfg = FUN_CONFIG.find(c => c.id === id);` — if `cfg` is falsy, return silently
2. Stop previous audio if any: `if (funPrevAudio) { funPrevAudio.pause(); funPrevAudio.currentTime = 0; }`
3. Cancel previous dismiss timeout if any: `if (funDismissTimeout) clearTimeout(funDismissTimeout);`
4. Play new audio: `const audio = funAudio[id]; audio.currentTime = 0; audio.play().catch(() => {});` — `.catch(() => {})` swallows autoplay-policy rejections silently (no user-visible error)
5. Store reference: `funPrevAudio = audio;`
6. Populate overlay: set `.fun-emoji` textContent to `cfg.emoji`, `.fun-text` textContent to `cfg.text`
7. Reset progress bar animation on `progressEl` (the pre-queried `.fun-progress` element): `progressEl.classList.remove('animated'); void progressEl.offsetWidth; progressEl.classList.add('animated');`
8. Show overlay: `overlay.classList.add('visible');`
9. Schedule dismiss: `funDismissTimeout = setTimeout(() => overlay.classList.remove('visible'), 3000);`

### Audio preloading (presenter side only)

At init in `remote-control.js`, after the IIFE-scope declarations:

```js
FUN_CONFIG.forEach(({ id, src }) => {
  funAudio[id] = new Audio(src);
});
```

`remote.html` does not preload audio — it has no audio to play.

---

## Build / deploy

### `index.html`

`build.js` transforms `index.html` via string replacement. The existing `remote-control.js` script tag is the anchor. Add `fun-config.js` immediately before it so that `FUN_CONFIG` is defined when `remote-control.js` runs. In `build.js`, find the string `<script src="assets/js/remote-control.js">` and replace it with:

```
<script src="assets/js/fun-config.js"></script><script src="assets/js/remote-control.js">
```

### `remote.html`

`build.js` copies `remote.html` verbatim. Add `fun-config.js` directly in the source file as described in the "Script load order" section above. No `build.js` changes are needed for `remote.html`.

### Audio assets

`build.js` copies the `assets/` directory to `dist/`. `assets/audio/` is included automatically — no extra copy step needed.

---

## Out of scope

- Volume control
- Disabling/enabling fun mode
- Audience-visible timer on the overlay
- Any sounds beyond the six listed
