// Avatar humano (original), gerado por código a partir de uma aparência
// (services/room3d/looks.js): corpo com quadril, joelhos, ombros, cotovelos e mãos,
// rosto com olhos que piscam e boca que se mexe ao falar, cabelos, barbas,
// roupas, calçados e acessórios. Animações procedurais por articulação.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, validateLook } from '../../services/room3d/looks';

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const SHOULDER_W = { esguio: 0.18, medio: 0.2, forte: 0.235 };
const TORSO_W = { esguio: 0.85, medio: 1, forte: 1.2 };

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);
const sphere = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2.2));

/** Segmento articulado: grupo no ponto de giro e malha pendurada para baixo. */
function segment(parent, len, radius, mat, y = 0, x = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = mesh(cap(radius, Math.max(0.01, len - radius * 2)), mat);
  m.position.y = -len / 2;
  pivot.add(m);
  parent.add(pivot);
  return { pivot, mesh: m };
}

export class Avatar {
  constructor(userId, look) {
    this.userId = userId;
    this.root = new THREE.Group();
    this.time = Math.random() * 10;
    this.phase = 0;
    this.emote = null;
    this.emoteTime = 0;
    this.speaking = 0;
    this.action = null;
    this.squash = 0;
    this.blink = 0;
    this.nextBlink = 2 + Math.random() * 3;
    this.mouthOpen = 0;

    const ringMat = new THREE.MeshBasicMaterial({ color: '#57e39a', transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);

    this.setLook(look);
  }

  /** (Re)constrói o corpo para uma nova aparência, mantendo o anel e a posição. */
  setLook(rawLook) {
    const look = validateLook(rawLook);
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.look = look;
    if (this.body) {
      this.root.remove(this.body);
      this.disposeTree(this.body);
    }
    this.build(look);
  }

  build(look) {
    const s = look.height;
    const sw = SHOULDER_W[look.build] || 0.2;
    const tw = TORSO_W[look.build] || 1;
    const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
    const skin = M(SKIN_TONES[look.skin], { roughness: 0.55 });
    const hairC = HAIR_COLORS[look.hairColor];
    const hairMat = M(hairC, { roughness: 0.8 });
    const topC = CLOTH_COLORS[look.topColor];
    const metal = look.top === 'armadura';
    const topMat = M(metal ? '#b8bec8' : topC, metal ? { metalness: 0.75, roughness: 0.3 } : {});
    const bottomMat = M(look.bottom === 'jeans' ? new THREE.Color(CLOTH_COLORS[look.bottomColor]).lerp(new THREE.Color('#3b5b8a'), 0.45) : CLOTH_COLORS[look.bottomColor]);
    const shoeMat = look.shoes === 'descalco' ? skin : M(CLOTH_COLORS[look.shoesColor], { roughness: 0.6 });
    const extraMat = M(CLOTH_COLORS[look.extraColor]);
    const hatMat = M(CLOTH_COLORS[look.hatColor ?? 0]);
    const dark = M('#1b1a20');
    const white = M('#f4f2ee', { roughness: 0.5 });

    this.hipY = 0.92 * s;
    const body = new THREE.Group();
    this.body = body;
    this.root.add(body);
    const hips = new THREE.Group();
    hips.position.y = this.hipY;
    body.add(hips);
    this.hips = hips;

    // ---- pernas: coxa (calça) → joelho → canela → pé
    const shortLegs = look.bottom === 'shorts' || look.bottom === 'saia';
    const legs = [-0.1, 0.1].map((x) => {
      const thigh = segment(hips, 0.44 * s, 0.075 * tw, bottomMat, 0, x);
      const knee = segment(thigh.pivot, 0.42 * s, 0.06 * tw, shortLegs ? skin : bottomMat, -0.44 * s);
      if (shortLegs) {
        // barra da bermuda/saia no meio da coxa já vem da coxa; joelho para baixo é pele
      }
      if (look.shoes === 'bota') {
        const boot = mesh(cap(0.068 * tw, 0.14 * s), shoeMat);
        boot.position.y = -0.33 * s;
        knee.pivot.add(boot);
      }
      const foot = mesh(rbox(0.1, 0.07, 0.22, 0.03), shoeMat);
      foot.position.set(0, -0.42 * s - 0.02, 0.05);
      knee.pivot.add(foot);
      return { thigh: thigh.pivot, knee: knee.pivot };
    });
    this.legL = legs[0];
    this.legR = legs[1];

    // ---- tronco
    const spine = new THREE.Group();
    hips.add(spine);
    this.spine = spine;
    const pelvis = mesh(sphere(0.15, 18, 12), bottomMat);
    pelvis.scale.set(tw * 1.05, 0.7, 0.8);
    pelvis.position.y = 0.02;
    spine.add(pelvis);
    const torso = mesh(cap(0.16, 0.26 * s), topMat);
    torso.scale.set(tw * 1.1, 1, 0.72);
    torso.position.y = 0.28 * s;
    spine.add(torso);
    this.torso = torso;
    const chestY = 0.28 * s;

    // detalhes das roupas
    if (look.top === 'regata') {
      const neckSkin = mesh(sphere(0.09), skin);
      neckSkin.scale.set(1.3, 0.6, 0.6);
      neckSkin.position.set(0, chestY + 0.2 * s, 0.03);
      spine.add(neckSkin);
    }
    if (look.top === 'social' || look.top === 'jaleco') {
      const collar = mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 16, Math.PI * 1.4), white);
      collar.rotation.set(Math.PI / 2, 0, Math.PI * 1.3);
      collar.position.set(0, chestY + 0.22 * s, 0.01);
      spine.add(collar);
      for (let i = 0; i < 4; i++) {
        const b = mesh(sphere(0.008, 6, 4), dark, false);
        b.position.set(0, chestY + 0.15 * s - i * 0.07, 0.118);
        spine.add(b);
      }
    }
    if (look.top === 'jaqueta') {
      const inner = mesh(rbox(0.1, 0.38 * s, 0.02), white);
      inner.position.set(0, chestY + 0.02, 0.112);
      spine.add(inner);
    }
    if (look.top === 'moletom') {
      const hood = mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 18, Math.PI), topMat);
      hood.rotation.set(0.3, 0, Math.PI);
      hood.position.set(0, chestY + 0.22 * s, -0.06);
      spine.add(hood);
      const pocket = mesh(rbox(0.2, 0.08, 0.02), topMat);
      pocket.position.set(0, chestY - 0.12, 0.112);
      spine.add(pocket);
    }
    if (look.top === 'kimono') {
      const belt = mesh(new THREE.CylinderGeometry(0.17 * tw, 0.17 * tw, 0.06, 18), dark);
      belt.scale.z = 0.75;
      belt.position.y = chestY - 0.17 * s;
      spine.add(belt);
      const lapel = mesh(rbox(0.04, 0.3 * s, 0.02), white);
      lapel.rotation.z = 0.5;
      lapel.position.set(0.02, chestY + 0.06, 0.112);
      spine.add(lapel);
    }
    if (look.top === 'traje') {
      const emblem = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 20), M(CLOTH_COLORS[4], { emissive: CLOTH_COLORS[4], emissiveIntensity: 0.3 }));
      emblem.rotation.x = Math.PI / 2;
      emblem.position.set(0, chestY + 0.08, 0.115);
      spine.add(emblem);
    }
    if (look.top === 'vestido' || look.top === 'jaleco' || look.bottom === 'saia') {
      const long = look.top === 'vestido' ? 0.62 * s : look.top === 'jaleco' ? 0.5 * s : 0.26 * s;
      const skirtMat = look.bottom === 'saia' && look.top !== 'vestido' && look.top !== 'jaleco' ? bottomMat : topMat;
      const skirt = mesh(new THREE.CylinderGeometry(0.16 * tw, 0.27 * tw, long, 20, 1, true), skirtMat);
      skirt.material.side = THREE.DoubleSide;
      skirt.position.y = -long / 2 + 0.06;
      spine.add(skirt);
    }

    // ---- braços: ombro → cotovelo → mão
    const shortSleeve = look.top === 'camiseta' || look.top === 'regata' || look.top === 'vestido';
    const arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * sw, chestY + 0.17 * s, 0);
      spine.add(shoulder);
      const upperMat = look.top === 'regata' ? skin : topMat;
      const upper = segment(shoulder, 0.29 * s, look.top === 'kimono' ? 0.07 : 0.055 * tw, upperMat);
      const fore = segment(upper.pivot, 0.26 * s, look.top === 'kimono' ? 0.065 : 0.047 * tw, shortSleeve ? skin : topMat, -0.29 * s);
      const hand = mesh(sphere(0.048), skin);
      hand.scale.set(0.9, 1.1, 0.7);
      hand.position.y = -0.27 * s;
      fore.pivot.add(hand);
      if (metal) {
        const pad = mesh(sphere(0.085), topMat);
        pad.scale.set(1, 0.7, 1);
        pad.position.y = 0.01;
        shoulder.add(pad);
      }
      return { shoulder, elbow: fore.pivot, hand };
    });
    this.armL = arms[0];
    this.armR = arms[1];

    // ---- pescoço e cabeça
    const neck = mesh(cap(0.045, 0.06), skin);
    neck.position.y = chestY + 0.27 * s;
    spine.add(neck);
    const head = new THREE.Group();
    head.position.y = chestY + 0.42 * s;
    spine.add(head);
    this.head = head;
    const skull = mesh(sphere(0.115, 24, 18), skin);
    skull.scale.set(0.95, 1.12, 1.0);
    head.add(skull);
    const jaw = mesh(sphere(0.085, 18, 12), skin);
    jaw.scale.set(1, 0.7, 0.95);
    jaw.position.set(0, -0.06, 0.02);
    head.add(jaw);
    [-1, 1].forEach((sd) => {
      const ear = mesh(sphere(0.026, 10, 8), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(sd * 0.108, 0, -0.005);
      head.add(ear);
    });

    // olhos (esclera, íris, pupila) e sobrancelhas
    const sclera = M('#fbfbf8', { roughness: 0.3 });
    const iris = M(EYE_COLORS[look.eyes], { roughness: 0.3 });
    this.eyes = [-1, 1].map((sd) => {
      const g = new THREE.Group();
      g.position.set(sd * 0.042, 0.018, 0.098);
      const w = mesh(sphere(0.02, 12, 10), sclera, false);
      w.scale.set(1.1, 1, 0.6);
      g.add(w);
      const ir = mesh(sphere(0.011, 10, 8), iris, false);
      ir.position.z = 0.012;
      g.add(ir);
      const pu = mesh(sphere(0.005, 6, 5), dark, false);
      pu.position.z = 0.02;
      g.add(pu);
      head.add(g);
      const brow = mesh(rbox(0.04, 0.008, 0.01, 0.003), hairMat, false);
      brow.position.set(sd * 0.044, 0.05, 0.104);
      brow.rotation.z = -sd * 0.08;
      head.add(brow);
      return g;
    });
    const nose = mesh(sphere(0.018, 10, 8), skin, false);
    nose.scale.set(0.8, 1, 1.1);
    nose.position.set(0, -0.012, 0.115);
    head.add(nose);
    const mouth = mesh(rbox(0.045, 0.01, 0.01, 0.004), M('#7a3b36'), false);
    mouth.position.set(0, -0.052, 0.104);
    head.add(mouth);
    this.mouth = mouth;

    this.buildHair(head, look, hairMat);
    this.buildBeard(head, look, hairMat);
    this.buildHat(head, look, hatMat, dark, white);
    this.buildGlasses(head, look, dark, extraMat);
    this.buildExtra(spine, head, look, extraMat, dark, chestY, s);

    // estrelinhas de tontura
    this.stars = new THREE.Group();
    this.stars.position.y = 0.3;
    const starMat = new THREE.MeshBasicMaterial({ color: '#ffd84d', toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), starMat);
      const a = (i / 4) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
      this.stars.add(st);
    }
    this.stars.visible = false;
    head.add(this.stars);
    this.headTop = head.position.y + this.hipY + 0.2;
  }

  /** Altura (sobre os pés) onde o nome deve aparecer. */
  labelHeight(sitting, seatTop = 0.55) {
    return sitting ? seatTop + 0.06 + (this.headTop - this.hipY) + 0.05 : this.headTop + 0.08;
  }

  buildHair(head, look, mat) {
    const add = (geo, sx, sy, sz, x, y, z, rx = 0) => {
      const m = mesh(geo, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      head.add(m);
      return m;
    };
    // Calota inclinada para trás: cobre o alto e a nuca, deixa testa e olhos livres.
    const capHair = () => add(new THREE.SphereGeometry(0.12, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), 1.0, 1.08, 1.06, 0, 0.015, -0.012, -0.42);
    switch (look.hair) {
      case 'careca':
        break;
      case 'raspado':
        add(new THREE.SphereGeometry(0.119, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), 0.97, 1.12, 1.01, 0, 0.005, -0.008, -0.38);
        break;
      case 'cacheado':
        capHair();
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          add(sphere(0.045, 10, 8), 1, 1, 1, Math.cos(a) * 0.1, 0.07 + (i % 2) * 0.03, Math.sin(a) * 0.09 - 0.01);
        }
        break;
      case 'black':
        add(sphere(0.19, 20, 16), 1, 0.95, 1, 0, 0.07, -0.03);
        break;
      case 'longo':
        capHair();
        add(rbox(0.22, 0.32, 0.06, 0.03), 1, 1, 1, 0, -0.1, -0.075);
        add(rbox(0.04, 0.22, 0.05, 0.02), 1, 1, 1, -0.105, -0.06, 0.0);
        add(rbox(0.04, 0.22, 0.05, 0.02), 1, 1, 1, 0.105, -0.06, 0.0);
        break;
      case 'rabo':
        capHair();
        add(cap(0.035, 0.18), 1, 1, 1, 0, -0.02, -0.15, 0.6);
        break;
      case 'coque':
        capHair();
        add(sphere(0.06), 1, 1, 1, 0, 0.14, -0.06);
        break;
      case 'moicano':
        add(new THREE.SphereGeometry(0.119, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), 0.97, 1.12, 1.01, 0, 0.005, -0.008, -0.38);
        for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.025, 0.1, 6), 1, 1, 1, 0, 0.14 - Math.abs(i - 2) * 0.012, 0.07 - i * 0.04, -0.3 + i * 0.15);
        break;
      case 'espetado':
        capHair();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const c = add(new THREE.ConeGeometry(0.03, 0.09, 6), 1, 1, 1, Math.cos(a) * 0.06, 0.13, Math.sin(a) * 0.06 - 0.01);
          c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        }
        break;
      default: {
        // curto, com franja
        capHair();
        add(rbox(0.15, 0.03, 0.05, 0.015), 1, 1, 1, 0, 0.098, 0.078, -0.5);
      }
    }
  }

  buildBeard(head, look, mat) {
    if (look.beard === 'nenhuma') return;
    if (look.beard === 'bigode') {
      const m = mesh(rbox(0.06, 0.014, 0.014, 0.006), mat, false);
      m.position.set(0, -0.035, 0.112);
      head.add(m);
      return;
    }
    const full = look.beard === 'cheia';
    const b = mesh(new THREE.SphereGeometry(0.1, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mat);
    b.scale.set(1, full ? 1.3 : 1, 1);
    b.position.set(0, full ? -0.02 : -0.01, 0.018);
    head.add(b);
    const m = mesh(rbox(0.06, 0.014, 0.014, 0.006), mat, false);
    m.position.set(0, -0.035, 0.112);
    head.add(m);
  }

  buildHat(head, look, mat, dark, white) {
    const g = new THREE.Group();
    head.add(g);
    const add = (geo, material, x, y, z, rx = 0, rz = 0) => {
      const m = mesh(geo, material);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
      return m;
    };
    switch (look.hat) {
      case 'bone':
        add(new THREE.SphereGeometry(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mat, 0, 0.03, -0.005);
        add(rbox(0.16, 0.012, 0.11, 0.005), mat, 0, 0.04, 0.12, -0.1);
        break;
      case 'gorro':
        add(new THREE.SphereGeometry(0.128, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat, 0, 0.03, 0).scale.set(1, 1.15, 1.03);
        add(new THREE.TorusGeometry(0.118, 0.022, 8, 24), mat, 0, 0.03, 0, Math.PI / 2);
        add(sphere(0.035), white, 0, 0.18, 0);
        break;
      case 'chapeu':
        add(new THREE.CylinderGeometry(0.21, 0.21, 0.012, 28), mat, 0, 0.075, 0);
        add(new THREE.CylinderGeometry(0.1, 0.115, 0.11, 22), mat, 0, 0.13, 0);
        add(new THREE.CylinderGeometry(0.117, 0.117, 0.02, 22), dark, 0, 0.09, 0);
        break;
      case 'cowboy': {
        const brim = add(new THREE.TorusGeometry(0.17, 0.05, 6, 28), mat, 0, 0.08, 0, Math.PI / 2);
        brim.scale.set(1, 1.15, 0.25);
        add(new THREE.CylinderGeometry(0.095, 0.115, 0.14, 20), mat, 0, 0.15, 0);
        break;
      }
      case 'mago':
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 28), mat, 0, 0.08, 0);
        add(new THREE.ConeGeometry(0.12, 0.38, 22), mat, 0, 0.27, -0.02, -0.12);
        break;
      case 'pirata':
        add(rbox(0.3, 0.09, 0.17, 0.04), dark, 0, 0.165, -0.01);
        add(new THREE.SphereGeometry(0.026, 10, 8), white, 0, 0.17, 0.08);
        break;
      case 'chef':
        add(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 22), white, 0, 0.11, 0);
        add(sphere(0.13), white, 0, 0.22, 0).scale.set(1, 0.7, 1);
        break;
      case 'coroa': {
        const gold = new THREE.MeshStandardMaterial({ color: '#e8b931', metalness: 0.8, roughness: 0.25 });
        add(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 20, 1, true), gold, 0, 0.12, 0).material.side = THREE.DoubleSide;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          add(new THREE.ConeGeometry(0.02, 0.06, 6), gold, Math.cos(a) * 0.1, 0.17, Math.sin(a) * 0.1);
        }
        break;
      }
      case 'capacete': {
        const glass = new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2 });
        add(sphere(0.2, 24, 18), glass, 0, 0.0, 0.01).castShadow = false;
        add(new THREE.TorusGeometry(0.15, 0.03, 8, 24), white, 0, -0.16, 0, Math.PI / 2);
        break;
      }
      case 'bandana':
        add(new THREE.TorusGeometry(0.118, 0.022, 8, 24), mat, 0, 0.055, 0, Math.PI / 2 + 0.15);
        break;
      case 'faixa':
        add(new THREE.TorusGeometry(0.119, 0.02, 8, 24), dark, 0, 0.04, 0, Math.PI / 2);
        add(rbox(0.03, 0.14, 0.01, 0.005), dark, 0.03, -0.02, -0.12, 0.4, 0.3);
        add(rbox(0.03, 0.12, 0.01, 0.005), dark, -0.03, -0.02, -0.12, 0.4, -0.3);
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

  buildGlasses(head, look, dark, colorMat) {
    if (look.glasses === 'nenhum') return;
    const g = new THREE.Group();
    g.position.set(0, 0.018, 0.115);
    head.add(g);
    const add = (geo, material, x, y, z) => {
      const m = mesh(geo, material, false);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    if (look.glasses === 'redondo') {
      [-1, 1].forEach((sd) => add(new THREE.TorusGeometry(0.026, 0.004, 6, 18), dark, sd * 0.043, 0, 0));
      add(rbox(0.025, 0.004, 0.004), dark, 0, 0.004, 0);
    } else if (look.glasses === 'quadrado') {
      [-1, 1].forEach((sd) => {
        const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.05, 0.035, 0.004)), new THREE.LineBasicMaterial({ color: '#1b1a20' }));
        frame.position.set(sd * 0.043, 0, 0);
        g.add(frame);
      });
      add(rbox(0.025, 0.004, 0.004), dark, 0, 0.006, 0);
    } else if (look.glasses === 'escuro') {
      const lens = new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.15, metalness: 0.4 });
      [-1, 1].forEach((sd) => add(rbox(0.05, 0.03, 0.008, 0.008), lens, sd * 0.042, 0, 0));
      add(rbox(0.03, 0.006, 0.006), dark, 0, 0.008, 0);
    } else if (look.glasses === 'tapaolho') {
      add(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 16), dark, 0.043, 0, 0.004).rotation.x = Math.PI / 2;
      const strap = add(new THREE.TorusGeometry(0.12, 0.004, 4, 30), dark, 0, 0, -0.115);
      strap.rotation.set(Math.PI / 2, 0, 0.35);
    } else if (look.glasses === 'mascara') {
      const band = add(rbox(0.2, 0.04, 0.03, 0.012), colorMat, 0, 0, -0.012);
      band.scale.z = 1;
    }
  }

  buildExtra(spine, head, look, mat, dark, chestY, s) {
    switch (look.extra) {
      case 'capa': {
        const capeGeo = new THREE.PlaneGeometry(0.42, 0.9 * s, 1, 6);
        capeGeo.translate(0, -0.45 * s, 0);
        const cape = mesh(capeGeo, new THREE.MeshStandardMaterial({ color: mat.color, side: THREE.DoubleSide, roughness: 0.8 }));
        cape.position.set(0, chestY + 0.2 * s, -0.13);
        spine.add(cape);
        this.cape = cape;
        break;
      }
      case 'mochila': {
        const pack = mesh(rbox(0.26, 0.32 * s, 0.13, 0.04), mat);
        pack.position.set(0, chestY + 0.02, -0.17);
        spine.add(pack);
        break;
      }
      case 'fones': {
        const band = mesh(new THREE.TorusGeometry(0.125, 0.012, 6, 24, Math.PI), dark);
        band.position.y = 0.02;
        head.add(band);
        [-1, 1].forEach((sd) => {
          const cup = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), mat);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(sd * 0.122, 0.0, 0);
          head.add(cup);
        });
        break;
      }
      case 'cachecol': {
        const wrap = mesh(new THREE.TorusGeometry(0.075, 0.035, 8, 20), mat);
        wrap.rotation.x = Math.PI / 2;
        wrap.position.y = chestY + 0.25 * s;
        spine.add(wrap);
        const tail = mesh(rbox(0.06, 0.24, 0.025, 0.01), mat);
        tail.position.set(0.06, chestY + 0.12 * s, 0.12);
        spine.add(tail);
        break;
      }
      case 'asas': {
        const wingMat = new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.6, side: THREE.DoubleSide });
        this.wings = [-1, 1].map((sd) => {
          const w = mesh(sphere(0.25, 16, 10), wingMat);
          w.scale.set(1, 0.55, 0.08);
          w.position.set(sd * 0.22, chestY + 0.12, -0.16);
          w.rotation.set(0, sd * 0.5, sd * 0.4);
          spine.add(w);
          return w;
        });
        break;
      }
      case 'espada': {
        const blade = mesh(rbox(0.035, 0.7, 0.01, 0.004), new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.85, roughness: 0.2 }));
        blade.position.set(0, chestY, -0.16);
        blade.rotation.z = 0.6;
        spine.add(blade);
        const hilt = mesh(rbox(0.16, 0.025, 0.03, 0.008), dark);
        hilt.position.set(-0.19, chestY + 0.28, -0.16);
        hilt.rotation.z = 0.6;
        spine.add(hilt);
        break;
      }
      default:
    }
  }

  playEmote(name) {
    this.emote = name;
    this.emoteTime = 0;
  }
  playPick() { this.action = { kind: 'pick', t: 0 }; }
  playThrow() { this.action = { kind: 'throw', t: 0 }; }
  playLand() { this.squash = 1; }
  playHit() {
    this.action = { kind: 'hit', t: 0 };
    this.emote = null;
  }

  /** Posição da mão direita no mundo (onde o objeto segurado fica). */
  handWorld(target) {
    this.root.updateMatrixWorld(true);
    return this.armR.hand.getWorldPosition(target);
  }

  setVisible(v) {
    if (this.body) this.body.visible = v;
  }

  /**
   * s: { moving, running, seat, seatTop, speaking, airborne, holding }
   */
  update(dt, s) {
    this.time += dt;
    const sitting = s.seat >= 0;
    const speed = s.moving ? (s.running ? 13 : 8.5) : 0;
    this.phase += dt * speed;
    const walking = s.moving && !s.airborne && !sitting;
    const sw = walking ? Math.sin(this.phase) : 0;
    const amp = s.running ? 0.75 : 0.5;

    // fala: anel e boca
    this.speaking += ((s.speaking ? 1 : 0) - this.speaking) * Math.min(1, dt * 10);
    this.ring.material.opacity = this.speaking * 0.85;
    this.ring.visible = !s.airborne;
    const talk = s.speaking ? 0.5 + 0.5 * Math.abs(Math.sin(this.time * 14) * Math.sin(this.time * 5.3)) : 0;
    this.mouthOpen += (talk - this.mouthOpen) * Math.min(1, dt * 18);
    this.mouth.scale.y = 1 + this.mouthOpen * 2.6;

    // piscar
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 2.5 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const eyeOpen = this.blink > 0 ? 0.12 : 1;

    if (s.moving || sitting || s.airborne) this.emote = null;
    if (this.emote) this.emoteTime += dt;
    if (this.emote && this.emoteTime > 3.2) this.emote = null;

    // pose base
    const pose = {
      hipY: this.hipY + (walking ? Math.abs(Math.sin(this.phase)) * 0.035 - 0.015 : Math.sin(this.time * 1.6) * 0.004),
      thighL: -sw * amp, thighR: sw * amp,
      kneeL: Math.max(0, sw) * amp * 1.4 + 0.05, kneeR: Math.max(0, -sw) * amp * 1.4 + 0.05,
      shL: sw * amp * 0.8, shR: -sw * amp * 0.8, shLz: 0.08, shRz: 0.08, // z: positivo = braço para fora
      elL: -0.25 - Math.max(0, sw) * 0.4, elR: -0.25 - Math.max(0, -sw) * 0.4,
      lean: s.running && walking ? 0.12 : 0.02, twist: walking ? sw * 0.08 : 0, tilt: 0,
      headX: 0, headY: 0
    };

    if (this.emote === 'wave') {
      pose.shR = -0.2;
      pose.shRz = 2.5;
      pose.elR = -0.4 + Math.sin(this.emoteTime * 11) * 0.45;
    } else if (this.emote === 'dance') {
      const k = this.emoteTime * 7;
      pose.hipY += Math.abs(Math.sin(k)) * 0.06;
      pose.shLz = 1.3 + Math.sin(k) * 0.5;
      pose.shRz = 1.3 - Math.sin(k) * 0.5;
      pose.elL = -1.0;
      pose.elR = -1.0;
      pose.tilt = Math.sin(k * 0.5) * 0.2;
      pose.twist = Math.sin(k * 0.5) * 0.5;
      pose.kneeL = 0.3 + Math.max(0, Math.sin(k)) * 0.4;
      pose.kneeR = 0.3 + Math.max(0, -Math.sin(k)) * 0.4;
    } else if (this.emote === 'cheer') {
      const k = Math.abs(Math.sin(this.emoteTime * 9));
      pose.shLz = 2.8;
      pose.shRz = 2.8;
      pose.elL = -0.2;
      pose.elR = -0.2;
      pose.hipY += k * 0.1;
    }

    if (s.airborne) {
      pose.thighL = -0.7;
      pose.thighR = -0.3;
      pose.kneeL = 1.1;
      pose.kneeR = 0.6;
      pose.shLz = 0.9;
      pose.shRz = 0.9;
      pose.elL = -0.6;
      pose.elR = -0.6;
    }

    if (s.holding) {
      pose.shR = -1.15;
      pose.shRz = 0.1;
      pose.elR = -0.5;
    }

    const a = this.action;
    if (a) {
      a.t += dt;
      if (a.kind === 'pick') {
        const k = a.t < 0.2 ? ease(a.t / 0.2) : 1 - ease((a.t - 0.2) / 0.25);
        pose.lean = 0.85 * k;
        pose.kneeL = pose.kneeR = 0.9 * k;
        pose.thighL = pose.thighR = -0.5 * k;
        pose.hipY -= 0.18 * k;
        pose.shR = -1.2 * k;
        pose.elR = -0.1;
        if (a.t > 0.45) this.action = null;
      } else if (a.kind === 'throw') {
        if (a.t < 0.16) {
          const k = ease(a.t / 0.16);
          pose.shR = -1.15 - 1.7 * k;
          pose.elR = -0.5 - 1.0 * k;
          pose.twist = 0.5 * k;
          pose.lean = -0.1 * k;
        } else {
          const k = ease((a.t - 0.16) / 0.2);
          pose.shR = -2.85 + 3.2 * k;
          pose.elR = -1.5 + 1.4 * k;
          pose.twist = 0.5 - 1.0 * k;
          pose.lean = 0.3 * k;
        }
        pose.shRz = 0.25;
        if (a.t > 0.5) this.action = null;
      } else if (a.kind === 'hit') {
        const k = 1 - ease(a.t / 1.1);
        pose.lean = -0.4 * k;
        pose.tilt = Math.sin(a.t * 16) * 0.22 * k;
        pose.shLz = 0.5 + 1.0 * k;
        pose.shRz = 0.5 + 1.0 * k;
        pose.headX = Math.sin(a.t * 11) * 0.3 * k;
        if (a.t > 1.4) this.action = null;
      }
    }
    this.stars.visible = a?.kind === 'hit';
    if (this.stars.visible) this.stars.rotation.y = this.time * 7;

    if (sitting) {
      // quadril apoiado no assento, coxas para a frente e canelas para baixo
      pose.hipY = (s.seatTop ?? 0.55) + 0.06;
      pose.thighL = pose.thighR = -1.5;
      pose.kneeL = pose.kneeR = 1.5;
      pose.lean = -0.05;
      if (!s.holding && !this.emote) {
        pose.shL = pose.shR = -0.35;
        pose.elL = pose.elR = -0.9;
      }
    }

    // aterrissagem
    this.squash = Math.max(0, this.squash - dt * 6);
    const sq = Math.sin(this.squash * Math.PI) * 0.1;

    this.hips.position.y = pose.hipY - sq;
    this.legL.thigh.rotation.x = pose.thighL;
    this.legR.thigh.rotation.x = pose.thighR;
    this.legL.knee.rotation.x = pose.kneeL;
    this.legR.knee.rotation.x = pose.kneeR;
    this.armL.shoulder.rotation.set(pose.shL, 0, -pose.shLz);
    this.armR.shoulder.rotation.set(pose.shR, 0, pose.shRz);
    this.armL.elbow.rotation.x = pose.elL;
    this.armR.elbow.rotation.x = pose.elR;
    this.spine.rotation.set(pose.lean, pose.twist, pose.tilt);
    this.head.rotation.set(pose.headX - pose.lean * 0.5, pose.headY, 0);
    this.torso.scale.y = 1 + Math.sin(this.time * 2.2) * 0.012; // respiração
    this.eyes.forEach((e) => { e.scale.y = eyeOpen; });
    if (this.cape) this.cape.rotation.x = 0.12 + (walking ? 0.25 + Math.sin(this.phase * 2) * 0.05 : 0) + (s.airborne ? 0.5 : 0);
    if (this.wings) this.wings.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * (0.5 + Math.sin(this.time * (s.airborne ? 18 : 2)) * (s.airborne ? 0.5 : 0.08)); });
  }

  disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  dispose() {
    this.disposeTree(this.root);
  }
}
