// Aparência dos avatares humanos: catálogo de opções, estilos prontos e validação.
// O visual de cada pessoa trafega pelo canal de dados da sala, então tudo que chega
// é conferido contra estas listas (nada de cor ou texto livre vindo de outra pessoa).
//
// Os estilos prontos são arquétipos originais (ninja, astronauta, mago...), não cópias
// de personagens de filmes, animes ou jogos.

export const SKIN_TONES = ['#f6d7c3', '#eac0a0', '#d9a77f', '#c68e62', '#a8714a', '#8a5636', '#6b3f26', '#4a2a19'];
export const HAIR_COLORS = ['#1c1714', '#3b2619', '#6b4428', '#a8743f', '#d9b36c', '#e8dcc8', '#9a3b26', '#c94f7c', '#3f6fd1', '#3fae8a'];
export const EYE_COLORS = ['#3b2619', '#6b4428', '#3f7a3a', '#3f6fd1', '#6b7280', '#8a5ac9'];
export const CLOTH_COLORS = [
  '#1f2430', '#f2efe8', '#c0392b', '#e67e22', '#f1c40f', '#27ae60',
  '#1abc9c', '#2e86de', '#5b4bc4', '#d14d72', '#7f5539', '#95a5a6'
];

export const OPTIONS = {
  build: [
    { id: 'esguio', label: 'Esguio' },
    { id: 'medio', label: 'Médio' },
    { id: 'forte', label: 'Forte' }
  ],
  hair: [
    { id: 'curto', label: 'Curto' },
    { id: 'raspado', label: 'Raspado' },
    { id: 'cacheado', label: 'Cacheado' },
    { id: 'black', label: 'Black power' },
    { id: 'longo', label: 'Longo' },
    { id: 'rabo', label: 'Rabo de cavalo' },
    { id: 'coque', label: 'Coque' },
    { id: 'moicano', label: 'Moicano' },
    { id: 'espetado', label: 'Espetado' },
    { id: 'careca', label: 'Careca' }
  ],
  beard: [
    { id: 'nenhuma', label: 'Nenhuma' },
    { id: 'bigode', label: 'Bigode' },
    { id: 'curta', label: 'Barba curta' },
    { id: 'cheia', label: 'Barba cheia' }
  ],
  top: [
    { id: 'camiseta', label: 'Camiseta' },
    { id: 'regata', label: 'Regata' },
    { id: 'moletom', label: 'Moletom com capuz' },
    { id: 'jaqueta', label: 'Jaqueta' },
    { id: 'social', label: 'Camisa social' },
    { id: 'vestido', label: 'Vestido' },
    { id: 'kimono', label: 'Kimono' },
    { id: 'jaleco', label: 'Jaleco' },
    { id: 'traje', label: 'Traje espacial' },
    { id: 'armadura', label: 'Armadura' }
  ],
  bottom: [
    { id: 'calca', label: 'Calça' },
    { id: 'jeans', label: 'Jeans' },
    { id: 'shorts', label: 'Shorts' },
    { id: 'saia', label: 'Saia' }
  ],
  shoes: [
    { id: 'tenis', label: 'Tênis' },
    { id: 'bota', label: 'Bota' },
    { id: 'sapato', label: 'Sapato' },
    { id: 'descalco', label: 'Descalço' }
  ],
  hat: [
    { id: 'nenhum', label: 'Nenhum' },
    { id: 'bone', label: 'Boné' },
    { id: 'gorro', label: 'Gorro' },
    { id: 'chapeu', label: 'Chapéu de abas' },
    { id: 'cowboy', label: 'Chapéu de cowboy' },
    { id: 'mago', label: 'Chapéu de mago' },
    { id: 'pirata', label: 'Chapéu de pirata' },
    { id: 'chef', label: 'Chapéu de chef' },
    { id: 'coroa', label: 'Coroa' },
    { id: 'capacete', label: 'Capacete espacial' },
    { id: 'bandana', label: 'Bandana' },
    { id: 'faixa', label: 'Faixa ninja' },
    { id: 'gato', label: 'Orelhas de gato' }
  ],
  glasses: [
    { id: 'nenhum', label: 'Nenhum' },
    { id: 'redondo', label: 'Redondo' },
    { id: 'quadrado', label: 'Quadrado' },
    { id: 'escuro', label: 'Óculos escuros' },
    { id: 'tapaolho', label: 'Tapa-olho' },
    { id: 'mascara', label: 'Máscara' }
  ],
  extra: [
    { id: 'nenhum', label: 'Nenhum' },
    { id: 'capa', label: 'Capa' },
    { id: 'mochila', label: 'Mochila' },
    { id: 'fones', label: 'Fones de ouvido' },
    { id: 'cachecol', label: 'Cachecol' },
    { id: 'asas', label: 'Asas' },
    { id: 'espada', label: 'Espada nas costas' }
  ]
};

