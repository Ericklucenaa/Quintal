// Vitrola: fila de músicas sincronizada por canal de voz.
//
// Nada de áudio passa pelo Quintal: cada pessoa toca a faixa no player oficial do
// YouTube ou do Spotify (página music-player.html), no ponto calculado a partir de
// `current.startedAt`. O Firestore guarda só a fila e o que está tocando:
//   concord_music/{serverId}_{channelId}  { hostId, current, updatedAt }
//   concord_music_queue/{itemId}          { sessionId, kind, ref, title, ..., order }
// Quem avança para a próxima faixa é o "anfitrião" (quem começou a tocar); se ele sair
// da chamada ou a faixa passar do fim, qualquer um com permissão assume.
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, query, runTransaction, setDoc, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn } from '../log';
import { newId } from '../cloud/util';

const SESSIONS = 'concord_music';
const QUEUE = 'concord_music_queue';
export const MAX_PLAYLIST_ITEMS = 100;
export const MAX_QUEUE = 300;

export const sessionIdFor = (serverId, channelId) => `${serverId}_${channelId}`;

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const YT_ID = /^[\w-]{11}$/;
const YT_LIST = /^[\w-]{10,64}$/;
const SP_ID = /^[A-Za-z0-9]{22}$/;

/**
 * Entende links do YouTube (vídeo, shorts, music, playlist) e do Spotify (faixa,
 * álbum, playlist, episódio). Devolve { kind, type, id, list? } ou null.
 */
export function parseMusicLink(input) {
  const raw = String(input || '').trim();
  const spUri = raw.match(/^spotify:(track|album|playlist|episode):([A-Za-z0-9]{22})$/);
  if (spUri) return { kind: 'spotify', type: spUri[1], id: spUri[2] };
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1, 12);
    if (!YT_ID.test(id)) return null;
    const list = u.searchParams.get('list');
    return { kind: 'youtube', type: 'video', id, ...(list && YT_LIST.test(list) ? { list } : {}) };
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const list = u.searchParams.get('list');
    const v = u.searchParams.get('v');
    const path = u.pathname.split('/').filter(Boolean);
    const pathId = ['shorts', 'embed', 'live'].includes(path[0]) ? path[1] : null;
    const id = v || pathId;
    if (path[0] === 'playlist' && list && YT_LIST.test(list)) return { kind: 'youtube', type: 'playlist', id: list, list };
    if (id && YT_ID.test(id)) return { kind: 'youtube', type: 'video', id, ...(list && YT_LIST.test(list) ? { list } : {}) };
    if (list && YT_LIST.test(list)) return { kind: 'youtube', type: 'playlist', id: list, list };
    return null;
  }
  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    const path = u.pathname.split('/').filter(Boolean).filter((p) => !/^intl-/.test(p) && p !== 'embed');
    const [type, id] = path;
    if (['track', 'album', 'playlist', 'episode'].includes(type) && SP_ID.test(id || '')) return { kind: 'spotify', type, id };
    return null;
  }
  return null;
}

/** Item mínimo (sem consultar nada) para um link já entendido. */
export function fallbackItems(link) {
  if (link.kind === 'youtube') {
    if (link.type === 'playlist') return [];
    return [{ kind: 'youtube', ref: link.id, title: 'Vídeo do YouTube', artist: '', thumb: `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`, durationMs: 0 }];
  }
  return [{ kind: 'spotify', ref: `spotify:${link.type}:${link.id}`, title: link.type === 'track' ? 'Faixa do Spotify' : 'Spotify', artist: '', thumb: '', durationMs: 0 }];
}

const cleanText = (s, max) => Array.from(String(s || '')).filter((ch) => ch.charCodeAt(0) >= 32).join('').trim().slice(0, max);

