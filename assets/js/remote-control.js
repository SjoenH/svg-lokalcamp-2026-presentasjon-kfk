(function () {
  'use strict';

  var isPreview = new URLSearchParams(location.search).has('preview');

  let peer;
  let connections = [];
  let timerStartedAt = null;
  let fontScale = 1.0;
  let timerTotal = 900;

  let funPrevAudio = null;
  let funDismissTimeout = null;
  const funAudio = {};
  FUN_CONFIG.forEach(function (cfg) { funAudio[cfg.id] = new Audio(cfg.src); });

  var peerStatus = document.createElement('div');
  peerStatus.id = 'peer-status';
  peerStatus.style.cssText = 'position:fixed;bottom:0.7rem;left:0.9rem;font-size:0.6rem;font-family:system-ui,sans-serif;color:rgba(255,255,255,0.3);pointer-events:none;z-index:9999;letter-spacing:0.03em;';
  document.body.appendChild(peerStatus);

  function updatePeerStatus() {
    var open = connections.filter(function (c) { return c.open; }).length;
    peerStatus.textContent = open > 0 ? '⬤ ' + open + ' remote' + (open > 1 ? 's' : '') : '○ ingen remote';
    peerStatus.style.color = open > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.2)';
  }

  updatePeerStatus();

  var REMOTE_URL = new URL('remote.html?id=kfk-lokalcamp-2026', location.href).href;

  document.addEventListener('DOMContentLoaded', function () {
    var urlEl = document.getElementById('remote-url');
    var qrEl = document.getElementById('remote-qr');
    if (urlEl) { urlEl.textContent = REMOTE_URL; urlEl.href = REMOTE_URL; }
    if (qrEl && window.QRCode) {
      new QRCode(qrEl, { text: REMOTE_URL, width: 200, height: 200, colorDark: '#1a1a2e', colorLight: '#f0f0f0' });
    }
  });

  function init() {
    peer = new Peer('kfk-lokalcamp-2026', { config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]}});

    peer.on('open', function () {
      updatePeerStatus();
    });

    peer.on('error', function (err) {
      if (err.type === 'unavailable-id') {
        // ID opptatt fra forrige sesjon — vent og prøv på nytt
        setTimeout(function () { peer.destroy(); init(); }, 2000);
      }
    });

    peer.on('connection', function (conn) {
      connections.push(conn);
      conn.on('open', function () {
        updatePeerStatus();
        sendStateTo(conn);
        if (timerStartedAt !== null) conn.send({ type: 'timer', startedAt: timerStartedAt, total: timerTotal });
      });
      conn.on('data', function (data) {
        if (data.action === 'next') Reveal.next();
        else if (data.action === 'prev') Reveal.prev();
        else if (data.action === 'timer-start') {
          timerStartedAt = Date.now();
          connections.forEach(function (c) { if (c.open) c.send({ type: 'timer', startedAt: timerStartedAt, total: timerTotal }); });
        } else if (data.action === 'timer-stop') {
          timerStartedAt = null;
          connections.forEach(function (c) { if (c.open) c.send({ type: 'timer-stop' }); });
        } else if (data.action === 'font-scale') {
          fontScale = data.value;
          var revealEl = document.querySelector('.reveal');
          if (revealEl) revealEl.style.fontSize = (fontScale * 2) + 'rem';
          connections.forEach(function (c) { if (c.open) c.send({ type: 'font-scale', value: fontScale }); });
        } else if (data.action === 'timer-duration') {
          timerTotal = data.total;
          connections.forEach(function (c) { if (c.open) c.send({ type: 'timer-duration', total: timerTotal }); });
        } else if (data.action === 'fun') {
          var cfg = FUN_CONFIG.find(function (c) { return c.id === data.id; });
          if (!cfg) return;
          if (funPrevAudio) { funPrevAudio.pause(); funPrevAudio.currentTime = 0; }
          if (funDismissTimeout) clearTimeout(funDismissTimeout);
          var audio = funAudio[data.id];
          audio.currentTime = 0;
          audio.play().catch(function () {});
          funPrevAudio = audio;
          var overlay = document.getElementById('fun-overlay');
          var progressEl = overlay.querySelector('.fun-progress');
          overlay.querySelector('.fun-emoji').textContent = cfg.emoji;
          overlay.querySelector('.fun-text').textContent  = cfg.text;
          progressEl.classList.remove('animated');
          void progressEl.offsetWidth;
          progressEl.classList.add('animated');
          overlay.classList.add('visible');
          funDismissTimeout = setTimeout(function () { overlay.classList.remove('visible'); }, 3000);
        }
      });
      conn.on('close', function () {
        connections = connections.filter(function (c) { return c !== conn; });
        updatePeerStatus();
      });
    });

    Reveal.addEventListener('slidechanged', function (e) {
      broadcastState();
      if (e.indexh === 0) {
        timerStartedAt = null;
        connections.forEach(function (c) { if (c.open) c.send({ type: 'timer-stop' }); });
      } else if (e.previousSlide && e.previousSlide === Reveal.getSlides()[0]) {
        timerStartedAt = Date.now();
        connections.forEach(function (c) { if (c.open) c.send({ type: 'timer', startedAt: timerStartedAt, total: timerTotal }); });
      }
    });
  }

  function getState() {
    var idx = Reveal.getIndices();
    var slide = Reveal.getCurrentSlide();
    var title = slide ? (slide.querySelector('h1,h2,h3') || {}).textContent || '' : '';
    var notes = slide ? (slide.querySelector('aside.notes') || {}).textContent || '' : '';
    return { type: 'state', h: idx.h, v: idx.v || 0, total: Reveal.getTotalSlides(), title: title.trim(), notes: notes.trim() };
  }

  function sendStateTo(conn) {
    if (conn.open) {
      conn.send(getState());
      conn.send({ type: 'font-scale', value: fontScale });
      conn.send({ type: 'timer-duration', total: timerTotal });
    }
  }

  function broadcastState() {
    var state = getState();
    connections.forEach(function (conn) { if (conn.open) conn.send(state); });
  }

  var dialog = document.getElementById('remote-dialog');
  var closeBtn = document.getElementById('remote-close');

  if (closeBtn) closeBtn.addEventListener('click', function () { dialog.close(); });

  // Trykk R for å åpne/lukke
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (dialog.open) dialog.close();
      else dialog.showModal();
    }
  });

  function start() {
    if (window.Reveal && Reveal.isReady()) init();
    else if (window.Reveal) Reveal.addEventListener('ready', init);
    else setTimeout(start, 200);
  }

  if (!isPreview) {
    start();
  }

  // postMessage handler — lets a parent page navigate this Reveal instance
  (function () {
    var pendingGoto = null;

    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'reveal-goto') return;
      var h = e.data.h || 0;
      var v = e.data.v || 0;
      if (window.Reveal && Reveal.isReady()) {
        Reveal.slide(h, v);
      } else {
        pendingGoto = { h: h, v: v };
      }
    });

    function drainPending() {
      if (pendingGoto) { Reveal.slide(pendingGoto.h, pendingGoto.v); pendingGoto = null; }
    }

    if (window.Reveal && Reveal.isReady()) { /* already ready */ }
    else if (window.Reveal) { Reveal.addEventListener('ready', drainPending); }
    else {
      var poll = setInterval(function () {
        if (window.Reveal) {
          clearInterval(poll);
          if (Reveal.isReady()) drainPending();
          else Reveal.addEventListener('ready', drainPending);
        }
      }, 100);
    }
  })();
})();
