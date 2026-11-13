// Móveis e áreas do Bar do Quintal (tudo gerado por código, sem modelos externos).
// As medidas vêm de services/room3d/layout.js, as mesmas da colisão.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DANCE_FLOOR, JUKEBOX } from '../../services/room3d/layout';

export const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

export function box(w, h, d, material, radius = 0.06) {
  const g = radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, Math.min(w, h, d) / 2.2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const cyl = (rt, rb, h, material, seg = 16) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --------------------------------------------------------------------------
// Bar: balcão, prateleiras com garrafas e luminárias
// --------------------------------------------------------------------------

export function barCounter(theme, col) {
  const g = new THREE.Group();
  g.position.set(col.x, 0, col.z);
  const wood = mat(theme.counter.body, { roughness: 0.6 });
  const body = box(col.w, 1.05, col.d, wood, 0.05);
  body.position.y = 0.525;
  g.add(body);
  // painel frontal em ripas
  const slat = mat(new THREE.Color(theme.counter.body).multiplyScalar(0.8), { roughness: 0.7 });
  for (let i = 0; i < 24; i++) {
    const s = box(0.04, 0.9, 0.36, slat, 0.01);
    s.castShadow = false;
    s.position.set(-col.w / 2 - 0.02, 0.5, -col.d / 2 + 0.22 + i * (col.d - 0.44) / 23);
    g.add(s);
  }
  const top = box(col.w + 0.3, 0.07, col.d + 0.2, mat(theme.counter.top, { roughness: 0.35, metalness: 0.05 }), 0.03);
  top.position.set(-0.08, 1.1, 0);
  g.add(top);
  const rail = cyl(0.025, 0.025, col.d - 0.2, mat('#b08a4a', { metalness: 0.8, roughness: 0.3 }), 10);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(-col.w / 2 - 0.22, 0.22, 0);
  g.add(rail);
  // copos e um balde no balcão
  const glass = new THREE.MeshStandardMaterial({ color: '#dfe9ee', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
  [-3.2, -1.4, 0.4, 2.6].forEach((z, i) => {
    const c = cyl(0.04, 0.032, 0.12, glass, 12);
    c.position.set(-0.2 + (i % 2) * 0.12, 1.2, z);
    g.add(c);
  });
  const bucket = cyl(0.13, 0.1, 0.2, mat('#c9ccd2', { metalness: 0.85, roughness: 0.25 }), 18);
  bucket.position.set(0, 1.24, -4.2);
  g.add(bucket);
  return g;
}

export function backShelves(theme, col) {
  const g = new THREE.Group();
  g.position.set(col.x, 0, col.z);
  const wood = mat(new THREE.Color(theme.counter.body).multiplyScalar(0.75));
  const back = box(0.12, 2.6, col.d, wood, 0.02);
  back.position.set(0.3, 1.3, 0);
  g.add(back);
  // faixa de luz atrás das garrafas
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(col.d - 0.3, 0.06), new THREE.MeshBasicMaterial({ color: '#ffc27a', toneMapped: false }));
  glow.rotation.y = -Math.PI / 2;
  const shelfMat = mat(theme.counter.top, { roughness: 0.5 });
  const bottleColors = ['#3d6b3a', '#7a3b1d', '#c9a227', '#2f5d7a', '#8a2b3a', '#d8d2c4', '#4a3426'];
  const bottleGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.28, 10);
  const neckGeo = new THREE.CylinderGeometry(0.014, 0.02, 0.09, 8);
  const bottles = bottleColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }));
  // Centenas de garrafas: uma malha instanciada por cor (poucas chamadas de desenho).
  const placements = bottleColors.map(() => []);
  [0.9, 1.45, 2.0].forEach((y, row) => {
    const shelf = box(0.42, 0.04, col.d - 0.2, shelfMat, 0.01);
    shelf.position.set(0.08, y, 0);
    g.add(shelf);
    const strip = glow.clone();
    strip.position.set(0.22, y + 0.06, 0);
    g.add(strip);
    const count = Math.floor((col.d - 0.6) / 0.16);
    for (let i = 0; i < count; i++) {
      if ((i * 7 + row * 3) % 11 === 0) continue; // vãos
      const z = -col.d / 2 + 0.35 + i * 0.16;
      placements[(i * 3 + row * 5) % bottles.length].push([0.05 + ((i + row) % 2) * 0.08, y, z]);
    }
  });
  const m4 = new THREE.Matrix4();
  placements.forEach((list, ci) => {
    const body = new THREE.InstancedMesh(bottleGeo, bottles[ci], list.length);
    const neck = new THREE.InstancedMesh(neckGeo, bottles[ci], list.length);
    list.forEach(([x, y, z], k) => {
      body.setMatrixAt(k, m4.makeTranslation(x, y + 0.16, z));
      neck.setMatrixAt(k, m4.makeTranslation(x, y + 0.34, z));
    });
    g.add(body, neck);
  });
  // letreiro do bar
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.62), new THREE.MeshBasicMaterial({
    map: canvasTex(640, 124, (c, w, h) => {
      c.fillStyle = '#1c120c';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e8783f';
      c.lineWidth = 5;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.fillStyle = '#ffd7a8';
      c.font = '700 66px Georgia, "Times New Roman", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('Bar do Quintal', w / 2, h / 2 + 4);
    }),
    toneMapped: false
  }));
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(0.22, 2.35, 0);
  g.add(sign);
  return g;
}

