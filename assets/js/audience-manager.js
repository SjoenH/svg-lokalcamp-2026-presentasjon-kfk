(function () {
  'use strict';

  // Map of connId → { name, charId, position, conn, bubbleTimeout }
  var audienceMembers = {};
  var nextPosition = 0;

  var wrap = document.getElementById('party-bar-wrap');

  // ---- Slot width based on member count ----
  function updateSlotWidths() {
    var count = Object.keys(audienceMembers).length;
    var w = count <= 15 ? 60 : count <= 25 ? 48 : 38;
    wrap.style.setProperty('--party-slot-width', w + 'px');
  }

  // ---- Build a .party-slot element ----
  function buildSlot(connId, member) {
    var char = (window.AUDIENCE_CHARACTERS || []).find(function (c) { return c.id === member.charId; });
    if (!char) return null;

    var slot = document.createElement('div');
    slot.className = 'party-slot';
    slot.dataset.connId = connId;

    var bubble = document.createElement('div');
    bubble.className = 'party-bubble';
    slot.appendChild(bubble);

    var sprite = document.createElement('div');
    sprite.className = 'party-sprite anim-' + (char.anim || 'walk');
    sprite.style.boxShadow = char.shadow;
    slot.appendChild(sprite);

    var name = document.createElement('div');
    name.className = 'party-name';
    name.textContent = member.name;
    slot.appendChild(name);

    return slot;
  }

  // ---- Re-render the whole party bar ----
  function renderPartyBar() {
    // Sort members by position
    var sorted = Object.keys(audienceMembers).sort(function (a, b) {
      return audienceMembers[a].position - audienceMembers[b].position;
    });

    // Remove slots that are no longer present
    var existing = wrap.querySelectorAll('.party-slot');
    existing.forEach(function (el) {
      if (!audienceMembers[el.dataset.connId]) el.remove();
    });

    // Add/reorder slots
    sorted.forEach(function (connId, idx) {
      var member = audienceMembers[connId];
      var existing = wrap.querySelector('.party-slot[data-conn-id="' + connId + '"]');
      if (!existing) {
        var slot = buildSlot(connId, member);
        if (slot) wrap.appendChild(slot);
      }
    });

    // Reorder DOM to match sorted order
    sorted.forEach(function (connId) {
      var slot = wrap.querySelector('.party-slot[data-conn-id="' + connId + '"]');
      if (slot) wrap.appendChild(slot); // appendChild moves existing nodes
    });

    updateSlotWidths();
  }

  // ---- Speech bubble ----
  function showBubble(connId, text) {
    var member = audienceMembers[connId];
    if (!member) return;
    var slot = wrap.querySelector('.party-slot[data-conn-id="' + connId + '"]');
    if (!slot) return;
    var bubble = slot.querySelector('.party-bubble');
    if (!bubble) return;

    if (member.bubbleTimeout) {
      clearTimeout(member.bubbleTimeout);
      bubble.classList.remove('visible');
      // Brief pause to allow CSS transition to reset
      setTimeout(function () { showBubbleNow(bubble, text, member); }, 50);
    } else {
      showBubbleNow(bubble, text, member);
    }
  }

  function showBubbleNow(bubble, text, member) {
    bubble.textContent = text;
    bubble.classList.add('visible');
    member.bubbleTimeout = setTimeout(function () {
      bubble.classList.remove('visible');
      member.bubbleTimeout = null;
    }, 3000);
  }

  // ---- Floating emote ----
  function showEmote(connId, emoji) {
    var slot = wrap.querySelector('.party-slot[data-conn-id="' + connId + '"]');
    if (!slot) return;
    var el = document.createElement('div');
    el.className = 'floating-emote';
    el.textContent = emoji;
    // Random horizontal jitter within the slot
    el.style.left = Math.round(20 + Math.random() * 20) + '%';
    slot.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  // ---- Move character left/right ----
  function moveChar(connId, direction) {
    var member = audienceMembers[connId];
    if (!member) return;

    var sorted = Object.keys(audienceMembers).sort(function (a, b) {
      return audienceMembers[a].position - audienceMembers[b].position;
    });
    var idx = sorted.indexOf(connId);

    var swapId, tmp;
    if (direction === 'left' && idx > 0) {
      swapId = sorted[idx - 1];
      tmp = audienceMembers[swapId].position;
      audienceMembers[swapId].position = member.position;
      member.position = tmp;
      renderPartyBar();
    } else if (direction === 'right' && idx < sorted.length - 1) {
      swapId = sorted[idx + 1];
      tmp = audienceMembers[swapId].position;
      audienceMembers[swapId].position = member.position;
      member.position = tmp;
      renderPartyBar();
    }
  }

  // ---- Handle a new audience connection ----
  function handleConnection(conn) {
    conn.on('data', function (data) {
      if (!data || !data.type) return;

      if (data.type === 'audience-join') {
        var name = String(data.name || 'Anonym').trim().slice(0, 16) || 'Anonym';
        var charId = String(data.charId || '');
        var validChar = (window.AUDIENCE_CHARACTERS || []).some(function (c) { return c.id === charId; });
        if (!validChar) return;

        audienceMembers[conn.peer] = {
          name: name,
          charId: charId,
          position: nextPosition++,
          conn: conn,
          bubbleTimeout: null,
        };

        renderPartyBar();

        if (conn.open) {
          conn.send({ type: 'audience-ack', totalMembers: Object.keys(audienceMembers).length });
        }

        // Broadcast updated count to all audience members
        broadcastAudienceUpdate();

      } else if (data.type === 'audience-speak') {
        var sentenceId = String(data.sentenceId || '');
        var sentence = (window.AUDIENCE_SENTENCES || []).find(function (s) { return s.id === sentenceId; });
        if (sentence) showBubble(conn.peer, sentence.text);

      } else if (data.type === 'audience-emote') {
        var emoteId = String(data.emoteId || '');
        var emote = (window.AUDIENCE_EMOTES || []).find(function (e) { return e.id === emoteId; });
        if (emote) showEmote(conn.peer, emote.emoji);

      } else if (data.type === 'audience-move') {
        moveChar(conn.peer, data.direction === 'right' ? 'right' : 'left');
      }
    });

    conn.on('close', function () {
      var member = audienceMembers[conn.peer];
      if (!member) return;
      if (member.bubbleTimeout) clearTimeout(member.bubbleTimeout);
      delete audienceMembers[conn.peer];
      renderPartyBar();
      broadcastAudienceUpdate();
    });
  }

  function broadcastAudienceUpdate() {
    var total = Object.keys(audienceMembers).length;
    Object.values(audienceMembers).forEach(function (m) {
      if (m.conn && m.conn.open) {
        m.conn.send({ type: 'audience-update', totalMembers: total });
      }
    });
  }

  // ---- QR code for the join slide + persistent corner QR ----
  function setupQR() {
    var AUDIENCE_URL = new URL('audience.html', location.href).href;

    var qrEl = document.getElementById('audience-qr');
    var urlEl = document.getElementById('audience-join-url');
    if (urlEl) urlEl.textContent = AUDIENCE_URL;
    if (qrEl && window.QRCode) {
      new QRCode(qrEl, {
        text: AUDIENCE_URL,
        width: 200,
        height: 200,
        colorDark: '#1a1a2e',
        colorLight: '#f0f0f0',
      });
    }

    var cornerEl = document.getElementById('audience-qr-corner-code');
    if (cornerEl && window.QRCode) {
      new QRCode(cornerEl, {
        text: AUDIENCE_URL,
        width: 64,
        height: 64,
        colorDark: '#1a1a2e',
        colorLight: '#ffffff',
      });
    }
  }

  // ---- Init: wait for presenterPeer to be exposed by remote-control.js ----
  function init() {
    if (window.presenterPeer) {
      window.presenterPeer.on('connection', function (conn) {
        if (conn.label === 'audience') handleConnection(conn);
      });
    } else {
      setTimeout(init, 100);
    }
  }

  document.addEventListener('DOMContentLoaded', setupQR);

  // Wait for Reveal + remote-control.js to initialize
  function start() {
    if (window.Reveal && Reveal.isReady()) init();
    else if (window.Reveal) Reveal.addEventListener('ready', init);
    else setTimeout(start, 200);
  }
  start();

  window.AudienceManager = { handleConnection: handleConnection };
})();
