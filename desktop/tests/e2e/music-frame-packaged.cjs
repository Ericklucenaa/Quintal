// Regressão: o player da Vitrola (iframe de music-player.html no Hosting) precisa carregar no app EMPACOTADO,
// com a CSP de produção. Na 1.4.x o frame-src não tinha o domínio do Hosting e o player ficava em branco.
// Uso: npx vite build && npx electron tests/e2e/music-frame-packaged.cjs   (AVATAR_INDEX=... para outro index.html)
const { app, BrowserWindow } = require('electron');
const path = require('path');

const desktop = path.resolve(__dirname, '../..');
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(desktop, 'src/preload/index.cjs'), contextIsolation: true, sandbox: true, partition: 'music-frame-test' }
  });
  await win.loadFile(process.env.AVATAR_INDEX || path.join(desktop, 'dist/index.html'));
  const report = await win.webContents.executeJavaScript(`(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + e.blockedURI));
    const ORIGIN = 'https://concord-3af70.web.app';
    const f = document.createElement('iframe');
    f.src = ORIGIN + '/music-player.html';
    f.allow = 'autoplay; encrypted-media';
    document.body.appendChild(f);
    // Mesmo protocolo do MusicContext: espera 'ready', manda a faixa e acompanha os estados.
    let ready = false, best = { positionMs: 0, playing: false, error: null };
    window.addEventListener('message', (e) => {
      if (e.origin !== ORIGIN || !e.data || e.data.source !== 'quintal-music') return;
      if (e.data.type === 'ready') ready = true;
      if (e.data.type === 'state') best = { positionMs: Math.max(best.positionMs, e.data.positionMs || 0), playing: best.playing || e.data.playing, error: best.error };
      if (e.data.type === 'error') best = { ...best, error: e.data.code };
    });
    for (let i = 0; i < 40 && !ready; i++) await new Promise((r) => setTimeout(r, 250));
    if (ready) f.contentWindow.postMessage({ source: 'quintal-app', type: 'target', kind: 'youtube', ref: 'jNQXAC9IVRw', positionMs: 0, paused: false }, ORIGIN);
    for (let i = 0; i < 60 && !(best.playing && best.positionMs > 1500) && !best.error; i++) await new Promise((r) => setTimeout(r, 250));
    return { violations, ready, best };
  })()`);
  const plays = report.ready && report.best.playing && report.best.positionMs > 1500;
  console.log(`${plays ? 'PASS' : 'FAIL'} faixa do YouTube tocou  ready=${report.ready} ${JSON.stringify(report.best)}`);
  // O iframe carregou de verdade se o processo dele navegou para o Hosting (frames do webContents).
  const frames = win.webContents.mainFrame.framesInSubtree.map((fr) => fr.url).filter((u) => /music-player/.test(u));
  const ok = report.violations.length === 0 && frames.length > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} player da Vitrola carregou no iframe  frames=${JSON.stringify(frames)}`);
  if (report.violations.length) console.log('CSP ' + report.violations.join(' | '));
  console.log(`RESULT ${(ok ? 1 : 0) + (plays ? 1 : 0)}/2`);
  app.exit(ok && plays ? 0 : 1);
});
