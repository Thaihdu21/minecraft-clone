'use strict';
/* ================= blocks.js — block/item registry + procedural texture atlas ================= */
const CHUNK_W = 16, CHUNK_H = 64, SEA_LEVEL = 30, ATLAS_DIM = 16;

/* deterministic per-pixel hash */
function pr(x, y, s) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 144665);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const hexc = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, f) => [Math.min(255, c[0] * f | 0), Math.min(255, c[1] * f | 0), Math.min(255, c[2] * f | 0)];

const Atlas = {
  canvas: null, ctx: null, n: 0, dataURL: null,
  uvOf(t) {
    const s = 1 / ATLAS_DIM, x = t % ATLAS_DIM, y = (t / ATLAS_DIM) | 0;
    return { u0: x * s, v0: 1 - (y + 1) * s, u1: (x + 1) * s, v1: 1 - y * s };
  }
};
function addTile(fn) {
  const t = Atlas.n++, tx = t % ATLAS_DIM, ty = (t / ATLAS_DIM) | 0;
  const img = Atlas.ctx.createImageData(16, 16);
  const R = (x, y) => pr(x, y, t * 7919 + 13);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = fn(x, y, R) || [0, 0, 0, 0], i = (y * 16 + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2];
    img.data[i + 3] = c.length > 3 ? c[3] : 255;
  }
  Atlas.ctx.putImageData(img, tx * 16, ty * 16);
  return t;
}

/* ---- tile painter factories ---- */
const plain = (hx, a = 0.14) => { const c = hexc(hx); return (x, y, R) => shade(c, 1 - a + R(x, y) * a * 2); };
const speck = (hx, sp, d = 0.12) => { const c = hexc(hx), s = hexc(sp); return (x, y, R) =>
  R(x + 31, y + 77) < d ? shade(s, 0.9 + R(x, y) * 0.2) : shade(c, 0.86 + R(x, y) * 0.28); };
const oreT = sp => { const c = hexc('#7d7d7d'), s = hexc(sp); return (x, y, R) =>
  R((x & ~1) + 31, (y & ~1) + 77) < 0.14 ? shade(s, 0.85 + R(x, y) * 0.3) : shade(c, 0.85 + R(x, y) * 0.3); };
const grassSideT = () => { const g = hexc('#5d9c3f'), d = hexc('#79553a'); return (x, y, R) => {
  const e = 2 + Math.floor(R(x, 99) * 3);
  return y < e ? shade(g, 0.85 + R(x, y) * 0.3) : shade(d, 0.82 + R(x, y) * 0.32); }; };
const snowSideT = (x, y, R) => y < 3 ? [238, 243, 248, 255] : shade(hexc('#79553a'), 0.82 + R(x, y) * 0.3);
const logSideT = b => { const c = hexc(b); return (x, y, R) => shade(c, (x % 4 === 0 ? 0.72 : 0.9) + R(x, y) * 0.18); };
const logTopT = (b, i2) => { const b2 = hexc(b), i = hexc(i2); return (x, y, R) => {
  const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
  return d > 6 ? shade(b2, 0.85 + R(x, y) * 0.25) : shade(i, ((d | 0) % 2 ? 0.8 : 0.95) + R(x, y) * 0.1); }; };
const leavesT = hx => { const c = hexc(hx); return (x, y, R) =>
  R(x, y) < 0.18 ? [0, 0, 0, 0] : shade(c, 0.7 + R(x + 5, y + 9) * 0.5); };
const planksT = hx => { const c = hexc(hx); return (x, y, R) => {
  let f = 0.85 + R(x, y) * 0.25;
  if (y % 4 === 3) f *= 0.7;
  if ((y >> 2) % 2 === 0 ? x === 7 : (x === 15 || x === 0)) f *= 0.75;
  return shade(c, f); }; };
const brickT = () => { const b = hexc('#96503c'), m = hexc('#b0a79d'); return (x, y, R) => {
  const off = ((y >> 2) % 2) * 4;
  if (y % 4 === 0 || (x + off) % 8 === 0) return shade(m, 0.9 + R(x, y) * 0.2);
  return shade(b, 0.85 + R(x, y) * 0.3); }; };
const stoneBrickT = (x, y, R) => { const c = hexc('#8a8a8a');
  if (y % 8 === 0 || x % 8 === ((y >> 3) % 2 ? 0 : 4)) return shade(c, 0.6);
  return shade(c, 0.85 + R(x, y) * 0.3); };
