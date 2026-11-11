// Movimento do jogador local: andar, correr, pular, subir em móveis e cair.
// Funções puras (estado entra, estado sai), testáveis sem WebGL.
//
// Altura: cada colisor tem um topo (h). Quem está acima do topo menos o degrau
// (STEP_UP) passa por cima e pode ficar em pé nele; abaixo disso, o móvel é parede.
import { COLLIDERS, PLAYER_RADIUS, ROOM, SEATS, SEAT_REACH } from './layout';

export const WALK_SPEED = 3.2; // m/s
export const RUN_SPEED = 5.6;
export const JUMP_VELOCITY = 6.4; // m/s → ~1,15 m de altura com a gravidade normal
export const GRAVITY = 17.5; // m/s²
export const STEP_UP = 0.4; // sobe sozinho em degraus até 40 cm (mesa, vaso)
export const MAX_FALL = 30;

/** Direção de movimento no mundo a partir das teclas e do ângulo da câmera. */
export function inputToDirection(keys, cameraYaw) {
  const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const s = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (!f && !s) return { x: 0, z: 0 };
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

function overlapsBox(px, pz, r, box) {
  const cx = Math.max(box.x - box.w / 2, Math.min(px, box.x + box.w / 2));
  const cz = Math.max(box.z - box.d / 2, Math.min(pz, box.z + box.d / 2));
  return Math.hypot(px - cx, pz - cz) < r;
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

/**
 * Resolve colisões com os móveis (só os que são parede para quem está na altura y)
 * e com os limites da sala.
 */
export function resolve(x, z, r = PLAYER_RADIUS, colliders = COLLIDERS, room = ROOM, y = 0) {
  const walls = colliders.filter((b) => (b.h ?? Infinity) > y + STEP_UP);
  for (let i = 0; i < 4; i++) {
    let moved = false;
    for (const box of walls) {
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

/** Altura do chão sob o jogador: o topo mais alto em que ele pode apoiar os pés. */
export function groundAt(x, z, y, r = PLAYER_RADIUS * 0.7, colliders = COLLIDERS) {
  let ground = 0;
  for (const b of colliders) {
    const top = b.h ?? Infinity;
    if (top <= y + STEP_UP && top > ground && overlapsBox(x, z, r, b)) ground = top;
  }
  return ground;
}

/**
 * Um passo de simulação do jogador local.
 * state: { x, z, y, vy, yaw, seat } (seat = índice em SEATS ou -1)
 * keys: { forward, back, left, right, run, jump } (jump = aperto novo neste passo)
 * opts: { gravityScale, frozen } (frozen = atordoado após levar um objeto)
 */
export function step(state, keys, cameraYaw, dt, opts = {}) {
  const g = GRAVITY * (opts.gravityScale ?? 1);
  const d = Math.min(dt, 0.1);
  let y = state.y || 0;
  let vy = state.vy || 0;
  const dir = opts.frozen ? { x: 0, z: 0 } : inputToDirection(keys, cameraYaw);
  const moving = dir.x !== 0 || dir.z !== 0;

  if (state.seat >= 0) {
    if (!moving && !keys.jump) return { ...state, moving: false };
    const exit = SEATS[state.seat].exit;
    const p = resolve(exit.x, exit.z);
    return { ...state, ...p, y: 0, vy: 0, seat: -1, moving: false, grounded: true };
  }

  const ground0 = groundAt(state.x, state.z, y);
  const grounded = y <= ground0 + 1e-3 && vy <= 0;
  // Mesma velocidade de pulo em qualquer tema: com gravidade menor (espaço) o pulo
  // naturalmente vai mais alto (altura = v² / 2g).
  if (keys.jump && grounded && !opts.frozen) vy = JUMP_VELOCITY;

  // horizontal (com o impulso de um golpe, se houver)
  const speed = keys.run ? RUN_SPEED : WALK_SPEED;
  let nx = state.x + dir.x * speed * d + (state.kx || 0) * d;
  let nz = state.z + dir.z * speed * d + (state.kz || 0) * d;
  ({ x: nx, z: nz } = resolve(nx, nz, PLAYER_RADIUS, COLLIDERS, ROOM, y));

  // vertical
  vy = Math.max(-MAX_FALL, vy - g * d);
  y += vy * d;
  const ground = groundAt(nx, nz, Math.max(y, state.y || 0));
  let landed = false;
  if (y <= ground) {
    if (!grounded && (state.vy || 0) < -2) landed = true;
    y = ground;
    vy = 0;
  }
  const decay = Math.exp(-d * 6);
  const yaw = moving ? Math.atan2(dir.x, dir.z) : state.yaw;
  return {
    ...state,
    x: nx,
    z: nz,
    y,
    vy,
    yaw,
    kx: Math.abs((state.kx || 0) * decay) < 0.05 ? 0 : (state.kx || 0) * decay,
    kz: Math.abs((state.kz || 0) * decay) < 0.05 ? 0 : (state.kz || 0) * decay,
    moving,
    running: Boolean(keys.run) && moving,
    grounded: y <= ground + 1e-3,
    landed
  };
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
  return { ...state, x: s.x, z: s.z, y: 0, vy: 0, yaw: s.yaw, seat: seatIndex, moving: false };
}

/** Interpolação de ângulo pelo caminho mais curto. */
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
