// Safe-zone overlay — toggle med Z
// Viser 90% av 1920x1080 (action safe for 16:9 projektor)
(function () {
  const W = 1920, H = 1080, SAFE = 0.9;
  const sw = W * SAFE, sh = H * SAFE;
  const ox = (W - sw) / 2, oy = (H - sh) / 2;

  const overlay = document.createElement('div');
  overlay.id = 'safe-zone-overlay';
  overlay.style.cssText = `
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    display: none;
  `;
  overlay.innerHTML = `
    <div style="
      position:absolute;
      left:${ox}px; top:${oy}px;
      width:${sw}px; height:${sh}px;
      border: 2px dashed rgba(255, 60, 0, 0.7);
      box-sizing: border-box;
    "></div>
    <div style="
      position:absolute;
      left:2px; top:2px; right:2px; bottom:2px;
      border: 1px dashed rgba(255,255,255,0.2);
      box-sizing: border-box;
    "></div>
    <div style="
      position:absolute;
      left:${ox}px; top:${oy - 20}px;
      font-size:14px; font-family:monospace;
      color:rgba(255,60,0,0.7);
      background:rgba(0,0,0,0.4);
      padding:2px 6px;
      border-radius:3px;
    ">safe zone 90%</div>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    const slides = document.querySelector('.slides');
    if (slides) slides.appendChild(overlay);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') {
      overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
    }
  });
})();
