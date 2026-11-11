import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MicOff, Headphones, Maximize2, Box, Hand, Music, PartyPopper, HelpCircle, X } from 'lucide-react';
import { useVoice } from '../../context/VoiceContext';
import { useScreenShare } from '../../context/ScreenShareContext';
import { useAuth } from '../../context/AuthContext';
import { defaultAvatar } from '../../services/cloud/util';
import { logWarn } from '../../services/log';
import { SEATS, spawnFor } from '../../services/room3d/layout';
import { step, nearestSeat, sitAt, lerpAngle, resolve } from '../../services/room3d/movement';
import { decode, encodeReaction, encodeState, createRateLimiter, REACTIONS } from '../../services/room3d/protocol';
import { buildTerrace, drawPlaceholder, makePlaceholderCanvas } from './terraceScene';
import { Avatar } from './avatar';

const SEND_INTERVAL = 100; // ms (10 Hz enquanto algo muda)
const HEARTBEAT = 1500; // ms (estado completo mesmo parado)
const SPATIAL_INTERVAL = 100;
const MAX_PIXEL_RATIO = 1.75;

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run'
};
const EMOTE_KEYS = { Digit1: 'wave', Digit2: 'dance', Digit3: 'cheer' };

export function hasWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export default function Room3D({ onExpandScreen }) {
  const { user } = useAuth();
  const voice = useVoice();
  const share = useScreenShare();
  const myId = user?.id;

  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const [spatialOn, setSpatialOn] = useState(() => localStorage.getItem('concord_room3d_spatial') !== 'false');
  const [hint, setHint] = useState('');
  const [failed, setFailed] = useState(!hasWebGL2());
  // Atalhos visíveis ao entrar; recolhem sozinhos para não cobrir a TV.
  const [helpOpen, setHelpOpen] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setHelpOpen(false), 9000);
    return () => clearTimeout(timer);
  }, []);

  // Valores que o laço de animação lê sem recriar a cena.
  const live = useRef({});
  live.current.voiceUsers = voice.voiceUsers;
  live.current.spatialOn = spatialOn;

  // Comandos da interface para dentro do laço
  const commandsRef = useRef({});

  // TV: qual transmissão mostrar
  const watchedStream = share.watching ? share.remoteScreenStreams.get(share.watching.userId) || null : null;
  live.current.tv = {
    stream: watchedStream,
    mode: watchedStream ? 'video'
      : share.watching ? 'waiting'
        : share.isScreenSharing ? 'self' : 'idle',
    who: share.watching?.username || ''
  };

  // Assistir automaticamente a primeira transmissão da sala quando não houver outra escolhida.
  const otherPresenters = share.presenters.filter((p) => p.userId !== myId);
  const firstOther = otherPresenters[0];
  useEffect(() => {
    if (!share.watching && firstOther && voice.activeVoiceChannel) {
      share.watchStream(firstOther, voice.activeVoiceChannel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstOther?.userId, share.watching?.userId]);

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

    const { scene, screenMesh, update: updateScene } = buildTerrace();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

    // --- TV ---
    const placeholderCanvas = makePlaceholderCanvas('Ninguém está transmitindo', 'Use o botão de tela do painel para mostrar algo aqui');
    const placeholderTex = new THREE.CanvasTexture(placeholderCanvas);
    placeholderTex.colorSpace = THREE.SRGBColorSpace;
    const videoEl = document.createElement('video');
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    const videoTex = new THREE.VideoTexture(videoEl);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    let tvKey = '';
    const refreshTv = () => {
      const tv = live.current.tv;
      const key = `${tv.mode}:${tv.who}:${tv.stream?.id || ''}`;
      if (key === tvKey) return;
      tvKey = key;
      if (tv.mode === 'video' && tv.stream) {
        videoEl.srcObject = tv.stream;
        videoEl.muted = false;
        videoEl.play().catch((err) => logWarn('room3d tv play', err));
        screenMesh.material.map = videoTex;
      } else {
        videoEl.srcObject = null;
        const [title, sub] = tv.mode === 'self'
          ? ['Você está transmitindo', 'Todos na sala veem a sua tela aqui']
          : tv.mode === 'waiting'
            ? [`Conectando à tela de ${tv.who}…`, 'A transmissão aparece em instantes']
            : ['Ninguém está transmitindo', 'Use o botão de tela do painel para mostrar algo aqui'];
        drawPlaceholder(placeholderCanvas, title, sub);
        placeholderTex.needsUpdate = true;
        screenMesh.material.map = placeholderTex;
      }
      screenMesh.material.needsUpdate = true;
    };

    // --- Jogador local ---
    const spawn = spawnFor(myId);
    let me = { x: spawn.x, z: spawn.z, yaw: spawn.yaw, seat: -1, moving: false, running: false, emote: null, emoteNonce: 0 };
    const keys = {};
    let camYaw = Math.PI;
    let camPitch = 0.42;
    let camDist = 6.2;
    const camTarget = new THREE.Vector3(me.x, 1.3, me.z);

    // --- Avatares ---
    const avatars = new Map(); // userId -> { avatar, shown: {x,z,yaw}, target, label }
    const remoteStates = new Map(); // userId -> estado decodificado
    const reactionLimiter = createRateLimiter(4, 2000);

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
      return { el, name, mic };
    };

    const ensureAvatar = (u) => {
      let entry = avatars.get(u.userId);
      if (!entry) {
        const avatar = new Avatar(u.userId);
        scene.add(avatar.root);
        const start = u.userId === myId ? me : spawnFor(u.userId);
        entry = { avatar, shown: { x: start.x, z: start.z, yaw: start.yaw }, label: makeLabel(u), lastNonce: 0 };
        avatar.root.position.set(start.x, 0, start.z);
        avatars.set(u.userId, entry);
      }
      entry.user = u;
      return entry;
    };

    const removeAvatar = (id) => {
      const entry = avatars.get(id);
      if (!entry) return;
      scene.remove(entry.avatar.root);
      entry.avatar.dispose();
      entry.label.el.remove();
      avatars.delete(id);
      remoteStates.delete(id);
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
    const offMsg = voice.onRoomMessage((from, raw) => {
      const msg = decode(raw);
      if (!msg) return;
      if (msg.type === 'state') remoteStates.set(from, msg);
      else if (msg.type === 'reaction' && reactionLimiter(from)) showReaction(from, msg.emoji);
    });
    const offOpen = voice.onRoomPeerOpen((id) => voice.sendRoomMessage(encodeState(me), id));

    // --- Comandos vindos dos botões ---
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
    const occupiedSeats = () => {
      const set = new Set();
      remoteStates.forEach((s) => { if (s.seat >= 0) set.add(s.seat); });
      return set;
    };
    commandsRef.current.toggleSit = () => {
      if (me.seat >= 0) {
        me = step(me, { forward: true }, 0, 0); // levanta pelo ponto de saída
        me.moving = false;
      } else {
        const seat = nearestSeat(me.x, me.z, occupiedSeats());
        if (seat >= 0) me = sitAt(me, seat);
      }
      sendState(true);
    };

    // --- Entrada ---
    const onKeyDown = (e) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (KEYMAP[e.code]) {
        keys[KEYMAP[e.code]] = true;
        if (e.code.startsWith('Arrow')) e.preventDefault();
      } else if (e.code === 'KeyE' && !e.repeat) {
        commandsRef.current.toggleSit();
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

    let dragging = null;
    const canvas = renderer.domElement;
    const onPointerDown = (e) => {
      dragging = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      if (document.activeElement && isEditable(document.activeElement)) document.activeElement.blur();
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      camYaw -= (e.clientX - dragging.x) * 0.006;
      camPitch = Math.max(0.12, Math.min(1.25, camPitch + (e.clientY - dragging.y) * 0.004));
      dragging = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = () => { dragging = null; };
    const onWheel = (e) => {
      e.preventDefault();
      camDist = Math.max(3, Math.min(11, camDist + e.deltaY * 0.004));
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
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
    let lastSpatial = 0;
    let lastHint = '';
    const frame = () => {
      // Quadros longos (máquina lenta) viram vários passos curtos: o movimento
      // continua fiel ao tempo real até ~4 FPS, sem atravessar móveis.
      const dt = Math.min(clock.getDelta(), 0.25);
      const users = live.current.voiceUsers || [];
      const present = new Set(users.map((u) => u.userId));
      users.forEach(ensureAvatar);
      Array.from(avatars.keys()).forEach((id) => { if (!present.has(id)) removeAvatar(id); });

      // jogador local
      const before = me;
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < steps; i++) me = { ...step(me, keys, camYaw, dt / steps), emote: me.emote, emoteNonce: me.emoteNonce };
      if (me.moving && before.emote) me.emote = null;
      sendState();

      // dica contextual
      let nextHint = '';
      if (me.seat >= 0) nextHint = 'E para levantar';
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
        if (Math.hypot(target.x - entry.shown.x, target.z - entry.shown.z) > 4) {
          entry.shown = { x: target.x, z: target.z, yaw: target.yaw };
        } else {
          entry.shown.x += (target.x - entry.shown.x) * (isMe ? 1 : t);
          entry.shown.z += (target.z - entry.shown.z) * (isMe ? 1 : t);
          entry.shown.yaw = lerpAngle(entry.shown.yaw, target.yaw ?? entry.shown.yaw, isMe ? Math.min(1, dt * 14) : t);
        }
        if (s && !isMe && s.emote && s.emoteNonce !== entry.lastNonce) {
          entry.lastNonce = s.emoteNonce;
          entry.avatar.playEmote(s.emote);
        }
        const seat = s?.seat ?? -1;
        entry.avatar.root.position.set(entry.shown.x, 0, entry.shown.z);
        entry.avatar.root.rotation.y = entry.shown.yaw;
        entry.avatar.update(dt, {
          moving: Boolean(s?.moving),
          running: Boolean(s?.running),
          seat,
          high: seat >= 0 && Boolean(SEATS[seat]?.high),
          speaking: Boolean(entry.user?.isSpeaking)
        });

        // rótulo
        const headY = seat >= 0 ? (SEATS[seat]?.high ? 2.15 : 1.75) : 2.15;
        projected.set(entry.shown.x, headY, entry.shown.z).project(camera);
        const visible = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
        const el = entry.label.el;
        el.style.display = visible ? '' : 'none';
        if (visible) {
          el.style.transform = `translate(-50%, -100%) translate(${(projected.x * 0.5 + 0.5) * mount.clientWidth}px, ${(-projected.y * 0.5 + 0.5) * mount.clientHeight}px)`;
          el.classList.toggle('speaking', Boolean(entry.user?.isSpeaking));
          el.classList.toggle('muted', Boolean(entry.user?.isMuted));
          el.classList.toggle('remote-unsynced', !isMe && !s);
        }
      });

      // áudio espacial
      const now = performance.now();
      if (live.current.spatialOn && now - lastSpatial > SPATIAL_INTERVAL) {
        lastSpatial = now;
        const positions = new Map();
        avatars.forEach((entry, id) => { if (id !== myId) positions.set(id, { x: entry.shown.x, z: entry.shown.z }); });
        voice.updateSpatialPositions({ x: me.x, z: me.z, yaw: camYaw }, positions);
      }

      // câmera em terceira pessoa
      camTarget.lerp(new THREE.Vector3(me.x, me.seat >= 0 ? 1.1 : 1.3, me.z), Math.min(1, dt * 8));
      const horiz = Math.cos(camPitch) * camDist;
      camera.position.set(
        camTarget.x - Math.sin(camYaw) * horiz,
        camTarget.y + Math.sin(camPitch) * camDist,
        camTarget.z - Math.cos(camYaw) * horiz
      );
      camera.lookAt(camTarget);

      refreshTv();
      updateScene(dt);
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(frame);

    // Para testes de ponta a ponta e diagnóstico.
    window.__room3d = {
      me: () => ({ ...me }),
      remote: () => Object.fromEntries(remoteStates),
      avatars: () => Array.from(avatars.keys()),
      tvMode: () => live.current.tv.mode,
      press: (k, down) => { keys[k] = down; },
      setCamYaw: (y) => { camYaw = y; },
      teleport: (x, z) => { me = { ...me, ...resolve(x, z), seat: -1 }; sendState(true); },
      sit: () => commandsRef.current.toggleSit(),
      emote: (name) => commandsRef.current.emote(name),
      react: (emoji) => commandsRef.current.react(emoji)
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
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      Array.from(avatars.keys()).forEach(removeAvatar);
      videoEl.srcObject = null;
      videoTex.dispose();
      placeholderTex.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            m.map?.dispose?.();
            m.dispose();
          });
        }
      });
      renderer.dispose();
      canvas.remove();
    };
    // A cena é criada uma vez por entrada na sala; o resto chega por `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, myId]);

  if (failed) {
    return (
      <div className="room3d-fallback">
        <Box size={28} />
        <strong>A sala 3D precisa de WebGL 2</strong>
        <span>Atualize o driver de vídeo ou use a visualização clássica.</span>
      </div>
    );
  }

  return (
    <div className="room3d" ref={mountRef}>
      <div className="room3d-labels" ref={labelsRef} />
      {helpOpen ? (
        <div className="room3d-help">
          <span><kbd>WASD</kbd> andar</span>
          <span><kbd>Shift</kbd> correr</span>
          <span><kbd>E</kbd> sentar</span>
          <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> gestos</span>
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
      {otherPresenters.length > 1 && (
        <div className="room3d-presenters" role="tablist" aria-label="O que passa na TV">
          {otherPresenters.map((p) => (
            <button
              key={p.userId}
              role="tab"
              aria-selected={share.watching?.userId === p.userId}
              className={share.watching?.userId === p.userId ? 'active' : ''}
              onClick={() => share.watchStream(p, voice.activeVoiceChannel)}
            >
              <span className="live-dot" /> {p.username}
            </button>
          ))}
        </div>
      )}
      <div className="room3d-actions">
        <button onClick={() => commandsRef.current.emote?.('wave')} title="Acenar (1)"><Hand size={15} /> Acenar</button>
        <button onClick={() => commandsRef.current.emote?.('dance')} title="Dançar (2)"><Music size={15} /> Dançar</button>
        <button onClick={() => commandsRef.current.emote?.('cheer')} title="Comemorar (3)"><PartyPopper size={15} /> Comemorar</button>
        <span className="room3d-sep" />
        {REACTIONS.map((r) => (
          <button key={r} className="room3d-emoji" onClick={() => commandsRef.current.react?.(r)} title="Reagir">{r}</button>
        ))}
      </div>
      {voice.isMuted && <div className="room3d-muted"><MicOff size={13} /> Microfone desligado</div>}
    </div>
  );
}