const glassT = (x, y) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return [205, 225, 235, 255];
  if ((x === 3 && y < 6) || (y === 3 && x < 6)) return [235, 248, 252, 170];
  return [0, 0, 0, 0]; };
const iceT = (x, y, R) => { const s = shade(hexc('#9ecfff'), 0.85 + R(x, y) * 0.3); return [s[0], s[1], s[2], 215]; };
const waterT = (x, y, R) => { const s = shade(hexc('#2a54c8'), 0.8 + R(x, y) * 0.35); return [s[0], s[1], s[2], 170]; };
const lavaT = (x, y, R) => { const r = R(x, y);
  const c = r < 0.3 ? hexc('#ffd83d') : r < 0.6 ? hexc('#ff8c1a') : hexc('#d63a0f');
  return shade(c, 0.85 + R(x + 3, y + 8) * 0.3); };
const cactusT = (x, y, R) => { let f = 0.85 + R(x, y) * 0.25;
  if (x % 4 === 1) f *= 0.72;
  if (R(x + 9, y + 3) < 0.06) return [30, 50, 20, 255];
  return shade(hexc('#4c7f2f'), f); };
const tallgrassT = (x, y, R) => (R(x, 0) < 0.55 && y > 3 + R(x, 7) * 8)
  ? shade(hexc('#5d9c3f'), 0.7 + R(x, y) * 0.5) : [0, 0, 0, 0];
const flowerT = petal => { const p = hexc(petal), g = hexc('#3e7a2a'); return (x, y, R) => {
  const dx = x - 7, dy = y - 4;
  if (dx * dx + dy * dy <= 5) return shade(p, 0.85 + R(x, y) * 0.3);
  if (x === 7 && y > 6 && y < 14) return g;
  if (y > 9 && y < 12 && Math.abs(dx) === 1) return g;
  return [0, 0, 0, 0]; }; };
const mushroomT = cap => { const c = hexc(cap), s = hexc('#d8cfc0'); return (x, y, R) => {
  const dx = x - 7.5;
  if (y >= 4 && y <= 8 && Math.abs(dx) < (y === 4 ? 3 : 5)) return shade(c, 0.85 + R(x, y) * 0.3);
  if (y > 8 && y < 14 && Math.abs(dx) < 1.6) return s;
  return [0, 0, 0, 0]; }; };
const saplingT = leaf => { const l = hexc(leaf), s = hexc('#6b4a2b'); return (x, y, R) => {
  const dx = x - 7.5, dy = y - 5;
  if (dx * dx + dy * dy < 18 && R(x, y) > 0.2) return shade(l, 0.8 + R(x, y) * 0.4);
  if (x >= 7 && x <= 8 && y > 8 && y < 14) return s;
  return [0, 0, 0, 0]; }; };
const torchT = (x, y) => { if (x >= 7 && x <= 8) {
  if (y >= 4 && y <= 5) return [255, 220, 80, 255];
  if (y > 5 && y < 14) return [110, 80, 45, 255]; } return [0, 0, 0, 0]; };
const rtorchT = (x, y) => { if (x >= 7 && x <= 8) {
  if (y >= 4 && y <= 5) return [255, 70, 60, 255];
  if (y > 5 && y < 14) return [110, 80, 45, 255]; } return [0, 0, 0, 0]; };
const caneT = (x, y, R) => (x === 4 || x === 5 || x === 10 || x === 11)
  ? shade(hexc('#8fce6a'), (y % 5 === 0 ? 0.7 : 0.9) + R(x, y) * 0.2) : [0, 0, 0, 0];
const wireT = (x, y) => ((x >= 7 && x <= 8) || (y >= 7 && y <= 8 && x > 4 && x < 11))
  ? [200, 30, 20, 255] : [0, 0, 0, 0];
const leverT = (x, y) => {
  if (y > 12 && x > 4 && x < 11) return [110, 110, 110, 255];
  if (x >= 7 && x <= 8 && y > 4 && y <= 12) return [130, 95, 60, 255];
  if (x >= 6 && x <= 9 && y >= 2 && y <= 4) return [220, 60, 50, 255];
  return [0, 0, 0, 0]; };
const tntSideT = (x, y, R) => {
  if (y >= 6 && y <= 9) return (y === 7 || y === 8) ? [235, 235, 235, 255] : [40, 40, 40, 255];
  return shade(hexc('#c8402a'), 0.85 + R(x, y) * 0.3); };
