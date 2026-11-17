// Lig 4: grade de 7 colunas x 6 linhas. Tabuleiro: string de 42 casas (linha 0 em cima):
// '.' vazia, 'a' do jogador 0 (vermelho, começa) e 'b' do jogador 1 (amarelo).
// A peça cai até a casa vazia mais baixa da coluna; vence quem alinhar 4 (linha, coluna ou diagonal).

export const COLS = 7;
export const ROWS = 6;
const PIECE = ['a', 'b'];

export const initialBoard = () => '.'.repeat(COLS * ROWS);
export const isValidBoard = (b) => typeof b === 'string' && b.length === COLS * ROWS && /^[.ab]+$/.test(b);

/** Linha onde a peça cai na coluna `col`, ou -1 se estiver cheia. */
export function dropRow(board, col) {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1;
  for (let r = ROWS - 1; r >= 0; r--) if (board[r * COLS + col] === '.') return r;
  return -1;
}

/** Joga na coluna; devolve { board, index } ou null se for ilegal. */
export function play(board, side, col) {
  const r = dropRow(board, col);
  if (r < 0) return null;
  const b = board.split('');
  b[r * COLS + col] = PIECE[side];
  return { board: b.join(''), index: r * COLS + col };
}

/** As 4 casas alinhadas que passam pela casa `index`, se houver. */
export function lineThrough(board, index) {
  const piece = board[index];
  if (piece === '.') return null;
  const r0 = Math.floor(index / COLS);
  const c0 = index % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [index];
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === piece) {
        cells.push(r * COLS + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (cells.length >= 4) return cells.sort((a, b) => a - b);
  }
  return null;
}

/** Resultado depois da jogada em `index` por `side`. */
export function status(board, side, index) {
  const line = lineThrough(board, index);
  if (line) return { over: true, winner: side, line };
  if (!board.includes('.')) return { over: true, winner: -1, line: null };
  return { over: false, winner: null, line: null };
}
