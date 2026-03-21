# Easter Eggs — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-21-easter-eggs-design.md`
**Date:** 2026-03-21

---

## Prerequisites

Before starting, download the six audio files and place them in `assets/audio/`:

| Filename | What to search for |
|---|---|
| `applause.mp3` | crowd applause |
| `laugh.mp3` | audience laughing |
| `aww.mp3` | crowd aww reaction |
| `drum-roll.mp3` | drum roll |
| `airhorn.mp3` | stadium air horn |
| `rimshot.mp3` | ba dum tss / rimshot |

Recommended source: [Mixkit](https://mixkit.co/free-sound-effects/) (free, no attribution required). For `aww`, try Freesound.org if Mixkit doesn't have a good match.

---

## Step 1 — Create `assets/js/fun-config.js`

Create a new file with the shared config array:

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

---

## Step 2 — Add overlay HTML + CSS to `index.html`

### HTML

Add `<div id="fun-overlay">` inside `<body>`, after the Reveal.js `.reveal` container:

```html
<div id="fun-overlay">
  <div class="fun-emoji"></div>
  <div class="fun-text"></div>
  <div class="fun-progress"></div>
</div>
```

### CSS

Add to the `<style>` block in `index.html`:

```css
#fun-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 9999;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s;
}
#fun-overlay.visible {
  opacity: 1;
  visibility: visible;
}
.fun-emoji {
  font-size: 8rem;
  line-height: 1;
  margin-bottom: 1rem;
}
.fun-text {
  font-size: 5rem;
  font-weight: 900;
  color: white;
  text-align: center;
  text-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
}
.fun-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 6px;
  width: 100%;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 0 3px 3px 0;
}
.fun-progress.animated {
  animation: funProgress 3s linear forwards;
}
@keyframes funProgress {
  from { width: 100%; }
  to   { width: 0%; }
}
#fun-overlay.visible .fun-emoji {
  animation: funBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes funBounce {
  from { transform: scale(0.3); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
```

### Script tag

Add `fun-config.js` immediately before the existing `remote-control.js` script tag:

```html
<script src="assets/js/fun-config.js"></script>
<script src="assets/js/remote-control.js"></script>
```

---

## Step 3 — Update `assets/js/remote-control.js`

### 3a — Add IIFE-scope state variables

At the top of the IIFE (alongside other state variables):

```js
let funPrevAudio = null;
let funDismissTimeout = null;
const funAudio = {};
```

### 3b — Preload audio at init

After the state variable declarations (at init time, not inside a function):

```js
FUN_CONFIG.forEach(({ id, src }) => {
  funAudio[id] = new Audio(src);
});
```

### 3c — Handle incoming `action: 'fun'` messages

In the existing data-channel message handler (the `switch` or `if/else` that handles `action: 'next'`, `action: 'prev'`, etc.), add a branch for `action: 'fun'`:

```js
if (data.action === 'fun') {
  const cfg = FUN_CONFIG.find(c => c.id === data.id);
  if (!cfg) return;

  if (funPrevAudio) { funPrevAudio.pause(); funPrevAudio.currentTime = 0; }
  if (funDismissTimeout) clearTimeout(funDismissTimeout);

  const audio = funAudio[data.id];
  audio.currentTime = 0;
  audio.play().catch(() => {});
  funPrevAudio = audio;

  const overlay   = document.getElementById('fun-overlay');
  const progressEl = overlay.querySelector('.fun-progress');

  overlay.querySelector('.fun-emoji').textContent = cfg.emoji;
  overlay.querySelector('.fun-text').textContent  = cfg.text;

  progressEl.classList.remove('animated');
  void progressEl.offsetWidth; // force reflow to restart animation
  progressEl.classList.add('animated');

  overlay.classList.add('visible');
  funDismissTimeout = setTimeout(() => overlay.classList.remove('visible'), 3000);
}
```

> Note: pre-query `.fun-emoji`, `.fun-text`, and `.fun-progress` at init if preferred; the one-time querySelector inside the handler is fine for this use frequency.

---

## Step 4 — Add Fun page to `remote.html`

### 4a — Add `fun-config.js` script tag

Immediately before the inline `<script>` block (which is the last element before `</body>`):

```html
  <script src="assets/js/fun-config.js"></script>
  <script>
    // ... existing inline script
  </script>
</body>
```

### 4b — Add `viewFun` HTML

Add a new `div#view-fun` section alongside `div#view-main` and `div#view-settings`, hidden by default:

```html
<div id="view-fun" style="display:none">
  <div class="top-bar">
    <button id="btn-fun-back" class="btn-back">← tilbake</button>
    <span class="page-title">🎉 Fun</span>
  </div>
  <div id="fun-grid">
    <!-- buttons rendered by JS from FUN_CONFIG -->
  </div>
</div>
```

### 4c — Render Fun buttons from config

In the inline script, after `FUN_CONFIG` is available, render the grid:

```js
const funGrid = document.getElementById('fun-grid');
FUN_CONFIG.forEach(({ id, emoji, label }) => {
  const btn = document.createElement('button');
  btn.className = 'fun-btn';
  btn.dataset.id = id;
  btn.innerHTML = `<span class="btn-emoji">${emoji}</span><span class="btn-label">${label}</span>`;
  btn.addEventListener('click', () => {
    send({ action: 'fun', id });
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 200);
  });
  funGrid.appendChild(btn);
});
```

### 4d — Add 🎉 button to main controls row

In the existing controls row HTML (between `btn-gear` and `btn-next`):

```html
<button id="btn-fun" class="btn-gear" title="Fun">🎉</button>
```

(Reuse `btn-gear` class for matching circular style.)

### 4e — Wire up navigation in the inline script

```js
const viewFun = document.getElementById('view-fun');

document.getElementById('btn-fun').addEventListener('click', () => {
  viewMain.style.display = 'none';
  viewFun.style.display = 'block';
});

document.getElementById('btn-fun-back').addEventListener('click', () => {
  viewFun.style.display = 'none';
  viewMain.style.display = 'block';
});
```

### 4f — Update keyboard navigation guard

```js
if (viewSettings.style.display !== 'none') return;
if (viewFun.style.display !== 'none') return;
```

### 4g — Add CSS for Fun page

In the `<style>` block of `remote.html`:

```css
#fun-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
}
.fun-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 8px;
  border-radius: 16px;
  border: none;
  background: var(--btn-bg, #1e293b);
  color: white;
  cursor: pointer;
  transition: transform 0.1s, background 0.1s;
  -webkit-tap-highlight-color: transparent;
}
.fun-btn .btn-emoji {
  font-size: 2.2rem;
  margin-bottom: 6px;
}
.fun-btn .btn-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 700;
  color: #94a3b8;
}
.fun-btn.flash {
  transform: scale(0.92);
  background: #334155;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  position: relative;
}
.btn-back {
  position: absolute;
  left: 16px;
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 4px 8px;
}
.page-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #e2e8f0;
  letter-spacing: 0.05em;
}
```

---

## Step 5 — Update `build.js`

In `build.js`, find the string replacement that processes `index.html`. Add a replacement to inject `fun-config.js` before `remote-control.js`:

```js
.replace(
  '<script src="assets/js/remote-control.js">',
  '<script src="assets/js/fun-config.js"></script><script src="assets/js/remote-control.js">'
)
```

No changes needed for `remote.html` (already updated in source) or `assets/audio/` (copied automatically).

---

## Step 6 — Manual smoke test

1. Start dev server (`npm run dev`)
2. Open presenter view in browser — check no console errors, overlay not visible
3. Open remote on phone (`/remote.html?id=kfk-lokalcamp-2026`) — check 🎉 button appears in nav
4. Tap 🎉 — Fun page opens with 6 buttons
5. Tap a button — sound plays on laptop, overlay appears on presenter screen, auto-dismisses after 3s
6. Tap the same button twice quickly — second tap interrupts first (no double audio)
7. Go offline (disable network) — tap a fun button — flash still works, no errors
8. Run `npm run build` — verify `dist/assets/audio/` contains all 6 mp3s and `dist/assets/js/fun-config.js` exists