export function pendantLamps(xs, zs, y, theme) {
  const g = new THREE.Group();
  const shade = mat('#1f1b17', { roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  const bulb = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
  const cordMat = mat('#111');
  xs.forEach((x) => zs.forEach((z) => {
    const cord = cyl(0.006, 0.006, 3.6 - y, cordMat, 4);
    cord.position.set(x, y + (3.6 - y) / 2, z);
    g.add(cord);
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 20, 1, true), shade);
    s.position.set(x, y, z);
    g.add(s);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulb);
    b.position.set(x, y - 0.08, z);
    g.add(b);
  }));
  void theme;
  return g;
}

// --------------------------------------------------------------------------
// Pergolado com luzinhas por cima da pista
// --------------------------------------------------------------------------

export function pergola(theme, pillars) {
  const g = new THREE.Group();
  const wood = mat(theme.rail === 'metal' || theme.rail === 'glow' ? '#3a3f4a' : '#4a3326', { roughness: 0.75 });
  pillars.forEach((p) => {
    const post = box(p.w, p.h, p.d, wood, 0.03);
    post.position.set(p.x, p.h / 2, p.z);
    g.add(post);
  });
  const xs = [...new Set(pillars.map((p) => p.x))].sort((a, b) => a - b);
  const zs = [...new Set(pillars.map((p) => p.z))].sort((a, b) => a - b);
  const top = pillars[0].h;
  zs.forEach((z) => {
    const beam = box(xs[xs.length - 1] - xs[0] + 0.8, 0.18, 0.22, wood, 0.02);
    beam.position.set((xs[0] + xs[xs.length - 1]) / 2, top, z);
    g.add(beam);
  });
  for (let x = xs[0]; x <= xs[xs.length - 1] + 0.01; x += 1.6) {
    const rafter = box(0.12, 0.12, zs[zs.length - 1] - zs[0] + 0.8, wood, 0.02);
    rafter.position.set(x, top + 0.15, (zs[0] + zs[zs.length - 1]) / 2);
    g.add(rafter);
  }
  return g;
}

// --------------------------------------------------------------------------
// Pista de dança: ladrilhos que acendem no ritmo (mais forte com a Vitrola tocando)
// --------------------------------------------------------------------------

