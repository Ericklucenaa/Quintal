import { describe, expect, it } from 'vitest';
import { ROOM } from '../../src/renderer/services/room3d/layout';
import { step, groundAt, JUMP_VELOCITY, GRAVITY } from '../../src/renderer/services/room3d/movement';
import {
  initialObjects, stepObject, advanceThrown, throwFrom, canPick, nearestPickable, hitTest, OBJECT_RADIUS
} from '../../src/renderer/services/room3d/throwables';
import {
  decode, encodeState, encodeGrab, encodeThrow, encodeHit, encodeTheme, encodeSnapshot, encodeRest
} from '../../src/renderer/services/room3d/protocol';
import { THEMES, THEME_IDS, themeById } from '../../src/renderer/services/room3d/themes';

const simulate = (state, keysAt, seconds, opts = {}, yaw = Math.PI) => {
  let s = state;
  let maxY = 0;
  for (let i = 0; i < seconds * 60; i++) {
    s = step(s, keysAt(i), yaw, 1 / 60, opts);
    maxY = Math.max(maxY, s.y);
  }
  return { s, maxY };
};

describe('pular e subir', () => {
  const base = { x: 0, z: 5.5, y: 0, vy: 0, yaw: 0, seat: -1 };

  it('pula ~1,15 m e volta ao chão', () => {
    const { s, maxY } = simulate(base, (i) => ({ jump: i === 0 }), 2);
    const ideal = (JUMP_VELOCITY ** 2) / (2 * GRAVITY); // 1,17 m (a integração em passos dá um pouco menos)
    expect(maxY).toBeGreaterThan(ideal - 0.08);
    expect(maxY).toBeLessThanOrEqual(ideal);
    expect(s.y).toBe(0);
    expect(s.grounded).toBe(true);
  });

  it('na gravidade lunar o pulo vai bem mais alto', () => {
    const { maxY } = simulate(base, (i) => ({ jump: i === 0 }), 4, { gravityScale: 0.38 });
    expect(maxY).toBeGreaterThan(2.5);
  });

  it('sobe na mesa baixa andando (degrau) e fica em cima dela', () => {
    // mesa de centro do cinema: centro (0, -10.2), topo 0,36 m; chega pelo lado oeste
    const start = { x: -1.6, z: -10.2, y: 0, vy: 0, yaw: 0, seat: -1 };
    const { s } = simulate(start, () => ({ right: true }), 0.4);
    expect(s.y).toBeCloseTo(0.36, 2);
    expect(groundAt(s.x, s.z, s.y)).toBeCloseTo(0.36, 2);
  });

  it('o balcão (1,13 m) é parede andando, mas dá para subir pulando', () => {
    // balcão do bar: de x 12,9 a 13,9
    const walk = simulate({ x: 12.0, z: 0.5, y: 0, vy: 0, yaw: 0, seat: -1 }, () => ({ forward: true }), 1, {}, Math.PI / 2).s;
    expect(walk.x).toBeLessThan(12.9); // bateu na lateral
    expect(walk.y).toBe(0);
    const jump = simulate({ x: 12.2, z: 0.5, y: 0, vy: 0, yaw: 0, seat: -1 }, (i) => ({ jump: i === 0, forward: i < 18 }), 1.2, {}, Math.PI / 2).s;
    expect(jump.y).toBeCloseTo(1.13, 2);
  });

  it('ao sair da borda de um móvel, cai até o chão', () => {
    // anda para o oeste a partir de cima da mesa (só há chão nessa direção)
    const { s } = simulate({ x: 0, z: -10.2, y: 0.36, vy: 0, yaw: 0, seat: -1 }, () => ({ forward: true }), 1, {}, -Math.PI / 2);
    expect(s.y).toBe(0);
  });

  it('atordoado não anda nem pula', () => {
    const s = step(base, { right: true, jump: true }, Math.PI, 0.1, { frozen: true });
    expect(s.x).toBe(base.x);
    expect(s.y).toBe(0);
  });
});

