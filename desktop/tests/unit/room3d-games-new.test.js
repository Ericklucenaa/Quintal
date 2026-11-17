import { describe, expect, it } from 'vitest';
import * as reversi from '../../src/renderer/services/room3d/games/reversi';
import * as c4 from '../../src/renderer/services/room3d/games/connect4';
import * as truco from '../../src/renderer/services/room3d/games/truco';

// gerador determinístico para os testes
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('reversi', () => {
  it('saída: 4 jogadas para as escuras e a jogada vira a peça cercada', () => {
    const b = reversi.initialBoard();
    expect(reversi.legalMoves(b, 0)).toHaveLength(4);
    const after = reversi.play(b, 0, 2 * 8 + 3); // cerca a clara em (3,3) contra a escura em (4,3)
    expect(after).not.toBeNull();
    expect(reversi.count(after)).toEqual([4, 1]);
    expect(reversi.play(b, 0, 0)).toBeNull(); // canto sem cercar nada
  });

  it('sem jogada a vez passa; sem jogadas para ninguém, conta as peças', () => {
    // ninguém consegue cercar ninguém: acaba e conta as peças (1 a 1 = empate)
    const b = 'a......b' + '.'.repeat(56);
    expect(reversi.legalMoves(b, 0)).toEqual([]);
    expect(reversi.legalMoves(b, 1)).toEqual([]);
    expect(reversi.next(b, 1)).toMatchObject({ over: true, winner: -1 });
    // as escuras não têm jogada, mas as claras têm (cercam 'aa' por (0,3)): a vez volta para as claras
    const b2 = 'baa' + '.'.repeat(61);
    expect(reversi.next(b2, 1)).toMatchObject({ over: false, turn: 1, passed: 0 });
  });
});

describe('lig 4', () => {
  it('a peça cai até embaixo e a coluna cheia recusa', () => {
    let b = c4.initialBoard();
    for (let i = 0; i < 6; i++) b = c4.play(b, i % 2, 3).board;
    expect(b[5 * 7 + 3]).toBe('a');
    expect(b[0 * 7 + 3]).toBe('b');
    expect(c4.play(b, 0, 3)).toBeNull();
  });

  it('detecta 4 em linha, coluna e nas duas diagonais', () => {
    let b = c4.initialBoard();
    let last;
    for (const col of [0, 1, 2, 3]) { last = c4.play(b, 0, col); b = last.board; }
    expect(c4.status(b, 0, last.index)).toMatchObject({ over: true, winner: 0 });
    b = c4.initialBoard();
    for (let i = 0; i < 4; i++) { last = c4.play(b, 1, 6); b = last.board; }
    expect(c4.status(b, 1, last.index).line).toHaveLength(4);
    // diagonal ↗: escadinha de alturas 1,2,3,4 nas colunas 0..3
    b = c4.initialBoard();
    const fill = (col, n, side) => { for (let i = 0; i < n; i++) b = c4.play(b, side, col).board; };
    fill(1, 1, 1); fill(2, 2, 1); fill(3, 3, 1);
    for (const col of [0, 1, 2, 3]) { last = c4.play(b, 0, col); b = last.board; }
    expect(c4.status(b, 0, last.index).winner).toBe(0);
  });

  it('grade cheia sem linha é empate', () => {
    // padrão sem 4 alinhados em nenhuma direção
    const pattern = ['aabbaab', 'bbaabba', 'aabbaab', 'bbaabba', 'aabbaab', 'bbaabba'].join('');
    const almost = '.' + pattern.slice(1);
    const res = c4.play(almost, 0, 0);
    expect(c4.status(res.board, 0, res.index)).toMatchObject({ over: true, winner: -1 });
  });
});

