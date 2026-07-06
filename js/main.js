'use strict';
/* ============ main.js — game state, input, loop ============ */
const Game = {
  state: 'menu', mode: 'survival',
  renderDist: 6, sensitivity: 1, volume: 0.5,
  tod: 0.05, DAY_LEN: 1200, dayFactor: 1,
  weather: 'clear', weatherT: 90,
  mouseL: false, mouseR: false,
  seed: 0, autosaveT: 0, fpsC: 0, fpsT: 0,

  hashSeed(str) {
    if (!str) return (Math.random() * 2 ** 31) | 0;
    if (/^-?\d+$/.test(str)) return parseInt(str) | 0;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    return h;
  },
  newGame(seedStr, mode) {
    this.seed = this.hashSeed(seedStr);
    this.mode = mode;
    this.tod = 0.05; this.weather = 'clear';
    this.begin(null);
  },
  loadGame() {
    const d = SaveSys.load();
    if (!d) return;
    this.seed = d.seed; this.mode = d.mode;
    this.tod = d.tod ?? 0.05; this.weather = d.weather || 'clear';
    this.begin(d);
  },
  begin(saveData) {
    if (!window.renderer) window.renderer = new Renderer();
    if (window.world) { renderer.scene.remove(world.group); world.dispose(); }
    if (window.mobs) { renderer.scene.remove(mobs.group); mobs.dispose(); }
    window.world = new World(this.seed);
    world.materials = renderer.materials;
    renderer.scene.add(world.group);
    window.mobs = new MobManager(world);
    renderer.scene.add(mobs.group);
    window.player = new Player(world);
    player.mode = this.mode;
    if (saveData) {
      world.edits = saveData.edits || {};
      for (const k in (saveData.containers || {})) world.containers.set(k, saveData.containers[k]);
      player.pos = { x: saveData.pos[0], y: saveData.pos[1], z: saveData.pos[2] };
      player.yaw = saveData.yaw; player.pitch = saveData.pitch;
      player.hp = saveData.hp; player.hunger = saveData.hunger; player.xp = saveData.xp || 0;
      player.inventory = saveData.inv || player.inventory;
      player.armor = saveData.armor || player.armor;
      player.spawnPoint = saveData.spawn || [player.pos.x, player.pos.y, player.pos.z];
    } else {
      player.findSpawn();
      if (this.mode === 'creative') {
        [3, 2, 12, 23, 48, 27, 59, 24, 25].forEach((id, i) => player.inventory[i] = { id, count: 64 });
      }
    }
    this.state = 'playing';
    UI.hideMenu(); UI.showHUD();
    UI.refreshHotbar(); UI.refreshStats();
    UI.log('World seed: ' + this.seed + (GenPool.threaded ? '  (worker chunkgen)' : '  (sync chunkgen)'));
    this.lockPointer();
  },
  quitToMenu() {
    SaveSys.save();
    this.state = 'menu';
    UI.closePause();
    if (UI.modal) UI.closeModal(false);
    UI.hideHUD(); UI.showMenu();
    document.exitPointerLock && document.exitPointerLock();
  },
  lockPointer() {
    if (this.state !== 'playing' || UI.modal || UI.pauseOpen || UI.chatOpen) return;
    const c = document.getElementById('gl');
    if (c.requestPointerLock) { try { c.requestPointerLock(); } catch (e) { } }
  },
  /* ---------- commands ---------- */
  command(text) {
    if (!text.startsWith('/')) { UI.log('<you> ' + text); return; }
    const a = text.slice(1).split(/\s+/), cmd = a[0].toLowerCase();
    try {
      switch (cmd) {
        case 'gamemode': {
          const m = (a[1] || '')[0] === 'c' ? 'creative' : 'survival';
          player.mode = m; this.mode = m;
          if (m === 'survival') player.fly = false;
          UI.log('Gamemode set to ' + m); UI.refreshStats();
          break;
        }
        case 'tp':
          player.pos = { x: +a[1], y: +a[2], z: +a[3] };
          player.vel = { x: 0, y: 0, z: 0 };
          UI.log('Teleported'); break;
        case 'give': {
          let id = parseInt(a[1]);
          if (isNaN(id)) {
            const nm = a[1].toLowerCase().replace(/_/g, ' ');
            id = -1;
            for (let i = 1; i < 63; i++) if (BlockDefs[i] && BlockDefs[i].name.toLowerCase() === nm) id = i;
            for (const k in ItemDefs) if (ItemDefs[k].name.toLowerCase() === nm) id = +k;
          }
          if (def(id)) { player.give(id, parseInt(a[2]) || 1); UI.log('Given ' + def(id).name); }
          else UI.log('Unknown item: ' + a[1]);
          break;
        }
        case 'time':
          if (a[1] === 'set') {
            if (a[2] === 'day') this.tod = 0.2;
            else if (a[2] === 'night') this.tod = 0.6;
            else this.tod = ((+a[2] % 24000) / 24000) || 0;
            UI.log('Time set');
          }
          break;
        case 'kill': player.damage(1000, 'void'); player.die(); break;
        case 'seed': UI.log('Seed: ' + this.seed); break;
        case 'weather':
          if (['clear', 'rain', 'thunder'].includes(a[1])) { this.weather = a[1]; UI.log('Weather: ' + a[1]); }
          break;
        default: UI.log('Unknown command: /' + cmd);
      }
    } catch (e) { UI.log('Command error'); }
  },
  /* ---------- loop ---------- */
  last: 0,
  loop(t) {
    requestAnimationFrame(ts => Game.loop(ts));
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0.016);
    this.last = t;
    this.fpsC++; this.fpsT += dt;
    if (this.fpsT > 0.5) {
      const el = document.getElementById('fps');
      if (el) el.textContent = Math.round(this.fpsC / this.fpsT) + ' fps · ' +
        (window.world ? world.chunks.size + ' chunks' : '');
      this.fpsC = 0; this.fpsT = 0;
    }
    if (this.state !== 'playing') return;
    const paused = UI.pauseOpen;
    if (!paused) {
      this.tod = (this.tod + dt / this.DAY_LEN) % 1;
      this.weatherT -= dt;
      if (this.weatherT <= 0) {
        this.weatherT = 60 + Math.random() * 200;
        this.weather = Math.random() < 0.65 ? 'clear' : Math.random() < 0.75 ? 'rain' : 'thunder';
      }
      const modalOpen = !!UI.modal || UI.chatOpen || UI.pauseOpen;
      if (!modalOpen) player.update(dt);
      world.update(dt, player.pos.x, player.pos.z);
      mobs.update(dt, player);
      /* furnaces */
      for (const [, c] of world.containers) if (c.type === 'furnace') {
        const inp = c.items[0], fuel = c.items[1], out = c.items[2];
        const res = inp && Crafting.SMELT[inp.id];
        if (c.burn > 0) c.burn -= dt;
        if (res && c.burn <= 0 && fuel && Crafting.FUEL[fuel.id] &&
            (!out || (out.id === res && out.count < def(res).stack))) {
          c.burnMax = c.burn = Crafting.FUEL[fuel.id] * 10;
          fuel.count--; if (!fuel.count) c.items[1] = null;
        }
        if (res && c.burn > 0 && (!out || (out.id === res && out.count < def(res).stack))) {
          c.progress += dt;
          if (c.progress >= 10) {
            c.progress = 0;
            inp.count--; if (!inp.count) c.items[0] = null;
            c.items[2] = out ? { id: res, count: out.count + 1 } : { id: res, count: 1 };
          }
        } else if (!res) c.progress = 0;
      }
      UI.tickFurnace();
      this.autosaveT += dt;
      if (this.autosaveT > 60) { this.autosaveT = 0; SaveSys.save(); }
      Sound.ambient(dt, this.dayFactor < 0.3);
      UI.refreshStats();
    }
    /* camera */
    const cam = renderer.camera;
    cam.position.set(player.pos.x, player.pos.y + 1.62, player.pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = player.yaw;
    cam.rotation.x = player.pitch;
    /* highlight */
    if (player.target && !player.dead) {
      renderer.highlight.visible = true;
      renderer.highlight.position.set(player.target.x + 0.5, player.target.y + 0.5, player.target.z + 0.5);
    } else renderer.highlight.visible = false;
    renderer.update(dt, this.tod, cam.position, this.weather);
    renderer.render();
  }
};

