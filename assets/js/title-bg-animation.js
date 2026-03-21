// Background animation for .title-slide sections
// Floating ASCII symbols drift slowly behind slide content

const SYMBOLS = '{}[]()<>|=+-*/\\#·○×→←↑↓▲▼◆□■░▓│─┼'.split('');
const COUNT   = 80;
const W       = 1280;
const H       = 720;

let rafId       = null;
let canvas      = null;
let ctx         = null;
let particles   = [];
let styledChildren = [];

function createParticle() {
  return {
    x:          Math.random() * W,
    y:          Math.random() * H,
    ch:         SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    size:       10 + Math.floor(Math.random() * 13),
    alpha:      0.07 + Math.random() * 0.13,
    vx:         (Math.random() - 0.5) * 0.4,
    vy:         (Math.random() - 0.5) * 0.4,
    rot:        Math.random() * Math.PI * 2,
    rotV:       (Math.random() - 0.5) * 0.004,
    driftAngle: Math.random() * Math.PI * 2,
    driftSpeed: 0.15 + Math.random() * 0.25,
  };
}

function loop() {
  ctx.clearRect(0, 0, W, H);

  for (const p of particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = '#450d21';
    ctx.font        = `${p.size}px "DM Mono", monospace`;
    ctx.fillText(p.ch, 0, 0);
    ctx.restore();

    p.x   += p.vx + Math.cos(p.driftAngle) * p.driftSpeed;
    p.y   += p.vy + Math.sin(p.driftAngle) * p.driftSpeed;
    p.rot += p.rotV;
    p.driftAngle += 0.003;

    if (p.x < -30) p.x = W + 20;
    if (p.x > W + 30) p.x = -20;
    if (p.y < -30) p.y = H + 20;
    if (p.y > H + 30) p.y = -20;
  }

  rafId = requestAnimationFrame(loop);
}

function startAnimation(slideEl) {
  stopAnimation();

  canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  slideEl.insertBefore(canvas, slideEl.firstChild);
  ctx = canvas.getContext('2d');

  // Lift direct children (except canvas and aside) above the canvas
  styledChildren = [];
  for (const child of slideEl.children) {
    if (child === canvas || child.tagName === 'ASIDE') continue;
    child.style.position = 'relative';
    child.style.zIndex   = '1';
    styledChildren.push(child);
  }

  particles = Array.from({ length: COUNT }, createParticle);
  loop();
}

function stopAnimation() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  for (const child of styledChildren) {
    child.style.position = '';
    child.style.zIndex   = '';
  }
  styledChildren = [];
  if (canvas) {
    canvas.remove();
    canvas = null;
    ctx    = null;
  }
  particles = [];
}

function handleSlide(slideEl) {
  if (slideEl && slideEl.classList.contains('title-slide')) {
    startAnimation(slideEl);
  } else {
    stopAnimation();
  }
}

Reveal.on('ready',        e => handleSlide(e.currentSlide));
Reveal.on('slidechanged', e => handleSlide(e.currentSlide));
