// Bar do Quintal de ponta a ponta, em duas janelas Electron reais (A e B) com os
// emuladores do Firebase: bots e comandos no chat, Guarda, abas de Bots e Permissões,
// sala 3D maior, mesas de jogo sincronizadas (xadrez, damas, sinuca, ping-pong),
// ações coletivas (dança, brinde, foto) e a Vitrola.
// Uso: SHOT_DIR=<pasta> E2E_SPEC=bar.cjs npm run test:e2e
const fs = require('fs');
const {
  app, BrowserWindow, path, PRELOAD, FS, sleep, results, speechMic, check, enc, api, register, joinChannel
} = require('./helpers.cjs');

const SHOT_DIR = process.env.SHOT_DIR || null;
const shot = async (win, name) => {
  if (!SHOT_DIR) return;
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), img.toPNG());
};

app.whenReady().then(async () => {
  await sleep(300);
  const existing = BrowserWindow.getAllWindows();
  const mk = (part) => {
    const w = new BrowserWindow({
      width: 1440, height: 900, show: false,
      webPreferences: { offscreen: true, preload: PRELOAD, contextIsolation: true, sandbox: false, partition: part, backgroundThrottling: false }
    });
    if (process.env.E2E_CONSOLE) {
      w.webContents.on('console-message', (_e, level, message) => {
        if (level >= 2) console.log(`CONSOLE ${part} ${level} ${message.slice(0, 300)}`);
      });
    }
    w.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
    return w;
  };
  const A = mk('persist:bar-a');
  const B = mk('persist:bar-b');
  existing.forEach((w) => w.destroy());
  setTimeout(() => { console.log('RESULT timeout'); app.exit(1); }, 480000);
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

    // B entra no servidor de A; bots ligados direto no documento (como um admin faria)
    const servers = await (await fetch(`${FS}/concord_servers`, { headers: { Authorization: 'Bearer owner' } })).json();
    const sDoc = servers.documents.find((d) => d.fields.ownerId?.stringValue === aId);
    const serverId = sDoc.name.split('/').pop();
    const members = sDoc.fields.memberIds.arrayValue.values.map((v) => v.stringValue);
    const bot = { addedBy: aId, addedByName: names.A, addedAt: 1, config: {} };
    const patched = await fetch(`${FS}/concord_servers/${serverId}?updateMask.fieldPaths=memberIds&updateMask.fieldPaths=roles.${encodeURIComponent('`' + bId + '`')}&updateMask.fieldPaths=bots`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          memberIds: enc([...members, bId]),
          roles: enc({ [bId]: 'member' }),
          bots: enc({ vitrola: bot, sorte: bot, porteiro: { ...bot, config: { message: 'Chegou {usuario}!' } }, guarda: { ...bot, config: { words: ['proibida'], pattern: '(?s).*(^|[^\\pL\\pN])(proibida)($|[^\\pL\\pN]).*', blockLinks: false, maxMentions: 8 } } })
        }
      })
    });
    check('preparação: bots ligados no servidor', patched.ok, patched.ok ? '' : (await patched.text()).slice(0, 300));
    const voiceName = sDoc.fields.channels.arrayValue.values.map((v) => v.mapValue.fields).find((c) => c.type.stringValue === 'voice').name.stringValue;
    await sleep(2500);

    // --- Chat: comandos e Guarda (B é membro comum) ----------------------------
    const { js: jsB, waitFor: waitB } = api(B);
    await jsB(`[...document.querySelectorAll('.server-sidebar .server-icon-wrapper')].find((x) => (x.title || '').includes('${names.A}'))?.querySelector('.server-btn')?.click(); return true;`);
    await waitB(`document.querySelector('.chat-textarea')`, 'chat de B no servidor de A');
    await sleep(1200);
    await jsB(`const box = document.querySelector('.chat-textarea'); __e2e.setValue(box, '/'); box.focus(); return true;`);
    await waitB(`document.querySelector('.command-popup')`, 'sugestões de comandos');
    const cmds = await jsB(`return [...document.querySelectorAll('.command-option .command-name')].map((e) => e.textContent).join(' ')`);
    check('chat: membro vê /dado e /tocar, e não vê /pular (só moderador)', cmds.includes('/dado') && cmds.includes('/tocar') && !cmds.includes('/pular'), cmds);
    await shot(B, 'b01_comandos');
    const send = async (w, text) => api(w).js(`
      const box = document.querySelector('.chat-textarea');
      __e2e.setValue(box, ${JSON.stringify(text)});
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    `);
    await send(B, '/dado 2d6');
    await waitB(`[...document.querySelectorAll('.message-item')].some((m) => m.querySelector('.bot-tag') && /rolou/.test(m.textContent))`, 'resposta do Sorte');
    check('chat: /dado responde como bot (Sorte, via quem pediu)', await jsB(`return [...document.querySelectorAll('.message-bot-via')].some((e) => e.textContent.includes('${names.B}'))`));
    await send(B, 'isso é uma palavra proibida aqui');
    await sleep(1200);
    const blocked = await jsB(`return !document.body.innerText.includes('isso é uma palavra proibida aqui') || document.body.innerText.includes('O Guarda barrou')`);
    check('chat: o Guarda barra a palavra proibida', blocked);
    await jsB(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'OK')?.click(); return true;`);
    await sleep(600);
    await shot(B, 'b02_chat_bots');

    // --- Configurações: Bots e Permissões (A é dono) ----------------------------
    const { js: jsA, waitFor: waitA } = api(A);
    await jsA(`document.querySelector('.server-header').click(); return true;`);
    await jsA(`__e2e.clickText('Bots'); return true;`);
    await waitA(`document.querySelector('.bots-panel')`, 'aba Bots');
    await sleep(500);
    check('config: a aba Bots lista os 4 bots', await jsA(`return document.querySelectorAll('.bot-row').length === 4`));
    await shot(A, 'b03_aba_bots');
    await jsA(`[...document.querySelectorAll('.tab-btn')].find((b) => b.textContent.includes('Permissões')).click(); return true;`);
    await waitA(`document.querySelector('.perms-table')`, 'aba Permissões');
    await sleep(400);
    await shot(A, 'b04_permissoes');
    await jsA(`document.querySelector('.modal-backdrop').click(); return true;`);

    // --- Chamada e sala 3D ------------------------------------------------------
    await joinChannel(A, 'A', names.A, voiceName);
    await joinChannel(B, 'B', names.A, voiceName);
    await sleep(5000);
    for (const [n, w] of [['A', A], ['B', B]]) {
      await api(w).waitFor(`document.querySelector('.dock-btn[title="Entrar na sala 3D"]')`, `botão sala 3D ${n}`);
      await api(w).js(`document.querySelector('.dock-btn[title="Entrar na sala 3D"]').click(); return true;`);
      await api(w).waitFor(`window.__room3d && document.querySelector('.room3d-canvas')`, `sala 3D ${n}`, 40000);
    }
    await waitA(`window.__room3d.remote()['${bId}']`, 'A vê B', 20000);
    await waitB(`window.__room3d.remote()['${aId}']`, 'B vê A', 20000);
    await jsA(`document.querySelector('.room3d-help-close')?.click(); return true;`);
    await jsB(`document.querySelector('.room3d-help-close')?.click(); return true;`);
    const gl = await jsA('return window.__room3d.gl()');
    check('sala: o bar renderiza sem erro', !gl.error && gl.triangles > 0, JSON.stringify({ calls: gl.calls, tri: gl.triangles }));

    // visão geral do bar
    await jsA('window.__room3d.teleport(0, 5.6); window.__room3d.setCamYaw(Math.PI); return true;');
    await jsB('window.__room3d.teleport(1.5, 4.2); return true;');
    await sleep(1500);
    await shot(A, 'b05_bar_visao');
    await jsA('window.__room3d.teleport(10.5, -1); window.__room3d.setCamYaw(Math.PI / 2); return true;');
    await sleep(1200);
    await shot(A, 'b06_balcao');
    await jsA('window.__room3d.teleport(-8.5, -2); window.__room3d.setCamYaw(-Math.PI / 2); window.__room3d.setCamOrbit(0.9, 11); return true;');
    await sleep(1500);
    await shot(A, 'b07_area_jogos');
    await jsA('window.__room3d.teleport(0, 2); window.__room3d.setCamYaw(Math.PI); window.__room3d.setCamOrbit(1.15, 13); return true;');
    await sleep(1500);
    await shot(A, 'b07b_bar_do_alto');
    await jsA('window.__room3d.setCamOrbit(0.42, 6.2); return true;');

    // --- Xadrez ---------------------------------------------------------------
    await jsA(`window.__room3d.sitAtTable('xadrez-1', 0); window.__room3d.openTable('xadrez-1'); return true;`);
    await sleep(500);
    await jsB(`window.__room3d.sitAtTable('xadrez-1', 1); window.__room3d.openTable('xadrez-1'); return true;`);
    await waitA(`window.__room3d.table('xadrez-1').status === 'playing'`, 'xadrez começou', 10000);
    check('xadrez: começa quando os dois sentam', true);
    await jsA(`return window.__room3d.chessMove('xadrez-1', 'e2', 'e4')`);
    await waitB(`window.__room3d.table('xadrez-1').data.fen.includes('4P3')`, 'B vê e4', 8000);
    const badMove = await jsA(`return window.__room3d.chessMove('xadrez-1', 'd2', 'd4')`);
    check('xadrez: lance fora da vez é recusado', badMove === false);
    await jsB(`return window.__room3d.chessMove('xadrez-1', 'e7', 'e5')`);
    await waitA(`window.__room3d.table('xadrez-1').data.san === 'e5'`, 'A vê e5', 8000);
    check('xadrez: lances chegam nos dois lados', true);
    await sleep(600);
    await shot(A, 'b08_xadrez_painel');
    await jsA(`window.__room3d.openTable(null); return true;`);
    await sleep(800);
    await shot(A, 'b09_xadrez_3d');
    await jsA(`window.__room3d.leaveTable('xadrez-1'); return true;`);
    await jsB(`window.__room3d.leaveTable('xadrez-1'); window.__room3d.openTable(null); return true;`);

    // --- Damas ----------------------------------------------------------------
    await jsA(`window.__room3d.sitAtTable('damas-1', 0); window.__room3d.openTable('damas-1'); return true;`);
    await jsB(`window.__room3d.sitAtTable('damas-1', 1); return true;`);
    await waitA(`window.__room3d.table('damas-1').status === 'playing'`, 'damas começou', 10000);
    const moved = await jsA(`return window.__room3d.checkersMove('damas-1', [[5, 0], [4, 1]])`);
    await waitB(`window.__room3d.table('damas-1').data.turn === 1`, 'B vê a jogada de damas', 8000);
    check('damas: jogada válida chega no outro lado', moved === true);
    await sleep(500);
    await shot(A, 'b10_damas');
    await jsA(`window.__room3d.leaveTable('damas-1'); window.__room3d.openTable(null); return true;`);
    await jsB(`window.__room3d.leaveTable('damas-1'); return true;`);

    // --- Sinuca ---------------------------------------------------------------
    await jsA(`window.__room3d.sitAtTable('sinuca', 0); window.__room3d.openTable('sinuca'); return true;`);
    await jsB(`window.__room3d.sitAtTable('sinuca', 1); window.__room3d.openTable('sinuca'); return true;`);
    await waitA(`window.__room3d.table('sinuca').status === 'playing'`, 'sinuca começou', 10000);
    await jsA(`return window.__room3d.poolShot('sinuca', 0.01, 3.9)`);
    await sleep(900);
    await shot(B, 'b11_sinuca_rolando');
    await sleep(4500);
    const poolA = await jsA(`return JSON.stringify(window.__room3d.table('sinuca').data.balls)`);
    const poolB = await jsB(`return JSON.stringify(window.__room3d.table('sinuca').data.balls)`);
    check('sinuca: a tacada termina igual nos dois lados', poolA === poolB);
    await shot(A, 'b12_sinuca_painel');
    await jsA(`window.__room3d.leaveTable('sinuca'); window.__room3d.openTable(null); return true;`);
    await jsB(`window.__room3d.leaveTable('sinuca'); window.__room3d.openTable(null); return true;`);

    // --- Ping-pong (tempo real) ---------------------------------------------------
    await jsA(`window.__room3d.sitAtTable('pingpong', 0); window.__room3d.openTable('pingpong'); return true;`);
    await jsB(`window.__room3d.sitAtTable('pingpong', 1); window.__room3d.openTable('pingpong'); return true;`);
    await waitA(`window.__room3d.table('pingpong').status === 'playing'`, 'ping-pong começou', 10000);
    await sleep(2500);
    await shot(B, 'b13_pingpong');
    await sleep(6000);
    const ppScore = await jsB(`return window.__room3d.table('pingpong').data.score.join('x')`);
    if (ppScore === '0x0') {
      console.log('FAIL  diagnóstico A ' + JSON.stringify(await jsA(`return { t: window.__room3d.table('pingpong'), me: window.__room3d.me(), frame: window.__room3d.gameFrame('pingpong'), seat: window.__room3d.hubSeat() }`)));
      console.log('FAIL  diagnóstico B ' + JSON.stringify(await jsB(`return { t: window.__room3d.table('pingpong'), me: window.__room3d.me() }`)));
    }
    check('ping-pong: o placar anda e chega no outro lado', ppScore !== '0x0', ppScore);
    await jsA(`window.__room3d.leaveTable('pingpong'); window.__room3d.openTable(null); return true;`);
    await jsB(`window.__room3d.leaveTable('pingpong'); window.__room3d.openTable(null); return true;`);

    // --- Ações coletivas ----------------------------------------------------------
    await jsA('window.__room3d.teleport(-1, -1); window.__room3d.setCamYaw(0); return true;');
    await jsB('window.__room3d.teleport(1, -1); window.__room3d.setCamYaw(Math.PI); return true;');
    await sleep(800);
    await jsA(`window.__room3d.startCollective('dance2'); return true;`);
    await waitB(`document.querySelector('.room3d-collective')`, 'convite da dança chega em B', 8000);
    await shot(B, 'b14_convite_danca');
    await jsB(`window.__room3d.joinCollective(); return true;`);
    await waitA(`window.__room3d.collective()?.members.length === 2`, 'A vê B na dança', 8000);
    check('coletivo: B entra na dança puxada por A', true);
    await sleep(2500);
    await shot(B, 'b15_danca_coletiva');
    await sleep(9000);
    await jsA(`window.__room3d.startCollective('photo'); return true;`);
    await waitB(`window.__room3d.collective()?.kind === 'photo'`, 'convite da foto', 8000);
    await jsB(`window.__room3d.joinCollective(); return true;`);
    await waitA(`document.querySelector('.room3d-photo img')`, 'foto em A', 12000);
    await waitB(`document.querySelector('.room3d-photo img')`, 'foto em B', 12000);
    check('coletivo: foto em grupo sai para os dois', true);
    await sleep(400);
    await shot(A, 'b16_foto');
    await jsA(`document.querySelector('.room3d-photo .room3d-chip:last-child')?.click(); return true;`);
    await jsB(`document.querySelector('.room3d-photo .room3d-chip:last-child')?.click(); return true;`);

    // --- Personalização -----------------------------------------------------------
    await jsA(`__e2e.clickText('Personalizar'); return true;`);
    await waitA(`document.querySelector('.cz-panel')`, 'painel de personalização');
    await jsA(`[...document.querySelectorAll('.cz-tabs button')].find((b) => b.textContent === 'Corpo').click(); return true;`);
    await jsA(`[...document.querySelectorAll('.cz-chips button')].find((b) => b.textContent === 'Feminino').click(); return true;`);
    await jsA(`[...document.querySelectorAll('.cz-tabs button')].find((b) => b.textContent === 'Estilos').click(); return true;`);
    await jsA(`[...document.querySelectorAll('.cz-presets button')].find((b) => b.textContent === 'Balada').click(); return true;`);
    await jsA(`[...document.querySelectorAll('.cz-tabs button')].find((b) => b.textContent === 'Cabeça').click(); return true;`);
    await sleep(1200);
    const lookB = await jsB(`return window.__room3d.remoteLook('${aId}')`);
    check('avatar: corpo e estilo novos chegam no outro lado', lookB?.body === 'feminino' && lookB?.top === 'cropped', JSON.stringify(lookB));
    await shot(A, 'b17_personalizar');
    await jsA(`document.querySelector('.cz-done').click(); return true;`);

    // --- Vitrola ------------------------------------------------------------------
    await jsA('window.__room3d.teleport(12.6, -8.6); window.__room3d.setCamYaw(Math.PI); return true;');
    await sleep(600);
    await jsA('window.__room3d.interact(); return true;');
    await waitA(`document.querySelector('.music-dock:not(.is-hidden)')`, 'Vitrola aberta', 8000);
    await jsA(`
      const input = document.querySelector('.music-add input');
      __e2e.setValue(input, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
      input.form.requestSubmit();
      return true;
    `);
    await waitA(`document.querySelector('.music-now')`, 'faixa tocando na Vitrola', 20000);
    await waitB(`[...document.querySelectorAll('.room3d-chip')].some((c) => c.classList.contains('on') && c.textContent.includes('Vitrola'))`, 'B vê a Vitrola tocando', 15000);
    check('vitrola: a faixa entra na fila e começa a tocar para todos', true);
    await sleep(6000);
    const dbg = await jsA(`const f = document.querySelector('.music-player iframe'); let slot = null; try { slot = f.contentDocument?.querySelector('.slot.on')?.id; } catch (e) { slot = 'cross-origin'; } return JSON.stringify({ d: window.__musicDebug, slot, src: f?.src })`);
    const parsed = JSON.parse(dbg);
    check('vitrola: o player oficial toca a faixa (posição e duração reais)', parsed.slot === 'yt' && parsed.d.bridge?.ref === parsed.d.current?.ref && parsed.d.bridge?.durationMs > 0, dbg.slice(0, 500));
    await sleep(5000);
    await shot(A, 'b18_vitrola');
    await shot(B, 'b19_vitrola_b');
  } catch (e) {
    check('execução', false, e.message.slice(0, 600));
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`RESULT ${results.length - failed}/${results.length} passed`);
    setTimeout(() => app.exit(failed ? 1 : 0), 300);
  }
});
