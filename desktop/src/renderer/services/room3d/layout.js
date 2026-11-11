// Layout do "Terraço": a sala 3D dos canais de voz.
// Unidades em metros. Eixos: x para a direita, z para o sul (para a câmera inicial),
// y para cima. O telão fica no lado norte (z negativo).
//
// Tudo aqui é dado puro: a cena 3D desenha a partir disso e as regras de
// movimento e colisão usam os mesmos números, então o que se vê é o que colide.

export const ROOM = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };
export const PLAYER_RADIUS = 0.32;

// Rotação (yaw) em radianos: 0 = olhando para +z (sul); PI = olhando para o telão.
export const FACE_SCREEN = Math.PI;

export const SCREEN = { x: 0, y: 2.35, z: -6.55, width: 6.4, height: 3.6 };

// Retângulos de colisão (centro x/z, largura w em x, profundidade d em z).
export const COLLIDERS = [
  { id: 'telao', x: 0, z: -6.55, w: 7.2, d: 0.7 },
  { id: 'sofa-centro', x: 0, z: -1.2, w: 3.3, d: 1.0 },
  { id: 'sofa-oeste', x: -2.75, z: -2.3, w: 1.0, d: 2.6 },
  { id: 'sofa-leste', x: 2.75, z: -2.3, w: 1.0, d: 2.6 },
  { id: 'mesa-centro', x: 0, z: -2.9, w: 1.6, d: 0.8 },
  { id: 'fogueira', x: 0, z: 3.2, w: 1.7, d: 1.7 },
  { id: 'balcao', x: 7.6, z: 0.5, w: 1.0, d: 5.2 },
  { id: 'vaso-no', x: -8.2, z: -6.2, w: 0.9, d: 0.9 },
  { id: 'vaso-ne', x: 8.2, z: -6.2, w: 0.9, d: 0.9 },
  { id: 'vaso-so', x: -8.2, z: 6.2, w: 0.9, d: 0.9 },
  { id: 'vaso-se', x: 8.2, z: 6.2, w: 0.9, d: 0.9 }
];

// Assentos: posição de quem senta, para onde olha e onde a pessoa fica ao levantar.
const sofaSeats = [-1.05, 0, 1.05].map((x, i) => ({
  id: `sofa-centro-${i}`, x, z: -1.05, yaw: FACE_SCREEN, exit: { x, z: -2.1 }
}));
const sideSeats = [
  ...[-3.1, -2.3, -1.5].map((z, i) => ({ id: `sofa-oeste-${i}`, x: -2.6, z, yaw: Math.PI / 2 + 0.35, exit: { x: -1.75, z: Math.min(z, -2.15) } })),
  ...[-3.1, -2.3, -1.5].map((z, i) => ({ id: `sofa-leste-${i}`, x: 2.6, z, yaw: -Math.PI / 2 - 0.35, exit: { x: 1.75, z: Math.min(z, -2.15) } }))
];
const fireSeats = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  const r = 1.75;
  const x = Math.sin(a) * r;
  const z = 3.2 + Math.cos(a) * r;
  return { id: `fogueira-${i}`, x, z, yaw: a + Math.PI, stool: true, exit: { x: Math.sin(a) * 2.45, z: 3.2 + Math.cos(a) * 2.45 } };
});
const barSeats = [-1.2, 0.5, 2.2].map((z, i) => ({ id: `balcao-${i}`, x: 6.75, z, yaw: Math.PI / 2, stool: true, high: true, exit: { x: 6.0, z } }));

export const SEATS = [...sofaSeats, ...sideSeats, ...fireSeats, ...barSeats];
export const SEAT_REACH = 1.25;

// Pontos de chegada ao entrar na sala (lado sul, longe dos móveis).
export const SPAWNS = [
  { x: -3, z: 5.6 }, { x: -1.5, z: 6.0 }, { x: 0, z: 5.6 }, { x: 1.5, z: 6.0 },
  { x: 3, z: 5.6 }, { x: -4.5, z: 6.0 }, { x: 4.5, z: 6.0 }, { x: -6, z: 5.6 }, { x: 6, z: 5.6 }
];

/** Ponto de chegada estável para um usuário (o mesmo id cai sempre no mesmo lugar). */
export function spawnFor(userId) {
  let h = 0;
  for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...SPAWNS[h % SPAWNS.length], yaw: FACE_SCREEN };
}
