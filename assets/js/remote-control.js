(function () {
  'use strict';

  var isPreview = new URLSearchParams(location.search).has('preview');

  var ws;
  var remoteCount = 0;
  var timerStartedAt = null;
  var fontScale = 1.0;
  var timerTotal = 900;

  var funPrevAudio = null;
  var funDismissTimeout = null;
  const funAudio = {};
  FUN_CONFIG.forEach(function (cfg) { funAudio[cfg.id] = new Audio(cfg.src); });

  var peerStatus = document.createElement('div');
  peerStatus.id = 'peer-status';
  peerStatus.style.cssText = 'position:fixed;bottom:0.7rem;left:0.9rem;font-size:0.6rem;font-family:system-ui,sans-serif;color:rgba(255,255,255,0.3);pointer-events:none;z-index:9999;letter-spacing:0.03em;';
  document.body.appendChild(peerStatus);

  function updatePeerStatus() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      peerStatus.textContent = '○ ingen server';
      peerStatus.style.color = 'rgba(255,255,255,0.2)';
      return;
    }
    peerStatus.textContent = remoteCount > 0
      ? '⬤ ' + remoteCount + ' remote' + (remoteCount > 1 ? 's' : '')
      : '⬤ server ok';
    peerStatus.style.color = remoteCount > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.3)';
  }

  updatePeerStatus();

  var REMOTE_URL = new URL('remote.html', location.href).href;

  document.addEventListener('DOMContentLoaded', function () {
    var urlEl = document.getElementById('remote-url');
    var qrEl = document.getElementById('remote-qr');
    if (urlEl) { urlEl.textContent = REMOTE_URL; urlEl.href = REMOTE_URL; }
    if (qrEl && window.QRCode) {
      new QRCode(qrEl, { text: REMOTE_URL, width: 200, height: 200, colorDark: '#1a1a2e', colorLight: '#f0f0f0' });
    }
  });

  function wsUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function wsSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  function init() {
    ws = new WebSocket(wsUrl());

    ws.addEventListener('open', function () {
      wsSend({ type: 'presenter-init' });
      window.presenterWS = ws;
      updatePeerStatus();
    });

    ws.addEventListener('message', function (e) {
      var data;
      try { data = JSON.parse(e.data); } catch { return; }

      if (data.type === 'connected') return;

      if (data.type === 'remote-count') {
        remoteCount = data.count || 0;
        updatePeerStatus();
        return;
      }

      // Audience messages → route to AudienceManager
      if (data.type === 'audience-join' || data.type === 'audience-speak' ||
          data.type === 'audience-emote' || data.type === 'audience-position' ||
          data.type === 'audience-disconnect' || data.type === 'stats-restore') {
        if (window.AudienceManager) window.AudienceManager.handleMessage(data);
        return;
      }

      // Remote control actions
      if (data.action === 'next') Reveal.next();
      else if (data.action === 'prev') Reveal.prev();
      else if (data.action === 'timer-start') {
        timerStartedAt = Date.now();
        wsSend({ type: 'timer', startedAt: timerStartedAt, total: timerTotal });
      } else if (data.action === 'timer-stop') {
        timerStartedAt = null;
        wsSend({ type: 'timer-stop' });
      } else if (data.action === 'font-scale') {
        fontScale = data.value;
        var revealEl = document.querySelector('.reveal');
        if (revealEl) revealEl.style.fontSize = (fontScale * 2) + 'rem';
        wsSend({ type: 'font-scale', value: fontScale });
      } else if (data.action === 'timer-duration') {
        timerTotal = data.total;
        wsSend({ type: 'timer-duration', total: timerTotal });
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

    ws.addEventListener('close', function () {
      window.presenterWS = null;
      remoteCount = 0;
      updatePeerStatus();
      setTimeout(init, 2000);
    });

    ws.addEventListener('error', function () {
      updatePeerStatus();
    });
  }

  function getState() {
    var idx = Reveal.getIndices();
    var slide = Reveal.getCurrentSlide();
    var title = slide ? (slide.querySelector('h1,h2,h3') || {}).textContent || '' : '';
    var notes = slide ? (slide.querySelector('aside.notes') || {}).textContent || '' : '';
    return { type: 'state', h: idx.h, v: idx.v || 0, total: Reveal.getTotalSlides(), title: title.trim(), notes: notes.trim() };
  }

  function broadcastState() {
    wsSend(getState());
    wsSend({ type: 'font-scale', value: fontScale });
    wsSend({ type: 'timer-duration', total: timerTotal });
  }

  function updateSlideMode() {
    var idx = Reveal.getIndices();
    var total = Reveal.getTotalSlides();
    var isFree = idx.h === 0 || idx.h === total - 1;
    wsSend({ type: 'slide-context', mode: isFree ? 'free' : 'strip' });
    document.body.classList.toggle('audience-free-mode', isFree);
  }

  function setupRevealListeners() {
    updateSlideMode();
    Reveal.addEventListener('slidechanged', function (e) {
      wsSend(getState());
      updateSlideMode();
      if (e.indexh === 0) {
        timerStartedAt = null;
        wsSend({ type: 'timer-stop' });
      } else if (e.previousSlide && e.previousSlide === Reveal.getSlides()[0]) {
        timerStartedAt = Date.now();
        wsSend({ type: 'timer', startedAt: timerStartedAt, total: timerTotal });
      }
    });
  }

  var dialog = document.getElementById('remote-dialog');
  var closeBtn = document.getElementById('remote-close');

  if (closeBtn) closeBtn.addEventListener('click', function () { dialog.close(); });

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (dialog.open) dialog.close();
      else dialog.showModal();
    }
  });

  function start() {
    if (window.Reveal && Reveal.isReady()) {
      init();
      setupRevealListeners();
    } else if (window.Reveal) {
      Reveal.addEventListener('ready', function () { init(); setupRevealListeners(); });
    } else {
      setTimeout(start, 200);
    }
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
