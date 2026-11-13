import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  MicOff, Headphones, Maximize2, Box, Hand, Music, PartyPopper, HelpCircle, X, Palette, Check, Shirt, Eye, Video, Tv, Users,
  Disc3, Wine, Waves, TrainFront, Camera, Download, Lock
} from 'lucide-react';
import { useVoice } from '../../context/VoiceContext';
import { useScreenShare } from '../../context/ScreenShareContext';
import { useAuth } from '../../context/AuthContext';
import { useMusic } from '../../context/MusicContext';
import { defaultAvatar } from '../../services/cloud/util';
import { logWarn } from '../../services/log';
import { playAppSound } from '../../services/soundEffects';
import { hasPermission } from '../../services/permissions';
import {
  SEATS, SCREEN, spawnFor, JUKEBOX, GAME_TABLES, GAME_REACH, seatIndexFor, tableById
} from '../../services/room3d/layout';
import { loadMyLook, saveMyLook, defaultLookFor, validateLook } from '../../services/room3d/looks';
import { step, nearestSeat, sitAt, lerpAngle, resolve, groundAt } from '../../services/room3d/movement';
import {
  decode, encodeReaction, encodeState, encodeGrab, encodeThrow, encodeDrop, encodeRest, encodeHit,
  encodeTheme, encodeSnapshot, encodeLook, encodeCollective, encodeCollectiveJoin, encodeCollectiveLeave,
  createRateLimiter, REACTIONS
} from '../../services/room3d/protocol';
import {
  initialObjects, stepObject, advanceThrown, throwFrom, dropFrom, nearestPickable, bounceOffPerson, speedOf
} from '../../services/room3d/throwables';
import { THEMES, DEFAULT_THEME, themeById } from '../../services/room3d/themes';
import { spatialGain } from '../../services/room3d/spatial';
import { GameHub } from '../../services/room3d/games/hub';
import { buildRoom, drawPlaceholder, makePlaceholderCanvas } from './roomScene';
import { makeThrowable } from './props';
import { Avatar, loadAvatarAssets } from './avatar';
import { GameProps } from './gameProps';
import CustomizePanel from './CustomizePanel';
import GamePanel from './games/GamePanel';

const SEND_INTERVAL = 100; // ms (10 Hz enquanto algo muda)
const HEARTBEAT = 1500; // ms (estado completo mesmo parado)
const SPATIAL_INTERVAL = 100;
const MAX_PIXEL_RATIO = 1.75;
const STUN_SECONDS = 0.5;
const KNOCKBACK = 5.5;
const PLACEHOLDER_DELAY = 1200; // ms sem vídeo antes de voltar ao aviso (evita piscar)
const JUKEBOX_REACH = 2.3;

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run'
};
const EMOTE_KEYS = { Digit1: 'wave', Digit2: 'dance', Digit3: 'cheer', Digit4: 'clap' };
const seatTopOf = (i) => (SEATS[i]?.high ? 0.83 : SEATS[i]?.stool ? 0.47 : 0.55);

// Ações coletivas: gesto de cada uma, quanto tempo antes começa e quanto dura (s).
export const COLLECTIVE_INFO = {
  dance2: { label: 'Dança coletiva', emote: 'dance2', lead: 1.5, length: 9.6, icon: Music, verb: 'puxou uma dança coletiva' },
  toast: { label: 'Brinde', emote: 'toast', lead: 1.5, length: 3.6, icon: Wine, verb: 'puxou um brinde' },
  ola: { label: 'Ola', emote: 'ola', lead: 1.5, length: 4.5, icon: Waves, verb: 'puxou uma ola' },
  conga: { label: 'Trenzinho', emote: 'conga', lead: 0.8, length: 90, icon: TrainFront, verb: 'puxou um trenzinho' },
  photo: { label: 'Foto em grupo', emote: 'pose', lead: 4, length: 2, icon: Camera, verb: 'chamou todo mundo para uma foto' }
};
const COLLECTIVE_EMOTES = new Set(Object.values(COLLECTIVE_INFO).map((c) => c.emote));

// Verificado uma única vez e com o contexto de teste liberado na hora: o navegador
// aceita poucos contextos WebGL ativos (16 no Chromium) e, passando disso, derruba
// o mais antigo, que era o da própria sala (a tela piscava azul).
let webgl2Support = null;
export function hasWebGL2() {
  if (webgl2Support !== null) return webgl2Support;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl2Support = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2Support = false;
  }
  return webgl2Support;
}

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

const themeKey = (channelId) => `concord_room3d_theme_${channelId}`;
function readTheme(channelId) {
  try {
    const v = JSON.parse(localStorage.getItem(themeKey(channelId)) || 'null');
    if (v && THEMES.some((t) => t.id === v.id) && Number.isFinite(v.ts)) return v;
  } catch {
    // preferência corrompida: usa o padrão
  }
  return { id: DEFAULT_THEME, ts: 0 };
}

const randomId = () => Math.random().toString(36).slice(2, 12).padEnd(8, '0');

