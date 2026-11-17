// Truco para 4 jogadores (duplas: lugares 0 e 2 contra 1 e 3), nas variantes paulista e mineira.
//
// Cartas: baralho de 40 (sem 8, 9 e 10). Código = valor + naipe: valores 4 5 6 7 Q J K A 2 3,
// naipes o (ouros), e (espadas), c (copas), p (paus). Ordem comum, da mais fraca: 4 5 6 7 Q J K A 2 3.
//  * Paulista: uma carta é virada (vira); manilha é o valor seguinte, com naipes ouros < espadas < copas < paus.
//    A mão vale 1 e o truco sobe 3 → 6 → 9 → 12. Mão de onze: a dupla com 11 vê as cartas do parceiro
//    e decide jogar (vale 3) ou correr (os outros ganham 1).
//  * Mineiro: manilhas fixas, da mais forte: zap (4 de paus), copas (7 de copas), espadilha (A de espadas)
//    e pica-fumo (7 de ouros). A mão vale 2 e o truco sobe 4 → 6 → 10 → 12. Mão de dez, como a de onze
//    (jogar vale 4; correr dá 2 aos outros).
// Vazas: melhor de três. Empate (cangar): quem fez a 1ª vence se a seguinte empatar; se a 1ª empatar, quem
// fizer a próxima vence; três empates, ninguém marca. Depois de empate, quem é "mão" começa a vaza seguinte.
//
// O estado completo fica só com quem dá as cartas (o lugar 0 da mesa): { pub, hands }. `pub` vai para
// todos; cada um recebe só a própria mão (e a do parceiro na mão de onze/dez). Funções puras e testáveis.

export const RANKS = '4567QJKA23';
export const SUITS = 'oecp';
export const SUIT_NAMES = { o: 'ouros', e: 'espadas', c: 'copas', p: 'paus' };
export const VARIANTS = ['paulista', 'mineiro'];
const RULES = {
  paulista: { base: 1, ladder: [3, 6, 9, 12], special: 11, specialValue: 3, specialRun: 1 },
  mineiro: { base: 2, ladder: [4, 6, 10, 12], special: 10, specialValue: 4, specialRun: 2 }
};
export const TARGET = 12;
const MINEIRO_MANILHAS = ['7o', 'Ae', '7c', '4p']; // da mais fraca para a mais forte

export const teamOf = (seat) => seat % 2;
export const isCard = (c) => typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);
export const rules = (variant) => RULES[variant] || RULES.paulista;

export function deck() {
  const out = [];
  for (const r of RANKS) for (const s of SUITS) out.push(r + s);
  return out;
}

/** Valor da manilha na paulista (o seguinte ao da vira, em ciclo). */
export const manilhaRank = (vira) => RANKS[(RANKS.indexOf(vira[0]) + 1) % RANKS.length];

/** Força da carta (maior vence; iguais empatam). */
export function strength(card, variant, vira) {
  if (variant === 'mineiro') {
    const m = MINEIRO_MANILHAS.indexOf(card);
    if (m >= 0) return 100 + m;
    return RANKS.indexOf(card[0]);
  }
  if (vira && card[0] === manilhaRank(vira)) return 100 + SUITS.indexOf(card[1]);
  return RANKS.indexOf(card[0]);
}

/** Vencedor da vaza: dupla (0/1) ou -1 se as melhores cartas forem de duplas diferentes. */
export function trickWinner(trick, variant, vira) {
  let best = -1;
  let teams = new Set();
  let leader = null;
  for (const [seat, card] of trick) {
    const s = strength(card, variant, vira);
    if (s > best) { best = s; teams = new Set([teamOf(seat)]); leader = seat; } else if (s === best) teams.add(teamOf(seat));
  }
  return { team: teams.size === 1 ? [...teams][0] : -1, seat: leader };
}

/** Quem venceu a mão pelas vazas: dupla, -1 (ninguém) ou null (continua). */
export function handWinner(rounds) {
  const [a, b, c] = rounds;
  if (rounds.length < 2) return null;
  if (a !== -1) {
    if (b === a || b === -1) return a;
    if (rounds.length < 3) return null;
    return c === -1 ? a : c;
  }
  if (b !== -1) return b;
  if (rounds.length < 3) return null;
  return c; // -1 = três empates: ninguém marca
}

function shuffle(cards, rng) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sorteio criptográfico (quem dá as cartas). */
export function cryptoRng() {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  };
}