export function danceFloor(anim, state) {
  const g = new THREE.Group();
  const cols = 10;
  const rows = 8;
  const tw = DANCE_FLOOR.w / cols;
  const td = DANCE_FLOOR.d / rows;
  const palette = ['#e8783f', '#6baf7b', '#5b8bd6', '#d9a640', '#c95f8a'].map((c) => new THREE.Color(c));
  const base = new THREE.Color('#1d1a17');
  // Uma malha instanciada (80 ladrilhos numa chamada de desenho). Material sem luz:
  // o ladrilho "aceso" é a própria cor, como um piso luminoso.
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(tw - 0.04, 0.04, td - 0.04), new THREE.MeshBasicMaterial({ color: '#ffffff' }), rows * cols);
  tiles.receiveShadow = false;
  const info = [];
  const m4 = new THREE.Matrix4();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      tiles.setMatrixAt(i, m4.makeTranslation(DANCE_FLOOR.x - DANCE_FLOOR.w / 2 + tw / 2 + c * tw, 0.02, DANCE_FLOOR.z - DANCE_FLOOR.d / 2 + td / 2 + r * td));
      info.push({ r, c, glow: 0.05, color: palette[(r * 3 + c) % palette.length] });
      tiles.setColorAt(i, base);
    }
  }
  g.add(tiles);
  const edge = box(DANCE_FLOOR.w + 0.2, 0.05, DANCE_FLOOR.d + 0.2, mat('#2a2622', { metalness: 0.5, roughness: 0.4 }), 0.02);
  edge.position.set(DANCE_FLOOR.x, 0.005, DANCE_FLOOR.z);
  g.add(edge);
  const tmp = new THREE.Color();
  anim.push((t) => {
    const energy = state.music ? 1 : 0.25;
    const beat = Math.floor(t * (state.music ? 2.1 : 0.6));
    info.forEach((tile, i) => {
      const on = ((tile.r + tile.c + beat) % 4 === 0) || ((tile.r * 7 + tile.c * 3 + beat) % 9 === 0);
      tile.glow += ((on ? 0.85 * energy : 0.04) - tile.glow) * 0.15;
      tiles.setColorAt(i, tmp.copy(base).lerp(tile.color, Math.min(1, 0.12 + tile.glow)));
    });
    tiles.instanceColor.needsUpdate = true;
  });
  return g;
}

// --------------------------------------------------------------------------
// Vitrola (jukebox): mostra o que está tocando e brilha quando tem música
// --------------------------------------------------------------------------

export function jukebox(anim, state) {
  const g = new THREE.Group();
  g.position.set(JUKEBOX.x, 0, JUKEBOX.z);
  g.rotation.y = Math.PI; // de frente para o sul (pista)
  const wood = mat('#6b3d22', { roughness: 0.5 });
  const body = box(JUKEBOX.w, 1.2, JUKEBOX.d, wood, 0.08);
  body.position.y = 0.6;
  g.add(body);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(JUKEBOX.w / 2, JUKEBOX.w / 2, JUKEBOX.d, 32, 1, false, 0, Math.PI), wood);
  arch.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  arch.position.y = 1.2;
  arch.castShadow = true;
  g.add(arch);
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffb066', toneMapped: false, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(JUKEBOX.w / 2 - 0.06, 0.03, 8, 40, Math.PI), glowMat);
  ring.position.set(0, 1.2, -JUKEBOX.d / 2 - 0.01);
  g.add(ring);
  // visor com o nome da faixa
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 512;
  screenCanvas.height = 192;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.32), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.98, -JUKEBOX.d / 2 - 0.012);
  screen.rotation.y = Math.PI;
  g.add(screen);
  const grill = box(0.8, 0.42, 0.02, mat('#2b2420', { metalness: 0.6, roughness: 0.4 }), 0.02);
  grill.position.set(0, 0.42, -JUKEBOX.d / 2 - 0.005);
  g.add(grill);
  const light = new THREE.PointLight('#ffad5c', 0, 5, 1.8);
  light.position.set(0, 1.3, -0.8);
  g.add(light);
  let lastText = null;
  const draw = (title, sub) => {
    const c = screenCanvas.getContext('2d');
    c.fillStyle = '#140d08';
    c.fillRect(0, 0, 512, 192);
    c.fillStyle = '#ffcf94';
    c.font = '600 38px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'center';
    const t = title.length > 24 ? `${title.slice(0, 23)}…` : title;
    c.fillText(t, 256, 86);
    c.fillStyle = 'rgba(255,207,148,0.65)';
    c.font = '400 26px "Segoe UI", system-ui, sans-serif';
    c.fillText(sub, 256, 140);
    screenTex.needsUpdate = true;
  };
  anim.push((t) => {
    const text = state.music ? `${state.music.title}|${state.music.by}` : '';
    if (text !== lastText) {
      lastText = text;
      if (state.music) draw(state.music.title, `pedida por ${state.music.by}`);
      else draw('Vitrola', state.vitrolaOn ? 'aperte E para pedir música' : 'adicione o bot nas configurações');
    }
    const pulse = state.music ? 0.75 + Math.sin(t * 6) * 0.25 : 0.35;
    glowMat.opacity = pulse;
    light.intensity = state.music ? 2.2 + Math.sin(t * 6) * 0.6 : 0.4;
  });
  return g;
}

// --------------------------------------------------------------------------
// Mesas de jogo (as peças e bolas vêm de gameProps.js e mudam com o jogo)
// --------------------------------------------------------------------------