const furnaceFrontT = (x, y, R) => {
  if (y >= 9 && y <= 13 && x >= 4 && x <= 11)
    return (y >= 10 && R(x, y) < 0.55) ? [255, 140, 30, 255] : [25, 25, 25, 255];
  return shade(hexc('#8a8a8a'), 0.8 + R(x, y) * 0.3); };
const craftTopT = (x, y, R) => (x <= 1 || x >= 14 || y <= 1 || y >= 14 || x === 7 || x === 8 || y === 7 || y === 8)
  ? shade(hexc('#6b4a2b'), 0.9) : shade(hexc('#a8814f'), 0.85 + R(x, y) * 0.3);
const _pl = planksT('#9c7f4e');
const craftSideT = (x, y, R) => {
  if (y < 3) return shade(hexc('#6b4a2b'), 0.9);
  if (y < 9 && ((x > 2 && x < 7) || (x > 8 && x < 13))) return shade(hexc('#c9b27e'), 0.9 + R(x, y) * 0.2);
  return _pl(x, y, R); };
const chestT = (x, y, R) => { const c = hexc('#9a6b2f');
  if (x === 0 || x === 15 || y === 0 || y === 15) return shade(c, 0.55);
  if (y === 7) return [70, 70, 70, 255];
  if (y >= 6 && y <= 9 && x >= 7 && x <= 8) return [55, 55, 55, 255];
  return shade(c, 0.85 + R(x, y) * 0.3); };
const bookshelfT = (x, y, R) => {
  if (y < 2 || y > 13 || (y > 6 && y < 9)) return _pl(x, y, R);
  const col = [[170, 50, 40], [60, 90, 160], [70, 130, 60], [160, 140, 60]][((x >> 1) + (y > 6 ? 2 : 0)) % 4];
  return x % 2 === 0 ? [col[0], col[1], col[2], 255] : shade(col, 0.7); };

/* item icon painters */
const stickT = (x, y, R) => (Math.abs(x - (15 - y)) <= 1 && x > 2 && x < 13)
  ? shade(hexc('#8a5a2b'), 0.85 + R(x, y) * 0.3) : [0, 0, 0, 0];
const lumpT = hx => { const c = hexc(hx); return (x, y, R) => {
  const dx = x - 7.5, dy = y - 8;
  return dx * dx + dy * dy < 20 ? shade(c, 0.75 + R(x, y) * 0.5) : [0, 0, 0, 0]; }; };
const ingotT = hx => { const c = hexc(hx); return (x, y, R) =>
  (y >= 6 && y <= 11 && x >= 2 && x <= 13)
    ? shade(c, (y === 6 || x === 2) ? 1.15 : 0.85 + R(x, y) * 0.2) : [0, 0, 0, 0]; };
const gemT = hx => { const c = hexc(hx); return (x, y, R) =>
  (Math.abs(x - 7.5) + Math.abs(y - 8) < 6) ? shade(c, 0.8 + R(x, y) * 0.5) : [0, 0, 0, 0]; };
const meatT = hx => { const c = hexc(hx); return (x, y, R) => {
  const dx = x - 7.5, dy = y - 8;
  return dx * dx * 0.7 + dy * dy < 22 ? shade(c, 0.8 + R(x, y) * 0.35) : [0, 0, 0, 0]; }; };
const toolT = (type, mat) => { const m = hexc(mat), h = hexc('#8a5a2b'); return (x, y, R) => {
  if (type === 'sword') {
    const d = x - (15 - y);
    if (Math.abs(d) <= 1 && x >= 5) return shade(m, 0.9 + R(x, y) * 0.2);
    if (Math.abs(d) <= 1 && x < 5) return shade(h, 0.9);
    if (Math.abs(d) === 2 && x >= 3 && x <= 6) return [70, 70, 70, 255];
    return [0, 0, 0, 0];
  }
  let head = false;
  if (type === 'pickaxe') head = (y >= 1 && y <= 3 && x >= 5) || (x >= 12 && y <= 7);
  if (type === 'axe') head = x >= 9 && x <= 14 && y >= 1 && y <= 6 && !(x >= 13 && y >= 5);
  if (type === 'shovel') head = x >= 11 && y <= 4;
  if (head) return shade(m, 0.85 + R(x, y) * 0.3);
  if (Math.abs(x - (15 - y)) <= 1 && x > 1 && x < 12) return shade(h, 0.85 + R(x, y) * 0.2);
  return [0, 0, 0, 0]; }; };
