/* ═══════════════════════════════════════════════════════
   LOOP FACTORY — cria pares start/stop para qualquer rAF
═══════════════════════════════════════════════════════ */
function makeLoop(tickFn) {
  let running = false, raf = null;
  function tick() {
    if (!running) return;
    tickFn();
    raf = requestAnimationFrame(tick);
  }
  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(tick); },
    stop()  { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } },
  };
}

/* ═══════════════════════════════════════════════════════
   GLOBE CANVAS
═══════════════════════════════════════════════════════ */
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

let W, H;
let cx = 0, cy = 0, targetCx = 0, targetCy = 0;
let targetScale = 1, currentScale = 1;
let dots = [];
const mouse = { x: -9999, y: -9999 };

const TILT_X = 22 * Math.PI / 180;
const TILT_Y = 18 * Math.PI / 180;
const GPERSP = 900;
let autoAngle = 0;

function getScreen2GlobePos() {
  if (window.innerWidth <= 600) return { x: W * 0.50, y: H * 0.62, scale: 0.60 };
  if (window.innerWidth <= 900) return { x: W * 0.50, y: H * 0.68, scale: 0.52 };
  return { x: W * 0.72, y: H * 0.50, scale: 0.65 };
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function project(px, py, pz) {
  const cosA = Math.cos(autoAngle), sinA = Math.sin(autoAngle);
  let x1 = px * cosA + pz * sinA, z1 = -px * sinA + pz * cosA, y1 = py;
  const cosTX = Math.cos(TILT_X), sinTX = Math.sin(TILT_X);
  let y2 = y1 * cosTX - z1 * sinTX, z2 = y1 * sinTX + z1 * cosTX;
  const cosTY = Math.cos(TILT_Y), sinTY = Math.sin(TILT_Y);
  let x2 = x1 * cosTY + z2 * sinTY, z3 = -x1 * sinTY + z2 * cosTY;
  const scale = GPERSP / (GPERSP + z3);
  return { sx: cx + x2 * scale * currentScale, sy: cy + y2 * scale * currentScale, z: z3, scale: scale * currentScale };
}

function buildDots() {
  dots = [];
  const R = Math.min(W, H) * 0.29, N = 1400, phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y3d = 1 - (i / (N - 1)) * 2, r3d = Math.sqrt(1 - y3d * y3d), theta = phi * i;
    const x3d = r3d * Math.cos(theta) * R, yy = y3d * R, z3d = r3d * Math.sin(theta) * R;
    dots.push({ x3: x3d, y3: yy, z3: z3d, x: cx, y: cy, vx: 0, vy: 0, baseSize: Math.random() * 1.6 + 0.5, baseAlpha: Math.random() * 0.5 + 0.25, _depth: 0.5, _scale: 1 });
  }
}

function getMobileStartY() {
  /* No mobile, o globo começa mais acima para ser visível sem precisar scrollar */
  return window.innerWidth <= 600 ? H * 0.72 : H;
}
function getMobileEndY() {
  return window.innerWidth <= 600 ? H * 0.46 : H / 2;
}

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  /* Corrige altura CSS para evitar distorção no iOS Safari (100vh ≠ window.innerHeight) */
  canvas.style.height = H + 'px';
  const sy = window.scrollY, vh = window.innerHeight;
  const progress = Math.min(1, sy / (vh * 0.5));
  const s2 = getScreen2GlobePos();
  if (sy <= vh * 1.65) {
    const startY = getMobileStartY(), endY = getMobileEndY();
    targetCx = W / 2; targetCy = startY - (startY - endY) * easeOutCubic(progress); targetScale = 1;
  } else {
    targetCx = s2.x; targetCy = s2.y; targetScale = s2.scale;
  }
  cx = targetCx; cy = targetCy; currentScale = targetScale;
  buildDots();
}

/* Alpha pré-calculado em 20 buckets — evita toFixed(2) x 1400 por frame */
const ALPHA_CACHE = Array.from({ length: 21 }, (_, i) => `rgba(210,210,210,${(i / 20).toFixed(2)})`);
function alphaStr(v) { return ALPHA_CACHE[Math.round(Math.min(1, Math.max(0, v)) * 20)]; }

