import { describe, expect, it } from 'vitest';
import { parseMusicLink, sanitizeItem, expectedPosition, isTrackOver, formatDuration } from '../../src/renderer/services/bots/music';
import { parseCommand, rollDice, runSorte, availableCommands, findCommand, splitChoices } from '../../src/renderer/services/bots/commands';
import { guardVerdict, guardConfigToSave, wordsPattern, cleanWordList, welcomeText } from '../../src/renderer/services/bots/catalog';
import { hasPermission, permissionsForRole, normalizeRolePermissions, DEFAULT_ROLE_PERMISSIONS } from '../../src/renderer/services/permissions';

const server = (extra = {}) => ({
  ownerId: 'dono',
  memberIds: ['dono', 'adm', 'mod', 'membro'],
  roles: { dono: 'owner', adm: 'admin', mod: 'moderator', membro: 'member' },
  ...extra
});

describe('links de música', () => {
  it('entende vídeos, shorts, music e playlists do YouTube', () => {
    expect(parseMusicLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ kind: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    expect(parseMusicLink('youtu.be/dQw4w9WgXcQ?t=10')).toMatchObject({ kind: 'youtube', type: 'video', id: 'dQw4w9WgXcQ' });
    expect(parseMusicLink('https://youtube.com/shorts/dQw4w9WgXcQ')).toMatchObject({ type: 'video', id: 'dQw4w9WgXcQ' });
    expect(parseMusicLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI')).toMatchObject({ type: 'video', list: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' });
    expect(parseMusicLink('https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI')).toMatchObject({ type: 'playlist', id: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI' });
  });

  it('entende faixas, álbuns e playlists do Spotify (inclusive com intl-pt e URI)', () => {
    expect(parseMusicLink('https://open.spotify.com/track/3zOYmiNOuyDL0ClxJcEJ0T?si=abc')).toEqual({ kind: 'spotify', type: 'track', id: '3zOYmiNOuyDL0ClxJcEJ0T' });
    expect(parseMusicLink('https://open.spotify.com/intl-pt/playlist/37i9dQZF1DXcBWIGoYBM5M')).toMatchObject({ type: 'playlist' });
    expect(parseMusicLink('spotify:album:37i9dQZF1DXcBWIGoYBM5M')).toMatchObject({ type: 'album' });
  });

  it('recusa o que não é YouTube nem Spotify', () => {
    expect(parseMusicLink('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseMusicLink('javascript:alert(1)')).toBeNull();
    expect(parseMusicLink('https://open.spotify.com/artist/37i9dQZF1DXcBWIGoYBM5M')).toBeNull();
  });

  it('itens vindos de fora são limpos (sem miniatura de domínio estranho)', () => {
    const it2 = sanitizeItem({ kind: 'youtube', ref: 'dQw4w9WgXcQ', title: 'a\u0000b', thumb: 'https://evil.com/x.png', durationMs: -5 });
    expect(it2).toEqual({ kind: 'youtube', ref: 'dQw4w9WgXcQ', title: 'ab', artist: '', thumb: '', durationMs: 0 });
    expect(sanitizeItem({ kind: 'youtube', ref: '../../x' })).toBeNull();
    expect(sanitizeItem({ kind: 'spotify', ref: 'spotify:track:3zOYmiNOuyDL0ClxJcEJ0T', thumb: 'https://i.scdn.co/image/ab67' })?.thumb).toBe('https://i.scdn.co/image/ab67');
  });

  it('posição esperada e fim da faixa', () => {
    const cur = { startedAt: 1000, durationMs: 60000, paused: false };
    expect(expectedPosition(cur, 31000)).toBe(30000);
    expect(expectedPosition({ ...cur, paused: true, pausedAt: 5000 }, 99999)).toBe(5000);
    expect(isTrackOver(cur, 1000 + 60000 + 3000)).toBe(false);
    expect(isTrackOver(cur, 1000 + 60000 + 5000)).toBe(true);
    expect(formatDuration(198840)).toBe('3:18');
    expect(formatDuration(3723000)).toBe('1:02:03');
  });
});

describe('comandos dos bots', () => {
  it('lê comandos e argumentos', () => {
    expect(parseCommand('/dado 2d6')).toEqual({ name: 'dado', args: '2d6' });
    expect(parseCommand('  /moeda ')).toEqual({ name: 'moeda', args: '' });
    expect(parseCommand('oi /dado')).toBeNull();
    expect(parseCommand('/')).toBeNull();
  });

  it('dados com limites', () => {
    const seq = [0, 0.5, 0.999];
    let i = 0;
    const rand = () => seq[i++ % seq.length];
    expect(rollDice('3d6', rand)).toMatchObject({ count: 3, sides: 6, rolls: [1, 4, 6], total: 11 });
    expect(rollDice('', () => 0)).toMatchObject({ count: 1, sides: 6 });
    expect(rollDice('d20', () => 0.999).total).toBe(20);
    expect(rollDice('99d6').error).toBeTruthy();
    expect(rollDice('2d1').error).toBeTruthy();
    expect(rollDice('abc').error).toBeTruthy();
  });

  it('moeda, escolher e sortear', () => {
    expect(runSorte('moeda', '', { username: 'ana', rand: () => 0.1 }).text).toContain('cara');
    expect(runSorte('escolher', 'pizza, hambúrguer', { username: 'ana', rand: () => 0.9 }).text).toContain('hambúrguer');
    expect(runSorte('escolher', 'só uma', { username: 'ana' }).error).toBeTruthy();
    expect(splitChoices('a; b | c')).toEqual(['a', 'b', 'c']);
    expect(runSorte('sortear', '', { username: 'ana', members: [{ id: '1', username: 'bia' }], rand: () => 0 }).text).toContain('@bia');
  });

  it('só aparecem comandos de bots ligados e permitidos ao cargo', () => {
    const s = server({ bots: { sorte: {}, vitrola: {} } });
    const names = (uid) => availableCommands(s, uid).map((c) => c.cmd.name);
    expect(names('membro')).toContain('dado');
    expect(names('membro')).toContain('tocar');
    expect(names('membro')).not.toContain('pular'); // controlar a Vitrola é de moderador
    expect(names('mod')).toContain('pular');
    expect(findCommand(s, 'limpar')?.bot.id).toBe('vitrola');
    expect(availableCommands(server(), 'membro')).toEqual([]);
    const locked = server({ bots: { sorte: {}, vitrola: {} }, rolePermissions: { moderator: [], member: [] } });
    // sem "usar bots" só sobra pedir música (livre para todos)
    expect(availableCommands(locked, 'membro').map((c) => c.cmd.name).sort()).toEqual(['ajuda', 'fila', 'tocar']);
    expect(availableCommands(locked, 'adm').length).toBeGreaterThan(0);
  });
});

describe('Guarda', () => {
  const guarded = (cfg) => server({ bots: { guarda: { config: guardConfigToSave(cfg) } } });

  it('palavra inteira, sem confundir com pedaço de outra', () => {
    const s = guarded({ words: 'feio, chato', blockLinks: false, maxMentions: 5 });
    expect(guardVerdict(s, { content: 'que FEIO!' }, false)).toMatch(/palavra proibida/);
    expect(guardVerdict(s, { content: 'feiosamente' }, false)).toBeNull();
    expect(guardVerdict(s, { content: 'que feio' }, true)).toBeNull(); // moderador passa
  });

  it('links e menções', () => {
    const s = guarded({ words: '', blockLinks: true, maxMentions: 2 });
    expect(guardVerdict(s, { content: 'olha www.site.com' }, false)).toMatch(/links/);
    expect(guardVerdict(s, { content: 'oi', mentions: ['a', 'b', 'c'] }, false)).toMatch(/2 menções/);
    expect(guardVerdict(s, { content: 'oi', mentions: ['a'] }, false)).toBeNull();
  });

  it('lista de palavras limpa e expressão escapada', () => {
    expect(cleanWordList('Aa, aa ,b, xy')).toEqual(['aa', 'xy']); // minúsculas, sem repetir, 2+ letras
    expect(wordsPattern(['a.b'])).toContain('a\\.b');
    expect(wordsPattern([])).toBe('');
  });

  it('boas-vindas do Porteiro', () => {
    expect(welcomeText('Oi {usuario}, bem-vindo ao {servidor}', { username: 'ana', serverName: 'Quintal' })).toBe('Oi @ana, bem-vindo ao Quintal');
  });
});

describe('permissões por cargo', () => {
  it('padrões, admins com tudo e mapa salvo', () => {
    expect(permissionsForRole(server(), 'member')).toEqual(DEFAULT_ROLE_PERMISSIONS.member);
    expect(hasPermission(server(), 'adm', 'bots.manage')).toBe(true);
    expect(hasPermission(server(), 'mod', 'bots.manage')).toBe(false);
    expect(hasPermission(server(), 'estranho', 'bots.use')).toBe(false);
    const custom = server({ rolePermissions: { moderator: ['bots.manage'], member: ['bots.use', 'inventada'] } });
    expect(hasPermission(custom, 'mod', 'bots.manage')).toBe(true);
    expect(permissionsForRole(custom, 'member')).toEqual(['bots.use']);
    expect(normalizeRolePermissions({ member: ['room.theme', 'xx'] })).toEqual({ moderator: DEFAULT_ROLE_PERMISSIONS.moderator, member: ['room.theme'] });
  });
});
