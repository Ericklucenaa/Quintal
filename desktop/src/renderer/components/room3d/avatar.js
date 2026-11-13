// Avatar da sala 3D com modelos de verdade: corpos masculino e feminino estilizados
// (Universal Base Characters, Quaternius, CC0), roupas geradas a partir do próprio corpo
// (mesmo esqueleto), cabelos e animações de captura de movimento (Universal Animation
// Library, CC0). Os arquivos ficam em public/avatars e são montados por
// tools/avatar-build (Blender + glTF-Transform).
//
// A pele coberta pela roupa sai da malha (cada face do corpo tem uma região no atributo
// de cor), então a pele nunca atravessa o tecido nas animações. Chapéus, óculos e acessórios são
// peças por código presas aos ossos da cabeça e do peito.
//
// A interface é a mesma do avatar anterior (Room3D não precisa saber dos detalhes).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, validateLook } from '../../services/room3d/looks';

// Duração de cada gesto (s); `null` = dura até a pessoa sair (trenzinho).
export const EMOTE_DURATION = { wave: 3.2, dance: 6, cheer: 3.2, clap: 3.2, toast: 3.6, pose: 4.2, ola: 4.5, dance2: 9.6, conga: null };

// Regiões da pele (iguais às de tools/avatar-build/build_avatars.py)
const RG = { TORSO_UP: 1, TORSO_MID: 2, TORSO_LOW: 3, HIP: 4, UARM_A: 5, UARM_B: 6, LARM: 7, HAND: 8, THIGH_A: 9, THIGH_B: 10, CALF_A: 11, CALF_B: 12, FOOT: 13 };
const TORSO = ['TORSO_UP', 'TORSO_MID', 'TORSO_LOW'];
const LEGS = ['HIP', 'THIGH_A', 'THIGH_B', 'CALF_A', 'CALF_B'];
const TOPS = {
  camiseta: { mesh: 'top_camiseta', hide: [...TORSO, 'UARM_A'] },
  regata: { mesh: 'top_regata', hide: TORSO },
  cropped: { mesh: 'top_cropped', hide: ['TORSO_UP', 'TORSO_MID', 'UARM_A'] },
  mangalonga: { mesh: 'top_mangalonga', hide: [...TORSO, 'UARM_A', 'UARM_B', 'LARM'] },
  xadrez: { mesh: 'top_mangalonga', hide: [...TORSO, 'UARM_A', 'UARM_B', 'LARM'], pattern: 'plaid' },
  listrada: { mesh: 'top_camiseta', hide: [...TORSO, 'UARM_A'], pattern: 'stripes' },
  moletom: { mesh: 'top_moletom', hide: [...TORSO, 'UARM_A', 'UARM_B', 'LARM'] },
  vestido: { mesh: 'dress_vestido', hide: [...TORSO, 'HIP'], dress: true }
};
const BOTTOMS = {
  jeans: { mesh: 'bottom_calca', hide: LEGS, denim: true },
  calca: { mesh: 'bottom_calca', hide: LEGS },
  legging: { mesh: 'bottom_legging', hide: LEGS, shiny: true },
  shorts: { mesh: 'bottom_shorts', hide: ['HIP', 'THIGH_A'] },
  bermuda: { mesh: 'bottom_bermuda', hide: ['HIP', 'THIGH_A', 'THIGH_B'] },
  saia: { mesh: 'skirt_saia', under: 'bottom_short_sob_saia', hide: ['HIP'] },
  saialonga: { mesh: 'skirt_saialonga', under: 'bottom_short_sob_saia', hide: ['HIP'] }
};
const SHOES = { tenis: { mesh: 'shoes_tenis', hide: ['FOOT'] }, bota: { mesh: 'shoes_bota', hide: ['FOOT', 'CALF_B'] }, descalco: null };
const HAIRS = { curto: 'hair_simpleparted', longo: 'hair_long', coque: 'hair_buns', careca: null };
const BUILD_SCALE = { esguio: 0.93, medio: 1, forte: 1.07 };
const ONE_SHOTS = ['jump_start', 'jump_land', 'pick', 'hit', 'throw', 'drink', 'yes', 'knockback', 'interact'];

// ---------------------------------------------------------------------------
// Carregamento (uma vez; cada avatar clona)
// ---------------------------------------------------------------------------

function readArrayBuffer(url) {
  // fetch não lê file:// (app empacotado); XHR lê.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => (xhr.status === 200 || (xhr.status === 0 && xhr.response) ? resolve(xhr.response) : reject(new Error(`HTTP ${xhr.status} ${url}`)));
    xhr.onerror = () => reject(new Error(`falha ao ler ${url}`));
    xhr.send();
  });
}

let assets = null;
let assetsPromise = null;

/** Base dos arquivos (o visualizador de testes troca). */
export const avatarAssetBase = { url: null };

function grayscaleTexture(tex, boost = 1.6) {
  const img = tex.image;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const l = Math.min(255, (0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) * boost);
    d.data[i] = l;
    d.data[i + 1] = l;
    d.data[i + 2] = l;
  }
  g.putImageData(d, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = THREE.SRGBColorSpace;
  out.flipY = tex.flipY;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  return out;
}