function globeUpdate() {
  autoAngle += 0.0015;
  cx += (targetCx - cx) * 0.08;
  cy += (targetCy - cy) * 0.08;
  currentScale += (targetScale - currentScale) * 0.08;
  const repelR = 100, repelR2 = repelR * repelR, R3 = Math.min(W, H) * 0.29;
  for (const d of dots) {
    const p = project(d.x3, d.y3, d.z3);
    const depth = (p.z + R3) / (2 * R3);
    d._depth = depth; d._scale = p.scale;
    const dx = d.x - mouse.x, dy = d.y - mouse.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < repelR2) {
      const dist = Math.sqrt(dist2) || 0.001;
      const force = ((repelR - dist) / repelR) ** 2 * 7 * (0.4 + depth * 0.6);
      d.vx += (dx / dist) * force; d.vy += (dy / dist) * force;
    }
    d.vx += (p.sx - d.x) * 0.07; d.vy += (p.sy - d.y) * 0.07;
    d.vx *= 0.80; d.vy *= 0.80;
    d.x  += d.vx; d.y  += d.vy;
  }
  /* Sort removido — o globo rota suavemente e a ordem quase não muda frame a frame.
     A leve imprecisão de profundidade é imperceptível visualmente. */
}

function globeDraw() {
  ctx.clearRect(0, 0, W, H);
  for (const d of dots) {
    const depth = d._depth;
    const size  = d.baseSize * (0.35 + depth * 0.85) * d._scale;
    const alpha = d.baseAlpha * (0.15 + depth * 0.85);
    ctx.beginPath();
    ctx.arc(d.x, d.y, Math.max(0.3, size), 0, Math.PI * 2);
    ctx.fillStyle = alphaStr(alpha); /* string pré-calculada, sem toFixed */
    ctx.fill();
  }
}

const globeLoop = makeLoop(() => { globeUpdate(); globeDraw(); });

/* mousemove throttlado com rAF — não recalcula em cada pixel */
let pendingMx = -9999, pendingMy = -9999, mouseRafPending = false;
window.addEventListener('mousemove', e => {
  pendingMx = e.clientX; pendingMy = e.clientY;
  if (!mouseRafPending) {
    mouseRafPending = true;
    requestAnimationFrame(() => {
      mouse.x = pendingMx; mouse.y = pendingMy;
      mouseRafPending = false;
    });
  }
});
window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
window.addEventListener('resize', resize);

resize();
globeLoop.start(); // inicia na screen 0

/* ═══════════════════════════════════════════════════════
   SCROLL CONTROLLER
═══════════════════════════════════════════════════════ */
const introPanel  = document.getElementById('introPanel');
const introHint   = document.getElementById('introHint');
const whitePanel  = document.getElementById('whitePanel');
const methodPanel = document.getElementById('methodPanel');
const stylePanel  = document.getElementById('stylePanel');
const styleWrapper = document.getElementById('styleWrapper');

let introHidden = false, panelShown = false, methodShown = false, styleShown = false;

(function buildPhrase() {
  const text = 'Criamos experiências digitais onde estratégia, design e tecnologia se movem juntos com propósito.';
  document.getElementById('phraseText').innerHTML =
    text.split(' ').map((w, i) =>
      `<span class="word-wrap"><span class="word-inner" style="transition-delay:${i * 60}ms">${w}</span></span>`
    ).join(' ');
})();

