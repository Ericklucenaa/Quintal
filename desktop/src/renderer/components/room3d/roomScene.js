// Cena da sala 3D montada a partir de um tema (services/room3d/themes.js).
// O arranjo dos móveis vem de services/room3d/layout.js (as mesmas medidas da colisão).
// Tudo é gerado por código: nenhum modelo ou textura externa.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLLIDERS, GAME_TABLES, ROOM, SCREEN, SEATS } from '../../services/room3d/layout';
import {
  backShelves, barCounter, boardTable, danceFloor, foosballTable, jukebox, pendantLamps, pergola, pingPongTable, poolTable
} from './barScene';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

function box(w, h, d, material, radius = 0.06) {
  const g = radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, Math.min(w, h, d) / 2.2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function canvasTexture(size, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = 4;
  }
  return tex;
}

// Gerador pseudoaleatório estável (mesma cena em todas as máquinas).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --------------------------------------------------------------------------
// Chão
// --------------------------------------------------------------------------

function planks(g, n, base, seam, gloss = false) {
  const rows = 8;
  const [r0, g0, b0] = base;
  for (let r = 0; r < rows; r++) {
    const y = (r * n) / rows;
    const h = n / rows;
    let x = -((r * 97) % 256);
    while (x < n) {
      const w = 180 + ((r * 53 + x) % 140);
      const tone = 0.86 + (((r * 31 + Math.floor(x)) % 17) / 17) * 0.22;
      g.fillStyle = `rgb(${Math.round(r0 * tone)}, ${Math.round(g0 * tone)}, ${Math.round(b0 * tone)})`;
      g.fillRect(x, y, w, h);
      g.fillStyle = seam;
      g.fillRect(x, y, 2, h);
      if (gloss) {
        g.fillStyle = 'rgba(160,190,255,0.08)';
        g.fillRect(x + 10, y + h * 0.3, w * 0.5, 3);
      }
      x += w;
    }
    g.fillStyle = seam;
    g.fillRect(0, y + h - 2, n, 2);
  }
}

function speckle(g, n, colors, count, rand, maxR = 2) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[i % colors.length];
    const r = 0.5 + rand() * maxR;
    g.beginPath();
    g.arc(rand() * n, rand() * n, r, 0, Math.PI * 2);
    g.fill();
  }
}

function floorMaterial(kind) {
  const rand = rng(7);
  switch (kind) {
    case 'sand':
      return mat('#ffffff', { map: canvasTexture(512, (g, n) => {
        g.fillStyle = '#e3c890'; g.fillRect(0, 0, n, n);
        speckle(g, n, ['#d6b97e', '#efd9a8', '#c9a86c'], 2600, rand, 1.6);
        g.strokeStyle = 'rgba(180,140,80,0.25)'; g.lineWidth = 3;
        for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, i * 60 + 20); g.bezierCurveTo(n * 0.3, i * 60, n * 0.6, i * 60 + 40, n, i * 60 + 18); g.stroke(); }
      }, [4, 3]), roughness: 1 });
    case 'snow':
      return mat('#ffffff', { map: canvasTexture(512, (g, n) => {
        g.fillStyle = '#f4f7fb'; g.fillRect(0, 0, n, n);
        speckle(g, n, ['#e3eaf3', '#ffffff', '#d7e1ee'], 1800, rand, 3);
      }, [4, 3]), roughness: 0.95 });
    case 'regolith':
      return mat('#ffffff', { map: canvasTexture(512, (g, n) => {
        g.fillStyle = '#8d8f95'; g.fillRect(0, 0, n, n);
        speckle(g, n, ['#7b7d83', '#a3a5ab', '#6c6e74'], 3000, rand, 1.8);
        for (let i = 0; i < 14; i++) {
          const x = rand() * n; const y = rand() * n; const r = 8 + rand() * 26;
          g.strokeStyle = 'rgba(60,60,66,0.6)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
          g.fillStyle = 'rgba(70,70,76,0.35)'; g.beginPath(); g.arc(x + 2, y + 2, r * 0.8, 0, Math.PI * 2); g.fill();
        }
      }, [3, 2.4]), roughness: 1 });
    case 'grass':
      return mat('#ffffff', { map: canvasTexture(512, (g, n) => {
        g.fillStyle = '#4f7f3c'; g.fillRect(0, 0, n, n);
        speckle(g, n, ['#5f9a46', '#3f6a30', '#6aa84f', '#8a6a3a'], 3200, rand, 2.2);
      }, [4, 3]), roughness: 1 });
    case 'wetdeck':
      return mat('#ffffff', { map: canvasTexture(512, (g, n) => planks(g, n, [70, 78, 92], 'rgba(10,12,18,0.8)', true), [4, 3]), roughness: 0.28, metalness: 0.15 });
    default:
      return mat('#ffffff', { map: canvasTexture(512, (g, n) => planks(g, n, [154, 107, 71], 'rgba(60,35,20,0.6)'), [4, 3]), roughness: 0.9 });
  }
}

