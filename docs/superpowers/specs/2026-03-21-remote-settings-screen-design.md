# Remote Settings Screen — Design Spec

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Add a settings screen to `remote.html` so presenters can adjust font sizes, timer duration, and screen behaviour from their phone without touching code.

Both Henry and Ahmed hold their own devices during the presentation. Presentation-affecting settings (slide font size, timer duration) are synced across all connected remotes via the existing WebRTC channel. Personal settings (notes font size, keep screen awake) are local to each device.

---

## Feature Set

### Settings

| Setting | Scope | Control |
|---|---|---|
| Notes font size | Local (per device) | Slider |
| Slide font size | Synced (all remotes + projector) | Slider |
| Timer duration | Synced (all remotes) | +/− stepper, default 15 min |
| Keep screen awake | Local (per device) | Toggle |

### Notes font size
Applies a CSS custom property `--notes-font-size` on the `#notes` element. Stored in `localStorage`. Affects only the device it is set on.

### Slide font size
Expressed as a scale factor (e.g. 1.0 = 100%, 1.15 = 115%). When changed, the remote sends an action to the main screen, which applies it to Reveal.js via `Reveal.configure({ scale: value })` and rebroadcasts to all other connected remotes so their sliders stay in sync. Current value is included in the main screen's reconnect state so late-joining remotes receive it immediately.

### Timer duration
Replaces the hardcoded `TOTAL = 15 * 60` in `remote.html`. When changed, the remote sends an action to the main screen, which stores the new value and rebroadcasts to all remotes. The `total` is included in the `{type: 'timer', startedAt, total}` broadcast so any remote that connects after the timer has started uses the correct duration.

### Keep screen awake
Uses the [Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) to prevent the phone screen from sleeping. Stored in `localStorage`. Re-acquires the lock automatically if the page becomes visible again after being backgrounded. Displayed with a "requires Wake Lock API" sublabel — degrades gracefully on unsupported browsers.

---

## UI Structure

### Gear icon
A small gear button (⚙️) is added between the ← and → navigation buttons in the existing `.controls` row.

### View switching
`remote.html` gains two top-level views:
- `<div id="view-remote">` — the existing remote UI
- `<div id="view-settings">` — the new settings screen

Toggled by showing/hiding with CSS `display: none`. No routing, no new files.

### Settings screen layout
```
← Innstillingar

[NOTAT]
Skriftstorleik (notat)     [slider]  → local

[PRESENTASJON]
Skriftstorleik (lysbilete) [slider]  → synced to projector

[TIDTAKAR]
Varigheit                  [− 15 min +]  → synced to all remotes

[SKJERM]
Hald skjermen vakken       [toggle]  → local
```

---

## Data Flow

### Remote → Main screen

| Action | Payload | Effect |
|---|---|---|
| `font-scale` | `{action, value: 1.15}` | Main applies to Reveal.js, rebroadcasts |
| `timer-duration` | `{action, total: 1200}` | Main stores, rebroadcasts, includes in future timer broadcasts |

### Main screen → All remotes

| Type | Payload | Effect on remote |
|---|---|---|
| `font-scale` | `{type, value: 1.15}` | Remote updates slider and localStorage |
| `timer-duration` | `{type, total: 1200}` | Remote updates stepper and localStorage |
| `timer` | `{type, startedAt, total}` | Remote starts countdown with correct total |

### Reconnect sync
When a remote connects, the main screen includes `fontScale` and `timerTotal` in its first state broadcast so the remote initialises from current values rather than defaults.

---

## Persistence

All settings stored in `localStorage` under predictable keys:

| Key | Default | Type |
|---|---|---|
| `kfk.notesFontSize` | `1.4` | Number (rem) |
| `kfk.fontScale` | `1.0` | Number (ratio) |
| `kfk.timerTotal` | `900` | Number (seconds) |
| `kfk.keepAwake` | `false` | Boolean |

---

## Files Changed

**`remote.html`**
- Add `<div id="view-settings">` alongside existing remote view
- Add gear icon to `.controls` row
- Add settings JS: localStorage read/write, view switching, Wake Lock lifecycle, WebRTC sends for `font-scale` and `timer-duration`
- Handle incoming `font-scale` and `timer-duration` messages from main screen (update sliders/stepper)
- Replace hardcoded `TOTAL = 15 * 60` with value from localStorage
- Use `--notes-font-size` CSS custom property on `#notes`

**`assets/js/remote-control.js`**
- Handle `font-scale` action: apply `Reveal.configure({ scale })`, store current value, rebroadcast to all remotes
- Handle `timer-duration` action: store `timerTotal`, rebroadcast, include in timer broadcasts
- Include `fontScale` and `timerTotal` in reconnect state broadcast

---

## Out of Scope

- Per-speaker note filtering (user confirmed both want to see both speakers' notes)
- Dark/light theme switching
- Haptic feedback
- Any changes to `build.js`, slide files, or other JS modules
