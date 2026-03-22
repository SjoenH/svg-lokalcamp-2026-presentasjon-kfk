# Audience Page Overhaul — Design Spec

**Date:** 2026-03-22
**Scope:** Full redesign of `audience.html` main control view: virtual joystick, push/shove action, and radial emote wheel.

---

## Overview

Replace the D-pad movement controls with a virtual joystick, add a push/dytte-knapp that shoves the nearest character in the direction the pusher is facing, and replace the flat emote grid with a hold-to-open radial wheel.

---

## 1. Layout — Gamepad Style

The main control view (`view-main`) uses a two-column gamepad layout in the lower half:

- **Left column:** Virtual joystick (circular touch area, ~100px diameter)
- **Right column (stacked top to bottom):**
  1. DYTT!-knapp (push button)
  2. Emote-knapp (triggers radial wheel on long-press)
  3. Mini emote preview row (shows the 4 most recent/available emotes as decorative hint)

Above the gamepad area (unchanged from current):
- Character preview bar (sprite + name/character label)
- "Si noko" sentence buttons (2-column grid, unchanged)

Connection status dot remains at the very bottom.

---

## 2. Virtual Joystick

### Client behaviour

- `pointerdown` on the joystick area: record origin point, show knob offset at (0,0)
- `pointermove`: calculate `dx = currentX − originX`, `dy = currentY − originY`
- **Deadzone:** if `Math.hypot(dx, dy) < 12` → no movement, knob stays centred
- **Direction:** dominant axis — if `|dx| > |dy|` → left/right, else → up/down
- Send `audience-move` every 100 ms while outside deadzone (same message format as before)
- `pointerup` / `pointercancel`: stop sending, animate knob back to centre
- Knob is clamped visually to the joystick circle radius

### Facing direction

- Client tracks `facingDir` (initial value: `'right'`)
- Updated to `'left'` or `'right'` whenever a horizontal move is sent
- Sent with every `audience-push` message

### Server

No server changes needed for joystick — it reuses the existing `audience-move` handler.

---

## 3. Push / Dytte-knapp

### Client

- Single tap on DYTT!-knapp → send `{ type: 'audience-push', facingDir }` where `facingDir` is `'left'` or `'right'`
- **Cooldown:** 1500 ms between pushes — button visually disabled (opacity 0.4, pointer-events none) during cooldown
- If no target was hit (server responds with `audience-push-miss`): button shakes briefly (CSS animation)

### Server — `audience-push` handler

```
1. Find the pushing client (clientId from closure)
2. Determine push vector: facingDir === 'left' → dx = −1, 'right' → dx = +1
3. Search all other audience clients for nearest in x where |target.x − pusher.x| < 10
4. If none found → send { type: 'audience-push-miss', clientId } back to pusher → return
5. Apply push: target.x = clamp(target.x + dx * 10, 2, 98)
6. Persist: insertEvent for 'push' event_type on both pusher and target
7. Broadcast { type: 'audience-position', clientId: targetId, x: target.x, y: target.y } to presenter
8. Send { type: 'audience-push-hit', clientId: targetId } to presenter (for optional visual flash)
```

### Presenter side (`audience-manager.js`)

- Handle `audience-push-hit`: briefly add CSS class `party-slot-pushed` to the target slot (flash/shake animation, 400 ms)
- Handle `audience-push-miss`: no-op (miss feedback is client-only)

### Database

Add `'push'` as a valid `event_type` — no schema change needed (column is TEXT).

---

## 4. Radial Emote Wheel

### Trigger

- `pointerdown` on emote button → start 200 ms timer
- If pointer released before 200 ms → treat as quick-tap, send first/default emote (or do nothing)
- After 200 ms → open radial wheel overlay

### Wheel layout

6 emotes placed at 60° intervals around a centre point:
- 0° (top): emote[0]
- 60°: emote[1]
- 120°: emote[2]
- 180° (bottom): emote[3]
- 240°: emote[4]
- 300°: emote[5]

Radius from centre to emote icon: ~56px. Wheel appears as a full-screen semi-transparent overlay (`position: fixed`) centred on the touch point (clamped so it doesn't go off-screen).

### Selection

- While pointer is held and moved: calculate angle from wheel centre → highlight nearest emote
- Deadzone: if `Math.hypot(dx, dy) < 20` → no emote highlighted (cancel zone)
- `pointerup`:
  - If emote highlighted → send `{ type: 'audience-emote', emoteId }` → close wheel
  - If in deadzone or no highlight → close wheel without sending

### Visual

- Overlay background: `rgba(0,0,0,0.6)` circle, ~160px diameter, with blur
- Each emote item: 44px circle, emoji centred
- Highlighted item: scale(1.3) + glow ring
- No separate emote grid or section label remains in the UI — wheel replaces it entirely

---

## 5. Files Changed

| File | Change |
|------|--------|
| `audience.html` | Replace D-pad with joystick + right-column layout; add radial wheel overlay; add push cooldown logic; add facing direction tracking |
| `server.js` | Add `audience-push` handler; add `push` event logging |
| `assets/js/audience-manager.js` | Handle `audience-push-hit` → `party-slot-pushed` CSS class |
| `assets/css/party-bar.css` | Add `party-slot-pushed` shake animation |

---

## 6. Out of Scope

- Joystick diagonal movement (4-way only, dominant axis)
- Push affecting y-position
- Multiplayer push chains (only direct pusher→nearest target)
- Push range varying by slide mode
- Sound effects
