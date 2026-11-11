import { describe, expect, it } from 'vitest';
import { COLLIDERS, PLAYER_RADIUS, ROOM, SEATS, SPAWNS, spawnFor, FACE_SCREEN } from '../../src/renderer/services/room3d/layout';
import { inputToDirection, nearestSeat, resolve, sitAt, step, WALK_SPEED, RUN_SPEED, lerpAngle } from '../../src/renderer/services/room3d/movement';
import { createRateLimiter, decode, encodeReaction, encodeState, MAX_MESSAGE_BYTES } from '../../src/renderer/services/room3d/protocol';
import { spatialGain, SPATIAL } from '../../src/renderer/services/room3d/spatial';

const insideAnyCollider = (x, z, r = PLAYER_RADIUS) => COLLIDERS.some((b) => {
  const cx = Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
  const cz = Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
  return Math.hypot(x - cx, z - cz) < r - 1e-6;
});

describe('layout da sala', () => {
  it('pontos de chegada e saídas de assento ficam livres e dentro da sala', () => {
    [...SPAWNS, ...SEATS.map((s) => s.exit)].forEach((p) => {
      expect(insideAnyCollider(p.x, p.z)).toBe(false);
      expect(p.x).toBeGreaterThan(ROOM.minX);
      expect(p.x).toBeLessThan(ROOM.maxX);
      expect(p.z).toBeGreaterThan(ROOM.minZ);
      expect(p.z).toBeLessThan(ROOM.maxZ);
    });
  });

  it('todo assento é alcançável andando a partir da chegada (busca em grade)', () => {
    const cell = 0.25;
    const key = (x, z) => `${Math.round(x / cell)},${Math.round(z / cell)}`;
    const start = SPAWNS[0];
    const seen = new Set([key(start.x, start.z)]);
    const queue = [[start.x, start.z]];
    while (queue.length) {
      const [x, z] = queue.shift();
      for (const [dx, dz] of [[cell, 0], [-cell, 0], [0, cell], [0, -cell]]) {
        const nx = x + dx;
        const nz = z + dz;
        const k = key(nx, nz);
        if (seen.has(k)) continue;
        if (nx < ROOM.minX + PLAYER_RADIUS || nx > ROOM.maxX - PLAYER_RADIUS || nz < ROOM.minZ + PLAYER_RADIUS || nz > ROOM.maxZ - PLAYER_RADIUS) continue;
        if (insideAnyCollider(nx, nz)) continue;
        seen.add(k);
        queue.push([nx, nz]);
      }
    }
    // para cada assento, alguma célula alcançável fica a menos de 1,2 m (alcance para sentar é 1,25)
    SEATS.forEach((s) => {
      let ok = false;
      seen.forEach((k) => {
        const [i, j] = k.split(',').map(Number);
        if (Math.hypot(i * cell - s.x, j * cell - s.z) < 1.2) ok = true;
      });
      expect(ok, `assento ${s.id}`).toBe(true);
    });
  });

  it('o mesmo usuário chega sempre no mesmo lugar, olhando para o telão', () => {
    expect(spawnFor('abc')).toEqual(spawnFor('abc'));
    expect(spawnFor('abc').yaw).toBe(FACE_SCREEN);
  });
});

