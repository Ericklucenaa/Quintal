// Xadrez: as regras (xeque, roque, en passant, promoção, empates) vêm do chess.js.
// O estado sincronizado é só a FEN e o último lance.
import { Chess, validateFen } from 'chess.js';

export const START_FEN = new Chess().fen();

export function isValidFen(fen) {
  return typeof fen === 'string' && fen.length <= 100 && validateFen(fen).ok;
}

/** 0 = brancas, 1 = pretas. */
export const turnOf = (fen) => (fen.split(' ')[1] === 'b' ? 1 : 0);

/** Lances legais a partir de uma casa ('e2' → [{ to, promotion }]). */
export function movesFrom(fen, square) {
  const game = new Chess(fen);
  return game.moves({ square, verbose: true }).map((m) => ({ to: m.to, promotion: m.promotion || null, san: m.san }));
}

/** Aplica um lance; devolve { fen, san, from, to } ou null se for ilegal. */
export function play(fen, { from, to, promotion }) {
  const game = new Chess(fen);
  try {
    const m = game.move({ from, to, promotion: promotion || 'q' });
    return { fen: game.fen(), san: m.san, from: m.from, to: m.to };
  } catch {
    return null;
  }
}

/** Fim de jogo: { over, winner (0|1|null), reason }. */
export function outcome(fen) {
  const game = new Chess(fen);
  if (game.isCheckmate()) return { over: true, winner: 1 - turnOf(fen), reason: 'xeque-mate' };
  if (game.isStalemate()) return { over: true, winner: null, reason: 'afogamento' };
  if (game.isInsufficientMaterial()) return { over: true, winner: null, reason: 'material insuficiente' };
  if (game.isDraw()) return { over: true, winner: null, reason: 'empate' };
  return { over: false, winner: null, reason: game.inCheck() ? 'xeque' : '' };
}

/** Peças para desenhar: [{ square: 'e1', type: 'k', color: 'w' }]. */
export function pieces(fen) {
  const game = new Chess(fen);
  const out = [];
  game.board().forEach((row) => row.forEach((p) => { if (p) out.push({ square: p.square, type: p.type, color: p.color }); }));
  return out;
}
