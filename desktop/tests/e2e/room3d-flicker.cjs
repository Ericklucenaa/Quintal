// Diagnóstico de "tela piscando azul" na sala 3D enquanto alguém transmite.
// A e B entram na sala 3D, A transmite a tela, e durante alguns segundos:
//  - registra contadores da sala (remontagens, redimensionamentos, erros de desenho, perda de contexto);
//  - tira capturas seguidas e mede quanto da área da sala está na cor de fundo (#1b1d48),
//    o que indica um quadro em que a cena não foi desenhada.
// Uso: E2E_SPEC=room3d-flicker.cjs npm run test:e2e   (pelos emuladores)
const {
  app, BrowserWindow, desktopCapturer, PRELOAD, FS, sleep, results, speechMic, check, enc,
  api, register, joinChannel, startShare
} = require('./helpers.cjs');

const BG = [0x1b, 0x1d, 0x48];

/** Fração dos pixels da área da sala (lado direito da janela) na cor de fundo. */
async function blueFraction(win) {
  const img = await win.webContents.capturePage();
  const { width, height } = img.getSize();
  const bmp = img.toBitmap(); // BGRA
  let total = 0;
  let blue = 0;
  for (let y = Math.floor(height * 0.3); y < Math.floor(height * 0.7); y += 4) {
    for (let x = Math.floor(width * 0.35); x < Math.floor(width * 0.95); x += 4) {
      const i = (y * width + x) * 4;
      const b = bmp[i];
      const g = bmp[i + 1];
      const r = bmp[i + 2];
      total += 1;
      if (Math.abs(r - BG[0]) < 6 && Math.abs(g - BG[1]) < 6 && Math.abs(b - BG[2]) < 6) blue += 1;
    }
  }
  return blue / total;
}

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
  const A = mk('persist:flicker-a');
  const B = mk('persist:flicker-b');
  existing.forEach((w) => w.destroy());
  setTimeout(() => { console.log('RESULT timeout'); app.exit(1); }, 300000);
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
    await sleep(5000);
    for (const w of [A, B]) {
      await api(w).waitFor(`document.querySelector('.dock-btn[title="Entrar na sala 3D"]')`, 'botão sala 3D');
      await api(w).js(`document.querySelector('.dock-btn[title="Entrar na sala 3D"]').click(); return true;`);
      await api(w).waitFor(`window.__room3d && document.querySelector('.room3d-canvas')`, 'sala 3D', 40000);
    }
    await sleep(3000);

    const measure = async (label) => {
      const g0 = await api(A).js('return window.__room3d.gl()');
      const fractions = [];
      for (let i = 0; i < 16; i++) {
        fractions.push(await blueFraction(A));
        await sleep(250);
      }
      const g1 = await api(A).js('return window.__room3d.gl()');
      const blank = fractions.filter((f) => f > 0.6).length;
      console.log(`DIAG ${label} ${JSON.stringify({ g0, g1, fractions: fractions.map((f) => f.toFixed(2)).join(' ') })}`);
      return { g0, g1, blank };
    };

    const before = await measure('antes');
    check('sem transmissão: nenhum quadro vazio', before.blank === 0, `vazios: ${before.blank}/16`);

    await startShare(A, 'A');
    await sleep(3000);
    const during = await measure('transmitindo');
    check('transmitindo: nenhum quadro vazio (azul)', during.blank === 0, `vazios: ${during.blank}/16`);
    check('transmitindo: a sala não é remontada', during.g1.mounts === during.g0.mounts, `${during.g0.mounts} → ${during.g1.mounts}`);
    check('transmitindo: o canvas não é redimensionado em loop', during.g1.resizes - during.g0.resizes <= 1, `${during.g0.resizes} → ${during.g1.resizes}`);
    check('transmitindo: sem erros de desenho nem perda de contexto', during.g1.renderErrors === 0 && during.g1.contextLosses === 0, JSON.stringify(during.g1));
  } catch (e) {
    check('execução do teste', false, e.message.slice(0, 600));
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`RESULT ${results.length - failed}/${results.length} passed`);
    setTimeout(() => app.exit(0), 300);
  }
});
