# Audience Page Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the D-pad with a virtual joystick, add a push/shove button, and replace the flat emote grid with a hold-to-open radial wheel on `audience.html`.

**Architecture:** All changes are confined to the four files listed in the spec. No new files are created. `audience.html` carries both the layout markup and all client-side JS in a single inline script (matching existing code style). Server changes are additive only (a new `audience-push` message handler and `lastPushTime` field). Presenter-side changes are additive only (a new `audience-push-hit` handler and a CSS animation).

**Tech Stack:** Vanilla JS, CSS, HTML, Node.js + `ws` WebSocket server, no test framework — verification is manual (browser + server console).

---

## File map

| File | What changes |
|------|-------------|
| `audience.html` | Remove D-pad markup + styles; remove flat emote grid markup + styles; add joystick HTML + CSS + JS; add DYTT! button HTML + CSS + cooldown JS; add radial wheel overlay HTML + CSS + JS; add `facingDir` tracking |
| `server.js` | Add `lastPushTime: 0` to client record at connection; add `audience-push` handler |
| `assets/js/audience-manager.js` | Add `audience-push-hit` handler that adds/removes `.party-slot-pushed` class |
| `assets/css/party-bar.css` | Add `@keyframes partyPushed` + `.party-slot-pushed` rule |

---

## Task 1: Push animation CSS + presenter handler

**Files:**
- Modify: `assets/css/party-bar.css` (append at end)
- Modify: `assets/js/audience-manager.js` (inside `handleMessage`)

- [ ] **Step 1: Add `partyPushed` keyframes and `.party-slot-pushed` rule to `party-bar.css`**

Append to the end of `assets/css/party-bar.css`:

```css
/* ---- Push shove animation ---- */
@keyframes partyPushed {
  0%,100% { transform: translateX(-50%); }
  20%     { transform: translateX(calc(-50% + 8px)); }
  60%     { transform: translateX(calc(-50% - 5px)); }
}
.party-slot-pushed {
  animation: partyPushed 0.4s ease-out forwards;
}
```

- [ ] **Step 2: Add `audience-push-hit` handler inside `handleMessage` in `audience-manager.js`**

Inside the `handleMessage` function, after the `audience-disconnect` branch (before the closing `}`), add:

```js
    } else if (data.type === 'audience-push-hit') {
      var targetSlot = wrap.querySelector('.party-slot[data-conn-id="' + data.clientId + '"]');
      if (targetSlot) {
        targetSlot.classList.add('party-slot-pushed');
        setTimeout(function () { targetSlot.classList.remove('party-slot-pushed'); }, 400);
      }
    }
```

- [ ] **Step 3: Manual check — reload presenter page, verify no JS errors in console**

- [ ] **Step 4: Commit**

```bash
git add assets/css/party-bar.css assets/js/audience-manager.js
git commit -m "feat: add party-slot-pushed shake animation and push-hit handler"
```

---

## Task 2: Server — `audience-push` handler

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add `lastPushTime: 0` to the initial client record**

Find the line (around line 114):
```js
clients.set(clientId, { ws, role: null, name: null, charId: null, x: null, y: null, lastMoveInsert: 0 });
```
Change it to:
```js
clients.set(clientId, { ws, role: null, name: null, charId: null, x: null, y: null, lastMoveInsert: 0, lastPushTime: 0 });
```

- [ ] **Step 2: Add the `audience-push` handler after the `audience-move` block**

After the closing `return;` of the `audience-move` handler (around line 201), insert:

