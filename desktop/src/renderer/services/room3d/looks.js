// Aparência dos avatares: catálogo de opções, estilos prontos e validação.
// Os corpos, cabelos e roupas são modelos 3D de verdade (public/avatars, gerados de
// personagens CC0 da Quaternius); chapéus, óculos e acessórios são peças por código.
// O visual de cada pessoa trafega pelo canal de dados da sala, então tudo que chega é
// conferido contra estas listas (nada de cor ou texto livre vindo de outra pessoa).

export const SKIN_TONES = ['#f6d7c3', '#eac0a0', '#d9a77f', '#c68e62', '#a8714a', '#8a5636', '#6b3f26', '#4a2a19', '#fbe4d6', '#e3b98f', '#b98a5e', '#3a2014'];
export const HAIR_COLORS = ['#1c1714', '#3b2619', '#6b4428', '#a8743f', '#d9b36c', '#e8dcc8', '#9a3b26', '#c94f7c', '#3f6fd1', '#3fae8a', '#8a8f98', '#f2efe8', '#d1662f', '#7a4fc4', '#e8a0b4', '#2f2f3a'];
export const EYE_COLORS = ['#3b2619', '#6b4428', '#3f7a3a', '#3f6fd1', '#6b7280', '#8a5ac9', '#a8743f', '#2f9aa8'];
export const CLOTH_COLORS = [
  '#1f2430', '#f2efe8', '#c0392b', '#e67e22', '#f1c40f', '#27ae60',
  '#1abc9c', '#2e86de', '#5b4bc4', '#d14d72', '#7f5539', '#95a5a6',
  '#0f3d2e', '#6b1f2b', '#f4b6c2', '#a7d3f0', '#c9b27a', '#556b2f',
  '#ff8c69', '#3a3a46', '#e8dcc8', '#8e44ad', '#b8860b', '#0b6e8a'
];

export const OPTIONS = {
  body: [
    { id: 'masculino', label: 'Masculino' },
    { id: 'feminino', label: 'Feminino' }
  ],
  build: [
    { id: 'esguio', label: 'Esguio' },
    { id: 'medio', label: 'Médio' },
    { id: 'forte', label: 'Forte' }
  ],
  hair: [
    { id: 'curto', label: 'Curto repartido' },
    { id: 'raspado', label: 'Raspado' },
    { id: 'longo', label: 'Longo' },
    { id: 'coque', label: 'Coques' },
    { id: 'careca', label: 'Careca' }
  ],
  brows: [
    { id: 'grossa', label: 'Grossas' },
    { id: 'fina', label: 'Finas' },
    { id: 'nenhuma', label: 'Nenhuma' }
  ],
  beard: [
    { id: 'nenhuma', label: 'Nenhuma' },
    { id: 'cheia', label: 'Barba' }
  ],
  top: [
    { id: 'camiseta', label: 'Camiseta' },
    { id: 'regata', label: 'Regata' },
    { id: 'cropped', label: 'Cropped' },
    { id: 'mangalonga', label: 'Manga longa' },
    { id: 'xadrez', label: 'Camisa xadrez' },
    { id: 'listrada', label: 'Listrada' },
    { id: 'moletom', label: 'Moletom' },
    { id: 'vestido', label: 'Vestido' }
  ],
  bottom: [
    { id: 'jeans', label: 'Jeans' },
    { id: 'calca', label: 'Calça' },
    { id: 'legging', label: 'Legging' },
    { id: 'shorts', label: 'Shorts' },
    { id: 'bermuda', label: 'Bermuda' },
    { id: 'saia', label: 'Saia' },
    { id: 'saialonga', label: 'Saia longa' }
  ],
  shoes: [
    { id: 'tenis', label: 'Tênis' },
    { id: 'bota', label: 'Bota' },
    { id: 'descalco', label: 'Descalço' }
  ],
  hat: [
    { id: 'nenhum', label: 'Nenhum' },
    { id: 'bone', label: 'Boné' },
    { id: 'gorro', label: 'Gorro' },
    { id: 'chapeu', label: 'Chapéu de abas' },
    { id: 'cowboy', label: 'Chapéu de cowboy' },
    { id: 'boina', label: 'Boina' },
    { id: 'viseira', label: 'Viseira' },
    { id: 'bandana', label: 'Bandana' },
    { id: 'tiara', label: 'Tiara' },
    { id: 'flor', label: 'Flor no cabelo' },
    { id: 'coroa', label: 'Coroa' },
    { id: 'mago', label: 'Chapéu de mago' },
    { id: 'pirata', label: 'Chapéu de pirata' },
    { id: 'chef', label: 'Chapéu de chef' },
    { id: 'gato', label: 'Orelhas de gato' }
  ],
  glasses: [
    { id: 'nenhum', label: 'Nenhum' },
    { id: 'redondo', label: 'Redondo' },
    { id: 'quadrado', label: 'Quadrado' },
    { id: 'escuro', label: 'Óculos escuros' },
    { id: 'aviador', label: 'Aviador' },
    { id: 'tapaolho', label: 'Tapa-olho' }
  ],
  earrings: [
    { id: 'nenhum', label: 'Nenhum' },
    { id: 'ponto', label: 'Ponto de luz' },
    { id: 'argola', label: 'Argola' }
  ],
  extra: [
    { id: 'nenhum', label: 'Nenhum' },
    { id: 'mochila', label: 'Mochila' },
    { id: 'fones', label: 'Fones de ouvido' },
    { id: 'cachecol', label: 'Cachecol' },
    { id: 'colar', label: 'Colar' },
    { id: 'gravata', label: 'Gravata' },
    { id: 'bolsa', label: 'Bolsa transversal' },
    { id: 'capa', label: 'Capa' }
  ]
};

