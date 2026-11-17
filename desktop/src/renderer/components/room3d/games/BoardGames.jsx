import React, { useMemo, useState } from 'react';
import { count as reversiCount, legalMoves as reversiMoves } from '../../../services/room3d/games/reversi';
import { COLS, ROWS, dropRow } from '../../../services/room3d/games/connect4';

// ---------------------------------------------------------------------------
// Reversi: clique numa casa marcada para colocar a peça (as cercadas viram).
// ---------------------------------------------------------------------------

export function ReversiBoard({ hub, table, state, mySeat }) {
  const b = state.data?.board;
  const myTurn = state.status === 'playing' && mySeat !== -1 && state.data?.turn === mySeat;
  const legal = useMemo(() => new Set(b && myTurn ? reversiMoves(b, mySeat) : []), [b, myTurn, mySeat]);
  const [dark, light] = b ? reversiCount(b) : [2, 2];
  const last = state.data?.last;
  return (
    <div className="gp-board-wrap">
      <div className="gp-tally" aria-live="polite">
        <span><i className="gp-disc-mini a" /> Escuras <strong>{dark}</strong></span>
        <span><i className="gp-disc-mini b" /> Claras <strong>{light}</strong></span>
      </div>
      <div className="gp-board reversi" role="grid" aria-label="Tabuleiro de Reversi">
        {Array.from({ length: 64 }, (_, i) => {
          const p = b ? b[i] : '.';
          const r = Math.floor(i / 8);
          const c = i % 8;
          const can = legal.has(i);
          const label = `${'abcdefgh'[c]}${8 - r}${p === 'a' ? ' escura' : p === 'b' ? ' clara' : can ? ' jogada possível' : ''}`;
          return (
            <button key={i} className={`gp-cell ${can ? 'target' : ''} ${last === i ? 'last' : ''}`} disabled={!can}
              onClick={() => hub.reversiMove(table.id, i)} aria-label={label}>
              {p !== '.' && <span className={`gp-disc ${p === 'a' ? 'b' : 'w'}`} />}
            </button>
          );
        })}
      </div>
      {state.reason && state.status === 'playing' && <div className="gp-last">{state.reason}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lig 4: clique numa coluna para soltar a peça; ela cai até a casa vazia mais baixa.
// ---------------------------------------------------------------------------

export function Connect4Board({ hub, table, state, mySeat }) {
  const b = state.data?.board || '.'.repeat(COLS * ROWS);
  const myTurn = state.status === 'playing' && mySeat !== -1 && state.data?.turn === mySeat;
  const [hover, setHover] = useState(null);
  const line = new Set(state.data?.line || []);
  const last = state.data?.last;
  const drop = (col) => { if (myTurn && dropRow(b, col) >= 0) hub.connect4Move(table.id, col); };
  const ghostRow = hover !== null && myTurn ? dropRow(b, hover) : -1;
  return (
    <div className="gp-board-wrap">
      <div className="gp-c4" role="grid" aria-label="Grade do Lig 4" onPointerLeave={() => setHover(null)}>
        {Array.from({ length: COLS }, (_, col) => (
          <button key={col} className="gp-c4-col" disabled={!myTurn || dropRow(b, col) < 0} onClick={() => drop(col)}
            onPointerEnter={() => setHover(col)} onFocus={() => setHover(col)} aria-label={`Soltar na coluna ${col + 1}`}>
            {Array.from({ length: ROWS }, (__, row) => {
              const i = row * COLS + col;
              const p = b[i];
              const ghost = row === ghostRow && hover === col;
              return (
                <span key={row} className={`gp-c4-cell ${line.has(i) ? 'win' : ''} ${last === i ? 'last' : ''}`}>
                  {p !== '.' && <i className={`gp-c4-disc ${p}`} />}
                  {ghost && <i className={`gp-c4-disc ${mySeat === 0 ? 'a' : 'b'} ghost`} />}
                </span>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