```js
    if (data.type === 'audience-push') {
      if (client.role !== 'audience') return;
      if (Date.now() - client.lastPushTime < 1000) return;

      const rawDir = String(data.facingDir || '');
      const facingDir = (rawDir === 'left' || rawDir === 'right') ? rawDir : 'right';
      const dx = facingDir === 'left' ? -1 : 1;

      // Find nearest target in facing direction on the same y strip
      const pusherX = client.x;
      const pusherY = client.y;
      let target = null;
      let targetId = null;
      let minDist = Infinity;

      for (const [cid, c] of clients) {
        if (cid === clientId) continue;
        if (c.role !== 'audience') continue;
        const diffX = (c.x - pusherX) * dx;
        if (diffX <= 0 || diffX >= 10) continue;
        if (c.y !== pusherY) continue;
        if (diffX < minDist || (diffX === minDist && cid < targetId)) {
          minDist = diffX;
          target = c;
          targetId = cid;
        }
      }

      if (!target) {
        send(ws, { type: 'audience-push-miss' });
        return;
      }

      target.x = Math.min(98, Math.max(2, target.x + dx * 10));
      client.lastPushTime = Date.now();

      insertEvent.run(sessionId, clientId, client.name, client.charId, 'push', null, Date.now());
      insertEvent.run(sessionId, targetId, target.name, target.charId, 'push', null, Date.now());

      send(presenterWs, { type: 'audience-position', clientId: targetId, x: target.x, y: target.y });
      send(presenterWs, { type: 'audience-push-hit', clientId: targetId });
      return;
    }
```

- [ ] **Step 3: Restart server, verify it starts without errors**

```bash
node server.js
```
Expected: `Server listening on http://localhost:8080`

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add audience-push server handler with cooldown and target search"
```

---

## Task 3: audience.html — Joystick + DYTT! layout (HTML & CSS)

**Files:**
- Modify: `audience.html`

Remove the D-pad section and emote section from `view-main`, and replace with the new gamepad layout. Do this in two sub-steps: HTML first, then CSS.

- [ ] **Step 1: Remove D-pad CSS styles**

In `audience.html`, remove the entire `/* D-pad move controls */` block (lines 313–341 in the original file):
```css
    /* D-pad move controls */
    #move-controls {
      display: grid;
      grid-template-columns: repeat(3, 52px);
      grid-template-rows: repeat(3, 52px);
      gap: 6px;
      margin-bottom: 20px;
      user-select: none;
      -webkit-user-select: none;
    }
    .move-btn {
      background: #1a1a2e;
      border: 2px solid #2a2a4a;
      border-radius: 10px;
      color: #f0f0f0;
      font-size: 1.4rem;
      width: 52px; height: 52px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    .move-btn:active {
      background: #223355;
      border-color: #7dd3fc;
      transform: scale(0.92);
    }
```

- [ ] **Step 2: Remove flat emote CSS styles**

Remove the `/* Emote buttons */` block (lines 288–311 in the original file):
```css
    /* Emote buttons */
    #emote-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      width: 100%;
      margin-bottom: 20px;
    }
    .emote-btn {
      background: #1a1a2e;
      border: 2px solid #2a2a4a;
      border-radius: 12px;
      font-size: 1.6rem;
      line-height: 1.5;
      padding: 10px 4px;
      cursor: pointer;
      text-align: center;
      -webkit-tap-highlight-color: transparent;
      overflow: visible;
    }
    .emote-btn:active {
      background: #223355;
      border-color: #7dd3fc;
      transform: scale(0.94);
    }
