const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProjectAnalyzer } = require('../dist/services/ProjectAnalyzer');
const { StorageManager } = require('../dist/services/StorageManager');
const { StaticServer } = require('../dist/services/StaticServer');
const { ProjectModel } = require('../dist/models/ProjectModel');

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mycloud-static-test-'));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('mycloud-static-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test('plain HTML deploys without npm install or a build and serves its actual root', async t => {
  const root = fixture(t, { 'index.html': '<h1>Website</h1>', 'style.css': 'body{}', 'dist/placeholder.txt': '' });
  const result = await ProjectAnalyzer.analyze(root);
  assert.equal(result.projectType, 'STATIC_FRONTEND');
  assert.equal(result.startCommand, '__STATIC_SERVER__');
  assert.equal(result.buildCommand, null);
  assert.equal(result.projectRoot, root);
  assert.equal(StorageManager.getDistPath('test', root), root);
});

test('nested HTML site is detected despite archive metadata', async t => {
  const root = fixture(t, { 'website/index.html': '<h1>Website</h1>', '__MACOSX/index.html': 'metadata' });
  const result = await ProjectAnalyzer.analyze(root);
  assert.equal(result.projectRoot, path.join(root, 'website'));
  assert.equal(StorageManager.getDistPath('test', result.projectRoot), result.projectRoot);
});

test('Vite retains its build and cannot pass build validation using the source HTML', async t => {
  const root = fixture(t, { 'index.html': '<div id="root"></div>', 'package.json': JSON.stringify({ dependencies: { react: '18' }, scripts: { build: 'vite build' } }) });
  const result = await ProjectAnalyzer.analyze(root);
  assert.equal(result.buildCommand, 'npm run build');
  assert.equal(StorageManager.distExists('test', root), false);
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist/index.html'), 'built');
  assert.equal(StorageManager.distExists('test', root), true);
  assert.equal(StorageManager.getDistPath('test', root), path.join(root, 'dist'));
});

test('backend manifests take priority over nested HTML templates; unsupported archives still fail', async t => {
  const root = fixture(t, { 'templates/index.html': 'template', 'app/package.json': JSON.stringify({ dependencies: { express: '4' }, scripts: { start: 'node server.js' } }) });
  const result = await ProjectAnalyzer.analyze(root);
  assert.equal(result.projectType, 'BACKEND');
  const empty = fixture(t, { 'README.md': 'not deployable' });
  await assert.rejects(ProjectAnalyzer.analyze(empty), /Unable to detect/);
});

test('plain HTML server delivers HTML and assets without writing to the database', async t => {
  const root = fixture(t, { 'index.html': '<h1>Website</h1>', 'style.css': 'body{color:red}', 'main.js': 'console.log("website")', 'nosotros.html': '<h1>Nosotros</h1>' });
  t.mock.method(ProjectModel, 'update', async () => {});
  const net = require('node:net');
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const id = 'isolated-static-server-test';
  try {
    await StaticServer.start({ projectId: id, distPath: StorageManager.getDistPath(id, root), port });
    for (const [route, expected] of [['/', '<h1>Website</h1>'], ['/style.css', 'body{color:red}'], ['/main.js', 'console.log("website")'], ['/nosotros.html', '<h1>Nosotros</h1>']]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), expected);
    }
  } finally { StaticServer.stop(id); }
});