function handleScroll() {
  if (currentScreen !== 0) return; // ignora scroll se não estiver na screen 0

  const sy = window.scrollY, vh = window.innerHeight;
  const s2 = getScreen2GlobePos();
  const progress = Math.min(1, Math.max(0, sy / (vh * 0.5)));

  if (sy <= vh * 1.65) {
    const startY = getMobileStartY(), endY = getMobileEndY();
    targetCx = W / 2; targetCy = startY - (startY - endY) * easeOutCubic(progress); targetScale = 1;
  } else {
    targetCx = s2.x; targetCy = s2.y; targetScale = s2.scale;
  }

  if (sy > 10) introHint.classList.add('hidden');
  else         introHint.classList.remove('hidden');

  if (sy > vh * 0.25 && !introHidden) { introHidden = true;  introPanel.classList.add('hidden'); }
  if (sy <= vh * 0.25 && introHidden) { introHidden = false; introPanel.classList.remove('hidden'); }

  if (sy > vh * 1.65 && !panelShown) {
    panelShown = true; whitePanel.classList.add('visible'); canvas.classList.add('above-panel');
    sphereLoop.start();
  }
  if (sy <= vh * 1.65 && panelShown) {
    panelShown = false; whitePanel.classList.remove('visible'); canvas.classList.remove('above-panel');
    sphereLoop.stop();
  }

  if (sy > vh * 2.65 && !methodShown) {
    methodShown = true; methodPanel.classList.add('visible');
    canvas.classList.remove('above-panel'); /* globo fica atrás do method panel */
    wireframeLoop.start();
  }
  if (sy <= vh * 2.65 && methodShown) {
    methodShown = false; methodPanel.classList.remove('visible');
    if (panelShown) canvas.classList.add('above-panel');
    wireframeLoop.stop();
  }

  if (sy > vh * 3.65 && !styleShown) {
    styleShown = true; stylePanel.classList.add('visible');
    startTestimSlider();
  }
  if (sy <= vh * 3.65 && styleShown) {
    styleShown = false; stylePanel.classList.remove('visible');
    stopTestimSlider();
  }

  if (styleWrapper) {
    if (sy > vh * 4.2) {
      const sc = Math.min(2, Math.max(0, (sy - vh * 4.2) / vh));
      styleWrapper.style.transform = `translateY(-${sc * 100}vh)`;
    } else {
      styleWrapper.style.transform = 'translateY(0)';
    }
  }
}

window.addEventListener('scroll', handleScroll, { passive: true });

/* ═══════════════════════════════════════════════════════
   SCREEN 2 — FLOATING DOT-SPHERES
═══════════════════════════════════════════════════════ */
function genUnitDots(N) {
  const pts = [], phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = phi * i;
    pts.push({ x: r * Math.cos(t), y, z: r * Math.sin(t), bA: Math.random() * 0.5 + 0.25, bS: Math.random() * 1.6 + 0.5 });
  }
  return pts;
}

const sc   = document.getElementById('spheresCanvas');
const sctx = sc.getContext('2d');
let sw, sh;
const UDOTS = genUnitDots(320);
const SP = 260;
const snodes = [
  { fx: .48, fy: .26, phase: 0.0, speed: .70, rot: 0.0, rotSpeed: .007 },
  { fx: .65, fy: .50, phase: 1.9, speed: .55, rot: 1.2, rotSpeed: .005 },
  { fx: .45, fy: .74, phase: .8, speed: .85, rot: 0.5, rotSpeed: .009 },
];
const S_RADII = [38, 30, 38];

