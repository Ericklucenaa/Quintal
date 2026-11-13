// Sinuca (bola 8) vista de cima. A física é determinística: passo fixo, mesma ordem
// de operações e só Math.sqrt (sempre igual entre máquinas). Quem dá a tacada manda
// só o ângulo e a força; todo mundo simula a mesma tacada e chega no mesmo lugar.
// No fim, quem tacou manda as posições finais (corrige qualquer diferença).
//
// Coordenadas da mesa: x de -L/2 a L/2 (comprimento), z de -W/2 a W/2.

export const TABLE = { L: 2.34, W: 1.17 };
export const BALL_R = 0.028;
export const POCKET_R = { corner: 0.062, side: 0.056 };
export const POCKETS = [
  [-TABLE.L / 2, -TABLE.W / 2, 'corner'], [0, -TABLE.W / 2 - 0.01, 'side'], [TABLE.L / 2, -TABLE.W / 2, 'corner'],
  [-TABLE.L / 2, TABLE.W / 2, 'corner'], [0, TABLE.W / 2 + 0.01, 'side'], [TABLE.L / 2, TABLE.W / 2, 'corner']
];
export const MAX_POWER = 4.2; // m/s na bola branca
const STEP = 1 / 240;
const ROLL_DECEL = 0.42; // m/s²
const DAMP = 0.9995;
const BALL_E = 0.94;
const RAIL_E = 0.72;
const STOP = 0.006;
const MAX_STEPS = 240 * 25;

export const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES = [9, 10, 11, 12, 13, 14, 15];
export const BALL_COLORS = ['#f4f1e8', '#e2b437', '#2a5fb0', '#c8402f', '#5b3d8f', '#e07a2c', '#2f7a43', '#7a2a2a', '#151515',
  '#e2b437', '#2a5fb0', '#c8402f', '#5b3d8f', '#e07a2c', '#2f7a43', '#7a2a2a'];
export const groupOf = (id) => (SOLIDS.includes(id) ? 'lisas' : STRIPES.includes(id) ? 'listradas' : null);

const round = (n) => Math.round(n * 10000) / 10000;

/** Bolas na posição de saída: branca à esquerda e triângulo à direita (com a 8 no meio). */
export function rack() {
  const balls = [{ id: 0, x: -TABLE.L / 4, z: 0, in: false }];
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const d = BALL_R * 2 + 0.0004;
  let k = 0;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      balls.push({ id: order[k], x: round(TABLE.L / 4 + row * d * 0.866), z: round((i - row / 2) * d), in: false });
      k += 1;
    }
  }
  return balls.sort((a, b) => a.id - b.id);
}

export function newPoolData() {
  return { balls: rack(), turn: 0, groups: [null, null], ballInHand: false, note: 'Tacada inicial' };
}

const clampToTable = (v, half) => Math.max(-half + BALL_R, Math.min(half - BALL_R, v));

/** Uma bola pode ficar em (x, z)? (dentro da mesa e sem encostar em outra) */
export function canPlaceCue(balls, x, z) {
  if (Math.abs(x) > TABLE.L / 2 - BALL_R || Math.abs(z) > TABLE.W / 2 - BALL_R) return false;
  return balls.every((b) => b.id === 0 || b.in || (b.x - x) * (b.x - x) + (b.z - z) * (b.z - z) >= (2 * BALL_R) * (2 * BALL_R));
}

/**
 * Simula uma tacada. `onFrame(balls)` é chamado a cada ~1/60 s (para desenhar enquanto rola).
 * Devolve { balls, potted: [ids na ordem], firstHit, cushionAfterHit, frames }.
 */