function averageColor(tex) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  g.drawImage(tex.image, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] + d[i + 1] + d[i + 2] < 120) continue; // ignora roupa íntima e sombras
    r += d[i];
    gg += d[i + 1];
    b += d[i + 2];
    n += 1;
  }
  return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

export function loadAvatarAssets() {
  if (assets) return Promise.resolve(assets);
  if (assetsPromise) return assetsPromise;
  const base = avatarAssetBase.url || new URL('avatars/', document.baseURI).toString();
  const loader = new GLTFLoader();
  const parse = (buf) => new Promise((res, rej) => loader.parse(buf, base, res, rej));
  assetsPromise = Promise.all(['avatar_m.glb', 'avatar_f.glb', 'animations.glb'].map((f) => readArrayBuffer(base + f).then(parse)))
    .then(([m, f, anim]) => {
      const prep = (gltf) => {
        const info = { scene: gltf.scene, materials: {} };
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false; // a caixa do modelo em repouso não acompanha a animação
          if (o.name === 'Body') {
            info.materials.skinAvg = averageColor(o.material.map);
            info.materials.skinMap = o.material.map;
          }
          if (o.name.startsWith('hair_') && !info.materials.hairMap && o.material.map) info.materials.hairMap = grayscaleTexture(o.material.map, 1.9);
          if (o.name === 'Eyes' && !info.materials.eyeMap && o.material.map) info.materials.eyeMap = o.material.map;
        });
        return info;
      };
      assets = { m: prep(m), f: prep(f), clips: new Map(anim.animations.map((c) => [c.name, c])) };
      return assets;
    })
    .catch((err) => {
      assetsPromise = null;
      throw err;
    });
  return assetsPromise;
}

// ---------------------------------------------------------------------------
// Texturas de tecido (por código, sem arquivos)
// ---------------------------------------------------------------------------

