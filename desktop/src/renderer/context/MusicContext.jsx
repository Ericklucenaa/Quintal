import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useVoice } from './VoiceContext';
import { isBotEnabled } from '../services/bots/catalog';
import { hasPermission } from '../services/permissions';
import {
  clearQueue, enqueue, expectedPosition, isTrackOver, listenQueue, listenSession, moveInQueue, playNext,
  removeFromQueue, reportTrackInfo, resolveMusicLink, seekTo, setPaused, stopMusic
} from '../services/bots/music';
import { logWarn } from '../services/log';

const MusicContext = createContext(null);

// A página dos players fica no Hosting (https): o YouTube recusa players em file://.
export const PLAYER_ORIGIN = typeof window !== 'undefined' && window.location.protocol.startsWith('http')
  ? window.location.origin
  : 'https://concord-3af70.web.app';
export const PLAYER_URL = `${PLAYER_ORIGIN}/music-player.html`;

const VOLUME_KEY = 'concord_music_volume';
const MUTED_KEY = 'concord_music_muted_here';

export function MusicProvider({ children }) {
  const { user } = useAuth();
  const { activeVoiceChannel, voiceServer, voiceUsers } = useVoice();
  const myId = user?.id;
  const serverId = activeVoiceChannel?.serverId || null;
  const channelId = activeVoiceChannel?.id || null;
  const enabled = Boolean(serverId && channelId && !activeVoiceChannel?.threadId && isBotEnabled(voiceServer, 'vitrola'));

  const [session, setSession] = useState(null);
  const [queue, setQueue] = useState([]);
  const [bridge, setBridge] = useState(null); // último estado do player
  const [bridgeReady, setBridgeReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw === null ? NaN : Number(raw); // Number(null) é 0: sem volume salvo, começa em 70
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 70;
  });
  const [mutedHere, setMutedHere] = useState(() => localStorage.getItem(MUTED_KEY) === 'true');
  const [spatialFactor, setSpatialFactor] = useState(1); // a sala 3D baixa o volume longe da vitrola
  const [error, setError] = useState('');
  const frameRef = useRef(null);
  const expandWaiters = useRef(new Map());
  const advancingRef = useRef('');

  const perms = useMemo(() => ({
    queue: enabled, // qualquer pessoa do servidor pede música
    control: enabled && hasPermission(voiceServer, myId, 'music.control')
  }), [enabled, voiceServer, myId]);

  // --- assinaturas ---
  useEffect(() => {
    setSession(null);
    setQueue([]);
    setBridge(null);
    if (!enabled) return undefined;
    const offS = listenSession(serverId, channelId, setSession);
    const offQ = listenQueue(serverId, channelId, setQueue);
    return () => {
      offS();
      offQ();
    };
  }, [enabled, serverId, channelId]);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setBridgeReady(false); // o iframe do player sai junto com a Vitrola
    }
  }, [enabled]);

  const current = session?.current || null;
  useEffect(() => {
    if (current) setOpen(true);
  }, [current?.queueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- ponte com o player ---
  const postToPlayer = useCallback((msg) => {
    frameRef.current?.contentWindow?.postMessage({ source: 'quintal-app', ...msg }, PLAYER_ORIGIN);
  }, []);

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== PLAYER_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      const m = e.data;
      if (!m || m.source !== 'quintal-music') return;
      if (m.type === 'ready') setBridgeReady(true);
      else if (m.type === 'state') setBridge({ ...m, at: Date.now() });
      else if (m.type === 'error') setBridge((b) => ({ ...(b || {}), error: m.code, errorRef: m.ref, at: Date.now() }));
      else if (m.type === 'expanded') {
        const resolve = expandWaiters.current.get(m.reqId);
        expandWaiters.current.delete(m.reqId);
        resolve?.(Array.isArray(m.ids) ? m.ids : []);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const effectiveVolume = Math.round(volume * spatialFactor);
  useEffect(() => {
    if (bridgeReady) postToPlayer({ type: 'volume', value: mutedHere ? 0 : effectiveVolume });
  }, [bridgeReady, effectiveVolume, mutedHere, postToPlayer]);

  // Manda o alvo ao player quando a faixa muda e de tempos em tempos (corrige desvio).
  useEffect(() => {
    if (!bridgeReady) return undefined;
    const send = () => {
      if (!current || mutedHere) postToPlayer({ type: 'clear' });
      else postToPlayer({ type: 'target', kind: current.kind, ref: current.ref, positionMs: expectedPosition(current), paused: current.paused });
    };
    send();
    const t = setInterval(send, 4000);
    return () => clearInterval(t);
  }, [bridgeReady, current, mutedHere, postToPlayer]);

  // --- quem avança a fila ---
  const presentIds = useMemo(() => new Set((voiceUsers || []).map((u) => u.userId)), [voiceUsers]);
  const amDriver = useMemo(() => {
    if (!perms.queue || !session) return perms.queue && !session && queue.length > 0;
    if (session.hostId === myId) return true;
    if (session.hostId && presentIds.has(session.hostId)) return false;
    // anfitrião saiu: assume quem tem permissão e o menor id entre os presentes
    const candidates = (voiceUsers || []).map((u) => u.userId).sort();
    return candidates[0] === myId;
  }, [perms.queue, session, queue.length, myId, presentIds, voiceUsers]);

  const advance = useCallback(async (reason) => {
    const next = queue[0] || null;
    const key = `${current?.queueId || 'none'}>${next?.id || 'none'}`;
    if (advancingRef.current === key) return;
    advancingRef.current = key;
    try {
      await playNext(serverId, channelId, user, next);
    } catch (err) {
      logWarn(`music advance (${reason})`, err);
      advancingRef.current = '';
    }
  }, [queue, current?.queueId, serverId, channelId, user]);

  useEffect(() => {
    if (!enabled || !amDriver) return undefined;
    const check = () => {
      const now = Date.now();
      if (!current) {
        if (queue.length) advance('fila parada');
        return;
      }
      const sameTrack = bridge && bridge.ref === current.ref && now - bridge.at < 5000;
      const ended = sameTrack && current.kind === 'youtube' && bridge.ended && expectedPosition(current, now) > 3000;
      const broken = bridge?.errorRef === current.ref && now - bridge.at < 8000 && now - current.startedAt > 3000;
      if (ended || broken || isTrackOver(current, now)) advance(ended ? 'fim' : broken ? 'erro' : 'tempo');
    };
    check();
    const t = setInterval(check, 1500);
    return () => clearInterval(t);
  }, [enabled, amDriver, current, queue.length, bridge, advance]);

  // O anfitrião completa título e duração que só o player sabe.
  useEffect(() => {
    if (!enabled || !current || session?.hostId !== myId || !bridge || bridge.ref !== current.ref) return;
    const fullTrack = bridge.durationMs > 31_000; // a prévia do Spotify tem 30 s
    if ((fullTrack && !current.durationMs) || (bridge.title && /^(Vídeo do YouTube|Faixa do Spotify|Spotify)$/.test(current.title))) {
      reportTrackInfo(serverId, channelId, current, { durationMs: fullTrack ? bridge.durationMs : 0, title: bridge.title }).catch((err) => logWarn('music info', err));
    }
  }, [enabled, current, session?.hostId, myId, bridge, serverId, channelId]);

  // --- ações ---
  const expandYoutubePlaylist = useCallback((list) => new Promise((resolve) => {
    const reqId = Math.random().toString(36).slice(2);
    expandWaiters.current.set(reqId, resolve);
    postToPlayer({ type: 'expand', reqId, list });
    setTimeout(() => {
      if (expandWaiters.current.has(reqId)) {
        expandWaiters.current.delete(reqId);
        resolve([]);
      }
    }, 10_000);
  }), [postToPlayer]);

  const addLink = useCallback(async (url) => {
    if (!enabled) throw new Error('Entre num canal de voz de um servidor com a Vitrola para pedir músicas.');
    if (!perms.queue) throw new Error('Você não tem permissão para pedir músicas neste servidor.');
    const { items } = await resolveMusicLink(url, { expandYoutubePlaylist });
    const added = await enqueue(serverId, channelId, user, items, queue.length);
    setOpen(true);
    return { added, first: items[0], total: items.length };
  }, [enabled, perms.queue, expandYoutubePlaylist, serverId, channelId, user, queue.length]);

  const canSkipCurrent = perms.control || (current && current.addedBy === myId);

  const actions = useMemo(() => ({
    addLink,
    skip: async () => {
      if (!canSkipCurrent) throw new Error('Só quem pediu esta música ou quem controla a Vitrola pode pular.');
      advancingRef.current = '';
      await playNext(serverId, channelId, user, queue[0] || null);
    },
    pause: () => setPaused(serverId, channelId, current, true),
    resume: () => setPaused(serverId, channelId, current, false),
    seek: (ms) => seekTo(serverId, channelId, current, ms),
    stop: () => stopMusic(serverId, channelId, user),
    remove: (item) => removeFromQueue(item.id),
    moveUp: (item) => {
      const i = queue.findIndex((q) => q.id === item.id);
      return moveInQueue(item, queue[i - 1]);
    },
    moveDown: (item) => {
      const i = queue.findIndex((q) => q.id === item.id);
      return moveInQueue(item, queue[i + 1]);
    },
    clear: () => clearQueue(queue),
    start: async () => {
      if (!queue.length) return;
      advancingRef.current = '';
      await playNext(serverId, channelId, user, queue[0]);
    }
  }), [addLink, canSkipCurrent, serverId, channelId, user, queue, current]);

  const setVolume = useCallback((v) => {
    const n = Math.max(0, Math.min(100, Math.round(v)));
    setVolumeState(n);
    localStorage.setItem(VOLUME_KEY, String(n));
  }, []);
  const toggleMutedHere = useCallback(() => {
    setMutedHere((m) => {
      localStorage.setItem(MUTED_KEY, String(!m));
      return !m;
    });
  }, []);

  // Diagnóstico (testes de ponta a ponta): estado da ponte com o player.
  useEffect(() => {
    window.__musicDebug = { bridgeReady, bridge, current, mutedHere, enabled };
  });

  const value = useMemo(() => ({
    enabled,
    serverId,
    channelId,
    session,
    current,
    queue,
    bridge,
    perms,
    canSkipCurrent,
    open,
    setOpen,
    volume,
    setVolume,
    mutedHere,
    toggleMutedHere,
    setSpatialFactor,
    error,
    setError,
    frameRef,
    actions
  }), [enabled, serverId, channelId, session, current, queue, bridge, perms, canSkipCurrent, open, volume, setVolume, mutedHere, toggleMutedHere, error, actions]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  return useContext(MusicContext);
}
