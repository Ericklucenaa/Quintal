// Objetos que dá para pegar, segurar e arremessar. Física simples e determinística
// (passo fixo de 1/120 s): gravidade, quique no chão e nos móveis, atrito e paredes.
// Quem arremessa simula e decide os acertos; os outros simulam a mesma trajetória
// a partir da mensagem de arremesso e recebem a posição final ("pousou") para acertar diferenças.
import { COLLIDERS, ROOM, THROWABLE_SPAWNS } from './layout';
import { GRAVITY } from './movement';

export const OBJECT_RADIUS = 0.17;
export const THROW_SPEED = 11.5;
export const THROW_LIFT = 3.4;
export const PICK_REACH = 1.45;
export const MAX_SPEED = 25;
const RESTITUTION = 0.45;
const FIXED = 1 / 120;
const HIT_RADIUS = 0.38; // raio do corpo do avatar para acertos
const HIT_MIN_SPEED = 3;

export function initialObjects() {
  const map = new Map();
  THROWABLE_SPAWNS.forEach((s) => {
    map.set(s.id, { id: s.id, x: s.x, y: (s.y || 0) + OBJECT_RADIUS, z: s.z, vx: 0, vy: 0, vz: 0, holder: null, thrower: null, moving: false, ver: 0 });
  });
  return map;
}

export const speedOf = (o) => Math.hypot(o.vx, o.vy, o.vz);

function stepOnce(o, dt, g) {
  const prevY = o.y;
  o.vy -= g * dt;
  o.x += o.vx * dt;
  o.y += o.vy * dt;
  o.z += o.vz * dt;
  const r = OBJECT_RADIUS;
  let onSurface = false;

  // móveis: topo (pouso) ou laterais (rebate)
  for (const b of COLLIDERS) {
    const top = b.h ?? 10;
    const hx = b.w / 2 + r;
    const hz = b.d / 2 + r;
    if (Math.abs(o.x - b.x) >= hx || Math.abs(o.z - b.z) >= hz || o.y - r >= top) continue;
    if (prevY - r >= top - 0.03) {
      o.y = top + r;
      if (o.vy < 0) o.vy = -o.vy * RESTITUTION;
      onSurface = true;
    } else {
      const px = hx - Math.abs(o.x - b.x);
      const pz = hz - Math.abs(o.z - b.z);
      if (px < pz) {
        o.x = b.x + Math.sign(o.x - b.x || 1) * hx;
        o.vx = -o.vx * RESTITUTION;
      } else {
        o.z = b.z + Math.sign(o.z - b.z || 1) * hz;
        o.vz = -o.vz * RESTITUTION;
      }
    }
  }
  // chão
  if (o.y <= r) {
    o.y = r;
    if (o.vy < 0) o.vy = -o.vy * RESTITUTION;
    onSurface = true;
  }
  // limites da sala (guarda-corpo e parede)
  if (o.x < ROOM.minX + r) { o.x = ROOM.minX + r; o.vx = Math.abs(o.vx) * RESTITUTION; }
  if (o.x > ROOM.maxX - r) { o.x = ROOM.maxX - r; o.vx = -Math.abs(o.vx) * RESTITUTION; }
  if (o.z < ROOM.minZ + r) { o.z = ROOM.minZ + r; o.vz = Math.abs(o.vz) * RESTITUTION; }
  if (o.z > ROOM.maxZ - r) { o.z = ROOM.maxZ - r; o.vz = -Math.abs(o.vz) * RESTITUTION; }
  o.y = Math.min(o.y, 12);

  if (onSurface) {
    const k = Math.exp(-dt * 4);
    o.vx *= k;
    o.vz *= k;
    if (Math.abs(o.vy) < 0.6) o.vy = 0;
    if (Math.hypot(o.vx, o.vz) < 0.12 && o.vy === 0) {
      o.vx = 0;
      o.vz = 0;
      o.moving = false;
    }
  }
}

