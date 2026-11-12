// Aparência dos objetos arremessáveis em cada tema (o comportamento é o mesmo).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { OBJECT_RADIUS } from '../../services/room3d/throwables';

const R = OBJECT_RADIUS;

function stripedTexture(colors) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const all = [...colors, '#ffffff'];
  const w = c.width / 6;
  for (let i = 0; i < 6; i++) {
    g.fillStyle = all[i % all.length];
    g.fillRect(i * w, 0, w + 1, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cria o objeto de índice `index` no visual do tema. */
export function makeThrowable(theme, index) {
  const { kind, colors } = theme.throwable;
  const color = colors[index % colors.length];
  let mesh;
  switch (kind) {
    case 'beachball':
      mesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.15, 24, 16), new THREE.MeshStandardMaterial({ map: stripedTexture(colors), roughness: 0.35 }));
      break;
    case 'snowball':
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 2), new THREE.MeshStandardMaterial({ color: '#f7fbff', roughness: 0.95, flatShading: true }));
      break;
    case 'cube':
      mesh = new THREE.Mesh(new RoundedBoxGeometry(R * 1.6, R * 1.6, R * 1.6, 2, 0.03), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }));
      break;
    case 'pinecone': {
      mesh = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
      const core = new THREE.Mesh(new THREE.ConeGeometry(R * 0.85, R * 2.4, 8, 4), m);
      core.rotation.x = Math.PI;
      mesh.add(core);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * (0.75 - i * 0.18), R * 0.18, 5, 10), m);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = R * (0.5 - i * 0.55);
        mesh.add(ring);
      }
      break;
    }
    case 'paperball':
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.9, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
      break;
    default: // almofada
      mesh = new THREE.Mesh(new RoundedBoxGeometry(R * 2.3, R * 0.9, R * 2.3, 3, 0.07), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  }
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return mesh;
}
