'use strict';
/* ============ save.js — localStorage world persistence ============ */
const SaveSys = {
  KEY: 'minejs_world_v1',
  has() { return !!localStorage.getItem(this.KEY); },
  save() {
    if (!window.world || !window.player) return;
    try {
      const conts = {};
      for (const [k, c] of world.containers) conts[k] = c;
      const data = {
        seed: world.seed, mode: player.mode, tod: Game.tod, weather: Game.weather,
        pos: [player.pos.x, player.pos.y, player.pos.z], yaw: player.yaw, pitch: player.pitch,
        hp: player.hp, hunger: player.hunger, xp: player.xp,
        inv: player.inventory, armor: player.armor,
        spawn: player.spawnPoint, edits: world.edits, containers: conts
      };
      localStorage.setItem(this.KEY, JSON.stringify(data));
      return true;
    } catch (e) { console.warn('Save failed', e); return false; }
  },
  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); }
    catch (e) { return null; }
  },
  clear() { localStorage.removeItem(this.KEY); }
};