export function newMatch(variant, rng = cryptoRng(), dealer = 0) {
  const v = VARIANTS.includes(variant) ? variant : 'paulista';
  const full = {
    pub: { variant: v, score: [0, 0], hand: 0, dealer: (dealer + 3) % 4, turn: 0, value: 0, vira: null, trick: [], last: [],
      rounds: [], counts: [0, 0, 0, 0], raise: null, raisedBy: -1, special: null, specialTeam: -1, phase: 'play', note: '' },
    hands: [[], [], [], []]
  };
  return dealHand(full, rng);
}

/** Dá as cartas da próxima mão (o carteador passa para o próximo lugar). */
export function dealHand(full, rng = cryptoRng()) {
  const p = full.pub;
  const r = rules(p.variant);
  const cards = shuffle(deck(), rng);
  const hands = [0, 1, 2, 3].map((i) => cards.slice(i * 3, i * 3 + 3));
  const dealer = (p.dealer + 1) % 4;
  const vira = p.variant === 'paulista' ? cards[12] : null;
  const atSpecial = [0, 1].filter((t) => p.score[t] === r.special);
  // mão de onze/dez: só uma dupla nela decide; as duas nela ("mão de ferro") jogam sem truco
  const special = atSpecial.length === 1 ? { team: atSpecial[0] } : null;
  return {
    hands,
    pub: {
      ...p,
      hand: p.hand + 1,
      dealer,
      turn: (dealer + 1) % 4,
      value: r.base,
      vira,
      trick: [],
      last: [],
      rounds: [],
      counts: [3, 3, 3, 3],
      raise: null,
      raisedBy: atSpecial.length ? 2 : -1, // 2 = ninguém pode pedir truco nesta mão
      special,
      specialTeam: special ? special.team : -1, // dupla na mão de onze/dez: vê as cartas do parceiro
      phase: special ? 'special' : 'play',
      note: special ? `Mão de ${r.special}: a dupla decide se joga` : ''
    }
  };
}

/** Cartas que um lugar pode ver: a própria mão e, na mão de onze/dez, a do parceiro. */
export function visibleTo(full, seat) {
  const own = full.hands[seat];
  const p = full.pub;
  const partner = (seat + 2) % 4;
  const showPartner = p.specialTeam === teamOf(seat);
  return { own, partner: showPartner ? full.hands[partner] : null };
}

/** Próximo valor de aumento (null se já está em 12). */
export const nextRaise = (variant, value) => rules(variant).ladder.find((v) => v > value) || null;
/** Nome do pedido pelo valor: truco, seis, nove, dez, doze. */
export const RAISE_NAMES = { 3: 'Truco', 4: 'Truco', 6: 'Seis', 9: 'Nove', 10: 'Dez', 12: 'Doze' };

function finishHand(full, team, reason) {
  const p = full.pub;
  const score = [...p.score];
  if (team === 0 || team === 1) score[team] = Math.min(TARGET, score[team] + p.value);
  const over = score.some((s) => s >= TARGET);
  return {
    full: { ...full, pub: { ...p, score, phase: over ? 'over' : 'handover', raise: null, note: reason } },
    event: { kind: 'hand', team, points: team >= 0 ? p.value : 0, over, winner: over ? (score[0] >= TARGET ? 0 : 1) : null }
  };
}

/**
 * Aplica a ação de um lugar. Ações: { a: 'play', c: carta } | { a: 'truco' } (pedir/aumentar) | { a: 'accept' }
 * | { a: 'run' } | { a: 'go' } / { a: 'fold' } (mão de onze/dez). Devolve { full, event } ou null se for ilegal.
 */
