/* 园林史 · 世界时间轴 —— 真实地理投影，节点落在真实经纬度 */
(() => {
'use strict';

const D = window.APP_DATA;
const { eras, nodes, questions } = D;

/* ---------------- 时间 ---------------- */
const Y_MIN = -3000, Y_MAX = 2000;
const S = y => (y - Y_MIN) / (Y_MAX - Y_MIN);

/* ---------------- 投影 ---------------- */
const VIEW = { lon0: -18, lon1: 148, lat0: -12, lat1: 66 };
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const M0 = mercY(VIEW.lat0), M1 = mercY(VIEW.lat1);

let W = 0, H = 0;
const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
const PAD_T = 22, PAD_B = 10;
const view = { k: 1, tx: 0, ty: 0 };

function mapW() { return W - (W > 900 ? 340 : (W > 640 ? 262 : 0)); }
function projRaw(lon, lat) {
  const x = (lon - VIEW.lon0) / (VIEW.lon1 - VIEW.lon0) * mapW();
  const my = mercY(Math.max(-84, Math.min(84, lat)));
  const y = (M1 - my) / (M1 - M0) * (H - PAD_T - PAD_B) + PAD_T;
  return [x, y];
}
function proj(lon, lat) {
  const [x, y] = projRaw(lon, lat);
  return [x * view.k + view.tx, y * view.k + view.ty];
}

/* ---------------- DOM ---------------- */
const cvs = document.getElementById('map');
const fxc = document.getElementById('fx');
const ctx = cvs.getContext('2d');
const fx = fxc.getContext('2d');
const stage = document.getElementById('stage');
const pinsEl = document.getElementById('pins');

/* ---------------- 尺寸 ---------------- */
function resize() {
  const r = stage.getBoundingClientRect();
  W = r.width; H = r.height;
  for (const c of [cvs, fxc]) {
    c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
    c.style.width = W + 'px'; c.style.height = H + 'px';
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawWorld();
  placePins();
}

/* ---------------- 地图 ---------------- */
let GEO = null;

function drawWorld() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);

  if (GEO) {
    const p = new Path2D();
    for (const f of GEO.features) {
      const g = f.geometry;
      if (g.type !== 'MultiPolygon') continue;
      for (const poly of g.coordinates) {
        for (const ring of poly) {
          if (ring.length < 3) continue;
          let started = false;
          for (const pt of ring) {
            const [x, y] = proj(pt[0], pt[1]);
            if (!started) { p.moveTo(x, y); started = true; }
            else p.lineTo(x, y);
          }
          p.closePath();
        }
      }
    }
    const g = ctx.createLinearGradient(0, PAD_T, 0, H);
    g.addColorStop(0, '#252019');
    g.addColorStop(0.55, '#1d1a15');
    g.addColorStop(1, '#171410');
    ctx.fillStyle = g;
    ctx.fill(p);
    ctx.strokeStyle = 'rgba(150,138,118,.30)';
    ctx.lineWidth = .55;
    ctx.stroke(p);
  }

  ctx.strokeStyle = 'rgba(190,168,132,.045)';
  ctx.lineWidth = 1;
  for (let lon = -10; lon <= 145; lon += 15) {
    const x = proj(lon, 0)[0];
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let lat = 0; lat <= 60; lat += 15) {
    const y = proj(0, lat)[1];
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

/* ---------------- 节点 ---------------- */
const pinEls = new Map();
let placed = [];

function placePins() {
  if (!pinEls.size) buildPins();

  const list = nodes.map(n => {
    const [x, y] = proj(n.lon, n.lat);
    return { n, tx: x, ty: y, x, y };
  });

  list.sort((a, b) => (b.n.sz || 1) - (a.n.sz || 1));
  const done = [];
  for (const it of list) {
    let tries = 0;
    while (tries < 40) {
      const clash = done.some(p =>
        Math.abs(p.x - it.x) < 21 && Math.abs(p.y - it.y) < 18);
      if (!clash) break;
      const ang = tries * 2.39996;
      const r = 12 + Math.sqrt(tries) * 7.6;
      it.x = it.tx + Math.cos(ang) * r;
      it.y = it.ty + Math.sin(ang) * r * 0.82;
      tries++;
    }
    done.push(it);
  }
  placed = list;

  for (const it of list) {
    const el = pinEls.get(it.n.id);
    if (!el) continue;
    el.style.transform = `translate(${it.x}px,${it.y}px)`;
  }
  drawLeaders();
}

const STREAMS = [
  { a: 'cn-n05', b: 'we-n06', y: 600 },
  { a: 'cn-n14', b: 'we-n17', y: 1750 },
  { a: 'we-n19', b: 'we-n20', y: 1860 },
];

function drawLeaders() {
  fx.clearRect(0, 0, W, H);

  fx.save();
  fx.strokeStyle = 'rgba(180,158,124,.18)';
  fx.lineWidth = .8;
  for (const it of placed) {
    if (Math.hypot(it.x - it.tx, it.y - it.ty) < 4) continue;
    const el = pinEls.get(it.n.id);
    if (el && el.classList.contains('future')) continue;
    fx.beginPath(); fx.moveTo(it.tx, it.ty); fx.lineTo(it.x, it.y); fx.stroke();
  }
  fx.restore();

  for (const s of STREAMS) {
    if (curYear < s.y) continue;
    const pa = placed.find(p => p.n.id === s.a);
    const pb = placed.find(p => p.n.id === s.b);
    if (!pa || !pb) continue;
    const mx = (pa.x + pb.x) / 2;
    const my = Math.min(pa.y, pb.y) - 44;
    const k = Math.min(1, (curYear - s.y) / 90);
    fx.save();
    fx.setLineDash([2, 7]);
    fx.strokeStyle = 'rgba(201,162,39,' + (0.10 + 0.28 * k) + ')';
    fx.lineWidth = 1.15;
    fx.beginPath(); fx.moveTo(pa.x, pa.y);
    fx.quadraticCurveTo(mx, my, pb.x, pb.y); fx.stroke();
    fx.restore();
  }
}

function buildPins() {
  pinsEl.innerHTML = '';
  for (const n of nodes) {
    const side = n.id.startsWith('cn') ? 'cn' : 'we';
    const el = document.createElement('div');
    el.className = 'pin ' + side + (n.sz >= 1.55 ? ' big' : '');
    el.dataset.id = n.id;
    const short = n.title.replace(/^.*?·\s*/, '');
    el.innerHTML = '<i class="dot"></i><span class="pinlab">' + short + '</span>';
    el.addEventListener('click', ev => { ev.stopPropagation(); openNode(n.id); });
    pinsEl.appendChild(el);
    pinEls.set(n.id, el);
  }
}

/* ---------------- 时间 ---------------- */
let curYear = Y_MIN;
let playing = false;

const slider = document.getElementById('slider');
const yearNow = document.getElementById('yearNow');
const yearCn = document.getElementById('yearCn');
const eraCn = document.querySelector('#eraPlate .ep-cn');
const eraWe = document.querySelector('#eraPlate .ep-we');

const CN_DYN = [[-1600, '商'], [-1046, '西周'], [-770, '春秋'], [-476, '战国'], [-221, '秦'],
[-206, '西汉'], [9, '新'], [25, '东汉'], [220, '三国'], [265, '西晋'], [317, '东晋'],
[420, '南北朝'], [581, '隋'], [618, '唐'], [907, '五代'], [960, '北宋'], [1127, '南宋'],
[1271, '元'], [1368, '明'], [1644, '清'], [1912, '民国']];
function dyn(y) { let o = CN_DYN[0][1]; for (const kv of CN_DYN) if (y >= kv[0]) o = kv[1]; return o; }

function setYear(y) {
  curYear = y;
  slider.value = Math.round(S(y) * 1000);
  yearNow.textContent = y < 0 ? '前' + (-y) : '' + y;
  yearCn.textContent = dyn(y);

  for (const n of nodes) {
    const el = pinEls.get(n.id);
    if (!el) continue;
    el.classList.toggle('future', n.year > y);
  }

  const ce = eras.find(e => e.side === 'cn' && y >= e.start && y < e.end);
  const we = eras.find(e => e.side === 'we' && y >= e.start && y < e.end);
  if (ce) { eraCn.classList.add('on'); eraCn.textContent = ce.name + ' · ' + ce.sub; }
  else eraCn.classList.remove('on');
  if (we) { eraWe.classList.add('on'); eraWe.textContent = we.name + ' · ' + we.sub; }
  else eraWe.classList.remove('on');

  for (const b of document.querySelectorAll('.eraBand')) {
    const e = eras.find(x => x.id === b.dataset.era);
    b.classList.toggle('on', !!e && y >= e.start && y < e.end);
  }
  drawLeaders();
  syncRailFuture();
  placeRailCursor(y);
  if (playing) followRail(y);
}

function placeRailCursor(y) {
  const cur = document.getElementById('railCursor');
  if (!cur) return;
  let target = null;
  for (const r of railRows) {
    if (r.y <= y) target = r; else break;
  }
  const inner = document.getElementById('railInner');
  if (!target) {
    cur.style.top = (inner.offsetTop + 4) + 'px';
    return;
  }
  const rowEl = target.row;
  const top = rowEl.offsetTop + rowEl.offsetParent.offsetTop + rowEl.offsetHeight;
  cur.style.top = top + 'px';
}

let lastFollow = 0;
function followRail(y) {
  const now = Date.now();
  if (now - lastFollow < 380) return;   // 节流
  lastFollow = now;
  let target = null;
  for (const r of railRows) {
    if (r.y <= y) target = r; else break;
  }
  if (!target) return;
  const box = railScroll.getBoundingClientRect();
  const rr = target.row.getBoundingClientRect();
  if (rr.top < box.top + 40 || rr.bottom > box.bottom - 40) {
    railScroll.scrollTo({ top: railScroll.scrollTop + (rr.top - box.top) - box.height * 0.35, behavior: 'smooth' });
  }
}

/* ---------------- 缩放 ---------------- */
let dragging = false, dsx = 0, dsy = 0;

stage.addEventListener('wheel', e => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k0 = view.k;
  const k = Math.max(1, Math.min(14, k0 * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
  if (k === k0) return;
  view.tx = mx - (mx - view.tx) * (k / k0);
  view.ty = my - (my - view.ty) * (k / k0);
  view.k = k;
  clampView(); redraw();
}, { passive: false });

stage.addEventListener('pointerdown', e => {
  if (e.target.closest('.pin')) return;
  dragging = true;
  dsx = e.clientX - view.tx; dsy = e.clientY - view.ty;
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', e => {
  if (!dragging) return;
  view.tx = e.clientX - dsx; view.ty = e.clientY - dsy;
  clampView(); redraw();
});
stage.addEventListener('pointerup', e => {
  dragging = false;
  try { stage.releasePointerCapture(e.pointerId); } catch (_) {}
});

function clampView() {
  const maxX = mapW() * (view.k - 1), maxY = H * (view.k - 1);
  view.tx = Math.min(0, Math.max(-maxX, view.tx));
  view.ty = Math.min(0, Math.max(-maxY, view.ty));
}
function redraw() { drawWorld(); placePins(); }

function focus(lon0, lon1, lat0, lat1) {
  const a = projRaw(lon0, lat1);
  const b = projRaw(lon1, lat0);
  const bw = Math.abs(b[0] - a[0]), bh = Math.abs(b[1] - a[1]);
  if (bw < 1 || bh < 1) return;
  const k = Math.max(1, Math.min(14, Math.min(mapW() / bw, H / bh) * 0.9));
  view.k = k;
  view.tx = mapW() / 2 - (a[0] + b[0]) / 2 * k;
  view.ty = H / 2 - (a[1] + b[1]) / 2 * k;
  clampView(); redraw();
}

document.querySelectorAll('[data-focus]').forEach(b => {
  b.addEventListener('click', () => {
    const f = b.dataset.focus;
    if (f === 'all') { view.k = 1; view.tx = 0; view.ty = 0; redraw(); }
    else if (f === 'cn') focus(110, 124, 22, 42);
    else if (f === 'we') focus(-10, 20, 38, 56);
    document.querySelectorAll('[data-focus]').forEach(x => x.classList.toggle('on', x === b));
  });
});


/* ---------------- 右侧年代轨 ---------------- */
const railInner = document.getElementById('railInner');
const railScroll = document.getElementById('railScroll');
let railRows = [];

function buildRail() {
  railInner.innerHTML = '';
  railRows = [];

  // 精选节点按年代排序，中西方按「时代区间是否重叠」并排
  const primes = nodes.filter(n => n.prime);
  const cns = primes.filter(n => n.id.startsWith('cn')).sort((a, b) => a.year - b.year);
  const wes = primes.filter(n => !n.id.startsWith('cn')).sort((a, b) => a.year - b.year);

  const span = id => {
    const e = eras.find(x => x.id === id);
    return e ? [e.start, e.end] : [0, 0];
  };
  const overlaps = (a, b) => {
    const A = span(a), B = span(b);
    return A[0] < B[1] && B[0] < A[1];
  };

  const rows = [];
  let i = 0, j = 0;
  while (i < cns.length || j < wes.length) {
    if (i >= cns.length) { rows.push({ we: wes[j++] }); continue; }
    if (j >= wes.length) { rows.push({ cn: cns[i++] }); continue; }
    const c = cns[i], w = wes[j];
    if (overlaps(c.era, w.era)) { rows.push({ cn: cns[i++], we: wes[j++] }); }
    else if (c.year < w.year) { rows.push({ cn: cns[i++] }); }
    else { rows.push({ we: wes[j++] }); }
  }

  let lastCn = '', lastWe = '';
  for (const r of rows) {
    const cnEra = r.cn ? r.cn.era : '';
    const weEra = r.we ? r.we.era : '';

    if (cnEra && cnEra !== lastCn) {
      lastCn = cnEra;
      const e = eras.find(x => x.id === cnEra);
      const d = document.createElement('div');
      d.className = 'railEra cnEra';
      d.innerHTML = '<span>' + e.name + '</span><i>' + e.sub + '</i>';
      railInner.appendChild(d);
    }
    if (weEra && weEra !== lastWe) {
      lastWe = weEra;
      const e = eras.find(x => x.id === weEra);
      const d = document.createElement('div');
      d.className = 'railEra weEra';
      d.innerHTML = '<span>' + e.name + '</span><i>' + e.sub + '</i>';
      railInner.appendChild(d);
    }

    const row = document.createElement('div');
    row.className = 'railRow';
    for (const side of ['cn', 'we']) {
      const cell = document.createElement('div');
      cell.className = 'railCell';
      const n = r[side];
      if (n) {
        const b = document.createElement('button');
        b.className = 'railCard ' + side;
        b.dataset.id = n.id;
        b.innerHTML = '<b>' + n.title.replace(/^.*?·\s*/, '')
          + (n.q.length ? '<span class="qdot"></span>' : '') + '</b>'
          + '<i>' + (n.year < 0 ? '前' + (-n.year) : n.year) + ' · ' + n.place + '</i>';
        b.addEventListener('click', () => { openNode(n.id); markRail(n.id); });
        cell.appendChild(b);
      }
      row.appendChild(cell);
    }
    railInner.appendChild(row);
    railRows.push({ row, cn: r.cn, we: r.we, y: Math.min((r.cn||{}).year ?? 1e9, (r.we||{}).year ?? 1e9) });
  }

  syncRailFuture();
}

let railSel = null;
function markRail(id) {
  railSel = id;
  railInner.querySelectorAll('.railCard').forEach(c => c.classList.toggle('sel', c.dataset.id === id));
  const card = railInner.querySelector('.railCard[data-id="' + id + '"]');
  if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function syncRailFuture() {
  railInner.querySelectorAll('.railCard').forEach(c => {
    const n = nodes.find(x => x.id === c.dataset.id);
    if (n) c.classList.toggle('future', n.year > curYear);
  });
}

/* ---------------- 详情 ---------------- */
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
const KIND_CN = { term: '名词', short: '简答', essay: '论述', draw: '绘图' };
const KIND_CLS = { term: 'kb-term', short: 'kb-short', essay: 'kb-essay', draw: 'kb-draw' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function openNode(id) {
  const n = nodes.find(x => x.id === id);
  if (!n) return;
  const era = eras.find(e => e.id === n.era);
  const side = n.id.startsWith('cn') ? 'cn' : 'we';
  const list = n.q.map(q => questions[q]).filter(Boolean);

  let h = '<div class="p-head">'
    + '<div class="p-era"><span class="p-side ' + side + '">' + (side === 'cn' ? '中国' : '西方') + '</span>' + esc(era.name) + '</div>'
    + '<h1>' + esc(n.title) + '</h1>'
    + '<div class="p-meta">' + (n.year < 0 ? '前 ' + (-n.year) : n.year) + ' 年 · ' + esc(n.place) + '</div>'
    + '</div>';

  if (n.img) {
    h += '<img class="p-img" src="assets/plans/' + n.img + '.webp" alt="' + esc(n.title) + '" loading="lazy">'
      + '<div class="p-imgcap">平面图 · 裁自教材扫描页 · 点击放大</div>';
  }
  h += '<div class="p-text">' + esc(n.text) + '</div>';

  if (list.length) {
    h += '<div class="p-qhead">真题怎么考 · ' + list.length + '</div>';
    for (const q of list) {
      h += '<details class="qcard"><summary>'
        + '<span class="kbadge ' + KIND_CLS[q.kind] + '">' + KIND_CN[q.kind] + '</span>'
        + '<span class="qtitle">' + esc(q.title) + '</span>'
        + '<span class="qyears">' + q.years.join('、') + '</span>'
        + '</summary><div class="qbody">' + renderQ(q) + '</div></details>';
    }
  } else {
    h += '<div class="p-qhead">真题怎么考</div>'
      + '<div class="p-text" style="color:#6b6257;font-size:12.5px">暂无直接对应真题，属背景知识，可作论述题例证。</div>';
  }

  panelBody.innerHTML = h;
  panel.classList.remove('hidden');
  document.body.classList.add('panelOpen');
  panel.scrollTop = 0;
  const img = panelBody.querySelector('.p-img');
  if (img) img.addEventListener('click', () => zoomImg(img.src));
  for (const kv of pinEls) kv[1].classList.toggle('hit', kv[0] === id);
  if (typeof markRail === 'function') markRail(id);
}

function renderQ(q) {
  const sec = q.sections || {};
  const order = (q.order && q.order.length) ? q.order : Object.keys(sec);
  const block = ['参考答案', '答案', '参考范文', '平面要素清单', '绘制步骤', '原题', '图纸信息'];
  let out = '';
  for (const k of order) {
    if (k === '_lead') continue;
    const raw = sec[k];
    if (!raw) continue;
    const txt = String(raw).trim();
    if (!txt) continue;
    if (block.indexOf(k) >= 0) out += '<h4>' + esc(k) + '</h4><p>' + esc(txt) + '</p>';
    else out += '<div class="kv"><b>' + esc(k) + '</b>' + esc(txt).replace(/\n/g, '<br>') + '</div>';
  }
  return out || '<p>（暂无）</p>';
}

document.getElementById('panelClose').addEventListener('click', () => {
  panel.classList.add('hidden');
  document.body.classList.remove('panelOpen');
  for (const el of pinEls.values()) el.classList.remove('hit');
});

function zoomImg(src) {
  let z = document.getElementById('zoom');
  if (!z) {
    z = document.createElement('div');
    z.id = 'zoom';
    z.innerHTML = '<img alt="">';
    z.addEventListener('click', () => z.classList.add('hidden'));
    document.body.appendChild(z);
  }
  z.querySelector('img').src = src;
  z.classList.remove('hidden');
}

/* ---------------- 播放 ---------------- */
const btnPlay = document.getElementById('btnPlay');
let raf = null, lastT = 0;
const SPEED = 300;

function tick(t) {
  if (!playing) return;
  if (!lastT) lastT = t;
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  let y = curYear + dt * SPEED;
  if (y >= Y_MAX) { y = Y_MAX; stopPlay(); }
  setYear(Math.round(y));
  raf = requestAnimationFrame(tick);
}
function startPlay() {
  if (curYear >= Y_MAX) setYear(Y_MIN);
  playing = true; lastT = 0;
  btnPlay.textContent = '❚❚'; btnPlay.classList.add('on');
  raf = requestAnimationFrame(tick);
}
function stopPlay() {
  playing = false;
  if (raf) cancelAnimationFrame(raf);
  btnPlay.textContent = '▶'; btnPlay.classList.remove('on');
}
btnPlay.addEventListener('click', () => playing ? stopPlay() : startPlay());
slider.addEventListener('input', () => {
  stopPlay();
  setYear(Math.round(Y_MIN + slider.value / 1000 * (Y_MAX - Y_MIN)));
});

/* ---------------- 搜索 ---------------- */
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let SEARCH = null;

function allSearchable() {
  const arr = [];
  for (const n of nodes) arr.push({ t: n.title, sub: n.place, node: n.id, k: '节点' });
  for (const id in questions) {
    const q = questions[id];
    arr.push({ t: q.title, sub: q.years.join('、'), q: id, k: KIND_CN[q.kind] });
  }
  return arr;
}
function doSearch(kw) {
  if (!SEARCH) SEARCH = allSearchable();
  kw = kw.trim().toLowerCase();
  if (!kw) { searchResults.innerHTML = ''; return; }
  const hits = SEARCH.filter(x =>
    x.t.toLowerCase().indexOf(kw) >= 0 || (x.sub || '').toLowerCase().indexOf(kw) >= 0).slice(0, 40);
  searchResults.innerHTML = hits.length ? hits.map((x, i) =>
    '<div class="sr" data-i="' + i + '"><span class="sk">' + x.k + '</span>'
    + '<span>' + esc(x.t) + '</span><span class="st">' + esc(x.sub || '') + '</span></div>').join('')
    : '<div class="sr" style="color:#6b6257">没有找到</div>';

  searchResults.querySelectorAll('.sr').forEach(el => el.addEventListener('click', () => {
    const x = hits[+el.dataset.i];
    if (!x) return;
    if (x.node) {
      const n = nodes.find(n => n.id === x.node);
      setYear(n.year); openNode(x.node);
    } else if (x.q) {
      const q = questions[x.q];
      const nid = (q.nodes && q.nodes[0]) || null;
      if (nid) { const n = nodes.find(n => n.id === nid); setYear(n.year); openNode(nid); }
      setTimeout(() => {
        const cards = panelBody.querySelectorAll('.qcard');
        for (const c of cards) {
          const t = c.querySelector('.qtitle');
          if (t && t.textContent === q.title) {
            c.open = true; c.scrollIntoView({ block: 'center', behavior: 'smooth' }); break;
          }
        }
      }, 160);
    }
    searchBox.classList.add('hidden');
  }));
}
searchInput.addEventListener('input', e => doSearch(e.target.value));
document.getElementById('btnSearch').addEventListener('click', () => {
  searchBox.classList.toggle('hidden');
  if (!searchBox.classList.contains('hidden')) setTimeout(() => searchInput.focus(), 50);
});

/* ---------------- 速查 ---------------- */
const quickPanel = document.getElementById('quickPanel');
const quickTabs = document.getElementById('quickTabs');
const quickBody = document.getElementById('quickBody');
const QK = [['term', '名词'], ['short', '简答'], ['essay', '论述'], ['draw', '绘图']];
let quickKind = 'term';

function renderQuick() {
  quickTabs.innerHTML = QK.map(kv =>
    '<button data-k="' + kv[0] + '" class="' + (kv[0] === quickKind ? 'on' : '') + '">'
    + kv[1] + ' · ' + D.quick[kv[0]].length + '</button>').join('');
  quickTabs.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => { quickKind = b.dataset.k; renderQuick(); }));
  const list = D.quick[quickKind] || [];
  quickBody.innerHTML = list.length ? list.map(q =>
    '<details class="qcard"><summary>'
    + '<span class="kbadge ' + KIND_CLS[q.kind] + '">' + KIND_CN[q.kind] + '</span>'
    + '<span class="qtitle">' + esc(q.title) + '</span>'
    + '<span class="qyears">' + q.years.join('、') + '</span>'
    + '</summary><div class="qbody">' + renderQ(q) + '</div></details>').join('')
    : '<p style="color:#6b6257">无</p>';
}
document.getElementById('btnQuick').addEventListener('click', () => {
  quickPanel.classList.toggle('hidden');
  if (!quickPanel.classList.contains('hidden')) renderQuick();
});
document.getElementById('quickClose').addEventListener('click', () => quickPanel.classList.add('hidden'));

/* ---------------- 说明 ---------------- */
const about = document.getElementById('about');
document.getElementById('btnAbout').addEventListener('click', () => about.classList.remove('hidden'));
document.getElementById('aboutClose').addEventListener('click', () => about.classList.add('hidden'));
about.addEventListener('click', e => { if (e.target === about) about.classList.add('hidden'); });

/* ---------------- 键盘 ---------------- */
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') {
    if (e.key === 'Escape') { searchBox.classList.add('hidden'); e.target.blur(); }
    return;
  }
  if (e.key === ' ') { e.preventDefault(); playing ? stopPlay() : startPlay(); }
  else if (e.key === '/') { e.preventDefault(); searchBox.classList.remove('hidden'); searchInput.focus(); }
  else if (e.key === 'Escape') {
    panel.classList.add('hidden'); document.body.classList.remove('panelOpen'); searchBox.classList.add('hidden');
    quickPanel.classList.add('hidden'); about.classList.add('hidden');
  }
  else if (e.key === 'ArrowLeft') { stopPlay(); setYear(Math.max(Y_MIN, curYear - 20)); }
  else if (e.key === 'ArrowRight') { stopPlay(); setYear(Math.min(Y_MAX, curYear + 20)); }
});

/* ---------------- 启动 ---------------- */
function boot() {
  resize();
  buildRail();
  setYear(-1600);
  const ticks = document.getElementById('ticks');
  ticks.innerHTML = '';
  for (let y = -3000; y <= 2000; y += 250) {
    const i = document.createElement('i');
    i.style.left = (S(y) * 100) + '%';
    ticks.appendChild(i);
  }
  fetch('assets/world.geo.json').then(r => r.json()).then(g => {
    GEO = g; drawWorld(); placePins();
  }).catch(err => console.warn('map failed', err));

  addEventListener('resize', () => {
    clearTimeout(window.__rz);
    window.__rz = setTimeout(resize, 140);
  });
}
boot();
})();
