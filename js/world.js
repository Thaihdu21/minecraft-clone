'use strict';
/* ============ world.js — chunk storage, meshing (culled faces + AO), block updates ============ */

const FACES = [
  { n: [1, 0, 0],  o: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], sh: 0.80 },
  { n: [-1, 0, 0], o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], sh: 0.80 },
  { n: [0, 1, 0],  o: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], sh: 1.00 },
  { n: [0, -1, 0], o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], sh: 0.55 },
  { n: [0, 0, 1],  o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], sh: 0.65 },
  { n: [0, 0, -1], o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], sh: 0.65 }
];
const AO_CURVE = [0.45, 0.65, 0.82, 1.0];
const pk = (x, y, z) => x + ',' + y + ',' + z;

class World {
  constructor(seed) {
    this.seed = seed;
    this.gen = WorldGenFactory(seed);
    this.chunks = new Map();       // "cx,cz" -> {cx,cz,data,meshes[]}
    this.edits = {};               // "cx,cz" -> {idx: id}
    this.pending = new Set();
    this.dirty = new Set();
    this.group = new THREE.Group();
    this.containers = new Map();   // "x,y,z" -> {type,items,...}
    this.liquid = new Map();       // "x,y,z" -> flow level
    this.waterQ = new Set(); this.lavaQ = new Set();
    this.updateQ = new Set();      // gravity / support checks
    this.saplings = new Map();     // "x,y,z" -> {time,type}
    this.tnt = [];                 // {x,y,z,t}
    this.lights = new Map();       // "x,y,z" -> THREE.PointLight
    this.materials = null;
    this._wT = 0; this._lT = 0; this._uT = 0;
  }
  ckey(cx, cz) { return cx + ',' + cz; }
  getBlock(x, y, z) {
    y = Math.floor(y);
    if (y < 0) return 5;
    if (y >= CHUNK_H) return 0;
    x = Math.floor(x); z = Math.floor(z);
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.chunks.get(this.ckey(cx, cz));
    if (!c) return 3; // treat unloaded as stone (no falling through / no seams)
    return c.data[(x - cx * 16) + (z - cz * 16) * 16 + y * 256];
  }
  isSolid(x, y, z) { const d = BlockDefs[this.getBlock(x, y, z)]; return !!(d && d.solid); }
  isLoaded(x, z) {
    return this.chunks.has(this.ckey(Math.floor(x / 16), Math.floor(z / 16)));
  }
  setBlock(x, y, z, id, record = true) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0 || y >= CHUNK_H) return;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const key = this.ckey(cx, cz), lx = x - cx * 16, lz = z - cz * 16;
    const idx = lx + lz * 16 + y * 256;
    if (record) (this.edits[key] = this.edits[key] || {})[idx] = id;
    const c = this.chunks.get(key);
    const old = c ? c.data[idx] : 0;
    if (c) c.data[idx] = id;
    const oldDef = BlockDefs[old], newDef = BlockDefs[id];
    // lights
    const k3 = pk(x, y, z);
    if (oldDef && oldDef.light > 0 && this.lights.has(k3)) {
      this.group.remove(this.lights.get(k3)); this.lights.delete(k3);
    }
    if (newDef && newDef.light > 0 && !newDef.liquid && this.lights.size < 40) {
      const pl = new THREE.PointLight(0xffc477, 1.1, 14);
      pl.position.set(x + 0.5, y + 0.6, z + 0.5);
      this.group.add(pl); this.lights.set(k3, pl);
    }
    // containers
    if (this.containers.has(k3) && (!newDef || (id !== 25 && id !== 26))) {
      const cont = this.containers.get(k3);
      (cont.items || []).forEach(s => { if (s && window.mobs) mobs.spawnItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count, s.dur); });
      this.containers.delete(k3);
    }
    if (id === 8) { this.liquid.set(k3, 8); this.waterQ.add(k3); }
    if (id === 9) { this.liquid.set(k3, 4); this.lavaQ.add(k3); }
    if (id === 0) this.liquid.delete(k3);
    if (newDef && newDef.gravity) this.updateQ.add(k3);
    if (id >= 45 && id <= 47) this.saplings.set(k3, { time: performance.now() / 1000 + 30 + Math.random() * 40, type: id });
    // notify neighbours
    const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (const [dx, dy, dz] of N) {
      const nx = x + dx, ny = y + dy, nz = z + dz, nid = this.getBlock(nx, ny, nz);
      const nd = BlockDefs[nid];
      if (nd && nd.liquid) (nid === 8 ? this.waterQ : this.lavaQ).add(pk(nx, ny, nz));
      if (nd && (nd.gravity || nd.cross) && dy === 1) this.updateQ.add(pk(nx, ny, nz));
    }
    if (!c) return;
    this.dirty.add(key);
    if (lx === 0) this.dirty.add(this.ckey(cx - 1, cz));
    if (lx === 15) this.dirty.add(this.ckey(cx + 1, cz));
    if (lz === 0) this.dirty.add(this.ckey(cx, cz - 1));
    if (lz === 15) this.dirty.add(this.ckey(cx, cz + 1));
  }
  getHighest(x, z) {
    for (let y = CHUNK_H - 1; y >= 0; y--) {
      const d = BlockDefs[this.getBlock(x, y, z)];
      if (d && (d.solid || d.liquid)) return y;
    }
    return 0;
  }
  /* ---------- chunk lifecycle ---------- */
  update(dt, px, pz) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16), R = Game.renderDist;
    const want = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz > R * R + 2) continue;
      const cx = pcx + dx, cz = pcz + dz, key = this.ckey(cx, cz);
      if (!this.chunks.has(key) && !this.pending.has(key)) want.push([dx * dx + dz * dz, cx, cz, key]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(4, want.length); i++) {
      const [, cx, cz, key] = want[i];
      this.pending.add(key);
      GenPool.request(this.seed, cx, cz, data => {
        this.pending.delete(key);
        const ed = this.edits[key];
        if (ed) for (const idx in ed) data[idx] = ed[idx];
        this.chunks.set(key, { cx, cz, data, meshes: [] });
        this.dirty.add(key);
        this.dirty.add(this.ckey(cx - 1, cz)); this.dirty.add(this.ckey(cx + 1, cz));
        this.dirty.add(this.ckey(cx, cz - 1)); this.dirty.add(this.ckey(cx, cz + 1));
      });
    }
    // unload far chunks
    for (const [key, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 3) * (R + 3)) {
        c.meshes.forEach(m => { this.group.remove(m); m.geometry.dispose(); });
        this.chunks.delete(key);
      }
    }
    // remesh budget: 2/frame, nearest first
    if (this.dirty.size) {
      const arr = [...this.dirty].map(k => {
        const c = this.chunks.get(k);
        return c ? [Math.hypot(c.cx - pcx, c.cz - pcz), k, c] : null;
      }).filter(Boolean).sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(2, arr.length); i++) {
        this.buildChunkMesh(arr[i][2]); this.dirty.delete(arr[i][1]);
      }
      for (const k of this.dirty) if (!this.chunks.has(k)) this.dirty.delete(k);
    }
    this.tickSystems(dt);
  }
  /* ---------- block-update systems ---------- */
  tickSystems(dt) {
    const now = performance.now() / 1000;
    this._wT += dt; this._lT += dt; this._uT += dt;
    if (this._uT > 0.2) {
      this._uT = 0;
      const q = [...this.updateQ]; this.updateQ.clear();
      for (const k of q.slice(0, 200)) {
        const [x, y, z] = k.split(',').map(Number);
        const id = this.getBlock(x, y, z), d = BlockDefs[id];
        if (!d) continue;
        const below = BlockDefs[this.getBlock(x, y - 1, z)];
        if (d.gravity && below && !below.solid) {
          this.setBlock(x, y, z, 0); this.setBlock(x, y - 1, z, id);
        } else if (d.cross && below && !below.solid) {
          this.setBlock(x, y, z, 0);
          for (const dr of d.drops) if (Math.random() < (dr[3] ?? 1) && window.mobs)
            mobs.spawnItem(x + 0.5, y + 0.3, z + 0.5, dr[0], dr[1]);
        }
      }
    }
    if (this._wT > 0.3) { this._wT = 0; this.tickLiquid(this.waterQ, 8, 4); }
    if (this._lT > 0.7) { this._lT = 0; this.tickLiquid(this.lavaQ, 9, 2); }
    // saplings
    for (const [k, s] of this.saplings) {
      if (now > s.time) {
        this.saplings.delete(k);
        const [x, y, z] = k.split(',').map(Number);
        if (this.getBlock(x, y, z) === s.type)
          this.growTree(x, y, z, s.type === 46 ? 'birch' : s.type === 47 ? 'spruce' : 'oak');
      }
    }
    // tnt
    for (let i = this.tnt.length - 1; i >= 0; i--) {
      const t = this.tnt[i]; t.t -= dt;
      if (t.t <= 0) { this.tnt.splice(i, 1); this.explode(t.x + 0.5, t.y + 0.5, t.z + 0.5, 4); }
    }
  }
  tickLiquid(queue, id, maxLevel) {
    const q = [...queue].slice(0, 120);
    q.forEach(k => queue.delete(k));
    for (const k of q) {
      const [x, y, z] = k.split(',').map(Number);
      if (this.getBlock(x, y, z) !== id) continue;
      const lvl = this.liquid.get(k) ?? 3;
      const canFlow = (bx, by, bz) => {
        const b = BlockDefs[this.getBlock(bx, by, bz)];
        return b && !b.solid && !b.liquid;
      };
      if (canFlow(x, y - 1, z)) {
        this.setBlock(x, y - 1, z, id);
        this.liquid.set(pk(x, y - 1, z), maxLevel);
      } else if (lvl > 1 && this.isSolid(x, y - 1, z)) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (canFlow(x + dx, y, z + dz)) {
            this.setBlock(x + dx, y, z + dz, id);
            this.liquid.set(pk(x + dx, y, z + dz), lvl - 1);
          }
        }
      }
      if (id === 9) { // lava ignites flammables
        for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]]) {
          const nd = BlockDefs[this.getBlock(x + dx, y + dy, z + dz)];
          if (nd && nd.flammable && Math.random() < 0.25) {
            this.setBlock(x + dx, y + dy, z + dz, 0);
            if (window.renderer) renderer.burst(x + dx + 0.5, y + dy + 0.5, z + dz + 0.5, [1, 0.5, 0.1], 8);
          }
        }
      }
    }
  }
  growTree(x, y, z, type) {
    const soft = (bx, by, bz, id) => {
      const cur = this.getBlock(bx, by, bz), d = BlockDefs[cur];
      if (cur === 0 || (d && (d.cross || d.transparent && !d.liquid))) this.setBlock(bx, by, bz, id);
    };
    const H = 4 + (Math.random() * 3 | 0);
    const log = type === 'birch' ? 13 : type === 'spruce' ? 16 : 10;
    const leaf = type === 'birch' ? 14 : type === 'spruce' ? 17 : 11;
    this.setBlock(x, y, z, 0);
    for (let i = 0; i < H; i++) soft(x, y + i, z, log);
    for (let dy = H - 2; dy <= H + 1; dy++) {
      const rad = dy >= H ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (dx === 0 && dz === 0 && dy < H) continue;
        soft(x + dx, y + dy, z + dz, leaf);
      }
    }
  }
  explode(ex, ey, ez, r) {
    for (let x = Math.floor(ex - r); x <= ex + r; x++)
      for (let y = Math.floor(ey - r); y <= ey + r; y++)
        for (let z = Math.floor(ez - r); z <= ez + r; z++) {
          const dx = x + 0.5 - ex, dy = y + 0.5 - ey, dz = z + 0.5 - ez;
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          const id = this.getBlock(x, y, z), d = BlockDefs[id];
          if (!d || id === 0 || id === 5 || id === 32 || d.liquid) continue;
          if (id === 27) { this.tnt.push({ x, y, z, t: 0.3 + Math.random() * 0.5 }); this.setBlock(x, y, z, 0); continue; }
          this.setBlock(x, y, z, 0);
        }
    if (window.renderer) renderer.burst(ex, ey, ez, [1, 0.6, 0.2], 60);
    Sound.explode();
    if (window.player) {
      const d = Math.hypot(player.pos.x - ex, player.pos.y + 0.9 - ey, player.pos.z - ez);
      if (d < r * 2) player.damage(Math.max(0, (r * 2 - d) * 3), 'explosion');
    }
    if (window.mobs) mobs.explosionDamage(ex, ey, ez, r);
  }
  /* ---------- meshing ---------- */
  occl(x, y, z) { const d = BlockDefs[this.getBlock(x, y, z)]; return d && d.solid && !d.liquid ? 1 : 0; }
  buildChunkMesh(chunk) {
    chunk.meshes.forEach(m => { this.group.remove(m); m.geometry.dispose(); });
    chunk.meshes = [];
    const buckets = {
      op:  { pos: [], uv: [], col: [], nor: [], idx: [] },
      cut: { pos: [], uv: [], col: [], nor: [], idx: [] },
      wat: { pos: [], uv: [], col: [], nor: [], idx: [] }
    };
    const pushQuad = (b, verts, uvs, tile, cols, normal) => {
      const base = b.pos.length / 3, U = Atlas.uvOf(tile);
      for (let i = 0; i < 4; i++) {
        b.pos.push(verts[i][0], verts[i][1], verts[i][2]);
        b.uv.push(U.u0 + (U.u1 - U.u0) * uvs[i][0], U.v0 + (U.v1 - U.v0) * uvs[i][1]);
        b.col.push(cols[i], cols[i], cols[i]);
        b.nor.push(normal[0], normal[1], normal[2]);
      }
      if (cols[0] + cols[2] >= cols[1] + cols[3]) b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else b.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    };
    const UVQ = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const data = chunk.data, ox = chunk.cx * 16, oz = chunk.cz * 16;
    for (let y = 0; y < CHUNK_H; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const id = data[x + z * 16 + y * 256];
      if (!id) continue;
      const d = BlockDefs[id], wx = ox + x, wz = oz + z;
      if (d.cross) {
        const br = 0.95, t = d.tiles.side;
        pushQuad(buckets.cut, [[x + .15, y, z + .15], [x + .85, y, z + .85], [x + .85, y + 1, z + .85], [x + .15, y + 1, z + .15]], UVQ, t, [br, br, br, br], [0, 1, 0]);
        pushQuad(buckets.cut, [[x + .85, y, z + .15], [x + .15, y, z + .85], [x + .15, y + 1, z + .85], [x + .85, y + 1, z + .15]], UVQ, t, [br, br, br, br], [0, 1, 0]);
        continue;
      }
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nid = this.getBlock(wx + F.n[0], y + F.n[1], wz + F.n[2]);
        const nd = BlockDefs[nid];
        let show;
        if (d.liquid) show = nid !== id && (!nd || !nd.solid);
        else show = !nd || nid === 0 || nd.liquid || nd.cross || (nd.transparent && nid !== id);
        if (!show) continue;
        const verts = [], cols = [];
        for (let ci = 0; ci < 4; ci++) {
          const a = (ci === 1 || ci === 2) ? 1 : 0, b2 = ci >= 2 ? 1 : 0;
          verts.push([
            x + F.o[0] + F.u[0] * a + F.v[0] * b2,
            y + F.o[1] + F.u[1] * a + F.v[1] * b2,
            z + F.o[2] + F.u[2] * a + F.v[2] * b2]);
          if (d.liquid || d.transparent) { cols.push(F.sh); continue; }
          const du = a ? 1 : -1, dv = b2 ? 1 : -1;
          const bx = wx + F.n[0], by = y + F.n[1], bz = wz + F.n[2];
          const s1 = this.occl(bx + F.u[0] * du, by + F.u[1] * du, bz + F.u[2] * du);
          const s2 = this.occl(bx + F.v[0] * dv, by + F.v[1] * dv, bz + F.v[2] * dv);
          const cc = this.occl(bx + F.u[0] * du + F.v[0] * dv, by + F.u[1] * du + F.v[1] * dv, bz + F.u[2] * du + F.v[2] * dv);
          const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
          cols.push(F.sh * AO_CURVE[ao]);
        }
        if (d.liquid) verts.forEach(v => { if (v[1] === y + 1) v[1] -= 0.12; });
        const tile = f === 2 ? d.tiles.top : f === 3 ? d.tiles.bottom : d.tiles.side;
        const bucket = d.liquid ? buckets.wat : (d.transparent ? buckets.cut : buckets.op);
        pushQuad(bucket, verts, UVQ, tile, cols, F.n);
      }
    }
    const mk = (b, mat) => {
      if (!b.idx.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setIndex(b.idx);
      const m = new THREE.Mesh(g, mat);
      m.position.set(ox, 0, oz);
      this.group.add(m); chunk.meshes.push(m);
    };
    mk(buckets.op, this.materials.op);
    mk(buckets.cut, this.materials.cut);
    mk(buckets.wat, this.materials.wat);
  }
  /* ---------- voxel raycast (Amanatides & Woo DDA) ---------- */
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stx = Math.sign(dx) || 1, sty = Math.sign(dy) || 1, stz = Math.sign(dz) || 1;
    const tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9)), tdz = Math.abs(1 / (dz || 1e-9));
    let tx = (dx > 0 ? (x + 1 - ox) : (ox - x)) * tdx;
    let ty = (dy > 0 ? (y + 1 - oy) : (oy - y)) * tdy;
    let tz = (dz > 0 ? (z + 1 - oz) : (oz - z)) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t < maxD) {
      const id = this.getBlock(x, y, z), d = BlockDefs[id];
      if (id !== 0 && d && !d.liquid) return { x, y, z, nx, ny, nz, id };
      if (tx < ty && tx < tz) { x += stx; t = tx; tx += tdx; nx = -stx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sty; t = ty; ty += tdy; nx = 0; ny = -sty; nz = 0; }
      else { z += stz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -stz; }
    }
    return null;
  }
  dispose() {
    for (const [, c] of this.chunks) c.meshes.forEach(m => { this.group.remove(m); m.geometry.dispose(); });
    this.chunks.clear();
    for (const [, l] of this.lights) this.group.remove(l);
    this.lights.clear();
  }
}
