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
Expressed as a scale factor (e.g. 1.0 = 100%, 1.15 = 115%). When changed, the remote sends an action to the main screen, which applies it to Reveal.js via `Reveal.configure({ scale: value })` followed by `Reveal.layout()` to force immediate reflow, then rebroadcasts to all other connected remotes so their sliders stay in sync. Current value is included in the main screen's reconnect state so late-joining remotes receive it immediately.

Note: `Reveal.configure({ scale })` scales the entire slide viewport (not only text). This is intentional — it achieves a uniform zoom effect on the projector.

### Timer duration
Replaces the hardcoded `TOTAL = 15 * 60` in `remote.html`. Stepper increment: 5 minutes. Minimum: 5 minutes. Maximum: 60 minutes. Display as whole minutes only.

When changed, the remote sends an action to the main screen, which stores the new value and rebroadcasts to all remotes. The `total` is included in the `{type: 'timer', startedAt, total}` broadcast so any remote that connects after the timer has started uses the correct duration.

If the timer is already running when a duration change arrives, the new `total` takes effect immediately — the display recalculates remaining time as `total − elapsed` without resetting `startedAt`. The timer is not restarted.

### Keep screen awake
Uses the [Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) to prevent the phone screen from sleeping. Stored in `localStorage`. Degrades gracefully on unsupported browsers (iOS Safari 16.4+ required).

Re-acquire on visibility change: register a `visibilitychange` listener that releases the current sentinel and re-requests the Wake Lock when `document.visibilityState === 'visible'` and `keepAwake` is true. The existing sentinel must be released before re-requesting. Errors from the re-request are caught and silently ignored. Displayed with a sublabel noting Wake Lock API support is required.

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
When a remote connects, the main screen includes `fontScale` and `timerTotal` in its first state broadcast so the remote initialises from current values rather than defaults. Additionally, the existing timer reconnect send (`{type: 'timer', startedAt}`) in `remote-control.js` is updated to `{type: 'timer', startedAt, total: timerTotal}` — this send only fires when the timer is running (`timerStartedAt !== null`).

### Simultaneous edits
Last-write-wins. The main screen processes incoming actions serially; whichever `timer-duration` or `font-scale` message arrives last becomes the authoritative value. The losing remote's control snaps to the canonical value when the rebroadcast arrives.

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
- Handle `font-scale` action: apply `Reveal.configure({ scale })` + `Reveal.layout()`, store current value, rebroadcast to all remotes
- Handle `timer-duration` action: store `timerTotal`, rebroadcast, include in timer broadcasts
- Include `fontScale` and `timerTotal` in reconnect state broadcast
- Update existing `conn.on('open')` timer reconnect send to `{type: 'timer', startedAt: timerStartedAt, total: timerTotal}` (only sent when timer is running)

---

## Out of Scope

- Per-speaker note filtering (user confirmed both want to see both speakers' notes)
- Dark/light theme switching
- Haptic feedback
- Any changes to `build.js`, slide files, or other JS modules