const ids = (key) => OPTIONS[key].map((o) => o.id);

export const DEFAULT_LOOK = {
  build: 'medio', height: 1, skin: 2, hair: 'curto', hairColor: 1, eyes: 0, beard: 'nenhuma',
  top: 'camiseta', topColor: 7, bottom: 'jeans', bottomColor: 0, shoes: 'tenis', shoesColor: 1,
  hat: 'nenhum', hatColor: 0, glasses: 'nenhum', extra: 'nenhum', extraColor: 2
};

// Estilos prontos (arquétipos originais). Não definem pele: cada pessoa mantém o próprio tom.
export const PRESETS = [
  { id: 'casual', label: 'Casual', look: { hair: 'curto', top: 'camiseta', topColor: 7, bottom: 'jeans', bottomColor: 0, shoes: 'tenis', shoesColor: 1, hat: 'nenhum', glasses: 'nenhum', extra: 'nenhum' } },
  { id: 'ninja', label: 'Ninja', look: { hair: 'curto', hairColor: 0, top: 'kimono', topColor: 0, bottom: 'calca', bottomColor: 0, shoes: 'descalco', hat: 'faixa', glasses: 'mascara', extra: 'espada', extraColor: 0 } },
  { id: 'astronauta', label: 'Astronauta', look: { top: 'traje', topColor: 1, bottom: 'calca', bottomColor: 1, shoes: 'bota', shoesColor: 11, hat: 'capacete', glasses: 'nenhum', extra: 'mochila', extraColor: 1 } },
  { id: 'mago', label: 'Mago', look: { hair: 'longo', hairColor: 5, beard: 'cheia', top: 'vestido', topColor: 8, bottom: 'calca', bottomColor: 8, shoes: 'sapato', shoesColor: 10, hat: 'mago', glasses: 'nenhum', extra: 'capa', extraColor: 8 } },
  { id: 'pirata', label: 'Pirata', look: { hair: 'longo', hairColor: 0, beard: 'curta', top: 'social', topColor: 1, bottom: 'calca', bottomColor: 10, shoes: 'bota', shoesColor: 0, hat: 'pirata', glasses: 'tapaolho', extra: 'nenhum' } },
  { id: 'detetive', label: 'Detetive', look: { hair: 'curto', top: 'jaqueta', topColor: 10, bottom: 'calca', bottomColor: 10, shoes: 'sapato', shoesColor: 0, hat: 'chapeu', hatColor: 10, glasses: 'nenhum', extra: 'cachecol', extraColor: 2 } },
  { id: 'skatista', label: 'Skatista', look: { hair: 'espetado', top: 'moletom', topColor: 4, bottom: 'shorts', bottomColor: 0, shoes: 'tenis', shoesColor: 2, hat: 'bone', glasses: 'nenhum', extra: 'fones', extraColor: 0 } },
  { id: 'chef', label: 'Chef', look: { hair: 'curto', top: 'jaleco', topColor: 1, bottom: 'calca', bottomColor: 0, shoes: 'sapato', shoesColor: 0, hat: 'chef', glasses: 'nenhum', extra: 'nenhum' } },
  { id: 'rockstar', label: 'Rockstar', look: { hair: 'moicano', hairColor: 7, top: 'jaqueta', topColor: 0, bottom: 'jeans', bottomColor: 0, shoes: 'bota', shoesColor: 0, hat: 'nenhum', glasses: 'escuro', extra: 'nenhum' } },
  { id: 'cientista', label: 'Cientista', look: { hair: 'cacheado', hairColor: 5, top: 'jaleco', topColor: 1, bottom: 'calca', bottomColor: 11, shoes: 'sapato', shoesColor: 10, hat: 'nenhum', glasses: 'redondo', extra: 'nenhum' } },
  { id: 'cowboy', label: 'Cowboy', look: { hair: 'curto', beard: 'bigode', top: 'social', topColor: 2, bottom: 'jeans', bottomColor: 0, shoes: 'bota', shoesColor: 10, hat: 'cowboy', glasses: 'nenhum', extra: 'cachecol', extraColor: 2 } },
  { id: 'heroi', label: 'Herói mascarado', look: { hair: 'curto', top: 'traje', topColor: 7, bottom: 'calca', bottomColor: 7, shoes: 'bota', shoesColor: 2, hat: 'nenhum', glasses: 'mascara', extra: 'capa', extraColor: 2 } },
  { id: 'cavaleiro', label: 'Cavaleiro', look: { hair: 'curto', top: 'armadura', topColor: 11, bottom: 'calca', bottomColor: 11, shoes: 'bota', shoesColor: 11, hat: 'nenhum', glasses: 'nenhum', extra: 'capa', extraColor: 2 } },
  { id: 'realeza', label: 'Realeza', look: { hair: 'longo', hairColor: 4, top: 'vestido', topColor: 9, bottom: 'saia', bottomColor: 9, shoes: 'sapato', shoesColor: 4, hat: 'coroa', glasses: 'nenhum', extra: 'capa', extraColor: 8 } },
  { id: 'gatinho', label: 'Fofura felina', look: { hair: 'curto', hairColor: 3, top: 'moletom', topColor: 9, bottom: 'shorts', bottomColor: 1, shoes: 'tenis', shoesColor: 1, hat: 'gato', glasses: 'nenhum', extra: 'nenhum' } },
  { id: 'aventura', label: 'Aventureira', look: { hair: 'rabo', hairColor: 2, top: 'regata', topColor: 5, bottom: 'shorts', bottomColor: 10, shoes: 'bota', shoesColor: 10, hat: 'chapeu', glasses: 'nenhum', extra: 'mochila', extraColor: 10 } }
];