export function act(full, seat, action) {
  const p = full.pub;
  const r = rules(p.variant);
  const team = teamOf(seat);
  if (!action || typeof action.a !== 'string' || p.phase === 'over' || p.phase === 'handover') return null;

  if (p.phase === 'special') {
    if (!p.special || team !== p.special.team) return null;
    if (action.a === 'go') return { full: { ...full, pub: { ...p, phase: 'play', value: r.specialValue, special: null, note: 'A dupla topou jogar' } }, event: { kind: 'go' } };
    if (action.a === 'fold') {
      const res = finishHand({ ...full, pub: { ...p, value: r.specialRun } }, 1 - team, 'A dupla correu da mão');
      return res;
    }
    return null;
  }

  if (p.phase === 'raise') {
    const raise = p.raise;
    if (!raise || team === raise.team) return null;
    if (action.a === 'accept') {
      return { full: { ...full, pub: { ...p, value: raise.to, raisedBy: raise.team, raise: null, phase: 'play', note: `Valendo ${raise.to}` } }, event: { kind: 'accept', to: raise.to } };
    }
    if (action.a === 'run') {
      return finishHand({ ...full, pub: { ...p, value: raise.prev } }, raise.team, 'Correu do truco');
    }
    if (action.a === 'truco') {
      const to = nextRaise(p.variant, raise.to);
      if (!to) return null;
      return { full: { ...full, pub: { ...p, raise: { team, to, prev: raise.to, seat }, note: `Pediu ${to}!` } }, event: { kind: 'truco', to, seat } };
    }
    return null;
  }

  // fase de jogar cartas: só quem está na vez
  if (seat !== p.turn) return null;
  if (action.a === 'truco') {
    if (p.raisedBy === team || p.raisedBy === 2) return null;
    const to = nextRaise(p.variant, p.value);
    if (!to) return null;
    return { full: { ...full, pub: { ...p, phase: 'raise', raise: { team, to, prev: p.value, seat }, note: to === r.ladder[0] ? 'Truco!' : `Pediu ${to}!` } }, event: { kind: 'truco', to, seat } };
  }
  if (action.a !== 'play' || !isCard(action.c)) return null;
  const hand = full.hands[seat];
  if (!hand.includes(action.c)) return null;
  const hands = full.hands.map((h, i) => (i === seat ? h.filter((c) => c !== action.c) : h));
  const trick = [...p.trick, [seat, action.c]];
  const counts = hands.map((h) => h.length);
  if (trick.length < 4) {
    return { full: { hands, pub: { ...p, trick, counts, turn: (seat + 1) % 4, note: '' } }, event: { kind: 'card', seat } };
  }
  const tw = trickWinner(trick, p.variant, p.vira);
  const rounds = [...p.rounds, tw.team];
  const after = { hands, pub: { ...p, trick: [], last: trick, rounds, counts, note: tw.team === -1 ? 'Empatou a vaza' : '' } };
  const hw = handWinner(rounds);
  if (hw !== null) return finishHand(after, hw, hw === -1 ? 'Três empates: ninguém marca' : 'Fim da mão');
  const mao = (p.dealer + 1) % 4;
  after.pub.turn = tw.team === -1 ? mao : tw.seat;
  return { full: after, event: { kind: 'trick', team: tw.team } };
}

// --- validação do estado público recebido ---------------------------------------

const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
export function isValidPublic(p) {
  if (!p || typeof p !== 'object') return false;
  if (!VARIANTS.includes(p.variant) || !Array.isArray(p.score) || p.score.length !== 2 || !p.score.every((s) => int(s, 0, TARGET))) return false;
  if (!int(p.hand, 0, 9999) || !int(p.dealer, 0, 3) || !int(p.turn, 0, 3) || !int(p.value, 0, 12)) return false;
  if (p.vira !== null && !isCard(p.vira)) return false;
  const trickOk = (t) => Array.isArray(t) && t.length <= 4 && t.every((x) => Array.isArray(x) && int(x[0], 0, 3) && isCard(x[1]));
  if (!trickOk(p.trick) || !trickOk(p.last)) return false;
  if (!Array.isArray(p.rounds) || p.rounds.length > 3 || !p.rounds.every((x) => [-1, 0, 1].includes(x))) return false;
  if (!Array.isArray(p.counts) || p.counts.length !== 4 || !p.counts.every((n) => int(n, 0, 3))) return false;
  if (p.raise !== null && !(p.raise && int(p.raise.team, 0, 1) && int(p.raise.to, 1, 12) && int(p.raise.prev, 0, 12) && int(p.raise.seat, 0, 3))) return false;
  if (![-1, 0, 1, 2].includes(p.raisedBy)) return false;
  if (p.special !== null && !(p.special && int(p.special.team, 0, 1))) return false;
  if (![-1, 0, 1].includes(p.specialTeam)) return false;
  return ['play', 'raise', 'special', 'handover', 'over'].includes(p.phase) && typeof p.note === 'string';
}

/** Nome de uma carta para leitura (acessibilidade e avisos). */
export function cardName(card) {
  const names = { Q: 'dama', J: 'valete', K: 'rei', A: 'ás' };
  return `${names[card[0]] || card[0]} de ${SUIT_NAMES[card[1]]}`;
}
