'use strict';
/* ============ mobs.js — mob AI/spawning/drops, item entities, arrows ============ */
const MOB_TYPES = {
  cow:      { hp: 10, speed: 1.2, hostile: false, w: 0.9, h: 1.4, body: 0x5b3f27, head: 0xd8d0c8, legs: 0x3c2a18, drops: [[263, 1, 3]], xp: 2, quad: true },
  pig:      { hp: 10, speed: 1.1, hostile: false, w: 0.8, h: 0.9, body: 0xe79c9c, head: 0xf0b6b6, legs: 0xd38b8b, drops: [[261, 1, 3]], xp: 2, quad: true },
  sheep:    { hp: 8,  speed: 1.0, hostile: false, w: 0.9, h: 1.3, body: 0xe8e8e8, head: 0xc8a888, legs: 0xcfcfcf, drops: [[267, 1, 2], [49, 1, 2]], xp: 2, quad: true },
  chicken:  { hp: 4,  speed: 1.0, hostile: false, w: 0.4, h: 0.7, body: 0xf2f2f2, head: 0xe8c840, legs: 0xd8a030, drops: [[265, 1, 1], [274, 0, 2]], xp: 1, quad: false },
  zombie:   { hp: 20, speed: 1.9, hostile: true, w: 0.6, h: 1.9, body: 0x3a7434, head: 0x4c8b45, legs: 0x2f4f8b, dmg: 3, drops: [[275, 0, 2]], xp: 5, quad: false },
  skeleton: { hp: 20, speed: 1.8, hostile: true, ranged: true, w: 0.6, h: 1.9, body: 0xc8c8c8, head: 0xdcdcdc, legs: 0xbcbcbc, dmg: 3, drops: [[272, 0, 2], [273, 0, 2]], xp: 5, quad: false },
  creeper:  { hp: 20, speed: 1.7, hostile: true, explode: true, w: 0.6, h: 1.7, body: 0x4fae4f, head: 0x3a8f3a, legs: 0x3f8f3f, drops: [[271, 1, 2]], xp: 5, quad: false },
  spider:   { hp: 16, speed: 2.4, hostile: true, climb: true, w: 1.1, h: 0.9, body: 0x2b2b2b, head: 0x3a2222, legs: 0x262626, dmg: 2, drops: [[270, 0, 2]], xp: 5, quad: true }
};

const _tileTexCache = new Map();
function tileTexture(t) {
  if (_tileTexCache.has(t)) return _tileTexCache.get(t);
  const c = document.createElement('canvas'); c.width = c.height = 16;
  c.getContext('2d').drawImage(Atlas.canvas, -(t % 16) * 16, -((t / 16) | 0) * 16);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  _tileTexCache.set(t, tex);
  return tex;
}

