'use strict';
/* ============ player.js — movement/physics, inventory, mining, survival stats ============ */

/* shared voxel AABB mover (also used by mobs) */
function collideMove(w, pos, vel, half, height, dt) {
  let onGround = false, hitWall = false;
  const mv = [vel.x * dt, vel.y * dt, vel.z * dt];
  for (const axis of [1, 0, 2]) {
    const d = mv[axis];
    if (!d) continue;
    const np = { x: pos.x, y: pos.y, z: pos.z };
    if (axis === 0) np.x += d; else if (axis === 1) np.y += d; else np.z += d;
    const minX = Math.floor(np.x - half), maxX = Math.floor(np.x + half);
    const minY = Math.floor(np.y), maxY = Math.floor(np.y + height - 0.001);
    const minZ = Math.floor(np.z - half), maxZ = Math.floor(np.z + half);
    let hit = false;
    for (let bx = minX; bx <= maxX && !hit; bx++)
      for (let by = minY; by <= maxY && !hit; by++)
        for (let bz = minZ; bz <= maxZ && !hit; bz++)
          if (w.isSolid(bx, by, bz)) hit = true;
    if (!hit) { pos.x = np.x; pos.y = np.y; pos.z = np.z; continue; }
    if (axis === 1) {
      if (d < 0) { pos.y = minY + 1.0001; onGround = true; } else pos.y = maxY - height - 0.0001;
      vel.y = 0;
    } else if (axis === 0) {
      pos.x = d > 0 ? maxX - half - 0.001 : minX + 1 + half + 0.001;
      vel.x = 0; hitWall = true;
    } else {
      pos.z = d > 0 ? maxZ - half - 0.001 : minZ + 1 + half + 0.001;
      vel.z = 0; hitWall = true;
    }
  }
  return { onGround, hitWall };
}

