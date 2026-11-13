import { describe, expect, it } from 'vitest';
import { applyMove, findMove, initialBoard, legalMoves, status as checkersStatus } from '../../src/renderer/services/room3d/games/checkers';
import { START_FEN, movesFrom, outcome, play } from '../../src/renderer/services/room3d/games/chess';
import { applyRules, canPlaceCue, newPoolData, rack, simulateShot, TABLE } from '../../src/renderer/services/room3d/games/pool';
import { createPingPong, stepPingPong, scorePingPong, createFoosball, stepFoosball, rodMen, RODS, FB } from '../../src/renderer/services/room3d/games/realtime';
import { decodeGameMessage, encodeTable, encodeShot, encodeInput } from '../../src/renderer/services/room3d/games/net';
import { GameHub } from '../../src/renderer/services/room3d/games/hub';
import { decode } from '../../src/renderer/services/room3d/protocol';

const board = (rows) => rows.join('').replace(/ /g, '');
const emptyRows = () => Array.from({ length: 8 }, () => '........');

describe('damas (regra brasileira)', () => {
  it('saída: 12 peças de cada lado e 7 jogadas para as brancas', () => {
    const b = initialBoard();
    expect(b.split('').filter((c) => c === 'w')).toHaveLength(12);
    expect(b.split('').filter((c) => c === 'b')).toHaveLength(12);
    expect(legalMoves(b, 0)).toHaveLength(7);
  });

  it('captura é obrigatória e peça captura para trás', () => {
    const rows = emptyRows();
    rows[4] = '...w....'; // branca em (4,3)
    rows[5] = '..b.....'; // preta atrás dela, em (5,2), com (6,1) vazia
    const moves = legalMoves(board(rows), 0);
    expect(moves).toHaveLength(1);
    expect(moves[0].captured).toEqual([[5, 2]]);
  });

  it('lei da maioria: só vale a sequência que captura mais', () => {
    const rows = emptyRows();
    rows[7] = 'w.......'; // (7,0)
    rows[6] = '.b......'; // captura simples para (5,2)
    rows[4] = '.b.b....'; // depois mais uma (4,3) para (3,4)
    rows[2] = '.....b..'; // e mais uma (2,5) para (1,6)
    const moves = legalMoves(board(rows), 0);
    expect(moves.every((m) => m.captured.length === 3)).toBe(true);
  });

  it('dama voadora anda e captura de longe', () => {
    const rows = emptyRows();
    rows[7] = 'W.......';
    rows[3] = '....b...';
    const moves = legalMoves(board(rows), 0);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.captured.length === 1)).toBe(true);
    expect(moves.some((m) => m.path[1][0] === 2 && m.path[1][1] === 5)).toBe(true);
  });

  it('peça que termina na última fileira vira dama; sem peças, o outro vence', () => {
    const rows = emptyRows();
    rows[1] = '..w.....';
    const b = board(rows);
    const move = findMove(b, 0, [[1, 2], [0, 1]]);
    expect(move).not.toBeNull();
    const after = applyMove(b, move);
    expect(after[1]).toBe('W');
    expect(checkersStatus(after, 1)).toMatchObject({ over: true, winner: 0 });
  });
});

describe('xadrez', () => {
  it('lances legais e mate do pastor rápido (tolo)', () => {
    expect(movesFrom(START_FEN, 'e2').map((m) => m.to).sort()).toEqual(['e3', 'e4']);
    let fen = START_FEN;
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) fen = play(fen, { from, to }).fen;
    expect(outcome(fen)).toMatchObject({ over: true, winner: 1, reason: 'xeque-mate' });
    expect(play(START_FEN, { from: 'e2', to: 'e5' })).toBeNull();
  });
});