```

- [ ] **Step 3: Add new gamepad layout CSS**

Replace removed CSS with the following, inside `<style>`:

```css
    /* ---- Gamepad layout ---- */
    #gamepad-area {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      width: 100%;
      margin-bottom: 20px;
      gap: 12px;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Left column: joystick */
    #joystick-wrap {
      position: relative;
      width: 100px;
      height: 100px;
      flex-shrink: 0;
    }
    #joystick-base {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: #1a1a2e;
      border: 2px solid #2a2a4a;
      touch-action: none;
    }
    #joystick-knob {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #3a3a6a;
      border: 2px solid #7dd3fc;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      transition: transform 0.05s ease;
    }
    #joystick-knob.returning {
      transition: transform 0.2s ease;
    }

    /* Right column: action buttons */
    #action-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      flex: 1;
    }
    #btn-push {
      width: 100%;
      background: #3a1a1a;
      border: 2px solid #aa3333;
      border-radius: 10px;
      color: #ff8888;
      font-size: 1.1rem;
      font-weight: 900;
      padding: 14px 10px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      letter-spacing: 0.05em;
    }
    #btn-push:active { background: #551111; }
    #btn-push.cooldown { opacity: 0.4; pointer-events: none; }
    @keyframes pushMiss {
      0%,100% { transform: translateX(0); }
      20%     { transform: translateX(-6px); }
      60%     { transform: translateX(6px); }
    }
    #btn-push.shake { animation: pushMiss 0.3s ease-out; }

    #btn-emote {
      width: 100%;
      background: #1a1a2e;
      border: 2px solid #2a2a4a;
      border-radius: 10px;
      color: #f0f0f0;
      font-size: 1.4rem;
      padding: 12px 10px;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: none;
      text-align: center;
    }
    #btn-emote:active { background: #223355; border-color: #7dd3fc; }

    /* Mini emote preview row */
    #emote-preview {
      display: flex;
      gap: 6px;
      justify-content: center;
    }
    .emote-preview-dot {
      font-size: 1.1rem;
      opacity: 0.5;
    }

    /* ---- Radial wheel overlay ---- */
    #emote-wheel-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 200;
      touch-action: none;
    }
    #emote-wheel-overlay.open { display: block; }
    #emote-wheel-bg {
      position: absolute;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .emote-wheel-item {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #1a1a2e;
      border: 2px solid #2a2a4a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
      transform: translate(-50%, -50%);
      pointer-events: none;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
    }
    .emote-wheel-item.highlighted {
      transform: translate(-50%, -50%) scale(1.3);
      box-shadow: 0 0 0 3px #7dd3fc;
    }
    .emote-wheel-item.empty {
      opacity: 0.2;
    }
```

- [ ] **Step 4: Replace D-pad HTML with gamepad layout**

In `view-main`, replace:
```html
    <div class="section-label">Emote</div>
    <div id="emote-grid"></div>

    <div class="section-label">Flytt karakteren</div>
    <div id="move-controls">
      <div></div>
      <button class="move-btn" data-dir="up">↑</button>
      <div></div>
      <button class="move-btn" data-dir="left">←</button>
      <div></div>
      <button class="move-btn" data-dir="right">→</button>
      <div></div>
      <button class="move-btn" data-dir="down">↓</button>
      <div></div>
    </div>
```

With:
```html
    <div id="gamepad-area">
      <!-- Left: joystick -->
      <div id="joystick-wrap">
        <div id="joystick-base">
          <div id="joystick-knob"></div>
        </div>
      </div>

      <!-- Right: action buttons -->
      <div id="action-col">
        <button id="btn-push">DYTT!</button>
        <button id="btn-emote">😀</button>
        <div id="emote-preview"></div>
      </div>
    </div>

    <!-- Radial wheel overlay (always in DOM, hidden) -->
    <div id="emote-wheel-overlay">
      <div id="emote-wheel-bg"></div>
    </div>
```

- [ ] **Step 5: Build and open browser, verify layout looks correct (joystick on left, DYTT!/emote buttons on right, no D-pad visible, no flat emote grid)**

```bash
npm run dev
```
Open `http://localhost:5173/audience.html` → connect → go to main view.

- [ ] **Step 6: Commit**

```bash
git add audience.html
git commit -m "feat: replace D-pad and flat emote grid with gamepad layout HTML/CSS"
```

---

## Task 4: audience.html — Joystick JS

**Files:**
- Modify: `audience.html` (inline script)

- [ ] **Step 1: Remove the D-pad JS code**

In the inline script, remove the entire D-pad section:
```js
    // ---- D-pad move buttons ----
    var moveInterval = null;

    function sendMove(dir) { ... }
    function startMove(dir) { ... }
    function stopMove() { ... }

    document.querySelectorAll('.move-btn').forEach(function (btn) {
      ...
    });
```

- [ ] **Step 2: Add joystick JS**

In place of the removed D-pad code, add:

```js
    // ---- Virtual joystick ----
    var facingDir = 'right';
    var joystickActive = false;
    var joystickOriginX = 0, joystickOriginY = 0;
    var joystickMoveInterval = null;
    var joystickDir = null;
    var joystickBase = document.getElementById('joystick-base');
    var joystickKnob = document.getElementById('joystick-knob');
    var JOYSTICK_RADIUS = 40; // visual clamp radius (px)
    var JOYSTICK_DEADZONE = 12;

    function joystickSendMove() {
      if (joystickDir && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'audience-move', direction: joystickDir }));
        if (joystickDir === 'left') facingDir = 'left';
        if (joystickDir === 'right') facingDir = 'right';
      }
    }

    function joystickStop() {
      joystickActive = false;
      joystickDir = null;
      if (joystickMoveInterval) { clearInterval(joystickMoveInterval); joystickMoveInterval = null; }
      joystickKnob.classList.add('returning');
      joystickKnob.style.transform = 'translate(-50%, -50%)';
      setTimeout(function () { joystickKnob.classList.remove('returning'); }, 220);
    }

    joystickBase.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      joystickBase.setPointerCapture(e.pointerId);
      var rect = joystickBase.getBoundingClientRect();
      joystickOriginX = rect.left + rect.width / 2;
      joystickOriginY = rect.top + rect.height / 2;
      joystickActive = true;
      joystickKnob.classList.remove('returning');
    });

    joystickBase.addEventListener('pointermove', function (e) {
      if (!joystickActive) return;
      var dx = e.clientX - joystickOriginX;
      var dy = e.clientY - joystickOriginY;
      var dist = Math.hypot(dx, dy);

      // Clamp knob visually
      var clampedX = dx, clampedY = dy;
      if (dist > JOYSTICK_RADIUS) {
        clampedX = (dx / dist) * JOYSTICK_RADIUS;
        clampedY = (dy / dist) * JOYSTICK_RADIUS;
      }
      joystickKnob.style.transform = 'translate(calc(-50% + ' + clampedX + 'px), calc(-50% + ' + clampedY + 'px))';

      if (dist < JOYSTICK_DEADZONE) {
        joystickDir = null;
        if (joystickMoveInterval) { clearInterval(joystickMoveInterval); joystickMoveInterval = null; }
        return;
      }

      // Dominant axis
      var newDir;
      if (Math.abs(dx) > Math.abs(dy)) {
        newDir = dx > 0 ? 'right' : 'left';
      } else {
        newDir = dy > 0 ? 'down' : 'up';
      }

      if (newDir !== joystickDir) {
        joystickDir = newDir;
        if (joystickMoveInterval) { clearInterval(joystickMoveInterval); joystickMoveInterval = null; }
        joystickSendMove();
        joystickMoveInterval = setInterval(joystickSendMove, 100);
      }
    });

    joystickBase.addEventListener('pointerup', function (e) { joystickStop(); });
    joystickBase.addEventListener('pointercancel', function (e) { joystickStop(); });
```

- [ ] **Step 3: Test joystick in browser — drag in all 4 directions, verify character moves on presenter screen. Verify knob returns to centre on release.**

- [ ] **Step 4: Commit**

```bash
git add audience.html
git commit -m "feat: virtual joystick replaces D-pad, tracks facingDir"
```

---

## Task 5: audience.html — DYTT! button JS

**Files:**
- Modify: `audience.html` (inline script)

- [ ] **Step 1: Add push button JS after the joystick code**

```js
    // ---- DYTT! push button ----
    var btnPush = document.getElementById('btn-push');
    var pushCooldownTimer = null;

    btnPush.addEventListener('click', function () {
      if (btnPush.classList.contains('cooldown')) return;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'audience-push', facingDir: facingDir }));
      }
      btnPush.classList.add('cooldown');
      pushCooldownTimer = setTimeout(function () {
        btnPush.classList.remove('cooldown');
      }, 1500);
    });
```

- [ ] **Step 2: Handle `audience-push-miss` in the WebSocket message handler**

In the `ws.addEventListener('message', ...)` handler, add after the existing `audience-update` case:

```js
        if (data && data.type === 'audience-push-miss') {
          btnPush.classList.remove('shake');
          // force reflow to restart animation
          void btnPush.offsetWidth;
          btnPush.classList.add('shake');
          btnPush.addEventListener('animationend', function () {
            btnPush.classList.remove('shake');
          }, { once: true });
        }
```

- [ ] **Step 3: Test in browser — tap DYTT!, verify cooldown visual. Open two audience tabs, push toward the other character, verify shake animation on presenter screen.**

- [ ] **Step 4: Commit**

```bash
git add audience.html
git commit -m "feat: DYTT! push button with 1500ms cooldown and miss-shake animation"
```

---

