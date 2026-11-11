// Movimento e colisão no plano (x, z). Funções puras: recebem um estado e
// devolvem outro, o que permite testar sem WebGL.
import { COLLIDERS, PLAYER_RADIUS, ROOM, SEATS, SEAT_REACH } from './layout';

export const WALK_SPEED = 3.2; // m/s
export const RUN_SPEED = 5.6;

/** Direção de movimento no mundo a partir das teclas e do ângulo da câmera. */
export function inputToDirection(keys, cameraYaw) {
  const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const s = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (!f && !s) return { x: 0, z: 0 };
  // A câmera olha na direção (sin yaw, cos yaw); a direita é (-cos yaw, sin yaw) girada.
  const fx = Math.sin(cameraYaw);
  const fz = Math.cos(cameraYaw);
  const rx = -fz;
  const rz = fx;
  let x = fx * f + rx * s;
  let z = fz * f + rz * s;
  const len = Math.hypot(x, z);
  x /= len;
  z /= len;
  return { x, z };
}

/** Empurra um círculo para fora de um retângulo (colisão suave: desliza na borda). */
function pushOut(px, pz, r, box) {
  const hx = box.w / 2;
  const hz = box.d / 2;
  const cx = Math.max(box.x - hx, Math.min(px, box.x + hx));
  const cz = Math.max(box.z - hz, Math.min(pz, box.z + hz));
  const dx = px - cx;
  const dz = pz - cz;
  const dist = Math.hypot(dx, dz);
  if (dist >= r) return null;
  if (dist > 1e-6) {
    const k = (r - dist) / dist;
    return { x: px + dx * k, z: pz + dz * k };
  }
  // Centro dentro do retângulo: sai pelo lado mais próximo.
  const left = px - (box.x - hx);
  const right = box.x + hx - px;
  const top = pz - (box.z - hz);
  const bottom = box.z + hz - pz;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: box.x - hx - r, z: pz };
  if (m === right) return { x: box.x + hx + r, z: pz };
  if (m === top) return { x: px, z: box.z - hz - r };
  return { x: px, z: box.z + hz + r };
}

/** Resolve colisões com os móveis e os limites da sala. */
export function resolve(x, z, r = PLAYER_RADIUS, colliders = COLLIDERS, room = ROOM) {
  for (let i = 0; i < 4; i++) {
    let moved = false;
    for (const box of colliders) {
      const out = pushOut(x, z, r, box);
      if (out) {
        x = out.x;
        z = out.z;
        moved = true;
      }
    }
    x = Math.max(room.minX + r, Math.min(room.maxX - r, x));
    z = Math.max(room.minZ + r, Math.min(room.maxZ - r, z));
    if (!moved) break;
  }
  return { x, z };
}

/**
 * Um passo de simulação do jogador local.
 * state: { x, z, yaw, seat } (seat = índice em SEATS ou -1)
 */
export function step(state, keys, cameraYaw, dt) {
  const dir = inputToDirection(keys, cameraYaw);
  const moving = dir.x !== 0 || dir.z !== 0;
  if (state.seat >= 0) {
    if (!moving) return { ...state, moving: false };
    // Andar enquanto sentado: levanta pelo ponto de saída do assento.
    const exit = SEATS[state.seat].exit;
    const p = resolve(exit.x, exit.z);
    return { ...state, ...p, seat: -1, moving: false };
  }
  if (!moving) return { ...state, moving: false };
  const speed = keys.run ? RUN_SPEED : WALK_SPEED;
  const d = Math.min(dt, 0.1); // evita saltos depois de uma aba em segundo plano
  const p = resolve(state.x + dir.x * speed * d, state.z + dir.z * speed * d);
  const yaw = Math.atan2(dir.x, dir.z);
  return { ...state, ...p, yaw, moving: true, running: Boolean(keys.run) };
}

/** Assento livre mais próximo ao alcance, ou -1. */
export function nearestSeat(x, z, occupied = new Set()) {
  let best = -1;
  let bestD = SEAT_REACH;
  SEATS.forEach((s, i) => {
    if (occupied.has(i)) return;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Senta no assento indicado (posição e direção do assento). */
export function sitAt(state, seatIndex) {
  const s = SEATS[seatIndex];
  if (!s) return state;
  return { ...state, x: s.x, z: s.z, yaw: s.yaw, seat: seatIndex, moving: false };
}

/** Interpolação de ângulo pelo caminho mais curto. */
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