export function chair(theme) {
  const g = new THREE.Group();
  const wood = mat(theme.table, { roughness: 0.6 });
  const seat = box(0.46, 0.06, 0.46, mat(theme.sofa.fabric), 0.03);
  seat.position.y = 0.47;
  g.add(seat);
  const back = box(0.06, 0.5, 0.44, wood, 0.02);
  back.position.set(-0.22, 0.75, 0);
  g.add(back);
  [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].forEach(([x, z]) => {
    const leg = box(0.04, 0.45, 0.04, wood, 0.01);
    leg.position.set(x, 0.225, z);
    g.add(leg);
  });
  return g;
}

export function boardTable(theme, table, kind) {
  const g = new THREE.Group();
  g.position.set(table.x, 0, table.z);
  const wood = mat(theme.table, { roughness: 0.55 });
  const top = box(table.w, 0.05, table.d, wood, 0.02);
  top.position.y = table.h - 0.025;
  g.add(top);
  const leg = cyl(0.05, 0.08, table.h - 0.05, mat('#2b2a33', { metalness: 0.5, roughness: 0.4 }), 12);
  leg.position.y = (table.h - 0.05) / 2;
  g.add(leg);
  const foot = cyl(0.3, 0.32, 0.03, mat('#2b2a33', { metalness: 0.5, roughness: 0.4 }), 20);
  foot.position.y = 0.015;
  g.add(foot);
  // tabuleiro 8x8
  const light = kind === 'chess' ? '#e9d8b4' : '#d9c7a0';
  const dark = kind === 'chess' ? '#7a5534' : '#3d5a3a';
  const boardTex = canvasTex(256, 256, (c) => {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      c.fillStyle = (r + f) % 2 ? dark : light;
      c.fillRect(f * 32, r * 32, 32, 32);
    }
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.02, 0.64), [
    mat('#3a2a1e'), mat('#3a2a1e'), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.45 }), mat('#3a2a1e'), mat('#3a2a1e'), mat('#3a2a1e')
  ]);
  board.position.y = table.h + 0.01;
  board.receiveShadow = true;
  g.add(board);
  table.spots.forEach((s) => {
    const c = chair(theme);
    c.position.set(s.x - table.x, 0, s.z - table.z);
    c.rotation.y = s.yaw - Math.PI / 2;
    g.add(c);
  });
  return g;
}

export function poolTable(table) {
  const g = new THREE.Group();
  g.position.set(table.x, 0, table.z);
  const wood = mat('#4a2a18', { roughness: 0.45 });
  const felt = mat('#1f6b45', { roughness: 0.95 });
  const base = box(table.w - 0.3, 0.55, table.d - 0.3, wood, 0.06);
  base.position.y = 0.45;
  g.add(base);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = box(0.16, 0.5, 0.16, wood, 0.03);
    leg.position.set(sx * (table.w / 2 - 0.25), 0.25, sz * (table.d / 2 - 0.22));
    g.add(leg);
  });
  const play = box(table.w - 0.24, 0.06, table.d - 0.24, felt, 0.01);
  play.position.y = 0.76;
  g.add(play);
  const railMat = mat('#5a321d', { roughness: 0.4 });
  const cushion = mat('#185a39', { roughness: 0.9 });
  [[0, -1, table.w, 0.12], [0, 1, table.w, 0.12], [-1, 0, 0.12, table.d], [1, 0, 0.12, table.d]].forEach(([sx, sz, w, d]) => {
    const r = box(w, 0.1, d, railMat, 0.03);
    r.position.set(sx * (table.w / 2 - 0.06), table.h - 0.05, sz * (table.d / 2 - 0.06));
    g.add(r);
    const c = box(sx ? 0.04 : w - 0.3, 0.05, sz ? 0.04 : d - 0.3, cushion, 0.01);
    c.position.set(sx * (table.w / 2 - 0.14), 0.81, sz * (table.d / 2 - 0.14));
    g.add(c);
  });
  const pocketMat = mat('#0b0b0b', { roughness: 1 });
  [-1, 0, 1].forEach((px) => [-1, 1].forEach((pz) => {
    const p = cyl(0.065, 0.065, 0.02, pocketMat, 16);
    p.position.set(px * (table.w / 2 - 0.14), 0.795, pz * (table.d / 2 - 0.14));
    g.add(p);
  }));
  // luminária retangular acima da mesa
  const lamp = box(1.6, 0.12, 0.38, mat('#2a3a2e', { metalness: 0.5, roughness: 0.4 }), 0.03);
  lamp.position.set(0, 2.1, 0);
  g.add(lamp);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.3), new THREE.MeshBasicMaterial({ color: '#fff1d0', toneMapped: false }));
  under.rotation.x = Math.PI / 2;
  under.position.set(0, 2.035, 0);
  g.add(under);
  const spot = new THREE.SpotLight('#fff1d0', 9, 4.5, 0.9, 0.6, 1.4);
  spot.position.set(0, 2.0, 0);
  spot.target.position.set(0, 0.8, 0);
  g.add(spot, spot.target);
  return g;
}