class Player {
  constructor(w) {
    this.world = w;
    this.pos = { x: 0.5, y: 40, z: 0.5 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.mode = 'survival';
    this.hp = 20; this.hunger = 20; this.air = 10; this.xp = 0;
    this.exhaustion = 0; this.regenT = 0; this.starveT = 0; this.drownT = 0;
    this.inventory = Array(36).fill(null);
    this.armor = [null, null, null, null];
    this.sel = 0;
    this.keys = {};
    this.fly = false; this.onGround = false; this.inWater = false;
    this.fallDist = 0; this.invulnT = 0; this.useT = 0; this.lastJumpTap = 0;
    this.target = null;
    this.breakProg = 0; this.breakKey = null;
    this.spawnPoint = [0.5, 40, 0.5];
    this.dead = false;
  }
  findSpawn() {
    let sx = 0, sz = 0;
    for (let r = 0; r < 40; r++) {
      const h = this.world.gen.heightAt(r * 8, 0);
      if (h > SEA_LEVEL) { sx = r * 8; break; }
    }
    const h = this.world.gen.heightAt(sx, sz);
    this.pos = { x: sx + 0.5, y: h + 2, z: sz + 0.5 };
    this.spawnPoint = [this.pos.x, this.pos.y, this.pos.z];
  }
  held() { return this.inventory[this.sel]; }
  give(id, count, dur) {
    const d = def(id);
    if (!d) return count;
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && s.count < d.stack && d.stack > 1) {
        const mv = Math.min(d.stack - s.count, count);
        s.count += mv; count -= mv;
      }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.inventory[i]) {
        const mv = Math.min(d.stack, count);
        this.inventory[i] = { id, count: mv, dur: dur !== undefined ? dur : d.dur };
        count -= mv;
      }
    }
    UI.refreshHotbar();
    return count;
  }
  consumeHeld(n = 1) {
    const s = this.held();
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.inventory[this.sel] = null;
    UI.refreshHotbar();
  }
  damageTool() {
    const s = this.held();
    if (!s || this.mode === 'creative') return;
    const d = def(s.id);
    if (!d || !d.dur) return;
    s.dur = (s.dur ?? d.dur) - 1;
    if (s.dur <= 0) { this.inventory[this.sel] = null; Sound.break(); }
    UI.refreshHotbar();
  }
  armorPoints() {
    return this.armor.reduce((a, s) => a + (s ? (def(s.id).armor || 0) : 0), 0);
  }
  damage(n, type) {
    if (this.mode === 'creative' || this.dead || n <= 0) return;
    if (this.invulnT > 0) return;
    if (type !== 'drown' && type !== 'starve') n *= 1 - Math.min(0.8, this.armorPoints() * 0.04);
    this.hp -= Math.max(1, Math.round(n));
    this.invulnT = 0.5;
    Sound.hurt();
    UI.hurtFlash();
    if (this.hp <= 0) this.die();
    UI.refreshStats();
  }
  die() {
    this.dead = true; this.hp = 0;
    for (let i = 0; i < 36; i++) {
      const s = this.inventory[i];
      if (s) mobs.spawnItem(this.pos.x, this.pos.y + 1, this.pos.z, s.id, s.count, s.dur,
        { x: (Math.random() - 0.5) * 4, y: 3 + Math.random() * 2, z: (Math.random() - 0.5) * 4 });
      this.inventory[i] = null;
    }
    UI.showDeath();
  }
  respawn() {
    this.dead = false; this.hp = 20; this.hunger = 20; this.air = 10; this.fallDist = 0;
    this.pos = { x: this.spawnPoint[0], y: this.spawnPoint[1], z: this.spawnPoint[2] };
    this.vel = { x: 0, y: 0, z: 0 };
    UI.hideDeath(); UI.refreshAll();
  }
  eyePos() { return { x: this.pos.x, y: this.pos.y + 1.62, z: this.pos.z }; }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }
  tapJump() {
    const now = performance.now();
    if (this.mode === 'creative' && now - this.lastJumpTap < 280) { this.fly = !this.fly; this.vel.y = 0; }
    this.lastJumpTap = now;
  }
  update(dt) {
    if (this.dead) return;
    if (!this.world.isLoaded(this.pos.x, this.pos.z)) return; // wait for chunk
    this.invulnT -= dt; this.useT -= dt;
    const K = this.keys;
    /* --- input --- */
    let fx = 0, fz = 0;
    if (K.forward) fz -= 1; if (K.back) fz += 1;
    if (K.left) fx -= 1; if (K.right) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = fx * cos - fz * sin, wz = fz * cos + fx * sin;
    const sprint = K.sprint && this.hunger > 6, sneak = K.sneak && !this.fly;
    let speed = this.fly ? 11 : sprint ? 5.6 : sneak ? 1.6 : 4.3;

    /* --- environment --- */
    const bodyBlock = BlockDefs[this.world.getBlock(this.pos.x, this.pos.y + 0.5, this.pos.z)];
    const eyeBlock = BlockDefs[this.world.getBlock(this.pos.x, this.pos.y + 1.55, this.pos.z)];
    this.inWater = !!(bodyBlock && bodyBlock.liquid);
    const inLava = bodyBlock && bodyBlock.id === 9;

    /* --- vertical --- */
    if (this.fly && this.mode === 'creative') {
      this.vel.y = (K.jump ? 9 : 0) + (K.sneak ? -9 : 0);
    } else if (this.inWater) {
      this.vel.y += -6 * dt;
      if (K.jump) this.vel.y = 3.2;
      this.vel.y = Math.max(-3.5, this.vel.y);
      speed *= 0.55; this.fallDist = 0;
    } else {
      this.vel.y -= 25 * dt;
      if (K.jump && this.onGround) {
        this.vel.y = 8.2;
        this.exhaustion += 0.05;
      }
    }
    /* --- horizontal accel --- */
    const acc = this.onGround || this.fly || this.inWater ? 12 : 4;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, acc * dt);

    const prevVy = this.vel.y;
    const res = collideMove(this.world, this.pos, this.vel, 0.3, 1.8, dt);
    this.onGround = res.onGround;
    /* fall damage */
    if (!this.onGround && this.vel.y < 0 && !this.fly && !this.inWater) this.fallDist -= this.vel.y * dt;
    if (this.onGround) {
      if (this.fallDist > 3.5) this.damage(Math.floor(this.fallDist - 3), 'fall');
      this.fallDist = 0;
    }
    if (this.fly || this.inWater) this.fallDist = 0;
    if (this.pos.y < -10) { this.pos.y = -10; this.damage(4, 'void'); this.vel.y = 0; }

    /* survival stats */
    if (this.mode === 'survival') {
      if (inLava) this.damage(4 * dt + 1, 'lava');
      if (eyeBlock && eyeBlock.liquid && eyeBlock.id === 8) {
        this.air -= dt;
        if (this.air < 0) { this.drownT += dt; if (this.drownT > 1) { this.drownT = 0; this.damage(2, 'drown'); } }
      } else this.air = Math.min(10, this.air + dt * 2);
      this.exhaustion += (sprint ? 0.1 : 0.005) * dt * (Math.abs(wx) + Math.abs(wz) > 0 ? 1 : 0.2);
      if (this.exhaustion > 4) { this.exhaustion = 0; this.hunger = Math.max(0, this.hunger - 1); UI.refreshStats(); }
      if (this.hunger >= 18 && this.hp < 20) {
        this.regenT += dt;
        if (this.regenT > 2) { this.regenT = 0; this.hp = Math.min(20, this.hp + 1); this.exhaustion += 0.6; UI.refreshStats(); }
      }
      if (this.hunger <= 0) {
        this.starveT += dt;
        if (this.starveT > 4) { this.starveT = 0; if (this.hp > 2) this.damage(1, 'starve'); }
      }
    }
    /* targeting + mining */
    const eye = this.eyePos(), dir = this.lookDir();
    this.target = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 5);
    if (Game.mouseL && this.target) this.mineTick(dt);
    else { this.breakProg = 0; this.breakKey = null; UI.setBreakProgress(0); }
    if (Game.mouseR && this.useT <= 0) { this.use(); this.useT = 0.25; }
  }
  miningTime(d) {
    if (d.hardness < 0) return Infinity;
    if (d.hardness === 0) return 0.05;
    const it = this.held(); const idf = it ? def(it.id) : null;
    let mult = 1, canHarvest = !d.requiresTool;
    if (idf && idf.tool && idf.tool === d.tool) {
      mult = [1, 2, 4, 6, 8][idf.tier];
      canHarvest = !d.requiresTool || idf.tier >= (d.minTier || 0);
    }
    let t = d.hardness * 1.5 / mult;
    if (d.requiresTool && !canHarvest) t = d.hardness * 5;
    return t;
  }
  canHarvest(d) {
    if (!d.requiresTool) return true;
    const it = this.held(); const idf = it ? def(it.id) : null;
    return !!(idf && idf.tool === d.tool && idf.tier >= (d.minTier || 0));
  }
  mineTick(dt) {
    const t = this.target, d = BlockDefs[t.id];
    if (!d || d.hardness < 0) { this.breakProg = 0; return; }
    const key = pk(t.x, t.y, t.z);
    if (key !== this.breakKey) { this.breakKey = key; this.breakProg = 0; }
    if (this.mode === 'creative') { this.finishBreak(t, d, false); return; }
    this.breakProg += dt / this.miningTime(d);
    UI.setBreakProgress(this.breakProg);
    if (Math.random() < dt * 8) renderer.burst(t.x + 0.5, t.y + 0.5, t.z + 0.5, [0.5, 0.5, 0.5], 2);
    if (this.breakProg >= 1) { this.finishBreak(t, d, true); }
  }
  finishBreak(t, d, drops) {
    this.world.setBlock(t.x, t.y, t.z, 0);
    Sound.break();
    renderer.burst(t.x + 0.5, t.y + 0.5, t.z + 0.5, [0.55, 0.45, 0.35], 12);
    this.breakProg = 0; this.breakKey = null;
    UI.setBreakProgress(0);
    if (drops && this.canHarvest(d)) {
      for (const dr of d.drops) {
        const p = dr[3] ?? 1;
        if (Math.random() > p) continue;
        const n = dr[1] + Math.floor(Math.random() * (dr[2] - dr[1] + 1));
        if (n > 0) mobs.spawnItem(t.x + 0.5, t.y + 0.4, t.z + 0.5, dr[0], n);
      }
      this.exhaustion += 0.02;
    }
    this.damageTool();
    if (this.mode === 'creative') Game.mouseL = false; // click per block in creative
  }
  use() {
    const t = this.target;
    /* interact */
    if (t && !this.keys.sneak) {
      if (t.id === 24) { UI.openCraft(); return; }
      if (t.id === 25) { UI.openFurnace(pk(t.x, t.y, t.z)); return; }
      if (t.id === 26) { UI.openChest(pk(t.x, t.y, t.z)); return; }
      if (t.id === 27) { this.world.setBlock(t.x, t.y, t.z, 0); this.world.tnt.push({ x: t.x, y: t.y, z: t.z, t: 2 }); Sound.click(); return; }
      if (t.id === 60) { Sound.click(); UI.msg('Lever toggled'); return; }
    }
    const s = this.held();
    if (!s) return;
    const d = def(s.id);
    /* eat */
    if (d.food) {
      if (this.hunger >= 20 && this.mode === 'survival') return;
      this.hunger = Math.min(20, this.hunger + d.food);
      if (this.mode !== 'creative') this.consumeHeld();
      Sound.eat(); UI.refreshStats();
      return;
    }
    /* place */
    if (s.id < 256 && t) {
      const px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
      const cur = BlockDefs[this.world.getBlock(px, py, pz)];
      if (cur && cur.solid) return;
      const nd = BlockDefs[s.id];
      if (nd.solid) { // don't place inside player/mobs
        if (px + 1 > this.pos.x - 0.3 && px < this.pos.x + 0.3 &&
            pz + 1 > this.pos.z - 0.3 && pz < this.pos.z + 0.3 &&
            py + 1 > this.pos.y && py < this.pos.y + 1.8) return;
        if (mobs.anyAt(px, py, pz)) return;
      }
      if (nd.cross && !this.world.isSolid(px, py - 1, pz)) return;
      this.world.setBlock(px, py, pz, s.id);
      Sound.place();
      if (this.mode !== 'creative') this.consumeHeld();
    }
  }
  attack() {
    const eye = this.eyePos(), dir = this.lookDir();
    const it = this.held(); const idf = it ? def(it.id) : null;
    const dmg = idf && idf.dmg ? idf.dmg : 1;
    const m = mobs.raypick(eye, dir, 3.5);
    if (m) {
      m.hurt(dmg, dir);
      this.damageTool();
      this.exhaustion += 0.1;
      Game.mouseL = false;
    }
  }
  dropHeld() {
    const s = this.held();
    if (!s) return;
    const dir = this.lookDir();
    mobs.spawnItem(this.pos.x + dir.x, this.pos.y + 1.4, this.pos.z + dir.z, s.id, 1, s.dur,
      { x: dir.x * 6, y: 2, z: dir.z * 6 });
    this.consumeHeld();
  }
  addXp(n) {
    this.xp += n;
    const lvl = Math.floor(Math.sqrt(this.xp) / 2);
    if (lvl > (this.level || 0)) Sound.levelUp();
    this.level = lvl;
    UI.refreshStats();
  }
}
