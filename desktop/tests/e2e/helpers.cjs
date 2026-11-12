// Apoio compartilhado dos testes de ponta a ponta (extraído de call.cjs):
// configuração do Electron, microfone com fala real, sondas de áudio,
// cadastro, entrada em canal e transmissão de tela.
const { app, BrowserWindow, desktopCapturer } = require('electron');
const path = require('path');

const MAIN = process.env.CONCORD_MAIN;
const PRELOAD = path.join(path.dirname(MAIN), '../preload/index.cjs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
require(MAIN);

const FS = 'http://127.0.0.1:8085/v1/projects/concord-3af70/databases/(default)/documents';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const SPEECH_B64 = require('fs').readFileSync(path.join(__dirname, 'speech.wav')).toString('base64');

// Real speech as the microphone (Chromium's fake device only beeps, which
// noise suppression removes and short polls miss). Each window starts the
// loop at a different offset.
const speechMic = (offset) => `
  (() => {
    const b64 = '${SPEECH_B64}';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints?.audio || constraints.video) return origGUM(constraints);
      const ctx = new (window.__OrigAudioContext || AudioContext)();
      const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest); src.start(0, ${offset});
      return dest.stream;
    };
    return true;
  })()`;
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}

// Injected into each page: UI helpers plus probes on Web Audio analysers so
// we can tell whether each remote participant's audio actually arrives.
const HELPERS = `window.__e2e = {
  setValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  byPlaceholder(p) { return [...document.querySelectorAll('input,textarea')].find((e) => (e.placeholder || '').includes(p)); },
  clickText(t) {
    const el = [...document.querySelectorAll('button,a,[role=button]')].find((e) => e.textContent.trim().toLowerCase().includes(t.toLowerCase()) && e.offsetParent !== null);
    if (!el) throw new Error('no clickable with text: ' + t);
    el.click(); return true;
  },
  hasText(t) { return document.body.innerText.toLowerCase().includes(t.toLowerCase()); }
};
if (!window.__probe) {
  window.__probe = { ctxs: [], analysers: [] };
  const OrigCtx = window.AudioContext; window.__OrigAudioContext = OrigCtx;
  window.AudioContext = function (...a) { const c = new OrigCtx(...a); window.__probe.ctxs.push(c); c.__where = ((new Error().stack.match(/(VoiceContext|noiseSuppression|soundEffects|SettingsModal|AccountPanels)[^)]*/) || ['?'])[0]).slice(0, 80) + ' @' + Math.round(performance.now() / 1000); return c; };
  window.AudioContext.prototype = OrigCtx.prototype;
  window.__probe.gains = [];
  window.__probe.panners = [];
  const cp = BaseAudioContext.prototype.createPanner;
  BaseAudioContext.prototype.createPanner = function () { const p = cp.call(this); window.__probe.panners.push({ node: p, ctx: this }); return p; };
  const cg = BaseAudioContext.prototype.createGain;
  BaseAudioContext.prototype.createGain = function () { const g = cg.call(this); window.__probe.gains.push({ node: g, ctx: this }); return g; };
  const gbf = AnalyserNode.prototype.getByteFrequencyData;
  AnalyserNode.prototype.getByteFrequencyData = function (arr) {
    gbf.call(this, arr);
    let s = 0; for (const x of arr) s += x;
    const lvl = Math.round((s / arr.length / 128) * 100);
    let entry = window.__probe.analysers.find((e) => e.node === this);
    if (!entry) { entry = { node: this, ctx: window.__probe.ctxs.indexOf(this.context), max: 0, recentMax: 0 }; window.__probe.analysers.push(entry); }
    entry.max = Math.max(entry.max, lvl);
    entry.recentMax = Math.max(entry.recentMax, lvl);
  };
}`;

function api(win) {
  const js = (code) => win.webContents.executeJavaScript(`(async()=>{ ${HELPERS}; ${code} })()`, true);
  const waitFor = async (code, label, timeout = 25000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try { if (await js(`return Boolean(${code});`)) return; } catch { /* not ready */ }
      await sleep(250);
    }
    throw new Error('timeout: ' + label + '\n' + (await js('return document.body.innerText').catch(() => '')).slice(0, 600));
  };
  const click = async (text) => {
    await waitFor(`(() => { try { return __e2e.clickText(${JSON.stringify(text)}); } catch { return false; } })()`, 'click ' + text);
  };
  return { js, waitFor, click };
}

