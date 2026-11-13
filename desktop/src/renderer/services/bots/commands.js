// Comandos "/" dos bots no chat. As funções aqui são puras (testáveis); quem envia
// as mensagens e mexe na fila de música é o ChatView (via services/bots/music.js).
import { BOTS, isBotEnabled } from './catalog';
import { hasPermission } from '../permissions';

/** "/dado 2d6" → { name: 'dado', args: '2d6' }; texto comum → null. */
export function parseCommand(text) {
  const m = String(text || '').trim().match(/^\/([a-zçãé]{2,20})(?:\s+([\s\S]*))?$/i);
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: (m[2] || '').trim() };
}

const HELP = { name: 'ajuda', args: '', help: 'Lista os comandos dos bots deste servidor.' };

/** Comandos que a pessoa pode usar agora (bots ligados + permissões). */
export function availableCommands(server, userId) {
  const canUse = hasPermission(server, userId, 'bots.use');
  const out = [];
  BOTS.forEach((bot) => {
    if (!isBotEnabled(server, bot.id)) return;
    bot.commands.forEach((cmd) => {
      if (!canUse && !cmd.open) return; // pedir música é livre para todos
      if (cmd.permission && !hasPermission(server, userId, cmd.permission)) return;
      out.push({ bot, cmd });
    });
  });
  if (out.length) out.push({ bot: null, cmd: HELP });
  return out;
}

/** Acha o bot dono de um comando (mesmo sem permissão, para explicar o motivo). */
export function findCommand(server, name) {
  if (name === 'ajuda') return { bot: null, cmd: HELP };
  for (const bot of BOTS) {
    if (!isBotEnabled(server, bot.id)) continue;
    const cmd = bot.commands.find((c) => c.name === name);
    if (cmd) return { bot, cmd };
  }
  return null;
}

export function helpText(server, userId) {
  const list = availableCommands(server, userId).filter((c) => c.bot);
  if (!list.length) return 'Nenhum comando disponível para você neste servidor.';
  return list.map(({ bot, cmd }) => `\`/${cmd.name}${cmd.args ? ` ${cmd.args}` : ''}\` — ${cmd.help} _(${bot.name})_`).join('\n');
}

// --- Sorte ------------------------------------------------------------------

export const MAX_DICE = 20;
export const MAX_SIDES = 100;

/** "2d6", "d20", "3" (= 3d6) ou "" (= 1d6). */
export function rollDice(spec, rand = Math.random) {
  const s = String(spec || '').trim().toLowerCase();
  const m = s === '' ? ['', '1', '6'] : s.match(/^(\d{1,2})?\s*d\s*(\d{1,3})$/) || (/^\d{1,2}$/.test(s) ? ['', s, '6'] : null);
  if (!m) return { error: 'Use o formato NdM, por exemplo /dado 2d6.' };
  const count = Number(m[1] || 1);
  const sides = Number(m[2]);
  if (count < 1 || count > MAX_DICE) return { error: `Dá para rolar de 1 a ${MAX_DICE} dados.` };
  if (sides < 2 || sides > MAX_SIDES) return { error: `Os dados vão de 2 a ${MAX_SIDES} lados.` };
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(rand() * sides));
  return { count, sides, rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

export function splitChoices(args) {
  return String(args || '')
    .split(/[,;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

/**
 * Executa um comando do Sorte. Devolve { text } (mensagem do bot) ou { error }.
 * `members`: [{ id, username }] para o /sortear.
 */
export function runSorte(name, args, { username, members = [], rand = Math.random } = {}) {
  switch (name) {
    case 'dado': {
      const r = rollDice(args, rand);
      if (r.error) return { error: r.error };
      const detail = r.count > 1 ? ` (${r.rolls.join(' + ')})` : '';
      return { text: `@${username} rolou **${r.count}d${r.sides}**: **${r.total}**${detail}` };
    }
    case 'moeda':
      return { text: `@${username} jogou a moeda: **${rand() < 0.5 ? 'cara' : 'coroa'}**` };
    case 'escolher': {
      const options = splitChoices(args);
      if (options.length < 2) return { error: 'Passe pelo menos duas opções separadas por vírgula: /escolher pizza, hambúrguer' };
      return { text: `Entre ${options.map((o) => `“${o}”`).join(', ')}, fico com **${options[Math.floor(rand() * options.length)]}**.` };
    }
    case 'sortear': {
      const pool = members.filter((m) => m && m.username);
      if (!pool.length) return { error: 'Não há ninguém para sortear.' };
      return { text: `E o sorteado é… **@${pool[Math.floor(rand() * pool.length)].username}**!` };
    }
    default:
      return { error: 'Comando desconhecido.' };
  }
}
