import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { X, Flag, RotateCcw, LogOut, Armchair } from 'lucide-react';
import { tableById } from '../../../services/room3d/layout';
import { turnIndex } from '../../../services/room3d/games/hub';
import { movesFrom, pieces as chessPieces, outcome as chessOutcome } from '../../../services/room3d/games/chess';
import { legalMoves as checkersMoves } from '../../../services/room3d/games/checkers';
import { BALL_COLORS, BALL_R, MAX_POWER, POCKETS, POCKET_R, TABLE as POOL, canPlaceCue, groupOf } from '../../../services/room3d/games/pool';
import { FB, PP, RODS, rodMen } from '../../../services/room3d/games/realtime';

const SEAT_LABELS = {
  chess: ['Brancas', 'Pretas'],
  checkers: ['Brancas', 'Pretas'],
  pool: ['Jogador 1', 'Jogador 2'],
  pingpong: ['Vermelho', 'Preto'],
  foosball: ['Vermelho', 'Azul']
};
const GLYPHS = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };

function useHub(hub) {
  const [, force] = useReducer((n) => n + 1, 0);
  useEffect(() => hub.subscribe(force), [hub]);
}

// ---------------------------------------------------------------------------
// Xadrez
// ---------------------------------------------------------------------------

function ChessBoard({ hub, table, state, mySeat }) {
  const [selected, setSelected] = useState(null);
  const [promo, setPromo] = useState(null); // { from, to }
  const fen = state.data?.fen;
  const flip = mySeat === 1;
  const myTurn = state.status === 'playing' && mySeat !== -1 && turnIndex(state) === mySeat;
  const board = useMemo(() => {
    const map = new Map();
    if (fen) chessPieces(fen).forEach((p) => map.set(p.square, p));
    return map;
  }, [fen]);
  const targets = useMemo(() => (selected && fen ? movesFrom(fen, selected) : []), [selected, fen]);
  useEffect(() => { setSelected(null); setPromo(null); }, [fen]);
  const myColor = mySeat === 0 ? 'w' : 'b';
  const last = state.data?.last;
  const check = fen && chessOutcome(fen).reason === 'xeque';
  const kingInCheck = check ? [...board.values()].find((p) => p.type === 'k' && p.color === (fen.split(' ')[1])) : null;

  const click = (sq) => {
    if (!myTurn) return;
    const piece = board.get(sq);
    const target = targets.find((t) => t.to === sq);
    if (selected && target) {
      if (target.promotion) setPromo({ from: selected, to: sq });
      else hub.chessMove(table.id, { from: selected, to: sq });
      setSelected(null);
      return;
    }
    setSelected(piece && piece.color === myColor ? sq : null);
  };

  const ranks = flip ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flip ? 'hgfedcba'.split('') : 'abcdefgh'.split('');
  return (
    <div className="gp-board-wrap">
      <div className="gp-board chess" role="grid" aria-label="Tabuleiro de xadrez">
        {ranks.map((r) => files.map((f) => {
          const sq = `${f}${r}`;
          const p = board.get(sq);
          const dark = (f.charCodeAt(0) - 97 + r) % 2 === 0;
          const isTarget = targets.some((t) => t.to === sq);
          const cls = ['gp-cell', dark ? 'dark' : 'light', selected === sq && 'sel', isTarget && (p ? 'capture' : 'target'),
            last && (last.from === sq || last.to === sq) && 'last', kingInCheck?.square === sq && 'check'].filter(Boolean).join(' ');
          return (
            <button key={sq} className={cls} onClick={() => click(sq)} aria-label={`${sq}${p ? ` ${p.color === 'w' ? 'branca' : 'preta'} ${p.type}` : ''}`}>
              {p && <span className={`gp-piece ${p.color}`}>{GLYPHS[p.color][p.type]}</span>}
              {f === files[0] && <i className="gp-rank">{r}</i>}
              {r === ranks[7] && <i className="gp-file">{f}</i>}
            </button>
          );
        }))}
      </div>
      {promo && (
        <div className="gp-promo" role="dialog" aria-label="Promover peão">
          <span>Promover para</span>
          {['q', 'r', 'b', 'n'].map((t) => (
            <button key={t} onClick={() => { hub.chessMove(table.id, { ...promo, promotion: t }); setPromo(null); }}>
              <span className={`gp-piece ${myColor}`}>{GLYPHS[myColor][t]}</span>
            </button>
          ))}
          <button className="gp-promo-cancel" onClick={() => setPromo(null)}>cancelar</button>
        </div>
      )}
      {state.data?.san && <div className="gp-last">Último lance: <strong>{state.data.san}</strong></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Damas
// ---------------------------------------------------------------------------

function CheckersBoard({ hub, table, state, mySeat }) {
  const [path, setPath] = useState([]);
  const b = state.data?.board;
  const flip = mySeat === 1;
  const myTurn = state.status === 'playing' && mySeat !== -1 && state.data?.turn === mySeat;
  const legal = useMemo(() => (b && myTurn ? checkersMoves(b, mySeat) : []), [b, myTurn, mySeat]);
  useEffect(() => setPath([]), [b]);
  const same = (a, c) => a[0] === c[0] && a[1] === c[1];
  const candidates = legal.filter((m) => path.every((sq, i) => m.path[i] && same(m.path[i], sq)));
  const nextSquares = path.length ? candidates.map((m) => m.path[path.length]).filter(Boolean) : [];
  const starts = new Set(legal.map((m) => `${m.path[0][0]},${m.path[0][1]}`));
  const last = state.data?.last || [];
  const mustCapture = legal.length > 0 && legal[0].captured.length > 0;

  const click = (r, c) => {
    if (!myTurn) return;
    if (starts.has(`${r},${c}`) && (path.length <= 1)) {
      setPath([[r, c]]);
      return;
    }
    if (!nextSquares.some((sq) => same(sq, [r, c]))) return;
    const nextPath = [...path, [r, c]];
    const done = candidates.find((m) => m.path.length === nextPath.length && m.path.every((sq, i) => same(sq, nextPath[i])));
    if (done) hub.checkersMove(table.id, done.path);
    else setPath(nextPath);
  };

  const rows = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="gp-board-wrap">
      <div className="gp-board checkers" role="grid" aria-label="Tabuleiro de damas">
        {rows.map((r) => cols.map((c) => {
          const ch = b ? b[r * 8 + c] : '.';
          const dark = (r + c) % 2 === 1;
          const inPath = path.some((sq) => same(sq, [r, c]));
          const isNext = nextSquares.some((sq) => same(sq, [r, c]));
          const canStart = myTurn && starts.has(`${r},${c}`) && !path.length;
          const wasLast = last.some((sq) => same(sq, [r, c]));
          const cls = ['gp-cell', dark ? 'dark' : 'light', inPath && 'sel', isNext && 'target', canStart && 'movable', wasLast && 'last'].filter(Boolean).join(' ');
          return (
            <button key={`${r}-${c}`} className={cls} onClick={() => click(r, c)} disabled={!dark} aria-label={`casa ${r + 1}-${c + 1}`}>
              {ch !== '.' && <span className={`gp-disc ${ch === 'w' || ch === 'W' ? 'w' : 'b'} ${ch === 'W' || ch === 'B' ? 'king' : ''}`} />}
            </button>
          );
        }))}
      </div>
      {myTurn && mustCapture && <div className="gp-last">Captura obrigatória{legal[0].captured.length > 1 ? ` (${legal[0].captured.length} peças, lei da maioria)` : ''}.</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sinuca
// ---------------------------------------------------------------------------

function PoolTable({ hub, table, state, mySeat }) {
  const canvasRef = useRef(null);
  const aim = useRef({ angle: 0, pulling: false, startX: 0, startY: 0, power: 0, cue: null, mouse: null });
  const [power, setPower] = useState(0);
  const myTurn = state.status === 'playing' && mySeat !== -1 && state.data?.turn === mySeat;
  const ballInHand = myTurn && state.data?.ballInHand;
  const [placing, setPlacing] = useState(false);
  useEffect(() => {
    setPlacing(Boolean(ballInHand));
    aim.current.cue = null;
  }, [ballInHand, state.v]);

  // desenho contínuo (bolas rolando)
  useEffect(() => {
    let raf;
    const draw = () => {
      const c = canvasRef.current;
      if (c) {
        const g = c.getContext('2d');
        const W = c.width;
        const H = c.height;
        const pad = 26;
        const sx = (W - pad * 2) / POOL.L;
        const toPx = (x, z) => [W / 2 + x * sx, H / 2 + z * sx];
        g.fillStyle = '#4a2a18';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#1f6b45';
        g.fillRect(pad, pad, W - pad * 2, H - pad * 2);
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.moveTo(W / 2 - (POOL.L / 4) * sx, pad);
        g.lineTo(W / 2 - (POOL.L / 4) * sx, H - pad);
        g.stroke();
        POCKETS.forEach(([x, z, kind]) => {
          const [px, pz] = toPx(x, z);
          g.fillStyle = '#0b0b0b';
          g.beginPath();
          g.arc(px, pz, POCKET_R[kind] * sx, 0, Math.PI * 2);
          g.fill();
        });
        const balls = hub.poolBalls(table.id);
        const animating = hub.isAnimating(table.id);
        const a = aim.current;
        const cueBall = balls[0];
        const cuePos = a.cue || (cueBall && !cueBall.in ? cueBall : null);
        balls.forEach((b) => {
          if (b.in) return;
          if (b.id === 0 && a.cue && !animating) return;
          const [px, pz] = toPx(b.x, b.z);
          const r = BALL_R * sx;
          g.fillStyle = b.id > 8 ? '#f4f1e8' : BALL_COLORS[b.id];
          g.beginPath();
          g.arc(px, pz, r, 0, Math.PI * 2);
          g.fill();
          if (b.id > 8) {
            g.save();
            g.beginPath();
            g.arc(px, pz, r, 0, Math.PI * 2);
            g.clip();
            g.fillStyle = BALL_COLORS[b.id];
            g.fillRect(px - r, pz - r * 0.45, r * 2, r * 0.9);
            g.restore();
          }
          if (b.id > 0) {
            g.fillStyle = '#f4f1e8';
            g.beginPath();
            g.arc(px, pz, r * 0.42, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#111';
            g.font = `600 ${Math.round(r * 0.75)}px system-ui, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(b.id), px, pz + 0.5);
          }
        });
        if (a.cue && !animating) {
          const [px, pz] = toPx(a.cue.x, a.cue.z);
          g.globalAlpha = placing ? 0.6 : 1;
          g.fillStyle = '#f4f1e8';
          g.beginPath();
          g.arc(px, pz, BALL_R * sx, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        }
        // mira
        if (myTurn && !animating && !placing && cuePos) {
          const [cx, cz] = toPx(cuePos.x, cuePos.z);
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.setLineDash([6, 6]);
          g.beginPath();
          g.moveTo(cx, cz);
          g.lineTo(cx + Math.cos(a.angle) * 420, cz + Math.sin(a.angle) * 420);
          g.stroke();
          g.setLineDash([]);
          const back = 14 + a.power * 26;
          g.strokeStyle = '#d9b36c';
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(cx - Math.cos(a.angle) * back, cz - Math.sin(a.angle) * back);
          g.lineTo(cx - Math.cos(a.angle) * (back + 150), cz - Math.sin(a.angle) * (back + 150));
          g.stroke();
          g.lineWidth = 1;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hub, table.id, myTurn, placing]);

  const toTable = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * c.width;
    const pz = ((e.clientY - rect.top) / rect.height) * c.height;
    const sx = (c.width - 52) / POOL.L;
    return { x: (px - c.width / 2) / sx, z: (pz - c.height / 2) / sx };
  };

  const onMove = (e) => {
    if (!myTurn || hub.isAnimating(table.id)) return;
    const p = toTable(e);
    const a = aim.current;
    if (placing) {
      a.cue = { x: Math.max(-POOL.L / 2 + BALL_R, Math.min(POOL.L / 2 - BALL_R, p.x)), z: Math.max(-POOL.W / 2 + BALL_R, Math.min(POOL.W / 2 - BALL_R, p.z)) };
      return;
    }
    if (a.pulling) {
      const dist = Math.hypot(e.clientX - a.startX, e.clientY - a.startY);
      a.power = Math.min(1, dist / 160);
      setPower(a.power);
      return;
    }
    const balls = hub.poolBalls(table.id);
    const cue = a.cue || balls[0];
    a.angle = Math.atan2(p.z - cue.z, p.x - cue.x);
  };
  const onDown = (e) => {
    if (!myTurn || hub.isAnimating(table.id)) return;
    const a = aim.current;
    if (placing) {
      if (a.cue && canPlaceCue(state.data.balls, a.cue.x, a.cue.z)) setPlacing(false);
      return;
    }
    a.pulling = true;
    a.startX = e.clientX;
    a.startY = e.clientY;
    a.power = 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onUp = () => {
    const a = aim.current;
    if (!a.pulling) return;
    a.pulling = false;
    if (a.power > 0.04) {
      hub.poolShot(table.id, { angle: a.angle, power: a.power * MAX_POWER, cueX: a.cue ? a.cue.x : null, cueZ: a.cue ? a.cue.z : null });
      a.cue = null;
    }
    a.power = 0;
    setPower(0);
  };

  const groups = state.data?.groups || [null, null];
  return (
    <div className="gp-pool">
      <canvas
        ref={canvasRef}
        width={640}
        height={352}
        className={`gp-canvas ${myTurn ? 'active' : ''}`}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerUp={onUp}
        aria-label="Mesa de sinuca"
      />
      <div className="gp-pool-info">
        {myTurn && placing && <span>Bola na mão: clique onde quer colocar a branca.</span>}
        {myTurn && !placing && <span>Mire com o mouse. Segure e arraste para trás para dar força; solte para tacar.</span>}
        {!myTurn && state.status === 'playing' && <span>{state.data?.note || 'Aguardando a tacada.'}</span>}
        <span className="gp-power" aria-label="Força"><i style={{ width: `${Math.round(power * 100)}%` }} /></span>
      </div>
      <div className="gp-groups">
        {[0, 1].map((i) => (
          <span key={i}>{SEAT_LABELS.pool[i]}: {groups[i] ? groups[i] : 'grupo a definir'}{groups[i] && ` (${(state.data?.balls || []).filter((b) => !b.in && groupOf(b.id) === groups[i]).length} na mesa)`}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ping-pong e totó
// ---------------------------------------------------------------------------

function RealtimeField({ hub, table, state, mySeat }) {
  const canvasRef = useRef(null);
  const isPP = table.kind === 'pingpong';
  const flip = mySeat === 1; // quem joga fica sempre do lado esquerdo
  useEffect(() => {
    let raf;
    const draw = () => {
      const c = canvasRef.current;
      if (c) {
        const g = c.getContext('2d');
        const W = c.width;
        const H = c.height;
        const L = isPP ? PP.L + 0.6 : FB.L;
        const Wd = isPP ? PP.W + 0.6 : FB.W;
        const s = Math.min((W - 20) / L, (H - 20) / Wd);
        const X = (x) => W / 2 + (flip ? -x : x) * s;
        const Z = (z) => H / 2 + z * s;
        const f = hub.frame(table.id);
        g.fillStyle = isPP ? '#13202c' : '#1b2a1e';
        g.fillRect(0, 0, W, H);
        if (isPP) {
          g.fillStyle = '#1f4f7a';
          g.fillRect(X(-PP.L / 2) < X(PP.L / 2) ? X(-PP.L / 2) : X(PP.L / 2), Z(-PP.W / 2), PP.L * s, PP.W * s);
          g.strokeStyle = '#f4f2ee';
          g.lineWidth = 2;
          g.strokeRect(Math.min(X(-PP.L / 2), X(PP.L / 2)), Z(-PP.W / 2), PP.L * s, PP.W * s);
          g.beginPath();
          g.moveTo(X(0), Z(-PP.W / 2 - 0.05));
          g.lineTo(X(0), Z(PP.W / 2 + 0.05));
          g.stroke();
          ['#c8402f', '#e8e2d6'].forEach((col, i) => {
            const z = f ? f.paddles[i] : 0;
            const x = (i ? 1 : -1) * PP.paddleX;
            g.fillStyle = col;
            g.fillRect(X(x) - 4, Z(z - PP.paddleW / 2), 8, PP.paddleW * s);
          });
          if (f) {
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.beginPath();
            g.arc(X(f.ball.x), Z(f.ball.z), 5, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#f7f3ea';
            g.beginPath();
            g.arc(X(f.ball.x), Z(f.ball.z) - f.ball.h * 40, 5 + f.ball.h * 6, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          g.fillStyle = '#2f7a43';
          g.fillRect(Math.min(X(-FB.L / 2), X(FB.L / 2)), Z(-FB.W / 2), FB.L * s, FB.W * s);
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 2;
          g.strokeRect(Math.min(X(-FB.L / 2), X(FB.L / 2)), Z(-FB.W / 2), FB.L * s, FB.W * s);
          g.beginPath();
          g.moveTo(X(0), Z(-FB.W / 2));
          g.lineTo(X(0), Z(FB.W / 2));
          g.stroke();
          [-1, 1].forEach((sd) => {
            g.fillStyle = '#0d1a10';
            g.fillRect(X(sd * FB.L / 2) - 4, Z(-FB.goalW / 2), 8, FB.goalW * s);
          });
          const controls = f?.controls || [0, 0];
          const kicks = f?.kicks || [false, false];
          RODS.forEach((rod) => {
            g.strokeStyle = 'rgba(220,220,225,0.55)';
            g.beginPath();
            g.moveTo(X(rod[0]), Z(-FB.W / 2));
            g.lineTo(X(rod[0]), Z(FB.W / 2));
            g.stroke();
            rodMen(rod, controls[rod[1]]).forEach((z) => {
              g.fillStyle = rod[1] === 0 ? '#c8402f' : '#2a5fb0';
              const kick = kicks[rod[1]] ? (rod[1] === 0 ? 1 : -1) * (flip ? -1 : 1) * 6 : 0;
              g.fillRect(X(rod[0]) - 5 + kick, Z(z) - 7, 10, 14);
            });
          });
          if (f) {
            g.fillStyle = '#f4f1e8';
            g.beginPath();
            g.arc(X(f.ball.x), Z(f.ball.z), FB.ball * s, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hub, table.id, isPP, flip]);

  const playing = state.status === 'playing' && mySeat !== -1;
  const onMove = (e) => {
    if (!playing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const v = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    hub.setInput(table.id, Math.max(-1, Math.min(1, v * (isPP ? 1.1 : 1.25))));
  };
  const onDown = () => {
    if (playing && !isPP) hub.setInput(table.id, hub.inputs.get(`${table.id}:me`)?.u || 0, true);
  };
  const score = state.data?.score || [0, 0];
  return (
    <div className="gp-rt">
      <div className="gp-score" aria-live="polite">
        <span className={flip ? 'b' : 'a'}>{score[flip ? 1 : 0]}</span>
        <em>{isPP ? `até ${state.data?.target || 11}` : `até ${state.data?.target || 5} gols`}</em>
        <span className={flip ? 'a' : 'b'}>{score[flip ? 0 : 1]}</span>
      </div>
      <canvas ref={canvasRef} width={640} height={isPP ? 400 : 360} className={`gp-canvas ${playing ? 'active' : ''}`} onPointerMove={onMove} onPointerDown={onDown} aria-label={isPP ? 'Mesa de ping-pong' : 'Mesa de totó'} />
      <div className="gp-pool-info">
        {playing && (isPP ? <span>Mexa o mouse para cima e para baixo para mover a raquete. O saque sai sozinho.</span>
          : <span>Mexa o mouse para mover os bonecos; clique para chutar.</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export default function GamePanel({ hub, tableId, myId, users, onClose, onSit, onLeave }) {
  useHub(hub);
  const table = tableById(tableId);
  const state = hub.get(tableId);
  if (!table || !state) return null;
  const nameOf = (id) => users.find((u) => u.userId === id)?.username || 'alguém';
  const mySeat = state.players.indexOf(myId);
  const labels = SEAT_LABELS[table.kind];
  const turn = turnIndex(state);
  const both = Boolean(state.players[0] && state.players[1]);

  let status = '';
  if (state.status === 'waiting') status = both ? 'Prontos para começar' : 'Esperando jogadores';
  else if (state.status === 'playing') {
    if (turn === null) status = 'Valendo!';
    else status = turn === mySeat ? 'Sua vez' : `Vez de ${nameOf(state.players[turn])}`;
    if (table.kind === 'chess' && state.reason === 'xeque') status += ' · xeque';
  } else if (state.status === 'over') {
    status = state.winner === -1 ? `Empate${state.reason ? ` (${state.reason})` : ''}`
      : state.winner === null ? 'Fim de jogo'
        : `${state.winner === mySeat ? 'Você venceu' : `${nameOf(state.players[state.winner]) || labels[state.winner]} venceu`}${state.reason ? ` · ${state.reason}` : ''}`;
  }

  return (
    <aside className="game-panel" aria-label={`${table.label}`}>
      <header className="gp-head">
        <div>
          <h2>{table.label}</h2>
          <p className={`gp-status ${state.status === 'playing' && turn === mySeat ? 'mine' : ''}`}>{status}</p>
        </div>
        <button className="cz-icon" onClick={onClose} aria-label="Fechar painel do jogo"><X size={16} /></button>
      </header>

      <div className="gp-seats">
        {[0, 1].map((i) => {
          const holder = state.players[i];
          return (
            <div key={i} className={`gp-seat ${turn === i && state.status === 'playing' ? 'turn' : ''} ${holder === myId ? 'me' : ''}`}>
              <span className={`gp-seat-swatch s${i} ${table.kind}`} />
              <div className="gp-seat-text">
                <small>{labels[i]}</small>
                <strong>{holder ? (holder === myId ? 'Você' : nameOf(holder)) : 'Livre'}</strong>
              </div>
              {!holder && mySeat === -1 && (
                <button className="gp-sit" onClick={() => onSit(i)}><Armchair size={14} /> Jogar</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="gp-body">
        {table.kind === 'chess' && <ChessBoard hub={hub} table={table} state={state} mySeat={mySeat} />}
        {table.kind === 'checkers' && <CheckersBoard hub={hub} table={table} state={state} mySeat={mySeat} />}
        {table.kind === 'pool' && <PoolTable hub={hub} table={table} state={state} mySeat={mySeat} />}
        {(table.kind === 'pingpong' || table.kind === 'foosball') && <RealtimeField hub={hub} table={table} state={state} mySeat={mySeat} />}
        {state.status === 'waiting' && !both && (
          <div className="gp-overlay">
            {mySeat === -1 ? 'Escolha um lado acima para jogar. Quem chegar perto pode assistir.' : 'Esperando alguém sentar do outro lado…'}
          </div>
        )}
      </div>

      {mySeat !== -1 && (
        <footer className="gp-foot">
          {state.status === 'playing' && <button className="gp-btn" onClick={() => hub.resign(tableId)}><Flag size={14} /> Desistir</button>}
          {state.status === 'over' && both && <button className="gp-btn primary" onClick={() => hub.rematch(tableId)}><RotateCcw size={14} /> Revanche</button>}
          <button className="gp-btn" onClick={onLeave}><LogOut size={14} /> Sair da mesa</button>
        </footer>
      )}
    </aside>
  );
}