const armorT = (part, mat) => { const m = hexc(mat); return (x, y, R) => {
  const s = shade(m, 0.85 + R(x, y) * 0.25);
  if (part === 'helmet') return (y >= 4 && y <= 10 && x >= 3 && x <= 12 && !(y >= 8 && x >= 6 && x <= 9)) ? s : [0, 0, 0, 0];
  if (part === 'chest') return (y >= 3 && y <= 13 && x >= 2 && x <= 13 && !(y <= 6 && x >= 6 && x <= 9)) ? s : [0, 0, 0, 0];
  if (part === 'legs') return (y >= 3 && y <= 13 && x >= 3 && x <= 12 && !(y >= 7 && x >= 6 && x <= 9)) ? s : [0, 0, 0, 0];
  return (y >= 8 && y <= 13 && ((x >= 2 && x <= 6) || (x >= 9 && x <= 13)) && !(y < 10 && x > 4 && x < 11)) ? s : [0, 0, 0, 0]; }; };
const featherT = (x, y, R) => (Math.abs(x - (15 - y)) <= 2 && x > 2 && x < 13)
  ? [235, 235, 235, 255] : [0, 0, 0, 0];
const boneT = (x, y) => ((Math.abs(x - (15 - y)) <= 1 && x > 3 && x < 12) ||
  (x < 5 && y > 10 && Math.abs(x - (14 - y)) < 3) || (x > 10 && y < 5 && Math.abs(x - (16 - y)) < 3))
  ? [232, 228, 210, 255] : [0, 0, 0, 0];
const arrowT = (x, y) => {
  const d = x - (15 - y);
  if (Math.abs(d) <= 0 && x > 1 && x < 14) return [140, 100, 60, 255];
  if (x > 11 && y < 4 && Math.abs(d) <= 2) return [190, 190, 190, 255];
  if (x < 4 && y > 11 && Math.abs(d) <= 2) return [240, 240, 240, 255];
  return [0, 0, 0, 0]; };
const appleT = (x, y, R) => {
  const dx = x - 7.5, dy = y - 9;
  if (dx * dx + dy * dy < 22) return shade(hexc('#d1372c'), 0.8 + R(x, y) * 0.35);
  if (x >= 7 && x <= 8 && y >= 3 && y <= 5) return [90, 60, 30, 255];
  return [0, 0, 0, 0]; };

/* ================= registries ================= */
const BlockDefs = [], ItemDefs = {};
function def(id) { return id < 256 ? BlockDefs[id] : ItemDefs[id]; }
function B(id, name, o) {
  BlockDefs[id] = Object.assign({
    id, name, item: false, solid: true, transparent: false, cross: false, liquid: false,
    hardness: 1, tool: null, requiresTool: false, minTier: 0, drops: [[id, 1, 1, 1]],
    light: 0, gravity: false, flammable: false, stack: 64, tiles: null, icon: 0
  }, o);
}
function I(id, name, o) { ItemDefs[id] = Object.assign({ id, name, item: true, stack: 64, icon: 0 }, o); }