describe('sinuca', () => {
  it('a mesma tacada dá o mesmo resultado em qualquer máquina (determinística)', () => {
    const shot = { angle: 0.01, power: 4 };
    const a = simulateShot(rack(), shot);
    const b = simulateShot(rack(), shot);
    expect(a).toEqual(b);
    expect(a.firstHit).not.toBeNull();
    a.balls.forEach((x) => {
      if (!x.in) {
        expect(Math.abs(x.x)).toBeLessThanOrEqual(TABLE.L / 2);
        expect(Math.abs(x.z)).toBeLessThanOrEqual(TABLE.W / 2);
      }
    });
  });

  it('branca na caçapa é falta: vez do outro com bola na mão', () => {
    const data = newPoolData();
    const res = applyRules(data, 0, { balls: data.balls.map((b) => (b.id === 0 ? { ...b, in: true } : b)), potted: [0], firstHit: 3 });
    expect(res.data.turn).toBe(1);
    expect(res.data.ballInHand).toBe(true);
    expect(res.data.balls[0].in).toBe(false);
  });

  it('encaçapar a primeira bola define o grupo e dá mais uma tacada', () => {
    const data = newPoolData();
    const balls = data.balls.map((b) => (b.id === 3 ? { ...b, in: true } : b));
    const res = applyRules(data, 0, { balls, potted: [3], firstHit: 1 });
    expect(res.data.groups).toEqual(['lisas', 'listradas']);
    expect(res.data.turn).toBe(0);
  });

  it('a 8 antes da hora perde o jogo', () => {
    const data = newPoolData();
    const res = applyRules(data, 1, { balls: data.balls.map((b) => (b.id === 8 ? { ...b, in: true } : b)), potted: [8], firstHit: 8 });
    expect(res).toMatchObject({ over: true, winner: 0 });
  });

  it('bola na mão não pode ficar em cima de outra', () => {
    const balls = rack();
    expect(canPlaceCue(balls, balls[5].x, balls[5].z)).toBe(false);
    expect(canPlaceCue(balls, -0.8, 0.3)).toBe(true);
  });
});

describe('ping-pong e totó', () => {
  it('saque sai sozinho e a bola que ninguém rebate vira ponto', () => {
    const sim = createPingPong();
    sim.paddles = [0, 1.0]; // B longe da bola
    let scorer = null;
    for (let i = 0; i < 240 * 6 && scorer === null; i++) scorer = stepPingPong(sim, 1 / 240, 0);
    expect(scorer).toBe(0);
  });

  it('placar do ping-pong: 11 com 2 de vantagem', () => {
    let data = { score: [10, 10], server: 0, target: 11 };
    let r = scorePingPong(data, 0);
    expect(r.over).toBe(false);
    data = r.data;
    r = scorePingPong(data, 0);
    expect(r).toMatchObject({ over: true, winner: 0 });
  });

  it('bonecos ficam dentro do campo e a bola sai do meio depois do gol', () => {
    RODS.forEach((rod) => [-1, 1].forEach((u) => rodMen(rod, u).forEach((z) => expect(Math.abs(z)).toBeLessThan(FB.W / 2))));
    const sim = createFoosball();
    for (let i = 0; i < 240; i++) stepFoosball(sim, 1 / 240);
    expect(Math.abs(sim.ball.vz)).toBeGreaterThan(0);
  });
});

describe('mensagens das mesas', () => {
  it('ida e volta do estado de cada jogo', () => {
    const hub = new GameHub({ myId: 'a', send: () => {} });
    ['xadrez-1', 'damas-1', 'sinuca', 'pingpong', 'toto'].forEach((id) => {
      hub.tables.set(id, { ...hub.get(id), players: ['a', 'b'] });
      hub.rematch(id);
      const msg = decode(encodeTable(hub.get(id)));
      expect(msg?.type, id).toBe('table');
      expect(msg.table.data).toEqual(id === 'sinuca' ? expect.any(Object) : hub.get(id).data);
      expect(encodeTable(hub.get(id)).length).toBeLessThan(1024);
    });
  });

  it('rejeita mesa inexistente, FEN inválida e usuário forjado', () => {
    expect(decodeGameMessage({ t: 'gt', g: 'mesa-x', r: 1, b: 'a', p: ['', ''], s: 'waiting', d: null })).toBeNull();
    expect(decodeGameMessage({ t: 'gt', g: 'xadrez-1', r: 1, b: 'a', p: ['', ''], s: 'playing', d: { f: 'lixo' } })).toBeNull();
    expect(decodeGameMessage({ t: 'gt', g: 'xadrez-1', r: 1, b: '<x>', p: ['', ''], s: 'waiting', d: null })).toBeNull();
    expect(decode(encodeShot('xadrez-1', 1, { angle: 0, power: 1 }))).toBeNull();
    expect(decode(encodeInput('pingpong', 0.5, true))).toMatchObject({ type: 'input', u: 0.5, kick: true });
  });
});