class Mob {
  constructor(type, x, y, z) {
    this.type = type; this.def = MOB_TYPES[type];
    this.pos = { x, y, z }; this.vel = { x: 0, y: 0, z: 0 };
    this.hp = this.def.hp; this.heading = Math.random() * Math.PI * 2;
    this.moveT = 0; this.moving = false; this.atkT = 0; this.shootT = 0;
    this.fuse = 0; this.t = Math.random() * 10; this.hurtT = 0;
    this.onGround = false; this.dead = false;
    this.buildMesh();
  }
  buildMesh() {
    const T = this.def, g = new THREE.Group();
    this.mats = [];
    const box = (w, h, d, c, x, y, z) => {
      const mat = new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(mat);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); g.add(m);
      return m;
    };
    this.legs = [];
    if (T.quad) {
      const legH = T.h * 0.45, bodyH = T.h * 0.4;
      box(T.w, bodyH, T.w * 1.5, T.body, 0, legH + bodyH / 2, 0);
      const head = box(T.w * 0.6, T.w * 0.6, T.w * 0.5, T.head, 0, legH + bodyH + T.w * 0.1, -T.w * 0.8);
      this.head = head;
      const lw = T.w * 0.22;
      for (const [lx, lz] of [[-T.w / 3, -T.w * 0.55], [T.w / 3, -T.w * 0.55], [-T.w / 3, T.w * 0.55], [T.w / 3, T.w * 0.55]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(lw, legH, lw),
          new THREE.MeshLambertMaterial({ color: T.legs }));
        this.mats.push(leg.material);
        leg.geometry.translate(0, -legH / 2, 0);
        leg.position.set(lx, legH, lz);
        g.add(leg); this.legs.push(leg);
      }
    } else {
      const legH = T.h * 0.4, bodyH = T.h * 0.4, hs = Math.min(0.55, T.w);
      box(T.w * 0.9, bodyH, T.w * 0.55, T.body, 0, legH + bodyH / 2, 0);
      this.head = box(hs, hs, hs, T.head, 0, legH + bodyH + hs / 2, 0);
      const lw = T.w * 0.3;
      for (const lx of [-T.w / 4, T.w / 4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(lw, legH, lw),
          new THREE.MeshLambertMaterial({ color: T.legs }));
        this.mats.push(leg.material);
        leg.geometry.translate(0, -legH / 2, 0);
        leg.position.set(lx, legH, 0);
        g.add(leg); this.legs.push(leg);
      }
      if (this.type === 'zombie' || this.type === 'skeleton') {
        for (const lx of [-T.w * 0.62, T.w * 0.62])
          box(lw * 0.8, bodyH, lw * 0.8, T.body, lx, legH + bodyH / 2, 0);
      }
    }
    this.mesh = g;
  }
  hurt(n, dir) {
    this.hp -= n; this.hurtT = 0.25;
    Sound.mobHurt();
    if (dir) { this.vel.x += dir.x * 6; this.vel.z += dir.z * 6; this.vel.y = 4; }
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    for (const dr of this.def.drops) {
      const n = dr[1] + Math.floor(Math.random() * (dr[2] - dr[1] + 1));
      if (n > 0) mobs.spawnItem(this.pos.x, this.pos.y + 0.5, this.pos.z, dr[0], n);
    }
    if (window.player) player.addXp(this.def.xp);
    renderer.burst(this.pos.x, this.pos.y + 0.6, this.pos.z, [0.8, 0.2, 0.2], 14);
  }
  update(dt, w, pl) {
    this.t += dt; this.hurtT -= dt; this.atkT -= dt; this.shootT -= dt;
    const T = this.def;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz, pl.pos.y - this.pos.y);
    let wantMove = false, speed = T.speed;
    if (T.hostile && dist < 16 && !pl.dead && pl.mode !== 'creative') {
      this.heading = Math.atan2(dx, dz);
      wantMove = true;
      if (T.ranged) {
        if (dist < 7) { this.heading += Math.PI; }       // keep distance
        else if (dist < 9) wantMove = false;
        if (dist < 13 && this.shootT <= 0) {
          this.shootT = 2;
          mobs.spawnArrow(this.pos.x, this.pos.y + T.h * 0.8, this.pos.z,
            pl.pos.x, pl.pos.y + 1.2, pl.pos.z);
        }
      }
      if (T.explode) {
        if (dist < 2.6) { this.fuse += dt; wantMove = false; }
        else this.fuse = Math.max(0, this.fuse - dt);
        const f = Math.sin(this.t * 20) * 0.5 + 0.5;
        this.mats.forEach(m => m.emissive && m.emissive.setScalar(this.fuse > 0 ? f * this.fuse : 0));
        if (this.fuse > 1.5) {
          this.dead = true;
          w.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 3);
          return;
        }
      }
      if (!T.ranged && !T.explode && dist < 1.8 && this.atkT <= 0) {
        this.atkT = 1;
        pl.damage(T.dmg, 'mob');
      }
    } else {
      this.moveT -= dt;
      if (this.moveT <= 0) {
        this.moveT = 2 + Math.random() * 4;
        this.moving = Math.random() < 0.6;
        this.heading = Math.random() * Math.PI * 2;
      }
      wantMove = this.moving; speed = T.speed * 0.5;
    }
    const mx = Math.sin(this.heading) * speed, mz = Math.cos(this.heading) * speed;
    if (wantMove) {
      this.vel.x += (mx - this.vel.x) * Math.min(1, 8 * dt);
      this.vel.z += (mz - this.vel.z) * Math.min(1, 8 * dt);
    } else {
      this.vel.x *= Math.max(0, 1 - 8 * dt);
      this.vel.z *= Math.max(0, 1 - 8 * dt);
    }
    const body = BlockDefs[w.getBlock(this.pos.x, this.pos.y + 0.3, this.pos.z)];
    const inWater = body && body.liquid;
    if (inWater) { this.vel.y += -4 * dt; if (wantMove) this.vel.y = 2; this.vel.y = Math.max(-2, this.vel.y); }
    else this.vel.y -= 25 * dt;
    const res = collideMove(w, this.pos, this.vel, T.w / 2, T.h, dt);
    this.onGround = res.onGround;
    if (res.hitWall && wantMove) {
      if (T.climb) this.vel.y = 3;
      else if (this.onGround) this.vel.y = 7.5;
    }
    /* visuals */
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.t * 8 + i * Math.PI) * Math.min(0.7, sp * 0.4); });
    if (this.hurtT > 0) this.mats.forEach(m => m.color.offsetHSL(0, 0, 0)); // keep
    this.mesh.scale.setScalar(this.hurtT > 0 ? 1.08 : 1);
  }
}

