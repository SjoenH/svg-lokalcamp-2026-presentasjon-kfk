(function () {
  'use strict';

  let peer;
  let connections = [];

  function init() {
    peer = new Peer();

    peer.on('open', function (id) {
      var remoteUrl = new URL('remote.html?id=' + id, location.href).href;
      var urlEl = document.getElementById('remote-url');
      var qrEl = document.getElementById('remote-qr');
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
      conn.on('open', function () { sendStateTo(conn); });
      conn.on('data', function (data) {
        if (data.action === 'next') Reveal.next();
        else if (data.action === 'prev') Reveal.prev();
      });
      conn.on('close', function () {
        connections = connections.filter(function (c) { return c !== conn; });
      });
    });

    Reveal.addEventListener('slidechanged', broadcastState);
  }

  function getState() {
    var idx = Reveal.getIndices();
    var slide = Reveal.getCurrentSlide();
    var title = slide ? (slide.querySelector('h1,h2,h3') || {}).textContent || '' : '';
    return { type: 'state', h: idx.h, v: idx.v || 0, total: Reveal.getTotalSlides(), title: title.trim() };
  }

  function sendStateTo(conn) {
    if (conn.open) conn.send(getState());
  }

  function broadcastState() {
    var state = getState();
    connections.forEach(function (conn) { if (conn.open) conn.send(state); });
  }

  // Trykk R for å vise/skjule remote-overlay
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var overlay = document.getElementById('remote-overlay');
      if (overlay) overlay.hidden = !overlay.hidden;
    }
  });

  // Klikk på bakgrunnen eller ✕ for å lukke
  var overlay = document.getElementById('remote-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target === overlay) overlay.hidden = true;
    });
    var closeBtn = document.getElementById('remote-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        overlay.hidden = true;
      });
    }
  }

  function start() {
    if (window.Reveal && Reveal.isReady()) init();
    else if (window.Reveal) Reveal.addEventListener('ready', init);
    else setTimeout(start, 200);
  }

  start();
})();