## Task 6: audience.html — Radial emote wheel JS

**Files:**
- Modify: `audience.html` (inline script)

- [ ] **Step 1: Remove old emote grid JS and HTML, then add wheel build code**

First, in `audience.html`, remove the HTML `<div class="section-label">Emote</div>` and `<div id="emote-grid"></div>` lines (lines 409–410 in the original file — they appear inside `#view-main` above the D-pad block, which was already removed in Task 3).

Second, in the inline script, remove the entire `// ---- Build emote buttons ----` section (original lines 507–518):
```js
    // ---- Build emote buttons ----
    var emoteGrid = document.getElementById('emote-grid');
    (window.AUDIENCE_EMOTES || []).forEach(function (e) {
      var btn = document.createElement('button');
      btn.className = 'emote-btn';
      btn.textContent = e.emoji;
      btn.title = e.id;
      btn.addEventListener('click', function () {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'audience-emote', emoteId: e.id }));
      });
      emoteGrid.appendChild(btn);
    });
```

Then add the wheel item build code and preview row in place:

```js
    // ---- Build radial wheel ----
    var wheelOverlay = document.getElementById('emote-wheel-overlay');
    var wheelBg = document.getElementById('emote-wheel-bg');
    var WHEEL_EMOTES = window.AUDIENCE_EMOTES || [];
    var WHEEL_SLOTS = 6;
    var WHEEL_RADIUS = 56; // px from centre to icon centre
    var WHEEL_VISUAL_R = 80; // for clamping overlay centre

    var wheelItems = [];
    for (var wi = 0; wi < WHEEL_SLOTS; wi++) {
      var angle = (wi * 60 - 90) * Math.PI / 180; // 0° = top
      var item = document.createElement('div');
      item.className = 'emote-wheel-item' + (wi >= WHEEL_EMOTES.length ? ' empty' : '');
      if (wi < WHEEL_EMOTES.length) item.textContent = WHEEL_EMOTES[wi].emoji;
      // Position relative to overlay centre; set via wheelCx/Cy at open time
      wheelItems.push({ el: item, angle: angle, emote: WHEEL_EMOTES[wi] || null });
      wheelOverlay.appendChild(item);
    }

    // Mini emote preview (first 4 emotes)
    var emotePreviewRow = document.getElementById('emote-preview');
    WHEEL_EMOTES.slice(0, 4).forEach(function (e) {
      var dot = document.createElement('span');
      dot.className = 'emote-preview-dot';
      dot.textContent = e.emoji;
      emotePreviewRow.appendChild(dot);
    });
```

- [ ] **Step 2: Add wheel open/selection logic**

