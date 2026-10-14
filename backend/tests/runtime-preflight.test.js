const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RuntimePreflight } = require('../dist/services/RuntimePreflight');

test('missing language runtime produces an actionable failure', async t => {
  t.mock.method(RuntimePreflight,'inspect',async()=>{throw Error('ENOENT');});
  await assert.rejects(RuntimePreflight.check({runtime:'php'},'.',async()=>{}),/Instálalo/);
});
test('Python and Java version files validate the actual installed version', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'mycloud-version-test-'));
  t.after(()=>{
    assert.equal(path.dirname(root),os.tmpdir());
    assert.ok(path.basename(root).startsWith('mycloud-version-test-'));
    fs.rmSync(root,{recursive:true,force:true});
  });
  const logs=[];
  fs.writeFileSync(path.join(root,'.python-version'),'3.12');
  t.mock.method(RuntimePreflight,'inspect',async()=> 'Python 3.12.5');
  await RuntimePreflight.check({runtime:'python'},root,async m=>logs.push(m));
  fs.writeFileSync(path.join(root,'.python-version'),'3.11');
  await assert.rejects(RuntimePreflight.check({runtime:'python'},root,async()=>{}),/solicita python 3.11/);
  fs.writeFileSync(path.join(root,'.java-version'),'8');
  t.mock.method(RuntimePreflight,'inspect',async()=> 'java version "1.8.0_442"');
  await RuntimePreflight.check({runtime:'java'},root,async m=>logs.push(m));
  assert.equal(logs.length,2);
});
