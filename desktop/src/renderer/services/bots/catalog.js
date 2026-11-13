// Bots nativos do Quintal. Não há servidor de bots: cada bot é código do próprio app
// que roda no cliente de quem usa o comando (ou de quem está na chamada, no caso da
// Vitrola). O servidor guarda só quais bots estão ligados e a configuração de cada um
// (campo `bots` do documento do servidor), e as regras do Firestore conferem tudo.
//
// Toda mensagem de bot leva `bot: <id>` e é gravada em nome de quem a provocou; o app
// mostra "via @pessoa" para ninguém conseguir se passar por um bot sem deixar rastro.

const svg = (bg, fg, body) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='${bg}'/><g fill='none' stroke='${fg}' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'>${body}</g></svg>`
)}`;

export const BOTS = [
  {
    id: 'vitrola',
    name: 'Vitrola',
    tagline: 'Toca YouTube e Spotify para todo mundo da chamada',
    description:
      'Fila de músicas por canal de voz. Aceita links e playlists do YouTube e do Spotify; cada pessoa ouve pelo player oficial, sincronizado com os outros. Qualquer pessoa do servidor pede músicas; quem pode pausar e pular vem das permissões.',
    color: '#e8783f',
    avatar: svg('#e8783f', '#1c120c', "<circle cx='32' cy='32' r='18'/><circle cx='32' cy='32' r='5' fill='#1c120c'/><path d='M32 14a18 18 0 0 1 15 8'/>"),
    commands: [
      { name: 'tocar', args: '<link do YouTube ou Spotify>', help: 'Coloca uma música ou playlist na fila do canal de voz em que você está.', open: true },
      { name: 'fila', args: '', help: 'Mostra o que está tocando e as próximas da fila.', open: true },
      { name: 'pular', args: '', help: 'Pula a música atual.', permission: 'music.control' },
      { name: 'pausar', args: '', help: 'Pausa para todos.', permission: 'music.control' },
      { name: 'continuar', args: '', help: 'Continua de onde parou.', permission: 'music.control' },
      { name: 'limpar', args: '', help: 'Esvazia a fila.', permission: 'music.control' }
    ],
    defaults: {}
  },
  {
    id: 'porteiro',
    name: 'Porteiro',
    tagline: 'Recebe quem chega ao servidor',
    description: 'Manda uma mensagem de boas-vindas num canal de texto sempre que alguém entra pelo convite. Use {usuario} e {servidor} no texto.',
    color: '#6baf7b',
    avatar: svg('#6baf7b', '#10200f', "<path d='M22 50V16h20v34'/><path d='M14 50h36'/><circle cx='37' cy='34' r='1.6' fill='#10200f'/>"),
    commands: [],
    defaults: { channelId: null, message: 'Chegou {usuario}! Seja bem-vindo(a) ao {servidor}. Puxa uma cadeira.' }
  },
  {
    id: 'guarda',
    name: 'Guarda',
    tagline: 'Barra palavrões, links e spam de menções',
    description:
      'Bloqueia mensagens com palavras proibidas, links (se você quiser) e excesso de menções. Moderadores passam livres. O bloqueio também vale nas regras do servidor, então não dá para burlar com outro app.',
    color: '#5b8bd6',
    avatar: svg('#5b8bd6', '#0f1a2c', "<path d='M32 12l16 6v12c0 10-7 18-16 22-9-4-16-12-16-22V18z'/><path d='M25 32l5 5 9-10'/>"),
    commands: [],
    defaults: { words: [], blockLinks: false, maxMentions: 8 }
  },
  {
    id: 'sorte',
    name: 'Sorte',
    tagline: 'Dados, moeda, sorteios e escolhas',
    description: 'Para resolver quem paga a próxima rodada: rola dados (até 20d100), joga moeda, escolhe entre opções e sorteia alguém do canal.',
    color: '#d9a640',
    avatar: svg('#d9a640', '#2a1d05', "<rect x='16' y='16' width='32' height='32' rx='6'/><circle cx='25' cy='25' r='2.4' fill='#2a1d05'/><circle cx='39' cy='39' r='2.4' fill='#2a1d05'/><circle cx='32' cy='32' r='2.4' fill='#2a1d05'/>"),
    commands: [
      { name: 'dado', args: '[2d6]', help: 'Rola dados. Sem nada, rola 1d6.' },
      { name: 'moeda', args: '', help: 'Cara ou coroa.' },
      { name: 'escolher', args: '<opção, opção, ...>', help: 'Escolhe uma das opções separadas por vírgula.' },
      { name: 'sortear', args: '', help: 'Sorteia uma pessoa do servidor.' }
    ],
    defaults: {}
  }
];

export const BOT_IDS = BOTS.map((b) => b.id);
export const botById = (id) => BOTS.find((b) => b.id === id) || null;

/** Bots ligados no servidor, na ordem do catálogo. */
export function enabledBots(server) {
  const map = server?.bots || {};
  return BOTS.filter((b) => map[b.id]);
}

export function isBotEnabled(server, id) {
  return Boolean(server?.bots?.[id]);
}

export function botConfig(server, id) {
  const bot = botById(id);
  return { ...(bot?.defaults || {}), ...(server?.bots?.[id]?.config || {}) };
}

// --- Guarda ---------------------------------------------------------------

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Limpa a lista de palavras (minúsculas, sem repetição, até 100 de até 40 letras). */
export function cleanWordList(raw) {
  const list = (Array.isArray(raw) ? raw : String(raw || '').split(/[,\n]/))
    .map((w) => String(w).trim().toLowerCase())
    .filter((w) => w.length >= 2 && w.length <= 40);
  return Array.from(new Set(list)).slice(0, 100);
}

/**
 * Expressão (RE2, a mesma sintaxe das regras do Firestore) que casa com qualquer
 * palavra proibida como palavra inteira. Vai salva no servidor para as regras usarem.
 */
export function wordsPattern(words) {
  const list = cleanWordList(words);
  if (!list.length) return '';
  return `(?s).*(^|[^\\pL\\pN])(${list.map(escapeRegex).join('|')})($|[^\\pL\\pN]).*`;
}

export const LINK_PATTERN = '(?s).*(https?://|www\\.).*';

/** Motivo do bloqueio (texto para a pessoa) ou null. Moderadores não são filtrados. */
export function guardVerdict(server, { content = '', mentions = [] }, isModeratorUser) {
  if (!isBotEnabled(server, 'guarda') || isModeratorUser) return null;
  const cfg = botConfig(server, 'guarda');
  const text = String(content).toLowerCase();
  if (cfg.pattern) {
    try {
      // \p{L} no JS precisa da flag u; a expressão salva é no formato RE2
      const re = new RegExp(cfg.pattern.replace('(?s)', '').replace(/\\pL/g, '\\p{L}').replace(/\\pN/g, '\\p{N}'), 'su');
      if (re.test(text)) return 'O Guarda barrou esta mensagem: ela tem uma palavra proibida neste servidor.';
    } catch {
      // expressão inválida: as regras do servidor decidem
    }
  }
  if (cfg.blockLinks && /(https?:\/\/|www\.)/i.test(text)) return 'O Guarda barrou esta mensagem: links não são permitidos neste servidor.';
  if (Number.isInteger(cfg.maxMentions) && mentions.length > cfg.maxMentions) {
    return `O Guarda barrou esta mensagem: no máximo ${cfg.maxMentions} menções por mensagem.`;
  }
  return null;
}

/** Configuração do Guarda pronta para salvar (inclui a expressão usada nas regras). */
export function guardConfigToSave({ words, blockLinks, maxMentions }) {
  const list = cleanWordList(words);
  const max = Math.max(1, Math.min(50, Math.round(Number(maxMentions) || 8)));
  return { words: list, pattern: wordsPattern(list), blockLinks: Boolean(blockLinks), maxMentions: max };
}

// --- Porteiro -------------------------------------------------------------

export function welcomeText(template, { username, serverName }) {
  return String(template || botById('porteiro').defaults.message)
    .replaceAll('{usuario}', `@${username}`)
    .replaceAll('{servidor}', serverName)
    .slice(0, 500);
}