const intIn = (v, len) => (Number.isInteger(v) && v >= 0 && v < len ? v : null);
const pick = (v, key) => (ids(key).includes(v) ? v : null);

/** Normaliza uma aparência (vinda do disco ou de outra pessoa). Valores inválidos viram o padrão. */
export function validateLook(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const look = { ...DEFAULT_LOOK };
  for (const key of ['build', 'hair', 'beard', 'top', 'bottom', 'shoes', 'hat', 'glasses', 'extra']) {
    const v = pick(r[key], key);
    if (v) look[key] = v;
  }
  const height = Number(r.height);
  if (Number.isFinite(height)) look.height = Math.max(0.9, Math.min(1.1, Math.round(height * 100) / 100));
  const colors = { skin: SKIN_TONES, hairColor: HAIR_COLORS, eyes: EYE_COLORS, topColor: CLOTH_COLORS, bottomColor: CLOTH_COLORS, shoesColor: CLOTH_COLORS, extraColor: CLOTH_COLORS, hatColor: CLOTH_COLORS };
  for (const [key, palette] of Object.entries(colors)) {
    const v = intIn(r[key], palette.length);
    if (v !== null) look[key] = v;
  }
  return look;
}

/** Aplica um estilo pronto mantendo pele, altura e corpo da pessoa. */
export function applyPreset(look, presetId) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return look;
  return validateLook({ ...DEFAULT_LOOK, skin: look.skin, height: look.height, build: look.build, eyes: look.eyes, ...preset.look });
}

/** Aparência inicial estável para quem nunca personalizou (cada pessoa começa diferente). */
export function defaultLookFor(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hairs = ['curto', 'cacheado', 'longo', 'rabo', 'coque', 'espetado', 'black', 'raspado'];
  const tops = ['camiseta', 'moletom', 'jaqueta', 'social', 'regata'];
  return validateLook({
    ...DEFAULT_LOOK,
    skin: h % SKIN_TONES.length,
    hair: hairs[(h >>> 3) % hairs.length],
    hairColor: (h >>> 6) % 6,
    top: tops[(h >>> 9) % tops.length],
    topColor: (h >>> 12) % CLOTH_COLORS.length,
    bottomColor: [0, 10, 11][(h >>> 15) % 3],
    build: ['esguio', 'medio', 'forte'][(h >>> 18) % 3],
    height: 0.94 + ((h >>> 20) % 11) / 100
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
