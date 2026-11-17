import { describe, expect, it } from 'vitest';
import { GameHub } from '../../src/renderer/services/room3d/games/hub';
import { decode, MAX_MESSAGE_BYTES } from '../../src/renderer/services/room3d/protocol';
import { encodeTable } from '../../src/renderer/services/room3d/games/net';
import { legalMoves as reversiMoves } from '../../src/renderer/services/room3d/games/reversi';

/** Liga vários hubs como se estivessem na mesma chamada (mensagens públicas e em particular). */
function network(ids) {
  const wire = [];
  const hubs = Object.fromEntries(ids.map((id) => [id, new GameHub({ myId: id, send: (text, to) => wire.push({ from: id, to: to || null, text }) })]));
  ids.forEach((id) => hubs[id].setPresent(ids));
  const log = [];
  const flush = () => {
    for (let guard = 0; wire.length && guard < 100000; guard++) {
      const m = wire.shift();
      expect(m.text.length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
      log.push(m);
      const msg = decode(m.text);
      expect(msg).not.toBeNull();
      ids.filter((id) => id !== m.from && (!m.to || m.to === id)).forEach((id) => hubs[id].handle(m.from, msg));
    }
  };
  return { hubs, flush, log };
}

describe('mesa de truco (4 jogadores, cartas em particular)', () => {
  it('começa com 4 sentados; cada um recebe só a própria mão; joga até 12 e todos concordam', () => {
    const ids = ['ana', 'bia', 'caio', 'davi'];
    const { hubs, flush, log } = network(ids);
    hubs.bia.setTrucoVariant('truco-1', 'mineiro'); // ninguém sentado ainda: recusado
    ids.forEach((id, seat) => { hubs[id].sit('truco-1', seat); flush(); });
    expect(hubs.davi.get('truco-1').status).toBe('waiting');
    hubs.ana.tick(0.016); // ana (lugar 0) dá as cartas
    flush();

    const table = () => hubs.caio.get('truco-1');
    expect(table().status).toBe('playing');
    expect(table().data.variant).toBe('paulista');

    // mãos em particular: cada mensagem 'gh' vai só para o dono, e só o dealer conhece todas
    const handMsgs = log.filter((m) => m.text.includes('"t":"gh"'));
    expect(handMsgs.length).toBe(3);
    expect(handMsgs.every((m) => m.from === 'ana' && m.to && m.to !== 'ana')).toBe(true);
    const seen = ids.map((id) => hubs[id].myTrucoHand('truco-1').own);
    expect(new Set(seen.flat()).size).toBe(12);
    expect(hubs.bia.truco.size).toBe(0); // só ana guarda o estado completo

    // partida inteira: cada um joga a própria primeira carta quando é a vez; responde e decide quando precisa
    for (let step = 0; step < 4000 && table().status === 'playing'; step++) {
      const p = hubs.ana.get('truco-1').data;
      if (p.phase === 'handover') {
        hubs.ana.handoverAt.set('truco-1', -1e9);
        hubs.ana.tick(0.016);
      } else if (p.phase === 'special') {
        hubs[ids[p.special.team]].trucoAction('truco-1', { a: 'go' });
      } else if (p.phase === 'raise') {
        hubs[ids[(p.raise.seat + 1) % 4]].trucoAction('truco-1', { a: 'accept' });
      } else {
        const who = ids[p.turn];
        const mine = hubs[who].myTrucoHand('truco-1');
        if (p.raisedBy === -1 && step % 7 === 0) hubs[who].trucoAction('truco-1', { a: 'truco' });
        else hubs[who].trucoAction('truco-1', { a: 'play', c: mine.own[0] });
      }
      flush();
    }
    expect(table().status).toBe('over');
    const scores = ids.map((id) => hubs[id].get('truco-1').data.score.join('-'));
    expect(new Set(scores).size).toBe(1);
    expect(Math.max(...hubs.davi.get('truco-1').data.score)).toBe(12);
    expect([0, 1]).toContain(table().winner);
  });

  it('quem não dá as cartas não consegue mudar o jogo nem jogar fora da vez', () => {
    const ids = ['ana', 'bia', 'caio', 'davi'];
    const { hubs, flush, log } = network(ids);
    ids.forEach((id, seat) => { hubs[id].sit('truco-1', seat); flush(); });
    hubs.ana.tick(0.016);
    flush();
    const before = JSON.stringify(hubs.caio.get('truco-1').data);
    // bia forja um estado com placar 11 a 0 e manda para todos
    const forged = { ...hubs.bia.get('truco-1'), v: hubs.bia.get('truco-1').v + 1, by: 'bia', data: { ...hubs.bia.get('truco-1').data, score: [11, 0] } };
    hubs.caio.handle('bia', decode(encodeTable(forged)));
    expect(JSON.stringify(hubs.caio.get('truco-1').data)).toBe(before);
    // ação fora da vez é ignorada por quem dá as cartas
    const p = hubs.ana.get('truco-1').data;
    const notTurn = ids[(p.turn + 1) % 4];
    const card = hubs[notTurn].myTrucoHand('truco-1').own[0];
    const n = log.length;
    hubs[notTurn].trucoAction('truco-1', { a: 'play', c: card });
    flush();
    expect(log.slice(n).some((m) => m.text.includes('"t":"gt"'))).toBe(false);
  });

  it('a variante muda com a mesa parada e vale para a próxima partida', () => {
    const ids = ['ana', 'bia', 'caio', 'davi'];
    const { hubs, flush } = network(ids);
    hubs.bia.sit('truco-1', 1);
    flush();
    expect(hubs.bia.setTrucoVariant('truco-1', 'mineiro')).toBe(true);
    flush();
    ['ana', 'caio', 'davi'].forEach((id) => { hubs[id].sit('truco-1', ids.indexOf(id)); flush(); });
    hubs.ana.tick(0.016);
    flush();
    expect(hubs.davi.get('truco-1').data.variant).toBe('mineiro');
    expect(hubs.davi.get('truco-1').data.value).toBe(2);
    expect(hubs.davi.get('truco-1').data.vira).toBeNull();
  });
});

describe('reversi e lig 4 pela rede', () => {
  it('reversi: lances legais chegam; lance forjado é recusado', () => {
    const { hubs, flush } = network(['ana', 'bia']);
    hubs.ana.sit('reversi-1', 0); flush();
    hubs.bia.sit('reversi-1', 1); flush();
    const first = reversiMoves(hubs.ana.get('reversi-1').data.board, 0)[0];
    expect(hubs.ana.reversiMove('reversi-1', first)).toBe(true);
    flush();
    expect(hubs.bia.get('reversi-1').data).toEqual(hubs.ana.get('reversi-1').data);
    // bia forja uma jogada que não é legal (pinta o tabuleiro todo)
    const t = hubs.bia.get('reversi-1');
    const forged = { ...t, v: t.v + 1, by: 'bia', data: { ...t.data, board: 'b'.repeat(64), turn: 0, last: 0 } };
    hubs.ana.handle('bia', decode(encodeTable(forged)));
    expect(hubs.ana.get('reversi-1').data.board).not.toBe('b'.repeat(64));
  });

  it('lig 4: vitória chega aos dois com a linha vencedora', () => {
    const { hubs, flush } = network(['ana', 'bia']);
    hubs.ana.sit('lig4-1', 0); flush();
    hubs.bia.sit('lig4-1', 1); flush();
    for (const [who, col] of [['ana', 0], ['bia', 6], ['ana', 1], ['bia', 6], ['ana', 2], ['bia', 6], ['ana', 3]]) {
      expect(hubs[who].connect4Move('lig4-1', col)).toBe(true);
      flush();
    }
    const t = hubs.bia.get('lig4-1');
    expect(t.status).toBe('over');
    expect(t.winner).toBe(0);
    expect(t.data.line).toHaveLength(4);
  });
});
