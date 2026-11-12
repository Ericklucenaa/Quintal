import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MicOff, Headphones, Maximize2, Box, Hand, Music, PartyPopper, HelpCircle, X, Palette, Check, Shirt, Eye, Video, Tv } from 'lucide-react';
import { useVoice } from '../../context/VoiceContext';
import { useScreenShare } from '../../context/ScreenShareContext';
import { useAuth } from '../../context/AuthContext';
import { defaultAvatar } from '../../services/cloud/util';
import { logWarn } from '../../services/log';
import { playAppSound } from '../../services/soundEffects';
import { SEATS, SCREEN, spawnFor, THROWABLE_SPAWNS } from '../../services/room3d/layout';
import { loadMyLook, saveMyLook, defaultLookFor, validateLook } from '../../services/room3d/looks';
import { step, nearestSeat, sitAt, lerpAngle, resolve, groundAt } from '../../services/room3d/movement';
import {
  decode, encodeReaction, encodeState, encodeGrab, encodeThrow, encodeDrop, encodeRest, encodeHit,
  encodeTheme, encodeSnapshot, encodeLook, createRateLimiter, REACTIONS
} from '../../services/room3d/protocol';
import {
  initialObjects, stepObject, advanceThrown, throwFrom, dropFrom, nearestPickable, bounceOffPerson, speedOf
} from '../../services/room3d/throwables';
import { THEMES, DEFAULT_THEME, themeById } from '../../services/room3d/themes';
import { spatialGain } from '../../services/room3d/spatial';
import { buildRoom, drawPlaceholder, makePlaceholderCanvas } from './roomScene';
import { makeThrowable } from './props';
import { Avatar } from './avatar';
import CustomizePanel from './CustomizePanel';

const SEND_INTERVAL = 100; // ms (10 Hz enquanto algo muda)
const HEARTBEAT = 1500; // ms (estado completo mesmo parado)
const SPATIAL_INTERVAL = 100;
const MAX_PIXEL_RATIO = 1.75;
const STUN_SECONDS = 0.5;
const KNOCKBACK = 5.5;
const PLACEHOLDER_DELAY = 1200; // ms sem vídeo antes de voltar ao aviso (evita piscar)

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run'
};
const EMOTE_KEYS = { Digit1: 'wave', Digit2: 'dance', Digit3: 'cheer' };
const seatTopOf = (i) => (SEATS[i]?.high ? 0.83 : SEATS[i]?.stool ? 0.47 : 0.55);

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