async function register(win, nick) {
  const { js, waitFor, click } = api(win);
  await waitFor(`__e2e.hasText('Cadastre-se')`, 'auth');
  await js(`__e2e.clickText('Cadastre-se')`);
  await waitFor(`__e2e.byPlaceholder('Seu apelido')`, 'register');
  await js(`
    __e2e.setValue(__e2e.byPlaceholder('Seu apelido'), '${nick}');
    __e2e.setValue(__e2e.byPlaceholder('seuemail@exemplo.com'), '${nick}@example.com');
    [...document.querySelectorAll('input[type=password]')].forEach((p) => __e2e.setValue(p, 'senha-segura-123'));
  `);
  await js(`document.querySelector('form button[type=submit]').click()`);
  await click('Começar');
  await click('Criar meu servidor');
  await click('Tudo pronto');
  await waitFor(`document.querySelector('.chat-textarea')`, 'chat');
  return js(`const m = await import('/src/renderer/services/firebase.js'); return m.auth.currentUser.uid;`);
}

/** Remote participants whose audio reached my speakers since the last reset. */
const audibleRemotes = (win) => api(win).js(`
  const p = window.__probe;
  for (const a of p.analysers) a.recentMax = 0;
  await new Promise((r) => setTimeout(r, 3000));
  // The output context is the one holding one analyser per remote peer.
  const byCtx = new Map();
  for (const a of p.analysers) { if (!byCtx.has(a.ctx)) byCtx.set(a.ctx, []); byCtx.get(a.ctx).push(a); }
  // Output context = the most recently created context that owns analysers
  // (the mic detector is created before it, when joining).
  const outIdx = Math.max(...[...byCtx.keys()].filter((i) => window.__probe.ctxs[i]?.state === 'running' && /VoiceContext/.test(window.__probe.ctxs[i].__where || '')));
  const best = byCtx.get(outIdx) || [];
  const live = best.filter((a) => a.recentMax >= 14).length;
  const pcs = (window.__pcs || []).filter((pc) => pc.connectionState === 'connected').length;
  return { audible: live, analysers: best.length, levels: best.map((a) => a.recentMax).join('/') };
`);

const diag = (win) => api(win).js(`
  const out = [];
  for (const pc of window.__pcs || []) {
    if (pc.connectionState === 'closed') continue;
    const r = await pc.getStats();
    let inPk = 0, outB = 0;
    r.forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === 'audio') inPk += s.packetsReceived || 0; if (s.type === 'outbound-rtp' && s.kind === 'audio') outB += s.bytesSent || 0; });
    out.push(pc.connectionState + '/' + pc.signalingState + ' in=' + inPk + ' out=' + outB + ' snd=' + pc.getSenders().map((x) => x.track ? x.track.kind[0] + (x.track.enabled ? '+' : '-') + x.track.readyState[0] : '0').join(',') + ' rcv=' + pc.getReceivers().map((x) => x.track.kind[0] + x.track.readyState[0]).join(','));
  }
  const det = window.__probe.analysers.map((a) => 'c' + a.ctx + ':' + a.max).join(' ');
  return JSON.stringify({ pcs: out, analysers: det, ctxs: window.__probe.ctxs.map((c) => c.state + ' ' + c.__where).join(' | ') });
`);

const streamState = (win) => api(win).js(`
  const v = document.querySelector('.screen-video');
  const sharing = Boolean(document.querySelector('.dock-btn.on[title="Parar transmissão"]'));
  if (!v) return { sharing, video: false, badge: document.querySelector('.stream-overlay-badge')?.textContent || null };
  const q1 = v.getVideoPlaybackQuality().totalVideoFrames;
  await new Promise((r) => setTimeout(r, 1500));
  const q2 = v.getVideoPlaybackQuality().totalVideoFrames;
  const track = v.srcObject?.getVideoTracks?.()[0];
  return {
    sharing,
    video: true,
    width: v.videoWidth,
    framesAdvancing: q2 > q1,
    badge: document.querySelector('.stream-overlay-badge')?.textContent || null,
    remoteTrack: Boolean(track && !/screen|window|desktop/i.test(track.label)),
    label: track?.label || null
  };
`);

async function joinChannel(win, label, serverTag, voiceName) {
  const { js, waitFor } = api(win);
  await js(`[...document.querySelectorAll('.server-sidebar .server-icon-wrapper')].find((x) => (x.title || '').includes('${serverTag}'))?.querySelector('.server-btn')?.click()`);
  await waitFor(`[...document.querySelectorAll('.channel-item')].some((e) => e.textContent.includes('${voiceName}'))`, 'voice channel ' + label);
  await js(`[...document.querySelectorAll('.channel-item')].find((e) => e.textContent.includes('${voiceName}')).click()`);
}

async function startShare(win, label) {
  const { js, waitFor, click } = api(win);
  await js(`document.querySelector('.dock-btn[title="Transmitir tela"]').click()`);
  await waitFor(`document.querySelector('.source-item')`, 'screen sources ' + label);
  await js(`document.querySelector('.source-item').click()`);
  await click('Iniciar Transmissão');
  await waitFor(`document.querySelector('.dock-btn.on[title="Parar transmissão"]')`, 'sharing ' + label);
}


module.exports = { app, BrowserWindow, desktopCapturer, path, PRELOAD, FS, sleep, results, speechMic, check, enc, api, register, audibleRemotes, diag, streamState, joinChannel, startShare };