// --------------------------------------------------------------------------
// Céu e entorno
// --------------------------------------------------------------------------

function sky(colors) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(colors.top) },
      mid: { value: new THREE.Color(colors.mid) },
      horizon: { value: new THREE.Color(colors.horizon) },
      bottom: { value: new THREE.Color(colors.bottom) }
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
  return new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), material);
}

function ground(color, size = 160, y = -0.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color, { roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function pineTree(h, leaf, trunk, snow = false) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * h / 4, 0.18 * h / 4, h * 0.3, 6), mat(trunk));
  t.position.y = h * 0.15;
  g.add(t);
  const leafMat = mat(leaf);
  const snowMat = mat('#f4f7fb');
  for (let i = 0; i < 3; i++) {
    const r = (0.42 - i * 0.1) * h / 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.42, 7), leafMat);
    cone.position.y = h * (0.38 + i * 0.2);
    cone.castShadow = true;
    g.add(cone);
    if (snow) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, h * 0.16, 7), snowMat);
      cap.position.y = h * (0.52 + i * 0.2);
      g.add(cap);
    }
  }
  return g;
}

function palmTree(h) {
  const g = new THREE.Group();
  const trunkMat = mat('#8a6236');
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.19 - i * 0.012, h / 6, 7), trunkMat);
    seg.position.set(i * i * 0.025, (i + 0.5) * (h / 6), 0);
    seg.rotation.z = -i * 0.05;
    seg.castShadow = true;
    g.add(seg);
  }
  const leafMat = mat('#3f8f3a', { side: THREE.DoubleSide });
  const top = new THREE.Vector3(0.9, h, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 3), leafMat);
    leaf.position.set(top.x + Math.cos(a) * 0.9, top.y - 0.3, top.z + Math.sin(a) * 0.9);
    leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2 - Math.PI / 2 * 0);
    leaf.lookAt(top.x + Math.cos(a) * 3, top.y - 1.4, top.z + Math.sin(a) * 3);
    leaf.rotateX(Math.PI / 2);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

