'use strict';
/* ============ worker.js — self-contained terrain generator + Web Worker pool ============
   WorldGenFactory is a pure function (no outer references) so its source can be
   serialized into a Blob Worker. Falls back to main-thread generation if Workers
   are unavailable (e.g. some file:// sandboxes). Block IDs are hardcoded to match blocks.js. */

function WorldGenFactory(seed) {
  seed = seed | 0;
  function h2(x, y) {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 974711);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function h3(x, y, z) {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 974711);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  const sm = t => t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
    return L(L(h2(xi, yi), h2(xi + 1, yi), u), L(h2(xi, yi + 1), h2(xi + 1, yi + 1), u), v);
  }
  function fbm2(x, y, o) {
    let v = 0, a = 0.5, f = 1, s = 0;
    for (let i = 0; i < o; i++) { v += a * n2(x * f, y * f); s += a; a *= 0.5; f *= 2; }
    return v / s;
  }
  function n3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    return L(
      L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
      L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
  }
  const SEA = 30;
  function climate(wx, wz) {
    return {
      t: fbm2(wx * 0.004 + 333, wz * 0.004 + 333, 3),
      m: fbm2(wx * 0.004 - 333, wz * 0.004 - 333, 3),
      mt: fbm2(wx * 0.0015 + 777, wz * 0.0015 + 777, 4)
    };
  }
  function heightAt(wx, wz) {
    const c = climate(wx, wz);
    let h = 24 + fbm2(wx * 0.012, wz * 0.012, 4) * 16;
    if (c.mt > 0.58) h += (c.mt - 0.58) * 140;                       // mountains
    h += (fbm2(wx * 0.05, wz * 0.05, 2) - 0.5) * 6;                  // cliffs / roughness
    const rv = fbm2(wx * 0.01 + 999, wz * 0.01 - 999, 3);            // ravines
    if (rv > 0.63 && rv < 0.66) h -= (0.015 - Math.abs(rv - 0.645)) * 900;
    return Math.max(4, Math.min(60, h | 0));
  }
  function biomeAt(wx, wz) {
    const c = climate(wx, wz), h = heightAt(wx, wz);
    if (h < SEA - 1) return 'ocean';
    if (c.mt > 0.66) return 'mountains';
    if (c.t < 0.36) return 'snow';
    if (c.t > 0.6 && c.m < 0.45) return 'desert';
    if (c.m > 0.55) return 'forest';
    return 'plains';
  }
  function treeAt(wx, wz) {
    const b = biomeAt(wx, wz), h = heightAt(wx, wz);
    if (h < SEA) return null;
    const r = h2(wx * 3 + 11, wz * 3 + 29);
    let dens = 0, type = 'oak';
    if (b === 'forest') { dens = 0.014; type = r > 0.45 ? 'oak' : 'birch'; }
    else if (b === 'plains') dens = 0.0018;
    else if (b === 'snow') { dens = 0.009; type = 'spruce'; }
    else if (b === 'mountains') { dens = 0.004; type = 'spruce'; }
    if (h2(wx * 7 + 5, wz * 7 + 3) < dens) return { type, h, ht: 4 + ((h2(wx, wz) * 4) | 0) };
    return null;
  }
  function set(d, x, y, z, id, soft) {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y < 0 || y > 63) return;
    const i = x + z * 16 + y * 256;
    if (soft && d[i] !== 0) return;
    d[i] = id;
  }
  function placeTree(d, x, z, t) {
    const y0 = t.h + 1;
    if (t.type === 'spruce') {
      const H = t.ht + 3;
      for (let i = 0; i < H; i++) set(d, x, y0 + i, z, 16);
      let r = 2;
      for (let ly = y0 + 2; ly < y0 + H; ly++) {
        const rad = Math.max(0, r | 0);
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++)
          if ((dx || dz) && Math.abs(dx) + Math.abs(dz) <= rad) set(d, x + dx, ly, z + dz, 17, true);
        r -= 0.45;
      }
      set(d, x, y0 + H, z, 17, true); set(d, x, y0 + H + 1, z, 17, true);
    } else {
      const log = t.type === 'birch' ? 13 : 10, leaf = t.type === 'birch' ? 14 : 11, H = t.ht;
      for (let i = 0; i < H; i++) set(d, x, y0 + i, z, log);
      for (let dy = H - 2; dy <= H + 1; dy++) {
        const rad = dy >= H ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < H) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && h2(x * 31 + dx + dy, z * 31 + dz) < 0.5) continue;
          set(d, x + dx, y0 + dy, z + dz, leaf, true);
        }
      }
    }
  }
  function generate(cx, cz) {
    const d = new Uint8Array(16384);
    const I = (x, y, z) => x + z * 16 + y * 256;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const h = heightAt(wx, wz), b = biomeAt(wx, wz), cl = climate(wx, wz);
      for (let y = 0; y <= h; y++) {
        let id = 3;
        if (y === 0) id = 5;
        else {
          const cave = y > 2 && y < h - 2 && n3(wx * 0.09, y * 0.11, wz * 0.09) > 0.73;
          if (cave) id = y < 7 ? 9 : 0;
          else if (y > h - 4) {
            if (b === 'desert') id = 6;
            else if (b === 'ocean') id = h2(wx + 7, wz + 13) < 0.25 ? 36 : 6;
            else if (y === h) id = b === 'snow' ? 34 : (b === 'mountains' && h > 46 ? 3 : 1);
            else id = 2;
          } else {
            const r = h3(wx, y, wz);
            if (r < 0.006 && y <= 50) id = 19;
            else if (r < 0.010 && y <= 40) id = 20;
            else if (r < 0.012 && y <= 25) id = 21;
            else if (r < 0.0135 && y <= 15) id = 22;
          }
        }
        d[I(x, y, z)] = id;
      }
      if (h < SEA) {
        for (let y = h + 1; y <= SEA; y++) d[I(x, y, z)] = 8;
        if (cl.t < 0.36) d[I(x, SEA, z)] = 35;
      } else {
        const top = d[I(x, h, z)], r = h2(wx * 13 + 1, wz * 13 + 7);
        if (top === 1 && h < 63) {
          if (r < 0.10) d[I(x, h + 1, z)] = 40;
          else if (r < 0.115) d[I(x, h + 1, z)] = h2(wx, wz + 5) < 0.5 ? 41 : 42;
          else if (b === 'forest' && r < 0.122) d[I(x, h + 1, z)] = h2(wx + 9, wz) < 0.5 ? 43 : 44;
        }
        if (top === 6 && b === 'desert' && r > 0.995) {
          const ch = 1 + ((r * 1000) | 0) % 3;
          for (let i = 1; i <= ch && h + i < 63; i++) d[I(x, h + i, z)] = 38;
        }
        if ((top === 1 || top === 6) && h === SEA && r > 0.96) {
          if (heightAt(wx + 1, wz) < SEA || heightAt(wx - 1, wz) < SEA ||
              heightAt(wx, wz + 1) < SEA || heightAt(wx, wz - 1) < SEA) {
            const ch = 2 + ((r * 100) | 0) % 2;
            for (let i = 1; i <= ch && h + i < 63; i++) d[I(x, h + i, z)] = 39;
          }
        }
      }
    }
    for (let tx = -3; tx < 19; tx++) for (let tz = -3; tz < 19; tz++) {
      const t = treeAt(cx * 16 + tx, cz * 16 + tz);
      if (t) placeTree(d, tx, tz, t);
    }
    return d;
  }
  return { generate, heightAt, biomeAt, treeAt };
}

