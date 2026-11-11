// Mensagens da sala 3D trocadas pelo canal de dados WebRTC da chamada.
// Tudo que chega de outro participante é tratado como não confiável:
// tamanho máximo, tipos conferidos, números limitados à sala e textos de lista fechada.
import { ROOM, SEATS } from './layout';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 512;
export const EMOTES = ['wave', 'dance', 'cheer'];
export const REACTIONS = ['👋', '😂', '🔥', '👏', '❤️', '😮'];
export const POSES = ['stand', 'sit'];

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (n, d = 100) => Math.round(n * d) / d;

export function encodeState(s) {
  return JSON.stringify({
    v: PROTOCOL_VERSION,
    t: 's',
    x: round(s.x),
    z: round(s.z),
    y: round(s.yaw, 1000),
    p: s.seat >= 0 ? 'sit' : 'stand',
    s: s.seat >= 0 ? s.seat : -1,
    m: s.moving ? (s.running ? 2 : 1) : 0,
    e: s.emote || null,
    n: s.emoteNonce || 0
  });
}

export function encodeReaction(emoji) {
  return JSON.stringify({ v: PROTOCOL_VERSION, t: 'r', e: emoji });
}

/** Devolve { type: 'state', ... } | { type: 'reaction', emoji } | null (mensagem rejeitada). */
export function decode(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || m.v !== PROTOCOL_VERSION) return null;
  if (m.t === 's') {
    if (!finite(m.x) || !finite(m.z) || !finite(m.y)) return null;
    const seat = Number.isInteger(m.s) && m.s >= 0 && m.s < SEATS.length ? m.s : -1;
    return {
      type: 'state',
      x: clamp(m.x, ROOM.minX, ROOM.maxX),
      z: clamp(m.z, ROOM.minZ, ROOM.maxZ),
      yaw: Math.atan2(Math.sin(m.y), Math.cos(m.y)),
      seat,
      pose: seat >= 0 ? 'sit' : 'stand',
      moving: m.m === 1 || m.m === 2,
      running: m.m === 2,
      emote: EMOTES.includes(m.e) ? m.e : null,
      emoteNonce: Number.isInteger(m.n) ? m.n : 0
    };
  }
  if (m.t === 'r') {
    return REACTIONS.includes(m.e) ? { type: 'reaction', emoji: m.e } : null;
  }
  return null;
}

/** Limita reações por pessoa (no máximo `max` a cada `windowMs`). */
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