function projectDot(d, ccx, ccy, R, rotY) {
  const cosA = Math.cos(rotY), sinA = Math.sin(rotY);
  const x1 = d.x * cosA + d.z * sinA, z1 = -d.x * sinA + d.z * cosA;
  const scale = SP / (SP + z1 * R);
  return { sx: ccx + x1 * R * scale, sy: ccy + d.y * R * scale, z: z1 };
}
function drawDotSphere(ccx, ccy, R, rotY) {
  const pts = UDOTS.map(d => {
    const p = projectDot(d, ccx, ccy, R, rotY), depth = (p.z + 1) / 2;
    return { sx: p.sx, sy: p.sy, depth, size: d.bS * (0.3 + depth * 0.9), alpha: d.bA * (0.12 + depth * 0.82) };
  });
  pts.sort((a, b) => a.depth - b.depth);
  pts.forEach(p => {
    sctx.beginPath(); sctx.arc(p.sx, p.sy, Math.max(0.3, p.size), 0, Math.PI * 2);
    sctx.fillStyle = `rgba(80,80,75,${p.alpha.toFixed(2)})`; sctx.fill();
  });
}
function resizeSpheres() { sw = sc.width = sc.offsetWidth; sh = sc.height = sc.offsetHeight; }
let sphereT = 0;
const sphereLoop = makeLoop(() => {
  sphereT += 0.012;
  sctx.clearRect(0, 0, sw, sh);
  const pos = snodes.map(n => ({
    x: n.fx * sw + Math.sin(sphereT * n.speed + n.phase) * 9,
    y: n.fy * sh + Math.cos(sphereT * n.speed * 0.75 + n.phase) * 14,
  }));
  sctx.strokeStyle = 'rgba(110,110,105,0.45)'; sctx.lineWidth = 1;
  for (let i = 0; i < pos.length - 1; i++) {
    sctx.beginPath(); sctx.moveTo(pos[i].x, pos[i].y); sctx.lineTo(pos[i + 1].x, pos[i + 1].y); sctx.stroke();
  }
  snodes.forEach((n, i) => { n.rot += n.rotSpeed; drawDotSphere(pos[i].x, pos[i].y, S_RADII[i], n.rot); });
});
window.addEventListener('resize', resizeSpheres);
resizeSpheres();
/* sphereLoop.start() chamado pelo scroll handler quando whitePanel fica visível */

/* ═══════════════════════════════════════════════════════
   SCREEN 3 — WIREFRAME FLOATING SHAPES
═══════════════════════════════════════════════════════ */
const wc   = document.getElementById('wireframeCanvas');
const wctx = wc.getContext('2d');
let ww, wh;

function resizeWireframe() { ww = wc.width = wc.offsetWidth; wh = wc.height = wc.offsetHeight; }

const wireShapes = [];
function initWireShapes() {
  wireShapes.length = 0;
  const isMob = window.innerWidth <= 600;
  /* No mobile, formas maiores para serem visíveis em telas pequenas */
  const srMin = isMob ? 38 : 20, srRange = isMob ? 60 : 50;
  const trMin = isMob ? 30 : 18, trRange = isMob ? 55 : 40;
  for (let i = 0; i < 9; i++) wireShapes.push({ type: 'sphere', x: Math.random(), y: Math.random(), r: srMin + Math.random() * srRange, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.12, rotX: Math.random() * Math.PI * 2, rotY: Math.random() * Math.PI * 2, rotSpeedX: (Math.random() - 0.5) * 0.008, rotSpeedY: (Math.random() - 0.5) * 0.006, alpha: 0.12 + Math.random() * 0.18 });
  for (let i = 0; i < 16; i++) wireShapes.push({ type: 'triangle', x: Math.random(), y: Math.random(), r: trMin + Math.random() * trRange, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.14, rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.012, alpha: 0.10 + Math.random() * 0.16 });
}
initWireShapes();