function surroundings(theme, anim) {
  const group = new THREE.Group();
  const rand = rng(42);
  switch (theme.surroundings) {
    case 'ocean': {
      group.add(ground('#d9bf86', 160, -0.45));
      const segs = 80;
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(160, 70, segs, 30), mat('#1d5f7a', { roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.95 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, -0.35, -50);
      group.add(sea);
      const base = sea.geometry.attributes.position.array.slice();
      anim.push((t) => {
        const p = sea.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3];
          const y = base[i * 3 + 1];
          p.array[i * 3 + 2] = Math.sin(x * 0.25 + t * 1.2) * 0.18 + Math.cos(y * 0.3 + t * 0.9) * 0.14;
        }
        p.needsUpdate = true;
      });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff2d6', fog: false }));
      moon.position.set(-30, 26, -110);
      group.add(moon);
      [[-22, -15], [22, -15], [-23, 4], [23, 6], [-20, 19], [20, 20]].forEach(([x, z], i) => {
        const p = palmTree(6 + (i % 3));
        p.position.set(x, -0.45, z);
        p.rotation.y = i;
        group.add(p);
      });
      break;
    }
    case 'snowpines':
    case 'forest': {
      const snowy = theme.surroundings === 'snowpines';
      group.add(ground(snowy ? '#eef3f8' : '#35502c', 160, -0.45));
      for (let i = 0; i < 70; i++) {
        const a = rand() * Math.PI * 2;
        const r = 23 + rand() * 26;
        const t = pineTree(5 + rand() * 6, snowy ? '#2f5d46' : '#24452f', '#4a3220', snowy);
        t.position.set(Math.sin(a) * r, -0.45, Math.cos(a) * r);
        group.add(t);
      }
      break;
    }
    case 'planet': {
      group.add(ground('#5c5e64', 200, -0.45));
      const craterMat = mat('#4a4c52', { roughness: 1 });
      for (let i = 0; i < 26; i++) {
        const c = new THREE.Mesh(new THREE.TorusGeometry(1 + rand() * 3, 0.25, 6, 18), craterMat);
        const a = rand() * Math.PI * 2;
        const r = 24 + rand() * 50;
        c.rotation.x = Math.PI / 2;
        c.position.set(Math.sin(a) * r, -0.4, Math.cos(a) * r);
        group.add(c);
      }
      const planet = new THREE.Mesh(new THREE.SphereGeometry(14, 40, 30), new THREE.MeshStandardMaterial({
        map: canvasTexture(512, (g, n) => {
          g.fillStyle = '#1f5fb8'; g.fillRect(0, 0, n, n);
          const pr = rng(9);
          for (let i = 0; i < 26; i++) { g.fillStyle = i % 3 ? '#3f8f4a' : '#c9b27a'; g.beginPath(); g.ellipse(pr() * n, pr() * n, 20 + pr() * 60, 10 + pr() * 30, pr() * 3, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = 'rgba(255,255,255,0.55)';
          for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(pr() * n, pr() * n, 30 + pr() * 50, 4 + pr() * 8, pr() * 3, 0, Math.PI * 2); g.fill(); }
        }),
        roughness: 0.8,
        fog: false
      }));
      planet.position.set(35, 30, -90);
      group.add(planet);
      anim.push((t) => { planet.rotation.y = t * 0.02; });
      break;
    }
    case 'city': {
      group.add(ground('#10141d', 160, -0.45));
      const windowTex = canvasTexture(128, (g, n) => {
        g.fillStyle = '#141a26'; g.fillRect(0, 0, n, n);
        const pr = rng(5);
        for (let y = 6; y < n; y += 14) for (let x = 6; x < n; x += 12) {
          g.fillStyle = pr() > 0.55 ? (pr() > 0.5 ? '#ffd27a' : '#cfe3ff') : '#1d2433';
          g.fillRect(x, y, 6, 8);
        }
      }, [2, 3]);
      for (let i = 0; i < 46; i++) {
        const a = rand() * Math.PI * 2;
        const r = 30 + rand() * 30;
        const h = 6 + rand() * 22;
        const b = new THREE.Mesh(new THREE.BoxGeometry(3 + rand() * 4, h, 3 + rand() * 4), new THREE.MeshStandardMaterial({ color: '#ffffff', map: windowTex, emissive: '#ffffff', emissiveMap: windowTex, emissiveIntensity: 0.6, roughness: 0.9 }));
        b.position.set(Math.sin(a) * r, h / 2 - 0.45, Math.cos(a) * r);
        group.add(b);
      }
      break;
    }
    default: {
      group.add(ground('#2c1e38', 160, -0.6));
      const m1 = new THREE.MeshBasicMaterial({ color: '#3b2747' });
      const m2 = new THREE.MeshBasicMaterial({ color: '#2c1e38' });
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const r = 46 + (i % 3) * 6;
        const h = 5 + ((i * 7) % 5);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(7 + (i % 4), h, 5), i % 2 ? m1 : m2);
        cone.position.set(Math.sin(a) * r, h / 2 - 3.5, Math.cos(a) * r);
        group.add(cone);
      }
    }
  }
  return group;
}

// --------------------------------------------------------------------------
// Móveis
// --------------------------------------------------------------------------

function sofa(width, colors, depth = 1.0) {
  const g = new THREE.Group();
  const fabric = mat(colors.fabric);
  const dark = mat(colors.dark);
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
  const cushion = mat(colors.cushion);
  [-0.3, 0.3].forEach((x) => {
    const c = box(0.42, 0.36, 0.14, cushion, 0.06);
    c.position.set(x * (width / 1.6), 0.74, depth / 2 - 0.3);
    c.rotation.x = -0.25;
    g.add(c);
  });
  return g;
}

function stool(colors, high = false) {
  const g = new THREE.Group();
  const h = high ? 0.78 : 0.42;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.1, 18), mat(high ? colors.cushion : colors.fabric));
  seat.position.y = h;
  seat.castShadow = true;
  g.add(seat);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 10), mat('#2b2a33', { metalness: 0.4, roughness: 0.5 }));
  leg.position.y = h / 2;
  leg.castShadow = true;
  g.add(leg);
  return g;
}