```js
    // ---- Radial wheel logic ----
    var btnEmote = document.getElementById('btn-emote');
    var wheelOpen = false;
    var wheelCx = 0, wheelCy = 0;
    var wheelHoldTimer = null;
    var wheelPointerId = null;
    var wheelStartX = 0, wheelStartY = 0;
    var highlightedIdx = -1;
    var WHEEL_HOLD_MS = 200;
    var WHEEL_CANCEL_DIST = 8;
    var WHEEL_DEADZONE = 20;

    function openWheel(cx, cy) {
      wheelOpen = true;
      // Clamp centre so wheel stays on screen
      var vw = window.innerWidth, vh = window.innerHeight;
      wheelCx = Math.min(Math.max(cx, WHEEL_VISUAL_R), vw - WHEEL_VISUAL_R);
      wheelCy = Math.min(Math.max(cy, WHEEL_VISUAL_R), vh - WHEEL_VISUAL_R);
      wheelBg.style.left = wheelCx + 'px';
      wheelBg.style.top  = wheelCy + 'px';
      wheelItems.forEach(function (item) {
        var ix = wheelCx + Math.cos(item.angle) * WHEEL_RADIUS;
        var iy = wheelCy + Math.sin(item.angle) * WHEEL_RADIUS;
        item.el.style.left = ix + 'px';
        item.el.style.top  = iy + 'px';
        item.el.classList.remove('highlighted');
      });
      wheelOverlay.classList.add('open');
    }

    function closeWheel() {
      wheelOpen = false;
      highlightedIdx = -1;
      wheelOverlay.classList.remove('open');
      wheelItems.forEach(function (item) { item.el.classList.remove('highlighted'); });
    }

    function updateWheelHighlight(px, py) {
      var dx = px - wheelCx, dy = py - wheelCy;
      var dist = Math.hypot(dx, dy);
      if (dist < WHEEL_DEADZONE) {
        if (highlightedIdx !== -1) {
          wheelItems[highlightedIdx].el.classList.remove('highlighted');
          highlightedIdx = -1;
        }
        return;
      }
      var angle = Math.atan2(dy, dx);
      var best = -1, bestDiff = Infinity;
      wheelItems.forEach(function (item, i) {
        if (!item.emote) return;
        var diff = Math.abs(((angle - item.angle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      });
      if (best !== highlightedIdx) {
        if (highlightedIdx !== -1) wheelItems[highlightedIdx].el.classList.remove('highlighted');
        highlightedIdx = best;
        if (best !== -1) wheelItems[best].el.classList.add('highlighted');
      }
    }

    btnEmote.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      btnEmote.setPointerCapture(e.pointerId);
      wheelPointerId = e.pointerId;
      wheelStartX = e.clientX;
      wheelStartY = e.clientY;
      wheelHoldTimer = setTimeout(function () {
        // Transfer pointer capture to overlay
        btnEmote.releasePointerCapture(wheelPointerId);
        openWheel(wheelStartX, wheelStartY);
        wheelOverlay.setPointerCapture(wheelPointerId);
      }, WHEEL_HOLD_MS);
    });

    btnEmote.addEventListener('pointermove', function (e) {
      if (!wheelHoldTimer) return;
      if (Math.hypot(e.clientX - wheelStartX, e.clientY - wheelStartY) > WHEEL_CANCEL_DIST) {
        clearTimeout(wheelHoldTimer);
        wheelHoldTimer = null;
      }
    });

    btnEmote.addEventListener('pointerup', function (e) {
      if (wheelHoldTimer) { clearTimeout(wheelHoldTimer); wheelHoldTimer = null; }
    });

    btnEmote.addEventListener('pointercancel', function (e) {
      if (wheelHoldTimer) { clearTimeout(wheelHoldTimer); wheelHoldTimer = null; }
    });

    wheelOverlay.addEventListener('pointermove', function (e) {
      if (!wheelOpen) return;
      updateWheelHighlight(e.clientX, e.clientY);
    });

    wheelOverlay.addEventListener('pointerup', function (e) {
      if (!wheelOpen) return;
      if (highlightedIdx !== -1 && wheelItems[highlightedIdx].emote) {
        var emoteId = wheelItems[highlightedIdx].emote.id;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'audience-emote', emoteId: emoteId }));
        }
      }
      closeWheel();
    });

    wheelOverlay.addEventListener('pointercancel', function (e) {
      closeWheel();
    });
```

- [ ] **Step 3: Test in browser — hold emote button 200ms, verify wheel appears. Slide to an emote, release, verify emote appears on presenter screen. Tap briefly, verify wheel does NOT open.**

- [ ] **Step 4: Commit**

```bash
git add audience.html
git commit -m "feat: radial emote wheel replaces flat emote grid"
```

---

## Task 7: Final integration check

- [ ] **Step 1: Build dist**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 2: Full manual smoke test**

1. Start server: `node server.js`
2. Open presenter: `http://localhost:8080/index.html`
3. Open audience: `http://localhost:8080/audience.html` — join with a character
4. Open second audience tab — join with a different character
5. Joystick: drag → character moves on presenter screen ✓
6. `facingDir`: drag left → character moves left; drag right → moves right ✓
7. DYTT! toward the other character (same y) → other character jumps on presenter screen ✓
8. DYTT! again within 1500ms → button grayed out, no message sent ✓
9. DYTT! away from other character (or nothing nearby) → button shakes ✓
10. Hold emote button → radial wheel appears ✓
11. Slide to emote, release → emote bubble appears on presenter ✓
12. Tap emote briefly → wheel does NOT open ✓

- [ ] **Step 3: Commit if any fixes made, otherwise done**

```bash
git add -p
git commit -m "fix: integration fixes from smoke test"
```
