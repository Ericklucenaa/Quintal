// Avatar estilizado (original): corpo arredondado na cor da pessoa, cabeça com
// olhos, braços e pernas articulados. Animações procedurais: andar, correr,
// pular, aterrissar, sentar, acenar, dançar, comemorar, pegar, segurar,
// arremessar e levar um golpe (com tontura). Um anel nos pés acende quando a pessoa fala.
import * as THREE from 'three';

const BODY_COLORS = ['#7c6cf0', '#2f9e8f', '#e0773a', '#d14d72', '#3f88d6', '#c9a227', '#5bab4a', '#9a5bd1'];

export function colorFor(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return BODY_COLORS[h % BODY_COLORS.length];
}

function limb(radius, length, material) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material);
  mesh.position.y = -length / 2 - radius * 0.6;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const HAND = new THREE.Vector3(0, -0.55, 0.06);

export class Avatar {
  constructor(userId) {
    const color = new THREE.Color(colorFor(userId));
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const darker = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.6), roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55), roughness: 0.5 });

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.42, 6, 14), bodyMat);
    torso.position.y = 0.98;
    torso.castShadow = true;
    this.body.add(torso);

    this.head = new THREE.Group();
    this.head.position.y = 1.6;
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), skin);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b1726' });
    this.eyes = [-0.085, 0.085].map((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
      eye.position.set(x, 0.03, 0.225);
      eye.scale.y = 1.35;
      this.head.add(eye);
      return eye;
    });
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), darker);
    tuft.position.set(0, 0.22, -0.02);
    tuft.scale.set(1.3, 0.6, 1.2);
    this.head.add(tuft);
    this.body.add(this.head);

    this.armL = limb(0.075, 0.38, bodyMat);
    this.armR = limb(0.075, 0.38, bodyMat);
    this.armL.position.set(-0.33, 1.22, 0);
    this.armR.position.set(0.33, 1.22, 0);
    this.body.add(this.armL, this.armR);

    this.legL = limb(0.09, 0.36, darker);
    this.legR = limb(0.09, 0.36, darker);
    this.legL.position.set(-0.13, 0.66, 0);
    this.legR.position.set(0.13, 0.66, 0);
    this.body.add(this.legL, this.legR);

    const ringMat = new THREE.MeshBasicMaterial({ color: '#57e39a', transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);

    // Estrelinhas de tontura (aparecem ao levar um golpe)
    this.stars = new THREE.Group();
    this.stars.position.y = 2.0;
    const starMat = new THREE.MeshBasicMaterial({ color: '#ffd84d', toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), starMat);
      const a = (i / 4) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.body.add(this.stars);

    this.phase = 0;
    this.time = 0;
    this.emote = null;
    this.emoteTime = 0;
    this.speaking = 0;
    this.action = null; // { kind: 'pick' | 'throw' | 'hit', t }
    this.squash = 0;
    this.hitDir = { x: 0, z: 0 };
  }

  playEmote(name) {
    this.emote = name;
    this.emoteTime = 0;
  }

  playPick() { this.action = { kind: 'pick', t: 0 }; }
  playThrow() { this.action = { kind: 'throw', t: 0 }; }
  playLand() { this.squash = 1; }

  /** dx/dz: direção do golpe no mundo (o avatar cambaleia para esse lado). */
  playHit(dx = 0, dz = 0) {
    this.action = { kind: 'hit', t: 0 };
    this.hitDir = { x: dx, z: dz };
    this.emote = null;
  }

  /** Posição da mão direita no mundo (onde o objeto segurado fica). */
  handWorld(target) {
    this.root.updateMatrixWorld(true);
    return this.armR.localToWorld(target.copy(HAND));
  }

  /**
   * s: { moving, running, seat, high, speaking, airborne, holding }
   */
  update(dt, s) {
    this.time += dt;
    const sitting = s.seat >= 0;
    const speed = s.moving ? (s.running ? 14 : 9) : 0;
    this.phase += dt * speed;
    const swing = s.moving && !s.airborne ? Math.sin(this.phase) * (s.running ? 0.9 : 0.6) : 0;

    this.speaking += ((s.speaking ? 1 : 0) - this.speaking) * Math.min(1, dt * 10);
    this.ring.material.opacity = this.speaking * 0.85;
    this.ring.visible = !s.airborne;
    this.head.rotation.z = s.speaking ? Math.sin(this.time * 8) * 0.05 : 0;

    if (s.moving || sitting || s.airborne) this.emote = null;
    if (this.emote) this.emoteTime += dt;
    if (this.emote && this.emoteTime > 3.2) this.emote = null;

    let armL = swing;
    let armR = -swing;
    let armLz = 0.08;
    let armRz = -0.08;
    let legL = -swing;
    let legR = swing;
    let bob = s.moving && !s.airborne ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(this.time * 1.4) * 0.008;
    let spin = 0;
    let lean = 0;
    let tilt = 0;

    if (this.emote === 'wave') {
      armRz = -2.6;
      armR = Math.sin(this.emoteTime * 12) * 0.35;
    } else if (this.emote === 'dance') {
      bob = Math.abs(Math.sin(this.emoteTime * 8)) * 0.14;
      armLz = 1.2 + Math.sin(this.emoteTime * 8) * 0.6;
      armRz = -1.2 - Math.sin(this.emoteTime * 8) * 0.6;
      spin = Math.sin(this.emoteTime * 4) * 0.6;
    } else if (this.emote === 'cheer') {
      armLz = 2.7;
      armRz = -2.7;
      bob = Math.abs(Math.sin(this.emoteTime * 10)) * 0.18;
    }

    // no ar: pernas encolhidas, braços abertos
    if (s.airborne) {
      legL = -0.9;
      legR = -0.5;
      armLz = 0.9;
      armRz = -0.9;
      armL = -0.3;
      armR = -0.3;
    }

    // segurando: braço direito à frente, um pouco para cima
    if (s.holding) {
      armR = -1.25;
      armRz = -0.15;
    }

    // ações curtas por cima de tudo
    const a = this.action;
    if (a) {
      a.t += dt;
      if (a.kind === 'pick') {
        const k = a.t < 0.18 ? ease(a.t / 0.18) : 1 - ease((a.t - 0.18) / 0.22);
        lean = 0.75 * k;
        armR = -0.4 - 0.9 * k;
        armL = -0.4 * k;
        if (a.t > 0.4) this.action = null;
      } else if (a.kind === 'throw') {
        if (a.t < 0.16) {
          const k = ease(a.t / 0.16);
          armR = -1.25 - 1.6 * k; // braço vai para trás e para cima
          spin = 0.45 * k;
          lean = -0.12 * k;
        } else {
          const k = ease((a.t - 0.16) / 0.2);
          armR = -2.85 + 3.4 * k; // chicote para a frente
          spin = 0.45 - 0.9 * k;
          lean = 0.25 * k;
        }
        armRz = -0.2;
        if (a.t > 0.5) this.action = null;
      } else if (a.kind === 'hit') {
        const k = 1 - ease(a.t / 1.1);
        // cambaleia para o lado do golpe, com um balanço
        tilt = Math.sin(a.t * 18) * 0.25 * k;
        lean = -0.45 * k;
        armLz = 0.4 + 1.2 * k;
        armRz = -0.4 - 1.2 * k;
        this.eyes.forEach((e) => { e.scale.y = 1.35 * (1 - 0.8 * k); });
        if (a.t > 1.4) {
          this.action = null;
          this.eyes.forEach((e) => { e.scale.y = 1.35; });
        }
      }
    }
    this.stars.visible = a?.kind === 'hit';
    if (this.stars.visible) this.stars.rotation.y = this.time * 7;

    this.armL.rotation.set(armL, 0, armLz);
    this.armR.rotation.set(armR, 0, armRz);

    // aterrissagem: amassa e volta
    this.squash = Math.max(0, this.squash - dt * 6);
    const sq = Math.sin(this.squash * Math.PI) * 0.18;
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    if (sitting) {
      // quadril (base do tronco, 0,5 m) apoiado no assento
      this.body.position.y = s.high ? 0.3 : -0.05;
      this.legL.rotation.x = -1.45;
      this.legR.rotation.x = -1.45;
      if (!s.holding) {
        this.armL.rotation.x = -0.5;
        this.armR.rotation.x = -0.5;
      }
    } else {
      this.body.position.y = bob;
      this.legL.rotation.x = legL;
      this.legR.rotation.x = legR;
    }
    this.body.rotation.set(lean, spin, tilt);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