function plant(kind, scale = 1) {
  const g = new THREE.Group();
  if (kind === 'crystal') {
    const m = new THREE.MeshStandardMaterial({ color: '#7fe7ff', emissive: '#2bb8ff', emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.9 });
    [[0, 0.7, 0, 0.5], [0.25, 0.45, 0.1, 0.32], [-0.22, 0.4, -0.12, 0.28], [0.05, 0.35, -0.28, 0.24]].forEach(([x, y, z, r]) => {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), m);
      c.position.set(x, y, z);
      c.scale.y = 1.8;
      g.add(c);
    });
  } else if (kind === 'pine') {
    g.add(pineTree(1.9, '#2f5d46', '#4a3220', true));
  } else if (kind === 'palm') {
    const p = palmTree(2.4);
    p.scale.setScalar(0.7);
    g.add(p);
  } else if (kind === 'fern') {
    const leafMat = mat('#3f7a34', { side: THREE.DoubleSide });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.0, 3), leafMat);
      leaf.position.set(Math.sin(a) * 0.3, 0.4, Math.cos(a) * 0.3);
      leaf.rotation.set(Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0);
      leaf.castShadow = true;
      g.add(leaf);
    }
  } else {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.55, 16), mat('#c0663f'));
    pot.position.y = 0.27;
    pot.castShadow = true;
    g.add(pot);
    const leafMat = mat('#4f8f4a');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9 + (i % 3) * 0.25, 5), leafMat);
      leaf.position.set(Math.sin(a) * 0.12, 0.95, Math.cos(a) * 0.12);
      leaf.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

function railing(theme) {
  const group = new THREE.Group();
  if (theme.rail === 'none') return group;
  const deckW = ROOM.maxX - ROOM.minX;
  const deckD = ROOM.maxZ - ROOM.minZ;
  const glow = theme.rail === 'glow';
  const railMat = glow
    ? new THREE.MeshStandardMaterial({ color: '#3fd0ff', emissive: '#3fd0ff', emissiveIntensity: 1.2 })
    : theme.rail === 'bamboo' ? mat('#c9a462')
      : theme.rail === 'log' ? mat('#6b4630')
        : theme.rail === 'metal' ? mat('#5a6170', { metalness: 0.6, roughness: 0.35 })
          : mat('#4a3326');
  const round = theme.rail === 'bamboo' || theme.rail === 'log' || glow;
  const bar = (x, z, w, d, y, thick) => {
    let m;
    if (round) {
      const len = Math.max(w, d);
      m = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick, len, 8), railMat);
      m.rotation.z = w > d ? Math.PI / 2 : 0;
      m.rotation.x = d > w ? Math.PI / 2 : 0;
      m.castShadow = true;
    } else {
      m = box(w, thick * 2, d, railMat, 0.02);
    }
    m.position.set(x, y, z);
    group.add(m);
  };
  const t = theme.rail === 'log' ? 0.08 : 0.045;
  [[0, ROOM.maxZ + 0.15, deckW + 0.3, 0.08], [ROOM.minX - 0.15, 0, 0.08, deckD + 0.3], [ROOM.maxX + 0.15, 0, 0.08, deckD + 0.3]].forEach(([x, z, w, d]) => {
    bar(x, z, w, d, 1.0, t);
    if (!glow) bar(x, z, w, d, 0.55, t * 0.8);
  });
  const post = (x, z) => {
    const p = round ? new THREE.Mesh(new THREE.CylinderGeometry(t * 1.2, t * 1.2, 1.05, 8), railMat) : box(0.1, 1.05, 0.1, railMat, 0.02);
    p.position.set(x, 0.52, z);
    p.castShadow = true;
    group.add(p);
  };
  for (let x = ROOM.minX; x <= ROOM.maxX + 0.01; x += 1.5) post(x, ROOM.maxZ + 0.15);
  for (let z = ROOM.minZ; z <= ROOM.maxZ + 0.01; z += 1.5) {
    post(ROOM.minX - 0.15, z);
    post(ROOM.maxX + 0.15, z);
  }
  return group;
}