const texCache = new Map();
function patternTexture(kind, base, accent) {
  const key = `${kind}|${base}|${accent}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  if (kind === 'plaid') {
    g.globalAlpha = 0.55;
    g.fillStyle = accent;
    [8, 72].forEach((p) => { g.fillRect(p, 0, 24, 128); g.fillRect(0, p, 128, 24); });
    g.globalAlpha = 0.3;
    g.fillStyle = '#000';
    [44, 108].forEach((p) => { g.fillRect(p, 0, 5, 128); g.fillRect(0, p, 128, 5); });
  } else if (kind === 'stripes') {
    g.fillStyle = accent;
    for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 14);
  } else if (kind === 'denim') {
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.06})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === 'stripes' ? 1 : 6, kind === 'stripes' ? 10 : 6);
  texCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Acessórios por código (origem no centro da cabeça; +z = rosto, +y = cima)
// ---------------------------------------------------------------------------

function mk(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}
const sphere = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2.2));

function buildHat(g, look) {
  const mat = new THREE.MeshStandardMaterial({ color: CLOTH_COLORS[look.hatColor] || '#222', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1a20', roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.6 });
  const add = (geo, m, x, y, z, rx = 0, rz = 0) => {
    const o = mk(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, 0, rz);
    g.add(o);
    return o;
  };
  switch (look.hat) {
    case 'bone':
      add(new THREE.SphereGeometry(0.118, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mat, 0, 0.035, -0.005).scale.set(1, 0.95, 1.08);
      add(rbox(0.17, 0.012, 0.12, 0.005), mat, 0, 0.045, 0.13, -0.12);
      break;
    case 'gorro':
      add(new THREE.SphereGeometry(0.122, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat, 0, 0.03, 0).scale.set(1, 1.15, 1.06);
      add(new THREE.TorusGeometry(0.112, 0.022, 8, 26), mat, 0, 0.03, 0, Math.PI / 2).scale.set(1, 1.06, 1);
      add(sphere(0.034), white, 0, 0.185, 0);
      break;
    case 'chapeu':
      add(new THREE.CylinderGeometry(0.21, 0.21, 0.012, 30), mat, 0, 0.085, 0);
      add(new THREE.CylinderGeometry(0.1, 0.112, 0.11, 24), mat, 0, 0.14, 0);
      add(new THREE.CylinderGeometry(0.114, 0.114, 0.02, 24), dark, 0, 0.1, 0);
      break;
    case 'cowboy': {
      const brim = add(new THREE.TorusGeometry(0.17, 0.05, 6, 30), mat, 0, 0.09, 0, Math.PI / 2);
      brim.scale.set(1, 1.15, 0.25);
      add(new THREE.CylinderGeometry(0.095, 0.112, 0.14, 22), mat, 0, 0.16, 0);
      break;
    }
    case 'boina':
      add(sphere(0.135, 22, 12), mat, 0.02, 0.105, -0.01, 0, -0.22).scale.set(1, 0.32, 1.02);
      break;
    case 'viseira':
      add(new THREE.TorusGeometry(0.112, 0.012, 6, 30), mat, 0, 0.05, 0, Math.PI / 2).scale.set(1, 1.08, 1);
      add(rbox(0.17, 0.01, 0.1, 0.004), mat, 0, 0.055, 0.125, -0.14);
      break;
    case 'bandana':
      add(new THREE.TorusGeometry(0.113, 0.022, 8, 26), mat, 0, 0.06, 0, Math.PI / 2 + 0.12).scale.set(1, 1.06, 1);
      break;
    case 'tiara':
      add(new THREE.TorusGeometry(0.112, 0.008, 6, 26, Math.PI), mat, 0, 0.06, 0.02).rotation.set(-0.35, 0, 0);
      break;
    case 'flor': {
      const petal = new THREE.MeshStandardMaterial({ color: CLOTH_COLORS[look.hatColor] || '#d14d72', roughness: 0.6 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(sphere(0.022, 8, 6), petal, 0.1 + Math.cos(a) * 0.022, 0.08 + Math.sin(a) * 0.022, 0.02).scale.set(1, 1, 0.5);
      }
      add(sphere(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: '#f4c430' }), 0.1, 0.08, 0.03);
      break;
    }
    case 'coroa': {
      const gold = new THREE.MeshStandardMaterial({ color: '#e8b931', metalness: 0.8, roughness: 0.25 });
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20, 1, true), gold, 0, 0.13, 0).material.side = THREE.DoubleSide;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.02, 0.06, 6), gold, Math.cos(a) * 0.095, 0.18, Math.sin(a) * 0.095);
      }
      break;
    }
    case 'mago':
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 30), mat, 0, 0.09, 0);
      add(new THREE.ConeGeometry(0.115, 0.38, 24), mat, 0, 0.28, -0.02, -0.12);
      break;
    case 'pirata':
      add(rbox(0.3, 0.09, 0.17, 0.04), dark, 0, 0.17, -0.01);
      add(sphere(0.026, 10, 8), white, 0, 0.175, 0.08);
      break;
    case 'chef':
      add(new THREE.CylinderGeometry(0.108, 0.108, 0.12, 24), white, 0, 0.12, 0);
      add(sphere(0.13), white, 0, 0.23, 0).scale.set(1, 0.7, 1);
      break;
    case 'gato':
      [-1, 1].forEach((sd) => {
        add(new THREE.ConeGeometry(0.045, 0.09, 4), mat, sd * 0.07, 0.15, 0, 0, -sd * 0.3);
        add(new THREE.ConeGeometry(0.025, 0.05, 4), new THREE.MeshStandardMaterial({ color: '#f2a5b8' }), sd * 0.07, 0.145, 0.012, 0, -sd * 0.3);
      });
      break;
    default:
  }
}

function buildGlasses(g, look) {
  if (look.glasses === 'nenhum') return;
  const dark = new THREE.MeshStandardMaterial({ color: '#16151a', roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d9b44a', metalness: 0.85, roughness: 0.25 });
  const add = (geo, m, x, y, z) => {
    const o = mk(geo, m, false);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const y = 0.01;
  const z = 0.108;
  if (look.glasses === 'redondo') {
    [-1, 1].forEach((sd) => add(new THREE.TorusGeometry(0.024, 0.0035, 6, 18), dark, sd * 0.034, y, z));
    add(rbox(0.02, 0.004, 0.004), dark, 0, y + 0.004, z);
  } else if (look.glasses === 'quadrado') {
    [-1, 1].forEach((sd) => {
      const f = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.046, 0.032, 0.003)), new THREE.LineBasicMaterial({ color: '#16151a' }));
      f.position.set(sd * 0.034, y, z);
      g.add(f);
    });
    add(rbox(0.02, 0.004, 0.004), dark, 0, y + 0.006, z);
  } else if (look.glasses === 'escuro') {
    const lens = new THREE.MeshStandardMaterial({ color: '#0e0f13', roughness: 0.12, metalness: 0.5 });
    [-1, 1].forEach((sd) => add(rbox(0.046, 0.03, 0.006, 0.008), lens, sd * 0.034, y, z));
    add(rbox(0.024, 0.005, 0.005), dark, 0, y + 0.008, z);
  } else if (look.glasses === 'aviador') {
    const lens = new THREE.MeshStandardMaterial({ color: '#4a3a22', roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.85 });
    [-1, 1].forEach((sd) => {
      add(sphere(0.024, 14, 10), lens, sd * 0.034, y - 0.004, z).scale.set(1, 1.05, 0.25);
      add(new THREE.TorusGeometry(0.024, 0.0022, 6, 20), gold, sd * 0.034, y - 0.004, z + 0.002);
    });
    add(rbox(0.024, 0.003, 0.003), gold, 0, y + 0.014, z);
  } else if (look.glasses === 'tapaolho') {
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 16), dark, 0.034, y, z + 0.004).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.115, 0.004, 4, 30), dark, 0, y, 0).rotation.set(Math.PI / 2, 0, 0.35);
  }
}

function buildEarrings(g, look) {
  if (look.earrings === 'nenhum') return;
  const gold = new THREE.MeshStandardMaterial({ color: '#e0b64a', metalness: 0.85, roughness: 0.25 });
  [-1, 1].forEach((sd) => {
    const o = look.earrings === 'argola'
      ? mk(new THREE.TorusGeometry(0.016, 0.0028, 6, 16), gold, false)
      : mk(sphere(0.006, 8, 6), new THREE.MeshStandardMaterial({ color: '#f6fbff', metalness: 0.6, roughness: 0.1 }), false);
    o.position.set(sd * 0.078, -0.045, 0.0);
    if (look.earrings === 'argola') o.rotation.y = Math.PI / 2;
    g.add(o);
  });
}

function buildHeadExtra(g, look) {
  if (look.extra !== 'fones') return;
  const dark = new THREE.MeshStandardMaterial({ color: '#16151a', roughness: 0.5 });
  const mat = new THREE.MeshStandardMaterial({ color: CLOTH_COLORS[look.extraColor], roughness: 0.6 });
  const band = mk(new THREE.TorusGeometry(0.112, 0.011, 6, 26, Math.PI), dark);
  band.position.y = 0.03;
  g.add(band);
  [-1, 1].forEach((sd) => {
    const cup = mk(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 18), mat);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(sd * 0.1, -0.005, 0);
    g.add(cup);
  });
}

/** Acessórios do peito: origem no osso spine_03, +z = frente. */
function buildChestExtra(g, look) {
  const mat = new THREE.MeshStandardMaterial({ color: CLOTH_COLORS[look.extraColor], roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: '#16151a', roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e0b64a', metalness: 0.85, roughness: 0.25 });
  switch (look.extra) {
    case 'mochila': {
      const pack = mk(rbox(0.28, 0.36, 0.14, 0.05), mat);
      pack.position.set(0, -0.05, -0.2);
      g.add(pack);
      // alças por cima dos ombros (da mochila até a frente do ombro)
      [-1, 1].forEach((sd) => {
        const strap = mk(new THREE.TorusGeometry(0.13, 0.016, 6, 16, Math.PI * 0.62), mat);
        strap.rotation.set(0, -Math.PI / 2, Math.PI * 0.42);
        strap.position.set(sd * 0.1, 0.04, -0.06);
        g.add(strap);
      });
      break;
    }
    case 'cachecol': {
      const wrap = mk(new THREE.TorusGeometry(0.075, 0.034, 8, 22), mat);
      wrap.rotation.x = Math.PI / 2;
      wrap.position.set(0, 0.17, 0.0);
      g.add(wrap);
      const tail = mk(rbox(0.06, 0.26, 0.025, 0.01), mat);
      tail.position.set(0.05, 0.04, 0.13);
      g.add(tail);
      break;
    }
    case 'colar': {
      const chain = mk(new THREE.TorusGeometry(0.075, 0.004, 6, 30), gold, false);
      chain.rotation.x = Math.PI / 2 - 0.45;
      chain.position.set(0, 0.13, 0.05);
      g.add(chain);
      const pendant = mk(sphere(0.014, 10, 8), mat, false);
      pendant.position.set(0, 0.08, 0.125);
      g.add(pendant);
      break;
    }
    case 'gravata': {
      const knot = mk(rbox(0.03, 0.026, 0.02, 0.008), mat, false);
      knot.position.set(0, 0.15, 0.12);
      g.add(knot);
      const tie = mk(rbox(0.05, 0.3, 0.012, 0.006), mat, false);
      tie.position.set(0, -0.01, 0.135);
      tie.rotation.x = -0.12;
      g.add(tie);
      break;
    }
    case 'bolsa': {
      const strap = mk(new THREE.TorusGeometry(0.24, 0.007, 6, 30), dark, false);
      strap.scale.set(0.75, 1.2, 1);
      strap.rotation.set(0, Math.PI / 2 - 0.05, 0.65);
      g.add(strap);
      const bag = mk(rbox(0.16, 0.12, 0.05, 0.02), mat);
      bag.position.set(-0.18, -0.36, 0.06);
      g.add(bag);
      break;
    }
    case 'capa': {
      const geo = new THREE.PlaneGeometry(0.46, 1.0, 1, 6);
      geo.translate(0, -0.5, 0);
      const cape = mk(geo, new THREE.MeshStandardMaterial({ color: CLOTH_COLORS[look.extraColor], side: THREE.DoubleSide, roughness: 0.8 }));
      cape.position.set(0, 0.12, -0.15);
      cape.rotation.x = 0.12;
      g.add(cape);
      g.userData.cape = cape;
      break;
    }
    default:
  }
}

// Corpo sem os triângulos das regiões escondidas (índice novo; os atributos são
// compartilhados entre todos os avatares do mesmo corpo).
const regionCache = new WeakMap();
function bodyGeometryWithout(geo, mask) {
  let byTri = regionCache.get(geo);
  const index = geo.index.array;
  if (!byTri) {
    const col = geo.attributes.color;
    byTri = new Uint8Array(index.length / 3);
    for (let t = 0; t < byTri.length; t++) byTri[t] = Math.round(col.getX(index[t * 3]) * 16);
    regionCache.set(geo, byTri);
  }
  const keep = [];
  for (let t = 0; t < byTri.length; t++) {
    if (byTri[t] > 0 && (mask >> byTri[t]) & 1) continue;
    keep.push(index[t * 3], index[t * 3 + 1], index[t * 3 + 2]);
  }
  const out = new THREE.BufferGeometry();
  Object.entries(geo.attributes).forEach(([k, v]) => out.setAttribute(k, v));
  out.setIndex(keep);
  out.boundingSphere = geo.boundingSphere;
  out.boundingBox = geo.boundingBox;
  return out;
}

/** Prende `obj` ao osso, alinhado ao avatar (no repouso) no ponto `worldPos`. */
function attachAligned(bone, obj, worldPos, worldQuat) {
  bone.updateWorldMatrix(true, false);
  const local = bone.matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(worldPos, worldQuat, obj.scale.clone()));
  local.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

const AIM = new THREE.Vector3();
const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const QI = new THREE.Quaternion();
const PQ = new THREE.Quaternion();
const BQ = new THREE.Quaternion();
const DIR = new THREE.Vector3();

export class Avatar {
  constructor(userId, look) {
    this.userId = userId;
    this.root = new THREE.Group();
    this.time = Math.random() * 10;
    this.emote = null;
    this.emoteTime = 0;
    this.emoteSyncAt = 0;
    this.speaking = 0;
    this.action = null;
    this.ready = false;
    this.hipY = 0.92;
    this.headTop = 1.78;
    this.visible = true;
    this.base = null;
    this.oneShot = null;

    const ringMat = new THREE.MeshBasicMaterial({ color: '#57e39a', transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);

    // estrelinhas de tontura e copo do brinde (presos ao modelo quando ele carrega)
    this.stars = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: '#ffd84d', toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), starMat);
      const a = (i / 4) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
      this.stars.add(st);
    }
    this.stars.visible = false;
    this.glass = new THREE.Group();
    const glassMat = new THREE.MeshStandardMaterial({ color: '#e9f2f5', transparent: true, opacity: 0.45, roughness: 0.05, side: THREE.DoubleSide });
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.09, 14), new THREE.MeshStandardMaterial({ color: '#e0a23a', transparent: true, opacity: 0.85, roughness: 0.2 }));
    drink.position.y = -0.015;
    const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.022, 14), new THREE.MeshStandardMaterial({ color: '#f7f0de' }));
    foam.position.y = 0.04;
    this.glass.add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.032, 0.13, 14, 1, true), glassMat), drink, foam);
    this.glass.visible = false;

    this.setLook(look);
  }

  /** Troca a aparência (o modelo é montado quando os arquivos terminam de carregar). */
  setLook(rawLook) {
    const look = validateLook(rawLook);
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.look = look;
    if (assets) this.build(look);
    else {
      loadAvatarAssets().then(() => {
        if (this.lookKey === key && !this.disposed) this.build(look);
      }).catch(() => {});
    }
  }

  build(look) {
    const src = look.body === 'feminino' ? assets.f : assets.m;
    if (this.model) {
      this.root.remove(this.model);
      this.disposeModel();
    }
    const model = SkeletonUtils.clone(src.scene);
    // os modelos já olham para +z, como o avatar da sala
    const s = look.height * (look.body === 'feminino' ? 0.98 : 0.96);
    const w = BUILD_SCALE[look.build] || 1;
    model.scale.set(s * w, s, s * w);
    this.model = model;
    this.ownMaterials = [];
    this.ownGeometries = [];

    const top = TOPS[look.top] || TOPS.camiseta;
    const bottom = top.dress ? null : BOTTOMS[look.bottom] || BOTTOMS.jeans;
    const shoes = SHOES[look.shoes];
    const hairMesh = look.hair === 'raspado' ? (look.body === 'feminino' ? 'hair_buzzedfemale' : 'hair_buzzed') : HAIRS[look.hair];
    const browMesh = look.brows === 'fina' ? 'hair_brows_female' : look.brows === 'grossa' ? 'hair_brows_regular' : null;
    const show = new Set(['Body', 'Eyes', top.mesh]);
    if (bottom) {
      show.add(bottom.mesh);
      if (bottom.under) show.add(bottom.under);
    } else {
      show.add('bottom_short_sob_saia');
    }
    if (shoes) show.add(shoes.mesh);
    if (hairMesh) show.add(hairMesh);
    if (browMesh) show.add(browMesh);
    if (look.beard === 'cheia') show.add('hair_beard');
    let hideMask = 0;
    [...top.hide, ...(bottom?.hide || []), ...(shoes?.hide || [])].forEach((r) => { hideMask |= 1 << RG[r]; });

    const own = (m) => {
      this.ownMaterials.push(m);
      return m;
    };
    const cloth = (color, opts = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: 0.82, side: THREE.DoubleSide, ...opts }));
    const topColor = CLOTH_COLORS[look.topColor];
    const accent = CLOTH_COLORS[look.accentColor];
    const topMat = top.pattern
      ? cloth('#ffffff', { map: patternTexture(top.pattern, topColor, accent) })
      : cloth(topColor, { roughness: look.top === 'moletom' ? 0.95 : 0.82 });
    const bottomColor = new THREE.Color(CLOTH_COLORS[look.bottomColor]);
    if (bottom?.denim) bottomColor.lerp(new THREE.Color('#3b5b8a'), 0.5);
    const bottomMat = bottom?.denim
      ? cloth('#ffffff', { map: patternTexture('denim', `#${bottomColor.getHexString()}`, '') })
      : cloth(bottomColor, bottom?.shiny ? { roughness: 0.4 } : {});
    const underMat = cloth(bottom ? bottomColor : new THREE.Color(topColor).multiplyScalar(0.8));
    const shoeMat = cloth(CLOTH_COLORS[look.shoesColor], { roughness: 0.6, side: THREE.FrontSide });
    const soleColor = new THREE.Color(CLOTH_COLORS[look.shoesColor]).getHSL({}).l > 0.6 ? '#3a3632' : '#f1ede4';
    const soleMat = cloth(look.shoes === 'bota' ? '#2a2420' : soleColor, { roughness: 0.9, side: THREE.FrontSide });
    const hairMat = own(new THREE.MeshStandardMaterial({ color: HAIR_COLORS[look.hairColor], map: src.materials.hairMap, roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.4 }));
    const skinTarget = new THREE.Color(SKIN_TONES[look.skin]);
    const avg = src.materials.skinAvg;
    const skinMat = own(new THREE.MeshStandardMaterial({
      map: src.materials.skinMap,
      color: new THREE.Color(skinTarget.r / avg.r, skinTarget.g / avg.g, skinTarget.b / avg.b),
      roughness: 0.6
    }));
    const eyeMat = own(new THREE.MeshStandardMaterial({ map: src.materials.eyeMap, color: new THREE.Color(EYE_COLORS[look.eyes]).lerp(new THREE.Color('#ffffff'), 0.35).multiplyScalar(1.6), roughness: 0.2 }));

    model.traverse((o) => {
      if (!o.isMesh) return;
      // peças com dois materiais (calçado + solado) viram um grupo com duas malhas
      const name = !show.has(o.name) && o.parent && !o.parent.isBone && show.has(o.parent.name) ? o.parent.name : o.name;
      o.visible = show.has(name);
      o.castShadow = o.visible;
      o.receiveShadow = false;
      if (!o.visible) return;
      if (o.name === 'Body') {
        o.material = skinMat;
        // a pele coberta pela roupa sai da malha (nunca atravessa o tecido nas animações)
        o.geometry = bodyGeometryWithout(o.geometry, hideMask);
        this.ownGeometries.push(o.geometry);
      }
      else if (o.name === 'Eyes') o.material = eyeMat;
      else if (o.name.startsWith('hair_')) o.material = hairMat;
      else if (o.name.startsWith('top_') || o.name.startsWith('dress_')) o.material = topMat;
      else if (o.name.startsWith('skirt_') || o.name === bottom?.mesh) o.material = bottomMat;
      else if (o.name === 'bottom_short_sob_saia') o.material = underMat;
      else if (name.startsWith('shoes_')) o.material = o.material.name === 'Sole' ? soleMat : shoeMat;
    });

    // ossos e medidas (na escala do avatar)
    const bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    this.bones = bones;
    this.root.add(model);
    this.root.updateMatrixWorld(true);
    const rootQuat = this.root.getWorldQuaternion(new THREE.Quaternion());
    const p = new THREE.Vector3();
    this.hipY = this.root.worldToLocal(bones.pelvis.getWorldPosition(p)).y;
    const headBase = this.root.worldToLocal(bones.Head.getWorldPosition(new THREE.Vector3()));
    this.headTop = headBase.y + 0.24 * s;

    // acessórios da cabeça: centro da cabeça ~11 cm acima da base do osso Head
    const gear = new THREE.Group();
    gear.scale.setScalar(s * 0.94);
    buildHat(gear, look);
    buildGlasses(gear, look);
    buildEarrings(gear, look);
    buildHeadExtra(gear, look);
    this.stars.position.set(0, 0.28, 0);
    gear.add(this.stars);
    attachAligned(bones.Head, gear, this.root.localToWorld(new THREE.Vector3(headBase.x, headBase.y + 0.105 * s, headBase.z + 0.015 * s)), rootQuat);
    this.gear = gear;

    const chest = new THREE.Group();
    chest.scale.set(s * w, s, s * w);
    buildChestExtra(chest, look);
    attachAligned(bones.spine_03, chest, bones.spine_03.getWorldPosition(new THREE.Vector3()), rootQuat);
    this.chest = chest;
    this.cape = chest.userData.cape || null;

    // copo do brinde na mão direita
    const glassHolder = new THREE.Group();
    glassHolder.add(this.glass);
    this.glass.position.set(0, 0.02, 0.06);
    attachAligned(bones.hand_r, glassHolder, bones.hand_r.getWorldPosition(new THREE.Vector3()), rootQuat);

    // animações
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    assets.clips.forEach((clip, name) => {
      const a = this.mixer.clipAction(clip);
      if (ONE_SHOTS.includes(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
      }
      this.actions[name] = a;
    });
    this.mixer.addEventListener('finished', (ev) => {
      if (this.oneShot && ev.action === this.oneShot) {
        this.oneShot.fadeOut(0.2);
        this.oneShot = null;
      }
    });
    this.base = null;
    this.setBase('idle', 0);
    this.ready = true;
    this.model.visible = this.visible;
  }

  setBase(name, fade = 0.25) {
    if (this.base === name || !this.actions?.[name]) return;
    const next = this.actions[name];
    const prev = this.base ? this.actions[this.base] : null;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (prev) prev.crossFadeTo(next, fade, false);
    else if (fade > 0) next.fadeIn(fade);
    this.base = name;
  }

  playOnce(name, fade = 0.15, timeScale = 1) {
    const a = this.actions?.[name];
    if (!a) return;
    if (this.oneShot && this.oneShot !== a) this.oneShot.fadeOut(fade);
    a.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
    this.oneShot = a;
  }

  /** Altura (sobre os pés) onde o nome aparece. */
  labelHeight(sitting, seatTop = 0.55) {
    return sitting ? seatTop + 0.1 + (this.headTop - this.hipY) + 0.2 : this.headTop + 0.22;
  }

  /** Gesto; `syncAt` (ms, relógio local) alinha a fase de quem faz o mesmo gesto junto. */
  playEmote(name, syncAt = 0) {
    this.emote = name;
    this.emoteTime = syncAt ? Math.max(0, (Date.now() - syncAt) / 1000) : 0;
    this.emoteSyncAt = syncAt;
    if (name === 'toast') this.playOnce('drink', 0.2, 0.9);
    if ((name === 'dance' || name === 'dance2') && this.actions?.dance) {
      this.setBase('dance', 0.25);
      if (syncAt) this.actions.dance.time = this.emoteTime % this.actions.dance.getClip().duration;
    }
  }
  stopEmote() { this.emote = null; }
  playPick() { this.playOnce('pick', 0.12, 1.4); }
  playThrow() { this.playOnce('throw', 0.08, 1.5); }
  playLand() { if (this.base === 'jump_air') this.playOnce('jump_land', 0.08, 1.3); }
  playHit() {
    this.emote = null;
    this.playOnce('hit', 0.08, 1.1);
    this.action = { kind: 'hit', t: 0 };
  }

  /** Posição da mão direita no mundo (onde o objeto segurado fica). */
  handWorld(target) {
    if (!this.bones) return this.root.getWorldPosition(target).add(TMP.set(0, 1.1, 0));
    this.root.updateMatrixWorld(true);
    return this.bones.hand_r.getWorldPosition(target);
  }

  setVisible(v) {
    this.visible = v;
    if (this.model) this.model.visible = v;
  }

  /**
   * Gira um osso para que ele aponte (do início dele até o osso filho) na direção
   * `dir`, dada no espaço do avatar (+z frente, +y cima, -x direita). `k` mistura.
   */
  aim(boneName, childName, dir, k = 1) {
    const bone = this.bones[boneName];
    const child = this.bones[childName];
    if (!bone || !child || k <= 0) return;
    bone.updateWorldMatrix(true, true);
    bone.getWorldPosition(TMP);
    child.getWorldPosition(TMP2);
    const cur = TMP2.sub(TMP).normalize();
    AIM.copy(dir).normalize().applyQuaternion(this.root.getWorldQuaternion(Q2));
    Q1.setFromUnitVectors(cur, AIM);
    if (k < 1) Q1.slerp(QI, 1 - k);
    bone.parent.getWorldQuaternion(PQ);
    bone.getWorldQuaternion(BQ);
    bone.quaternion.copy(PQ.invert().multiply(Q1.multiply(BQ)));
  }

  /**
   * s: { moving, running, seat, seatTop, speaking, airborne, holding, olaDelay, playing }
   */
  update(dt, s) {
    this.time += dt;
    const sitting = s.seat >= 0;
    this.speaking += ((s.speaking ? 1 : 0) - this.speaking) * Math.min(1, dt * 10);
    this.ring.material.opacity = this.speaking * 0.85;
    this.ring.visible = !s.airborne;
    if (!this.ready) return;

    if ((s.moving && this.emote !== 'conga') || sitting || s.airborne) this.emote = null;
    if (this.emote) this.emoteTime += dt;
    const limit = EMOTE_DURATION[this.emote];
    if (this.emote && limit !== null && limit !== undefined && this.emoteTime > limit) this.emote = null;
    const dancing = this.emote === 'dance' || this.emote === 'dance2';

    // animação de base
    let base;
    if (sitting) base = s.speaking ? 'sit_talk' : 'sit';
    else if (s.airborne) base = 'jump_air';
    else if (s.moving) base = s.holding ? 'carry' : s.running ? 'run' : 'walk';
    else if (dancing) base = 'dance';
    else base = s.speaking && !s.holding ? 'talk' : 'idle';
    this.setBase(base, base === 'jump_air' ? 0.12 : 0.25);
    this.mixer.update(dt);

    // gestos que não existem como clipe: braços apontados por cima da animação
    const e = this.emote;
    const t = this.emoteTime;
    if (e === 'wave') {
      this.aim('upperarm_r', 'lowerarm_r', DIR.set(-0.55, 0.85, 0.15));
      this.aim('lowerarm_r', 'hand_r', DIR.set(-0.1 + Math.sin(t * 10) * 0.45, 1, 0.15));
    } else if (e === 'cheer' || e === 'ola') {
      const lt = t - (s.olaDelay || 0);
      const k = e === 'ola' ? (lt > 0 && lt < 0.9 ? Math.sin((lt / 0.9) * Math.PI) : 0) : 1;
      const pump = e === 'cheer' ? Math.abs(Math.sin(t * 8)) * 0.3 : 0;
      this.aim('upperarm_r', 'lowerarm_r', DIR.set(-0.3, 1, 0.1), k);
      this.aim('upperarm_l', 'lowerarm_l', DIR.set(0.3, 1, 0.1), k);
      this.aim('lowerarm_r', 'hand_r', DIR.set(-0.15, 1, 0.1 + pump), k);
      this.aim('lowerarm_l', 'hand_l', DIR.set(0.15, 1, 0.1 + pump), k);
    } else if (e === 'clap') {
      const open = 1 - Math.max(0, Math.sin(t * 14));
      this.aim('upperarm_r', 'lowerarm_r', DIR.set(-0.35, -0.35, 0.85));
      this.aim('upperarm_l', 'lowerarm_l', DIR.set(0.35, -0.35, 0.85));
      this.aim('lowerarm_r', 'hand_r', DIR.set(0.55 - open * 0.5, 0.35, 0.8));
      this.aim('lowerarm_l', 'hand_l', DIR.set(-0.55 + open * 0.5, 0.35, 0.8));
    } else if (e === 'pose') {
      this.aim('upperarm_r', 'lowerarm_r', DIR.set(-0.75, 0.25, 0.45));
      this.aim('lowerarm_r', 'hand_r', DIR.set(0.15, 1, 0.25));
      this.aim('upperarm_l', 'lowerarm_l', DIR.set(0.7, -0.6, -0.25));
      this.aim('lowerarm_l', 'hand_l', DIR.set(-0.55, -0.25, 0.55));
    } else if (e === 'conga') {
      this.aim('upperarm_r', 'lowerarm_r', DIR.set(-0.2, -0.15, 1));
      this.aim('upperarm_l', 'lowerarm_l', DIR.set(0.2, -0.15, 1));
      this.aim('lowerarm_r', 'hand_r', DIR.set(0.1, 0.1, 1));
      this.aim('lowerarm_l', 'hand_l', DIR.set(-0.1, 0.1, 1));
    } else if (s.holding && !s.moving) {
      this.aim('upperarm_r', 'lowerarm_r', DIR.set(-0.25, -0.45, 0.85));
      this.aim('lowerarm_r', 'hand_r', DIR.set(-0.1, 0.15, 1));
    } else if (s.playing && !sitting) {
      this.aim('upperarm_r', 'lowerarm_r', DIR.set(-0.25, -0.5, 0.8), 0.8);
      this.aim('upperarm_l', 'lowerarm_l', DIR.set(0.25, -0.5, 0.8), 0.8);
    }
    this.glass.visible = e === 'toast';

    // sentado: quadril apoiado no assento (o clipe senta numa cadeira de altura própria)
    let goal = 0;
    if (sitting) {
      this.bones.pelvis.getWorldPosition(TMP);
      const pelvisY = this.root.worldToLocal(TMP).y - this.model.position.y;
      goal = (s.seatTop ?? 0.55) + 0.1 - pelvisY;
    }
    this.model.position.y += (goal - this.model.position.y) * Math.min(1, dt * 12);

    // golpe: estrelinhas
    if (this.action) {
      this.action.t += dt;
      if (this.action.t > 1.4) this.action = null;
    }
    this.stars.visible = this.action?.kind === 'hit';
    if (this.stars.visible) this.stars.rotation.y = this.time * 7;
    if (this.cape) this.cape.rotation.x = 0.12 + (s.moving ? 0.3 + Math.sin(this.time * 9) * 0.05 : 0) + (s.airborne ? 0.5 : 0);
  }

  disposeModel() {
    this.mixer?.stopAllAction();
    this.ownMaterials?.forEach((m) => m.dispose());
    this.ownGeometries?.forEach((g) => g.dispose());
    [this.gear, this.chest].forEach((g) => g?.traverse((o) => {
      if (o === this.stars || this.stars.children.includes(o)) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }));
    this.gear = null;
    this.chest = null;
    this.ready = false;
  }

  dispose() {
    this.disposed = true;
    this.disposeModel();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
