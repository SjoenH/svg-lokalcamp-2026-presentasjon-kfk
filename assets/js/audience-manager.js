(function () {
  'use strict';

  // Map of clientId → { name, charId, x, y, bubbleTimeout }
  var audienceMembers = {};

  // ---- Stats tracking ----
  var stats = {
    peakCount: 0,
    totalJoins: 0,
    sentences: {},   // sentenceId → count
    emotes: {},      // emoteId → count
    totalMoves: 0,
    activity: {},    // clientId → { name, charId, count }
  };

  function trackActivity(clientId) {
    if (!stats.activity[clientId]) {
      var m = audienceMembers[clientId];
      stats.activity[clientId] = { name: m ? m.name : '?', charId: m ? m.charId : '', count: 0 };
    }
    stats.activity[clientId].count++;
  }

  var wrap = document.getElementById('audience-overlay');

  // ---- Build a .party-slot element ----
  function buildSlot(clientId, member) {
    var char = (window.AUDIENCE_CHARACTERS || []).find(function (c) { return c.id === member.charId; });
    if (!char) return null;

    var slot = document.createElement('div');
    slot.className = 'party-slot';
    slot.dataset.connId = clientId;

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

  // ---- Position a slot based on member x,y ----
  function positionSlot(clientId) {
    var member = audienceMembers[clientId];
    if (!member) return;
    var slot = wrap.querySelector('.party-slot[data-conn-id="' + clientId + '"]');
    if (!slot) return;
    slot.style.left = member.x + '%';
    slot.style.bottom = member.y + '%';
  }

  // ---- Add a new slot to the overlay ----
  function addSlot(clientId) {
    var slot = buildSlot(clientId, audienceMembers[clientId]);
    if (!slot) return;
    wrap.appendChild(slot);
    positionSlot(clientId);
  }

  // ---- Speech bubble ----
  function showBubble(clientId, text) {
    var member = audienceMembers[clientId];
    if (!member) return;
    var slot = wrap.querySelector('.party-slot[data-conn-id="' + clientId + '"]');
    if (!slot) return;
    var bubble = slot.querySelector('.party-bubble');
    if (!bubble) return;

    if (member.bubbleTimeout) {
      clearTimeout(member.bubbleTimeout);
      bubble.classList.remove('visible');
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
  function showEmote(clientId, emoji) {
    var slot = wrap.querySelector('.party-slot[data-conn-id="' + clientId + '"]');
    if (!slot) return;
    var rect = slot.getBoundingClientRect();
    var el = document.createElement('div');
    el.className = 'floating-emote';
    el.textContent = emoji;
    el.style.position = 'fixed';
    el.style.left = Math.round(rect.left + rect.width * (0.15 + Math.random() * 0.7)) + 'px';
    el.style.top = Math.round(rect.top) + 'px';
    document.body.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  function wsSend(data) {
    if (window.presenterWS && window.presenterWS.readyState === WebSocket.OPEN) {
      window.presenterWS.send(JSON.stringify(data));
    }
  }

  function broadcastAudienceUpdate() {
    var total = Object.keys(audienceMembers).length;
    wsSend({ type: 'audience-update', totalMembers: total });
  }

  // ---- Handle incoming WebSocket messages from server ----
  function handleMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'stats-restore') {
      var s = data.stats;
      if (!s) return;
      stats.peakCount   = s.peakCount   || 0;
      stats.totalJoins  = s.totalJoins  || 0;
      stats.totalMoves  = s.totalMoves  || 0;
      stats.sentences   = s.sentences   || {};
      stats.emotes      = s.emotes      || {};
      stats.activity    = s.activity    || {};
      return;
    }

    if (data.type === 'audience-join') {
      var clientId = data.clientId;
      var name = String(data.name || 'Anonym').trim().slice(0, 16) || 'Anonym';
      var charId = String(data.charId || '');
      var validChar = (window.AUDIENCE_CHARACTERS || []).some(function (c) { return c.id === charId; });
      if (!validChar) return;

      audienceMembers[clientId] = {
        name: name,
        charId: charId,
        x: typeof data.x === 'number' ? data.x : 50,
        y: typeof data.y === 'number' ? data.y : 5,
        bubbleTimeout: null,
      };

      stats.totalJoins++;
      stats.activity[clientId] = { name: name, charId: charId, count: 0 };
      var currentCount = Object.keys(audienceMembers).length;
      if (currentCount > stats.peakCount) stats.peakCount = currentCount;

      addSlot(clientId);
      wsSend({ type: 'audience-ack', clientId: clientId, totalMembers: currentCount });
      broadcastAudienceUpdate();

    } else if (data.type === 'audience-speak') {
      var sentenceId = String(data.sentenceId || '');
      var sentence = (window.AUDIENCE_SENTENCES || []).find(function (s) { return s.id === sentenceId; });
      if (sentence) {
        showBubble(data.clientId, sentence.text);
        stats.sentences[sentenceId] = (stats.sentences[sentenceId] || 0) + 1;
        trackActivity(data.clientId);
      }

    } else if (data.type === 'audience-emote') {
      var emoteId = String(data.emoteId || '');
      var emote = (window.AUDIENCE_EMOTES || []).find(function (e) { return e.id === emoteId; });
      if (emote) {
        showEmote(data.clientId, emote.emoji);
        stats.emotes[emoteId] = (stats.emotes[emoteId] || 0) + 1;
        trackActivity(data.clientId);
      }

    } else if (data.type === 'audience-position') {
      var member = audienceMembers[data.clientId];
      if (member) {
        member.x = data.x;
        member.y = data.y;
        positionSlot(data.clientId);
        stats.totalMoves++;
        trackActivity(data.clientId);
      }

    } else if (data.type === 'audience-disconnect') {
      var clientId = data.clientId;
      var member = audienceMembers[clientId];
      if (!member) return;
      if (member.bubbleTimeout) clearTimeout(member.bubbleTimeout);

      var slot = wrap.querySelector('.party-slot[data-conn-id="' + clientId + '"]');
      delete audienceMembers[clientId];
      broadcastAudienceUpdate();

      if (slot) {
        slot.classList.add('party-slot-exit');
        slot.addEventListener('animationend', function () { slot.remove(); }, { once: true });
      }
    }
  }

  // ---- QR code for the join slide + persistent corner QR ----
  function setupQR() {
    var isPreview = new URLSearchParams(location.search).has('preview');

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

    var cornerWrap = document.getElementById('audience-qr-corner');
    if (isPreview) {
      if (cornerWrap) cornerWrap.style.display = 'none';
      return;
    }

    var cornerEl = document.getElementById('audience-qr-corner-code');
    if (cornerEl && window.QRCode) {
      new QRCode(cornerEl, {
        text: AUDIENCE_URL,
        width: 150,
        height: 150,
        colorDark: '#1a1a2e',
        colorLight: '#ffffff',
      });
    }
  }

  // ---- Init: wait for presenterWS to be exposed by remote-control.js ----
  function init() {
    if (window.presenterWS) {
      window.presenterWS.addEventListener('message', function (e) {
        var data;
        try { data = JSON.parse(e.data); } catch { return; }
        handleMessage(data);
      });
    } else {
      setTimeout(init, 100);
    }
  }

  document.addEventListener('DOMContentLoaded', setupQR);

  function start() {
    if (window.Reveal && Reveal.isReady()) init();
    else if (window.Reveal) Reveal.addEventListener('ready', init);
    else setTimeout(start, 200);
  }
  start();

  window.AudienceManager = { handleMessage: handleMessage };
  window.AudienceStats = stats;

  // ---- Stats slide live rendering ----
  function topEntry(obj) {
    var keys = Object.keys(obj);
    if (!keys.length) return null;
    return keys.reduce(function (a, b) { return obj[a] >= obj[b] ? a : b; });
  }

  function populateStatsSlide() {
    var totalMessages = Object.values(stats.sentences).reduce(function (a, b) { return a + b; }, 0)
                      + Object.values(stats.emotes).reduce(function (a, b) { return a + b; }, 0);

    var p = document.querySelector('#stat-participants .stat-number');
    var m = document.querySelector('#stat-messages .stat-number');
    var mv = document.querySelector('#stat-moves .stat-number');
    if (p) p.textContent = stats.peakCount || 0;
    if (m) m.textContent = totalMessages;
    if (mv) mv.textContent = stats.totalMoves;

    var topSentId = topEntry(stats.sentences);
    var topSentEl = document.querySelector('#stat-top-sentence .stat-highlight');
    if (topSentEl) {
      if (topSentId) {
        var sent = (window.AUDIENCE_SENTENCES || []).find(function (x) { return x.id === topSentId; });
        topSentEl.textContent = sent ? sent.text : topSentId;
      } else {
        topSentEl.textContent = 'ingen';
      }
    }

    var topEmoteId = topEntry(stats.emotes);
    var emojiEl = document.querySelector('#stat-top-emote .stat-emoji');
    var emoteCountEl = document.querySelector('#stat-top-emote .stat-highlight');
    if (topEmoteId) {
      var emote = (window.AUDIENCE_EMOTES || []).find(function (x) { return x.id === topEmoteId; });
      if (emojiEl) emojiEl.textContent = emote ? emote.emoji : topEmoteId;
      if (emoteCountEl) emoteCountEl.textContent = stats.emotes[topEmoteId] + '×';
    }

    var activityCounts = {};
    Object.keys(stats.activity).forEach(function (k) { activityCounts[k] = stats.activity[k].count; });
    var mvpId = topEntry(activityCounts);
    var mvpEl = document.querySelector('#stat-mvp .stat-highlight');
    if (mvpEl) {
      if (mvpId && stats.activity[mvpId] && stats.activity[mvpId].count > 0) {
        mvpEl.textContent = stats.activity[mvpId].name + ' (' + stats.activity[mvpId].count + ' interaksjonar)';
      } else {
        mvpEl.textContent = 'ingen interaksjonar endå';
      }
    }
  }

  var statsInterval = null;

  function isStatsSlide(slide) {
    return slide && slide.id === 'slide-audience-stats';
  }

  function initStatsSlide() {
    if (window.Reveal) {
      Reveal.addEventListener('slidechanged', function (e) {
        if (isStatsSlide(e.currentSlide)) {
          populateStatsSlide();
          if (!statsInterval) statsInterval = setInterval(populateStatsSlide, 1000);
        } else {
          clearInterval(statsInterval);
          statsInterval = null;
        }
      });
      if (isStatsSlide(Reveal.getCurrentSlide())) {
        populateStatsSlide();
        if (!statsInterval) statsInterval = setInterval(populateStatsSlide, 1000);
      }
    }
  }

  function startStats() {
    if (window.Reveal && Reveal.isReady()) initStatsSlide();
    else if (window.Reveal) Reveal.addEventListener('ready', initStatsSlide);
    else setTimeout(startStats, 200);
  }
  startStats();
})();