function stringLights(group, from, to, sag, bulbMat) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * sag, from.z + (to.z - from.z) * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.012, 4), mat('#1a1a1a')));
  const geo = new THREE.SphereGeometry(0.06, 8, 6);
  const mats = Array.isArray(bulbMat) ? bulbMat : [bulbMat];
  for (let i = 1; i < n; i++) {
    const b = new THREE.Mesh(geo, mats[i % mats.length]);
    b.position.copy(curve.getPoint(i / n));
    b.position.y -= 0.08;
    if (mats.length > 1) b.scale.set(2.2, 2.6, 2.2); // lanternas de papel
    group.add(b);
  }
}

function fireplace(theme, anim, at) {
  const fire = new THREE.Group();
  fire.position.set(at.x, 0, at.z);
  if (theme.fire === 'hologram') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.3, 24), mat('#2b3346', { metalness: 0.5, roughness: 0.4 }));
    base.position.y = 0.15;
    fire.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color: '#3fd0ff', toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32;
    fire.add(ring);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: '#3fd0ff', wireframe: true, transparent: true, opacity: 0.85, toneMapped: false }));
    core.position.y = 1.0;
    fire.add(core);
    const light = new THREE.PointLight('#3fd0ff', 7, 9, 1.6);
    light.position.y = 1.0;
    fire.add(light);
    anim.push((t) => {
      core.rotation.y = t * 0.8;
      core.rotation.x = t * 0.5;
      core.position.y = 1.0 + Math.sin(t * 2) * 0.08;
      light.intensity = 6 + Math.sin(t * 3) * 1;
    });
    return fire;
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.18, 10, 24), mat('#7d7a78', { roughness: 1 }));
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
  const colors = ['#ffb347', '#ff7a2f', '#ffd36b'];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.015, 0.7 - i * 0.06, 7), new THREE.MeshBasicMaterial({ color: colors[i % 3], transparent: true, opacity: 0.85, toneMapped: false }));
    const a = (i / 5) * Math.PI * 2;
    f.position.set(Math.sin(a) * 0.12, 0.5, Math.cos(a) * 0.12);
    f.userData.phase = i * 1.3;
    fire.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight('#ff8a3d', 9, 9, 1.6);
  light.position.set(0, 0.9, 0);
  fire.add(light);
  anim.push((t) => {
    flames.forEach((f) => {
      f.scale.set(1, 0.85 + Math.sin(t * 9 + f.userData.phase) * 0.12 + Math.sin(t * 23 + f.userData.phase) * 0.05, 1);
      f.rotation.y = t * 0.6 + f.userData.phase;
    });
    light.intensity = 8 + Math.sin(t * 13) * 1.2 + Math.sin(t * 29) * 0.6;
  });
  return fire;
}

function particles(kind, anim) {
  if (!kind) return null;
  const rand = rng(77);
  const count = kind === 'rain' ? 1400 : kind === 'stars' ? 1600 : kind === 'snow' ? 900 : 70;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    if (kind === 'stars') {
      const a = rand() * Math.PI * 2;
      const e = rand() * 1.3;
      const r = 120;
      positions[i * 3] = Math.cos(a) * Math.cos(e) * r;
      positions[i * 3 + 1] = Math.sin(e) * r;
      positions[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    } else {
      positions[i * 3] = (rand() - 0.5) * 40;
      positions[i * 3 + 1] = rand() * (kind === 'fireflies' ? 3 : 12);
      positions[i * 3 + 2] = (rand() - 0.5) * 34;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const color = { snow: '#ffffff', rain: '#a9c4ff', stars: '#ffffff', fireflies: '#e8ff7a' }[kind];
  const size = { snow: 0.09, rain: 0.05, stars: 0.6, fireflies: 0.12 }[kind];
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: kind === 'rain' ? 0.55 : 0.9, depthWrite: false, toneMapped: false, sizeAttenuation: kind !== 'stars' }));
  if (kind === 'stars') return pts;
  const base = positions.slice();
  anim.push((t, dt) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      if (kind === 'fireflies') {
        p[i * 3] = base[i * 3] + Math.sin(t * 0.7 + i) * 0.6;
        p[i * 3 + 1] = 0.6 + base[i * 3 + 1] * 0.5 + Math.sin(t * 1.3 + i * 2) * 0.35;
        p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.5 + i) * 0.6;
      } else {
        const fall = kind === 'rain' ? 14 : 1.2;
        p[i * 3 + 1] -= fall * dt;
        if (kind === 'snow') p[i * 3] += Math.sin(t + i) * 0.004;
        if (p[i * 3 + 1] < 0) p[i * 3 + 1] += 12;
      }
    }
    geo.attributes.position.needsUpdate = true;
    if (kind === 'fireflies') pts.material.opacity = 0.6 + Math.sin(t * 3) * 0.3;
  });
  return pts;
}

