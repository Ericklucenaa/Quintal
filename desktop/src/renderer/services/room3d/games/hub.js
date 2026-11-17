// Estado compartilhado das mesas de jogo da sala 3D.
//
// Cada mesa é um registro versionado (v): quem muda manda o estado inteiro e vence a
// versão maior (empate: menor id). Só quem está sentado na mesa muda o jogo; lugares
// de quem saiu da chamada podem ser liberados por qualquer um. Lances de xadrez e damas
// são conferidos por quem recebe. A sinuca manda a tacada (todos simulam igual) e depois
// o resultado; ping-pong e totó são simulados pelo jogador do lugar 1.
import { tableById } from '../layout';
import { emptyTable, encodeFrameMsg, encodeInput, encodeShot, encodeTable, encodeTrucoAction, encodeTrucoHand, initialTables } from './net';
import { initialBoard as reversiBoard, next as reversiNext, play as reversiPlay } from './reversi';
import { initialBoard as connect4Board, play as connect4Play, status as connect4Status } from './connect4';
import { act as trucoAct, cryptoRng, dealHand as trucoDeal, newMatch as trucoNewMatch, teamOf, visibleTo } from './truco';
import { START_FEN, outcome as chessOutcome, play as chessPlay, turnOf as chessTurn } from './chess';
import { applyMove, findMove, initialBoard, status as checkersStatus } from './checkers';
import { applyRules, canPlaceCue, newPoolData, simulateShot } from './pool';
import {
  createFoosball, createPingPong, newFoosballData, newPingPongData, scoreFoosball, scorePingPong, stepFoosball, stepPingPong
} from './realtime';

const FRAME_MS = 33;
const INPUT_MS = 50;
const SIM_STEP = 1 / 240;
const TRUCO_HANDOVER_MS = 2500; // pausa para todos verem quem levou a mão antes da próxima

export function freshData(kind) {
  switch (kind) {
    case 'chess': return { fen: START_FEN, last: null, san: '' };
    case 'checkers': return { board: initialBoard(), turn: 0, last: null };
    case 'pool': return newPoolData();
    case 'pingpong': return newPingPongData();
    case 'foosball': return newFoosballData();
    case 'reversi': return { board: reversiBoard(), turn: 0, last: null, passed: false };
    case 'connect4': return { board: connect4Board(), turn: 0, last: null, line: null };
    default: return null; // truco: quem dá as cartas monta o estado
  }
}

/** De quem é a vez (0/1) num jogo por turnos; null nos de tempo real. */
export function turnIndex(t) {
  if (!t.data) return null;
  if (t.kind === 'chess') return chessTurn(t.data.fen);
  if (['checkers', 'pool', 'reversi', 'connect4', 'truco'].includes(t.kind)) return t.data.turn;
  return null;
}

const newer = (a, b) => a.v > b.v || (a.v === b.v && a.by < b.by);
const full = (t) => t.players.every(Boolean);
/** Quem vence quando o lugar `seat` desiste ou abandona: o adversário, ou a outra dupla no truco. */
const otherSide = (t, seat) => (t.kind === 'truco' ? 1 - teamOf(seat) : 1 - seat);