export function foosballTable(table) {
  const g = new THREE.Group();
  g.position.set(table.x, 0, table.z);
  const wood = mat('#2f2a26', { roughness: 0.5 });
  const sides = [[0, -1, table.w, 0.06], [0, 1, table.w, 0.06], [-1, 0, 0.06, table.d], [1, 0, 0.06, table.d]];
  sides.forEach(([sx, sz, w, d]) => {
    const s = box(w, 0.28, d, wood, 0.02);
    s.position.set(sx * (table.w / 2 - 0.03), table.h - 0.14, sz * (table.d / 2 - 0.03));
    g.add(s);
  });
  const field = new THREE.Mesh(new THREE.BoxGeometry(table.w - 0.1, 0.02, table.d - 0.1), new THREE.MeshStandardMaterial({
    map: canvasTex(320, 172, (c, w, h) => {
      c.fillStyle = '#2f7a43';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 3;
      c.strokeRect(6, 6, w - 12, h - 12);
      c.beginPath();
      c.moveTo(w / 2, 6);
      c.lineTo(w / 2, h - 6);
      c.stroke();
      c.beginPath();
      c.arc(w / 2, h / 2, 24, 0, Math.PI * 2);
      c.stroke();
    }),
    roughness: 0.9
  }));
  field.position.y = table.h - 0.27;
  g.add(field);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = box(0.1, table.h - 0.28, 0.1, wood, 0.02);
    leg.position.set(sx * (table.w / 2 - 0.1), (table.h - 0.28) / 2, sz * (table.d / 2 - 0.1));
    g.add(leg);
  });
  return g;
}

export function pingPongTable(table) {
  const g = new THREE.Group();
  g.position.set(table.x, 0, table.z);
  const top = new THREE.Mesh(new THREE.BoxGeometry(table.w, 0.04, table.d), new THREE.MeshStandardMaterial({
    map: canvasTex(548, 306, (c, w, h) => {
      c.fillStyle = '#1f4f7a';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f4f2ee';
      c.lineWidth = 6;
      c.strokeRect(3, 3, w - 6, h - 6);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, h / 2);
      c.lineTo(w, h / 2);
      c.stroke();
    }),
    roughness: 0.5
  }));
  top.position.y = table.h - 0.02;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  const legMat = mat('#2b2a33', { metalness: 0.5, roughness: 0.4 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = box(0.06, table.h - 0.04, 0.06, legMat, 0.01);
    leg.position.set(sx * (table.w / 2 - 0.2), (table.h - 0.04) / 2, sz * (table.d / 2 - 0.15));
    g.add(leg);
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(table.d + 0.12, 0.15), new THREE.MeshStandardMaterial({ color: '#f4f2ee', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.rotation.y = Math.PI / 2;
  net.position.set(0, table.h + 0.075, 0);
  g.add(net);
  return g;
}

// --------------------------------------------------------------------------
// Ambiente: piso do bar fora da pista
// --------------------------------------------------------------------------

export function tilesTexture(base, seam) {
  return canvasTex(512, 512, (c, w) => {
    const n = 8;
    const s = w / n;
    for (let r = 0; r < n; r++) for (let f = 0; f < n; f++) {
      const tone = 0.9 + (((r * 7 + f * 13) % 10) / 10) * 0.15;
      const col = new THREE.Color(base).multiplyScalar(tone);
      c.fillStyle = `#${col.getHexString()}`;
      c.fillRect(f * s, r * s, s, s);
    }
    c.strokeStyle = seam;
    c.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, w); c.stroke();
      c.beginPath(); c.moveTo(0, i * s); c.lineTo(w, i * s); c.stroke();
    }
  });
}