class MobManager {
  constructor(w) {
    this.world = w;
    this.list = [];
    this.items = [];
    this.arrows = [];
    this.group = new THREE.Group();
    this.spawnT = 0;
  }
  spawnItem(x, y, z, id, count, dur, vel) {
    if (this.items.length > 200) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tileTexture(iconTile(id)) }));
    spr.scale.setScalar(0.35);
    this.group.add(spr);
    this.items.push({
      id, count, dur, pos: { x, y, z },
      vel: vel || { x: (Math.random() - 0.5) * 2, y: 3, z: (Math.random() - 0.5) * 2 },
      mesh: spr, age: 0
    });
  }
  spawnArrow(x, y, z, tx, ty, tz) {
    const d = { x: tx - x, y: ty - y, z: tz - z };
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    const sp = 16, inacc = 0.08;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xbbaa88 }));
    this.group.add(m);
    this.arrows.push({
      pos: { x, y, z },
      vel: {
        x: d.x / l * sp + (Math.random() - 0.5) * inacc * sp,
        y: d.y / l * sp + 2,
        z: d.z / l * sp + (Math.random() - 0.5) * inacc * sp
      }, mesh: m, age: 0
    });
    Sound.tone(600, 0.1, 'square', 0.08, -300);
  }
  spawnMob(type, x, y, z) {
    const m = new Mob(type, x, y, z);
    this.group.add(m.mesh);
    this.list.push(m);
    return m;
  }
  anyAt(x, y, z) {
    return this.list.some(m =>
      m.pos.x + m.def.w / 2 > x && m.pos.x - m.def.w / 2 < x + 1 &&
      m.pos.z + m.def.w / 2 > z && m.pos.z - m.def.w / 2 < z + 1 &&
      m.pos.y + m.def.h > y && m.pos.y < y + 1);
  }
  raypick(eye, dir, maxD) {
    let best = null, bestT = maxD;
    for (const m of this.list) {
      const cx = m.pos.x - eye.x, cy = m.pos.y + m.def.h / 2 - eye.y, cz = m.pos.z - eye.z;
      const tproj = cx * dir.x + cy * dir.y + cz * dir.z;
      if (tproj < 0 || tproj > bestT) continue;
      const px = eye.x + dir.x * tproj - m.pos.x;
      const py = eye.y + dir.y * tproj - (m.pos.y + m.def.h / 2);
      const pz = eye.z + dir.z * tproj - m.pos.z;
      if (Math.hypot(px, py, pz) < m.def.w * 0.7 + 0.3) { best = m; bestT = tproj; }
    }
    return best;
  }
  explosionDamage(x, y, z, r) {
    for (const m of this.list) {
      const d = Math.hypot(m.pos.x - x, m.pos.y - y, m.pos.z - z);
      if (d < r * 2) m.hurt(Math.max(0, (r * 2 - d) * 3));
    }
  }
  trySpawn(pl) {
    const night = Game.dayFactor < 0.25;
    const hostiles = this.list.filter(m => m.def.hostile).length;
    const passives = this.list.length - hostiles;
    const ang = Math.random() * Math.PI * 2, dist = 24 + Math.random() * 24;
    const x = Math.floor(pl.pos.x + Math.sin(ang) * dist);
    const z = Math.floor(pl.pos.z + Math.cos(ang) * dist);
    if (!this.world.isLoaded(x, z)) return;
    if (pl.pos.y < 20 && Math.random() < 0.5 && hostiles < 16) {
      // cave spawn near player depth
      const y = Math.max(2, Math.floor(pl.pos.y + (Math.random() - 0.5) * 8));
      const cx = Math.floor(pl.pos.x + (Math.random() - 0.5) * 24);
      const cz = Math.floor(pl.pos.z + (Math.random() - 0.5) * 24);
      if (!this.world.isLoaded(cx, cz)) return;
      if (this.world.getBlock(cx, y, cz) === 0 && this.world.getBlock(cx, y + 1, cz) === 0 &&
          this.world.isSolid(cx, y - 1, cz)) {
        const t = ['zombie', 'skeleton', 'spider', 'creeper'][Math.random() * 4 | 0];
        this.spawnMob(t, cx + 0.5, y, cz + 0.5);
      }
      return;
    }
    const y = this.world.getHighest(x, z) + 1;
    if (y <= SEA_LEVEL) return;
    const ground = this.world.getBlock(x, y - 1, z);
    if (night) {
      if (hostiles >= 16) return;
      const t = ['zombie', 'skeleton', 'spider', 'creeper'][Math.random() * 4 | 0];
      this.spawnMob(t, x + 0.5, y, z + 0.5);
    } else {
      if (passives >= 10 || (ground !== 1 && ground !== 34)) return;
      const t = ['cow', 'pig', 'sheep', 'chicken'][Math.random() * 4 | 0];
      this.spawnMob(t, x + 0.5, y, z + 0.5);
    }
  }
  update(dt, pl) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 2; this.trySpawn(pl); }
    /* mobs */
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      const d = Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z);
      if (d > 80 || m.pos.y < -20) m.dead = true;
      if (!m.dead) m.update(dt, this.world, pl);
      if (m.dead) {
        this.group.remove(m.mesh);
        m.mesh.traverse(o => o.geometry && o.geometry.dispose());
        this.list.splice(i, 1);
      }
    }
    /* item entities */
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      it.vel.y -= 18 * dt;
      collideMove(this.world, it.pos, it.vel, 0.12, 0.25, dt);
      it.vel.x *= 0.94; it.vel.z *= 0.94;
      it.mesh.position.set(it.pos.x, it.pos.y + 0.25 + Math.sin(it.age * 3) * 0.06, it.pos.z);
      const d = Math.hypot(it.pos.x - pl.pos.x, it.pos.y - pl.pos.y - 0.8, it.pos.z - pl.pos.z);
      if (it.age > 0.6 && d < 2.5 && !pl.dead) { // magnet
        it.pos.x += (pl.pos.x - it.pos.x) * 6 * dt;
        it.pos.y += (pl.pos.y + 0.8 - it.pos.y) * 6 * dt;
        it.pos.z += (pl.pos.z - it.pos.z) * 6 * dt;
      }
      if ((it.age > 0.6 && d < 1.2 && !pl.dead) || it.age > 240) {
        if (it.age <= 240) {
          const left = pl.give(it.id, it.count, it.dur);
          if (left > 0) { it.count = left; continue; }
          Sound.pickup();
        }
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
    /* arrows */
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt; a.vel.y -= 12 * dt;
      a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
      a.mesh.position.set(a.pos.x, a.pos.y, a.pos.z);
      a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z);
      const hitP = Math.hypot(a.pos.x - pl.pos.x, a.pos.y - pl.pos.y - 1, a.pos.z - pl.pos.z) < 0.7;
      const hitB = this.world.isSolid(a.pos.x, a.pos.y, a.pos.z);
      if (hitP && !pl.dead) pl.damage(3, 'arrow');
      if (hitP || hitB || a.age > 6) {
        this.group.remove(a.mesh); a.mesh.geometry.dispose();
        this.arrows.splice(i, 1);
      }
    }
  }
  dispose() {
    this.list.forEach(m => this.group.remove(m.mesh));
    this.items.forEach(i => this.group.remove(i.mesh));
    this.arrows.forEach(a => this.group.remove(a.mesh));
    this.list = []; this.items = []; this.arrows = [];
  }
}