describe('movimento', () => {
  it('W anda para onde a câmera olha; A e D vão para os lados', () => {
    const f = inputToDirection({ forward: true }, Math.PI); // câmera olhando o telão (-z)
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    const r = inputToDirection({ right: true }, Math.PI);
    expect(r.x).toBeCloseTo(1);
    const d = inputToDirection({ forward: true, right: true }, Math.PI);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1); // diagonal não é mais rápida
  });

  it('correr é mais rápido que andar', () => {
    const s0 = { x: 0, z: 5, yaw: 0, seat: -1 };
    const walk = step(s0, { right: true }, Math.PI, 0.1);
    const run = step(s0, { right: true, run: true }, Math.PI, 0.1);
    expect(walk.x).toBeCloseTo(WALK_SPEED * 0.1);
    expect(run.x).toBeCloseTo(RUN_SPEED * 0.1);
  });

  it('não atravessa móveis nem sai da sala', () => {
    let s = { x: 0, z: 0.5, yaw: 0, seat: -1 };
    for (let i = 0; i < 100; i++) s = step(s, { forward: true }, Math.PI, 0.05); // anda contra o sofá
    expect(insideAnyCollider(s.x, s.z)).toBe(false);
    let e = { x: 0, z: 5, yaw: 0, seat: -1 };
    for (let i = 0; i < 200; i++) e = step(e, { forward: true }, 0, 0.05); // anda para o sul até a borda
    expect(e.z).toBeLessThanOrEqual(ROOM.maxZ - PLAYER_RADIUS + 1e-9);
  });

  it('resolve tira de dentro de um móvel', () => {
    const p = resolve(0, -1.2); // centro do sofá
    expect(insideAnyCollider(p.x, p.z)).toBe(false);
  });

  it('um salto grande de tempo é limitado', () => {
    const s = step({ x: 0, z: 5, yaw: 0, seat: -1 }, { right: true }, Math.PI, 5);
    expect(s.x).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it('senta no assento livre mais próximo e levanta ao andar', () => {
    const seat = SEATS.findIndex((x) => x.id === 'fogueira-0');
    const near = SEATS[seat].exit;
    expect(nearestSeat(near.x, near.z)).toBe(seat);
    expect(nearestSeat(near.x, near.z, new Set([seat]))).not.toBe(seat);
    const seated = sitAt({ x: near.x, z: near.z, yaw: 0, seat: -1 }, seat);
    expect(seated.seat).toBe(seat);
    expect(step(seated, {}, 0, 0.1).seat).toBe(seat);
    const up = step(seated, { forward: true }, 0, 0.1);
    expect(up.seat).toBe(-1);
    expect(insideAnyCollider(up.x, up.z)).toBe(false);
  });

  it('longe de qualquer assento não senta', () => {
    expect(nearestSeat(0, 6.5)).toBe(-1);
  });

  it('interpola ângulos pelo caminho mais curto', () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 1);
  });
});

describe('protocolo', () => {
  it('ida e volta do estado', () => {
    const m = decode(encodeState({ x: 1.234, z: -2.5, yaw: 1, seat: 3, moving: false, emote: 'wave', emoteNonce: 2 }));
    expect(m).toMatchObject({ type: 'state', x: 1.23, z: -2.5, seat: 3, pose: 'sit', emote: 'wave', emoteNonce: 2 });
  });

  it('rejeita lixo, versões desconhecidas e mensagens grandes', () => {
    expect(decode('não é json')).toBeNull();
    expect(decode(JSON.stringify({ v: 99, t: 's', x: 0, z: 0, y: 0 }))).toBeNull();
    expect(decode(JSON.stringify({ v: 1, t: 's', x: 'a', z: 0, y: 0 }))).toBeNull();
    expect(decode(JSON.stringify({ v: 1, t: 's', x: Infinity, z: 0, y: 0 }))).toBeNull();
    expect(decode('x'.repeat(MAX_MESSAGE_BYTES + 1))).toBeNull();
    expect(decode(JSON.stringify({ v: 1, t: 'zzz' }))).toBeNull();
    expect(decode(null)).toBeNull();
  });

  it('limita posição à sala e ignora assento e gesto inválidos', () => {
    const m = decode(JSON.stringify({ v: 1, t: 's', x: 999, z: -999, y: 50, s: 999, e: '<script>' }));
    expect(m.x).toBe(ROOM.maxX);
    expect(m.z).toBe(ROOM.minZ);
    expect(m.seat).toBe(-1);
    expect(m.emote).toBeNull();
    expect(Math.abs(m.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  it('só aceita reações da lista', () => {
    expect(decode(encodeReaction('🔥'))).toEqual({ type: 'reaction', emoji: '🔥' });
    expect(decode(encodeReaction('<img onerror=x>'))).toBeNull();
  });

  it('limita a frequência de reações por pessoa', () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 10)).toBe(true);
    expect(allow('a', 20)).toBe(false);
    expect(allow('b', 20)).toBe(true);
    expect(allow('a', 1500)).toBe(true);
  });
});

describe('áudio espacial', () => {
  it('volume pleno perto e queda suave com a distância, sem zerar', () => {
    expect(spatialGain(0)).toBe(1);
    expect(spatialGain(SPATIAL.refDistance)).toBe(1);
    expect(spatialGain(5)).toBeLessThan(spatialGain(3));
    expect(spatialGain(20)).toBeGreaterThan(0);
    expect(spatialGain(20)).toBeLessThan(0.1);
    expect(spatialGain(1000)).toBe(spatialGain(SPATIAL.maxDistance));
  });
});
