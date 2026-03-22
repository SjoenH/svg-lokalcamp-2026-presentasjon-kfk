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
- State is not persisted across reconnects — `facingDir` always resets to `'right'` on page load. This is accepted behaviour.

### Server

No server changes needed for joystick — it reuses the existing `audience-move` handler.

---

## 3. Push / Dytte-knapp

### Client

- Single tap on DYTT!-knapp → send `{ type: 'audience-push', facingDir }` where `facingDir` is `'left'` or `'right'`
- **Cooldown (client):** 1500 ms between pushes — button visually disabled (opacity 0.4, pointer-events none) during cooldown
- **Cooldown (server):** add `lastPushTime: 0` to the client record. On `audience-push`, if `Date.now() − client.lastPushTime < 1000` → silently ignore. On successful push, set `client.lastPushTime = Date.now()`.
- If no target was hit (server responds with `audience-push-miss`): button shakes briefly (CSS animation)

### Server — `audience-push` handler

```
1. Find the pushing client (clientId from closure). Guard: if client.role !== 'audience', return silently.
2. Server-side cooldown: if Date.now() − client.lastPushTime < 1000, return silently.
3. Validate facingDir: if not 'left' or 'right', default to 'right'. dx = facingDir === 'left' ? −1 : +1
4. Search all other audience clients where:
     (target.x − pusher.x) * dx > 0        // target is in the facing direction
     AND (target.x − pusher.x) * dx < 10   // within 10 units in that direction
     AND target.y === pusher.y   // exact y match; characters on different strips cannot be pushed
   Sort by (target.x − pusher.x) * dx ascending (closest first); tiebreak by clientId string comparison.
   Take the first result.
5. If none found → send { type: 'audience-push-miss' } only on pusher's WebSocket → return
6. Apply push: target.x = clamp(target.x + dx * 10, 2, 98)  // 10 units ≈ 10% of the 2–98 range, roughly one character-width apart — intentional push distance
   Update target entry in clients Map (x only, y unchanged). The new x is NOT written to the DB separately; it is implicit in the event log. This is accepted behaviour, consistent with how audience-move works.
7. Set client.lastPushTime = Date.now()
8. Persist: insertEvent 'push' for pusher; insertEvent 'push' for target
9. Send { type: 'audience-position', clientId: targetId, x: target.x, y: target.y } to presenterWs (use the same module-level presenterWs variable as audience-move). If presenterWs is undefined or not open, silently no-op — no rollback needed. The target's own mobile client does NOT receive an audience-position message; the target's x is server-authoritative and the mobile client has no local position display that could go out of sync.
10. Send { type: 'audience-push-hit', clientId: targetId } to presenterWs only.
    No success message is sent to the pusher's WebSocket — the 1500 ms cooldown is the intentional feedback signal. This is by design.
```

### Presenter side (`audience-manager.js`)

- Handle `audience-push-hit`: briefly add CSS class `party-slot-pushed` to the target slot for 400 ms, then remove it. Animation: horizontal shake — `@keyframes partyPushed { 0%,100%{transform:translateX(-50%)} 20%{transform:translateX(calc(-50% + 8px))} 60%{transform:translateX(calc(-50% - 5px))} }` applied to `.party-slot-pushed` with `animation: partyPushed 0.4s ease-out forwards`.
- `audience-push-miss` is sent only on the pusher's WebSocket — the presenter never receives this message and needs no handler for it.

### Database

Add `'push'` as a valid `event_type` — no schema change needed (column is TEXT).

---

## 4. Radial Emote Wheel

### Trigger

- `pointerdown` on emote button → call `setPointerCapture(pointerId)` on the emote button; start 200 ms timer
- If `pointerup` or `pointercancel` fires before 200 ms → cancel timer, do nothing
- If `pointermove` moves more than 8px from the initial touch before 200 ms → cancel timer, do nothing (prevents accidental trigger when scrolling or moving to joystick)
- After 200 ms → open radial wheel overlay. The wheel overlay element must already exist in the DOM (hidden via `display:none`) before any touch event so that `setPointerCapture` can be called on it immediately. Transfer pointer capture: call `emoteButton.releasePointerCapture(pointerId)`, then `wheelOverlay.setPointerCapture(pointerId)`. Make the overlay visible. Subsequent `pointermove` and `pointerup` events will now fire on the overlay element.

### Wheel layout

6 emotes placed at 60° intervals around a centre point. If `AUDIENCE_EMOTES` has fewer than 6 entries, the remaining slots are rendered but unselectable (no emoji, no highlight on hover). The wheel always shows exactly 6 positions.


- 0° (top): emote[0]
- 60°: emote[1]
- 120°: emote[2]
- 180° (bottom): emote[3]
- 240°: emote[4]
- 300°: emote[5]

Radius from centre to emote icon: ~56px. Wheel appears as a full-screen semi-transparent overlay (`position: fixed`) centred on the touch point, clamped so the wheel stays fully on-screen:
```
cx = clamp(touchX, R, viewportWidth  − R)   // R = 80px (wheel visual radius)
cy = clamp(touchY, R, viewportHeight − R)
```

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
- Feedback to the pushed character's own mobile screen (target client gets no `audience-push-hit`)
- Joystick and emote button multi-touch interference: the two controls use `setPointerCapture` on their respective pointer IDs, providing natural multi-touch separation without additional disambiguation logic
