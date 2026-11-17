import React from 'react';
import { RAISE_NAMES, cardName, manilhaRank, nextRaise, rules, strength, teamOf } from '../../../services/room3d/games/truco';

const SUIT = { o: '♦', e: '♠', c: '♥', p: '♣' };
const VARIANT_LABEL = { paulista: 'Truco paulista', mineiro: 'Truco mineiro' };

function Card({ card, variant, vira, onClick, disabled, small }) {
  const red = card[1] === 'o' || card[1] === 'c';
  const manilha = strength(card, variant, vira) >= 100;
  const body = (
    <>
      <b>{card[0]}</b>
      <i aria-hidden="true">{SUIT[card[1]]}</i>
      {manilha && !small && <em>manilha</em>}
    </>
  );
  const cls = `tr-card ${red ? 'red' : ''} ${manilha ? 'manilha' : ''} ${small ? 'small' : ''}`;
  if (!onClick) return <span className={cls} aria-label={cardName(card)} role="img">{body}</span>;
  return <button className={cls} onClick={onClick} disabled={disabled} aria-label={`Jogar ${cardName(card)}`}>{body}</button>;
}

function Backs({ n }) {
  return <span className="tr-backs" aria-label={`${n} carta${n === 1 ? '' : 's'} na mão`}>{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>;
}

export default function TrucoTable({ hub, table, state, mySeat, nameOf, myId }) {
  const p = state.data;
  const variant = p?.variant || state.opts?.variant || 'paulista';
  const seated = mySeat !== -1;
  const anchor = seated ? mySeat : 0;
  // posição relativa na tela: 0 eu (embaixo), 1 direita, 2 parceiro (em cima), 3 esquerda
  const seatAt = (r) => (anchor + r) % 4;
  const myTeam = seated ? teamOf(mySeat) : 0;

  if (!p) {
    const sitting = state.players.filter(Boolean).length;
    return (
      <div className="gp-truco">
        <div className="tr-variant" role="radiogroup" aria-label="Variante do truco">
          {['paulista', 'mineiro'].map((v) => (
            <button key={v} role="radio" aria-checked={variant === v} className={`tr-variant-btn ${variant === v ? 'on' : ''}`}
              disabled={!seated || state.status === 'playing'} onClick={() => hub.setTrucoVariant(table.id, v)}>
              {VARIANT_LABEL[v]}
            </button>
          ))}
        </div>
        <p className="tr-rules">
          {variant === 'paulista'
            ? 'Vira com manilha (o valor seguinte). Mão vale 1; truco 3, seis, nove e doze. Mão de onze.'
            : 'Manilhas fixas: zap (4♣), copas (7♥), espadilha (A♠) e pica-fumo (7♦). Mão vale 2; truco 4, seis, dez e doze. Mão de dez.'}
        </p>
        <div className="gp-overlay">
          {seated ? `Esperando a mesa completar (${sitting}/4). Duplas: lugares 1 e 3 contra 2 e 4.` : `Escolha um lugar acima para jogar (${sitting}/4).`}
        </div>
      </div>
    );
  }

  const r = rules(variant);
  const hand = hub.myTrucoHand(table.id);
  const myTurn = seated && p.turn === mySeat;
  const shown = p.trick.length ? p.trick : p.phase === 'handover' ? p.last : [];
  const played = new Map(shown.map(([s, c]) => [s, c]));
  const canPlay = myTurn && p.phase === 'play' && hand;
  const raiseTo = nextRaise(variant, p.value);
  const canRaise = myTurn && p.phase === 'play' && p.raisedBy !== myTeam && p.raisedBy !== 2 && raiseTo;
  const mustAnswer = seated && p.phase === 'raise' && p.raise && p.raise.team !== myTeam;
  const reRaise = mustAnswer ? nextRaise(variant, p.raise.to) : null;
  const mustDecide = seated && p.phase === 'special' && p.special?.team === myTeam;
  const us = seated ? 'Nós' : 'Dupla A';
  const them = seated ? 'Eles' : 'Dupla B';
  const ourScore = p.score[myTeam];
  const theirScore = p.score[1 - myTeam];

  const seatBox = (rr) => {
    const seat = seatAt(rr);
    const uid = state.players[seat];
    const name = uid === myId ? 'Você' : nameOf(uid);
    return (
      <div className={`tr-seat r${rr} ${p.turn === seat && p.phase !== 'handover' ? 'turn' : ''} ${teamOf(seat) === myTeam ? 'ours' : 'theirs'}`}>
        <span className="tr-who">
          <span className="tr-name">{name}{seat === p.dealer ? ' · dá as cartas' : ''}</span>
          {rr !== 0 && <Backs n={p.counts[seat]} />}
        </span>
        <span className="tr-slot">{played.has(seat) && <Card card={played.get(seat)} variant={variant} vira={p.vira} />}</span>
      </div>
    );
  };

  return (
    <div className="gp-truco">
      <div className="tr-top">
        <div className="tr-score" aria-live="polite">
          <span className="ours">{us} <strong>{ourScore}</strong></span>
          <span className="sep">×</span>
          <span className="theirs"><strong>{theirScore}</strong> {them}</span>
        </div>
        <div className="tr-meta">
          <span className="tr-value">Valendo <strong>{p.value}</strong></span>
          {p.vira && (
            <span className="tr-vira">Vira <Card card={p.vira} variant={variant} vira={null} small /> manilha {manilhaRank(p.vira)}</span>
          )}
          <span className="tr-rounds" aria-label="Vazas desta mão">
            {[0, 1, 2].map((i) => {
              const w = p.rounds[i];
              const cls = w === undefined ? '' : w === -1 ? 'tie' : w === myTeam ? 'ours' : 'theirs';
              return <i key={i} className={cls} title={w === undefined ? 'por jogar' : w === -1 ? 'empate' : w === myTeam ? 'nossa' : 'deles'} />;
            })}
          </span>
        </div>
      </div>

      <div className="tr-table">
        {seatBox(2)}
        {seatBox(3)}
        <div className="tr-felt">{p.note && <span>{p.note}</span>}</div>
        {seatBox(1)}
        {seatBox(0)}
      </div>

      {/* Mão e botões presos ao pé do painel: em janela baixa a mesa rola por baixo, a mão fica sempre à vista. */}
      <div className="tr-dock">
      {seated && (
        <div className="tr-hand" aria-label="Suas cartas">
          {hand ? hand.own.map((c) => (
            <Card key={c} card={c} variant={variant} vira={p.vira} disabled={!canPlay} onClick={() => hub.trucoAction(table.id, { a: 'play', c })} />
          )) : <span className="tr-wait">Recebendo as cartas…</span>}
        </div>
      )}
      {hand?.partner && (
        <div className="tr-partner">
          <span>Cartas do parceiro</span>
          {hand.partner.map((c) => <Card key={c} card={c} variant={variant} vira={p.vira} small />)}
        </div>
      )}

      <div className="tr-actions">
        {canRaise && <button className="gp-btn primary" onClick={() => hub.trucoAction(table.id, { a: 'truco' })}>{RAISE_NAMES[raiseTo]}!</button>}
        {mustAnswer && (
          <>
            <span className="tr-ask">{nameOf(state.players[p.raise.seat])} pediu {RAISE_NAMES[p.raise.to].toLowerCase()} ({p.raise.to})</span>
            <button className="gp-btn primary" onClick={() => hub.trucoAction(table.id, { a: 'accept' })}>Aceitar</button>
            {reRaise && <button className="gp-btn" onClick={() => hub.trucoAction(table.id, { a: 'truco' })}>{RAISE_NAMES[reRaise]}!</button>}
            <button className="gp-btn" onClick={() => hub.trucoAction(table.id, { a: 'run' })}>Correr</button>
          </>
        )}
        {seated && p.phase === 'raise' && !mustAnswer && <span className="tr-ask">Esperando a outra dupla responder…</span>}
        {mustDecide && (
          <>
            <span className="tr-ask">Mão de {r.special}: jogar vale {r.specialValue}; correr dá {r.specialRun} a eles.</span>
            <button className="gp-btn primary" onClick={() => hub.trucoAction(table.id, { a: 'go' })}>Jogar</button>
            <button className="gp-btn" onClick={() => hub.trucoAction(table.id, { a: 'fold' })}>Correr</button>
          </>
        )}
        {seated && p.phase === 'special' && !mustDecide && <span className="tr-ask">A outra dupla está na mão de {r.special} e decide se joga…</span>}
        {myTurn && p.phase === 'play' && !canRaise && <span className="tr-ask">Sua vez: jogue uma carta.</span>}
      </div>
      </div>
    </div>
  );
}