/** Normaliza e confere um item vindo da resolução (main process ou player). */
export function sanitizeItem(it) {
  if (!it || (it.kind !== 'youtube' && it.kind !== 'spotify')) return null;
  const ref = String(it.ref || '');
  if (it.kind === 'youtube' && !YT_ID.test(ref)) return null;
  if (it.kind === 'spotify' && !/^spotify:(track|episode|album|playlist):[A-Za-z0-9]{22}$/.test(ref)) return null;
  const thumb = /^https:\/\/[\w.-]+\.(ytimg\.com|scdn\.co|spotifycdn\.com)\//.test(it.thumb || '') ? it.thumb : '';
  const dur = Number(it.durationMs);
  return {
    kind: it.kind,
    ref,
    title: cleanText(it.title, 200) || (it.kind === 'youtube' ? 'Vídeo do YouTube' : 'Faixa do Spotify'),
    artist: cleanText(it.artist, 120),
    thumb,
    durationMs: Number.isFinite(dur) && dur > 0 && dur < 6 * 3600_000 ? Math.round(dur) : 0
  };
}

/**
 * Transforma um link em itens da fila. No app de desktop a resolução (títulos,
 * playlists e álbuns inteiros) é feita pelo processo principal; no navegador cai
 * para itens mínimos e o player completa o título quando a faixa tocar.
 */
