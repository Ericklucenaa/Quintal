// Jogos em tempo real da sala: ping-pong e totó, vistos de cima.
// Quem está no lugar 1 (jogador A) é o "anfitrião": simula a bola e manda quadros
// (~30 por segundo) para todo mundo; o jogador B manda só a posição da raquete ou dos
// bonecos. O placar vai no estado da mesa (versionado como os outros jogos).
//
// Coordenadas: x ao longo da mesa (A defende o lado -x, B o lado +x), z na largura.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// Ping-pong
// ---------------------------------------------------------------------------

export const PP = { L: 2.74, W: 1.525, paddleW: 0.3, paddleX: 1.37 + 0.08, target: 11 };
const PP_MAX = 6.5;

export function newPingPongData() {
  return { score: [0, 0], server: 0, target: PP.target };
}

export function createPingPong() {
  return {
    ball: { x: -PP.paddleX + 0.12, z: 0, vx: 0, vz: 0, h: 0.2 },
    paddles: [0, 0], // z de cada raquete
    serveAt: 0.9, // segundos até sacar
    lastHitter: 0,
    bounce: 0
  };
}

/** Converte a posição do mouse (-1 a 1) em z da raquete. */
export const ppPaddleZ = (u) => clamp(u, -1, 1) * (PP.W / 2 + 0.2);

/**
 * Um passo da simulação (anfitrião). `server` = quem saca agora.
 * Devolve 0 ou 1 quando alguém marca ponto (índice de quem marcou), senão null.
 */