const ids = (key) => OPTIONS[key].map((o) => o.id);
const KEYS = ['body', 'build', 'hair', 'brows', 'beard', 'top', 'bottom', 'shoes', 'hat', 'glasses', 'earrings', 'extra'];

export const DEFAULT_LOOK = {
  body: 'masculino', build: 'medio', height: 1, skin: 2, hair: 'curto', hairColor: 1, eyes: 0, brows: 'grossa', beard: 'nenhuma',
  top: 'camiseta', topColor: 7, accentColor: 1, bottom: 'jeans', bottomColor: 0, shoes: 'tenis', shoesColor: 1,
  hat: 'nenhum', hatColor: 0, glasses: 'nenhum', earrings: 'nenhum', extra: 'nenhum', extraColor: 2
};

// Estilos prontos (originais). Não mudam pele, corpo, altura nem olhos da pessoa.
export const PRESETS = [
  { id: 'casual', label: 'Casual', look: { hair: 'curto', top: 'camiseta', topColor: 7, bottom: 'jeans', bottomColor: 0, shoes: 'tenis', shoesColor: 1, hat: 'nenhum', glasses: 'nenhum', extra: 'nenhum' } },
  { id: 'balada', label: 'Balada', look: { hair: 'longo', top: 'cropped', topColor: 0, bottom: 'legging', bottomColor: 0, shoes: 'bota', shoesColor: 0, earrings: 'argola', extra: 'bolsa', extraColor: 13 } },
  { id: 'praia', label: 'Dia de praia', look: { hair: 'raspado', top: 'regata', topColor: 9, bottom: 'bermuda', bottomColor: 21, shoes: 'descalco', hat: 'viseira', hatColor: 1, glasses: 'escuro', extra: 'nenhum' } },
  { id: 'lenhador', label: 'Lenhador', look: { hair: 'curto', beard: 'cheia', top: 'xadrez', topColor: 2, accentColor: 0, bottom: 'jeans', bottomColor: 10, shoes: 'bota', shoesColor: 10, hat: 'gorro', hatColor: 0 } },
  { id: 'skatista', label: 'Skatista', look: { hair: 'raspado', top: 'moletom', topColor: 4, bottom: 'bermuda', bottomColor: 0, shoes: 'tenis', shoesColor: 2, hat: 'bone', hatColor: 0, extra: 'fones', extraColor: 0 } },
  { id: 'executivo', label: 'Executivo', look: { hair: 'curto', top: 'mangalonga', topColor: 1, bottom: 'calca', bottomColor: 0, shoes: 'bota', shoesColor: 0, extra: 'gravata', extraColor: 2, glasses: 'quadrado' } },
  { id: 'vestido', label: 'Noite de festa', look: { hair: 'coque', top: 'vestido', topColor: 13, shoes: 'tenis', shoesColor: 0, earrings: 'ponto', extra: 'colar', extraColor: 22 } },
  { id: 'marinheiro', label: 'Marinheiro', look: { hair: 'curto', top: 'listrada', topColor: 7, accentColor: 1, bottom: 'calca', bottomColor: 1, shoes: 'tenis', shoesColor: 1, hat: 'bone', hatColor: 1 } },
  { id: 'esportista', label: 'Esportista', look: { hair: 'coque', top: 'regata', topColor: 2, bottom: 'shorts', bottomColor: 0, shoes: 'tenis', shoesColor: 1, hat: 'bandana', hatColor: 2, extra: 'nenhum' } },
  { id: 'inverno', label: 'Inverno', look: { hair: 'longo', top: 'moletom', topColor: 13, bottom: 'jeans', bottomColor: 0, shoes: 'bota', shoesColor: 10, hat: 'gorro', hatColor: 1, extra: 'cachecol', extraColor: 2 } },
  { id: 'cowboy', label: 'Cowboy', look: { hair: 'curto', beard: 'cheia', top: 'xadrez', topColor: 10, accentColor: 16, bottom: 'jeans', bottomColor: 0, shoes: 'bota', shoesColor: 10, hat: 'cowboy', hatColor: 10, extra: 'cachecol', extraColor: 2 } },
  { id: 'boemia', label: 'Boêmia', look: { hair: 'longo', top: 'mangalonga', topColor: 16, bottom: 'saialonga', bottomColor: 10, shoes: 'descalco', hat: 'flor', hatColor: 9, earrings: 'argola', extra: 'colar', extraColor: 22 } },
  { id: 'colegial', label: 'Colegial', look: { hair: 'coque', top: 'mangalonga', topColor: 1, bottom: 'saia', bottomColor: 7, shoes: 'tenis', shoesColor: 0, extra: 'mochila', extraColor: 8, glasses: 'redondo' } },
  { id: 'pirata', label: 'Pirata', look: { hair: 'longo', hairColor: 0, beard: 'cheia', top: 'listrada', topColor: 0, accentColor: 1, bottom: 'calca', bottomColor: 10, shoes: 'bota', shoesColor: 0, hat: 'pirata', glasses: 'tapaolho' } },
  { id: 'mago', label: 'Mago', look: { hair: 'longo', hairColor: 5, beard: 'cheia', top: 'vestido', topColor: 8, shoes: 'bota', shoesColor: 10, hat: 'mago', hatColor: 8, extra: 'capa', extraColor: 8 } },
  { id: 'realeza', label: 'Realeza', look: { hair: 'longo', hairColor: 4, top: 'vestido', topColor: 9, shoes: 'tenis', shoesColor: 4, hat: 'coroa', extra: 'capa', extraColor: 8, earrings: 'ponto' } },
  { id: 'chef', label: 'Chef', look: { hair: 'raspado', top: 'mangalonga', topColor: 1, bottom: 'calca', bottomColor: 0, shoes: 'tenis', shoesColor: 0, hat: 'chef' } },
  { id: 'gatinho', label: 'Fofura felina', look: { hair: 'curto', hairColor: 3, top: 'moletom', topColor: 9, bottom: 'shorts', bottomColor: 1, shoes: 'tenis', shoesColor: 1, hat: 'gato', hatColor: 3 } }
];

