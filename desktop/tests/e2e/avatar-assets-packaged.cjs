// Regressão: os modelos dos avatares precisam carregar no app EMPACOTADO (dist/index.html aberto por file://, com a CSP
// de produção). Os outros testes e2e rodam no Vite (http), onde esse caminho não é exercitado.
// Uso: npx vite build && npx electron tests/e2e/avatar-assets-packaged.cjs   (imprime RESULT n/m)
const { app, BrowserWindow } = require('electron');
const path = require('path');

const desktop = path.resolve(__dirname, '../..');
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(desktop, 'src/preload/index.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'avatar-assets-test', backgroundThrottling: false
    }
  });
  // AVATAR_INDEX aponta para outro index.html, ex.: o de dentro do app.asar do Quintal instalado.
  await win.loadFile(process.env.AVATAR_INDEX || path.join(desktop, 'dist/index.html'));
  const report = await win.webContents.executeJavaScript(`(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + e.blockedURI));
    const xhr = (f) => new Promise((res) => {
      const x = new XMLHttpRequest();
      x.open('GET', new URL('avatars/' + f, document.baseURI).toString());
      x.responseType = 'arraybuffer';
      x.onload = () => res({ f, status: x.status, bytes: x.response ? x.response.byteLength : 0 });
      x.onerror = () => res({ f, status: 'erro', bytes: 0 });
      try { x.send(); } catch (e) { res({ f, status: 'throw ' + e.message, bytes: 0 }); }
    });
    const files = await Promise.all(['avatar_m.glb', 'avatar_f.glb', 'animations.glb'].map(xhr));
    // O GLTFLoader decodifica as texturas embutidas criando URLs blob: e baixando-as com fetch. Na 1.4.0 a CSP
    // (connect-src sem blob:) bloqueava isso e o corpo dos avatares não aparecia.
    const blobUrl = URL.createObjectURL(new Blob([new Uint8Array(4096)], { type: 'image/png' }));
    const blob = await fetch(blobUrl).then((r) => r.arrayBuffer()).then((b) => ({ f: 'textura via blob:', status: 200, bytes: b.byteLength * 100 }))
      .catch((e) => ({ f: 'textura via blob:', status: 'bloqueada: ' + e.message, bytes: 0 }));
    files.push(blob);
    await new Promise((r) => setTimeout(r, 200));
    return { protocol: location.protocol, files, violations };
  })()`);
  let pass = 0;
  for (const f of report.files) {
    const ok = f.bytes > 100000;
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${f.f} status=${f.status} bytes=${f.bytes}`);
  }
  if (report.violations.length) console.log('CSP ' + report.violations.join(' | '));
  console.log(`protocol=${report.protocol}`);
  console.log(`RESULT ${pass}/${report.files.length}`);
  app.exit(pass === report.files.length ? 0 : 1);
});