function drawWireframeSphere(ccx, ccy, r, rotX, rotY, alpha) {
  wctx.strokeStyle = `rgba(200,200,210,${alpha.toFixed(2)})`; wctx.lineWidth = 0.7;
  /* 6→4 rings, 8→5 meridians, 32→20 segments: -60% de operações trigonométricas */
  const rings = 4, SEG = 20;
  /* Pre-calcular cos/sin das rotações fora dos loops internos */
  const cosRY = Math.cos(rotY), sinRY = Math.sin(rotY);
  const cosRX = Math.cos(rotX), sinRX = Math.sin(rotX);
  for (let i = 1; i < rings; i++) {
    const latAngle = (i / rings) * Math.PI - Math.PI / 2, ringR = Math.cos(latAngle) * r, ringY = Math.sin(latAngle) * r;
    wctx.beginPath();
    for (let j = 0; j <= SEG; j++) {
      const lonAngle = (j / SEG) * Math.PI * 2;
      const px = Math.cos(lonAngle) * ringR, pz = Math.sin(lonAngle) * ringR;
      const rx = px * cosRY + pz * sinRY, rz = -px * sinRY + pz * cosRY;
      const ry = ringY * cosRX - rz * sinRX, rz2 = ringY * sinRX + rz * cosRX;
      const s = 300 / (300 + rz2);
      if (j === 0) wctx.moveTo(ccx + rx * s, ccy + ry * s);
      else         wctx.lineTo(ccx + rx * s, ccy + ry * s);
    }
    wctx.stroke();
  }
  const meridians = 5;
  for (let i = 0; i < meridians; i++) {
    const lonAngle = (i / meridians) * Math.PI * 2;
    const cosLon = Math.cos(lonAngle), sinLon = Math.sin(lonAngle);
    wctx.beginPath();
    for (let j = 0; j <= SEG; j++) {
      const latAngle = (j / SEG) * Math.PI * 2;
      const cosLat = Math.cos(latAngle), sinLat = Math.sin(latAngle);
      const px = cosLat * cosLon * r, py = sinLat * r, pz = cosLat * sinLon * r;
      const rx = px * cosRY + pz * sinRY, rz = -px * sinRY + pz * cosRY;
      const ry = py * cosRX - rz * sinRX, rz2 = py * sinRX + rz * cosRX;
      const s = 300 / (300 + rz2);
      if (j === 0) wctx.moveTo(ccx + rx * s, ccy + ry * s);
      else         wctx.lineTo(ccx + rx * s, ccy + ry * s);
    }
    wctx.stroke();
  }
}

function drawWireframeTriangle(ccx, ccy, r, rot, alpha) {
  wctx.strokeStyle = `rgba(200,200,210,${alpha.toFixed(2)})`; wctx.lineWidth = 0.8;
  const verts3D = [{ x: 0, y: -1, z: 0 }, { x: 0.94, y: 0.33, z: 0 }, { x: -0.47, y: 0.33, z: 0.82 }, { x: -0.47, y: 0.33, z: -0.82 }];
  const cosR = Math.cos(rot), sinR = Math.sin(rot), cosR2 = Math.cos(rot * 0.7), sinR2 = Math.sin(rot * 0.7);
  const projected = verts3D.map(v => {
    let px = v.x * cosR + v.z * sinR, pz = -v.x * sinR + v.z * cosR;
    let py = v.y * cosR2 - pz * sinR2, pz2 = v.y * sinR2 + pz * cosR2;
    const s = 200 / (200 + pz2 * r);
    return { x: ccx + px * r * s, y: ccy + py * r * s };
  });
  [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]].forEach(([a, b]) => {
    wctx.beginPath(); wctx.moveTo(projected[a].x, projected[a].y); wctx.lineTo(projected[b].x, projected[b].y); wctx.stroke();
  });
  projected.forEach(p => {
    wctx.beginPath(); wctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    wctx.fillStyle = `rgba(200,200,210,${(alpha * 1.5).toFixed(2)})`; wctx.fill();
  });
}

const wireframeLoop = makeLoop(() => {
  wctx.clearRect(0, 0, ww, wh);
  for (const s of wireShapes) {
    s.x += s.vx / ww; s.y += s.vy / wh;
    if (s.x < 0.02 || s.x > 0.98) s.vx *= -1;
    if (s.y < 0.02 || s.y > 0.98) s.vy *= -1;
    s.x = Math.max(0.02, Math.min(0.98, s.x)); s.y = Math.max(0.02, Math.min(0.98, s.y));
    if (s.type === 'sphere') { s.rotX += s.rotSpeedX; s.rotY += s.rotSpeedY; } else { s.rot += s.rotSpeed; }
    const px = s.x * ww, py = s.y * wh;
    if (s.type === 'sphere') drawWireframeSphere(px, py, s.r, s.rotX, s.rotY, s.alpha);
    else                     drawWireframeTriangle(px, py, s.r, s.rot, s.alpha);
  }
  const ccx = ww / 2, ccy = wh / 2, rad = Math.sqrt(ccx * ccx + ccy * ccy) * 0.95;
  const fade = wctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, rad);
  fade.addColorStop(0, 'rgba(17,17,17,0)'); fade.addColorStop(0.6, 'rgba(17,17,17,0.15)'); fade.addColorStop(1, 'rgba(17,17,17,0.75)');
  wctx.fillStyle = fade; wctx.fillRect(0, 0, ww, wh);
});
window.addEventListener('resize', () => { resizeWireframe(); initWireShapes(); });
resizeWireframe();

