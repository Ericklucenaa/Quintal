// Layout do "Bar do Quintal": a sala 3D dos canais de voz.
// Unidades em metros. Eixos: x para a direita (leste), z para o sul, y para cima.
// O telão fica na parede norte (z negativo).
//
//                         TELÃO (norte)
//        [sinuca]      sofás do cinema         [vitrola]
//        [totó]           PISTA DE DANÇA        BALCÃO + banquetas
//        [ping-pong]                            prateleiras
//        [fogueira]   xadrez xadrez damas damas   lounge
//
// Tudo aqui é dado puro: a cena desenha a partir disso e o movimento usa os mesmos
// números, então o que se vê é o que colide.

export const ROOM = { minX: -16, maxX: 16, minZ: -13, maxZ: 13 };
export const PLAYER_RADIUS = 0.32;

// Rotação (yaw) em radianos: 0 = olhando para +z (sul); PI = olhando para o telão.
export const FACE_SCREEN = Math.PI;
const EAST = Math.PI / 2; // olhando para +x
const WEST = -Math.PI / 2;

export const SCREEN = { x: 0, y: 2.9, z: -12.55, width: 8, height: 4.5 };
export const DANCE_FLOOR = { x: 0, z: -1.2, w: 8, d: 6.4 };
export const JUKEBOX = { x: 12.6, z: -10.3, w: 1.1, d: 0.7, h: 1.7 };

// Mesas de jogo. `spots` são os lugares dos jogadores (cadeira ou em pé).
export const GAME_TABLES = [
  { id: 'xadrez-1', kind: 'chess', label: 'Xadrez', x: -6, z: 8.6 },
  { id: 'xadrez-2', kind: 'chess', label: 'Xadrez', x: -2.2, z: 8.6 },
  { id: 'damas-1', kind: 'checkers', label: 'Damas', x: 1.6, z: 8.6 },
  { id: 'damas-2', kind: 'checkers', label: 'Damas', x: 5.4, z: 8.6 },
  { id: 'sinuca', kind: 'pool', label: 'Sinuca', x: -11.4, z: -7, w: 2.7, d: 1.5, h: 0.86 },
  { id: 'toto', kind: 'foosball', label: 'Totó', x: -11.4, z: -1.8, w: 1.6, d: 0.86, h: 0.95 },
  { id: 'pingpong', kind: 'pingpong', label: 'Ping-pong', x: -11.4, z: 3.4, w: 2.74, d: 1.53, h: 0.76 }
].map((t) => {
  if (t.kind === 'chess' || t.kind === 'checkers') {
    return { ...t, w: 0.9, d: 0.9, h: 0.74, spots: [{ x: t.x - 0.85, z: t.z, yaw: EAST, chair: true }, { x: t.x + 0.85, z: t.z, yaw: WEST, chair: true }] };
  }
  const gap = t.kind === 'pool' ? 2.05 : t.kind === 'foosball' ? 1.25 : 2.15;
  return { ...t, spots: [{ x: t.x - gap, z: t.z, yaw: EAST }, { x: t.x + gap, z: t.z, yaw: WEST }] };
});
export const tableById = (id) => GAME_TABLES.find((t) => t.id === id) || null;
export const GAME_REACH = 2.2;

// Retângulos de colisão (centro x/z, largura w em x, profundidade d em z) e altura
// do topo (h). Dá para subir no que tem topo baixo (degrau) ou pulando.
export const COLLIDERS = [
  { id: 'telao', x: 0, z: -12.55, w: 9, d: 0.7, h: 5.6 },
  { id: 'sofa-centro', x: 0, z: -8.4, w: 4.2, d: 1.0, h: 0.62 },
  { id: 'sofa-oeste', x: -3.4, z: -9.8, w: 1.0, d: 2.6, h: 0.62 },
  { id: 'sofa-leste', x: 3.4, z: -9.8, w: 1.0, d: 2.6, h: 0.62 },
  { id: 'mesa-centro', x: 0, z: -10.2, w: 1.8, d: 0.8, h: 0.36 },
  { id: 'balcao', x: 13.4, z: -1.5, w: 1.0, d: 10, h: 1.13 },
  { id: 'prateleira', x: 15.5, z: -1.5, w: 0.8, d: 11, h: 2.6 },
  { id: 'vitrola', ...JUKEBOX },
  { id: 'fogueira', x: -11, z: 10, w: 1.7, d: 1.7, h: 3.0 },
  { id: 'sofa-lounge', x: 11, z: 10.8, w: 3.3, d: 1.0, h: 0.62 },
  { id: 'sofa-lounge-2', x: 14, z: 8.6, w: 1.0, d: 2.6, h: 0.62 },
  { id: 'mesa-lounge', x: 11, z: 8.9, w: 1.4, d: 0.7, h: 0.36 },
  // pilares do pergolado (alto o bastante para a câmera passar por baixo das vigas)
  ...[[-8, -6], [8, -6], [-8, 6], [8, 6]].map(([x, z], i) => ({ id: `pilar-${i}`, x, z, w: 0.34, d: 0.34, h: 4.6 })),
  ...GAME_TABLES.map((t) => ({ id: `mesa-${t.id}`, x: t.x, z: t.z, w: t.w, d: t.d, h: t.h })),
  { id: 'vaso-no', x: -15.2, z: -12.2, w: 0.9, d: 0.9, h: 0.55 },
  { id: 'vaso-ne', x: 15.2, z: -12.2, w: 0.9, d: 0.9, h: 0.55 },
  { id: 'vaso-so', x: -15.2, z: 12.2, w: 0.9, d: 0.9, h: 0.55 },
  { id: 'vaso-se', x: 15.2, z: 12.2, w: 0.9, d: 0.9, h: 0.55 }
];