/* ================= input ================= */
function bindInputs() {
  const canvas = document.getElementById('gl');
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && Game.state === 'playing' && !UI.modal && !UI.chatOpen && !UI.pauseOpen && !player.dead)
      UI.openPause();
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas || !window.player) return;
    player.yaw -= e.movementX * 0.0022 * Game.sensitivity;
    player.pitch -= e.movementY * 0.0022 * Game.sensitivity;
    player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
  });
  canvas.addEventListener('mousedown', e => {
    if (Game.state !== 'playing' || UI.modal || UI.pauseOpen || UI.chatOpen) return;
    Sound.init();
    if (document.pointerLockElement !== canvas) { Game.lockPointer(); return; }
    if (e.button === 0) { Game.mouseL = true; player.attack(); }
    if (e.button === 2) { Game.mouseR = true; player.useT = 0; }
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) Game.mouseL = false;
    if (e.button === 2) Game.mouseR = false;
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', e => {
    if (Game.state !== 'playing' || UI.modal || !window.player) return;
    player.sel = (player.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    UI.refreshHotbar();
  });
  document.addEventListener('keydown', e => {
    if (Game.state !== 'playing') return;
    if (UI.chatOpen) return;
    if (e.code === 'Escape') {
      if (UI.modal) UI.closeModal();
      else if (UI.pauseOpen) UI.closePause();
      return;
    }
    if (UI.modal) {
      if (e.code === Controls.inventory) UI.closeModal();
      return;
    }
    if (UI.pauseOpen) return;
    for (const k in Controls) {
      if (e.code === Controls[k]) {
        if (k === 'inventory') { UI.openInventory(); return; }
        if (k === 'chat') { e.preventDefault(); UI.toggleChat(true); return; }
        if (k === 'drop') { player.dropHeld(); return; }
        if (k === 'jump') { player.tapJump(); }
        player.keys[k] = true;
        e.preventDefault();
        return;
      }
    }
    if (e.code === 'Slash') { e.preventDefault(); UI.toggleChat(true, '/'); return; }
    if (/^Digit[1-9]$/.test(e.code)) {
      player.sel = +e.code.slice(5) - 1;
      UI.refreshHotbar();
    }
  });
  document.addEventListener('keyup', e => {
    if (!window.player) return;
    for (const k in Controls) if (e.code === Controls[k]) player.keys[k] = false;
  });
  window.addEventListener('beforeunload', () => { if (Game.state === 'playing') SaveSys.save(); });
}

/* ================= boot ================= */
window.addEventListener('load', () => {
  if (!window.THREE) {
    document.body.innerHTML = '<div style="color:#fff;padding:40px;font-family:monospace">' +
      'Failed to load Three.js from CDN.<br>Please check your internet connection and reload.</div>';
    return;
  }
  initBlocks();
  UI.init();
  bindInputs();
  requestAnimationFrame(t => Game.loop(t));
});
