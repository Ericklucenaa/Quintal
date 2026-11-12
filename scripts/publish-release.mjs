// Publishes a built desktop release:
//   1. uploads the installers to a GitHub release (gh CLI) in the Quintal repo and in the
//      Concord mirror (apps up to 1.2.x only download from github.com/Ericklucenaa/Concord),
//   2. writes the update manifest (with the installer's SHA-256) to Firestore
//      using admin credentials — clients can only read it,
//   3. writes version.json for the hosted web app.
//
// Usage (after `npm run dist:win` in desktop/):
//   node scripts/publish-release.mjs "Notas da versão" [--mandatory]
//   node scripts/publish-release.mjs "Notas da versão" --mandatory --manifest-only
//     (só grava o manifesto, depois de `gcloud auth login`, se o passo 2 falhou)
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { setDocument } from './firestore-admin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(root, 'desktop');
const { version } = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const notes = process.argv.slice(2).find((a) => !a.startsWith('--')) || `Quintal v${version}`;
const mandatory = process.argv.includes('--mandatory');
const manifestOnly = process.argv.includes('--manifest-only');
const repo = 'Ericklucenaa/Quintal';
// Espelho com o nome antigo: o atualizador das versões até 1.2.x só aceita este caminho.
const legacyRepo = 'Ericklucenaa/Concord';
const tag = `v${version}`;

const setupName = `Quintal-Setup-${version}.exe`;
const portableName = `Quintal-Portable-${version}.exe`;
const setupPath = path.join(desktop, 'dist-electron', setupName);
const portablePath = path.join(desktop, 'dist-electron', portableName);
if (!existsSync(setupPath)) {
  console.error(`Installer not found: ${setupPath}. Run "npm run dist:win" in desktop/ first.`);
  process.exit(1);
}

const sha256 = createHash('sha256').update(readFileSync(setupPath)).digest('hex');
console.log(`${setupName} sha256=${sha256}`);

const gh = (...args) => execFileSync('gh', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const assets = [setupPath, ...(existsSync(portablePath) ? [portablePath] : [])];

function publishTo(targetRepo, extraNote = '') {
  let releaseExists = true;
  try {
    gh('release', 'view', tag, '--repo', targetRepo);
  } catch {
    releaseExists = false;
  }
  const body = [notes, extraNote, `SHA-256 (${setupName}): \`${sha256}\``].filter(Boolean).join('\n\n');
  if (releaseExists) {
    gh('release', 'upload', tag, ...assets, '--clobber', '--repo', targetRepo);
  } else {
    gh('release', 'create', tag, ...assets, '--repo', targetRepo, '--title', `Quintal ${tag}`, '--notes', body);
  }
  console.log(`GitHub release ${tag} published in ${targetRepo}.`);
}

if (!manifestOnly) {
  publishTo(repo);
  publishTo(legacyRepo, 'Espelho para atualizar instalações antigas do Concord. O projeto agora está em https://github.com/Ericklucenaa/Quintal');
}

const manifest = {
  version,
  name: `Quintal ${tag}`,
  releaseDate: new Date().toISOString().slice(0, 10),
  // Pelo espelho: funciona nas versões antigas (que só aceitam Concord) e nas novas (aceitam os dois).
  downloadUrl: `https://github.com/${legacyRepo}/releases/download/${tag}/${setupName}`,
  sha256,
  webUrl: 'https://concord-3af70.web.app',
  releaseNotes: notes,
  isMandatory: mandatory
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(path.join(desktop, 'public', 'version.json'), json);
if (existsSync(path.join(desktop, 'dist'))) writeFileSync(path.join(desktop, 'dist', 'version.json'), json);
console.log('version.json updated. Deploy hosting to publish it on the web.');

try {
  await setDocument('concord_app_version/latest', manifest);
  console.log('Update manifest written to Firestore (concord_app_version/latest).');
} catch (err) {
  console.error(`\nNão foi possível gravar o manifesto no Firestore: ${err.message}`);
  console.error('Faça login com "gcloud auth login" e rode de novo com --manifest-only.');
  process.exit(2);
}
