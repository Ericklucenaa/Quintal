// Cena do Terraço: céu de entardecer, deck de madeira, telão, sofás, fogueira,
// balcão, plantas e varal de luzes. Tudo gerado por código a partir de
// services/room3d/layout.js (as mesmas medidas usadas na colisão).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROOM, SCREEN, SEATS } from '../../services/room3d/layout';

const PALETTE = {
  deck: '#9a6b47',
  deckDark: '#6f4a31',
  rail: '#4a3326',
  fabric: '#2f6e74',
  fabricDark: '#245459',
  cushion: '#e2a83e',
  rug: '#b5543f',
  stone: '#7d7a78',
  metal: '#2b2a33',
  leaf: '#4f8f4a',
  pot: '#c0663f'
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...opts });
}

function box(w, h, d, material, radius = 0.06) {
  const g = radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, Math.min(w, h, d) / 2.2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Textura de tábuas gerada em canvas (sem arquivos externos). */
function plankTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = (r * c.height) / rows;
    const h = c.height / rows;
    let x = -((r * 97) % 256);
    while (x < c.width) {
      const w = 180 + ((r * 53 + x) % 140);
      const tone = 0.86 + (((r * 31 + Math.floor(x)) % 17) / 17) * 0.22;
      g.fillStyle = `rgb(${Math.round(154 * tone)}, ${Math.round(107 * tone)}, ${Math.round(71 * tone)})`;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(60,35,20,0.55)';
      g.fillRect(x, y, 2, h);
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(80,50,30,${0.05 + (k % 3) * 0.03})`;
        g.fillRect(x + 8, y + 6 + k * (h / 7), w - 16, 1);
      }
      x += w;
    }
    g.fillStyle = 'rgba(40,24,14,0.7)';
    g.fillRect(0, y + h - 2, c.width, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.anisotropy = 4;
  return tex;
}

function rugTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.rug;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#e9c98f';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 228, 228);
  g.lineWidth = 3;
  g.strokeRect(30, 30, 196, 196);
  g.fillStyle = '#e9c98f';
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(128, 128);
    g.rotate((i * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, -70);
    g.lineTo(18, -40);
    g.lineTo(0, -10);
    g.lineTo(-18, -40);
    g.closePath();
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sky() {
  const geo = new THREE.SphereGeometry(80, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#1b1d48') },
      mid: { value: new THREE.Color('#7b4a8e') },
      horizon: { value: new THREE.Color('#ff9a62') },
      bottom: { value: new THREE.Color('#2a1b2e') }
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vPos;
      void main(){
        float h = vPos.y;
        vec3 c = h > 0.0 ? mix(horizon, mid, smoothstep(0.0, 0.25, h)) : mix(horizon, bottom, smoothstep(0.0, 0.12, -h));
        c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.75, h)) : c;
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  return new THREE.Mesh(geo, material);
}

function hills() {
  const group = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#3b2747', fog: true });
  const m2 = new THREE.MeshBasicMaterial({ color: '#2c1e38', fog: true });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 34 + (i % 3) * 5;
    const h = 5 + ((i * 7) % 5);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7 + (i % 4), h, 5), i % 2 ? m : m2);
    cone.position.set(Math.sin(a) * r, h / 2 - 3.5, Math.cos(a) * r);
    cone.rotation.y = a;
    group.add(cone);
  }
  return group;
}

function sofa(width, depth = 1.0) {
  const g = new THREE.Group();
  const fabric = mat(PALETTE.fabric);
  const dark = mat(PALETTE.fabricDark);
  const base = box(width, 0.42, depth, dark, 0.08);
  base.position.y = 0.21;
  g.add(base);
  const seat = box(width - 0.1, 0.16, depth - 0.25, fabric, 0.07);
  seat.position.set(0, 0.5, -0.08);
  g.add(seat);
  const back = box(width, 0.62, 0.24, fabric, 0.1);
  back.position.set(0, 0.7, depth / 2 - 0.12);
  g.add(back);
  [-1, 1].forEach((s) => {
    const arm = box(0.22, 0.56, depth, dark, 0.09);
    arm.position.set((s * (width - 0.22)) / 2, 0.42, 0);
    g.add(arm);
  });
  const cushion = mat(PALETTE.cushion);
  [-0.3, 0.3].forEach((x) => {
    const c = box(0.42, 0.36, 0.14, cushion, 0.06);
    c.position.set(x * (width / 1.6), 0.74, depth / 2 - 0.3);
    c.rotation.x = -0.25;
    g.add(c);
  });
  return g;
}

function stool(high = false) {
  const g = new THREE.Group();
  const h = high ? 0.78 : 0.42;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.1, 18), mat(high ? PALETTE.cushion : PALETTE.fabric));
  seat.position.y = h;
  seat.castShadow = true;
  g.add(seat);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 10), mat(PALETTE.metal, { metalness: 0.4, roughness: 0.5 }));
  leg.position.y = h / 2;
  leg.castShadow = true;
  g.add(leg);
  return g;
}

function plant(scale = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.55, 16), mat(PALETTE.pot));
  pot.position.y = 0.27;
  pot.castShadow = true;
  g.add(pot);
  const leafMat = mat(PALETTE.leaf);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9 + (i % 3) * 0.25, 5), leafMat);
    leaf.position.set(Math.sin(a) * 0.12, 0.95, Math.cos(a) * 0.12);
    leaf.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

function stringLights(group, from, to, sag, bulbMat) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * sag,
      from.z + (to.z - from.z) * t
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.012, 4), mat('#1a1a1a'));
  group.add(wire);
  const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
  for (let i = 1; i < n; i++) {
    const b = new THREE.Mesh(bulbGeo, bulbMat);
    b.position.copy(curve.getPoint(i / n));
    b.position.y -= 0.08;
    group.add(b);
  }
}

/** Textura da TV quando ninguém transmite (ou quando é você quem transmite). */
export function makePlaceholderCanvas(title, subtitle) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  drawPlaceholder(c, title, subtitle);
  return c;
}

export function drawPlaceholder(c, title, subtitle) {
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#1d1a2e');
  grad.addColorStop(1, '#2d2140');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 40; i++) g.fillRect((i * 173) % c.width, (i * 97) % c.height, 2, 2);
  g.textAlign = 'center';
  g.fillStyle = '#f4ede0';
  g.font = '600 64px "Segoe UI", system-ui, sans-serif';
  g.fillText(title, c.width / 2, c.height / 2 - 6);
  g.fillStyle = 'rgba(244,237,224,0.65)';
  g.font = '400 30px "Segoe UI", system-ui, sans-serif';
  g.fillText(subtitle, c.width / 2, c.height / 2 + 50);
}

/**
 * Monta a cena. Devolve { scene, screenMesh, fireLight, flames, update(t) }.
 */
export function buildTerrace() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#4a2f52', 22, 70);
  scene.add(sky());
  scene.add(hills());

  // Luzes: céu frio, sol baixo e quente, fogueira e varal.
  scene.add(new THREE.HemisphereLight('#9fb0ff', '#3b2731', 0.75));
  const sun = new THREE.DirectionalLight('#ffb48a', 1.6);
  sun.position.set(-14, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // Deck e borda
  const deckW = ROOM.maxX - ROOM.minX;
  const deckD = ROOM.maxZ - ROOM.minZ;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(deckW + 0.6, deckD + 0.6), mat('#ffffff', { map: plankTexture(), roughness: 0.9 }));
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  scene.add(deck);
  const under = box(deckW + 0.8, 0.5, deckD + 0.8, mat(PALETTE.deckDark), 0.04);
  under.position.y = -0.26;
  scene.add(under);

  // Guarda-corpo
  const railMat = mat(PALETTE.rail);
  const rails = new THREE.Group();
  const addRail = (x, z, w, d) => {
    const top = box(w, 0.08, d, railMat, 0.02);
    top.position.set(x, 1.0, z);
    rails.add(top);
    const mid = box(w, 0.05, d, railMat, 0.02);
    mid.position.set(x, 0.55, z);
    rails.add(mid);
  };
  addRail(0, ROOM.maxZ + 0.15, deckW + 0.3, 0.08);
  addRail(ROOM.minX - 0.15, 0, 0.08, deckD + 0.3);
  addRail(ROOM.maxX + 0.15, 0, 0.08, deckD + 0.3);
  for (let x = ROOM.minX; x <= ROOM.maxX + 0.01; x += 1.5) {
    const p = box(0.1, 1.05, 0.1, railMat, 0.02);
    p.position.set(x, 0.52, ROOM.maxZ + 0.15);
    rails.add(p);
  }
  for (let z = ROOM.minZ; z <= ROOM.maxZ + 0.01; z += 1.5) {
    [ROOM.minX - 0.15, ROOM.maxX + 0.15].forEach((x) => {
      const p = box(0.1, 1.05, 0.1, railMat, 0.02);
      p.position.set(x, 0.52, z);
      rails.add(p);
    });
  }
  scene.add(rails);

  // Parede de fundo com o telão
  const wall = box(deckW + 0.6, 4.6, 0.3, mat('#3a2b3f'), 0.04);
  wall.position.set(0, 2.3, ROOM.minZ - 0.2);
  scene.add(wall);
  const frame = box(SCREEN.width + 0.3, SCREEN.height + 0.3, 0.14, mat(PALETTE.metal, { roughness: 0.4 }), 0.05);
  frame.position.set(SCREEN.x, SCREEN.y, SCREEN.z - 0.08);
  scene.add(frame);
  const screenMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), screenMat);
  screenMesh.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  scene.add(screenMesh);
  const rack = box(4.2, 0.45, 0.55, mat('#2e2633'), 0.05);
  rack.position.set(0, 0.23, SCREEN.z + 0.45);
  scene.add(rack);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width + 1.2, 0.08), new THREE.MeshBasicMaterial({ color: '#b9a8ff', toneMapped: false }));
  glow.position.set(0, SCREEN.y - SCREEN.height / 2 - 0.35, SCREEN.z + 0.02);
  scene.add(glow);

  // Tapete e sofás
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.6), mat('#ffffff', { map: rugTexture() }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, -2.2);
  rug.receiveShadow = true;
  scene.add(rug);
  const center = sofa(3.3);
  center.position.set(0, 0, -1.2);
  center.rotation.y = 0; // encosto voltado para o sul, assento olhando o telão
  scene.add(center);
  const west = sofa(2.6);
  west.position.set(-2.75, 0, -2.3);
  west.rotation.y = Math.PI / 2 + Math.PI; // olhando para o leste
  scene.add(west);
  const east = sofa(2.6);
  east.position.set(2.75, 0, -2.3);
  east.rotation.y = -Math.PI / 2 + Math.PI;
  scene.add(east);
  const table = box(1.6, 0.36, 0.8, mat('#5a3d2b'), 0.06);
  table.position.set(0, 0.18, -2.9);
  scene.add(table);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 12), mat('#f1e6cf'));
  mug.position.set(0.4, 0.42, -2.85);
  scene.add(mug);

  // Fogueira
  const fire = new THREE.Group();
  fire.position.set(0, 0, 3.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.18, 10, 24), mat(PALETTE.stone, { roughness: 1 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.18;
  ring.castShadow = true;
  ring.receiveShadow = true;
  fire.add(ring);
  const logMat = mat('#4a2e1e');
  [0, 1, 2].forEach((i) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), logMat);
    log.rotation.set(Math.PI / 2, 0, (i * Math.PI) / 3);
    log.position.y = 0.16;
    fire.add(log);
  });
  const flames = [];
  const flameColors = ['#ffb347', '#ff7a2f', '#ffd36b'];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.16 - i * 0.015, 0.7 - i * 0.06, 7),
      new THREE.MeshBasicMaterial({ color: flameColors[i % 3], transparent: true, opacity: 0.85, toneMapped: false })
    );
    const a = (i / 5) * Math.PI * 2;
    f.position.set(Math.sin(a) * 0.12, 0.5, Math.cos(a) * 0.12);
    f.userData.phase = i * 1.3;
    fire.add(f);
    flames.push(f);
  }
  const fireLight = new THREE.PointLight('#ff8a3d', 9, 9, 1.6);
  fireLight.position.set(0, 0.9, 0);
  fireLight.castShadow = false;
  fire.add(fireLight);
  scene.add(fire);

  // Assentos avulsos (banquinhos da fogueira e banquetas do balcão)
  SEATS.filter((s) => s.stool).forEach((s) => {
    const st = stool(Boolean(s.high));
    st.position.set(s.x, 0, s.z);
    scene.add(st);
  });

  // Balcão
  const counter = box(1.0, 1.05, 5.2, mat('#5a3d2b'), 0.06);
  counter.position.set(7.6, 0.53, 0.5);
  scene.add(counter);
  const top = box(1.2, 0.08, 5.4, mat('#d9c7a6', { roughness: 0.5 }), 0.03);
  top.position.set(7.55, 1.09, 0.5);
  scene.add(top);
  const bottleColors = ['#2f8f6f', '#c0663f', '#e2a83e', '#6a5acd'];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 10), mat(bottleColors[i % 4], { roughness: 0.3, transparent: true, opacity: 0.9 }));
    b.position.set(7.75, 1.28, -1.4 + i * 0.6);
    scene.add(b);
  }

  // Plantas nos cantos
  [[-8.2, -6.2, 1.1], [8.2, -6.2, 1.1], [-8.2, 6.2, 0.9], [8.2, 6.2, 0.9]].forEach(([x, z, s]) => {
    const p = plant(s);
    p.position.set(x, 0, z);
    scene.add(p);
  });

  // Varal de luzes entre postes
  const poleMat = mat(PALETTE.rail);
  const corners = [[-8.8, -6.8], [8.8, -6.8], [8.8, 6.8], [-8.8, 6.8]];
  corners.forEach(([x, z]) => {
    const pole = box(0.12, 3.6, 0.12, poleMat, 0.03);
    pole.position.set(x, 1.8, z);
    scene.add(pole);
  });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe1a0', toneMapped: false });
  const lights = new THREE.Group();
  const hp = (x, z) => new THREE.Vector3(x, 3.55, z);
  // Só no contorno: nenhum fio passa na frente do telão.
  stringLights(lights, hp(-8.8, -6.8), hp(-8.8, 6.8), 0.7, bulbMat);
  stringLights(lights, hp(8.8, -6.8), hp(8.8, 6.8), 0.7, bulbMat);
  stringLights(lights, hp(-8.8, 6.8), hp(8.8, 6.8), 0.6, bulbMat);
  scene.add(lights);
  const warm = new THREE.PointLight('#ffd7a0', 4, 14, 1.8);
  warm.position.set(0, 3.0, 0);
  scene.add(warm);

  let t = 0;
  const update = (dt) => {
    t += dt;
    flames.forEach((f) => {
      const k = 0.85 + Math.sin(t * 9 + f.userData.phase) * 0.12 + Math.sin(t * 23 + f.userData.phase) * 0.05;
      f.scale.set(1, k, 1);
      f.rotation.y = t * 0.6 + f.userData.phase;
    });
    fireLight.intensity = 8 + Math.sin(t * 13) * 1.2 + Math.sin(t * 29) * 0.6;
  };

  return { scene, screenMesh, update };
}