describe('mesas sincronizadas entre duas pessoas', () => {
  const pair = () => {
    const wire = [];
    const a = new GameHub({ myId: 'alice', send: (text) => wire.push(['alice', text]) });
    const b = new GameHub({ myId: 'bruno', send: (text) => wire.push(['bruno', text]) });
    [a, b].forEach((h) => h.setPresent(['alice', 'bruno']));
    const flush = () => {
      while (wire.length) {
        const [from, text] = wire.shift();
        const msg = decode(text);
        (from === 'alice' ? b : a).handle(from, msg);
      }
    };
    return { a, b, flush };
  };

  it('sentar, jogar xadrez e recusar lance fora da vez', () => {
    const { a, b, flush } = pair();
    a.sit('xadrez-1', 0);
    flush();
    b.sit('xadrez-1', 1);
    flush();
    expect(a.get('xadrez-1').status).toBe('playing');
    expect(b.chessMove('xadrez-1', { from: 'e7', to: 'e5' })).toBe(false); // vez das brancas
    expect(a.chessMove('xadrez-1', { from: 'e2', to: 'e4' })).toBe(true);
    flush();
    expect(b.get('xadrez-1').data.fen).toBe(a.get('xadrez-1').data.fen);
    // trapaça: Bruno manda um estado com lance ilegal
    const cur = b.get('xadrez-1');
    const forged = { ...cur, v: cur.v + 1, by: 'bruno', data: { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', last: { from: 'e7', to: 'e1' }, san: '' } };
    a.handle('bruno', { type: 'table', table: forged });
    expect(a.get('xadrez-1').data.fen).toBe(cur.data.fen);
  });

  it('ninguém tira outra pessoa do lugar', () => {
    const { a, b, flush } = pair();
    a.sit('damas-1', 0);
    flush();
    expect(b.sit('damas-1', 0)).toBe(false);
    const cur = b.get('damas-1');
    a.handle('bruno', { type: 'table', table: { ...cur, v: cur.v + 1, by: 'bruno', players: ['bruno', null] } });
    expect(a.get('damas-1').players[0]).toBe('alice');
  });

  it('a tacada da sinuca dá o mesmo resultado nos dois lados', () => {
    const { a, b, flush } = pair();
    a.sit('sinuca', 0);
    flush();
    b.sit('sinuca', 1);
    flush();
    expect(a.poolShot('sinuca', { angle: 0.02, power: 3.8 })).toBe(true);
    flush();
    expect(b.get('sinuca').data.balls).toEqual(a.get('sinuca').data.balls);
    expect(b.get('sinuca').v).toBe(a.get('sinuca').v);
  });

  it('duas pessoas sentando ao mesmo tempo: as duas ficam sentadas e o jogo começa', () => {
    const { a, b, flush } = pair();
    a.sit('sinuca', 0);
    b.sit('sinuca', 1); // antes de receber a mensagem de Alice
    flush();
    flush();
    expect(a.get('sinuca').players).toEqual(['alice', 'bruno']);
    expect(b.get('sinuca').players).toEqual(['alice', 'bruno']);
    expect(a.get('sinuca').status).toBe('playing');
    expect(b.get('sinuca').v).toBe(a.get('sinuca').v);
  });

  it('quem sai da chamada libera o lugar', () => {
    const { a, flush } = pair();
    a.sit('pingpong', 0);
    flush();
    a.setPresent(['alice']);
    a.tables.set('pingpong', { ...a.get('pingpong'), players: ['alice', 'bruno'] });
    a.setPresent(['alice']);
    expect(a.get('pingpong').players).toEqual(['alice', null]);
  });
});