/** Avança um objeto em movimento por `dt` segundos (passos fixos). Devolve uma cópia. */
export function stepObject(obj, dt, gravityScale = 1) {
  if (obj.holder || !obj.moving) return obj;
  const o = { ...obj };
  const g = GRAVITY * gravityScale;
  let t = Math.min(dt, 0.25);
  while (t > 1e-6 && o.moving) {
    const h = Math.min(FIXED, t);
    stepOnce(o, h, g);
    t -= h;
  }
  return o;
}

/**
 * Avança um objeto arremessado e verifica acertos a cada passo fixo (1/120 s),
 * para o objeto não atravessar ninguém mesmo com quadros longos.
 * Devolve { obj, hit } (hit = id atingido ou null).
 */
export function advanceThrown(obj, dt, gravityScale, people, excludeId) {
  if (obj.holder || !obj.moving) return { obj, hit: null };
  const o = { ...obj };
  const g = GRAVITY * gravityScale;
  let t = Math.min(dt, 0.25);
  while (t > 1e-6 && o.moving) {
    const h = Math.min(FIXED, t);
    stepOnce(o, h, g);
    t -= h;
    if (o.spent) continue; // já acertou alguém neste arremesso
    const hit = hitTest(o, people, excludeId);
    if (hit) return { obj: o, hit };
  }
  return { obj: o, hit: null };
}

/** Posição e velocidade iniciais de um arremesso a partir da mão de quem joga. */
export function throwFrom(player, aimYaw, power = 1) {
  const fx = Math.sin(aimYaw);
  const fz = Math.cos(aimYaw);
  const p = Math.max(0.4, Math.min(1.2, power));
  return {
    x: player.x + fx * 0.55,
    y: (player.y || 0) + 1.45,
    z: player.z + fz * 0.55,
    vx: fx * THROW_SPEED * p + (player.vx || 0),
    vy: THROW_LIFT * p,
    vz: fz * THROW_SPEED * p + (player.vz || 0)
  };
}

/** Coloca o objeto no chão à frente de quem solta (sem arremessar). */
export function dropFrom(player) {
  const fx = Math.sin(player.yaw || 0);
  const fz = Math.cos(player.yaw || 0);
  return { x: player.x + fx * 0.6, y: (player.y || 0) + 0.9, z: player.z + fz * 0.6, vx: fx * 0.5, vy: 0.5, vz: fz * 0.5 };
}

/** Pode pegar este objeto? (livre, parado ou lento, perto das mãos) */
export function canPick(player, o) {
  if (o.holder) return false;
  if (o.moving && speedOf(o) > 2.5) return false;
  const d = Math.hypot(o.x - player.x, o.z - player.z);
  return d <= PICK_REACH && Math.abs(o.y - ((player.y || 0) + 0.6)) < 1.7;
}

export function nearestPickable(player, objects) {
  let best = null;
  let bestD = Infinity;
  objects.forEach((o) => {
    if (!canPick(player, o)) return;
    const d = Math.hypot(o.x - player.x, o.z - player.z);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  });
  return best;
}

/**
 * Acerto: objeto rápido atravessando o corpo de alguém (cilindro de raio HIT_RADIUS,
 * dos pés até 1,95 m). people: [{ id, x, y, z }]. Devolve o id atingido ou null.
 */
export function hitTest(o, people, excludeId) {
  if (!o.moving || speedOf(o) < HIT_MIN_SPEED) return null;
  for (const p of people) {
    if (p.id === excludeId) continue;
    const base = p.y || 0;
    if (o.y + OBJECT_RADIUS < base + 0.15 || o.y - OBJECT_RADIUS > base + 1.95) continue;
    if (Math.hypot(o.x - p.x, o.z - p.z) < HIT_RADIUS + OBJECT_RADIUS) return p.id;
  }
  return null;
}

/**
 * Depois de acertar alguém, o objeto quica para trás, perde força e não acerta
 * mais ninguém neste arremesso. Quem arremessou continua responsável por avisar
 * onde ele parou.
 */
export function bounceOffPerson(o) {
  return { ...o, vx: -o.vx * 0.25, vz: -o.vz * 0.25, vy: Math.max(o.vy, 2), spent: true };
}
