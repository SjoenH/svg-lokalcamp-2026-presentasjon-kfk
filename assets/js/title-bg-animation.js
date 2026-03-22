// Background animation for .title-slide sections
// Boids flocking simulation with falcon predators

const COUNT          = 1000;
const EAGLE_COUNT    = 3;
let W                = window.innerWidth;
let H                = window.innerHeight;
const SPEED          = 1.4;
const EAGLE_SPEED    = 2.2;
const PERCEPTION     = 80;
const AVOID_RADIUS   = 28;
const FLEE_RADIUS    = 140;   // how far boids can sense an falcon
const COHESION       = 0.004;
const ALIGNMENT      = 0.06;
const SEPARATION     = 0.12;
const FLEE_FORCE     = 0.25;
const TEXT_FLEE_RADIUS  = 60;
const TEXT_FLEE_FORCE   = 0.3;
const MOUSE_FLEE_RADIUS = 100;
const MOUSE_FLEE_FORCE  = 0.4;
const CHAR_FLEE_RADIUS  = 130;
const CHAR_FLEE_FORCE   = 1.2;
const MAX_FORCE      = 0.06;
const EAGLE_TURN     = 0.03;  // how sharply falcons steer toward nearest boid
const COLOR          = '#450d21';
const EAGLE_COLOR    = '#ff303b';

const mouse = { x: -9999, y: -9999 };

let rafId          = null;
let canvas         = null;
let ctx            = null;
let boids          = [];
let falcons        = [];
let textRects      = [];
let styledChildren = [];
let charPositions  = [];
let charTick       = 0;

function createBoid() {
  const angle = Math.random() * Math.PI * 2;
  return {
    x:  Math.random() * W,
    y:  Math.random() * H,
    vx: Math.cos(angle) * SPEED,
    vy: Math.sin(angle) * SPEED,
  };
}

function createFalcon() {
  const angle = Math.random() * Math.PI * 2;
  return {
    x:  Math.random() * W,
    y:  Math.random() * H,
    vx: Math.cos(angle) * EAGLE_SPEED,
    vy: Math.sin(angle) * EAGLE_SPEED,
  };
}

function clamp(v, max) {
  const m = Math.hypot(v.x, v.y);
  if (m > max) { v.x = v.x / m * max; v.y = v.y / m * max; }
}