describe('truco', () => {
  it('paulista: a manilha é o valor seguinte à vira, com naipes ouros < espadas < copas < paus', () => {
    expect(truco.manilhaRank('7o')).toBe('Q');
    expect(truco.manilhaRank('3p')).toBe('4');
    const s = (c) => truco.strength(c, 'paulista', '7o');
    expect(s('Qp')).toBeGreaterThan(s('Qc'));
    expect(s('Qc')).toBeGreaterThan(s('Qe'));
    expect(s('Qo')).toBeGreaterThan(s('3p'));
    expect(s('3o')).toBeGreaterThan(s('2p'));
    expect(s('Ap')).toBe(s('Ao'));
  });

  it('mineiro: zap > copas > espadilha > pica-fumo > 3, e o 7 comum vale como 7', () => {
    const s = (c) => truco.strength(c, 'mineiro', null);
    expect(s('4p')).toBeGreaterThan(s('7c'));
    expect(s('7c')).toBeGreaterThan(s('Ae'));
    expect(s('Ae')).toBeGreaterThan(s('7o'));
    expect(s('7o')).toBeGreaterThan(s('3p'));
    expect(s('7e')).toBeLessThan(s('Q' + 'o'));
    expect(s('Ac')).toBeLessThan(s('2o'));
  });

  it('vaza: empate só quando as melhores são de duplas diferentes', () => {
    expect(truco.trickWinner([[0, '3o'], [1, '3c'], [2, '4p'], [3, '5e']], 'paulista', '7o').team).toBe(-1);
    expect(truco.trickWinner([[0, '3o'], [1, '2c'], [2, '3p'], [3, '5e']], 'paulista', '7o')).toMatchObject({ team: 0 });
  });

  it('regras de empate da mão', () => {
    expect(truco.handWinner([0, 0])).toBe(0);
    expect(truco.handWinner([0, -1])).toBe(0);
    expect(truco.handWinner([0, 1])).toBeNull();
    expect(truco.handWinner([0, 1, -1])).toBe(0);
    expect(truco.handWinner([-1, 1])).toBe(1);
    expect(truco.handWinner([-1, -1, 0])).toBe(0);
    expect(truco.handWinner([-1, -1, -1])).toBe(-1);
  });

  it('dá 3 cartas a cada um, a vira não está em nenhuma mão e só quem está na vez joga', () => {
    const m = truco.newMatch('paulista', seeded(7));
    const all = [...m.hands.flat(), m.pub.vira];
    expect(new Set(all).size).toBe(13);
    expect(m.pub.value).toBe(1);
    const turn = m.pub.turn;
    const other = (turn + 1) % 4;
    expect(truco.act(m, other, { a: 'play', c: m.hands[other][0] })).toBeNull();
    expect(truco.act(m, turn, { a: 'play', c: m.hands[other][0] })).toBeNull(); // carta que não é dele
    const res = truco.act(m, turn, { a: 'play', c: m.hands[turn][0] });
    expect(res.full.pub.trick).toHaveLength(1);
    expect(res.full.hands[turn]).toHaveLength(2);
  });

  it('truco: a outra dupla aceita, corre ou aumenta; quem pediu não pede de novo', () => {
    const m = truco.newMatch('paulista', seeded(3));
    const s = m.pub.turn;
    const asked = truco.act(m, s, { a: 'truco' });
    expect(asked.full.pub.raise).toMatchObject({ to: 3, prev: 1, team: truco.teamOf(s) });
    expect(truco.act(asked.full, (s + 2) % 4, { a: 'accept' })).toBeNull(); // parceiro não responde
    const accepted = truco.act(asked.full, (s + 1) % 4, { a: 'accept' });
    expect(accepted.full.pub.value).toBe(3);
    expect(truco.act(accepted.full, s, { a: 'truco' })).toBeNull();
    // aumento: a outra dupla pede 6, e quem pediu truco corre → a dupla que aumentou ganha 3
    const raised = truco.act(asked.full, (s + 1) % 4, { a: 'truco' });
    expect(raised.full.pub.raise).toMatchObject({ to: 6, prev: 3 });
    const ran = truco.act(raised.full, s, { a: 'run' });
    expect(ran.full.pub.score[truco.teamOf(s + 1)]).toBe(3);
    // correr do truco simples dá o valor da mão a quem pediu
    const ran1 = truco.act(asked.full, (s + 3) % 4, { a: 'run' });
    expect(ran1.full.pub.score[truco.teamOf(s)]).toBe(1);
    expect(ran1.event).toMatchObject({ kind: 'hand', points: 1 });
  });

  it('mineiro: mão vale 2 e o truco sobe 4, 6, 10, 12', () => {
    let m = truco.newMatch('mineiro', seeded(11));
    expect(m.pub.value).toBe(2);
    expect(m.pub.vira).toBeNull();
    const s = m.pub.turn;
    const steps = [];
    let cur = truco.act(m, s, { a: 'truco' });
    steps.push(cur.full.pub.raise.to);
    let responder = (s + 1) % 4;
    while (cur.full.pub.raise.to < 12) {
      cur = truco.act(cur.full, responder, { a: 'truco' });
      steps.push(cur.full.pub.raise.to);
      responder = (responder + 1) % 4;
    }
    expect(steps).toEqual([4, 6, 10, 12]);
    expect(truco.act(cur.full, responder, { a: 'truco' })).toBeNull(); // não passa de 12
    m = cur.full;
  });

  it('mão de onze: a dupla com 11 vê a carta do parceiro e decide; não há truco', () => {
    const base = truco.newMatch('paulista', seeded(5));
    const at11 = truco.dealHand({ ...base, pub: { ...base.pub, score: [11, 4] } }, seeded(9));
    expect(at11.pub.phase).toBe('special');
    expect(truco.visibleTo(at11, 0).partner).toEqual(at11.hands[2]);
    expect(truco.visibleTo(at11, 1).partner).toBeNull();
    expect(truco.act(at11, 1, { a: 'go' })).toBeNull(); // só a dupla com 11 decide
    const go = truco.act(at11, 2, { a: 'go' });
    expect(go.full.pub.value).toBe(3);
    expect(truco.act(go.full, go.full.pub.turn, { a: 'truco' })).toBeNull();
    const fold = truco.act(at11, 0, { a: 'fold' });
    expect(fold.full.pub.score).toEqual([11, 5]);
  });

  it('partida inteira até 12 pontos, só com jogadas válidas', () => {
    const rng = seeded(42);
    let full = truco.newMatch('paulista', rng);
    let hands = 0;
    for (let guard = 0; guard < 5000; guard++) {
      const p = full.pub;
      if (p.phase === 'over') break;
      if (p.phase === 'handover') { full = truco.dealHand(full, rng); hands++; continue; }
      let res;
      if (p.phase === 'special') res = truco.act(full, p.special.team, { a: 'go' });
      else if (p.phase === 'raise') res = truco.act(full, (p.raise.seat + 1) % 4, { a: 'accept' });
      else if (p.raisedBy === -1 && rng() < 0.2) res = truco.act(full, p.turn, { a: 'truco' });
      else res = truco.act(full, p.turn, { a: 'play', c: full.hands[p.turn][0] });
      expect(res).not.toBeNull();
      expect(truco.isValidPublic(res.full.pub)).toBe(true);
      full = res.full;
    }
    expect(full.pub.phase).toBe('over');
    expect(Math.max(...full.pub.score)).toBe(12);
    expect(hands).toBeGreaterThan(1);
  });
});

