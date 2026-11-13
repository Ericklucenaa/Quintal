// Mensagens das mesas de jogo (canal de dados da chamada). Tudo que chega é
// conferido: mesa existente, ids de usuário válidos, números finitos e dados no
// formato do jogo daquela mesa.
import { GAME_TABLES, tableById } from '../layout';
import { isValidFen } from './chess';
import { isValidBoard } from './checkers';
import { isValidPoolData } from './pool';
import { decodeFrame } from './realtime';

export const STATUSES = ['waiting', 'playing', 'over'];
const isUser = (id) => typeof id === 'string' && id.length > 0 && id.length <= 64 && /^[\w-]+$/.test(id);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const r4 = (n) => Math.round(n * 10000) / 10000;
const isSquare = (s) => typeof s === 'string' && /^[a-h][1-8]$/.test(s);

/** Estado vazio de uma mesa. */
export function emptyTable(id) {
  const t = tableById(id);
  return { id, kind: t.kind, v: 0, by: '', players: [null, null], status: 'waiting', winner: null, reason: '', data: null };
}

export function initialTables() {
  return new Map(GAME_TABLES.map((t) => [t.id, emptyTable(t.id)]));
}

// --- dados compactos por jogo --------------------------------------------

function packData(kind, d) {
  if (!d) return null;
  switch (kind) {
    case 'chess':
      return { f: d.fen, l: d.last ? [d.last.from, d.last.to, d.last.promotion || ''] : null, s: d.san || '' };
    case 'checkers':
      return { b: d.board, t: d.turn, l: d.last || null };
    case 'pool':
      return { b: d.balls.map((x) => [r4(x.x), r4(x.z), x.in ? 1 : 0]), t: d.turn, g: d.groups, h: d.ballInHand ? 1 : 0, n: (d.note || '').slice(0, 80) };
    case 'pingpong':
      return { sc: d.score, sv: d.server, tg: d.target };
    case 'foosball':
      return { sc: d.score, tg: d.target };
    default:
      return null;
  }
}

function unpackData(kind, p) {
  if (p === null || p === undefined) return null;
  if (typeof p !== 'object') return undefined;
  switch (kind) {
    case 'chess': {
      if (!isValidFen(p.f)) return undefined;
      const l = Array.isArray(p.l) && isSquare(p.l[0]) && isSquare(p.l[1]) ? { from: p.l[0], to: p.l[1], promotion: ['q', 'r', 'b', 'n'].includes(p.l[2]) ? p.l[2] : null } : null;
      return { fen: p.f, last: l, san: typeof p.s === 'string' ? p.s.slice(0, 12) : '' };
    }
    case 'checkers': {
      if (!isValidBoard(p.b) || (p.t !== 0 && p.t !== 1)) return undefined;
      const last = Array.isArray(p.l) && p.l.length >= 2 && p.l.length <= 14
        && p.l.every((sq) => Array.isArray(sq) && sq.length === 2 && sq.every((n) => Number.isInteger(n) && n >= 0 && n < 8)) ? p.l : null;
      return { board: p.b, turn: p.t, last };
    }
    case 'pool': {
      if (!Array.isArray(p.b) || p.b.length !== 16) return undefined;
      const balls = p.b.map((x, id) => (Array.isArray(x) && x.length === 3 && finite(x[0]) && finite(x[1]) ? { id, x: x[0], z: x[1], in: x[2] === 1 } : null));
      if (balls.some((b) => !b)) return undefined;
      const d = { balls, turn: p.t, groups: Array.isArray(p.g) ? p.g : [null, null], ballInHand: p.h === 1, note: typeof p.n === 'string' ? p.n.slice(0, 80) : '' };
      return isValidPoolData(d) ? d : undefined;
    }
    case 'pingpong':
    case 'foosball': {
      const sc = p.sc;
      if (!Array.isArray(sc) || sc.length !== 2 || !sc.every((n) => Number.isInteger(n) && n >= 0 && n < 100)) return undefined;
      const target = Number.isInteger(p.tg) && p.tg >= 1 && p.tg <= 21 ? p.tg : kind === 'pingpong' ? 11 : 5;
      return kind === 'pingpong' ? { score: sc, server: p.sv === 1 ? 1 : 0, target } : { score: sc, target };
    }
    default:
      return undefined;
  }
}

// --- mensagens -----------------------------------------------------------

const enc = (t, body) => JSON.stringify({ v: 1, t, ...body });

export function encodeTable(t) {
  return enc('gt', {
    g: t.id,
    r: t.v,
    b: t.by,
    p: t.players.map((x) => x || ''),
    s: t.status,
    w: t.winner,
    x: (t.reason || '').slice(0, 60),
    d: packData(t.kind, t.data)
  });
}
export const encodeFrameMsg = (id, frame) => enc('gf', { g: id, f: frame });
export const encodeInput = (id, u, kick) => enc('gi', { g: id, u: Math.round(u * 1000) / 1000, k: kick ? 1 : 0 });
export const encodeShot = (id, ver, shot) => enc('gp', {
  g: id,
  r: ver,
  a: Math.round(shot.angle * 100000) / 100000,
  p: Math.round(shot.power * 1000) / 1000,
  ...(shot.cueX !== null && shot.cueX !== undefined ? { cx: r4(shot.cueX), cz: r4(shot.cueZ) } : {})
});

/** Decodifica as mensagens de mesa (o protocolo da sala chama isto para 'g*'). */
export function decodeGameMessage(m) {
  const table = typeof m.g === 'string' ? tableById(m.g) : null;
  if (!table) return null;
  switch (m.t) {
    case 'gt': {
      if (!Number.isInteger(m.r) || m.r < 0 || !isUser(m.b)) return null;
      if (!Array.isArray(m.p) || m.p.length !== 2 || !m.p.every((x) => x === '' || isUser(x))) return null;
      if (!STATUSES.includes(m.s)) return null;
      const winner = [0, 1, -1].includes(m.w) ? m.w : null;
      const data = unpackData(table.kind, m.d);
      if (data === undefined) return null;
      return {
        type: 'table',
        table: { id: table.id, kind: table.kind, v: m.r, by: m.b, players: m.p.map((x) => x || null), status: m.s, winner, reason: typeof m.x === 'string' ? m.x.slice(0, 60) : '', data }
      };
    }
    case 'gf': {
      if (table.kind !== 'pingpong' && table.kind !== 'foosball') return null;
      const frame = decodeFrame(table.kind, m.f);
      return frame ? { type: 'frame', id: table.id, frame, raw: m.f } : null;
    }
    case 'gi':
      if (!finite(m.u)) return null;
      return { type: 'input', id: table.id, u: Math.max(-1, Math.min(1, m.u)), kick: m.k === 1 };
    case 'gp': {
      if (table.kind !== 'pool' || !Number.isInteger(m.r) || !finite(m.a) || !finite(m.p)) return null;
      const placed = finite(m.cx) && finite(m.cz);
      return { type: 'shot', id: table.id, ver: m.r, shot: { angle: m.a, power: Math.max(0, Math.min(5, m.p)), cueX: placed ? m.cx : null, cueZ: placed ? m.cz : null } };
    }
    default:
      return null;
  }
}