/* -------- worker pool (Blob worker, main-thread fallback) -------- */
const GenPool = (function () {
  try {
    const src = 'const factory=' + WorldGenFactory.toString() + ';const gens={};' +
      'self.onmessage=function(e){const d=e.data;const g=gens[d.seed]||(gens[d.seed]=factory(d.seed));' +
      'const out=g.generate(d.cx,d.cz);self.postMessage({cx:d.cx,cz:d.cz,data:out},[out.buffer]);};';
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    const workers = [], cbs = new Map(); let rr = 0;
    const nW = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < nW; i++) {
      const w = new Worker(url);
      w.onmessage = e => {
        const k = e.data.cx + ',' + e.data.cz, cb = cbs.get(k);
        cbs.delete(k);
        if (cb) cb(new Uint8Array(e.data.data.buffer || e.data.data));
      };
      workers.push(w);
    }
    // smoke-test: some browsers throw asynchronously; wrap request in try
    return {
      threaded: true,
      request(seed, cx, cz, cb) {
        cbs.set(cx + ',' + cz, cb);
        workers[rr++ % workers.length].postMessage({ seed, cx, cz });
      }
    };
  } catch (e) {
    let g = null, gs = null;
    return {
      threaded: false,
      request(seed, cx, cz, cb) {
        if (gs !== seed) { g = WorldGenFactory(seed); gs = seed; }
        setTimeout(() => cb(g.generate(cx, cz)), 0);
      }
    };
  }
})();