const intIn = (v, len) => (Number.isInteger(v) && v >= 0 && v < len ? v : null);

/** Normaliza uma aparência (do disco ou de outra pessoa). Valores inválidos viram o padrão. */
export function validateLook(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const look = { ...DEFAULT_LOOK };
  for (const key of KEYS) {
    if (ids(key).includes(r[key])) look[key] = r[key];
  }
  // aparências da versão anterior (bonecos por código)
  if (r.body === 'neutro') look.body = 'masculino';
  if (r.beard === 'curta' || r.beard === 'bigode') look.beard = 'cheia';
  if (['cacheado', 'black', 'rabo', 'franja', 'chanel', 'ondulado', 'trancas', 'dreads', 'chiquinhas'].includes(r.hair)) look.hair = 'longo';
  if (['espetado', 'moicano', 'pixie', 'topete'].includes(r.hair)) look.hair = 'raspado';
  if (['social', 'jaqueta', 'jaleco', 'kimono', 'sueter', 'blazer', 'polo', 'traje', 'armadura', 'colete'].includes(r.top)) look.top = 'mangalonga';
  const height = Number(r.height);
  if (Number.isFinite(height)) look.height = Math.max(0.9, Math.min(1.1, Math.round(height * 100) / 100));
  const colors = {
    skin: SKIN_TONES, hairColor: HAIR_COLORS, eyes: EYE_COLORS, topColor: CLOTH_COLORS, accentColor: CLOTH_COLORS,
    bottomColor: CLOTH_COLORS, shoesColor: CLOTH_COLORS, extraColor: CLOTH_COLORS, hatColor: CLOTH_COLORS
  };
  for (const [key, palette] of Object.entries(colors)) {
    const v = intIn(r[key], palette.length);
    if (v !== null) look[key] = v;
  }
  return look;
}

