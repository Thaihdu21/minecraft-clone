'use strict';
/* ============ ui.js — HUD, menus, inventory/crafting/furnace/chest, chat, settings ============ */
const Controls = Object.assign({
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
  inventory: 'KeyE', drop: 'KeyQ', chat: 'KeyT'
}, JSON.parse(localStorage.getItem('minejs_keys') || '{}'));

const UI = {
  root: null, cursor: null, modal: null, chatOpen: false, pauseOpen: false,
  slots: [], craftGrid: Array(9).fill(null), craftSize: 2, openContainer: null,
  _lastStats: '',

  el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    (parent || this.root).appendChild(e);
    return e;
  },
  init() {
    this.root = document.getElementById('uiRoot');
    this.buildMenu(); this.buildHUD(); this.buildModals(); this.buildChat(); this.buildPause();
    this.cursorEl = this.el('div', '', document.body); this.cursorEl.id = 'cursorItem';
    this.cursorEl.innerHTML = '<span class="cnt"></span>';
    document.addEventListener('mousemove', e => {
      this.cursorEl.style.left = e.clientX + 4 + 'px';
      this.cursorEl.style.top = e.clientY + 4 + 'px';
    });
  },
  /* ---------- main menu ---------- */
  buildMenu() {
    const m = this.el('div', 'overlay'); m.id = 'menuUI';
    m.innerHTML = `<h1>MINE<span style="color:#7fdb46">JS</span></h1>
      <div class="subtitle">A browser voxel sandbox — Three.js edition</div>
      <div class="row"><input id="seedIn" type="text" placeholder="World seed (blank = random)"></div>
      <div class="row"><button id="modeBtn">Mode: Survival</button></div>
      <div class="row"><button id="newBtn">New World</button>
      <button id="loadBtn">Load World</button></div>
      <div class="subtitle" style="margin-top:18px">WASD move · Space jump · E inventory · T chat · Esc pause<br>
      Left click mine · Right click place/use · Creative: double-tap Space to fly</div>`;
    m.querySelector('#modeBtn').onclick = e => {
      Game.mode = Game.mode === 'survival' ? 'creative' : 'survival';
      e.target.textContent = 'Mode: ' + (Game.mode === 'survival' ? 'Survival' : 'Creative');
      Sound.init(); Sound.click();
    };
    m.querySelector('#newBtn').onclick = () => {
      Sound.init();
      const s = m.querySelector('#seedIn').value.trim();
      Game.newGame(s, Game.mode);
    };
    m.querySelector('#loadBtn').onclick = () => { Sound.init(); Game.loadGame(); };
    this.menuEl = m;
    this.refreshMenu();
  },
  refreshMenu() {
    this.menuEl.querySelector('#loadBtn').disabled = !SaveSys.has();
  },
  showMenu() { this.menuEl.classList.remove('hidden'); this.refreshMenu(); },
  hideMenu() { this.menuEl.classList.add('hidden'); },
  /* ---------- HUD ---------- */
  buildHUD() {
    const h = this.el('div', 'hidden'); h.id = 'hud';
    h.innerHTML = `<div id="crosshair">+</div><div id="fps"></div>
      <div id="stats"><span id="hearts"></span><span id="airB"></span><span id="hungerB"></span>
      <div id="xpwrap"><div id="xpfill"></div></div></div>
      <div id="hotbar"></div>
      <div id="bpwrap" class="hidden"><div id="bpfill"></div></div>
      <div id="msgBar"></div>`;
    this.hud = h;
    const hb = h.querySelector('#hotbar');
    this.hotbarEls = [];
    for (let i = 0; i < 9; i++) {
      const s = this.el('div', 'slot', hb);
      s.innerHTML = '<span class="cnt"></span><div class="dur"></div>';
      this.hotbarEls.push(s);
    }
  },
  showHUD() { this.hud.classList.remove('hidden'); },
  hideHUD() { this.hud.classList.add('hidden'); },
  drawStack(el, s) {
    const cnt = el.querySelector('.cnt'), dur = el.querySelector('.dur');
    if (!s) {
      el.style.backgroundImage = ''; cnt.textContent = ''; dur.style.width = '0';
      el.title = '';
      return;
    }
    const t = iconTile(s.id), sc = 36;
    el.style.backgroundImage = `url(${Atlas.dataURL})`;
    el.style.backgroundSize = `${16 * sc}px ${16 * sc}px`;
    el.style.backgroundPosition = `-${(t % 16) * sc + 2}px -${((t / 16) | 0) * sc + 2}px`;
    cnt.textContent = s.count > 1 ? s.count : '';
    const d = def(s.id);
    el.title = d ? d.name : '?';
    if (d && d.dur && s.dur !== undefined) {
      dur.style.width = Math.max(2, 36 * s.dur / d.dur) + 'px';
      dur.style.background = s.dur / d.dur > 0.4 ? '#3f3' : '#f80';
    } else dur.style.width = '0';
  },
  refreshHotbar() {
    if (!window.player) return;
    for (let i = 0; i < 9; i++) {
      this.drawStack(this.hotbarEls[i], player.inventory[i]);
      this.hotbarEls[i].classList.toggle('sel', player.sel === i);
    }
  },
  refreshStats() {
    if (!window.player) return;
    const p = player;
    if (p.mode === 'creative') {
      document.getElementById('stats').style.visibility = 'hidden';
      return;
    }
    document.getElementById('stats').style.visibility = 'visible';
    let hearts = '';
    for (let i = 0; i < 10; i++)
      hearts += `<span style="color:${p.hp >= i * 2 + 2 ? '#e33' : p.hp >= i * 2 + 1 ? '#a55' : '#333'}">\u2665</span>`;
    let food = '';
    for (let i = 0; i < 10; i++)
      food += `<span style="color:${p.hunger >= i * 2 + 2 ? '#c96' : p.hunger >= i * 2 + 1 ? '#864' : '#333'}">\u2588</span>`;
    const key = hearts + food + '|' + p.xp + '|' + Math.ceil(p.air);
    if (key === this._lastStats) return;
    this._lastStats = key;
    document.getElementById('hearts').innerHTML = hearts;
    document.getElementById('hungerB').innerHTML = food;
    document.getElementById('airB').textContent = p.air < 10 ? '○'.repeat(Math.max(0, Math.ceil(p.air))) : '';
    const lvl = Math.floor(Math.sqrt(p.xp) / 2);
    const cur = p.xp - Math.pow(lvl * 2, 2), next = Math.pow((lvl + 1) * 2, 2) - Math.pow(lvl * 2, 2);
    document.getElementById('xpfill').style.width = Math.min(100, cur / next * 100) + '%';
  },
  setBreakProgress(p) {
    const w = document.getElementById('bpwrap');
    if (p <= 0 || p >= 1) w.classList.add('hidden');
    else { w.classList.remove('hidden'); document.getElementById('bpfill').style.width = (p * 100) + '%'; }
  },
  msg(t) {
    const m = document.getElementById('msgBar');
    m.textContent = t; m.style.opacity = 1;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => m.style.opacity = 0, 2500);
  },
  hurtFlash() {
    document.body.style.boxShadow = 'inset 0 0 120px rgba(255,0,0,.6)';
    setTimeout(() => document.body.style.boxShadow = '', 200);
  },
  /* ---------- modals ---------- */
  buildModals() {
    this.modalEl = this.el('div', 'overlay dim hidden');
    this.panel = this.el('div', 'panel', this.modalEl);
    this.modalEl.addEventListener('mousedown', e => {
      if (e.target === this.modalEl && this.cursor && window.player) {
        // drop cursor stack into world
        const dirv = player.lookDir();
        mobs.spawnItem(player.pos.x + dirv.x, player.pos.y + 1.4, player.pos.z + dirv.z,
          this.cursor.id, this.cursor.count, this.cursor.dur, { x: dirv.x * 5, y: 2, z: dirv.z * 5 });
        this.cursor = null; this.refreshAll();
      }
    });
    /* death screen */
    this.deathEl = this.el('div', 'overlay hidden'); this.deathEl.id = 'deathUI';
    this.deathEl.innerHTML = '<h1>You died!</h1>';
    const rb = this.el('button', '', this.deathEl, 'Respawn');
    rb.onclick = () => player.respawn();
  },
  mkSlot(parent, bind, big) {
    const el = this.el('div', 'slot' + (big ? ' big' : ''), parent);
    el.innerHTML = '<span class="cnt"></span><div class="dur"></div>';
    el.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      this.slotClick(bind, e.button);
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    this.slots.push({ el, bind });
    return el;
  },
  slotClick(b, btn) {
    Sound.click();
    if (b.takeOnly) {
      const s = b.get();
      if (!s) return;
      if (!this.cursor) { this.cursor = { ...s }; b.onTake(); }
      else if (this.cursor.id === s.id && this.cursor.count + s.count <= def(s.id).stack) {
        this.cursor.count += s.count; b.onTake();
      }
      this.refreshAll();
      return;
    }
    if (b.filter && this.cursor && !b.filter(this.cursor)) return;
    const cur = this.cursor;
    let s = b.get();
    if (btn === 0) {
      if (cur && s && cur.id === s.id && def(s.id).stack > 1) {
        const room = def(s.id).stack - s.count, mv = Math.min(room, cur.count);
        s.count += mv; cur.count -= mv;
        if (!cur.count) this.cursor = null;
        b.set(s);
      } else { b.set(cur); this.cursor = s || null; }
    } else {
      if (!cur && s) {
        const half = Math.ceil(s.count / 2);
        this.cursor = { ...s, count: half };
        s.count -= half;
        b.set(s.count ? s : null);
      } else if (cur && (!s || (s.id === cur.id && s.count < def(s.id).stack))) {
        if (!s) b.set({ id: cur.id, count: 1, dur: cur.dur });
        else { s.count++; b.set(s); }
        cur.count--;
        if (!cur.count) this.cursor = null;
      }
    }
    this.refreshAll();
  },
  invBind(i) { return { get: () => player.inventory[i], set: v => { player.inventory[i] = v; } }; },
  buildInvSection(parent) {
    const main = this.el('div', 'grid invgrid', parent);
    for (let i = 9; i < 36; i++) this.mkSlot(main, this.invBind(i), true);
    const hot = this.el('div', 'grid invgrid', parent);
    hot.style.marginTop = '8px';
    for (let i = 0; i < 9; i++) this.mkSlot(hot, this.invBind(i), true);
  },
  closeModal(returnItems = true) {
    if (this.modal === 'craft' || this.modal === 'inv') {
      if (returnItems) this.craftGrid.forEach((s, i) => {
        if (s) { const left = player.give(s.id, s.count, s.dur); if (left) mobs.spawnItem(player.pos.x, player.pos.y + 1, player.pos.z, s.id, left, s.dur); }
        this.craftGrid[i] = null;
      });
    }
    if (this.cursor) {
      const left = player.give(this.cursor.id, this.cursor.count, this.cursor.dur);
      if (left) mobs.spawnItem(player.pos.x, player.pos.y + 1, player.pos.z, this.cursor.id, left, this.cursor.dur);
      this.cursor = null;
    }
    this.modal = null; this.openContainer = null;
    this.modalEl.classList.add('hidden');
    this.slots = [];
    this.refreshHotbar();
    Game.lockPointer();
  },
  openModal(name, buildFn) {
    document.exitPointerLock && document.exitPointerLock();
    this.modal = name;
    this.slots = [];
    this.panel.innerHTML = '';
    buildFn();
    this.modalEl.classList.remove('hidden');
    this.refreshAll();
  },
  openInventory() {
    if (player.mode === 'creative') return this.openCreative();
    this.craftSize = 2;
    this.openModal('inv', () => {
      this.panel.innerHTML = '<h3>Inventory</h3>';
      const top = this.el('div', 'mrow', this.panel);
      /* armor */
      const armorCol = this.el('div', '', top);
      for (let i = 0; i < 4; i++) {
        this.mkSlot(armorCol, {
          get: () => player.armor[i], set: v => { player.armor[i] = v; },
          filter: c => { const d = def(c.id); return d.armor !== undefined && d.slot === i; }
        }, true).title = ['Helmet', 'Chestplate', 'Leggings', 'Boots'][i];
      }
      /* 2x2 craft */
      const cw = this.el('div', 'mrow', top);
      cw.style.marginLeft = '30px';
      const cg = this.el('div', 'grid', cw); cg.style.width = '96px';
      for (let i = 0; i < 4; i++) {
        const gi = (i >> 1) * 3 + (i & 1);
        this.mkSlot(cg, { get: () => this.craftGrid[gi], set: v => { this.craftGrid[gi] = v; } }, true);
      }
      this.el('span', 'arrowIc', cw, '\u2794');
      this.mkResultSlot(cw, 2);
      this.buildInvSection(this.panel);
    });
  },
  mkResultSlot(parent, size) {
    this.mkSlot(parent, {
      takeOnly: true,
      get: () => {
        const w = 3, ids = this.craftGrid.map(s => s ? s.id : 0);
        const r = Crafting.match(ids, w, 3);
        return r ? { id: r.id, count: r.count, dur: def(r.id).dur } : null;
      },
      onTake: () => {
        this.craftGrid.forEach((s, i) => {
          if (s) { s.count--; if (!s.count) this.craftGrid[i] = null; }
        });
      }
    }, true);
  },
  openCraft() {
    this.craftSize = 3;
    this.openModal('craft', () => {
      this.panel.innerHTML = '<h3>Crafting Table</h3>';
      const row = this.el('div', 'mrow', this.panel);
      const cg = this.el('div', 'grid', row); cg.style.width = '144px';
      for (let i = 0; i < 9; i++)
        this.mkSlot(cg, { get: () => this.craftGrid[i], set: v => { this.craftGrid[i] = v; } }, true);
      this.el('span', 'arrowIc', row, '\u2794');
      this.mkResultSlot(row, 3);
      this.buildInvSection(this.panel);
    });
  },
  openFurnace(key) {
    if (!world.containers.has(key))
      world.containers.set(key, { type: 'furnace', items: [null, null, null], progress: 0, burn: 0, burnMax: 1 });
    const c = world.containers.get(key);
    this.openContainer = c;
    this.openModal('furnace', () => {
      this.panel.innerHTML = '<h3>Furnace</h3>';
      const row = this.el('div', 'mrow', this.panel);
      const col = this.el('div', '', row);
      this.mkSlot(col, { get: () => c.items[0], set: v => { c.items[0] = v; } }, true);
      this.fireEl = this.el('div', '', col, '🔥');
      this.fireEl.style.cssText = 'text-align:center;font-size:20px;opacity:.2';
      this.mkSlot(col, { get: () => c.items[1], set: v => { c.items[1] = v; } }, true);
      const mid = this.el('div', '', row);
      mid.style.cssText = 'margin:0 14px;width:60px';
      this.progEl = this.el('div', '', mid);
      this.progEl.style.cssText = 'height:8px;background:#fff;border:1px solid #555;width:0';
      this.mkSlot(row, {
        takeOnly: true,
        get: () => c.items[2],
        onTake: () => { c.items[2] = null; }
      }, true);
      this.buildInvSection(this.panel);
    });
  },
  openChest(key) {
    if (!world.containers.has(key))
      world.containers.set(key, { type: 'chest', items: Array(27).fill(null) });
    const c = world.containers.get(key);
    this.openContainer = c;
    this.openModal('chest', () => {
      this.panel.innerHTML = '<h3>Chest</h3>';
      const g = this.el('div', 'grid invgrid', this.panel);
      for (let i = 0; i < 27; i++)
        this.mkSlot(g, { get: () => c.items[i], set: v => { c.items[i] = v; } }, true);
      this.el('div', '', this.panel).style.height = '10px';
      this.buildInvSection(this.panel);
    });
  },
  openCreative() {
    this.openModal('creative', () => {
      this.panel.innerHTML = '<h3>Creative Inventory</h3>';
      const tabs = this.el('div', '', this.panel); tabs.id = 'creTabs';
      const list = this.el('div', 'grid invgrid', this.panel); list.id = 'creList';
      const cats = {
        'Blocks': [...Array(63).keys()].filter(i => i > 0 && ![8, 9].includes(i)),
        'Liquids': [8, 9],
        'Tools': Object.keys(ItemDefs).map(Number).filter(i => ItemDefs[i].tool || ItemDefs[i].armor !== undefined),
        'Items': Object.keys(ItemDefs).map(Number).filter(i => !ItemDefs[i].tool && ItemDefs[i].armor === undefined)
      };
      const show = cat => {
        list.innerHTML = '';
        cats[cat].forEach(id => {
          const el = document.createElement('div');
          el.className = 'slot big';
          el.innerHTML = '<span class="cnt"></span><div class="dur"></div>';
          this.drawStack(el, { id, count: 1, dur: def(id).dur });
          el.querySelector('.cnt').textContent = '';
          el.title = def(id).name;
          el.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            const n = e.button === 0 ? def(id).stack : 1;
            this.cursor = { id, count: n, dur: def(id).dur };
            this.refreshAll();
          });
          el.addEventListener('contextmenu', e => e.preventDefault());
          list.appendChild(el);
        });
      };
      Object.keys(cats).forEach(c => {
        const b = this.el('button', '', tabs, c);
        b.onclick = () => show(c);
      });
      show('Blocks');
      /* trash */
      const tr = this.el('div', 'mrow', this.panel);
      this.el('span', '', tr, 'Trash: ');
      this.mkSlot(tr, { get: () => null, set: () => { } }, true).style.borderColor = '#a33';
      this.buildInvSection(this.panel);
    });
  },
  refreshAll() {
    this.slots.forEach(s => this.drawStack(s.el, s.bind.get()));
    this.refreshHotbar();
    /* cursor */
    if (this.cursor) {
      const t = iconTile(this.cursor.id), sc = 36;
      this.cursorEl.style.backgroundImage = `url(${Atlas.dataURL})`;
      this.cursorEl.style.backgroundSize = `${16 * sc}px ${16 * sc}px`;
      this.cursorEl.style.backgroundPosition = `-${(t % 16) * sc}px -${((t / 16) | 0) * sc}px`;
      this.cursorEl.querySelector('.cnt').textContent = this.cursor.count > 1 ? this.cursor.count : '';
    } else {
      this.cursorEl.style.backgroundImage = '';
      this.cursorEl.querySelector('.cnt').textContent = '';
    }
  },
  tickFurnace() {
    if (this.modal !== 'furnace' || !this.openContainer) return;
    const c = this.openContainer;
    if (this.progEl) this.progEl.style.width = (c.progress / 10 * 100) + '%';
    if (this.fireEl) this.fireEl.style.opacity = c.burn > 0 ? 1 : 0.2;
    this.slots.forEach(s => this.drawStack(s.el, s.bind.get()));
  },
  /* ---------- chat ---------- */
  buildChat() {
    const c = this.el('div', 'hidden'); c.id = 'chatUI';
    c.innerHTML = '<div id="chatLog"></div><input id="chatIn" type="text" class="hidden" maxlength="120">';
    this.chatEl = c;
    this.chatIn = c.querySelector('#chatIn');
    this.chatIn.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = this.chatIn.value.trim();
        if (v) Game.command(v);
        this.toggleChat(false);
      } else if (e.key === 'Escape') this.toggleChat(false);
    });
  },
  toggleChat(open, prefill = '') {
    this.chatOpen = open;
    this.chatEl.classList.remove('hidden');
    if (open) {
      document.exitPointerLock && document.exitPointerLock();
      this.chatIn.classList.remove('hidden');
      this.chatIn.value = prefill;
      setTimeout(() => this.chatIn.focus(), 20);
    } else {
      this.chatIn.classList.add('hidden');
      this.chatIn.blur();
      Game.lockPointer();
    }
  },
  log(t) {
    const l = document.getElementById('chatLog');
    const d = document.createElement('div');
    d.textContent = t;
    l.appendChild(d);
    while (l.children.length > 8) l.removeChild(l.firstChild);
    this.chatEl.classList.remove('hidden');
    clearTimeout(this._chatT);
    this._chatT = setTimeout(() => { if (!this.chatOpen) this.chatEl.classList.add('hidden'); }, 8000);
  },
  /* ---------- pause / settings ---------- */
  buildPause() {
    const p = this.el('div', 'overlay dim hidden'); p.id = 'pauseUI';
    const panel = this.el('div', 'panel', p);
    panel.innerHTML = '<h3>Game Paused</h3>';
    const resume = this.el('button', '', panel, 'Resume');
    resume.onclick = () => this.closePause();
    const save = this.el('button', '', panel, 'Save World');
    save.onclick = () => { SaveSys.save() ? this.msg('World saved') : this.msg('Save failed'); Sound.click(); };
    const mode = this.el('button', '', panel, 'Toggle Game Mode');
    mode.onclick = () => { Game.command('/gamemode ' + (player.mode === 'survival' ? 'c' : 's')); };
    const quit = this.el('button', '', panel, 'Save & Quit to Menu');
    quit.onclick = () => Game.quitToMenu();
    panel.appendChild(document.createElement('hr'));
    /* settings */
    const s1 = this.el('div', 'mrow', panel);
    s1.innerHTML = 'Render distance: <input id="rdSlider" type="range" min="4" max="12" step="1"> <span id="rdVal"></span>';
    const rd = s1.querySelector('#rdSlider');
    rd.value = Game.renderDist;
    s1.querySelector('#rdVal').textContent = Game.renderDist;
    rd.oninput = () => { Game.renderDist = +rd.value; s1.querySelector('#rdVal').textContent = rd.value; };
    const s2 = this.el('div', 'mrow', panel);
    s2.innerHTML = 'Volume: <input id="volSlider" type="range" min="0" max="1" step="0.05">';
    const vs = s2.querySelector('#volSlider');
    vs.value = Game.volume;
    vs.oninput = () => { Game.volume = +vs.value; Sound.setVolume(Game.volume); };
    const s3 = this.el('div', 'mrow', panel);
    s3.innerHTML = 'Mouse sensitivity: <input id="senSlider" type="range" min="0.3" max="2.5" step="0.1">';
    const ss = s3.querySelector('#senSlider');
    ss.value = Game.sensitivity;
    ss.oninput = () => { Game.sensitivity = +ss.value; };
    /* keybinds */
    this.el('h3', '', panel, 'Controls (click to rebind)');
    const kb = this.el('div', '', panel);
    const names = { forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jump: 'Jump', sneak: 'Sneak/Down', sprint: 'Sprint', inventory: 'Inventory', drop: 'Drop item', chat: 'Chat' };
    for (const k in names) {
      const row = this.el('div', 'kbRow', kb, `<span>${names[k]}</span><b data-k="${k}">${Controls[k]}</b>`);
      row.querySelector('b').onclick = e => {
        const b = e.target;
        b.classList.add('listen'); b.textContent = '...';
        const h = ev => {
          ev.preventDefault();
          Controls[k] = ev.code;
          b.textContent = ev.code;
          b.classList.remove('listen');
          localStorage.setItem('minejs_keys', JSON.stringify(Controls));
          document.removeEventListener('keydown', h, true);
        };
        document.addEventListener('keydown', h, true);
      };
    }
    this.pauseEl = p;
  },
  openPause() { this.pauseOpen = true; this.pauseEl.classList.remove('hidden'); },
  closePause() { this.pauseOpen = false; this.pauseEl.classList.add('hidden'); Game.lockPointer(); },
  showDeath() { this.deathEl.classList.remove('hidden'); document.exitPointerLock && document.exitPointerLock(); },
  hideDeath() { this.deathEl.classList.add('hidden'); Game.lockPointer(); }
};