/* ═══════════════════════════════════════════════════════
   SCREEN 3 — INTERACTIVE GRID
═══════════════════════════════════════════════════════ */
const gc   = document.getElementById('gridCanvas');
const gctx = gc.getContext('2d');
let gw, gh;
const gM = { x: -9999, y: -9999 };

function resizeGrid() { gw = gc.width = gc.offsetWidth; gh = gc.height = gc.offsetHeight; }

const GRID_R = 160, GRID_R2 = GRID_R * GRID_R;
function getOff(px, py) {
  if (gM.x < 0) return { ox: 0, oy: 0 };
  const dx = px - gM.x, dy = py - gM.y;
  /* bounding box barata antes do sqrt — descarta ~95% dos pontos sem trig */
  if (dx > GRID_R || dx < -GRID_R || dy > GRID_R || dy < -GRID_R) return { ox: 0, oy: 0 };
  const dist2 = dx * dx + dy * dy;
  if (dist2 > GRID_R2) return { ox: 0, oy: 0 };
  const dist = Math.sqrt(dist2);
  const str = Math.pow(1 - dist / GRID_R, 2) * 28, ang = Math.atan2(dy, dx);
  return { ox: Math.cos(ang) * str, oy: Math.sin(ang) * str };
}

const gridLoop = makeLoop(() => {
  gctx.clearRect(0, 0, gw, gh);
  const cell = 44;
  gctx.lineWidth = 0.65; gctx.strokeStyle = 'rgba(255,255,255,0.12)';
  for (let x = 0; x <= gw + cell; x += cell) {
    gctx.beginPath(); let f = true;
    for (let y = 0; y <= gh; y += 4) {
      const { ox, oy } = getOff(x, y);
      if (f) { gctx.moveTo(x + ox, y + oy); f = false; } else gctx.lineTo(x + ox, y + oy);
    }
    gctx.stroke();
  }
  for (let y = 0; y <= gh + cell; y += cell) {
    gctx.beginPath(); let f = true;
    for (let x = 0; x <= gw; x += 4) {
      const { ox, oy } = getOff(x, y);
      if (f) { gctx.moveTo(x + ox, y + oy); f = false; } else gctx.lineTo(x + ox, y + oy);
    }
    gctx.stroke();
  }
  const ccx = gw / 2, ccy = gh / 2, rad = Math.sqrt(ccx * ccx + ccy * ccy) * 0.95;
  const fade = gctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, rad);
  fade.addColorStop(0, 'rgba(17,17,17,0)'); fade.addColorStop(0.55, 'rgba(17,17,17,0.25)'); fade.addColorStop(1, 'rgba(17,17,17,0.88)');
  gctx.fillStyle = fade; gctx.fillRect(0, 0, gw, gh);
});

methodPanel.addEventListener('mousemove', e => { const r = gc.getBoundingClientRect(); gM.x = e.clientX - r.left; gM.y = e.clientY - r.top; });
methodPanel.addEventListener('mouseleave', () => { gM.x = -9999; gM.y = -9999; });
window.addEventListener('resize', resizeGrid);
resizeGrid();

/* ═══════════════════════════════════════════════════════
   TESTIMONIALS SLIDER
═══════════════════════════════════════════════════════ */
const testimTrack      = document.getElementById('testimTrack');
const testimIndicators = document.querySelectorAll('#testimIndicators .dot');
let currentTestim = 0;
const totalTestims = 3;
let testimInterval;