// Assentos: posição de quem senta, para onde olha e onde a pessoa fica ao levantar.
const cinemaSeats = [-1.5, -0.5, 0.5, 1.5].map((x, i) => ({ id: `sofa-centro-${i}`, x, z: -8.25, yaw: FACE_SCREEN, exit: { x, z: -9.3 } }));
const sideSeats = [
  ...[-10.6, -9.8, -9.0].map((z, i) => ({ id: `sofa-oeste-${i}`, x: -3.25, z, yaw: EAST + 0.35, exit: { x: -2.5, z } })),
  ...[-10.6, -9.8, -9.0].map((z, i) => ({ id: `sofa-leste-${i}`, x: 3.25, z, yaw: WEST - 0.35, exit: { x: 2.5, z } }))
];
const barSeats = [-5.5, -4, -2.5, -1, 0.5, 2].map((z, i) => ({ id: `balcao-${i}`, x: 12.55, z, yaw: EAST, stool: true, high: true, exit: { x: 11.75, z } }));
const fireSeats = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  return {
    id: `fogueira-${i}`,
    x: -11 + Math.sin(a) * 1.75,
    z: 10 + Math.cos(a) * 1.75,
    yaw: a + Math.PI,
    stool: true,
    exit: { x: -11 + Math.sin(a) * 2.45, z: 10 + Math.cos(a) * 2.45 }
  };
});
const loungeSeats = [
  ...[10, 11, 12].map((x, i) => ({ id: `lounge-${i}`, x, z: 10.95, yaw: FACE_SCREEN, exit: { x, z: 9.8 } })),
  ...[8, 8.9].map((z, i) => ({ id: `lounge-lado-${i}`, x: 13.85, z, yaw: WEST - 0.3, exit: { x: 13.05, z } }))
];
// Cadeiras das mesas de tabuleiro (a pessoa senta virada para a mesa).
const boardSeats = GAME_TABLES.filter((t) => t.spots[0].chair).flatMap((t) => t.spots.map((s, i) => ({
  id: `${t.id}-${i}`, x: s.x, z: s.z, yaw: s.yaw, stool: true, table: t.id, spot: i, exit: { x: s.x, z: t.z + 0.95 }
})));

export const SEATS = [...cinemaSeats, ...sideSeats, ...barSeats, ...fireSeats, ...loungeSeats, ...boardSeats];
export const SEAT_REACH = 1.25;
export const seatIndexFor = (tableId, spot) => SEATS.findIndex((s) => s.table === tableId && s.spot === spot);

// Pontos de chegada ao entrar (em volta da pista, longe dos móveis): dá para 24 de uma vez.
export const SPAWNS = [
  ...[-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6].map((x) => ({ x, z: 4.2 })),
  ...[-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6].map((x) => ({ x, z: 5.6 })),
  ...[-2.5, 2.5].map((z) => ({ x: -6, z })),
  ...[-2.5, 2.5].map((z) => ({ x: 6, z })),
  { x: -1, z: -5.5 }, { x: 1, z: -5.5 }
];

/** Ponto de chegada estável para um usuário (o mesmo id cai sempre no mesmo lugar). */
export function spawnFor(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...SPAWNS[h % SPAWNS.length], yaw: FACE_SCREEN };
}

// Objetos que dá para pegar e arremessar. Os ids são fixos em todos os temas
// (o tema só muda a aparência), então a sincronização não depende do tema.
export const THROWABLE_SPAWNS = [
  { id: 'o0', x: -1.5, z: 3.2 }, { id: 'o1', x: 1.5, z: 3.2 }, { id: 'o2', x: -6.5, z: -3.5 },
  { id: 'o3', x: 6.5, z: 3.5 }, { id: 'o4', x: -0.4, z: -10.2, y: 0.36 }, { id: 'o5', x: 0.4, z: -10.2, y: 0.36 },
  { id: 'o6', x: 13.4, z: 2.8, y: 1.13 }, { id: 'o7', x: 9, z: -8 }
];
export const THROWABLE_IDS = THROWABLE_SPAWNS.map((o) => o.id);