export function stepPingPong(sim, dt, server) {
  const b = sim.ball;
  if (sim.serveAt > 0) {
    sim.serveAt -= dt;
    const side = server === 0 ? -1 : 1;
    b.x = side * (PP.paddleX - 0.12);
    b.z = sim.paddles[server];
    b.vx = 0;
    b.vz = 0;
    b.h = 0.25;
    if (sim.serveAt <= 0) {
      b.vx = -side * 2.6;
      b.vz = (Math.sin(sim.paddles[server] * 7 + 1) * 0.6);
      sim.lastHitter = server;
    }
    return null;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  sim.bounce += dt * Math.abs(b.vx) / (PP.L / 2);
  b.h = 0.05 + Math.abs(Math.sin(sim.bounce * Math.PI)) * 0.28; // altura só para o desenho
  // raquetes
  for (const side of [0, 1]) {
    const px = side === 0 ? -PP.paddleX : PP.paddleX;
    const toward = side === 0 ? b.vx < 0 : b.vx > 0;
    if (!toward) continue;
    const crossed = side === 0 ? b.x <= px : b.x >= px;
    if (crossed && Math.abs(b.z - sim.paddles[side]) <= PP.paddleW / 2 + 0.03) {
      b.x = px;
      const offset = (b.z - sim.paddles[side]) / (PP.paddleW / 2);
      const speed = Math.min(PP_MAX, Math.abs(b.vx) * 1.07 + 0.1);
      b.vx = side === 0 ? speed : -speed;
      b.vz = clamp(b.vz * 0.4 + offset * 2.2, -3, 3);
      sim.lastHitter = side;
      sim.bounce = 0;
    }
  }
  // ponto: passou do fundo, ou saiu pela lateral (culpa de quem bateu por último)
  if (b.x < -PP.paddleX - 0.25) return 1;
  if (b.x > PP.paddleX + 0.25) return 0;
  if (Math.abs(b.z) > PP.W / 2 + 0.35) return 1 - sim.lastHitter;
  return null;
}

/** Placar depois de um ponto: { data, over, winner }. Saque alterna a cada 2 pontos. */
export function scorePingPong(data, scorer) {
  const score = [...data.score];
  score[scorer] += 1;
  const total = score[0] + score[1];
  const deuce = score[0] >= data.target - 1 && score[1] >= data.target - 1;
  const server = deuce ? total % 2 : Math.floor(total / 2) % 2;
  const lead = Math.abs(score[0] - score[1]);
  const over = (score[0] >= data.target || score[1] >= data.target) && lead >= 2;
  return { data: { ...data, score, server }, over, winner: over ? (score[0] > score[1] ? 0 : 1) : null };
}

// ---------------------------------------------------------------------------
// Totó (pebolim)
// ---------------------------------------------------------------------------

export const FB = { L: 1.2, W: 0.68, goalW: 0.2, ball: 0.017, man: 0.022, target: 5 };
// Varetas da esquerda para a direita: [x, time (0 = A, 1 = B), bonecos, espaçamento]
export const RODS = [
  [-0.525, 0, 1, 0], [-0.375, 0, 2, 0.24], [-0.225, 1, 3, 0.2], [-0.075, 0, 5, 0.12],
  [0.075, 1, 5, 0.12], [0.225, 0, 3, 0.2], [0.375, 1, 2, 0.24], [0.525, 1, 1, 0]
];
const FB_MAX = 3.2;

export function newFoosballData() {
  return { score: [0, 0], target: FB.target };
}

export function createFoosball() {
  return { ball: { x: 0, z: 0, vx: 0, vz: 0 }, controls: [0, 0], kicks: [0, 0], restart: 0.8, kickoff: 0 };
}

/** Posições z dos bonecos de uma vareta para o controle u (-1 a 1). */
export function rodMen(rod, u) {
  const [, , count, gap] = rod;
  const span = gap * (count - 1);
  const free = Math.max(0, FB.W / 2 - FB.man - span / 2 - 0.02);
  const center = clamp(u, -1, 1) * free;
  return Array.from({ length: count }, (_, i) => center - span / 2 + i * gap);
}

/** Um passo (anfitrião). Devolve 0 ou 1 quando alguém faz gol (quem marcou), senão null. */
export function stepFoosball(sim, dt) {
  const b = sim.ball;
  sim.kicks = sim.kicks.map((k) => Math.max(0, k - dt));
  if (sim.restart > 0) {
    sim.restart -= dt;
    b.x = 0;
    b.z = 0;
    b.vx = 0;
    b.vz = 0;
    if (sim.restart <= 0) {
      b.vx = 0;
      b.vz = (sim.kickoff % 2 ? 1 : -1) * 1.1;
      sim.kickoff += 1;
    }
    return null;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  const k = Math.max(0, 1 - 0.35 * dt);
  b.vx *= k;
  b.vz *= k;
  // paredes laterais
  if (Math.abs(b.z) > FB.W / 2 - FB.ball) {
    b.z = Math.sign(b.z) * (FB.W / 2 - FB.ball);
    b.vz = -b.vz * 0.85;
  }
  // fundos e gols
  if (Math.abs(b.x) > FB.L / 2 - FB.ball) {
    if (Math.abs(b.z) < FB.goalW / 2) return b.x < 0 ? 1 : 0;
    b.x = Math.sign(b.x) * (FB.L / 2 - FB.ball);
    b.vx = -b.vx * 0.85;
  }
  // bonecos
  for (const rod of RODS) {
    const [rx, team] = rod;
    const men = rodMen(rod, sim.controls[team]);
    for (const mz of men) {
      const dx = b.x - rx;
      const dz = b.z - mz;
      const d2 = dx * dx + dz * dz;
      const min = FB.ball + FB.man;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      b.x = rx + nx * min;
      b.z = mz + nz * min;
      const dir = team === 0 ? 1 : -1; // A chuta para +x
      if (sim.kicks[team] > 0) {
        b.vx = dir * FB_MAX;
        b.vz = nz * 1.6 + (Math.sin(mz * 31 + rx * 7) * 0.5);
      } else {
        const rel = b.vx * nx + b.vz * nz;
        if (rel < 0) {
          b.vx -= 1.7 * rel * nx;
          b.vz -= 1.7 * rel * nz;
        }
        // empurrãozinho para não ficar presa no boneco
        if (Math.abs(b.vx) < 0.15) b.vx = dir * 0.4;
      }
    }
  }
  const sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
  if (sp > FB_MAX) {
    b.vx = (b.vx / sp) * FB_MAX;
    b.vz = (b.vz / sp) * FB_MAX;
  }
  return null;
}

export function scoreFoosball(data, scorer) {
  const score = [...data.score];
  score[scorer] += 1;
  const over = score[scorer] >= data.target;
  return { data: { ...data, score }, over, winner: over ? scorer : null };
}

// ---------------------------------------------------------------------------
// Quadros (anfitrião → todos) e entradas (jogador B → anfitrião)
// ---------------------------------------------------------------------------

const r3 = (n) => Math.round(n * 1000) / 1000;

export function encodeFrame(kind, sim) {
  if (kind === 'pingpong') return [r3(sim.ball.x), r3(sim.ball.z), r3(sim.ball.h), r3(sim.paddles[0]), r3(sim.paddles[1]), sim.serveAt > 0 ? 1 : 0];
  return [r3(sim.ball.x), r3(sim.ball.z), r3(sim.controls[0]), r3(sim.controls[1]), sim.kicks[0] > 0 ? 1 : 0, sim.kicks[1] > 0 ? 1 : 0];
}

export function decodeFrame(kind, f) {
  if (!Array.isArray(f) || f.length !== 6 || !f.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (kind === 'pingpong') {
    return { ball: { x: clamp(f[0], -3, 3), z: clamp(f[1], -2, 2), h: clamp(f[2], 0, 1) }, paddles: [clamp(f[3], -1.2, 1.2), clamp(f[4], -1.2, 1.2)], serving: f[5] === 1 };
  }
  return { ball: { x: clamp(f[0], -1, 1), z: clamp(f[1], -1, 1) }, controls: [clamp(f[2], -1, 1), clamp(f[3], -1, 1)], kicks: [f[4] === 1, f[5] === 1] };
}
