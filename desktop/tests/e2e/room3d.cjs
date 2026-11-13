// Sala 3D (Bar do Quintal) de ponta a ponta, em duas janelas Electron reais (A e B) com
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
    if (process.env.E2E_CONSOLE) {
      w.webContents.on('console-message', (_e, level, message) => {
        if (level >= 2 || /THREE|WebGL|context/i.test(message)) console.log(`CONSOLE ${part} ${level} ${message.slice(0, 300)}`);
      });
    }
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
    await api(A).waitFor(`__e2e.hasText('Cadastre-se')`, 'tela de login');
    await sleep(800);
    await shot(A, '00_login');
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
    const soundsA = await api(A).js('return window.__appSoundLog || []');
    const soundsB = await api(B).js('return window.__appSoundLog || []');
    check('sons: cada um ouve o som de "entrei na chamada"', soundsA.includes('voice-join-self') && soundsB.includes('voice-join-self'), `A=${soundsA} B=${soundsB}`);
    check('sons: A ouve o som de "alguém entrou" quando B chega', soundsA.includes('voice-user-join'), soundsA.join(','));
    check('sons: B não ouve "alguém entrou" pelas pessoas que já estavam lá', !soundsB.includes('voice-user-join'), soundsB.join(','));

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
    await api(A).js('window.__room3d.teleport(0, -9.2); window.__room3d.sit(); return true;');
    await sleep(1200);
    const satA = await api(A).js('return window.__room3d.me()');
    const satSeen = await api(B).js(`return window.__room3d.remote()['${aId}']`);
    check('sentar: A senta e B vê A no mesmo assento', satA.seat >= 0 && satSeen.seat === satA.seat && satSeen.pose === 'sit', `A=${satA.seat} visto=${satSeen.seat}`);
    await api(B).js('window.__room3d.teleport(1.8, -6.8); window.__room3d.setCamYaw(Math.PI); return true;');
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

    // --- Pular e subir -------------------------------------------------------
    await api(A).js('window.__room3d.teleport(-3, 5.6); return true;');
    await sleep(600);
    // B observa a altura de A enquanto A pula
    await api(B).js('window.__room3d.resetPeakY(); return true;');
    const ownPeak = await api(A).js(`
      window.__room3d.jump();
      let peak = 0;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          peak = Math.max(peak, window.__room3d.me().y || 0);
          if (performance.now() - t0 < 1500) setTimeout(tick, 20); else resolve();
        };
        tick();
      });
      return peak;
    `);
    await sleep(600);
    const peak = await api(B).js(`return window.__room3d.peakY('${aId}')`);
    check('pulo: A pula e B vê A no ar', ownPeak > 0.5 && peak > 0.5, `altura de A: ${ownPeak.toFixed(2)} m; vista por B: ${peak.toFixed(2)} m`);

    await api(A).js(`window.__room3d.teleport(-1.6, -10.2); window.__room3d.setCamYaw(Math.PI / 2); window.__room3d.press('forward', true); return true;`);
    await sleep(500);
    await api(A).js(`window.__room3d.press('forward', false); return true;`);
    await sleep(900);
    const onTable = await api(A).js('return window.__room3d.me()');
    const onTableSeen = await api(B).js(`return window.__room3d.remote()['${aId}']`);
    check('subir: A sobe na mesa andando e B vê A em cima dela', Math.abs(onTable.y - 0.36) < 0.02 && Math.abs(onTableSeen.y - 0.36) < 0.05, `A y=${onTable.y.toFixed(2)} visto=${onTableSeen.y}`);

    // --- Pegar e arremessar em alguém -----------------------------------------
    await api(A).js('window.__room3d.teleport(-1.5, 3.7); return true;');
    await api(B).js('window.__room3d.teleport(1.3, 3.7); return true;');
    await sleep(1200);
    await api(A).js('window.__room3d.grab(); return true;');
    await sleep(800);
    const heldA = await api(A).js('return window.__room3d.me().holding');
    const heldSeen = await api(B).js(`return window.__room3d.objects()[${JSON.stringify('o0')}].holder`);
    check('pegar: A pega o objeto e B vê na mão de A', heldA === 'o0' && heldSeen === aId, `A=${heldA} visto=${heldSeen}`);
    await shot(B, '06_A_segurando');
    const bPos = await api(B).js('return window.__room3d.me()');
    const hitsBefore = await api(B).js('return window.__room3d.hitsTaken()');
    await api(A).js(`window.__room3d.throwAt(${bPos.x}, ${bPos.z}); return true;`);
    await sleep(350);
    await shot(B, '07_atingido');
    await sleep(2500);
    const hitsAfter = await api(B).js('return window.__room3d.hitsTaken()');
    check('arremesso: o objeto de A acerta B (golpe, atordoamento e empurrão)', hitsAfter > hitsBefore, `golpes em B: ${hitsBefore} → ${hitsAfter}`);
    await sleep(2500);
    const restA = await api(A).js(`return window.__room3d.objects().o0`);
    const restB = await api(B).js(`return window.__room3d.objects().o0`);
    check('arremesso: o objeto para no mesmo lugar para os dois',
      !restA.moving && !restB.moving && Math.hypot(restA.x - restB.x, restA.z - restB.z) < 0.3,
      `A=(${restA.x.toFixed(2)}, ${restA.z.toFixed(2)}) B=(${restB.x.toFixed(2)}, ${restB.z.toFixed(2)})`);
    const roomSounds = await api(B).js('return window.__appSoundLog || []');
    check('sons: B ouve pegar, arremessar e o golpe', ['room-pick', 'room-throw', 'room-hit'].every((x) => roomSounds.includes(x)), roomSounds.join(','));

    // --- Temas sincronizados --------------------------------------------------
    const themes = await api(A).js(`const m = await import('/src/renderer/services/room3d/themes.js'); return m.THEME_IDS;`);
    await api(B).js('window.__room3d.teleport(0, 4.8); window.__room3d.setCamYaw(Math.PI); return true;');
    let themesOk = true;
    for (const id of themes) {
      await api(A).js(`window.__room3d.setTheme(${JSON.stringify(id)}); return true;`);
      let seen = '';
      for (let i = 0; i < 20 && seen !== id; i++) {
        await sleep(200);
        seen = await api(B).js('return window.__room3d.theme()');
      }
      if (seen !== id) themesOk = false;
      await sleep(1500);
      await shot(B, `tema_${id}`);
      const gl = await api(B).js('return window.__room3d.gl()');
      if (gl.lost || gl.error || gl.calls < 20) themesOk = false;
      console.log('DIAG tema ' + id + ' ' + JSON.stringify(gl));
    }
    check(`temas: os ${themes.length} temas trocam para todos na sala`, themesOk && themes.length >= 6, themes.join(', '));
    await api(A).js(`window.__room3d.setTheme('terraco'); return true;`);
    await sleep(800);

    // --- Personalização ---------------------------------------------------------
    await api(B).js(`[...document.querySelectorAll('.room3d-chip')].find((b) => b.textContent.includes('Personalizar')).click(); return true;`);
    await api(B).waitFor(`document.querySelector('.cz-panel')`, 'painel de personalização');
    await api(B).js(`[...document.querySelectorAll('.cz-presets button')].find((b) => b.textContent === 'Pirata').click(); return true;`);
    let seenLook = null;
    for (let i = 0; i < 20 && seenLook?.hat !== 'pirata'; i++) {
      await sleep(200);
      seenLook = await api(A).js(`return window.__room3d.remoteLook('${bId}')`);
    }
    check('personalização: B escolhe o estilo Pirata e A vê a roupa nova', seenLook?.hat === 'pirata' && seenLook?.glasses === 'tapaolho', JSON.stringify(seenLook));
    await sleep(1200);
    await shot(B, '08_personalizar');
    await api(B).js(`[...document.querySelectorAll('.cz-tabs button')].find((b) => b.textContent === 'Roupas').click(); return true;`);
    await sleep(300);
    await shot(B, '08b_personalizar_roupas');
    await api(B).js(`document.querySelector('.cz-done').click(); return true;`);
    await sleep(500);
    await api(A).js('window.__room3d.teleport(1.2, 4.2); return true;');
    await api(B).js('window.__room3d.teleport(0, 6.3); window.__room3d.setCamYaw(Math.PI); return true;');
    await sleep(1500);
    await shot(B, '09_avatares_humanos');

    // --- Primeira pessoa --------------------------------------------------------
    await api(B).js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); return true;`);
    await sleep(800);
    const fp = await api(B).js('return { view: window.__room3d.view(), y: window.__room3d.cameraY() }');
    check('primeira pessoa: a câmera vai para a altura dos olhos', fp.view === 'first' && fp.y > 1.3 && fp.y < 1.9, JSON.stringify(fp));
    await api(B).js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' })); return true;`);
    await sleep(800);
    await shot(B, '10_primeira_pessoa');
    await api(B).js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); return true;`);
    await sleep(500);

    // --- TV com transmissão de tela ------------------------------------------
    await startShare(A, 'A');
    await api(B).waitFor(`window.__room3d.tvMode() === 'video'`, 'TV de B mostra a tela de A', 25000);
    check('TV: B assiste a tela de A na TV da sala', true);
    await api(A).waitFor(`window.__room3d.tvMode() === 'video' && window.__room3d.tvLocal()`, 'A vê a própria tela na TV', 15000);
    check('TV: quem transmite vê a própria tela na TV', true);
    await api(B).js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' })); return true;`);
    await sleep(1500);
    await shot(B, '04b_tv_primeira_pessoa');
    await api(B).js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })); return true;`);
    const sw0 = await api(B).js('return window.__room3d.tvSwitches()');
    await sleep(5000);
    const sw1 = await api(B).js('return window.__room3d.tvSwitches()');
    check('TV: a fonte da TV fica estável assistindo (não pisca)', sw1 === sw0, `trocas de fonte em 5 s: ${sw1 - sw0}`);
    // sair do 3D enquanto assiste: o vídeo clássico precisa continuar (não pode ficar preto)
    await api(B).js(`document.querySelector('.dock-btn[title="Voltar para a visualização clássica"]').click(); return true;`);
    await api(B).waitFor(`document.querySelector('.screen-video')`, 'vídeo clássico de B', 15000);
    await sleep(1500);
    const classic = await api(B).js(`
      const v = document.querySelector('.screen-video');
      const f1 = v.getVideoPlaybackQuality().totalVideoFrames;
      await new Promise((r) => setTimeout(r, 1500));
      return { hasSource: Boolean(v.srcObject), width: v.videoWidth, advancing: v.getVideoPlaybackQuality().totalVideoFrames > f1 };
    `);
    check('saindo do 3D: a transmissão continua no modo clássico (não fica preta)', classic.hasSource && classic.width > 0 && classic.advancing, JSON.stringify(classic));
    await api(B).js(`document.querySelector('.dock-btn[title="Entrar na sala 3D"]').click(); return true;`);
    await api(B).waitFor(`window.__room3d && window.__room3d.tvMode() === 'video'`, 'B de volta à sala com a TV', 30000);
    const shareSounds = await api(B).js('return window.__appSoundLog || []');
    check('sons: B ouve o som de "transmissão começou"', shareSounds.includes('screen-start'), shareSounds.join(','));
    await api(B).js('window.__room3d.teleport(0, -6.5); window.__room3d.setCamYaw(Math.PI); return true;');
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
    // o som de "parou" vem da presença no Firestore, que pode chegar uns segundos depois
    let stopSounds = [];
    for (let i = 0; i < 16 && !stopSounds.includes('screen-stop'); i++) {
      stopSounds = await api(B).js('return window.__appSoundLog || []');
      if (!stopSounds.includes('screen-stop')) await sleep(500);
    }
    check('sons: B ouve o som de "transmissão parou" (diferente do de começar)', stopSounds.includes('screen-stop'), stopSounds.join(','));

    // --- Mensagens maliciosas são ignoradas ----------------------------------
    const bad = await api(A).js(`
      const m = await import('/src/renderer/services/room3d/protocol.js');
      return [m.decode('{"v":1,"t":"s","x":1e9,"z":0,"y":0,"s":999}'), m.decode('{"v":1,"t":"r","e":"<img src=x onerror=alert(1)>"}')];
    `);
    check('segurança: posição absurda é limitada e reação fora da lista é descartada', bad[0].x === 16 && bad[0].seat === -1 && bad[1] === null, JSON.stringify(bad));

    // --- Voltar ao modo clássico ---------------------------------------------
    await api(B).js(`document.querySelector('.dock-btn[title="Voltar para a visualização clássica"]').click(); return true;`);
    await api(B).waitFor(`!window.__room3d && document.querySelector('.voice-tile')`, 'B volta ao clássico');
    await sleep(1000);
    heard = await audibleRemotes(B);
    check('clássico: ao sair da sala 3D, B continua ouvindo A', heard.audible >= 1, JSON.stringify(heard));
    const persisted = await api(B).js(`return localStorage.getItem('concord_room3d')`);
    check('preferência: a escolha do modo fica salva', persisted === 'false', persisted);
    const glA = await api(A).js('return window.__room3d.gl()');
    check('WebGL: a sala de A nunca perdeu o contexto (sem tela piscando azul)', glA.contextLosses === 0 && glA.renderErrors === 0, JSON.stringify(glA));

    // --- Sair da chamada --------------------------------------------------------
    await api(B).js(`document.querySelector('.dock-btn.leave').click(); return true;`);
    await sleep(4000);
    const leaveA = await api(A).js('return window.__appSoundLog || []');
    const leaveB = await api(B).js('return window.__appSoundLog || []');
    check('sons: A ouve "alguém saiu" e B ouve "saí da chamada"', leaveA.includes('voice-user-leave') && leaveB.includes('voice-leave-self'), `A=${leaveA.slice(-4)} B=${leaveB.slice(-4)}`);
  } catch (e) {
    check('execução do teste', false, e.message.slice(0, 600));
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`RESULT ${results.length - failed}/${results.length} passed`);
    setTimeout(() => app.exit(0), 300);
  }
});