function updateTestimSlider() {
  if (!testimTrack) return;
  testimTrack.style.transform = `translateX(-${(currentTestim * 100) / 3}%)`;
  testimIndicators.forEach((dot, idx) => dot.classList.toggle('active', idx === currentTestim));
}
function startTestimSlider() {
  if (!testimInterval && testimTrack) testimInterval = setInterval(() => { currentTestim = (currentTestim + 1) % totalTestims; updateTestimSlider(); }, 4000);
}
function stopTestimSlider() {
  if (testimInterval) { clearInterval(testimInterval); testimInterval = null; }
}

/* ═══════════════════════════════════════════════════════
   HORIZONTAL SWIPE NAVIGATION
═══════════════════════════════════════════════════════ */
const navItems    = document.querySelectorAll('.nav-item');
const navIndicator = document.getElementById('navIndicator');
const navLinks    = document.getElementById('navLinks');
const screens     = [
  document.getElementById('screenInicio'),
  document.getElementById('screenPortfolio'),
  document.getElementById('screenContato'),
];

let currentScreen = 0;

function updateNav(index) {
  currentScreen = index;

  navItems.forEach((item, i) => {
    item.classList.toggle('active', i === index);
    if (i === index) {
      const li = item.parentElement;
      navIndicator.style.width  = li.offsetWidth + 'px';
      navIndicator.style.height = navLinks.clientHeight + 'px';
      navIndicator.style.left   = li.offsetLeft + 'px';
      navIndicator.style.top    = '0px';
    }
  });

  screens.forEach(screen => { screen.style.transform = `translateX(-${index * 100}vw)`; });

  if (index === 0) {
    /* voltou para Início — retoma só o que estava ativo */
    globeLoop.start();
    if (panelShown)  sphereLoop.start();
    if (methodShown) { wireframeLoop.start(); }
    if (styleShown)  startTestimSlider();
  } else {
    /* saiu de Início — para tudo */
    globeLoop.stop();
    sphereLoop.stop();
    wireframeLoop.stop();
    stopTestimSlider();
  }
}

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    updateNav(parseInt(item.getAttribute('data-index')));
  });
});

window.addEventListener('load', () => { setTimeout(() => updateNav(0), 100); });

/* ═══════════════════════════════════════════════════════
   BURGER MENU (MOBILE)
═══════════════════════════════════════════════════════ */
const burgerBtn  = document.getElementById('burgerBtn');
const mobileMenu = document.getElementById('mobileMenu');
const mobileNavItems = document.querySelectorAll('.mobile-nav-item');

function closeMobileMenu() {
  burgerBtn.classList.remove('open');
  mobileMenu.classList.remove('open');
}

burgerBtn.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  burgerBtn.classList.toggle('open', isOpen);
});

mobileNavItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const index = parseInt(item.getAttribute('data-index'));
    /* marca item ativo */
    mobileNavItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    closeMobileMenu();
    updateNav(index);
  });
});

/* fecha ao pressionar Escape */
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileMenu(); });

/* ═══════════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════════ */
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
  item.querySelector('.faq-question').addEventListener('click', () => {
    const isActive = item.classList.contains('active');
    faqItems.forEach(other => other.classList.remove('active'));
    if (!isActive) item.classList.add('active');
  });
});

/* ═══════════════════════════════════════════════════════
   CONTACT FORM
═══════════════════════════════════════════════════════ */
(function () {
  document.querySelectorAll('#contactForm select').forEach(sel => {
    sel.addEventListener('change', () => sel.classList.toggle('filled', sel.value !== ''));
  });

  const form    = document.getElementById('contactForm');
  const btn     = document.getElementById('btnSubmit');
  const success = document.getElementById('formSuccess');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    btn.disabled = true; btn.textContent = 'Enviando...';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } });
      if (res.ok) { form.style.display = 'none'; success.style.display = 'block'; }
      else { btn.disabled = false; btn.textContent = 'Iniciar Projeto'; alert('Erro ao enviar. Tente novamente.'); }
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Iniciar Projeto'; alert('Erro de conexão. Tente novamente.');
    }
  });
})();