describe('alvo de arremesso', async () => {
  const { advanceThrown, dartScore } = await import('../../src/renderer/services/room3d/throwables');
  const { DARTBOARD } = await import('../../src/renderer/services/room3d/layout');
  const { decode, encodeDart } = await import('../../src/renderer/services/room3d/protocol');
  // bola em linha reta (gravidade 0) para mirar exatamente
  const ball = (dz, dy) => ({ id: 'o0', x: DARTBOARD.x - 4, y: DARTBOARD.y + dy, z: DARTBOARD.z + dz, vx: 12, vy: 0, vz: 0, moving: true, thrower: 'ana', ver: 1 });
  const fly = (o) => {
    let total = 0;
    for (let i = 0; i < 120; i++) {
      const res = advanceThrown(o, 1 / 60, 0, [], 'ana');
      total += res.dart;
      o = res.obj;
    }
    return { total, o };
  };

  it('faixas: mosca vale 50 e a borda 1', () => {
    expect(dartScore(0)).toBe(50);
    expect(dartScore(0.2)).toBe(10);
    expect(dartScore(0.45)).toBe(1);
    expect(dartScore(0.6)).toBe(0);
  });

  it('no centro faz 50 uma vez só e a bola volta; fora do disco não pontua', () => {
    const hit = fly(ball(0, 0));
    expect(hit.total).toBe(50);
    expect(hit.o.x).toBeLessThan(DARTBOARD.x);
    expect(fly(ball(0, 0.3)).total).toBe(5);
    expect(fly(ball(0.9, 0)).total).toBe(0);
  });

  it('mensagem de acerto só aceita os pontos das faixas', () => {
    expect(decode(encodeDart('o0', 25))).toMatchObject({ type: 'dart', score: 25 });
    expect(decode(encodeDart('o0', 999))).toBeNull();
  });
});