function initBlocks() {
  Atlas.canvas = document.createElement('canvas');
  Atlas.canvas.width = Atlas.canvas.height = ATLAS_DIM * 16;
  Atlas.ctx = Atlas.canvas.getContext('2d');
  const t = {};
  t.grassTop = addTile(plain('#5d9c3f', 0.18)); t.dirt = addTile(plain('#79553a', 0.16));
  t.grassSide = addTile(grassSideT()); t.stone = addTile(plain('#7d7d7d'));
  t.cobble = addTile(speck('#7d7d7d', '#5c5c5c', 0.35)); t.bedrock = addTile(speck('#454545', '#222222', 0.4));
  t.sand = addTile(plain('#dbd3a0', 0.12)); t.gravel = addTile(speck('#8a8079', '#6a625c', 0.3));
  t.water = addTile(waterT); t.lava = addTile(lavaT);
  t.oakLog = addTile(logSideT('#6b4a2b')); t.oakTop = addTile(logTopT('#6b4a2b', '#a8814f'));
  t.oakLeaf = addTile(leavesT('#3e7a2a')); t.oakPlank = addTile(planksT('#9c7f4e'));
  t.birchLog = addTile(logSideT('#d5d0c0')); t.birchTop = addTile(logTopT('#d5d0c0', '#c9b27e'));
  t.birchLeaf = addTile(leavesT('#59924a')); t.birchPlank = addTile(planksT('#c9b27e'));
  t.sprLog = addTile(logSideT('#4a3520')); t.sprTop = addTile(logTopT('#4a3520', '#7a5c35'));
  t.sprLeaf = addTile(leavesT('#2c5530')); t.sprPlank = addTile(planksT('#7a5c35'));
  t.coalOre = addTile(oreT('#242424')); t.ironOre = addTile(oreT('#c8a080'));
  t.goldOre = addTile(oreT('#f0d040')); t.diaOre = addTile(oreT('#4ee0d8'));
  t.glass = addTile(glassT);
  t.craftTop = addTile(craftTopT); t.craftSide = addTile(craftSideT);
  t.furnace = addTile(furnaceFrontT); t.furnaceSide = addTile(speck('#8a8a8a', '#6f6f6f', 0.3));
  t.chest = addTile(chestT); t.tntSide = addTile(tntSideT); t.tntTop = addTile(speck('#c8402a', '#8a2a1a', 0.3));
  t.bookshelf = addTile(bookshelfT); t.brick = addTile(brickT()); t.stoneBrick = addTile(stoneBrickT);
  t.mossy = addTile(speck('#7d7d7d', '#5a7a45', 0.3)); t.obsidian = addTile(speck('#1a1024', '#3a2a55', 0.25));
  t.snow = addTile(plain('#eef3f8', 0.06)); t.snowSide = addTile(snowSideT);
  t.ice = addTile(iceT); t.clay = addTile(plain('#9aa3b0', 0.1)); t.sandstone = addTile(planksT('#d8cf9a'));
  t.cactusSide = addTile(cactusT); t.cactusTop = addTile(plain('#5a9138', 0.15));
  t.cane = addTile(caneT); t.tallgrass = addTile(tallgrassT);
  t.flowerR = addTile(flowerT('#d1372c')); t.flowerY = addTile(flowerT('#e8d545'));
  t.mushR = addTile(mushroomT('#c23a2f')); t.mushB = addTile(mushroomT('#9a7a5a'));
  t.sapO = addTile(saplingT('#3e7a2a')); t.sapB = addTile(saplingT('#59924a')); t.sapS = addTile(saplingT('#2c5530'));
  t.torch = addTile(torchT);
  t.woolW = addTile(plain('#e8e8e8', 0.1)); t.woolR = addTile(plain('#b03030', 0.1));
  t.woolB = addTile(plain('#3a4fb0', 0.1)); t.woolG = addTile(plain('#4a8f3a', 0.1));
  t.woolY = addTile(plain('#d8c53a', 0.1)); t.woolK = addTile(plain('#2a2a2a', 0.1));
  t.coalB = addTile(plain('#242424', 0.2)); t.ironB = addTile(plain('#d8d8d8', 0.08));
  t.goldB = addTile(plain('#f0d040', 0.12)); t.diaB = addTile(plain('#4ee0d8', 0.12));
  t.glow = addTile(speck('#b98a3e', '#ffe07a', 0.35));
  t.lever = addTile(leverT); t.rtorch = addTile(rtorchT); t.wire = addTile(wireT);

  /* item icons */
  const it = {};
  it.stick = addTile(stickT); it.coal = addTile(lumpT('#242424'));
  it.iron = addTile(ingotT('#d8d8d8')); it.gold = addTile(ingotT('#f0d040')); it.dia = addTile(gemT('#4ee0d8'));
  it.porkR = addTile(meatT('#e79c9c')); it.porkC = addTile(meatT('#b07050'));
  it.beefR = addTile(meatT('#c04040')); it.beefC = addTile(meatT('#7a4530'));
  it.chikR = addTile(meatT('#e8c8b0')); it.chikC = addTile(meatT('#c08a50'));
  it.mutR = addTile(meatT('#d06060')); it.mutC = addTile(meatT('#8a5038'));
  it.apple = addTile(appleT); it.string = addTile(lumpT('#e0e0e0'));
  it.gunp = addTile(lumpT('#5a5a5a')); it.bone = addTile(boneT);
  it.arrow = addTile(arrowT); it.feather = addTile(featherT); it.rotten = addTile(lumpT('#6a8a3a'));
  const toolTiles = {};
  [['wood', '#9c7f4e'], ['stone', '#8a8a8a'], ['iron', '#d8d8d8'], ['diamond', '#4ee0d8']].forEach(([m, c]) => {
    ['sword', 'pickaxe', 'axe', 'shovel'].forEach(tp => { toolTiles[m + tp] = addTile(toolT(tp, c)); });
  });
  const armTiles = {};
  [['iron', '#d8d8d8'], ['diamond', '#4ee0d8']].forEach(([m, c]) => {
    ['helmet', 'chest', 'legs', 'boots'].forEach(p => { armTiles[m + p] = addTile(armorT(p, c)); });
  });

  const t3 = (top, side, bot) => ({ top, side, bottom: bot === undefined ? side : bot });
  const t1 = a => ({ top: a, side: a, bottom: a });

  /* ---- 62 block types ---- */
  B(0, 'Air', { solid: false, transparent: true, drops: [] });
  B(1, 'Grass Block', { tiles: t3(t.grassTop, t.grassSide, t.dirt), hardness: 0.6, tool: 'shovel', drops: [[2, 1, 1, 1]] });
  B(2, 'Dirt', { tiles: t1(t.dirt), hardness: 0.5, tool: 'shovel' });
  B(3, 'Stone', { tiles: t1(t.stone), hardness: 1.5, tool: 'pickaxe', requiresTool: true, drops: [[4, 1, 1, 1]] });
  B(4, 'Cobblestone', { tiles: t1(t.cobble), hardness: 2, tool: 'pickaxe', requiresTool: true });
  B(5, 'Bedrock', { tiles: t1(t.bedrock), hardness: -1, drops: [] });
  B(6, 'Sand', { tiles: t1(t.sand), hardness: 0.5, tool: 'shovel', gravity: true });
  B(7, 'Gravel', { tiles: t1(t.gravel), hardness: 0.6, tool: 'shovel', gravity: true });
  B(8, 'Water', { tiles: t1(t.water), solid: false, transparent: true, liquid: true, hardness: -1, drops: [] });
  B(9, 'Lava', { tiles: t1(t.lava), solid: false, transparent: true, liquid: true, hardness: -1, light: 13, drops: [] });
  B(10, 'Oak Log', { tiles: t3(t.oakTop, t.oakLog), hardness: 2, tool: 'axe', flammable: true });
  B(11, 'Oak Leaves', { tiles: t1(t.oakLeaf), transparent: true, hardness: 0.3, flammable: true, drops: [[45, 1, 1, 0.08], [269, 1, 1, 0.05]] });
  B(12, 'Oak Planks', { tiles: t1(t.oakPlank), hardness: 2, tool: 'axe', flammable: true });
  B(13, 'Birch Log', { tiles: t3(t.birchTop, t.birchLog), hardness: 2, tool: 'axe', flammable: true });
  B(14, 'Birch Leaves', { tiles: t1(t.birchLeaf), transparent: true, hardness: 0.3, flammable: true, drops: [[46, 1, 1, 0.08]] });
  B(15, 'Birch Planks', { tiles: t1(t.birchPlank), hardness: 2, tool: 'axe', flammable: true });
  B(16, 'Spruce Log', { tiles: t3(t.sprTop, t.sprLog), hardness: 2, tool: 'axe', flammable: true });
  B(17, 'Spruce Leaves', { tiles: t1(t.sprLeaf), transparent: true, hardness: 0.3, flammable: true, drops: [[47, 1, 1, 0.08]] });
  B(18, 'Spruce Planks', { tiles: t1(t.sprPlank), hardness: 2, tool: 'axe', flammable: true });
  B(19, 'Coal Ore', { tiles: t1(t.coalOre), hardness: 3, tool: 'pickaxe', requiresTool: true, drops: [[257, 1, 2, 1]] });
  B(20, 'Iron Ore', { tiles: t1(t.ironOre), hardness: 3, tool: 'pickaxe', requiresTool: true, minTier: 2 });
  B(21, 'Gold Ore', { tiles: t1(t.goldOre), hardness: 3, tool: 'pickaxe', requiresTool: true, minTier: 3 });
  B(22, 'Diamond Ore', { tiles: t1(t.diaOre), hardness: 3, tool: 'pickaxe', requiresTool: true, minTier: 3, drops: [[260, 1, 1, 1]] });
  B(23, 'Glass', { tiles: t1(t.glass), transparent: true, hardness: 0.3, drops: [] });
  B(24, 'Crafting Table', { tiles: t3(t.craftTop, t.craftSide, t.oakPlank), hardness: 2.5, tool: 'axe', flammable: true });
  B(25, 'Furnace', { tiles: t3(t.furnaceSide, t.furnace, t.furnaceSide), hardness: 3.5, tool: 'pickaxe', requiresTool: true });
  B(26, 'Chest', { tiles: t3(t.oakPlank, t.chest, t.oakPlank), hardness: 2.5, tool: 'axe', flammable: true });
  B(27, 'TNT', { tiles: t3(t.tntTop, t.tntSide, t.tntTop), hardness: 0.2 });
  B(28, 'Bookshelf', { tiles: t3(t.oakPlank, t.bookshelf, t.oakPlank), hardness: 1.5, tool: 'axe', flammable: true });
  B(29, 'Bricks', { tiles: t1(t.brick), hardness: 2, tool: 'pickaxe', requiresTool: true });
  B(30, 'Stone Bricks', { tiles: t1(t.stoneBrick), hardness: 1.5, tool: 'pickaxe', requiresTool: true });
  B(31, 'Mossy Cobblestone', { tiles: t1(t.mossy), hardness: 2, tool: 'pickaxe', requiresTool: true });
  B(32, 'Obsidian', { tiles: t1(t.obsidian), hardness: 30, tool: 'pickaxe', requiresTool: true, minTier: 4 });
  B(33, 'Snow Block', { tiles: t1(t.snow), hardness: 0.2, tool: 'shovel' });
  B(34, 'Snowy Grass', { tiles: t3(t.snow, t.snowSide, t.dirt), hardness: 0.6, tool: 'shovel', drops: [[2, 1, 1, 1]] });
  B(35, 'Ice', { tiles: t1(t.ice), transparent: true, hardness: 0.5, tool: 'pickaxe', drops: [] });
  B(36, 'Clay', { tiles: t1(t.clay), hardness: 0.6, tool: 'shovel' });
  B(37, 'Sandstone', { tiles: t1(t.sandstone), hardness: 0.8, tool: 'pickaxe', requiresTool: true });
  B(38, 'Cactus', { tiles: t3(t.cactusTop, t.cactusSide), hardness: 0.4, flammable: true });
  B(39, 'Sugar Cane', { tiles: t1(t.cane), solid: false, cross: true, transparent: true, hardness: 0, flammable: true });
  B(40, 'Tall Grass', { tiles: t1(t.tallgrass), solid: false, cross: true, transparent: true, hardness: 0, flammable: true, drops: [] });
  B(41, 'Poppy', { tiles: t1(t.flowerR), solid: false, cross: true, transparent: true, hardness: 0 });
  B(42, 'Dandelion', { tiles: t1(t.flowerY), solid: false, cross: true, transparent: true, hardness: 0 });
  B(43, 'Red Mushroom', { tiles: t1(t.mushR), solid: false, cross: true, transparent: true, hardness: 0 });
  B(44, 'Brown Mushroom', { tiles: t1(t.mushB), solid: false, cross: true, transparent: true, hardness: 0 });
  B(45, 'Oak Sapling', { tiles: t1(t.sapO), solid: false, cross: true, transparent: true, hardness: 0, flammable: true });
  B(46, 'Birch Sapling', { tiles: t1(t.sapB), solid: false, cross: true, transparent: true, hardness: 0, flammable: true });
  B(47, 'Spruce Sapling', { tiles: t1(t.sapS), solid: false, cross: true, transparent: true, hardness: 0, flammable: true });
  B(48, 'Torch', { tiles: t1(t.torch), solid: false, cross: true, transparent: true, hardness: 0, light: 14 });
  B(49, 'White Wool', { tiles: t1(t.woolW), hardness: 0.8, flammable: true });
  B(50, 'Red Wool', { tiles: t1(t.woolR), hardness: 0.8, flammable: true });
  B(51, 'Blue Wool', { tiles: t1(t.woolB), hardness: 0.8, flammable: true });
  B(52, 'Green Wool', { tiles: t1(t.woolG), hardness: 0.8, flammable: true });
  B(53, 'Yellow Wool', { tiles: t1(t.woolY), hardness: 0.8, flammable: true });
  B(54, 'Black Wool', { tiles: t1(t.woolK), hardness: 0.8, flammable: true });
  B(55, 'Coal Block', { tiles: t1(t.coalB), hardness: 5, tool: 'pickaxe', requiresTool: true });
  B(56, 'Iron Block', { tiles: t1(t.ironB), hardness: 5, tool: 'pickaxe', requiresTool: true, minTier: 2 });
  B(57, 'Gold Block', { tiles: t1(t.goldB), hardness: 3, tool: 'pickaxe', requiresTool: true, minTier: 3 });
  B(58, 'Diamond Block', { tiles: t1(t.diaB), hardness: 5, tool: 'pickaxe', requiresTool: true, minTier: 3 });
  B(59, 'Glowstone', { tiles: t1(t.glow), hardness: 0.3, light: 15 });
  B(60, 'Lever', { tiles: t1(t.lever), solid: false, cross: true, transparent: true, hardness: 0 });
  B(61, 'Redstone Torch', { tiles: t1(t.rtorch), solid: false, cross: true, transparent: true, hardness: 0, light: 7 });
  B(62, 'Redstone Wire', { tiles: t1(t.wire), solid: false, cross: true, transparent: true, hardness: 0 });
  BlockDefs.forEach(d => { if (d && d.tiles) d.icon = d.id === 1 || d.id === 34 ? d.tiles.side : d.tiles.side; });

  /* ---- items ---- */
  I(256, 'Stick', { icon: it.stick });
  I(257, 'Coal', { icon: it.coal }); I(258, 'Iron Ingot', { icon: it.iron });
  I(259, 'Gold Ingot', { icon: it.gold }); I(260, 'Diamond', { icon: it.dia });
  I(261, 'Raw Porkchop', { icon: it.porkR, food: 3 }); I(262, 'Cooked Porkchop', { icon: it.porkC, food: 8 });
  I(263, 'Raw Beef', { icon: it.beefR, food: 3 }); I(264, 'Steak', { icon: it.beefC, food: 8 });
  I(265, 'Raw Chicken', { icon: it.chikR, food: 2 }); I(266, 'Cooked Chicken', { icon: it.chikC, food: 6 });
  I(267, 'Raw Mutton', { icon: it.mutR, food: 2 }); I(268, 'Cooked Mutton', { icon: it.mutC, food: 6 });
  I(269, 'Apple', { icon: it.apple, food: 4 });
  I(270, 'String', { icon: it.string }); I(271, 'Gunpowder', { icon: it.gunp });
  I(272, 'Bone', { icon: it.bone }); I(273, 'Arrow', { icon: it.arrow });
  I(274, 'Feather', { icon: it.feather }); I(275, 'Rotten Flesh', { icon: it.rotten, food: 2 });
  const tiers = [['Wooden', 'wood', 1, 60, 0], ['Stone', 'stone', 2, 132, 1],
    ['Iron', 'iron', 3, 251, 2], ['Diamond', 'diamond', 4, 1562, 3]];
  tiers.forEach(([nm, key, tier, dur, i]) => {
    const base = 280 + i * 4;
    I(base, nm + ' Sword', { icon: toolTiles[key + 'sword'], tool: 'sword', tier, dur, dmg: 3 + tier, stack: 1 });
    I(base + 1, nm + ' Pickaxe', { icon: toolTiles[key + 'pickaxe'], tool: 'pickaxe', tier, dur, dmg: 1 + tier, stack: 1 });
    I(base + 2, nm + ' Axe', { icon: toolTiles[key + 'axe'], tool: 'axe', tier, dur, dmg: 2 + tier, stack: 1 });
    I(base + 3, nm + ' Shovel', { icon: toolTiles[key + 'shovel'], tool: 'shovel', tier, dur, dmg: 1 + tier, stack: 1 });
  });
  [['Iron', 'iron', 300, [3, 6, 5, 2], 165], ['Diamond', 'diamond', 304, [4, 8, 6, 3], 363]]
    .forEach(([nm, key, base, pts, dur]) => {
      ['Helmet', 'Chestplate', 'Leggings', 'Boots'].forEach((p, i) => {
        I(base + i, nm + ' ' + p, {
          icon: armTiles[key + ['helmet', 'chest', 'legs', 'boots'][i]],
          armor: pts[i], slot: i, dur, stack: 1
        });
      });
    });
  Atlas.dataURL = Atlas.canvas.toDataURL();
}
function iconTile(id) { const d = def(id); return d ? d.icon : 0; }
