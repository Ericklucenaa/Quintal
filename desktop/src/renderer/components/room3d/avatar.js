// Avatar estilizado (original): corpo arredondado na cor da pessoa, cabeça com
// olhos, braços e pernas articulados. Animações procedurais: andar, correr,
// sentar, acenar, dançar e comemorar. Um anel nos pés acende quando a pessoa fala.
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
    [-0.085, 0.085].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
      eye.position.set(x, 0.03, 0.225);
      eye.scale.y = 1.35;
      this.head.add(eye);
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

    this.phase = 0;
    this.emote = null;
    this.emoteTime = 0;
    this.speaking = 0;
  }

  playEmote(name) {
    this.emote = name;
    this.emoteTime = 0;
  }

  /**
   * s: { moving, running, seat (>=0 = sentado), high (banqueta alta), speaking }
   */
  update(dt, s) {
    const sitting = s.seat >= 0;
    const speed = s.moving ? (s.running ? 14 : 9) : 0;
    this.phase += dt * speed;
    const swing = s.moving ? Math.sin(this.phase) * (s.running ? 0.9 : 0.6) : 0;

    // fala: anel e leve balanço da cabeça
    this.speaking += ((s.speaking ? 1 : 0) - this.speaking) * Math.min(1, dt * 10);
    this.ring.material.opacity = this.speaking * 0.85;
    this.head.rotation.z = s.speaking ? Math.sin(performance.now() / 120) * 0.05 : 0;

    if (s.moving || sitting) this.emote = null;
    if (this.emote) this.emoteTime += dt;
    if (this.emote && this.emoteTime > 3.2) this.emote = null;

    let armL = swing;
    let armR = -swing;
    let armLz = 0.08;
    let armRz = -0.08;
    let bob = s.moving ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(performance.now() / 700) * 0.008;
    let spin = 0;

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

    this.armL.rotation.set(armL, 0, armLz);
    this.armR.rotation.set(armR, 0, armRz);

    if (sitting) {
      // Quadril (base do tronco, 0,5 m) apoiado no assento: banco/sofá ~0,47 m, banqueta alta ~0,83 m.
      this.body.position.y = s.high ? 0.3 : -0.05;
      this.legL.rotation.x = -1.45;
      this.legR.rotation.x = -1.45;
      this.armL.rotation.x = -0.5;
      this.armR.rotation.x = -0.5;
    } else {
      this.body.position.y = bob;
      this.legL.rotation.x = -swing;
      this.legR.rotation.x = swing;
    }
    this.body.rotation.y = spin;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
