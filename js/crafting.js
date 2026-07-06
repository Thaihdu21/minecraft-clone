'use strict';
/* ============ crafting.js — shaped/shapeless recipes, smelting ============ */
const Crafting = (function () {
  const P = [12, 15, 18];                 // any planks
  const R = [];
  const shaped = (p, k, r) => R.push({ p, k, r });
  const shapeless = (sl, r) => R.push({ sl, r });

  shapeless([10], [12, 4]); shapeless([13], [15, 4]); shapeless([16], [18, 4]);
  shaped(['P', 'P'], { P }, [256, 4]);                         // sticks
  shaped(['PP', 'PP'], { P }, [24, 1]);                        // crafting table
  shaped(['CCC', 'C C', 'CCC'], { C: [4] }, [25, 1]);          // furnace
  shaped(['PPP', 'P P', 'PPP'], { P }, [26, 1]);               // chest
  shaped(['C', 'S'], { C: [257], S: [256] }, [48, 4]);         // torch
  shaped(['SS', 'SS'], { S: [3] }, [30, 4]);                   // stone bricks
  shaped(['SS', 'SS'], { S: [6] }, [37, 4]);                   // sandstone
  shaped(['SS', 'SS'], { S: [270] }, [49, 1]);                 // wool
  shaped(['GSG', 'SGS', 'GSG'], { G: [271], S: [6] }, [27, 1]);// TNT
  shaped(['S', 'C'], { S: [256], C: [4] }, [60, 1]);           // lever
  shapeless([36, 36, 36, 36], [29, 1]);                        // clay -> bricks
  const mats = [[P, 280], [[4], 284], [[258], 288], [[260], 292]];
  for (const [M, base] of mats) {
    shaped(['M', 'M', 'S'], { M, S: [256] }, [base, 1]);               // sword
    shaped(['MMM', ' S ', ' S '], { M, S: [256] }, [base + 1, 1]);     // pickaxe
    shaped(['MM', 'MS', ' S'], { M, S: [256] }, [base + 2, 1]);        // axe
    shaped(['M', 'S', 'S'], { M, S: [256] }, [base + 3, 1]);           // shovel
  }
  [[257, 55], [258, 56], [259, 57], [260, 58]].forEach(([i, b]) => {
    shaped(['III', 'III', 'III'], { I: [i] }, [b, 1]);
    shapeless([b], [i, 9]);
  });
  [[258, 300], [260, 304]].forEach(([m, base]) => {
    shaped(['MMM', 'M M'], { M: [m] }, [base, 1]);
    shaped(['M M', 'MMM', 'MMM'], { M: [m] }, [base + 1, 1]);
    shaped(['MMM', 'M M', 'M M'], { M: [m] }, [base + 2, 1]);
    shaped(['M M', 'M M'], { M: [m] }, [base + 3, 1]);
  });
  // normalize shaped patterns to cell grids
  for (const r of R) if (r.p) {
    r.h = r.p.length; r.w = Math.max(...r.p.map(s => s.length));
    r.cells = [];
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const ch = (r.p[y][x] || ' ');
      r.cells.push(ch === ' ' ? null : r.k[ch]);
    }
  }
  function match(grid, w, h) {
    // trim bounding box of grid ids
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if (grid[y * w + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (maxX < 0) return null;
    const gw = maxX - minX + 1, gh = maxY - minY + 1;
    const ids = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) ids.push(grid[(y + minY) * w + (x + minX)] || 0);
    const flat = ids.filter(i => i).sort((a, b) => a - b);
    for (const r of R) {
      if (r.sl) {
        if (r.sl.length !== flat.length) continue;
        const need = [...r.sl].sort((a, b) => a - b);
        if (need.every((v, i) => v === flat[i])) return { id: r.r[0], count: r.r[1] };
      } else {
        if (r.w !== gw || r.h !== gh) continue;
        let ok = true;
        for (let i = 0; i < ids.length; i++) {
          const cell = r.cells[i];
          if (!cell) { if (ids[i]) { ok = false; break; } }
          else if (!cell.includes(ids[i])) { ok = false; break; }
        }
        if (ok) return { id: r.r[0], count: r.r[1] };
      }
    }
    return null;
  }
  const SMELT = { 20: 258, 21: 259, 6: 23, 4: 3, 10: 257, 261: 262, 263: 264, 265: 266, 267: 268, 36: 29 };
  const FUEL = { 257: 8, 55: 72, 12: 1.5, 15: 1.5, 18: 1.5, 10: 1.5, 13: 1.5, 16: 1.5, 256: 0.5, 45: 0.5, 24: 1.5 };
  return { match, SMELT, FUEL };
})();
