// Sala 3D (Terraço) de ponta a ponta, em duas janelas Electron reais (A e B) com
// microfones de fala e emuladores do Firebase. Verifica: abertura com WebGL,
// troca de estado pelo canal de dados, movimento sincronizado, áudio espacial,
// sentar e levantar, gestos, reações, TV com transmissão de tela, rejeição de
// mensagens maliciosas e volta ao modo clássico com o áudio intacto.
// Uso: npm run test:e2e:room3d   (SHOT_DIR=<pasta> salva capturas da cena)
const fs = require('fs');
const {
  app, BrowserWindow, desktopCapturer, path, PRELOAD, FS, sleep, results, speechMic, check, enc,
  api, register, audibleRemotes, joinChannel, startShare
} = require('./helpers.cjs');

const SHOT_DIR = process.env.SHOT_DIR || null;
const shot = async (win, name) => {
  if (!SHOT_DIR) return;
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), img.toPNG());
};

const outputCtx = `window.__probe.ctxs.filter((c) => /VoiceContext/.test(c.__where || '')).pop()`;

app.whenReady().then(async () => {
  await sleep(300);
  const existing = BrowserWindow.getAllWindows();
  const mk = (part) => {
    const w = new BrowserWindow({
      width: 1280, height: 800, show: false,
      webPreferences: { offscreen: true, preload: PRELOAD, contextIsolation: true, sandbox: false, partition: part, backgroundThrottling: false }
    });
    const ses = w.webContents.session;
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
    ses.setDisplayMediaRequestHandler(async (_req, cb) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      cb({ video: sources[0] });
    });
    return w;
  };
  const A = mk('persist:room-a');
  const B = mk('persist:room-b');
  existing.forEach((w) => w.destroy());
  setTimeout(() => { console.log('RESULT timeout'); app.exit(1); }, 360000);
  for (const w of [A, B]) {
    await w.webContents.session.clearStorageData();
    await w.loadURL('http://localhost:5173');
    await w.webContents.executeJavaScript(speechMic([A, B].indexOf(w) * 6));
  }
  try {
    const tag = Date.now().toString(36).slice(-4);
    const names = { A: `ana${tag}`, B: `bruno${tag}` };
    const aId = await register(A, names.A);
    const bId = await register(B, names.B);
    for (const w of [A, B]) await api(w).js('return 1');

    const servers = await (await fetch(`${FS}/concord_servers`, { headers: { Authorization: 'Bearer owner' } })).json();
    const sDoc = servers.documents.find((d) => d.fields.ownerId?.stringValue === aId);
    const serverId = sDoc.name.split('/').pop();
    const members = sDoc.fields.memberIds.arrayValue.values.map((v) => v.stringValue);
    await fetch(`${FS}/concord_servers/${serverId}?updateMask.fieldPaths=memberIds`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { memberIds: enc([...members, bId]) } })
    });
    const voiceName = sDoc.fields.channels.arrayValue.values.map((v) => v.mapValue.fields).find((c) => c.type.stringValue === 'voice').name.stringValue;
    await sleep(2500);

    await joinChannel(A, 'A', names.A, voiceName);
    await joinChannel(B, 'B', names.A, voiceName);
    await sleep(6000);
    const base = await audibleRemotes(A);
    check('base: A e B se ouvem antes da sala 3D', base.audible >= 1, JSON.stringify(base));

    // --- Entrar na sala 3D ---------------------------------------------------
    for (const [n, w] of [['A', A], ['B', B]]) {
      await api(w).waitFor(`document.querySelector('.dock-btn[title="Entrar na sala 3D"]')`, `botão sala 3D ${n}`);
      await api(w).js(`document.querySelector('.dock-btn[title="Entrar na sala 3D"]').click(); return true;`);
      await api(w).waitFor(`window.__room3d && document.querySelector('.room3d-canvas')`, `sala 3D aberta ${n}`, 40000);
    }
    check('sala: abre nas duas janelas (WebGL)', true);
    await api(A).waitFor(`window.__room3d.remote()['${bId}']`, 'A recebe estado de B', 20000);
    await api(B).waitFor(`window.__room3d.remote()['${aId}']`, 'B recebe estado de A', 20000);
    check('canal de dados: A e B trocam estado', true);
    const labels = await api(A).js(`return [...document.querySelectorAll('.room3d-label span')].map((s) => s.textContent).join(' | ')`);
    check('sala: rótulos com os nomes dos dois', labels.includes(names.A) && labels.includes(names.B), labels);
    await sleep(3000);
    await shot(A, '01_sala_vista_por_A');

    // --- Movimento sincronizado --------------------------------------------
    const startA = await api(A).js('return window.__room3d.me()');
    await api(A).js(`window.__room3d.setCamYaw(Math.PI); window.__room3d.press('right', true); return true;`);
    await sleep(900);
    await api(A).js(`window.__room3d.press('right', false); return true;`);
    await sleep(1200);
    const endA = await api(A).js('return window.__room3d.me()');
    const seenByB = await api(B).js(`return window.__room3d.remote()['${aId}']`);
    const moved = Math.hypot(endA.x - startA.x, endA.z - startA.z);
    const err = Math.hypot(seenByB.x - endA.x, seenByB.z - endA.z);
    check('movimento: A anda e B vê A no mesmo lugar', moved > 1.5 && err < 0.1, `andou ${moved.toFixed(2)} m, diferença ${err.toFixed(3)} m`);

    // --- Áudio espacial ----------------------------------------------------
    const sp = await api(B).js(`
      const out = ${outputCtx};
      const pans = window.__probe.panners.filter((p) => p.ctx === out);
      await new Promise((r) => setTimeout(r, 600));
      const me = window.__room3d.me();
      return { panners: pans.length, pannerX: pans.map((p) => p.node.positionX.value), listenerX: out.listener.positionX.value, meX: me.x };
    `);
    check(
      'áudio espacial: a voz de A em B segue a posição de A',
      sp.panners >= 1 && sp.pannerX.some((x) => Math.abs(x - endA.x) < 0.2) && Math.abs(sp.listenerX - sp.meX) < 0.2,
      JSON.stringify(sp)
    );
    let heard = await audibleRemotes(B);
    check('áudio espacial: B continua ouvindo A', heard.audible >= 1, JSON.stringify(heard));

    // --- Sentar ------------------------------------------------------------
    await api(A).js('window.__room3d.teleport(0, 1.0); window.__room3d.sit(); return true;');
    await sleep(1200);
    const satA = await api(A).js('return window.__room3d.me()');
    const satSeen = await api(B).js(`return window.__room3d.remote()['${aId}']`);
    check('sentar: A senta e B vê A no mesmo assento', satA.seat >= 0 && satSeen.seat === satA.seat && satSeen.pose === 'sit', `A=${satA.seat} visto=${satSeen.seat}`);
    await api(B).js('window.__room3d.teleport(2.4, 1.7); window.__room3d.setCamYaw(-Math.PI / 2); return true;');
    await sleep(1200);
    await shot(B, '02_A_sentado_visto_por_B');
    await api(A).js('window.__room3d.sit(); return true;');
    await sleep(800);
    const upA = await api(A).js('return window.__room3d.me()');
    check('sentar: A levanta pelo ponto de saída', upA.seat === -1, JSON.stringify(upA));

    // --- Gesto e reação ------------------------------------------------------
    await api(A).js(`window.__room3d.emote('dance'); return true;`);
    await sleep(800);
    const em = await api(B).js(`return window.__room3d.remote()['${aId}']`);
    check('gesto: B recebe a dança de A', em.emote === 'dance' && em.emoteNonce >= 1, JSON.stringify({ e: em.emote, n: em.emoteNonce }));
    await api(A).js(`window.__room3d.react('🔥'); return true;`);
    await sleep(500);
    const reacted = await api(B).js(`return [...document.querySelectorAll('.room3d-reaction')].map((x) => x.textContent).join('')`);
    check('reação: B vê a reação de A', reacted.includes('🔥'), reacted);
    await shot(B, '03_danca_e_reacao');

    // --- TV com transmissão de tela ------------------------------------------
    await startShare(A, 'A');
    await api(B).waitFor(`window.__room3d.tvMode() === 'video'`, 'TV de B mostra a tela de A', 25000);
    check('TV: B assiste a tela de A na TV da sala', true);
    const tvA = await api(A).js('return window.__room3d.tvMode()');
    check('TV: quem transmite vê um aviso (sem espelho infinito)', tvA === 'self', tvA);
    await api(B).js('window.__room3d.teleport(0, 0.3); window.__room3d.setCamYaw(Math.PI); return true;');
    await sleep(2500);
    await shot(B, '04_tv_com_a_tela_de_A');
    await shot(A, '05_A_transmitindo');
    await api(A).js(`document.querySelector('.dock-btn.on[title="Parar transmissão"]').click(); return true;`);
    let tvBack = false;
    for (let i = 0; i < 60 && !tvBack; i++) {
      tvBack = await api(B).js(`return window.__room3d.tvMode() === 'idle'`);
      if (!tvBack) await sleep(500);
    }
    const tvDiag = await api(B).js(`return { mode: window.__room3d.tvMode(), aoVivo: [...document.querySelectorAll('.live-badge')].length }`);
    const aDock = await api(A).js(`return { sharing: Boolean(document.querySelector('.dock-btn.on[title="Parar transmissão"]')) }`);
    check('TV: ao parar a transmissão, a TV volta ao aviso', tvBack, JSON.stringify({ B: tvDiag, A: aDock }));

    // --- Mensagens maliciosas são ignoradas ----------------------------------
    const bad = await api(A).js(`
      const m = await import('/src/renderer/services/room3d/protocol.js');
      return [m.decode('{"v":1,"t":"s","x":1e9,"z":0,"y":0,"s":999}'), m.decode('{"v":1,"t":"r","e":"<img src=x onerror=alert(1)>"}')];
    `);
    check('segurança: posição absurda é limitada e reação fora da lista é descartada', bad[0].x === 9 && bad[0].seat === -1 && bad[1] === null, JSON.stringify(bad));

    // --- Voltar ao modo clássico ---------------------------------------------
    await api(B).js(`document.querySelector('.dock-btn[title="Voltar para a visualização clássica"]').click(); return true;`);
    await api(B).waitFor(`!window.__room3d && document.querySelector('.voice-tile')`, 'B volta ao clássico');
    await sleep(1000);
    heard = await audibleRemotes(B);
    check('clássico: ao sair da sala 3D, B continua ouvindo A', heard.audible >= 1, JSON.stringify(heard));
    const persisted = await api(B).js(`return localStorage.getItem('concord_room3d')`);
    check('preferência: a escolha do modo fica salva', persisted === 'false', persisted);
  } catch (e) {
    check('execução do teste', false, e.message.slice(0, 600));
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`RESULT ${results.length - failed}/${results.length} passed`);
    setTimeout(() => app.exit(0), 300);
  }
});