export class GameHub {
  constructor({ myId, send }) {
    this.myId = myId;
    this.send = send; // (text, toUserId?) => void
    this.tables = initialTables();
    this.live = new Map(); // id -> estado de desenho (quadros, animação da sinuca)
    this.sims = new Map(); // id -> simulação local (anfitrião)
    this.inputs = new Map(); // id -> { u, kick } do jogador B (recebido) ou meu
    this.present = new Set([myId]);
    this.listeners = new Set();
    this.lastFrame = 0;
    this.lastInput = 0;
    this.events = []; // sons e avisos para a sala tocar: { kind, id, ... }
    // Lugar que eu pedi: se duas pessoas sentam ao mesmo tempo, uma versão perde;
    // quem perdeu senta de novo (se o lugar ainda estiver livre).
    this.wantSeat = null;
    // Truco: o estado completo (com as mãos) só existe em quem dá as cartas (lugar 0).
    this.truco = new Map(); // id -> { pub, hands }
    this.trucoHands = new Map(); // id -> { hand, own, partner } (a minha mão, recebida em particular)
    this.handoverAt = new Map();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn());
  }

  get(id) {
    return this.tables.get(id);
  }

  seatOf(userId = this.myId) {
    for (const t of this.tables.values()) {
      const i = t.players.indexOf(userId);
      if (i >= 0) return { id: t.id, seat: i };
    }
    return null;
  }

  // ---------------------------------------------------------------- local

  commit(id, next, { broadcast = true } = {}) {
    const cur = this.tables.get(id);
    const t = { ...cur, ...next, v: cur.v + 1, by: this.myId };
    this.tables.set(id, t);
    if (broadcast) this.send(encodeTable(t));
    this.onTableChanged(cur, t);
    this.emit();
    return t;
  }

  sit(id, seat) {
    const t = this.tables.get(id);
    if (!t || t.players[seat] && this.present.has(t.players[seat])) return false;
    const mine = this.seatOf();
    if (mine && mine.id !== id) this.leave(mine.id);
    this.wantSeat = { id, seat };
    const players = [...t.players];
    const was = players.indexOf(this.myId);
    if (was >= 0) players[was] = null;
    players[seat] = this.myId;
    const complete = players.every(Boolean);
    // truco: quem dá as cartas (lugar 0) começa a partida em tick(), com as mãos em particular
    const starting = complete && t.status !== 'playing' && t.kind !== 'truco';
    const trucoStatus = t.status === 'playing' ? 'playing' : 'waiting';
    this.commit(id, {
      players,
      status: starting ? 'playing' : t.kind === 'truco' ? trucoStatus : complete ? t.status : 'waiting',
      winner: starting ? null : t.winner,
      reason: '',
      data: starting ? freshData(t.kind) : t.data
    });
    return true;
  }

  leave(id) {
    if (this.wantSeat?.id === id) this.wantSeat = null;
    const t = this.tables.get(id);
    if (!t) return;
    const i = t.players.indexOf(this.myId);
    if (i < 0) return;
    const players = [...t.players];
    players[i] = null;
    const abandoned = t.status === 'playing';
    this.commit(id, {
      players,
      status: abandoned ? 'over' : t.status === 'over' ? 'over' : 'waiting',
      winner: abandoned ? otherSide(t, i) : t.winner,
      reason: abandoned ? 'desistência' : t.reason
    });
  }

  rematch(id) {
    const t = this.tables.get(id);
    if (!t || !t.players.includes(this.myId) || !full(t)) return;
    // truco: volta a "esperando" e quem dá as cartas começa a próxima partida
    if (t.kind === 'truco') this.commit(id, { status: 'waiting', winner: null, reason: '', data: null });
    else this.commit(id, { status: 'playing', winner: null, reason: '', data: freshData(t.kind) });
  }

  resign(id) {
    const t = this.tables.get(id);
    const i = t?.players.indexOf(this.myId);
    if (!t || i < 0 || t.status !== 'playing') return;
    this.commit(id, { status: 'over', winner: otherSide(t, i), reason: 'desistência' });
  }

  /** Truco: a variante só muda com a mesa parada, por quem está sentado nela. */
  setTrucoVariant(id, variant) {
    const t = this.tables.get(id);
    if (!t || t.kind !== 'truco' || t.status === 'playing' || !t.players.includes(this.myId)) return false;
    if (variant !== 'paulista' && variant !== 'mineiro') return false;
    this.commit(id, { opts: { variant } });
    return true;
  }

  reversiMove(id, index) {
    const t = this.tables.get(id);
    if (!t || t.status !== 'playing' || t.kind !== 'reversi') return false;
    const side = t.data.turn;
    if (t.players[side] !== this.myId) return false;
    const board = reversiPlay(t.data.board, side, index);
    if (!board) return false;
    const nx = reversiNext(board, side);
    this.commit(id, {
      data: { board, turn: nx.turn, last: index, passed: nx.passed !== undefined },
      status: nx.over ? 'over' : 'playing',
      winner: nx.over ? nx.winner : null,
      reason: nx.over ? 'sem jogadas' : nx.passed !== undefined ? 'sem jogada: passou a vez' : ''
    });
    this.events.push({ kind: 'move', id });
    return true;
  }

  connect4Move(id, col) {
    const t = this.tables.get(id);
    if (!t || t.status !== 'playing' || t.kind !== 'connect4') return false;
    const side = t.data.turn;
    if (t.players[side] !== this.myId) return false;
    const res = connect4Play(t.data.board, side, col);
    if (!res) return false;
    const st = connect4Status(res.board, side, res.index);
    this.commit(id, {
      data: { board: res.board, turn: 1 - side, last: res.index, line: st.line },
      status: st.over ? 'over' : 'playing',
      winner: st.over ? st.winner : null,
      reason: st.over ? (st.winner === -1 ? 'grade cheia' : '4 em linha') : ''
    });
    this.events.push({ kind: 'move', id });
    return true;
  }

  // ---------------------------------------------------------------- truco

  /** Ação do jogador local: quem dá as cartas aplica direto; os outros mandam para ele. */
  trucoAction(id, action) {
    const t = this.tables.get(id);
    if (!t || t.kind !== 'truco' || t.status !== 'playing' || !t.data) return false;
    const seat = t.players.indexOf(this.myId);
    if (seat < 0) return false;
    if (seat === 0) return this.applyTruco(id, 0, action);
    this.send(encodeTrucoAction(id, t.data.hand, action), t.players[0]);
    return true;
  }

  applyTruco(id, seat, action) {
    const t = this.tables.get(id);
    const state = this.truco.get(id);
    if (!t || !state || t.players[0] !== this.myId) return false;
    const res = trucoAct(state, seat, action);
    if (!res) return false;
    this.truco.set(id, res.full);
    const over = res.full.pub.phase === 'over';
    this.commit(id, {
      data: res.full.pub,
      status: over ? 'over' : 'playing',
      winner: over ? res.event.winner : null,
      reason: over ? 'chegou a 12' : ''
    });
    this.sendTrucoHands(id);
    const e = res.event;
    this.events.push({ kind: e.kind === 'truco' ? 'truco' : e.kind === 'hand' ? 'point' : 'move', id, ...(e.kind === 'truco' ? { to: e.to } : {}) });
    return true;
  }

  startTruco(id) {
    const t = this.tables.get(id);
    if (!t || t.players[0] !== this.myId || !full(t)) return;
    const dealer = Math.floor(cryptoRng()() * 4);
    const state = trucoNewMatch(t.opts?.variant || 'paulista', cryptoRng(), dealer);
    this.truco.set(id, state);
    this.handoverAt.delete(id);
    this.commit(id, { status: 'playing', winner: null, reason: '', data: state.pub });
    this.sendTrucoHands(id);
    this.events.push({ kind: 'move', id });
  }

  /** Cada um recebe só a própria mão (e a do parceiro na mão de onze/dez), em particular. */
  sendTrucoHands(id, onlyTo = null) {
    const t = this.tables.get(id);
    const state = this.truco.get(id);
    if (!t || !state) return;
    t.players.forEach((uid, seat) => {
      if (!uid || (onlyTo && uid !== onlyTo)) return;
      const vis = visibleTo(state, seat);
      if (uid === this.myId) this.trucoHands.set(id, { hand: state.pub.hand, own: vis.own, partner: vis.partner });
      else this.send(encodeTrucoHand(id, state.pub.hand, vis.own, vis.partner), uid);
    });
  }

  /** A minha mão na mão atual (null enquanto não chega). */
  myTrucoHand(id) {
    const t = this.tables.get(id);
    const h = this.trucoHands.get(id);
    return t?.data && h && h.hand === t.data.hand ? h : null;
  }

  onTrucoAct(from, { id, hand, action }) {
    const t = this.tables.get(id);
    if (!t || t.players[0] !== this.myId || t.status !== 'playing' || t.data?.hand !== hand) return;
    const seat = t.players.indexOf(from);
    if (seat > 0) this.applyTruco(id, seat, action);
  }

  onTrucoHand(from, { id, hand, own, partner }) {
    const t = this.tables.get(id);
    if (!t || t.players[0] !== from || !t.players.includes(this.myId)) return;
    this.trucoHands.set(id, { hand, own, partner });
    this.emit();
  }

  chessMove(id, move) {
    const t = this.tables.get(id);
    if (!t || t.status !== 'playing' || t.kind !== 'chess') return false;
    if (t.players[chessTurn(t.data.fen)] !== this.myId) return false;
    const res = chessPlay(t.data.fen, move);
    if (!res) return false;
    const out = chessOutcome(res.fen);
    this.commit(id, {
      data: { fen: res.fen, last: { from: res.from, to: res.to, promotion: move.promotion || null }, san: res.san },
      status: out.over ? 'over' : 'playing',
      winner: out.over ? (out.winner === null ? -1 : out.winner) : null,
      reason: out.reason
    });
    this.events.push({ kind: 'move', id });
    return true;
  }

  checkersMove(id, path) {
    const t = this.tables.get(id);
    if (!t || t.status !== 'playing' || t.kind !== 'checkers') return false;
    const side = t.data.turn;
    if (t.players[side] !== this.myId) return false;
    const move = findMove(t.data.board, side, path);
    if (!move) return false;
    const board = applyMove(t.data.board, move);
    const st = checkersStatus(board, 1 - side);
    this.commit(id, {
      data: { board, turn: 1 - side, last: move.path },
      status: st.over ? 'over' : 'playing',
      winner: st.over ? st.winner : null,
      reason: st.over ? 'sem jogadas' : move.captured.length ? `${move.captured.length} captura${move.captured.length > 1 ? 's' : ''}` : ''
    });
    this.events.push({ kind: move.captured.length ? 'capture' : 'move', id });
    return true;
  }

  poolShot(id, shot) {
    const t = this.tables.get(id);
    if (!t || t.status !== 'playing' || t.kind !== 'pool' || this.live.get(id)?.anim) return false;
    const shooter = t.data.turn;
    if (t.players[shooter] !== this.myId) return false;
    const placed = t.data.ballInHand && shot.cueX !== null && shot.cueX !== undefined;
    if (placed && !canPlaceCue(t.data.balls, shot.cueX, shot.cueZ)) return false;
    const s = { angle: shot.angle, power: shot.power, cueX: placed ? shot.cueX : null, cueZ: placed ? shot.cueZ : null };
    this.send(encodeShot(id, t.v, s));
    this.runPoolShot(t, s, (result) => {
      const ruled = applyRules(t.data, shooter, result);
      this.commit(id, {
        data: ruled.data,
        status: ruled.over ? 'over' : 'playing',
        winner: ruled.over ? ruled.winner : null,
        reason: ruled.over ? ruled.data.note : ''
      });
    });
    return true;
  }

  runPoolShot(t, shot, done) {
    const frames = [];
    const result = simulateShot(t.data.balls, shot, (balls) => frames.push(balls.map((b) => [b.x, b.z, b.in])));
    this.live.set(t.id, { anim: { frames, start: performance.now() } });
    this.events.push({ kind: 'cue', id: t.id });
    done?.(result);
    this.emit();
  }

  /** Posição do mouse/raquete do jogador local nos jogos em tempo real. */
  setInput(id, u, kick = false) {
    const cur = this.inputs.get(`${id}:me`) || { u: 0, kick: false };
    this.inputs.set(`${id}:me`, { u, kick: kick || cur.kick });
  }

  // ---------------------------------------------------------------- rede

  handle(from, msg) {
    switch (msg.type) {
      case 'table': return this.onRemoteTable(from, msg.table);
      case 'frame': return this.onFrame(from, msg);
      case 'input': return this.onInput(from, msg);
      case 'shot': return this.onShot(from, msg);
      case 'truco-act': return this.onTrucoAct(from, msg);
      case 'truco-hand': return this.onTrucoHand(from, msg);
      default:
    }
    return undefined;
  }

  onRemoteTable(from, incoming) {
    const cur = this.tables.get(incoming.id);
    if (!cur || incoming.by !== from || !newer(incoming, cur)) return;
    // ninguém tira outra pessoa (presente) do lugar. Versões iguais são mudanças
    // simultâneas: vence o menor id e quem perdeu senta de novo (reclaimSeat).
    for (let i = 0; i < cur.players.length && incoming.v > cur.v; i++) {
      const holder = cur.players[i];
      if (holder && holder !== incoming.players[i] && holder !== from && this.present.has(holder)) return;
    }
    const seatedBefore = cur.players.includes(from);
    const seatedNow = incoming.players.includes(from);
    if (!seatedBefore && !seatedNow) return;
    // truco: o jogo (cartas, vez, pontos) só muda por quem dá as cartas, sem trocar ninguém de lugar
    if (cur.kind === 'truco' && incoming.data && JSON.stringify(incoming.data) !== JSON.stringify(cur.data)
      && (from !== incoming.players[0] || incoming.players.join() !== cur.players.join())) return;
    // lance de xadrez/damas: confere quando é o próximo da sequência
    if (incoming.v === cur.v + 1 && cur.status === 'playing' && incoming.status !== 'waiting' && cur.data && incoming.data
      && JSON.stringify(cur.data) !== JSON.stringify(incoming.data) && full(cur) && cur.kind !== 'truco'
      && cur.players.join() === incoming.players.join()) {
      if (!this.validTransition(cur, incoming, from)) return;
    }
    this.tables.set(incoming.id, incoming);
    this.onTableChanged(cur, incoming);
    this.emit();
    this.reclaimSeat(incoming);
  }

  reclaimSeat(t) {
    const want = this.wantSeat;
    if (!want || want.id !== t.id || t.players.includes(this.myId)) return;
    if (t.players[want.seat]) {
      this.wantSeat = null; // outra pessoa ficou com o lugar
      return;
    }
    this.sit(want.id, want.seat);
  }

  validTransition(cur, next, from) {
    if (cur.kind === 'chess') {
      if (cur.players[chessTurn(cur.data.fen)] !== from) return false;
      if (!next.data.last) return false;
      const res = chessPlay(cur.data.fen, next.data.last);
      return Boolean(res) && res.fen === next.data.fen;
    }
    if (cur.kind === 'checkers') {
      if (cur.players[cur.data.turn] !== from || !next.data.last) return false;
      const move = findMove(cur.data.board, cur.data.turn, next.data.last);
      return Boolean(move) && applyMove(cur.data.board, move) === next.data.board;
    }
    if (cur.kind === 'reversi') {
      if (cur.players[cur.data.turn] !== from || next.data.last === null) return false;
      const board = reversiPlay(cur.data.board, cur.data.turn, next.data.last);
      return board === next.data.board && reversiNext(board, cur.data.turn).turn === next.data.turn;
    }
    if (cur.kind === 'connect4') {
      if (cur.players[cur.data.turn] !== from || next.data.last === null) return false;
      const res = connect4Play(cur.data.board, cur.data.turn, next.data.last % 7);
      return Boolean(res) && res.board === next.data.board && res.index === next.data.last && next.data.turn === 1 - cur.data.turn;
    }
    return true; // sinuca e tempo real: quem manda é jogador da mesa (conferido acima)
  }

  onShot(from, { id, ver, shot }) {
    const t = this.tables.get(id);
    if (!t || t.status !== 'playing' || t.v !== ver || t.players[t.data.turn] !== from) return;
    if (shot.cueX !== null && (!t.data.ballInHand || !canPlaceCue(t.data.balls, shot.cueX, shot.cueZ))) return;
    this.runPoolShot(t, shot, null);
  }

  onFrame(from, { id, frame }) {
    const t = this.tables.get(id);
    if (!t || t.players[0] !== from || from === this.myId) return;
    this.live.set(id, { frame, at: performance.now() });
  }

  onInput(from, { id, u, kick }) {
    const t = this.tables.get(id);
    if (!t || t.players[1] !== from) return;
    const cur = this.inputs.get(`${id}:b`) || { u: 0, kick: false };
    this.inputs.set(`${id}:b`, { u, kick: kick || cur.kick });
  }

  onTableChanged(before, after) {
    if (before.status !== 'over' && after.status === 'over') this.events.push({ kind: 'over', id: after.id, winner: after.winner });
    if (after.status !== 'playing' || after.players[0] !== this.myId) this.sims.delete(after.id);
    if (before.kind !== 'pool' && after.status !== 'playing') this.live.delete(after.id);
  }

  /** Estado das mesas em uso para quem acabou de entrar na chamada. */
  snapshotTo(peerId) {
    this.tables.forEach((t) => {
      if (t.v > 0) this.send(encodeTable(t), peerId);
      if (t.kind === 'truco' && t.players[0] === this.myId && t.players.includes(peerId)) this.sendTrucoHands(t.id, peerId);
    });
  }

  /** Quem está na chamada (lugares de quem saiu ficam livres). */
  setPresent(ids) {
    this.present = new Set(ids);
    this.present.add(this.myId);
    this.tables.forEach((t, id) => {
      if (t.players.some((p) => p && !this.present.has(p))) {
        const players = t.players.map((p) => (p && this.present.has(p) ? p : null));
        // mudança só local (cada um faz igual); quem voltar a sentar manda versão nova
        this.tables.set(id, { ...t, players, status: t.status === 'playing' ? 'waiting' : t.status });
        this.sims.delete(id);
        this.emit();
      }
    });
  }

  // ---------------------------------------------------------------- laço

  tick(dt) {
    const now = performance.now();
    let changed = false;
    this.tickTruco(now);
    this.tables.forEach((t, id) => {
      if (t.kind !== 'pingpong' && t.kind !== 'foosball') return;
      if (t.status !== 'playing') return;
      const me = t.players.indexOf(this.myId);
      const mine = this.inputs.get(`${id}:me`) || { u: 0, kick: false };
      if (me === 0) {
        let sim = this.sims.get(id);
        if (!sim) {
          sim = t.kind === 'pingpong' ? createPingPong() : createFoosball();
          this.sims.set(id, sim);
        }
        const other = this.inputs.get(`${id}:b`) || { u: 0, kick: false };
        if (t.kind === 'pingpong') {
          sim.paddles[0] = mine.u * 0.96;
          sim.paddles[1] = other.u * 0.96;
        } else {
          sim.controls[0] = mine.u;
          sim.controls[1] = other.u;
          if (mine.kick) sim.kicks[0] = 0.18;
          if (other.kick) sim.kicks[1] = 0.18;
        }
        this.inputs.set(`${id}:me`, { u: mine.u, kick: false });
        this.inputs.set(`${id}:b`, { u: other.u, kick: false });
        let scorer = null;
        for (let acc = Math.min(dt, 0.5); acc > 1e-6 && scorer === null; acc -= SIM_STEP) {
          const h = Math.min(SIM_STEP, acc);
          scorer = t.kind === 'pingpong' ? stepPingPong(sim, h, t.data.server) : stepFoosball(sim, h);
        }
        const frame = t.kind === 'pingpong'
          ? { ball: { ...sim.ball }, paddles: [...sim.paddles], serving: sim.serveAt > 0 }
          : { ball: { ...sim.ball }, controls: [...sim.controls], kicks: sim.kicks.map((k) => k > 0) };
        this.live.set(id, { frame, at: now });
        if (now - this.lastFrame > FRAME_MS) {
          const encoded = t.kind === 'pingpong'
            ? [sim.ball.x, sim.ball.z, sim.ball.h, sim.paddles[0], sim.paddles[1], sim.serveAt > 0 ? 1 : 0]
            : [sim.ball.x, sim.ball.z, sim.controls[0], sim.controls[1], sim.kicks[0] > 0 ? 1 : 0, sim.kicks[1] > 0 ? 1 : 0];
          this.send(encodeFrameMsg(id, encoded.map((n) => Math.round(n * 1000) / 1000)));
          changed = true;
        }
        if (scorer !== null) {
          const res = t.kind === 'pingpong' ? scorePingPong(t.data, scorer) : scoreFoosball(t.data, scorer);
          this.commit(id, { data: res.data, status: res.over ? 'over' : 'playing', winner: res.over ? res.winner : null, reason: res.over ? 'fim de jogo' : '' });
          if (t.kind === 'pingpong') {
            sim.serveAt = res.over ? 0 : 1.1;
            sim.bounce = 0;
          } else {
            sim.restart = res.over ? 0 : 1.0;
          }
          this.events.push({ kind: 'point', id, scorer });
        }
      } else if (me === 1 && now - this.lastInput > INPUT_MS) {
        this.send(encodeInput(id, mine.u, mine.kick));
        this.inputs.set(`${id}:me`, { u: mine.u, kick: false });
        changed = true;
      }
    });
    if (changed) {
      if (now - this.lastFrame > FRAME_MS) this.lastFrame = now;
      if (now - this.lastInput > INPUT_MS) this.lastInput = now;
    }
    // fim das animações da sinuca
    this.live.forEach((l, id) => {
      if (l.anim && now - l.anim.start > (l.anim.frames.length / 60) * 1000 + 200) {
        this.live.delete(id);
        this.emit();
      }
    });
  }

  /** Quem dá as cartas começa a partida, passa para a próxima mão e se recupera se perdeu o estado. */
  tickTruco(now) {
    this.tables.forEach((t, id) => {
      if (t.kind !== 'truco' || t.players[0] !== this.myId) return;
      if (t.status === 'waiting' && full(t) && t.players.every((p) => this.present.has(p))) {
        this.startTruco(id);
      } else if (t.status === 'playing' && !this.truco.has(id)) {
        this.startTruco(id); // quem dá as cartas recarregou e perdeu as mãos: recomeça a partida
      } else if (t.status === 'playing' && t.data?.phase === 'handover') {
        if (!this.handoverAt.has(id)) this.handoverAt.set(id, now);
        else if (now - this.handoverAt.get(id) > TRUCO_HANDOVER_MS) {
          this.handoverAt.delete(id);
          const next = trucoDeal(this.truco.get(id), cryptoRng());
          this.truco.set(id, next);
          this.commit(id, { data: next.pub });
          this.sendTrucoHands(id);
          this.events.push({ kind: 'move', id });
        }
      }
    });
  }

  /** Bolas da sinuca agora (animação em curso ou o estado da mesa). */
  poolBalls(id) {
    const t = this.tables.get(id);
    const l = this.live.get(id);
    if (l?.anim && l.anim.frames.length) {
      const i = Math.min(l.anim.frames.length - 1, Math.floor(((performance.now() - l.anim.start) / 1000) * 60));
      return l.anim.frames[i].map(([x, z, inn], id2) => ({ id: id2, x, z, in: inn }));
    }
    return t?.data?.balls || freshData('pool').balls;
  }

  isAnimating(id) {
    return Boolean(this.live.get(id)?.anim);
  }

  /** Quadro atual de um jogo em tempo real (do anfitrião ou recebido). */
  frame(id) {
    return this.live.get(id)?.frame || null;
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export { tableById, emptyTable };
