// Damas, regra brasileira (tabuleiro 8x8):
//  * peças andam uma casa na diagonal para a frente e capturam para a frente e para trás;
//  * captura é obrigatória e vale a lei da maioria (a jogada que captura mais peças);
//  * a dama anda e captura à distância ("dama voadora");
//  * a peça só vira dama se terminar a jogada na última fileira.
//
// Tabuleiro: string de 64 casas (linha 0 em cima). '.' vazio, 'w'/'b' peças
// (brancas/pretas) e 'W'/'B' damas. As brancas (jogador 0) começam embaixo e sobem.

export const SIZE = 8;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export function initialBoard() {
  let s = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const dark = (r + c) % 2 === 1;
      s += dark && r < 3 ? 'b' : dark && r > 4 ? 'w' : '.';
    }
  }
  return s;
}

const at = (b, r, c) => (r < 0 || c < 0 || r >= SIZE || c >= SIZE ? null : b[r * SIZE + c]);
const sideOf = (p) => (p === 'w' || p === 'W' ? 0 : p === 'b' || p === 'B' ? 1 : -1);
const isKing = (p) => p === 'W' || p === 'B';
const setAt = (arr, r, c, v) => { arr[r * SIZE + c] = v; };

/** Sequências de captura a partir de (r, c). Cada uma: { path: [[r,c]...], captured: [[r,c]...] }. */
function captureSequences(board, r, c, piece, captured = [], path = [[r, c]]) {
  const side = sideOf(piece);
  const results = [];
  const taken = (rr, cc) => captured.some(([a, b]) => a === rr && b === cc);
  for (const [dr, dc] of DIRS) {
    if (isKing(piece)) {
      // anda até achar uma peça adversária com casa vazia depois
      let rr = r + dr;
      let cc = c + dc;
      while (at(board, rr, cc) === '.') {
        rr += dr;
        cc += dc;
      }
      const target = at(board, rr, cc);
      if (!target || sideOf(target) !== 1 - side || taken(rr, cc)) continue;
      let lr = rr + dr;
      let lc = cc + dc;
      while (at(board, lr, lc) === '.') {
        const nextCaptured = [...captured, [rr, cc]];
        const nextPath = [...path, [lr, lc]];
        const more = captureSequences(board, lr, lc, piece, nextCaptured, nextPath);
        if (more.length) results.push(...more);
        else results.push({ path: nextPath, captured: nextCaptured });
        lr += dr;
        lc += dc;
      }
    } else {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      const mid = at(board, mr, mc);
      if (!mid || sideOf(mid) !== 1 - side || taken(mr, mc) || at(board, lr, lc) !== '.') continue;
      const nextCaptured = [...captured, [mr, mc]];
      const nextPath = [...path, [lr, lc]];
      const more = captureSequences(board, lr, lc, piece, nextCaptured, nextPath);
      if (more.length) results.push(...more);
      else results.push({ path: nextPath, captured: nextCaptured });
    }
  }
  return results;
}

/**
 * Todas as jogadas legais do lado `side` (0 = brancas, 1 = pretas).
 * Para pesquisar a captura, a peça que está capturando sai da casa de origem
 * (pode passar por ela de novo) e as capturadas só saem no fim (não dá para pular duas vezes).
 */
export function legalMoves(board, side) {
  const captures = [];
  const simple = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = at(board, r, c);
      if (sideOf(p) !== side) continue;
      const lifted = board.slice(0, r * SIZE + c) + '.' + board.slice(r * SIZE + c + 1);
      captures.push(...captureSequences(lifted, r, c, p));
      if (isKing(p)) {
        for (const [dr, dc] of DIRS) {
          let rr = r + dr;
          let cc = c + dc;
          while (at(board, rr, cc) === '.') {
            simple.push({ path: [[r, c], [rr, cc]], captured: [] });
            rr += dr;
            cc += dc;
          }
        }
      } else {
        const fwd = side === 0 ? -1 : 1;
        for (const dc of [-1, 1]) {
          if (at(board, r + fwd, c + dc) === '.') simple.push({ path: [[r, c], [r + fwd, c + dc]], captured: [] });
        }
      }
    }
  }
  if (captures.length) {
    const max = Math.max(...captures.map((m) => m.captured.length));
    return captures.filter((m) => m.captured.length === max);
  }
  return simple;
}

export function applyMove(board, move) {
  const arr = board.split('');
  const [r0, c0] = move.path[0];
  const [r1, c1] = move.path[move.path.length - 1];
  const piece = arr[r0 * SIZE + c0];
  setAt(arr, r0, c0, '.');
  move.captured.forEach(([r, c]) => setAt(arr, r, c, '.'));
  let placed = piece;
  if (piece === 'w' && r1 === 0) placed = 'W';
  if (piece === 'b' && r1 === SIZE - 1) placed = 'B';
  setAt(arr, r1, c1, placed);
  return arr.join('');
}

const samePath = (a, b) => a.length === b.length && a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);

/** Confere uma jogada (caminho de casas) contra as legais. Devolve a jogada completa ou null. */
export function findMove(board, side, path) {
  return legalMoves(board, side).find((m) => samePath(m.path, path)) || null;
}

/** Situação depois de uma jogada: quem joga agora e se acabou. */
export function status(board, toMove) {
  const counts = [0, 0];
  for (const p of board) {
    const s = sideOf(p);
    if (s >= 0) counts[s] += 1;
  }
  if (counts[toMove] === 0 || legalMoves(board, toMove).length === 0) return { over: true, winner: 1 - toMove, counts };
  return { over: false, winner: null, counts };
}

export const isValidBoard = (b) => typeof b === 'string' && b.length === SIZE * SIZE && /^[.wbWB]+$/.test(b);