describe('objetos arremessáveis', () => {
  it('nascem parados, apoiados no chão ou nos móveis', () => {
    initialObjects().forEach((o) => {
      expect(o.moving).toBe(false);
      expect(o.y).toBeGreaterThanOrEqual(OBJECT_RADIUS);
    });
  });

  it('arremesso cai, quica, perde força e para dentro da sala', () => {
    let o = { id: 'o0', ...throwFrom({ x: 0, z: 5, y: 0, yaw: 0 }, Math.PI / 2), holder: null, moving: true, ver: 1 };
    for (let i = 0; i < 600 && o.moving; i++) o = stepObject(o, 1 / 60);
    expect(o.moving).toBe(false);
    expect(o.x).toBeLessThanOrEqual(ROOM.maxX);
    expect(o.y).toBeCloseTo(OBJECT_RADIUS, 2);
  });

  it('pousa em cima de móveis', () => {
    let o = { id: 'o4', x: 0, y: 2, z: -10.2, vx: 0, vy: 0, vz: 0, holder: null, moving: true, ver: 0 };
    for (let i = 0; i < 300 && o.moving; i++) o = stepObject(o, 1 / 60);
    expect(o.y).toBeCloseTo(0.36 + OBJECT_RADIUS, 2);
  });

  it('acerta quem está no caminho e ignora quem arremessou', () => {
    const o = { x: 2, y: 1.2, z: 5, vx: 10, vy: 0, vz: 0, moving: true };
    const people = [{ id: 'eu', x: 2, y: 0, z: 5 }, { id: 'alvo', x: 2.2, y: 0, z: 5 }];
    expect(hitTest(o, people, 'eu')).toBe('alvo');
    expect(hitTest({ ...o, vx: 1 }, people, 'eu')).toBeNull(); // lento demais
    expect(hitTest({ ...o, y: 3 }, people, 'eu')).toBeNull(); // passou por cima
  });

  it('não atravessa ninguém mesmo com um quadro longo (acerto verificado a cada passo)', () => {
    const o = { id: 'o1', x: -2, y: 1.2, z: 5, vx: 20, vy: 0, vz: 0, holder: null, moving: true, ver: 1 };
    const people = [{ id: 'alvo', x: 0, y: 0, z: 5 }];
    expect(hitTest(stepObject(o, 0.25), people, 'eu')).toBeNull(); // só olhando o fim do quadro, passaria direto
    const res = advanceThrown(o, 0.25, 1, people, 'eu');
    expect(res.hit).toBe('alvo');
    expect(res.obj.x).toBeLessThan(0.2);
  });

  it('só pega o que está perto, livre e não voando', () => {
    const objs = initialObjects();
    const me = { x: -1.5, z: 3.7, y: 0 };
    expect(nearestPickable(me, objs)?.id).toBe('o0');
    expect(canPick(me, { ...objs.get('o0'), holder: 'outra' })).toBe(false);
    expect(canPick({ x: 5, z: -5, y: 0 }, objs.get('o0'))).toBe(false);
  });
});

describe('protocolo novo', () => {
  it('pegar, arremessar, pousar, acertar, tema e estado dos objetos', () => {
    expect(decode(encodeGrab('o1', 3))).toEqual({ type: 'grab', id: 'o1', ver: 3 });
    expect(decode(encodeThrow('o2', 4, { x: 1, y: 1.4, z: 2, vx: 3, vy: 2, vz: -1 }))).toMatchObject({ type: 'throw', id: 'o2', ver: 4, vx: 3 });
    expect(decode(encodeRest('o2', 4, { x: 1, y: 0.17, z: 2 }))).toMatchObject({ type: 'rest', id: 'o2' });
    expect(decode(encodeHit('abcXYZ123', 'o2', 3, 4))).toMatchObject({ type: 'hit', target: 'abcXYZ123', dx: 0.6, dz: 0.8 });
    expect(decode(encodeTheme('neve', 123))).toEqual({ type: 'theme', theme: 'neve', ts: 123 });
    const snap = decode(encodeSnapshot(initialObjects()));
    expect(snap.type).toBe('snapshot');
    expect(snap.list).toHaveLength(8);
  });

  it('rejeita objetos, temas e alvos forjados e limita velocidades', () => {
    expect(decode(encodeGrab('o99', 1))).toBeNull();
    expect(decode(encodeTheme('tema-inexistente', 1))).toBeNull();
    expect(decode(encodeHit('<script>', 'o1', 1, 0))).toBeNull();
    const fast = decode(JSON.stringify({ v: 1, t: 't', o: 'o1', r: 1, x: 0, y: 1, z: 0, vx: 9999, vy: 0, vz: 0 }));
    expect(fast.vx).toBe(25);
    expect(decode(JSON.stringify({ v: 1, t: 'p', l: Array(20).fill(['o1', 0, 0, 0, '', 1]) }))).toBeNull();
  });

  it('o estado inclui a altura e o objeto na mão', () => {
    const m = decode(encodeState({ x: 1, z: 1, y: 1.13, yaw: 0, seat: -1, holding: 'o3' }));
    expect(m.y).toBeCloseTo(1.13);
    expect(m.holding).toBe('o3');
  });
});

describe('temas', () => {
  it('há vários temas, todos completos e com ids únicos', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(THEME_IDS).size).toBe(THEMES.length);
    const required = ['name', 'swatch', 'gravity', 'sky', 'fog', 'hemi', 'sun', 'floor', 'surroundings', 'wall', 'rail', 'sofa', 'rug', 'table', 'counter', 'fire', 'lights', 'plant', 'throwable'];
    THEMES.forEach((t) => required.forEach((k) => expect(t[k], t.id + '.' + k).toBeDefined()));
  });

  it('tema desconhecido cai no padrão', () => {
    expect(themeById('nada').id).toBe('terraco');
  });
});
