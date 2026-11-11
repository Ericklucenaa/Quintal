// Mensagens da sala 3D trocadas pelo canal de dados WebRTC da chamada.
// Tudo que chega de outro participante é tratado como não confiável:
// tamanho máximo, tipos conferidos, números limitados e textos de lista fechada.
import { ROOM, SEATS, THROWABLE_IDS } from './layout';
import { MAX_SPEED } from './throwables';
import { THEME_IDS } from './themes';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 1024;
export const EMOTES = ['wave', 'dance', 'cheer'];
export const REACTIONS = ['👋', '😂', '🔥', '👏', '❤️', '😮'];
export const POSES = ['stand', 'sit'];

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (n, d = 100) => Math.round(n * d) / d;
const isObj = (id) => typeof id === 'string' && THROWABLE_IDS.includes(id);
const isUser = (id) => typeof id === 'string' && id.length > 0 && id.length <= 64 && /^[\w-]+$/.test(id);
const pos = (m) => ({
  x: clamp(m.x, ROOM.minX, ROOM.maxX),
  y: clamp(m.y, 0, 12),
  z: clamp(m.z, ROOM.minZ, ROOM.maxZ)
});
const vel = (m) => ({
  vx: clamp(m.vx, -MAX_SPEED, MAX_SPEED),
  vy: clamp(m.vy, -MAX_SPEED, MAX_SPEED),
  vz: clamp(m.vz, -MAX_SPEED, MAX_SPEED)
});

const enc = (t, body) => JSON.stringify({ v: PROTOCOL_VERSION, t, ...body });

export function encodeState(s) {
  return enc('s', {
    x: round(s.x),
    z: round(s.z),
    h: round(s.y || 0),
    y: round(s.yaw, 1000),
    p: s.seat >= 0 ? 'sit' : 'stand',
    s: s.seat >= 0 ? s.seat : -1,
    m: s.moving ? (s.running ? 2 : 1) : 0,
    e: s.emote || null,
    n: s.emoteNonce || 0,
    o: s.holding || null
  });
}

export const encodeReaction = (emoji) => enc('r', { e: emoji });
export const encodeGrab = (id, ver) => enc('g', { o: id, r: ver });
const motion = (o) => ({ x: round(o.x, 1000), y: round(o.y, 1000), z: round(o.z, 1000), vx: round(o.vx, 1000), vy: round(o.vy, 1000), vz: round(o.vz, 1000) });
export const encodeThrow = (id, ver, o) => enc('t', { o: id, r: ver, ...motion(o) });
export const encodeDrop = (id, ver, o) => enc('d', { o: id, r: ver, ...motion(o) });
export const encodeRest = (id, ver, o) => enc('x', { o: id, r: ver, x: round(o.x, 1000), y: round(o.y, 1000), z: round(o.z, 1000) });
export const encodeHit = (target, id, dx, dz) => enc('h', { u: target, o: id, dx: round(dx, 1000), dz: round(dz, 1000) });
export const encodeTheme = (theme, ts) => enc('m', { th: theme, r: ts });
export function encodeSnapshot(objects) {
  return enc('p', {
    l: Array.from(objects.values()).map((o) => [o.id, round(o.x), round(o.y), round(o.z), o.holder || '', o.ver])
  });
}

/** Devolve a mensagem validada ({ type, ... }) ou null (rejeitada). */
export function decode(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || m.v !== PROTOCOL_VERSION) return null;
  switch (m.t) {
    case 's': {
      if (!finite(m.x) || !finite(m.z) || !finite(m.y)) return null;
      const seat = Number.isInteger(m.s) && m.s >= 0 && m.s < SEATS.length ? m.s : -1;
      return {
        type: 'state',
        x: clamp(m.x, ROOM.minX, ROOM.maxX),
        z: clamp(m.z, ROOM.minZ, ROOM.maxZ),
        y: finite(m.h) ? clamp(m.h, 0, 12) : 0,
        yaw: Math.atan2(Math.sin(m.y), Math.cos(m.y)),
        seat,
        pose: seat >= 0 ? 'sit' : 'stand',
        moving: m.m === 1 || m.m === 2,
        running: m.m === 2,
        emote: EMOTES.includes(m.e) ? m.e : null,
        emoteNonce: Number.isInteger(m.n) ? m.n : 0,
        holding: isObj(m.o) ? m.o : null
      };
    }
    case 'r':
      return REACTIONS.includes(m.e) ? { type: 'reaction', emoji: m.e } : null;
    case 'g':
      return isObj(m.o) && Number.isInteger(m.r) && m.r >= 0 ? { type: 'grab', id: m.o, ver: m.r } : null;
    case 't':
    case 'd': {
      if (!isObj(m.o) || !Number.isInteger(m.r) || ![m.x, m.y, m.z, m.vx, m.vy, m.vz].every(finite)) return null;
      return { type: m.t === 't' ? 'throw' : 'drop', id: m.o, ver: m.r, ...pos(m), ...vel(m) };
    }
    case 'x':
      if (!isObj(m.o) || !Number.isInteger(m.r) || ![m.x, m.y, m.z].every(finite)) return null;
      return { type: 'rest', id: m.o, ver: m.r, ...pos(m) };
    case 'h': {
      if (!isUser(m.u) || !isObj(m.o) || !finite(m.dx) || !finite(m.dz)) return null;
      const len = Math.hypot(m.dx, m.dz) || 1;
      return { type: 'hit', target: m.u, id: m.o, dx: m.dx / len, dz: m.dz / len };
    }
    case 'm':
      return THEME_IDS.includes(m.th) && finite(m.r) ? { type: 'theme', theme: m.th, ts: m.r } : null;
    case 'p': {
      if (!Array.isArray(m.l) || m.l.length > THROWABLE_IDS.length) return null;
      const list = [];
      for (const e of m.l) {
        if (!Array.isArray(e) || e.length !== 6) return null;
        const [id, x, y, z, holder, ver] = e;
        if (!isObj(id) || ![x, y, z].every(finite) || !Number.isInteger(ver)) return null;
        if (holder !== '' && !isUser(holder)) return null;
        list.push({ id, ...pos({ x, y, z }), holder: holder || null, ver });
      }
      return { type: 'snapshot', list };
    }
    default:
      return null;
  }
}

/** Limita mensagens por pessoa (no máximo `max` a cada `windowMs`). */
export function createRateLimiter(max = 4, windowMs = 2000) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    return true;
  };
}