function loop() {
  ctx.clearRect(0, 0, W, H);

  // Refresh character positions every 10 frames
  if (++charTick >= 10) {
    charTick = 0;
    charPositions = Array.from(document.querySelectorAll('.party-slot')).map(function (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    });
  }

  // update falcons — steer toward nearest boid
  for (const e of falcons) {
    let nearestD = Infinity, ndx = 0, ndy = 0;
    for (const b of boids) {
      const dx = b.x - e.x, dy = b.y - e.y;
      const d = dx * dx + dy * dy;
      if (d < nearestD) { nearestD = d; ndx = dx; ndy = dy; }
    }
    const d = Math.hypot(ndx, ndy) || 1;
    e.vx += (ndx / d) * EAGLE_TURN;
    e.vy += (ndy / d) * EAGLE_TURN;
    const spd = Math.hypot(e.vx, e.vy) || 1;
    e.vx = e.vx / spd * EAGLE_SPEED;
    e.vy = e.vy / spd * EAGLE_SPEED;
    e.x = (e.x + e.vx + W) % W;
    e.y = (e.y + e.vy + H) % H;
  }

  // update boids
  for (const b of boids) {
    let ax = 0, ay = 0;
    let cx = 0, cy = 0, lx = 0, ly = 0, sx = 0, sy = 0;
    let neighbours = 0;

    for (const o of boids) {
      if (o === b) continue;
      const dx = o.x - b.x, dy = o.y - b.y;
      const d  = Math.hypot(dx, dy);
      if (d < PERCEPTION) {
        cx += o.x; cy += o.y;
        lx += o.vx; ly += o.vy;
        neighbours++;
        if (d < AVOID_RADIUS) {
          sx -= dx / (d || 1);
          sy -= dy / (d || 1);
        }
      }
    }

    if (neighbours > 0) {
      cx = cx / neighbours - b.x;
      cy = cy / neighbours - b.y;
      ax += cx * COHESION;
      ay += cy * COHESION;
      ax += (lx / neighbours - b.vx) * ALIGNMENT;
      ay += (ly / neighbours - b.vy) * ALIGNMENT;
      ax += sx * SEPARATION;
      ay += sy * SEPARATION;
    }

    // avoid mouse
    {
      const dx = b.x - mouse.x, dy = b.y - mouse.y;
      const d = Math.hypot(dx, dy);
      if (d < MOUSE_FLEE_RADIUS && d > 0) {
        const strength = (1 - d / MOUSE_FLEE_RADIUS) * MOUSE_FLEE_FORCE;
        ax += (dx / d) * strength;
        ay += (dy / d) * strength;
      }
    }

    // avoid text regions — push away from nearest point on each rect
    for (const r of textRects) {
      const nx = Math.max(r.left, Math.min(b.x, r.right));
      const ny = Math.max(r.top,  Math.min(b.y, r.bottom));
      const dx = b.x - nx, dy = b.y - ny;
      const d = Math.hypot(dx, dy);
      if (d < TEXT_FLEE_RADIUS && d > 0) {
        const strength = (1 - d / TEXT_FLEE_RADIUS) * TEXT_FLEE_FORCE;
        ax += (dx / d) * strength;
        ay += (dy / d) * strength;
      }
    }

    // flee falcons
    for (const e of falcons) {
      const dx = b.x - e.x, dy = b.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < FLEE_RADIUS) {
        const strength = (1 - d / FLEE_RADIUS) * FLEE_FORCE;
        ax += (dx / (d || 1)) * strength;
        ay += (dy / (d || 1)) * strength;
      }
    }

    const acc = { x: ax, y: ay };
    clamp(acc, MAX_FORCE);
    b.vx += acc.x;
    b.vy += acc.y;

    // avoid characters — applied after force budget so it is never diluted by MAX_FORCE
    for (const cp of charPositions) {
      const dx = b.x - cp.x, dy = b.y - cp.y;
      const d = Math.hypot(dx, dy);
      if (d < CHAR_FLEE_RADIUS && d > 0) {
        const strength = (1 - d / CHAR_FLEE_RADIUS) * CHAR_FLEE_FORCE;
        b.vx += (dx / d) * strength;
        b.vy += (dy / d) * strength;
      }
    }

    const spd = Math.hypot(b.vx, b.vy) || 1;
    b.vx = b.vx / spd * SPEED;
    b.vy = b.vy / spd * SPEED;

    b.x = (b.x + b.vx + W) % W;
    b.y = (b.y + b.vy + H) % H;
  }

  // draw boids
  ctx.fillStyle = COLOR;
  for (const b of boids) {
    const angle = Math.atan2(b.vy, b.vx);
    const s = 7;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.09;
    ctx.beginPath();
    ctx.moveTo( s,  0);
    ctx.lineTo(-s,  s * 0.55);
    ctx.lineTo(-s * 0.25, 0);
    ctx.lineTo(-s, -s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // draw falcons — larger, accent colour
  ctx.fillStyle = EAGLE_COLOR;
  for (const e of falcons) {
    const angle = Math.atan2(e.vy, e.vx);
    const s = 16;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo( s,  0);
    ctx.lineTo(-s,  s * 0.6);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s, -s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  rafId = requestAnimationFrame(loop);
}

function startAnimation(slideEl) {
  stopAnimation();

  canvas = document.createElement('canvas');
  W = window.innerWidth;
  H = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:0;pointer-events:none;';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  styledChildren = [];

  // collect text element rects from the slide (excluding canvas and notes)
  textRects = [];
  for (const child of slideEl.children) {
    if (child.tagName === 'ASIDE') continue;
    const r = child.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) textRects.push(r);
  }

  window.addEventListener('mousemove', onMouseMove);

  boids   = Array.from({ length: COUNT },       createBoid);
  falcons = Array.from({ length: EAGLE_COUNT },  createFalcon);
  loop();
}

function onMouseMove(e) {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
}

function stopAnimation() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  window.removeEventListener('mousemove', onMouseMove);
  mouse.x = -9999; mouse.y = -9999;
  for (const child of styledChildren) {
    child.style.position = '';
    child.style.zIndex   = '';
  }
  styledChildren = [];
  if (canvas) { canvas.remove(); canvas = null; ctx = null; }
  boids         = [];
  falcons       = [];
  textRects     = [];
  charPositions = [];
  charTick      = 0;
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