export default function Room3D({ onExpandScreen }) {
  const { user } = useAuth();
  const voice = useVoice();
  const share = useScreenShare();
  const myId = user?.id;
  const channelId = voice.activeVoiceChannel?.id || 'sala';

  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const [spatialOn, setSpatialOn] = useState(() => localStorage.getItem('concord_room3d_spatial') !== 'false');
  const [hint, setHint] = useState('');
  const [failed, setFailed] = useState(() => !hasWebGL2());
  const [helpOpen, setHelpOpen] = useState(true);
  const [themeId, setThemeId] = useState(() => readTheme(channelId).id);
  const [themeMenu, setThemeMenu] = useState(false);
  const [holding, setHolding] = useState(false);
  const [look, setLook] = useState(() => loadMyLook(myId));
  const [view, setView] = useState(() => (localStorage.getItem('concord_room3d_view') === 'first' ? 'first' : 'third'));
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHelpOpen(false), 9000);
    return () => clearTimeout(timer);
  }, []);

  // Valores que o laço de animação lê sem recriar a cena.
  const live = useRef({});
  const commandsRef = useRef({});
  live.current.voiceUsers = voice.voiceUsers;
  live.current.spatialOn = spatialOn;
  live.current.view = view;
  live.current.customizing = customizing;

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
  // sozinho para a TV até começar uma nova transmissão: evita a TV alternar entre
  // vídeo e "Conectando…" enquanto a presença da pessoa ainda não foi atualizada.
  const declinedRef = useRef(new Set());
  const lastWatchedRef = useRef(null);
  const presenterIds = share.presenters.map((p) => p.userId).join(',');
  const otherPresenters = share.presenters.filter((p) => p.userId !== myId);
  useEffect(() => {
    const live = new Set(presenterIds ? presenterIds.split(',') : []);
    const current = share.watching?.userId || null;
    // Deixei de assistir alguém que ainda aparece transmitindo: não volta sozinho.
    const last = lastWatchedRef.current;
    if (last && last !== current && live.has(last)) declinedRef.current.add(last);
    lastWatchedRef.current = current;
    // Quem parou de transmitir sai da lista; a próxima transmissão dele liga a TV de novo.
    declinedRef.current.forEach((id) => { if (!live.has(id)) declinedRef.current.delete(id); });
    // Candidato calculado aqui, depois de atualizar a lista (e não durante a renderização).
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

  useEffect(() => {
    if (failed || !mountRef.current || !myId) return undefined;
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
    const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 300);

    // --- Estado do laço ---
    let theme = themeById(readTheme(channelId).id);
    let themeStamp = readTheme(channelId).ts;
    let room = null; // { scene, screenMesh, update }
    const avatars = new Map(); // userId -> { avatar, shown, label, lastNonce, user, wasAir }
    const remoteStates = new Map();
    const objects = initialObjects();
    const objMeshes = new Map();
    const reactionLimiter = createRateLimiter(4, 2000);
    const hitLimiter = createRateLimiter(4, 1000);
    let hitsTaken = 0;
    let renderError = null;
    let myLook = loadMyLook(myId);
    const remoteLooks = new Map();
    let fpPitch = 0;
    let resizes = 0;
    let renderErrors = 0;
    let contextLosses = 0;
    window.__room3dMounts = (window.__room3dMounts || 0) + 1;
    const peakY = new Map(); // maior altura recebida de cada pessoa (diagnóstico e testes)
    let shake = 0;

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
        // Só troca a fonte quando a trilha de vídeo realmente muda.
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
      // Sem vídeo: mantém o último quadro por um instante antes de mostrar o aviso.
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
    let me = { x: spawn.x, z: spawn.z, y: 0, vy: 0, yaw: spawn.yaw, seat: -1, moving: false, running: false, grounded: true, emote: null, emoteNonce: 0, holding: null, kx: 0, kz: 0 };
    const keys = {};
    let jumpQueued = false;
    let stunnedUntil = 0;
    let camYaw = Math.PI;
    let camPitch = 0.42;
    let camDist = 6.2;
    const camTarget = new THREE.Vector3(me.x, 1.3, me.z);

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
      THROWABLE_SPAWNS.forEach((s, i) => {
        const mesh = makeThrowable(theme, i);
        objMeshes.set(s.id, mesh);
        room.scene.add(mesh);
      });
    };

    const applyTheme = (id) => {
      theme = themeById(id);
      const next = buildRoom(theme);
      const keepTv = room?.screenMesh.material.map;
      if (room) {
        avatars.forEach((e) => room.scene.remove(e.avatar.root));
        objMeshes.forEach((m) => room.scene.remove(m));
        disposeObject(room.scene);
      }
      room = next;
      avatars.forEach((e) => room.scene.add(e.avatar.root));
      buildObjectMeshes();
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
        entry = { avatar, shown: { x: start.x, z: start.z, y: 0, yaw: start.yaw }, label: makeLabel(u), lastNonce: 0, wasAir: false };
        avatar.root.position.set(start.x, 0, start.z);
        avatars.set(u.userId, entry);
      }
      entry.user = u;
      return entry;
    };

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
    const soundAt = (id, x, z) => {
      playAppSound(id, 0.55 * spatialGain(Math.hypot(x - me.x, z - me.z)));
    };

    // --- Rede ---
    let lastSentText = '';
    let lastSentAt = 0;
    const sendState = (force = false, to = null) => {
      const text = encodeState(me);
      const now = performance.now();
      if (!force && text === lastSentText && now - lastSentAt < HEARTBEAT) return;
      if (!force && now - lastSentAt < SEND_INTERVAL) return;
      voice.sendRoomMessage(text, to);
      if (!to) {
        lastSentText = text;
        lastSentAt = now;
      }
    };

    const setLocalHolding = (id) => {
      me = { ...me, holding: id };
      setHolding(Boolean(id));
    };

    const onRemote = (from, raw) => {
      const msg = decode(raw);
      if (!msg) return;
      const o = msg.id ? objects.get(msg.id) : null;
      switch (msg.type) {
        case 'state':
          remoteStates.set(from, msg);
          peakY.set(from, Math.max(peakY.get(from) || 0, msg.y));
          break;
        case 'reaction':
          if (reactionLimiter(from)) showReaction(from, msg.emoji);
          break;
        case 'grab': {
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
          if (msg.ver < o.ver) break;
          if (o.holder === myId) setLocalHolding(null);
          objects.set(o.id, { ...o, x: msg.x, y: msg.y, z: msg.z, vx: msg.vx, vy: msg.vy, vz: msg.vz, holder: null, moving: true, ver: msg.ver, thrower: msg.type === 'throw' ? from : null, spent: false });
          if (msg.type === 'throw') {
            avatars.get(from)?.avatar.playThrow();
            soundAt('room-throw', msg.x, msg.z);
          }
          break;
        case 'rest':
          if (msg.ver === o.ver && !o.holder) objects.set(o.id, { ...o, x: msg.x, y: msg.y, z: msg.z, vx: 0, vy: 0, vz: 0, moving: false, thrower: null });
          break;
        case 'hit': {
          // só vale se quem avisou é quem arremessou aquele objeto
          if (o.thrower !== from || !hitLimiter(from)) break;
          objects.set(o.id, bounceOffPerson(o));
          const target = avatars.get(msg.target);
          target?.avatar.playHit(msg.dx, msg.dz);
          if (msg.target === myId) {
            hitsTaken += 1;
            stunnedUntil = performance.now() + STUN_SECONDS * 1000;
            if (me.seat >= 0) me = { ...step(me, { jump: true }, camYaw, 0), emote: me.emote, emoteNonce: me.emoteNonce, holding: me.holding };
            me = { ...me, kx: msg.dx * KNOCKBACK, kz: msg.dz * KNOCKBACK, vy: Math.max(me.vy, 3) };
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
            if (e.ver > cur.ver) {
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
          if (msg.ts > themeStamp) {
            themeStamp = msg.ts;
            localStorage.setItem(themeKey(channelId), JSON.stringify({ id: msg.theme, ts: msg.ts }));
            setThemeId(msg.theme);
            applyTheme(msg.theme);
            playAppSound('room-theme', 0.5);
          }
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
    });

    // --- Comandos (teclado, botões e testes) ---
    const occupiedSeats = () => {
      const set = new Set();
      remoteStates.forEach((s) => { if (s.seat >= 0) set.add(s.seat); });
      return set;
    };
    const standUp = () => {
      if (me.seat >= 0) me = { ...step(me, { jump: true }, camYaw, 0), emote: me.emote, emoteNonce: me.emoteNonce, holding: me.holding };
    };
    commandsRef.current.emote = (name) => {
      if (me.seat >= 0) return;
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
        if (seat >= 0) me = sitAt(me, seat);
      }
      sendState(true);
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
      themeStamp = Date.now();
      localStorage.setItem(themeKey(channelId), JSON.stringify({ id, ts: themeStamp }));
      setThemeId(id);
      applyTheme(id);
      voice.sendRoomMessage(encodeTheme(id, themeStamp));
      playAppSound('room-theme', 0.5);
    };

    // --- Entrada ---
    const onKeyDown = (e) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (KEYMAP[e.code]) {
        keys[KEYMAP[e.code]] = true;
        if (e.code.startsWith('Arrow')) e.preventDefault();
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) jumpQueued = true;
      } else if (e.code === 'KeyE' && !e.repeat) {
        commandsRef.current.toggleSit();
      } else if (e.code === 'KeyF' && !e.repeat) {
        commandsRef.current.grabOrDrop();
      } else if (e.code === 'KeyV' && !e.repeat) {
        setView((v) => (v === 'first' ? 'third' : 'first'));
      } else if (e.code === 'KeyT' && !e.repeat) {
        commandsRef.current.lookAtTv();
      } else if (e.code === 'KeyG' && !e.repeat) {
        commandsRef.current.throw();
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
      camDist = Math.max(3, Math.min(11, camDist + e.deltaY * 0.004));
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
    let lastHint = '';
    const frame = () => {
      // Quadros longos (máquina lenta) viram vários passos curtos.
      const dt = Math.min(clock.getDelta(), 0.25);
      const now = performance.now();
      const users = live.current.voiceUsers || [];
      const present = new Set(users.map((u) => u.userId));
      users.forEach(ensureAvatar);
      Array.from(avatars.keys()).forEach((id) => { if (!present.has(id)) removeAvatar(id); });

      // jogador local
      const stunned = now < stunnedUntil;
      const before = me;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      let landed = false;
      for (let i = 0; i < steps; i++) {
        const k = { ...keys, jump: jumpQueued && i === 0 };
        me = { ...step(me, k, camYaw, dt / steps, { gravityScale: theme.gravity, frozen: stunned }), emote: me.emote, emoteNonce: me.emoteNonce, holding: me.holding };
        landed = landed || me.landed;
      }
      if (jumpQueued && before.grounded && !me.grounded && before.seat < 0) playAppSound('room-jump', 0.45);
      jumpQueued = false;
      if (landed) {
        avatars.get(myId)?.avatar.playLand();
        playAppSound('room-land', 0.4);
      }
      if (me.moving && before.emote) me.emote = null;
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

      // dica contextual
      let nextHint = '';
      if (me.holding) nextHint = 'G ou clique para arremessar · F para soltar';
      else if (me.seat >= 0) nextHint = 'E para levantar';
      else if (nearestPickable(me, objects)) nextHint = 'F para pegar';
      else if (nearestSeat(me.x, me.z, occupiedSeats()) >= 0) nextHint = 'E para sentar';
      if (nextHint !== lastHint) {
        lastHint = nextHint;
        setHint(nextHint);
      }

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
          entry.avatar.playEmote(s.emote);
        }
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
          holding: holders.has(id)
        });

        const firstPersonMe = isMe && live.current.view === 'first' && !live.current.customizing;
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

      // áudio espacial
      if (live.current.spatialOn && now - lastSpatial > SPATIAL_INTERVAL) {
        lastSpatial = now;
        const positions = new Map();
        avatars.forEach((entry, id) => { if (id !== myId) positions.set(id, { x: entry.shown.x, z: entry.shown.z }); });
        voice.updateSpatialPositions({ x: me.x, z: me.z, yaw: camYaw }, positions);
      }

      // câmera (com tremida ao levar um golpe)
      shake = Math.max(0, shake - dt);
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * shake * 0.6 : 0;
      const myAvatar = avatars.get(myId)?.avatar;
      const eyeY = me.seat >= 0
        ? seatTopOf(me.seat) + 0.06 + ((myAvatar?.headTop ?? 1.7) - (myAvatar?.hipY ?? 0.92)) - 0.16
        : (myAvatar?.headTop ?? 1.75) - 0.18 + me.y;
      if (live.current.customizing) {
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
      } catch (err) {
        if (!renderError) logWarn('room3d render', err);
        renderError = String(err?.message || err);
        renderErrors += 1;
      }
    };
    renderer.setAnimationLoop(frame);

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
      teleport: (x, z) => {
        const p = resolve(x, z);
        me = { ...me, ...p, y: groundAt(p.x, p.z, 10), vy: 0, seat: -1 };
        sendState(true);
      },
      sit: () => commandsRef.current.toggleSit(),
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
      setTheme: (id) => commandsRef.current.setTheme(id)
    };

    return () => {
      renderer.setAnimationLoop(null);
      delete window.__room3d;
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
      disposeObject(room.scene);
      videoTex.dispose();
      placeholderTex.dispose();
      renderer.dispose();
      canvas.remove();
    };
    // A cena é criada uma vez por entrada na sala; o resto chega por `live` e comandos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, myId, channelId]);

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

  return (
    <div className="room3d" ref={mountRef}>
      <div className="room3d-labels" ref={labelsRef} />
      {helpOpen ? (
        <div className="room3d-help">
          <span><kbd>WASD</kbd> andar</span>
          <span><kbd>Shift</kbd> correr</span>
          <span><kbd>Espaço</kbd> pular</span>
          <span><kbd>E</kbd> sentar</span>
          <span><kbd>F</kbd> pegar/soltar</span>
          <span><kbd>G</kbd> ou clique: arremessar</span>
          <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> gestos</span>
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
      {hint && <div className="room3d-hint">{hint}</div>}
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
        <div className="room3d-theme">
          <button className="room3d-chip" onClick={() => setThemeMenu((v) => !v)} aria-expanded={themeMenu} title="Trocar o tema da sala para todos">
            <Palette size={14} /> {currentTheme.name}
          </button>
          {themeMenu && (
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
          title="Ouvir mais alto quem está perto e mais baixo quem está longe"
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
        {holding && <button className="room3d-throw" onClick={() => commandsRef.current.throw?.()} title="Arremessar (G ou clique)">Arremessar</button>}
        <span className="room3d-sep" />
        {REACTIONS.map((r) => (
          <button key={r} className="room3d-emoji" onClick={() => commandsRef.current.react?.(r)} title="Reagir">{r}</button>
        ))}
      </div>
      {voice.isMuted && <div className="room3d-muted"><MicOff size={13} /> Microfone desligado</div>}
      {customizing && <CustomizePanel look={look} onChange={setLook} onClose={() => setCustomizing(false)} />}
    </div>
  );
}
