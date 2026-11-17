// Reversi (Othello), 8x8. Tabuleiro: string de 64 casas (linha 0 em cima): '.' vazia,
// 'a' peça do jogador 0 (escuras, começam) e 'b' do jogador 1 (claras).
// A jogada coloca uma peça que cerca, em linha reta, peças do adversário; as cercadas viram.
// Sem jogada possível, a vez passa; o jogo acaba quando nenhum dos dois pode jogar.

export const SIZE = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const PIECE = ['a', 'b'];

export function initialBoard() {
  const b = Array(64).fill('.');
  b[3 * 8 + 3] = 'b';
  b[4 * 8 + 4] = 'b';
  b[3 * 8 + 4] = 'a';
  b[4 * 8 + 3] = 'a';
  return b.join('');
}

export const isValidBoard = (b) => typeof b === 'string' && b.length === 64 && /^[.ab]+$/.test(b);

/** Casas viradas por uma jogada em (r, c) do lado `side`; vazio = jogada ilegal. */
export function flipsFor(board, side, r, c) {
  if (board[r * 8 + c] !== '.') return [];
  const me = PIECE[side];
  const other = PIECE[1 - side];
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === other) {
      line.push(rr * 8 + cc);
      rr += dr;
      cc += dc;
    }
    if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === me) flips.push(...line);
  }
  return flips;
}

export function legalMoves(board, side) {
  const out = [];
  for (let i = 0; i < 64; i++) if (flipsFor(board, side, Math.floor(i / 8), i % 8).length) out.push(i);
  return out;
}

/** Aplica a jogada; devolve o tabuleiro novo ou null se for ilegal. */
export function play(board, side, index) {
  if (!Number.isInteger(index) || index < 0 || index > 63) return null;
  const flips = flipsFor(board, side, Math.floor(index / 8), index % 8);
  if (!flips.length) return null;
  const b = board.split('');
  b[index] = PIECE[side];
  flips.forEach((i) => { b[i] = PIECE[side]; });
  return b.join('');
}

export const count = (board) => [board.split('a').length - 1, board.split('b').length - 1];

/**
 * Depois de `side` jogar: quem joga agora e se acabou. Se o adversário não tem jogada, a vez volta
 * para quem jogou; se ninguém tem, acaba e vence quem tiver mais peças (-1 = empate).
 */
export function next(board, side) {
  const other = 1 - side;
  if (legalMoves(board, other).length) return { turn: other, over: false };
  if (legalMoves(board, side).length) return { turn: side, over: false, passed: other };
  const [a, b] = count(board);
  return { turn: other, over: true, winner: a === b ? -1 : a > b ? 0 : 1 };
}