/** Aplica um estilo pronto mantendo pele, corpo, altura e olhos da pessoa. */
export function applyPreset(look, presetId) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return look;
  return validateLook({
    ...DEFAULT_LOOK,
    skin: look.skin, height: look.height, build: look.build, eyes: look.eyes, body: look.body, brows: look.brows, hairColor: look.hairColor,
    ...preset.look
  });
}

/** Aparência inicial estável para quem nunca personalizou (cada pessoa começa diferente). */
export function defaultLookFor(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const body = (h >>> 22) % 2 ? 'feminino' : 'masculino';
  const hairs = body === 'feminino' ? ['longo', 'coque', 'curto', 'longo'] : ['curto', 'raspado', 'curto', 'longo'];
  const tops = ['camiseta', 'moletom', 'mangalonga', 'regata', 'xadrez', 'listrada'];
  return validateLook({
    ...DEFAULT_LOOK,
    body,
    brows: body === 'feminino' ? 'fina' : 'grossa',
    skin: h % SKIN_TONES.length,
    hair: hairs[(h >>> 3) % hairs.length],
    hairColor: (h >>> 6) % 6,
    top: tops[(h >>> 9) % tops.length],
    topColor: (h >>> 12) % CLOTH_COLORS.length,
    bottom: ['jeans', 'calca', 'bermuda'][(h >>> 15) % 3],
    bottomColor: [0, 10, 11][(h >>> 17) % 3],
    build: ['esguio', 'medio', 'forte'][(h >>> 19) % 3],
    height: 0.95 + ((h >>> 21) % 9) / 100
  });
}

const LOOK_KEY = 'concord_avatar_look';
export function loadMyLook(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null');
    if (raw) return validateLook(raw);
  } catch {
    // aparência corrompida: usa a inicial
  }
  return defaultLookFor(userId);
}
export function saveMyLook(look) {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(validateLook(look)));
  } catch {
    // sem espaço: segue só na memória
  }
}
