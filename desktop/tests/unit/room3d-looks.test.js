import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOK, OPTIONS, PRESETS, SKIN_TONES, applyPreset, defaultLookFor, validateLook
} from '../../src/renderer/services/room3d/looks';
import { decode, encodeLook } from '../../src/renderer/services/room3d/protocol';

describe('aparência do avatar', () => {
  it('valores fora do catálogo viram o padrão (nada de texto ou cor livre de outra pessoa)', () => {
    const look = validateLook({ hair: '<img onerror=x>', skin: 999, topColor: -1, height: 50, hat: 'coroa', build: 'forte' });
    expect(look.hair).toBe(DEFAULT_LOOK.hair);
    expect(look.skin).toBe(DEFAULT_LOOK.skin);
    expect(look.topColor).toBe(DEFAULT_LOOK.topColor);
    expect(look.height).toBe(1.1);
    expect(look.hat).toBe('coroa');
    expect(look.build).toBe('forte');
    expect(validateLook(null)).toEqual(DEFAULT_LOOK);
  });

  it('estilos prontos mantêm pele, altura e corpo da pessoa', () => {
    const mine = validateLook({ ...DEFAULT_LOOK, skin: 6, height: 0.95, build: 'esguio' });
    PRESETS.forEach((p) => {
      const look = applyPreset(mine, p.id);
      expect(look.skin, p.id).toBe(6);
      expect(look.height, p.id).toBe(0.95);
      expect(look.build, p.id).toBe('esguio');
    });
    expect(applyPreset(mine, 'pirata').hat).toBe('pirata');
    expect(applyPreset(mine, 'astronauta').top).toBe('traje');
  });

  it('há muitas opções e muitos estilos prontos', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(OPTIONS.hair.length).toBeGreaterThanOrEqual(8);
    expect(OPTIONS.top.length).toBeGreaterThanOrEqual(8);
    expect(OPTIONS.hat.length).toBeGreaterThanOrEqual(10);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(8);
  });

  it('quem nunca personalizou começa com uma aparência própria e estável', () => {
    expect(defaultLookFor('abc')).toEqual(defaultLookFor('abc'));
    const looks = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map((id) => JSON.stringify(defaultLookFor(id))));
    expect(looks.size).toBeGreaterThan(5);
  });

  it('a aparência viaja validada pelo canal da sala', () => {
    const msg = decode(encodeLook({ ...DEFAULT_LOOK, hat: 'mago', hairColor: 3 }));
    expect(msg).toMatchObject({ type: 'look', look: { hat: 'mago', hairColor: 3 } });
    const forged = decode(JSON.stringify({ v: 1, t: 'a', l: { hat: 'javascript:alert(1)', skin: 'red' } }));
    expect(forged.look.hat).toBe('nenhum');
    expect(forged.look.skin).toBe(DEFAULT_LOOK.skin);
    expect(decode(JSON.stringify({ v: 1, t: 'a', l: 'texto' }))).toBeNull();
  });
});
