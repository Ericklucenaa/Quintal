import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOK, OPTIONS, PRESETS, SKIN_TONES, CLOTH_COLORS, HAIR_COLORS, applyPreset, defaultLookFor, validateLook
} from '../../src/renderer/services/room3d/looks';
import { decode, encodeLook } from '../../src/renderer/services/room3d/protocol';

describe('aparência do avatar', () => {
  it('valores fora do catálogo viram o padrão (nada de texto ou cor livre de outra pessoa)', () => {
    const look = validateLook({ hair: '<img onerror=x>', skin: 999, topColor: -1, height: 50, hat: 'coroa', build: 'forte', body: 'feminino' });
    expect(look.hair).toBe(DEFAULT_LOOK.hair);
    expect(look.skin).toBe(DEFAULT_LOOK.skin);
    expect(look.topColor).toBe(DEFAULT_LOOK.topColor);
    expect(look.height).toBe(1.1);
    expect(look.hat).toBe('coroa');
    expect(look.build).toBe('forte');
    expect(look.body).toBe('feminino');
    expect(validateLook(null)).toEqual(DEFAULT_LOOK);
  });

  it('aparências salvas da versão anterior viram peças que existem', () => {
    const old = validateLook({ body: 'neutro', hair: 'cacheado', top: 'blazer', beard: 'bigode', face: 'redondo', makeup: 'batom' });
    expect(old.body).toBe('masculino');
    expect(OPTIONS.hair.map((o) => o.id)).toContain(old.hair);
    expect(old.top).toBe('mangalonga');
    expect(old.beard).toBe('cheia');
    expect(old).not.toHaveProperty('face');
  });

  it('estilos prontos mantêm pele, altura, corpo e olhos da pessoa', () => {
    const mine = validateLook({ ...DEFAULT_LOOK, skin: 6, height: 0.95, build: 'esguio', body: 'feminino', eyes: 3 });
    PRESETS.forEach((p) => {
      const look = applyPreset(mine, p.id);
      expect(look.skin, p.id).toBe(6);
      expect(look.height, p.id).toBe(0.95);
      expect(look.build, p.id).toBe('esguio');
      expect(look.body, p.id).toBe('feminino');
      expect(look.eyes, p.id).toBe(3);
    });
    expect(applyPreset(mine, 'pirata').hat).toBe('pirata');
    expect(applyPreset(mine, 'vestido').top).toBe('vestido');
  });

  it('todo estilo pronto usa só peças do catálogo', () => {
    PRESETS.forEach((p) => {
      Object.entries(p.look).forEach(([k, v]) => {
        if (OPTIONS[k]) expect(OPTIONS[k].map((o) => o.id), `${p.id}.${k}`).toContain(v);
      });
    });
  });

  it('há bastante variedade', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(15);
    expect(OPTIONS.top.length).toBeGreaterThanOrEqual(8);
    expect(OPTIONS.bottom.length).toBeGreaterThanOrEqual(7);
    expect(OPTIONS.hat.length).toBeGreaterThanOrEqual(12);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(10);
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(CLOTH_COLORS.length).toBeGreaterThanOrEqual(20);
  });

  it('quem nunca personalizou começa com uma aparência própria e estável', () => {
    expect(defaultLookFor('abc')).toEqual(defaultLookFor('abc'));
    const looks = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map((id) => JSON.stringify(defaultLookFor(id))));
    expect(looks.size).toBeGreaterThan(5);
  });

  it('a aparência viaja validada pelo canal da sala', () => {
    const msg = decode(encodeLook({ ...DEFAULT_LOOK, hat: 'mago', hairColor: 3, body: 'feminino' }));
    expect(msg).toMatchObject({ type: 'look', look: { hat: 'mago', hairColor: 3, body: 'feminino' } });
    const forged = decode(JSON.stringify({ v: 1, t: 'a', l: { hat: 'javascript:alert(1)', skin: 'red' } }));
    expect(forged.look.hat).toBe('nenhum');
    expect(forged.look.skin).toBe(DEFAULT_LOOK.skin);
    expect(decode(JSON.stringify({ v: 1, t: 'a', l: 'texto' }))).toBeNull();
  });
});
