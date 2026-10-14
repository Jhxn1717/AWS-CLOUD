const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NodeRuntimeManager } = require('../dist/services/NodeRuntimeManager');
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mycloud-runtime-test-'));
  for (const [file, contents] of Object.entries(files)) fs.writeFileSync(path.join(root, file), contents);
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('mycloud-runtime-test-'));
    fs.rmSync(root, {recursive:true,force:true});
  });
  return root;
}
test('Node requirement includes pinned version, manifest engines and direct build dependency engines', t => {
  const root = fixture(t, {'.nvmrc':'22', '.node-version':'20', 'package.json':JSON.stringify({engines:{node:'>=20'},devDependencies:{vite:'8'}}), 'package-lock.json':JSON.stringify({packages:{'node_modules/vite':{engines:{node:'^20.19.0 || >=22.12.0'}}}})});
  assert.deepEqual(NodeRuntimeManager.requirements(root), ['22','>=20','^20.19.0 || >=22.12.0']);
  assert.equal(NodeRuntimeManager.matches({version:'v22.11.0',lts:'Jod',files:[]}, NodeRuntimeManager.requirements(root)),false);
  assert.equal(NodeRuntimeManager.matches({version:'v22.23.3',lts:'Jod',files:[]}, NodeRuntimeManager.requirements(root)),true);
});
test('exact versions, aliases and incompatible requirements are distinguished', () => {
  const release = {version:'v20.20.0',lts:'Iron',files:[]};
  assert.equal(NodeRuntimeManager.matches(release,['20','lts/*','lts/iron']),true);
  assert.equal(NodeRuntimeManager.matches(release,['20.19.0']),false);
  assert.equal(NodeRuntimeManager.matches(release,['20','>=22']),false);
});
test('invalid version files fail before downloading', t => {
  const root = fixture(t,{'.node-version':'../../unsafe'});
  assert.throws(()=>NodeRuntimeManager.requirements(root),/no válida/);
});
test('unversioned project keeps the installed runtime', async t => {
  const root = fixture(t,{'package.json':'{}'});
  const selected = await NodeRuntimeManager.resolve(root);
  assert.equal(selected.nodePath,process.execPath);
  assert.equal(selected.version,process.version);
  assert.ok(selected.env.PATH.startsWith(path.dirname(process.execPath)));
});