export async function resolveMusicLink(input, { expandYoutubePlaylist } = {}) {
  const link = parseMusicLink(input);
  if (!link) throw new Error('Esse link não é do YouTube nem do Spotify.');
  let items = [];
  if (window.electronAPI?.resolveMusic) {
    try {
      const res = await window.electronAPI.resolveMusic(link);
      if (Array.isArray(res?.items)) items = res.items.map(sanitizeItem).filter(Boolean);
    } catch (err) {
      logWarn('music resolve', err);
    }
  }
  if (!items.length && link.kind === 'youtube' && (link.type === 'playlist' || link.list) && expandYoutubePlaylist) {
    const ids = await expandYoutubePlaylist(link.list || link.id).catch(() => []);
    items = ids.slice(0, MAX_PLAYLIST_ITEMS).map((id) => sanitizeItem({ kind: 'youtube', ref: id, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` })).filter(Boolean);
  }
  if (!items.length) items = fallbackItems(link).map(sanitizeItem).filter(Boolean);
  if (!items.length) throw new Error('Não consegui ler essa playlist. Tente o link de uma música.');
  return { link, items: items.slice(0, MAX_PLAYLIST_ITEMS) };
}

// ---------------------------------------------------------------------------
// Tempo de reprodução
// ---------------------------------------------------------------------------

/** Posição (ms) em que a faixa atual deveria estar agora. */
export function expectedPosition(current, now = Date.now()) {
  if (!current) return 0;
  if (current.paused) return Math.max(0, current.pausedAt || 0);
  return Math.max(0, now - current.startedAt);
}

/** A faixa já passou do fim (com folga)? Só dá para saber com a duração conhecida. */
export function isTrackOver(current, now = Date.now(), slackMs = 4000) {
  if (!current || current.paused || !current.durationMs) return false;
  return now > current.startedAt + current.durationMs + slackMs;
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

export function listenSession(serverId, channelId, callback) {
  return onSnapshot(
    doc(firestore, SESSIONS, sessionIdFor(serverId, channelId)),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => {
      logWarn('listen music', err);
      callback(null);
    }
  );
}

export function listenQueue(serverId, channelId, callback) {
  // filtra por servidor e canal: as regras conferem a participação pelo servidor
  const q = query(collection(firestore, QUEUE), where('serverId', '==', serverId), where('channelId', '==', channelId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data()).sort((a, b) => a.order - b.order)),
    (err) => {
      logWarn('listen music queue', err);
      callback([]);
    }
  );
}

/** Coloca itens no fim da fila (uma playlist vira vários itens). */
export async function enqueue(serverId, channelId, user, items, existingCount = 0) {
  const room = Math.max(0, MAX_QUEUE - existingCount);
  if (!room) throw new Error(`A fila já tem ${MAX_QUEUE} músicas.`);
  const list = items.slice(0, room);
  const sessionId = sessionIdFor(serverId, channelId);
  const base = Date.now();
  // lotes de até 400 escritas
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(firestore);
    list.slice(i, i + 400).forEach((it, j) => {
      const id = newId('mq');
      batch.set(doc(firestore, QUEUE, id), {
        ...it,
        id,
        sessionId,
        serverId,
        channelId,
        addedBy: user.id,
        addedByName: user.username,
        order: base + i + j
      });
    });
    await batch.commit();
  }
  return list.length;
}

/**
 * Passa para a próxima da fila (ou para nada, se `itemId` for null) e vira anfitrião.
 * O item escolhido sai da fila na mesma transação.
 */
export async function playNext(serverId, channelId, user, nextItem) {
  const ref = doc(firestore, SESSIONS, sessionIdFor(serverId, channelId));
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    const current = nextItem ? {
      queueId: nextItem.id,
      kind: nextItem.kind,
      ref: nextItem.ref,
      title: nextItem.title,
      artist: nextItem.artist || '',
      thumb: nextItem.thumb || '',
      durationMs: nextItem.durationMs || 0,
      addedBy: nextItem.addedBy,
      addedByName: nextItem.addedByName,
      startedAt: Date.now() + 1500, // tempo para todo mundo carregar o player
      paused: false,
      pausedAt: 0
    } : null;
    const data = { serverId, channelId, hostId: user.id, current, updatedAt: Date.now() };
    if (snap.exists()) tx.update(ref, data);
    else tx.set(ref, data);
    if (nextItem) tx.delete(doc(firestore, QUEUE, nextItem.id));
  });
}

export async function setPaused(serverId, channelId, current, paused) {
  if (!current) return;
  const now = Date.now();
  const next = paused
    ? { ...current, paused: true, pausedAt: expectedPosition(current, now) }
    : { ...current, paused: false, startedAt: now - (current.pausedAt || 0), pausedAt: 0 };
  await updateDoc(doc(firestore, SESSIONS, sessionIdFor(serverId, channelId)), { current: next, updatedAt: now });
}

export async function seekTo(serverId, channelId, current, positionMs) {
  if (!current) return;
  const now = Date.now();
  const pos = Math.max(0, Math.round(positionMs));
  const next = current.paused ? { ...current, pausedAt: pos } : { ...current, startedAt: now - pos };
  await updateDoc(doc(firestore, SESSIONS, sessionIdFor(serverId, channelId)), { current: next, updatedAt: now });
}

/** O anfitrião informa a duração e o título reais quando o player carrega a faixa. */
export async function reportTrackInfo(serverId, channelId, current, { durationMs, title }) {
  const patch = {};
  if (durationMs && !current.durationMs) patch.durationMs = Math.round(durationMs);
  if (title && /^(Vídeo do YouTube|Faixa do Spotify|Spotify)$/.test(current.title)) patch.title = String(title).slice(0, 200);
  if (!Object.keys(patch).length) return;
  await updateDoc(doc(firestore, SESSIONS, sessionIdFor(serverId, channelId)), { current: { ...current, ...patch }, updatedAt: Date.now() });
}

export async function removeFromQueue(itemId) {
  await deleteDoc(doc(firestore, QUEUE, itemId));
}

export async function moveInQueue(item, neighbor) {
  if (!neighbor) return;
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, QUEUE, item.id), { order: neighbor.order });
  batch.update(doc(firestore, QUEUE, neighbor.id), { order: item.order });
  await batch.commit();
}

export async function clearQueue(items) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(firestore);
    items.slice(i, i + 400).forEach((it) => batch.delete(doc(firestore, QUEUE, it.id)));
    await batch.commit();
  }
}

export async function stopMusic(serverId, channelId, user) {
  const ref = doc(firestore, SESSIONS, sessionIdFor(serverId, channelId));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await setDoc(ref, { serverId, channelId, hostId: user.id, current: null, updatedAt: Date.now() });
}