export default function Room3D({ onExpandScreen }) {
  const { user } = useAuth();
  const voice = useVoice();
  const share = useScreenShare();
  const music = useMusic();
  const myId = user?.id;
  const channelId = voice.activeVoiceChannel?.id || 'sala';
  const server = voice.voiceServer || null;
  const allowed = (uid, perm) => (server ? hasPermission(server, uid, perm) : true);
  const canTheme = allowed(myId, 'room.theme');
  const canCollective = allowed(myId, 'room.collective');

  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const [spatialOn, setSpatialOn] = useState(() => localStorage.getItem('concord_room3d_spatial') !== 'false');
  const [hint, setHint] = useState('');
  const [failed, setFailed] = useState(() => !hasWebGL2());
  const [helpOpen, setHelpOpen] = useState(true);
  const [themeId, setThemeId] = useState(() => readTheme(channelId).id);
  const [themeMenu, setThemeMenu] = useState(false);
  const [togetherMenu, setTogetherMenu] = useState(false);
  const [holding, setHolding] = useState(false);
  const [look, setLook] = useState(() => loadMyLook(myId));
  const [view, setView] = useState(() => (localStorage.getItem('concord_room3d_view') === 'first' ? 'first' : 'third'));
  const [customizing, setCustomizing] = useState(false);
  const [openTable, setOpenTable] = useState(null);
  const [collectiveUi, setCollectiveUi] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [flash, setFlash] = useState(false);
  const [photo, setPhoto] = useState(null);

  // Mesas de jogo: o estado vive fora da cena (o painel React também lê).
  const hub = useMemo(
    () => (myId ? new GameHub({ myId, send: (text, to) => voice.sendRoomMessage(text, to || null) }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myId, channelId]
  );

  useEffect(() => {
    const timer = setTimeout(() => setHelpOpen(false), 9000);
    return () => clearTimeout(timer);
  }, []);

  // Valores que o laço de animação lê sem recriar a cena.
  const live = useRef({});
  const commandsRef = useRef({});
  const sceneState = useRef({ music: null, vitrolaOn: false });
  live.current.voiceUsers = voice.voiceUsers;
  live.current.spatialOn = spatialOn;
  live.current.view = view;
  live.current.customizing = customizing;
  live.current.openTable = openTable;
  live.current.server = server;
  live.current.music = music;
  sceneState.current.music = music?.current ? { title: music.current.title, by: music.current.addedByName } : null;
  sceneState.current.vitrolaOn = Boolean(music?.enabled);

  useEffect(() => {
    localStorage.setItem('concord_room3d_view', view);
  }, [view]);
  useEffect(() => {
    saveMyLook(look);
    commandsRef.current.setLook?.(look);
  }, [look]);

  // TV: a mesma regra do palco clássico (minha tela quando eu foco nela ou não assisto ninguém).
  const tvStream = share.displayedStream || null;
  live.current.tv = {
    stream: tvStream,
    local: Boolean(share.showingLocal),
    mode: tvStream ? 'video' : share.watching ? 'waiting' : 'idle',
    who: share.watching?.username || ''
  };

  // Assistir automaticamente a primeira transmissão da sala quando não houver outra escolhida.
  // Quem eu deixei de assistir (transmissão parou ou cliquei para parar) não volta
  // sozinho para a TV até começar uma nova transmissão.
  const declinedRef = useRef(new Set());
  const lastWatchedRef = useRef(null);
  const presenterIds = share.presenters.map((p) => p.userId).join(',');
  const otherPresenters = share.presenters.filter((p) => p.userId !== myId);
  useEffect(() => {
    const livePresenters = new Set(presenterIds ? presenterIds.split(',') : []);
    const current = share.watching?.userId || null;
    const last = lastWatchedRef.current;
    if (last && last !== current && livePresenters.has(last)) declinedRef.current.add(last);
    lastWatchedRef.current = current;
    declinedRef.current.forEach((id) => { if (!livePresenters.has(id)) declinedRef.current.delete(id); });
    const candidate = share.presenters.find((p) => p.userId !== myId && !declinedRef.current.has(p.userId));
    if (!share.watching && candidate && voice.activeVoiceChannel && !share.isScreenSharing) {
      share.watchStream(candidate, voice.activeVoiceChannel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenterIds, share.watching?.userId, share.isScreenSharing]);

  useEffect(() => {
    localStorage.setItem('concord_room3d_spatial', String(spatialOn));
    voice.setSpatialAudio(spatialOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spatialOn]);

  const { setSpatialAudio } = voice;
  useEffect(() => () => setSpatialAudio(false), [setSpatialAudio]);
  const setMusicSpatial = music?.setSpatialFactor;
  useEffect(() => () => setMusicSpatial?.(1), [setMusicSpatial]);

  useEffect(() => {
    if (failed || !mountRef.current || !myId || !hub) return undefined;
    const mount = mountRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      logWarn('room3d webgl', err);
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'room3d-canvas';
    // O canvas vai por baixo das sobreposições (nomes, reações, barras).
    mount.prepend(renderer.domElement);

    // near = 0,25 m: mais precisão de profundidade (menos tremulação a distância).
    const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 320);

    // --- Estado do laço ---
    let theme = themeById(readTheme(channelId).id);
    let themeStamp = readTheme(channelId).ts;
    let room = null; // { scene, screenMesh, update }
    let gameProps = null;
    const avatars = new Map(); // userId -> { avatar, shown, label, lastNonce, user, wasAir, olaDelay }
    const remoteStates = new Map();
    const objects = initialObjects();
    const objMeshes = new Map();
    const reactionLimiter = createRateLimiter(4, 2000);
    const hitLimiter = createRateLimiter(4, 1000);
    const collectiveLimiter = createRateLimiter(3, 20000);
    let hitsTaken = 0;
    let renderError = null;
    let myLook = loadMyLook(myId);
    const remoteLooks = new Map();
    let fpPitch = 0;
    let resizes = 0;
    let renderErrors = 0;
    let contextLosses = 0;
    window.__room3dMounts = (window.__room3dMounts || 0) + 1;
    // personagens 3D (corpos, roupas e animações) começam a carregar já
    loadAvatarAssets().catch((err) => logWarn('room3d avatars', err));
    const peakY = new Map(); // maior altura recebida de cada pessoa (diagnóstico e testes)
    let shake = 0;
    let presentKey = '';

    // --- TV ---
    const placeholderCanvas = makePlaceholderCanvas('Ninguém está transmitindo', 'Use o botão de tela do painel para mostrar algo aqui');
    const placeholderTex = new THREE.CanvasTexture(placeholderCanvas);
    placeholderTex.colorSpace = THREE.SRGBColorSpace;
    const videoEl = document.createElement('video');
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    const videoTex = new THREE.VideoTexture(videoEl);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    let tvTrackId = '';
    let tvPlaceholderKey = '';
    let noVideoSince = 0;
    let tvSwitches = 0;
    const refreshTv = (now) => {
      const tv = live.current.tv;
      const track = tv.stream?.getVideoTracks?.()[0];
      const mat = room.screenMesh.material;
      if (tv.mode === 'video' && track) {
        noVideoSince = 0;
        if (track.id !== tvTrackId) {
          tvTrackId = track.id;
          tvSwitches += 1;
          videoEl.srcObject = tv.stream;
          videoEl.muted = tv.local; // minha própria tela não toca o meu áudio de volta
          videoEl.play().catch((err) => logWarn('room3d tv play', err));
        }
        if (mat.map !== videoTex) {
          mat.map = videoTex;
          mat.needsUpdate = true;
        }
        return;
      }
      if (!noVideoSince) noVideoSince = now;
      if (tvTrackId && now - noVideoSince < PLACEHOLDER_DELAY) return;
      const [title, sub] = tv.mode === 'waiting'
        ? [`Conectando à tela de ${tv.who}…`, 'A transmissão aparece em instantes']
        : ['Ninguém está transmitindo', 'Use o botão de tela do painel para mostrar algo aqui'];
      const key = `${title}|${sub}`;
      if (tvTrackId) {
        tvTrackId = '';
        tvSwitches += 1;
        videoEl.srcObject = null;
      }
      if (key !== tvPlaceholderKey || mat.map !== placeholderTex) {
        tvPlaceholderKey = key;
        drawPlaceholder(placeholderCanvas, title, sub);
        placeholderTex.needsUpdate = true;
        mat.map = placeholderTex;
        mat.needsUpdate = true;
      }
    };

    // --- Jogador local ---
    const spawn = spawnFor(myId);
    let me = { x: spawn.x, z: spawn.z, y: 0, vy: 0, yaw: spawn.yaw, seat: -1, moving: false, running: false, grounded: true, emote: null, emoteNonce: 0, holding: null, kx: 0, kz: 0, playing: null };
    const keys = {};
    let jumpQueued = false;
    let stunnedUntil = 0;
    let camYaw = Math.PI;
    let camPitch = 0.42;
    let camDist = 6.2;
    const camTarget = new THREE.Vector3(me.x, 1.3, me.z);
    const keepMeta = (s) => ({ ...s, emote: me.emote, emoteNonce: me.emoteNonce, holding: me.holding, playing: me.playing });

    // --- Cena por tema ---
    const disposeObject = (root) => root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map && m.map !== videoTex && m.map !== placeholderTex) m.map.dispose();
          m.emissiveMap?.dispose?.();
          m.dispose();
        });
      }
    });

    const buildObjectMeshes = () => {
      objMeshes.forEach((mesh) => disposeObject(mesh));
      objMeshes.clear();
      objects.forEach((_, id) => {
        const mesh = makeThrowable(theme, Number(id.slice(1)));
        objMeshes.set(id, mesh);
        room.scene.add(mesh);
      });
    };

    const applyTheme = (id) => {
      theme = themeById(id);
      const next = buildRoom(theme, sceneState.current);
      const keepTv = room?.screenMesh.material.map;
      if (room) {
        avatars.forEach((e) => room.scene.remove(e.avatar.root));
        objMeshes.forEach((m) => room.scene.remove(m));
        gameProps?.dispose();
        disposeObject(room.scene);
      }
      room = next;
      avatars.forEach((e) => room.scene.add(e.avatar.root));
      buildObjectMeshes();
      gameProps = new GameProps(room.scene);
      if (keepTv === videoTex || keepTv === placeholderTex) room.screenMesh.material.map = keepTv;
      tvPlaceholderKey = '';
    };
    applyTheme(theme.id);

    // --- Avatares e rótulos ---
    const makeLabel = (u) => {
      const el = document.createElement('div');
      el.className = 'room3d-label';
      const img = document.createElement('img');
      img.alt = '';
      img.src = u.avatar || defaultAvatar(u.username);
      const name = document.createElement('span');
      name.textContent = u.userId === myId ? `${u.username} (você)` : u.username;
      const mic = document.createElement('i');
      mic.className = 'room3d-mic-off';
      mic.setAttribute('aria-label', 'microfone desligado');
      el.append(img, name, mic);
      labelsRef.current?.appendChild(el);
      return { el };
    };

    const ensureAvatar = (u) => {
      let entry = avatars.get(u.userId);
      if (!entry) {
        const avatar = new Avatar(u.userId, u.userId === myId ? myLook : remoteLooks.get(u.userId) || defaultLookFor(u.userId));
        room.scene.add(avatar.root);
        const start = u.userId === myId ? me : spawnFor(u.userId);
        entry = { avatar, shown: { x: start.x, z: start.z, y: 0, yaw: start.yaw }, label: makeLabel(u), lastNonce: 0, wasAir: false, olaDelay: 0 };
        avatar.root.position.set(start.x, 0, start.z);
        avatars.set(u.userId, entry);
      }
      entry.user = u;
      return entry;
    };

    // --- Ações coletivas ---
    let collective = null; // { id, kind, by, at, members: [] na ordem em que entraram }
    let photoCam = null; // { pos, look } enquanto a foto é tirada
    let photoTaken = false;
    let toastClinked = false;
    const nameOf = (id) => avatars.get(id)?.user?.username || 'Alguém';
    const publishCollective = () => {
      setCollectiveUi(collective ? {
        id: collective.id,
        kind: collective.kind,
        by: collective.by,
        byName: nameOf(collective.by),
        joined: collective.members.includes(myId),
        count: collective.members.length,
        leader: collective.by === myId
      } : null);
    };
    const endCollective = () => {
      if (!collective) return;
      if (collective.members.includes(myId) && COLLECTIVE_EMOTES.has(me.emote)) {
        me = { ...me, emote: null };
        avatars.get(myId)?.avatar.stopEmote();
      }
      collective.members.forEach((id) => avatars.get(id)?.avatar.stopEmote());
      collective = null;
      photoCam = null;
      setCountdown(0);
      publishCollective();
    };
    const facePhotoSpot = () => {
      if (!collective) return;
      const pts = collective.members.map((id) => (id === myId ? me : avatars.get(id)?.shown)).filter(Boolean);
      if (!pts.length) return;
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
      const spread = Math.max(1, ...pts.map((p) => Math.hypot(p.x - cx, p.z - cz)));
      const dist = 3.2 + spread * 1.1;
      // câmera do lado com mais espaço (sul se der)
      const pos = new THREE.Vector3(cx, 1.75, Math.min(cz + dist, 12.4));
      photoCam = { pos, look: new THREE.Vector3(cx, 1.1, cz) };
      if (collective.members.includes(myId) && me.seat < 0) {
        me = { ...me, yaw: Math.atan2(pos.x - me.x, pos.z - me.z) };
        sendState(true);
      }
    };
    const playCollectiveOn = (id) => {
      const entry = avatars.get(id);
      if (!entry || !collective) return;
      entry.avatar.playEmote(COLLECTIVE_INFO[collective.kind].emote, collective.at);
    };
    const joinCollective = () => {
      if (!collective || collective.members.includes(myId)) return;
      collective.members.push(myId);
      voice.sendRoomMessage(encodeCollectiveJoin(collective.id));
      if (me.seat >= 0) me = keepMeta(step(me, { jump: true }, camYaw, 0));
      me = { ...me, emote: COLLECTIVE_INFO[collective.kind].emote, emoteNonce: me.emoteNonce + 1 };
      playCollectiveOn(myId);
      if (collective.kind === 'photo') facePhotoSpot();
      sendState(true);
      publishCollective();
    };
    const leaveCollective = () => {
      if (!collective || !collective.members.includes(myId)) return;
      voice.sendRoomMessage(encodeCollectiveLeave(collective.id));
      if (collective.by === myId && collective.kind === 'conga') {
        endCollective();
        return;
      }
      collective.members = collective.members.filter((id) => id !== myId);
      me = { ...me, emote: null };
      avatars.get(myId)?.avatar.stopEmote();
      sendState(true);
      publishCollective();
    };
    const startCollective = (kind) => {
      if (!allowedLive(myId, 'room.collective')) return;
      if (collective?.members.includes(myId)) leaveCollective();
      const info = COLLECTIVE_INFO[kind];
      collective = { id: randomId(), kind, by: myId, at: Date.now() + info.lead * 1000, members: [] };
      photoTaken = false;
      toastClinked = false;
      voice.sendRoomMessage(encodeCollective(collective.id, kind, collective.at));
      playAppSound('collective-start', 0.45);
      joinCollective();
    };

    function allowedLive(uid, perm) {
      const srv = live.current.server;
      return srv ? hasPermission(srv, uid, perm) : true;
    }

    const removeAvatar = (id) => {
      const entry = avatars.get(id);
      if (!entry) return;
      room.scene.remove(entry.avatar.root);
      entry.avatar.dispose();
      entry.label.el.remove();
      avatars.delete(id);
      remoteStates.delete(id);
      // quem saiu larga o que segurava
      objects.forEach((o, oid) => {
        if (o.holder === id) objects.set(oid, { ...o, holder: null, vx: 0, vy: 0, vz: 0, moving: true });
      });
      if (collective) {
        if (collective.by === id && collective.kind === 'conga') endCollective();
        else if (collective.members.includes(id)) {
          collective.members = collective.members.filter((m) => m !== id);
          publishCollective();
        }
      }
    };

    const showReaction = (id, emoji) => {
      const entry = avatars.get(id);
      if (!entry) return;
      const b = document.createElement('div');
      b.className = 'room3d-reaction';
      b.textContent = emoji;
      entry.label.el.appendChild(b);
      setTimeout(() => b.remove(), 2400);
    };

    // Som com volume pela distância de quem fez a ação.
    const soundAt = (id, x, z, base = 0.55) => {
      playAppSound(id, base * spatialGain(Math.hypot(x - me.x, z - me.z)));
    };

    // --- Rede ---
    let lastSentText = '';
    let lastSentAt = 0;
    function sendState(force = false, to = null) {
      const text = encodeState(me);
      const now = performance.now();
      if (!force && text === lastSentText && now - lastSentAt < HEARTBEAT) return;
      if (!force && now - lastSentAt < SEND_INTERVAL) return;
      voice.sendRoomMessage(text, to);
      if (!to) {
        lastSentText = text;
        lastSentAt = now;
      }
    }

    const setLocalHolding = (id) => {
      me = { ...me, holding: id };
      setHolding(Boolean(id));
    };

    const onRemote = (from, raw) => {
      const msg = decode(raw);
      if (!msg) return;
      const o = msg.id ? objects.get(msg.id) : null;
      switch (msg.type) {
        case 'state': {
          const prev = remoteStates.get(from);
          remoteStates.set(from, msg);
          peakY.set(from, Math.max(peakY.get(from) || 0, msg.y));
          if (prev && prev.playing !== msg.playing) hub.emit();
          break;
        }
        case 'reaction':
          if (reactionLimiter(from)) showReaction(from, msg.emoji);
          break;
        case 'grab': {
          if (!o) break;
          // vence a versão maior; empate, o menor id (todos decidem igual)
          const wins = msg.ver > o.ver || (msg.ver === o.ver && String(from) < String(o.holder || '~'));
          if (!wins) break;
          if (o.holder === myId) setLocalHolding(null);
          objects.set(o.id, { ...o, holder: from, ver: msg.ver, moving: false, thrower: null });
          avatars.get(from)?.avatar.playPick();
          const s = remoteStates.get(from);
          if (s) soundAt('room-pick', s.x, s.z);
          break;
        }
        case 'throw':
        case 'drop':
          if (!o || msg.ver < o.ver) break;
          if (o.holder === myId) setLocalHolding(null);
          objects.set(o.id, { ...o, x: msg.x, y: msg.y, z: msg.z, vx: msg.vx, vy: msg.vy, vz: msg.vz, holder: null, moving: true, ver: msg.ver, thrower: msg.type === 'throw' ? from : null, spent: false });
          if (msg.type === 'throw') {
            avatars.get(from)?.avatar.playThrow();
            soundAt('room-throw', msg.x, msg.z);
          }
          break;
        case 'rest':
          if (o && msg.ver === o.ver && !o.holder) objects.set(o.id, { ...o, x: msg.x, y: msg.y, z: msg.z, vx: 0, vy: 0, vz: 0, moving: false, thrower: null });
          break;
        case 'hit': {
          // só vale se quem avisou é quem arremessou aquele objeto
          if (!o || o.thrower !== from || !hitLimiter(from)) break;
          objects.set(o.id, bounceOffPerson(o));
          const target = avatars.get(msg.target);
          target?.avatar.playHit(msg.dx, msg.dz);
          if (msg.target === myId) {
            hitsTaken += 1;
            stunnedUntil = performance.now() + STUN_SECONDS * 1000;
            if (me.seat >= 0 && !me.playing) me = keepMeta(step(me, { jump: true }, camYaw, 0));
            if (!me.playing) me = { ...me, kx: msg.dx * KNOCKBACK, kz: msg.dz * KNOCKBACK, vy: Math.max(me.vy, 3) };
            shake = 0.35;
            playAppSound('room-hit', 0.7);
          } else if (target) {
            soundAt('room-hit', target.shown.x, target.shown.z);
          }
          break;
        }
        case 'snapshot':
          msg.list.forEach((e) => {
            const cur = objects.get(e.id);
            if (cur && e.ver > cur.ver) {
              if (cur.holder === myId) setLocalHolding(null);
              objects.set(e.id, { ...cur, x: e.x, y: e.y, z: e.z, holder: e.holder, ver: e.ver, moving: !e.holder, vx: 0, vy: 0, vz: 0, thrower: null });
            }
          });
          break;
        case 'look':
          remoteLooks.set(from, msg.look);
          avatars.get(from)?.avatar.setLook(msg.look);
          break;
        case 'theme':
          // só vale de quem tem permissão para mudar o tema
          if (msg.ts > themeStamp && allowedLive(from, 'room.theme')) {
            themeStamp = msg.ts;
            localStorage.setItem(themeKey(channelId), JSON.stringify({ id: msg.theme, ts: msg.ts }));
            setThemeId(msg.theme);
            applyTheme(msg.theme);
            playAppSound('room-theme', 0.5);
          }
          break;
        case 'collective': {
          if (!allowedLive(from, 'room.collective') || !collectiveLimiter(from)) break;
          if (collective?.id === msg.id) break;
          if (collective?.members.includes(myId)) leaveCollective();
          // horário de quem puxou, limitado a uma janela razoável do nosso relógio
          const at = Math.max(Date.now() - 2000, Math.min(Date.now() + 8000, msg.at));
          collective = { id: msg.id, kind: msg.kind, by: from, at, members: [from] };
          photoTaken = false;
          toastClinked = false;
          playCollectiveOn(from);
          playAppSound('collective-start', 0.4);
          publishCollective();
          break;
        }
        case 'collective-join':
          if (collective?.id === msg.id && !collective.members.includes(from)) {
            collective.members.push(from);
            playCollectiveOn(from);
            publishCollective();
          }
          break;
        case 'collective-leave':
          if (collective?.id !== msg.id) break;
          if (collective.by === from && collective.kind === 'conga') endCollective();
          else {
            collective.members = collective.members.filter((id) => id !== from);
            avatars.get(from)?.avatar.stopEmote();
            publishCollective();
          }
          break;
        case 'table':
        case 'frame':
        case 'input':
        case 'shot':
          hub.handle(from, msg);
          break;
        default:
      }
    };
    const offMsg = voice.onRoomMessage(onRemote);
    const offOpen = voice.onRoomPeerOpen((id) => {
      voice.sendRoomMessage(encodeState(me), id);
      voice.sendRoomMessage(encodeLook(myLook), id);
      voice.sendRoomMessage(encodeSnapshot(objects), id);
      if (themeStamp > 0) voice.sendRoomMessage(encodeTheme(theme.id, themeStamp), id);
      hub.snapshotTo(id);
      if (collective && collective.by === myId) voice.sendRoomMessage(encodeCollective(collective.id, collective.kind, collective.at), id);
    });

    // --- Comandos (teclado, botões e testes) ---
    const occupiedSeats = () => {
      const set = new Set();
      remoteStates.forEach((s) => { if (s.seat >= 0) set.add(s.seat); });
      return set;
    };
    const standUp = () => {
      if (me.seat >= 0) me = keepMeta(step(me, { jump: true }, camYaw, 0));
    };
    const nearJukebox = () => Math.hypot(me.x - JUKEBOX.x, me.z - (JUKEBOX.z + 0.6)) < JUKEBOX_REACH;
    const nearTable = () => {
      let best = null;
      let bestD = GAME_REACH;
      GAME_TABLES.forEach((t) => {
        const d = Math.hypot(me.x - t.x, me.z - t.z) - Math.max(t.w, t.d) / 2;
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      });
      return best;
    };
    commandsRef.current.emote = (name) => {
      if (me.seat >= 0) return;
      if (collective?.members.includes(myId)) leaveCollective();
      me = { ...me, emote: name, emoteNonce: me.emoteNonce + 1 };
      avatars.get(myId)?.avatar.playEmote(name);
      sendState(true);
    };
    commandsRef.current.react = (emoji) => {
      showReaction(myId, emoji);
      voice.sendRoomMessage(encodeReaction(emoji));
    };
    commandsRef.current.toggleSit = () => {
      if (me.seat >= 0) {
        standUp();
        me.moving = false;
      } else {
        const seat = nearestSeat(me.x, me.z, occupiedSeats());
        if (seat >= 0 && !SEATS[seat].table) me = sitAt(me, seat);
      }
      sendState(true);
    };
    commandsRef.current.interact = () => {
      if (me.seat >= 0) {
        commandsRef.current.toggleSit();
        return;
      }
      if (nearJukebox()) {
        live.current.music?.setOpen(true);
        return;
      }
      const t = nearTable();
      if (t) {
        setOpenTable(t.id);
        return;
      }
      commandsRef.current.toggleSit();
    };
    commandsRef.current.jump = () => { jumpQueued = true; };
    commandsRef.current.grabOrDrop = () => {
      if (me.holding) {
        const o = objects.get(me.holding);
        const m = dropFrom(me);
        const ver = o.ver + 1;
        objects.set(o.id, { ...o, ...m, holder: null, moving: true, ver, thrower: null });
        voice.sendRoomMessage(encodeDrop(o.id, ver, m));
        setLocalHolding(null);
        sendState(true);
        return;
      }
      const target = nearestPickable(me, objects);
      if (!target) return;
      const ver = target.ver + 1;
      objects.set(target.id, { ...target, holder: myId, ver, moving: false, thrower: null });
      setLocalHolding(target.id);
      avatars.get(myId)?.avatar.playPick();
      playAppSound('room-pick', 0.5);
      voice.sendRoomMessage(encodeGrab(target.id, ver));
      sendState(true);
    };
    commandsRef.current.throw = (aimYaw = camYaw) => {
      if (!me.holding) return;
      const o = objects.get(me.holding);
      standUp();
      me = { ...me, yaw: aimYaw };
      const m = throwFrom(me, aimYaw);
      const ver = o.ver + 1;
      objects.set(o.id, { ...o, ...m, holder: null, moving: true, ver, thrower: myId, spent: false });
      voice.sendRoomMessage(encodeThrow(o.id, ver, m));
      setLocalHolding(null);
      avatars.get(myId)?.avatar.playThrow();
      playAppSound('room-throw', 0.6);
      sendState(true);
    };
    commandsRef.current.setLook = (l) => {
      myLook = validateLook(l);
      avatars.get(myId)?.avatar.setLook(myLook);
      voice.sendRoomMessage(encodeLook(myLook));
    };
    commandsRef.current.lookAtTv = () => {
      const dz = SCREEN.z - me.z;
      const dx = SCREEN.x - me.x;
      camYaw = Math.atan2(dx, dz);
      const eyeY = (me.seat >= 0 ? seatTopOf(me.seat) + 0.7 : 1.6 + me.y);
      fpPitch = Math.atan2(SCREEN.y - eyeY, Math.hypot(dx, dz));
    };
    commandsRef.current.setTheme = (id) => {
      if (!allowedLive(myId, 'room.theme')) return;
      themeStamp = Date.now();
      localStorage.setItem(themeKey(channelId), JSON.stringify({ id, ts: themeStamp }));
      setThemeId(id);
      applyTheme(id);
      voice.sendRoomMessage(encodeTheme(id, themeStamp));
      playAppSound('room-theme', 0.5);
    };
    commandsRef.current.startCollective = startCollective;
    commandsRef.current.joinCollective = joinCollective;
    commandsRef.current.leaveCollective = leaveCollective;
    // Mesas: sentar na cadeira ou ficar em pé no lugar do jogador.
    commandsRef.current.sitAtTable = (tableId, seat) => {
      const t = tableById(tableId);
      if (!t || !hub.sit(tableId, seat)) return;
      if (collective?.members.includes(myId)) leaveCollective();
      const spot = t.spots[seat];
      if (me.holding) commandsRef.current.grabOrDrop();
      if (spot.chair) {
        me = keepMeta(sitAt({ ...me, y: 0, vy: 0 }, seatIndexFor(tableId, seat)));
      } else {
        me = keepMeta({ ...me, x: spot.x, z: spot.z, y: 0, vy: 0, yaw: spot.yaw, seat: -1, moving: false });
      }
      me.playing = tableId;
      camYaw = spot.yaw;
      sendState(true);
    };
    commandsRef.current.leaveTable = (tableId) => {
      hub.leave(tableId);
      if (me.seat >= 0 && SEATS[me.seat]?.table === tableId) standUp();
      me.playing = null;
      sendState(true);
    };

    // --- Entrada ---
    const onKeyDown = (e) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape' && live.current.openTable) {
        setOpenTable(null);
        return;
      }
      // com o painel de jogo aberto, o teclado é do jogo (não anda sem querer)
      if (live.current.openTable) return;
      if (KEYMAP[e.code]) {
        keys[KEYMAP[e.code]] = true;
        if (e.code.startsWith('Arrow')) e.preventDefault();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) jumpQueued = true;
      } else if (e.code === 'KeyE' && !e.repeat) {
        commandsRef.current.interact();
      } else if (e.code === 'KeyF' && !e.repeat) {
        commandsRef.current.grabOrDrop();
      } else if (e.code === 'KeyV' && !e.repeat) {
        setView((v) => (v === 'first' ? 'third' : 'first'));
      } else if (e.code === 'KeyT' && !e.repeat) {
        commandsRef.current.lookAtTv();
      } else if (e.code === 'KeyG' && !e.repeat) {
        commandsRef.current.throw();
      } else if (e.code === 'KeyJ' && !e.repeat) {
        if (collective && !collective.members.includes(myId)) joinCollective();
        else if (collective) leaveCollective();
      } else if (EMOTE_KEYS[e.code] && !e.repeat) {
        commandsRef.current.emote(EMOTE_KEYS[e.code]);
      }
    };
    const onKeyUp = (e) => {
      if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
    };
    const clearKeys = () => Object.keys(keys).forEach((k) => { keys[k] = false; });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);

    // Arrastar gira a câmera; um clique curto arremessa o que estiver na mão.
    let dragging = null;
    const canvas = renderer.domElement;
    const onPointerDown = (e) => {
      dragging = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, at: performance.now() };
      canvas.setPointerCapture(e.pointerId);
      if (document.activeElement && isEditable(document.activeElement)) document.activeElement.blur();
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      camYaw -= (e.clientX - dragging.x) * (live.current.view === 'first' ? 0.005 : 0.006);
      if (live.current.view === 'first') fpPitch = Math.max(-1.1, Math.min(1.1, fpPitch - (e.clientY - dragging.y) * 0.004));
      else camPitch = Math.max(0.12, Math.min(1.25, camPitch + (e.clientY - dragging.y) * 0.004));
      dragging.x = e.clientX;
      dragging.y = e.clientY;
    };
    const onPointerUp = (e) => {
      if (dragging && e.button === 0) {
        const moved = Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY);
        if (moved < 6 && performance.now() - dragging.at < 350 && me.holding) commandsRef.current.throw();
      }
      dragging = null;
    };
    const onWheel = (e) => {
      e.preventDefault();
      camDist = Math.max(3, Math.min(13, camDist + e.deltaY * 0.004));
    };
    // Se a placa de vídeo perder o contexto WebGL (driver, memória), a cena é
    // reconstruída quando ele voltar, em vez de a sala ficar em branco.
    const onContextLost = (e) => {
      e.preventDefault();
      contextLosses += 1;
      logWarn('room3d webgl', new Error('contexto WebGL perdido'));
    };
    const onContextRestored = () => applyTheme(theme.id);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      resizes += 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // --- Laço ---
    const clock = new THREE.Clock();
    const projected = new THREE.Vector3();
    const hand = new THREE.Vector3();
    const camGoal = new THREE.Vector3();
    let lastSpatial = 0;
    let lastMusicFactor = 1;
    let lastHint = '';
    let lastCountdown = 0;
    const frame = () => {
      // Quadros longos (máquina lenta) viram vários passos curtos.
      const dt = Math.min(clock.getDelta(), 0.25);
      const now = performance.now();
      const wall = Date.now();
      const users = live.current.voiceUsers || [];
      const present = new Set(users.map((u) => u.userId));
      users.forEach(ensureAvatar);
      Array.from(avatars.keys()).forEach((id) => { if (!present.has(id)) removeAvatar(id); });
      const key = Array.from(present).sort().join(',');
      if (key !== presentKey) {
        presentKey = key;
        hub.setPresent(Array.from(present));
      }

      // ação coletiva: fim, trenzinho, brinde e foto
      if (collective) {
        const info = COLLECTIVE_INFO[collective.kind];
        if (wall > collective.at + (info.length + 1) * 1000) endCollective();
      }
      const inCollective = Boolean(collective?.members.includes(myId));
      const manualMove = keys.forward || keys.back || keys.left || keys.right;
      if (inCollective && manualMove && !(collective.kind === 'conga' && collective.by === myId)) leaveCollective();
      let autoKeys = null;
      let autoYaw = camYaw;
      if (collective?.kind === 'conga' && collective.members.includes(myId) && collective.by !== myId && wall > collective.at) {
        const idx = collective.members.indexOf(myId);
        const ahead = avatars.get(collective.members[idx - 1]);
        if (ahead) {
          const tx = ahead.shown.x - Math.sin(ahead.shown.yaw) * 0.8;
          const tz = ahead.shown.z - Math.cos(ahead.shown.yaw) * 0.8;
          const d = Math.hypot(tx - me.x, tz - me.z);
          if (d > 0.3) {
            autoKeys = { forward: true, run: d > 2.5 };
            autoYaw = Math.atan2(tx - me.x, tz - me.z);
          }
        }
      }
      if (collective?.kind === 'toast' && inCollective && !toastClinked && wall > collective.at + 1250) {
        toastClinked = true;
        playAppSound('collective-toast', 0.6);
      }
      let takePhoto = false;
      if (collective?.kind === 'photo' && inCollective) {
        const left = collective.at - wall;
        const n = left > 0 ? Math.ceil(left / 1000) : 0;
        if (left < 3200 && !photoCam) facePhotoSpot();
        if (n !== lastCountdown) {
          lastCountdown = n;
          setCountdown(n);
        }
        if (left <= 0 && !photoTaken) {
          photoTaken = true;
          takePhoto = true;
        }
      } else if (lastCountdown) {
        lastCountdown = 0;
        setCountdown(0);
      }

      // jogador local
      const stunned = now < stunnedUntil;
      const before = me;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      let landed = false;
      for (let i = 0; i < steps; i++) {
        const k = autoKeys || { ...keys, jump: jumpQueued && i === 0 };
        me = keepMeta(step(me, k, autoKeys ? autoYaw : camYaw, dt / steps, { gravityScale: theme.gravity, frozen: stunned || Boolean(live.current.openTable && me.playing) }));
        landed = landed || me.landed;
      }
      if (jumpQueued && before.grounded && !me.grounded && before.seat < 0) playAppSound('room-jump', 0.45);
      jumpQueued = false;
      if (landed) {
        avatars.get(myId)?.avatar.playLand();
        playAppSound('room-land', 0.4);
      }
      if (me.moving && me.emote && me.emote !== 'conga') me = { ...me, emote: null };

      // mesa de jogo: levantar ou se afastar libera o lugar
      const mySeatAt = hub.seatOf();
      if (mySeatAt) {
        const t = tableById(mySeatAt.id);
        const spot = t.spots[mySeatAt.seat];
        const away = spot.chair ? me.seat !== seatIndexFor(t.id, mySeatAt.seat) : Math.hypot(me.x - spot.x, me.z - spot.z) > 1.6;
        if (away) hub.leave(t.id);
      }
      me.playing = hub.seatOf()?.id || null;
      sendState();

      // objetos: física local, acertos de quem arremessou, mãos de quem segura
      const people = [];
      avatars.forEach((e, id) => people.push({ id, x: e.shown.x, y: e.shown.y, z: e.shown.z }));
      const holders = new Set();
      objects.forEach((o, id) => {
        if (o.holder) {
          holders.add(o.holder);
          const holderEntry = avatars.get(o.holder);
          if (holderEntry) {
            holderEntry.avatar.handWorld(hand);
            objects.set(id, { ...o, x: hand.x, y: hand.y, z: hand.z });
          }
          return;
        }
        if (!o.moving) return;
        let next;
        if (o.thrower === myId) {
          const res = advanceThrown(o, dt, theme.gravity, people, myId);
          next = res.obj;
          const target = res.hit;
          if (target) {
            const len = Math.hypot(next.vx, next.vz) || 1;
            const dx = next.vx / len;
            const dz = next.vz / len;
            voice.sendRoomMessage(encodeHit(target, id, dx, dz));
            avatars.get(target)?.avatar.playHit(dx, dz);
            soundAt('room-hit', next.x, next.z);
            next = bounceOffPerson(next);
          }
          if (!next.moving) voice.sendRoomMessage(encodeRest(id, next.ver, next));
        } else {
          next = stepObject(o, dt, theme.gravity);
        }
        if (!next.moving) next = { ...next, thrower: null };
        objects.set(id, next);
      });
      objects.forEach((o, id) => {
        const mesh = objMeshes.get(id);
        if (!mesh) return;
        mesh.position.set(o.x, o.y, o.z);
        if (o.moving) {
          mesh.rotation.x += o.vz * dt * 3;
          mesh.rotation.z -= o.vx * dt * 3;
          mesh.rotation.y += speedOf(o) * dt * 0.5;
        }
      });

      // jogos: peças na cena e sons (a simulação roda no relógio próprio, abaixo)
      gameProps.update(hub);
      hub.takeEvents().forEach((ev) => {
        const t = tableById(ev.id);
        const sound = { move: 'game-move', capture: 'game-capture', cue: 'game-cue', point: 'game-point', over: 'game-over' }[ev.kind];
        if (sound && t) soundAt(sound, t.x, t.z, 0.6);
      });

      // dica contextual
      let nextHint = '';
      const near = me.seat < 0 && !me.holding ? nearTable() : null;
      if (me.holding) nextHint = 'G ou clique para arremessar · F para soltar';
      else if (me.playing && SEATS[me.seat]?.table) nextHint = 'E para levantar da mesa';
      else if (me.seat >= 0) nextHint = 'E para levantar';
      else if (nearJukebox()) nextHint = live.current.music?.enabled ? 'E para abrir a Vitrola' : 'Vitrola: um admin precisa adicionar o bot em Configurações › Bots';
      else if (near && !live.current.openTable) {
        const st = hub.get(near.id);
        nextHint = st.status === 'playing' && !st.players.includes(myId) ? `E para assistir ${near.label}` : `E para jogar ${near.label}`;
      } else if (nearestPickable(me, objects)) nextHint = 'F para pegar';
      else if (nearestSeat(me.x, me.z, occupiedSeats()) >= 0 && !SEATS[nearestSeat(me.x, me.z, occupiedSeats())].table) nextHint = 'E para sentar';
      if (nextHint !== lastHint) {
        lastHint = nextHint;
        setHint(nextHint);
      }

      // atraso da ola: cada um no seu tempo, da esquerda para a direita
      const olaOrder = collective?.kind === 'ola'
        ? collective.members.map((id) => [id, id === myId ? me.x : avatars.get(id)?.shown.x ?? 0]).sort((a, b) => a[1] - b[1]).map(([id]) => id)
        : null;

      // avatares
      const t = 1 - Math.exp(-dt * 12);
      avatars.forEach((entry, id) => {
        const isMe = id === myId;
        const s = isMe ? me : remoteStates.get(id);
        const target = s || entry.shown;
        const ty = target.y || 0;
        if (Math.hypot(target.x - entry.shown.x, target.z - entry.shown.z) > 4) {
          entry.shown = { x: target.x, z: target.z, y: ty, yaw: target.yaw };
        } else {
          const k = isMe ? 1 : t;
          entry.shown.x += (target.x - entry.shown.x) * k;
          entry.shown.z += (target.z - entry.shown.z) * k;
          entry.shown.y += (ty - entry.shown.y) * (isMe ? 1 : Math.min(1, t * 1.6));
          entry.shown.yaw = lerpAngle(entry.shown.yaw, target.yaw ?? entry.shown.yaw, isMe ? Math.min(1, dt * 14) : t);
        }
        if (s && !isMe && s.emote && s.emoteNonce !== entry.lastNonce) {
          entry.lastNonce = s.emoteNonce;
          // gesto de ação coletiva: na fase da ação (todo mundo junto)
          if (COLLECTIVE_EMOTES.has(s.emote) && collective?.members.includes(id)) entry.avatar.playEmote(s.emote, collective.at);
          else entry.avatar.playEmote(s.emote);
        }
        entry.olaDelay = olaOrder ? Math.max(0, olaOrder.indexOf(id)) * 0.16 : 0;
        const seat = s?.seat ?? -1;
        const ground = groundAt(entry.shown.x, entry.shown.z, entry.shown.y);
        const airborne = seat < 0 && entry.shown.y > ground + 0.06;
        if (!isMe) {
          if (airborne && !entry.wasAir && s && s.y > ground + 0.2) soundAt('room-jump', entry.shown.x, entry.shown.z);
          if (!airborne && entry.wasAir) entry.avatar.playLand();
        }
        entry.wasAir = airborne;
        entry.avatar.root.position.set(entry.shown.x, seat >= 0 ? 0 : entry.shown.y, entry.shown.z);
        entry.avatar.root.rotation.y = entry.shown.yaw;
        entry.avatar.update(dt, {
          moving: Boolean(s?.moving),
          running: Boolean(s?.running),
          seat,
          seatTop: seatTopOf(seat),
          speaking: Boolean(entry.user?.isSpeaking),
          airborne,
          holding: holders.has(id),
          olaDelay: entry.olaDelay,
          playing: Boolean(s?.playing)
        });

        const photoMode = Boolean(photoCam && inCollective);
        const firstPersonMe = isMe && live.current.view === 'first' && !live.current.customizing && !photoMode;
        entry.avatar.setVisible(!firstPersonMe);
        const headY = entry.avatar.labelHeight(seat >= 0, seatTopOf(seat)) + (seat >= 0 ? 0 : entry.shown.y);
        projected.set(entry.shown.x, headY, entry.shown.z).project(camera);
        const visible = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
        const el = entry.label.el;
        el.style.display = visible && !firstPersonMe ? '' : 'none';
        if (visible) {
          el.style.transform = `translate(-50%, -100%) translate(${(projected.x * 0.5 + 0.5) * mount.clientWidth}px, ${(-projected.y * 0.5 + 0.5) * mount.clientHeight}px)`;
          el.classList.toggle('speaking', Boolean(entry.user?.isSpeaking));
          el.classList.toggle('muted', Boolean(entry.user?.isMuted));
          el.classList.toggle('remote-unsynced', !isMe && !s);
        }
      });

      // áudio espacial (vozes e a Vitrola)
      if (now - lastSpatial > SPATIAL_INTERVAL) {
        lastSpatial = now;
        if (live.current.spatialOn) {
          const positions = new Map();
          avatars.forEach((entry, id) => { if (id !== myId) positions.set(id, { x: entry.shown.x, z: entry.shown.z }); });
          voice.updateSpatialPositions({ x: me.x, z: me.z, yaw: camYaw }, positions);
        }
        const mus = live.current.music;
        if (mus?.current) {
          const d = Math.hypot(me.x - JUKEBOX.x, me.z - JUKEBOX.z);
          const f = live.current.spatialOn ? Math.max(0.3, Math.min(1, 1.12 - d / 24)) : 1;
          if (Math.abs(f - lastMusicFactor) > 0.04) {
            lastMusicFactor = f;
            mus.setSpatialFactor(Math.round(f * 100) / 100);
          }
        }
      }

      // câmera (com tremida ao levar um golpe)
      shake = Math.max(0, shake - dt);
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0;
      const myAvatar = avatars.get(myId)?.avatar;
      const eyeY = me.seat >= 0
        ? seatTopOf(me.seat) + 0.06 + ((myAvatar?.headTop ?? 1.7) - (myAvatar?.hipY ?? 0.92)) - 0.16
        : (myAvatar?.headTop ?? 1.75) - 0.18 + me.y;
      if (photoCam && inCollective) {
        camera.position.lerp(photoCam.pos, Math.min(1, dt * 4));
        camera.lookAt(photoCam.look);
      } else if (live.current.customizing) {
        // de frente para o próprio avatar, para ver a roupa nova
        camGoal.set(me.x, (me.seat >= 0 ? 0.9 : 1.15) + (me.seat >= 0 ? 0 : me.y), me.z);
        camTarget.lerp(camGoal, Math.min(1, dt * 8));
        const fy = me.yaw;
        camera.position.set(camTarget.x + Math.sin(fy) * 2.7, camTarget.y + 0.35, camTarget.z + Math.cos(fy) * 2.7);
        camera.lookAt(camTarget);
      } else if (live.current.view === 'first') {
        // primeira pessoa: olhos do avatar, olhar livre com o mouse
        const fx = Math.sin(camYaw);
        const fz = Math.cos(camYaw);
        camera.position.set(me.x + fx * 0.14 + sx * 0.3, eyeY + sy * 0.3, me.z + fz * 0.14);
        camGoal.set(
          camera.position.x + fx * Math.cos(fpPitch),
          camera.position.y + Math.sin(fpPitch),
          camera.position.z + fz * Math.cos(fpPitch)
        );
        camera.lookAt(camGoal);
        camTarget.set(me.x, eyeY, me.z);
      } else {
        camGoal.set(me.x, me.seat >= 0 ? 1.1 : 1.3 + me.y, me.z);
        camTarget.lerp(camGoal, Math.min(1, dt * 8));
        const horiz = Math.cos(camPitch) * camDist;
        camera.position.set(
          camTarget.x - Math.sin(camYaw) * horiz + sx,
          camTarget.y + Math.sin(camPitch) * camDist + sy,
          camTarget.z - Math.cos(camYaw) * horiz
        );
        camera.lookAt(camTarget);
      }

      try {
        refreshTv(now);
        room.update(dt);
        renderer.render(room.scene, camera);
        if (takePhoto) {
          // a imagem é lida logo depois de desenhar (antes do navegador limpar o quadro)
          const url = renderer.domElement.toDataURL('image/png');
          playAppSound('collective-photo', 0.6);
          setFlash(true);
          setTimeout(() => setFlash(false), 260);
          setPhoto({ url, at: new Date() });
        }
      } catch (err) {
        if (!renderError) logWarn('room3d render', err);
        renderError = String(err?.message || err);
        renderErrors += 1;
      }
    };
    renderer.setAnimationLoop(frame);
    // Simulação dos jogos em tempo real a 60 Hz, independente de quantos quadros a
    // placa de vídeo consegue desenhar (máquina lenta não deixa a bola em câmera lenta).
    let lastTick = performance.now();
    const tickTimer = setInterval(() => {
      const now = performance.now();
      hub.tick(Math.min(0.5, (now - lastTick) / 1000));
      lastTick = now;
    }, 16);

    // Para testes de ponta a ponta e diagnóstico.
    window.__room3d = {
      me: () => ({ ...me }),
      remote: () => Object.fromEntries(remoteStates),
      avatars: () => Array.from(avatars.keys()),
      tvMode: () => live.current.tv.mode,
      tvLocal: () => live.current.tv.local,
      tvSwitches: () => tvSwitches,
      press: (k, down) => { keys[k] = down; },
      setCamYaw: (y) => { camYaw = y; },
      setCamOrbit: (pitch, dist) => {
        camPitch = Math.max(0.12, Math.min(1.25, pitch));
        camDist = Math.max(3, Math.min(13, dist));
      },
      teleport: (x, z) => {
        const p = resolve(x, z);
        me = { ...me, ...p, y: groundAt(p.x, p.z, 10), vy: 0, seat: -1 };
        sendState(true);
      },
      sit: () => commandsRef.current.toggleSit(),
      interact: () => commandsRef.current.interact(),
      emote: (name) => commandsRef.current.emote(name),
      react: (emoji) => commandsRef.current.react(emoji),
      jump: () => commandsRef.current.jump(),
      grab: () => commandsRef.current.grabOrDrop(),
      throwAt: (x, z) => commandsRef.current.throw(Math.atan2(x - me.x, z - me.z)),
      objects: () => Object.fromEntries(Array.from(objects.entries()).map(([id, o]) => [id, { x: o.x, y: o.y, z: o.z, holder: o.holder, moving: o.moving, ver: o.ver }])),
      hitsTaken: () => hitsTaken,
      peakY: (id) => peakY.get(id) || 0,
      gl: () => ({
        lost: renderer.getContext().isContextLost(),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        sceneChildren: room.scene.children.length,
        error: renderError,
        renderErrors,
        resizes,
        contextLosses,
        mounts: window.__room3dMounts,
        size: [renderer.domElement.width, renderer.domElement.height]
      }),
      resetPeakY: () => peakY.clear(),
      theme: () => theme.id,
      myLook: () => ({ ...myLook }),
      remoteLook: (id) => (remoteLooks.has(id) ? { ...remoteLooks.get(id) } : null),
      view: () => live.current.view,
      cameraY: () => camera.position.y,
      setTheme: (id) => commandsRef.current.setTheme(id),
      // jogos e ações coletivas
      table: (id) => ({ ...hub.get(id) }),
      gameFrame: (id) => hub.frame(id),
      hubSeat: () => hub.seatOf(),
      sitAtTable: (id, seat) => commandsRef.current.sitAtTable(id, seat),
      leaveTable: (id) => commandsRef.current.leaveTable(id),
      chessMove: (id, from, to) => hub.chessMove(id, { from, to }),
      checkersMove: (id, path) => hub.checkersMove(id, path),
      poolShot: (id, angle, power) => hub.poolShot(id, { angle, power }),
      openTable: (id) => setOpenTable(id),
      startCollective: (kind) => commandsRef.current.startCollective(kind),
      joinCollective: () => commandsRef.current.joinCollective(),
      collective: () => (collective ? { ...collective, members: [...collective.members] } : null),
      camera: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z })
    };

    return () => {
      renderer.setAnimationLoop(null);
      clearInterval(tickTimer);
      delete window.__room3d;
      const seated = hub.seatOf();
      if (seated) hub.leave(seated.id);
      offMsg();
      offOpen();
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      Array.from(avatars.keys()).forEach(removeAvatar);
      videoEl.srcObject = null;
      gameProps?.dispose();
      disposeObject(room.scene);
      videoTex.dispose();
      placeholderTex.dispose();
      renderer.dispose();
      canvas.remove();
    };
    // A cena é criada uma vez por entrada na sala; o resto chega por `live` e comandos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, myId, channelId, hub]);

  if (failed) {
    return (
      <div className="room3d-fallback">
        <Box size={28} />
        <strong>A sala 3D precisa de WebGL 2</strong>
        <span>Atualize o driver de vídeo ou use a visualização clássica.</span>
      </div>
    );
  }

  const currentTheme = themeById(themeId);
  const showingOwn = Boolean(share.showingLocal && share.displayedStream);
  const ci = collectiveUi ? COLLECTIVE_INFO[collectiveUi.kind] : null;

  return (
    <div className="room3d" ref={mountRef}>
      <div className="room3d-labels" ref={labelsRef} />
      {helpOpen ? (
        <div className="room3d-help">
          <span><kbd>WASD</kbd> andar</span>
          <span><kbd>Shift</kbd> correr</span>
          <span><kbd>Espaço</kbd> pular</span>
          <span><kbd>E</kbd> sentar, jogar, Vitrola</span>
          <span><kbd>F</kbd> pegar/soltar</span>
          <span><kbd>G</kbd> ou clique: arremessar</span>
          <span><kbd>1</kbd>–<kbd>4</kbd> gestos</span>
          <span><kbd>J</kbd> entrar na ação coletiva</span>
          <span><kbd>V</kbd> 1ª/3ª pessoa</span>
          <span><kbd>T</kbd> olhar para a TV</span>
          <span>arraste para girar · roda para zoom</span>
          <button className="room3d-help-close" onClick={() => setHelpOpen(false)} aria-label="Fechar atalhos"><X size={13} /></button>
        </div>
      ) : (
        <button className="room3d-help-toggle" onClick={() => setHelpOpen(true)} title="Atalhos da sala 3D" aria-label="Mostrar atalhos">
          <HelpCircle size={16} />
        </button>
      )}
      {hint && !openTable && <div className="room3d-hint">{hint}</div>}

      {ci && (
        <div className={`room3d-collective ${collectiveUi.joined ? 'joined' : ''}`} role="status">
          <ci.icon size={15} />
          <span>
            {collectiveUi.joined
              ? `${ci.label} · ${collectiveUi.count} ${collectiveUi.count === 1 ? 'pessoa' : 'pessoas'}`
              : `${collectiveUi.byName} ${ci.verb}`}
          </span>
          {!collectiveUi.joined && <button onClick={() => commandsRef.current.joinCollective?.()}>Entrar <kbd>J</kbd></button>}
          {collectiveUi.joined && (
            <button onClick={() => commandsRef.current.leaveCollective?.()}>
              {collectiveUi.leader && collectiveUi.kind === 'conga' ? 'Encerrar' : 'Sair'}
            </button>
          )}
        </div>
      )}
      {countdown > 0 && <div className="room3d-countdown" aria-live="assertive">{countdown}</div>}
      {flash && <div className="room3d-flash" />}
      {photo && (
        <div className="room3d-photo" role="dialog" aria-label="Foto em grupo">
          <img src={photo.url} alt="Foto em grupo da sala" />
          <div className="room3d-photo-actions">
            <a className="room3d-chip" href={photo.url} download={`quintal-foto-${photo.at.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`}>
              <Download size={14} /> Baixar foto
            </a>
            <button className="room3d-chip" onClick={() => setPhoto(null)}>Fechar</button>
          </div>
        </div>
      )}

      <div className="room3d-top-right">
        <button className={`room3d-chip ${customizing ? 'on' : ''}`} onClick={() => setCustomizing((v) => !v)} aria-pressed={customizing} title="Mudar a aparência do seu personagem">
          <Shirt size={14} /> Personalizar
        </button>
        <button className="room3d-chip" onClick={() => setView((v) => (v === 'first' ? 'third' : 'first'))} title="Alternar entre primeira e terceira pessoa (V)">
          {view === 'first' ? <Video size={14} /> : <Eye size={14} />} {view === 'first' ? '3ª pessoa' : '1ª pessoa'}
        </button>
        <button className="room3d-chip" onClick={() => commandsRef.current.lookAtTv?.()} title="Virar para a TV (T)">
          <Tv size={14} /> Olhar a TV
        </button>
        {music?.enabled && (
          <button className={`room3d-chip ${music.current ? 'on' : ''}`} onClick={() => music.setOpen(true)} title={music.current ? `Tocando: ${music.current.title}` : 'Abrir a Vitrola'}>
            <Disc3 size={14} /> Vitrola
          </button>
        )}
        <div className="room3d-theme">
          <button
            className="room3d-chip"
            onClick={() => canTheme && setThemeMenu((v) => !v)}
            aria-expanded={themeMenu}
            aria-disabled={!canTheme}
            title={canTheme ? 'Trocar o tema da sala para todos' : 'Seu cargo não pode trocar o tema da sala'}
          >
            {canTheme ? <Palette size={14} /> : <Lock size={14} />} {currentTheme.name}
          </button>
          {themeMenu && canTheme && (
            <div className="room3d-theme-menu" role="menu">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  role="menuitemradio"
                  aria-checked={t.id === themeId}
                  className={t.id === themeId ? 'active' : ''}
                  onClick={() => {
                    commandsRef.current.setTheme?.(t.id);
                    setThemeMenu(false);
                  }}
                >
                  <span className="room3d-swatch">{t.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span>
                  <span className="room3d-theme-name">{t.name}</span>
                  {t.gravity < 1 && <em>gravidade baixa</em>}
                  {t.id === themeId && <Check size={14} />}
                </button>
              ))}
              <div className="room3d-theme-note">O tema muda para todos na sala.</div>
            </div>
          )}
        </div>
        <button
          className={`room3d-chip ${spatialOn ? 'on' : ''}`}
          onClick={() => setSpatialOn((v) => !v)}
          title="Ouvir mais alto quem está perto e mais baixo quem está longe (vale também para a Vitrola)"
        >
          <Headphones size={14} /> Áudio espacial {spatialOn ? 'ligado' : 'desligado'}
        </button>
        {(share.watching || share.isScreenSharing) && onExpandScreen && (
          <button className="room3d-chip" onClick={onExpandScreen} title="Ver a transmissão em tela grande">
            <Maximize2 size={14} /> Ampliar TV
          </button>
        )}
      </div>
      {(otherPresenters.length > 1 || (share.isScreenSharing && otherPresenters.length > 0)) && (
        <div className="room3d-presenters" role="tablist" aria-label="O que passa na TV">
          {share.isScreenSharing && (
            <button role="tab" aria-selected={share.showingLocal} className={share.showingLocal ? 'active' : ''} onClick={share.showOwnStream}>
              Sua tela
            </button>
          )}
          {otherPresenters.map((p) => (
            <button
              key={p.userId}
              role="tab"
              aria-selected={!share.showingLocal && share.watching?.userId === p.userId}
              className={!share.showingLocal && share.watching?.userId === p.userId ? 'active' : ''}
              onClick={() => share.watchStream(p, voice.activeVoiceChannel)}
            >
              <span className="live-dot" /> {p.username}
            </button>
          ))}
        </div>
      )}
      {showingOwn && (
        <div className="room3d-own-note">
          Sua tela está na TV. Para evitar o efeito espelho, transmita uma janela em vez da tela inteira.
        </div>
      )}
      <div className="room3d-actions">
        <button onClick={() => commandsRef.current.emote?.('wave')} title="Acenar (1)"><Hand size={15} /> Acenar</button>
        <button onClick={() => commandsRef.current.emote?.('dance')} title="Dançar (2)"><Music size={15} /> Dançar</button>
        <button onClick={() => commandsRef.current.emote?.('cheer')} title="Comemorar (3)"><PartyPopper size={15} /> Comemorar</button>
        <button onClick={() => commandsRef.current.emote?.('clap')} title="Palmas (4)"><Hand size={15} className="flip" /> Palmas</button>
        <div className="room3d-together">
          <button
            className={togetherMenu ? 'on' : ''}
            onClick={() => setTogetherMenu((v) => !v)}
            aria-expanded={togetherMenu}
            title={canCollective ? 'Puxar uma ação para todo mundo entrar junto' : 'Seu cargo não pode puxar ações coletivas'}
          >
            <Users size={15} /> Juntos
          </button>
          {togetherMenu && (
            <div className="room3d-together-menu" role="menu">
              {Object.entries(COLLECTIVE_INFO).map(([kind, info]) => (
                <button
                  key={kind}
                  role="menuitem"
                  disabled={!canCollective}
                  onClick={() => {
                    commandsRef.current.startCollective?.(kind);
                    setTogetherMenu(false);
                  }}
                >
                  <info.icon size={15} /> {info.label}
                </button>
              ))}
              <div className="room3d-theme-note">{canCollective ? 'Quem estiver na sala recebe o convite (tecla J).' : 'Seu cargo não pode puxar ações coletivas.'}</div>
            </div>
          )}
        </div>
        {holding && <button className="room3d-throw" onClick={() => commandsRef.current.throw?.()} title="Arremessar (G ou clique)">Arremessar</button>}
        <span className="room3d-sep" />
        {REACTIONS.map((r) => (
          <button key={r} className="room3d-emoji" onClick={() => commandsRef.current.react?.(r)} title="Reagir">{r}</button>
        ))}
      </div>
      {voice.isMuted && <div className="room3d-muted"><MicOff size={13} /> Microfone desligado</div>}
      {customizing && <CustomizePanel look={look} onChange={setLook} onClose={() => setCustomizing(false)} />}
      {openTable && hub && !customizing && (
        <GamePanel
          hub={hub}
          tableId={openTable}
          myId={myId}
          users={voice.voiceUsers}
          onClose={() => setOpenTable(null)}
          onSit={(seat) => commandsRef.current.sitAtTable?.(openTable, seat)}
          onLeave={() => commandsRef.current.leaveTable?.(openTable)}
        />
      )}
    </div>
  );
}
