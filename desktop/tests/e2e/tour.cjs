// Tour de capturas para revisão visual (não é teste de regra): login, cadastro,
// chat com mensagens, chamada clássica, configurações, aparência e tema claro.
// Uso: SHOT_DIR=<pasta> E2E_SPEC=tour.cjs npm run test:e2e   (pelos emuladores)
const fs = require('fs');
const { app, BrowserWindow, path, PRELOAD, sleep, results, speechMic, check, api, register } = require('./helpers.cjs');

const SHOT_DIR = process.env.SHOT_DIR || null;
const shot = async (win, name) => {
  if (!SHOT_DIR) return;
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), img.toPNG());
};

app.whenReady().then(async () => {
  await sleep(300);
  const existing = BrowserWindow.getAllWindows();
  const A = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { offscreen: true, preload: PRELOAD, contextIsolation: true, sandbox: false, partition: 'persist:tour', backgroundThrottling: false }
  });
  A.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
  existing.forEach((w) => w.destroy());
  setTimeout(() => { console.log('RESULT timeout'); app.exit(1); }, 240000);
  try {
    await A.webContents.session.clearStorageData();
    await A.loadURL('http://localhost:5173');
    await A.webContents.executeJavaScript(speechMic(0));
    const { js, waitFor } = api(A);
    await waitFor(`__e2e.hasText('Cadastre-se')`, 'login');
    await sleep(800);
    await shot(A, 't01_login');
    await js(`__e2e.clickText('Cadastre-se')`);
    await sleep(600);
    await shot(A, 't02_cadastro');
    await A.loadURL('http://localhost:5173');
    const tag = Date.now().toString(36).slice(-4);
    await register(A, `lia${tag}`);
    await sleep(1200);
    // algumas mensagens para ver o chat
    for (const text of ['oi gente! chegaram?', 'bora ver o filme às 21h no canal de voz', 'trouxe pipoca 🍿']) {
      await js(`
        const box = document.querySelector('.chat-textarea');
        __e2e.setValue(box, ${JSON.stringify(text)});
        box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return true;
      `);
      await sleep(500);
    }
    await sleep(800);
    await shot(A, 't03_chat');
    // chamada clássica
    await js(`[...document.querySelectorAll('.channel-item')].find((e) => /voz/i.test(e.textContent)).click(); return true;`);
    await waitFor(`document.querySelector('.voice-dock')`, 'chamada');
    await sleep(2500);
    await shot(A, 't04_chamada');
    // configurações e aparência
    await js(`document.querySelector('.icon-btn[title="Configurações"]').click(); return true;`);
    await sleep(800);
    await shot(A, 't05_configuracoes');
    await js(`__e2e.clickText('Aparência'); return true;`);
    await sleep(800);
    await shot(A, 't06_aparencia');
    // tema claro
    await js(`const m = await import('/src/renderer/services/appearance.js'); m.saveAppearance ? m.saveAppearance({ theme: 'light' }) : null; document.documentElement.setAttribute('data-theme', 'light'); return true;`);
    await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true;`);
    await sleep(800);
    await shot(A, 't07_tema_claro');
    check('tour de capturas concluído', true);
  } catch (e) {
    check('execução do tour', false, e.message.slice(0, 500));
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`RESULT ${results.length - failed}/${results.length} passed`);
    setTimeout(() => app.exit(0), 300);
  }
});