export function simulateShot(startBalls, { angle, power, cueX = null, cueZ = null }, onFrame = null) {
  const balls = startBalls.map((b) => ({ ...b, vx: 0, vz: 0 }));
  const cue = balls.find((b) => b.id === 0);
  if (cueX !== null && cueZ !== null) {
    cue.x = cueX;
    cue.z = cueZ;
    cue.in = false;
  }
  const p = Math.max(0.05, Math.min(MAX_POWER, power));
  cue.vx = Math.cos(angle) * p;
  cue.vz = Math.sin(angle) * p;
  const potted = [];
  let firstHit = null;
  let railAfterHit = false;
  let frames = 0;
  const hx = TABLE.L / 2;
  const hz = TABLE.W / 2;
  for (let step = 0; step < MAX_STEPS; step++) {
    let moving = false;
    for (const b of balls) {
      if (b.in) continue;
      const sp2 = b.vx * b.vx + b.vz * b.vz;
      if (sp2 === 0) continue;
      const sp = Math.sqrt(sp2);
      const dec = ROLL_DECEL * STEP;
      if (sp <= dec || sp < STOP) {
        b.vx = 0;
        b.vz = 0;
        continue;
      }
      const k = ((sp - dec) / sp) * DAMP;
      b.vx *= k;
      b.vz *= k;
      b.x += b.vx * STEP;
      b.z += b.vz * STEP;
      moving = true;
      // caçapas
      for (const [px, pz, kind] of POCKETS) {
        const dx = b.x - px;
        const dz = b.z - pz;
        const r = POCKET_R[kind];
        if (dx * dx + dz * dz < r * r) {
          b.in = true;
          b.vx = 0;
          b.vz = 0;
          potted.push(b.id);
          break;
        }
      }
      if (b.in) continue;
      // tabelas
      if (b.x < -hx + BALL_R) { b.x = -hx + BALL_R; b.vx = -b.vx * RAIL_E; if (firstHit !== null) railAfterHit = true; }
      if (b.x > hx - BALL_R) { b.x = hx - BALL_R; b.vx = -b.vx * RAIL_E; if (firstHit !== null) railAfterHit = true; }
      if (b.z < -hz + BALL_R) { b.z = -hz + BALL_R; b.vz = -b.vz * RAIL_E; if (firstHit !== null) railAfterHit = true; }
      if (b.z > hz - BALL_R) { b.z = hz - BALL_R; b.vz = -b.vz * RAIL_E; if (firstHit !== null) railAfterHit = true; }
    }
    // choques entre bolas (massa igual)
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.in) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (c.in) continue;
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d2 = dx * dx + dz * dz;
        const min = 2 * BALL_R;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        // separa as bolas
        const overlap = (min - d) / 2;
        a.x -= nx * overlap;
        a.z -= nz * overlap;
        c.x += nx * overlap;
        c.z += nz * overlap;
        const rel = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz;
        if (rel <= 0) continue;
        const imp = rel * (1 + BALL_E) / 2;
        a.vx -= imp * nx;
        a.vz -= imp * nz;
        c.vx += imp * nx;
        c.vz += imp * nz;
        if (firstHit === null && (a.id === 0 || c.id === 0)) firstHit = a.id === 0 ? c.id : a.id;
        moving = true;
      }
    }
    if (onFrame && step % 4 === 0) {
      frames += 1;
      onFrame(balls);
    }
    if (!moving) break;
  }
  return {
    balls: balls.map((b) => ({ id: b.id, x: round(b.x), z: round(b.z), in: b.in })),
    potted,
    firstHit,
    railAfterHit,
    frames
  };
}

/**
 * Regras da bola 8 aplicadas ao resultado da tacada. Devolve os novos dados do jogo
 * e, se acabou, { over: true, winner }.
 */
export function applyRules(data, shooter, result) {
  const groups = [...data.groups];
  const own = groups[shooter];
  const ownBefore = own ? data.balls.filter((b) => !b.in && groupOf(b.id) === own).length : 7;
  const scratch = result.potted.includes(0);
  const eight = result.potted.includes(8);
  const objectPotted = result.potted.filter((id) => id !== 0 && id !== 8);
  // primeira bola atingida: do próprio grupo (ou qualquer uma, antes de definir os
  // grupos, menos a 8); a 8 só quando o grupo já acabou
  const legalFirst = result.firstHit !== null && (
    !own ? result.firstHit !== 8 : ownBefore > 0 ? groupOf(result.firstHit) === own : result.firstHit === 8
  );
  const foul = scratch || !legalFirst;
  let note = '';

  let balls = result.balls;
  if (eight) {
    const win = !foul && Boolean(own) && ownBefore === 0;
    return { data: { ...data, balls, groups, ballInHand: false, note: win ? 'Encaçapou a 8!' : 'A 8 caiu antes da hora.' }, over: true, winner: win ? shooter : 1 - shooter };
  }
  if (!own && objectPotted.length && !foul) {
    const g = groupOf(objectPotted[0]);
    groups[shooter] = g;
    groups[1 - shooter] = g === 'lisas' ? 'listradas' : 'lisas';
    note = `Fica com as ${g}.`;
  }
  const mine = groups[shooter];
  const scoredOwn = mine ? objectPotted.some((id) => groupOf(id) === mine) : false;
  const keep = !foul && scoredOwn;
  if (scratch) {
    // branca volta para a mesa (quem joga em seguida escolhe onde)
    balls = balls.map((b) => (b.id === 0 ? { ...b, in: false, x: -TABLE.L / 4, z: 0 } : b));
  }
  if (foul) note = scratch ? 'Falta: a branca caiu. Bola na mão para o adversário.' : result.firstHit === null ? 'Falta: não acertou nenhuma bola.' : 'Falta: acertou a bola errada primeiro.';
  else if (!note) note = keep ? 'Boa! Joga de novo.' : 'Vez do adversário.';
  return {
    data: { ...data, balls, groups, turn: keep ? shooter : 1 - shooter, ballInHand: foul, note },
    over: false,
    winner: null
  };
}

export function isValidPoolData(d) {
  return d && Array.isArray(d.balls) && d.balls.length === 16
    && d.balls.every((b, i) => b && b.id === i && Number.isFinite(b.x) && Number.isFinite(b.z) && typeof b.in === 'boolean'
      && Math.abs(b.x) <= TABLE.L && Math.abs(b.z) <= TABLE.W)
    && (d.turn === 0 || d.turn === 1)
    && Array.isArray(d.groups) && d.groups.length === 2 && d.groups.every((g) => g === null || g === 'lisas' || g === 'listradas');
}

export { clampToTable };
