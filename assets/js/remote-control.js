(function () {
  'use strict';

  let peer;
  let connections = [];
  let timerStartedAt = null;

  function init() {
    peer = new Peer('kfk-lokalcamp-2026', { config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]}});

    peer.on('open', function (id) {
      var remoteUrl = new URL('remote.html?id=' + id, location.href).href;
      var urlEl = document.getElementById('remote-url');
      var qrEl = document.getElementById('remote-qr');
      qrEl.innerHTML = '';
      if (urlEl) {
        urlEl.textContent = remoteUrl;
        urlEl.href = remoteUrl;
      }
      if (qrEl && window.QRCode) {
        new QRCode(qrEl, {
          text: remoteUrl,
          width: 200,
          height: 200,
          colorDark: '#1a1a2e',
          colorLight: '#f0f0f0',
        });
      }
    });

    peer.on('connection', function (conn) {
      connections.push(conn);
      conn.on('open', function () {
        sendStateTo(conn);
        if (timerStartedAt !== null) conn.send({ type: 'timer', startedAt: timerStartedAt });
      });
      conn.on('data', function (data) {
        if (data.action === 'next') Reveal.next();
        else if (data.action === 'prev') Reveal.prev();
        else if (data.action === 'timer-start') {
          timerStartedAt = Date.now();
          connections.forEach(function (c) { if (c.open) c.send({ type: 'timer', startedAt: timerStartedAt }); });
        } else if (data.action === 'timer-stop') {
          timerStartedAt = null;
          connections.forEach(function (c) { if (c.open) c.send({ type: 'timer-stop' }); });
        }
      });
      conn.on('close', function () {
        connections = connections.filter(function (c) { return c !== conn; });
      });
    });

    Reveal.addEventListener('slidechanged', function (e) {
      broadcastState();
      if (e.indexh === 0) {
        timerStartedAt = null;
        connections.forEach(function (c) { if (c.open) c.send({ type: 'timer-stop' }); });
      } else if (e.previousSlide && e.previousSlide === Reveal.getSlides()[0]) {
        timerStartedAt = Date.now();
        connections.forEach(function (c) { if (c.open) c.send({ type: 'timer', startedAt: timerStartedAt }); });
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
    if (conn.open) conn.send(getState());
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

  start();
})();