/** Textura da TV quando não há transmissão. */
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
  g.textAlign = 'center';
  g.fillStyle = '#f4ede0';
  g.font = '600 64px "Segoe UI", system-ui, sans-serif';
  g.fillText(title, c.width / 2, c.height / 2 - 6);
  g.fillStyle = 'rgba(244,237,224,0.65)';
  g.font = '400 30px "Segoe UI", system-ui, sans-serif';
  g.fillText(subtitle, c.width / 2, c.height / 2 + 50);
}

const colliderById = (id) => COLLIDERS.find((c) => c.id === id);

/**
 * Monta a cena do tema. `state` é lido a cada quadro (música tocando, Vitrola ligada)
 * para a pista e a vitrola reagirem sem reconstruir a cena.
 * Devolve { scene, screenMesh, update(dt) }.
 */
export function buildRoom(theme, state = {}) {
  const anim = [];
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near * 1.4, theme.fog.far * 1.4);
  scene.add(sky(theme.sky));
  scene.add(surroundings(theme, anim));

  scene.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  sun.position.set(theme.sun.position[0] * 1.6, theme.sun.position[1] * 1.6, theme.sun.position[2] * 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 17, bottom: -17, far: 80 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Piso do deck e base
  const deckW = ROOM.maxX - ROOM.minX;
  const deckD = ROOM.maxZ - ROOM.minZ;
  const floorMat = floorMaterial(theme.floor);
  if (floorMat.map) floorMat.map.repeat.set(7, 5.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(deckW + 0.6, deckD + 0.6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const under = box(deckW + 0.8, 0.5, deckD + 0.8, mat(theme.floor === 'snow' ? '#c9d4e2' : '#3b2a20'), 0.04);
  under.position.y = -0.26;
  scene.add(under);
  scene.add(railing(theme));

  // Parede norte com o telão. A tela fica 6 cm à frente da moldura e usa deslocamento
  // de polígono: com a superfície a 1 cm a moldura "brigava" com a imagem e a TV piscava.
  const wall = box(deckW + 0.6, 6.2, 0.3, mat(theme.wall), 0.04);
  wall.position.set(0, 3.1, ROOM.minZ - 0.2);
  scene.add(wall);
  const frame = box(SCREEN.width + 0.36, SCREEN.height + 0.36, 0.14, mat('#1e1d24', { roughness: 0.4 }), 0.05);
  frame.position.set(SCREEN.x, SCREEN.y, SCREEN.z - 0.13);
  scene.add(frame);
  const screenMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), screenMat);
  screenMesh.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  scene.add(screenMesh);
  const stage = box(10, 0.3, 1.2, mat('#2e2633'), 0.04);
  stage.position.set(0, 0.15, SCREEN.z + 0.75);
  scene.add(stage);

  // Cinema: tapete, sofás e mesa de centro
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.2), mat('#ffffff', {
    map: canvasTexture(256, (g) => {
      g.fillStyle = theme.rug.base; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = theme.rug.line; g.lineWidth = 6; g.strokeRect(14, 14, 228, 228);
      g.lineWidth = 3; g.strokeRect(30, 30, 196, 196);
    }),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.03, -9.6);
  rug.receiveShadow = true;
  scene.add(rug);
  const sofaAt = (id, width, rotY) => {
    const c = colliderById(id);
    const so = sofa(width, theme.sofa);
    so.position.set(c.x, 0, c.z);
    so.rotation.y = rotY;
    scene.add(so);
  };
  sofaAt('sofa-centro', 4.2, 0);
  sofaAt('sofa-oeste', 2.6, -Math.PI / 2);
  sofaAt('sofa-leste', 2.6, Math.PI / 2);
  const ct = colliderById('mesa-centro');
  const table = box(ct.w, ct.h, ct.d, mat(theme.table), 0.06);
  table.position.set(ct.x, ct.h / 2, ct.z);
  scene.add(table);

  // Bar
  scene.add(barCounter(theme, colliderById('balcao')));
  scene.add(backShelves(theme, colliderById('prateleira')));
  scene.add(pendantLamps([13.2], [-5, -2.5, 0, 2.5], 2.4, theme));
  const barLight = new THREE.PointLight('#ffc98a', 6, 10, 1.6);
  barLight.position.set(12.4, 2.6, -1.5);
  scene.add(barLight);

  // Banquetas (bar e fogueira) e cadeiras do lounge
  SEATS.filter((s) => s.stool && !s.table).forEach((s) => {
    const st = stool(theme.sofa, Boolean(s.high));
    st.position.set(s.x, 0, s.z);
    scene.add(st);
  });
  scene.add(fireplace(theme, anim, colliderById('fogueira')));
  sofaAt('sofa-lounge', 3.3, 0);
  sofaAt('sofa-lounge-2', 2.6, Math.PI / 2);
  const lt = colliderById('mesa-lounge');
  const loungeTable = box(lt.w, lt.h, lt.d, mat(theme.table), 0.06);
  loungeTable.position.set(lt.x, lt.h / 2, lt.z);
  scene.add(loungeTable);

  // Pista, pergolado com luzes e vitrola
  scene.add(danceFloor(anim, state));
  const pillars = COLLIDERS.filter((c) => c.id.startsWith('pilar-'));
  scene.add(pergola(theme, pillars));
  scene.add(jukebox(anim, state));

  // Jogos
  GAME_TABLES.forEach((t) => {
    if (t.kind === 'chess' || t.kind === 'checkers') scene.add(boardTable(theme, t, t.kind));
    else if (t.kind === 'pool') scene.add(poolTable(t));
    else if (t.kind === 'foosball') scene.add(foosballTable(t));
    else if (t.kind === 'pingpong') scene.add(pingPongTable(t));
  });
  const gameLight = new THREE.PointLight(theme.lights.color, 3, 11, 1.8);
  gameLight.position.set(-11.4, 3.2, -1.5);
  scene.add(gameLight);

  // Plantas nos cantos
  [['vaso-no', 1.1], ['vaso-ne', 1.1], ['vaso-so', 0.9], ['vaso-se', 0.9]].forEach(([id, sc]) => {
    const c = colliderById(id);
    const pl = plant(theme.plant, sc);
    pl.position.set(c.x, 0, c.z);
    scene.add(pl);
  });

  // Luzinhas: no pergolado e no contorno (nenhum fio na frente do telão)
  if (theme.lights.style !== 'none') {
    const bulbs = theme.lights.style === 'lanterns'
      ? (theme.lights.palette || [theme.lights.color]).map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.9 }))
      : new THREE.MeshBasicMaterial({ color: theme.lights.color, toneMapped: false });
    const lights = new THREE.Group();
    const y = 3.55;
    const hp = (x, z, h = y) => new THREE.Vector3(x, h, z);
    // diagonais e laterais do pergolado (logo abaixo das vigas)
    const py = pillars[0].h - 0.05;
    stringLights(lights, hp(-8, -6, py), hp(8, 6, py), 0.7, bulbs);
    stringLights(lights, hp(8, -6, py), hp(-8, 6, py), 0.7, bulbs);
    stringLights(lights, hp(-8, -6, py), hp(-8, 6, py), 0.45, bulbs);
    stringLights(lights, hp(8, -6, py), hp(8, 6, py), 0.45, bulbs);
    // contorno sul
    const poleMat = mat('#3a2a20');
    [[-15.6, 12.6], [-5.2, 12.6], [5.2, 12.6], [15.6, 12.6]].forEach(([x, z]) => {
      const pole = box(0.12, 3.6, 0.12, poleMat, 0.03);
      pole.position.set(x, 1.8, z);
      scene.add(pole);
    });
    stringLights(lights, hp(-15.6, 12.6), hp(-5.2, 12.6), 0.6, bulbs);
    stringLights(lights, hp(-5.2, 12.6), hp(5.2, 12.6), 0.6, bulbs);
    stringLights(lights, hp(5.2, 12.6), hp(15.6, 12.6), 0.6, bulbs);
    scene.add(lights);
  }
  const warm = new THREE.PointLight(theme.lights.color, 6, 18, 1.6);
  warm.position.set(0, 4.2, -1);
  scene.add(warm);
  const loungeLight = new THREE.PointLight(theme.lights.color, 3, 10, 1.8);
  loungeLight.position.set(11, 3, 9.5);
  scene.add(loungeLight);

  const p = particles(theme.particles, anim);
  if (p) scene.add(p);

  let t = 0;
  const update = (dt) => {
    t += dt;
    for (const fn of anim) fn(t, dt);
  };
  return { scene, screenMesh, update };
}
