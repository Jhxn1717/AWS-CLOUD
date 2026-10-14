// Public HTTPS links for running local projects; no database writes.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Pool } = require('./backend/node_modules/pg');
const env = require('./backend/node_modules/dotenv').config({ path: path.join(__dirname, 'backend/.env') }).parsed || {};
const local = path.join(__dirname, '.local');
const binary = path.join(local, 'cloudflared.exe');
const config = path.join(local, 'project-tunnels.yml');
const publicFile = path.join(__dirname, 'frontend/public/project-tunnels.json');
const entries = new Map();
const pool = new Pool({ ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : {
  host: env.DB_HOST, port: Number(env.DB_PORT || 5432), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
}), ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined, max: 1, connectionTimeoutMillis: 5000 });
fs.mkdirSync(path.dirname(publicFile), { recursive: true });
fs.writeFileSync(config, '{}\n');
function publish() {
  const urls = {};
  for (const [id, entry] of entries) if (entry.url) urls[id] = entry.url;
  const temporary = publicFile + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(urls));
  fs.renameSync(temporary, publicFile);
}
async function verify(id, entry, url) {
  for (let attempt = 0; attempt < 120 && entries.get(id) === entry; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      if (response.status >= 200 && response.status < 400) {
        entry.url = url; publish(); console.log(`${entry.name}: ${url}`); return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (entries.get(id) === entry) entry.child.kill();
}
function stop(id) {
  const entry = entries.get(id);
  if (!entry) return;
  entries.delete(id); entry.child.kill(); publish();
}
function start(project) {
  const port = Number(project.assigned_port);
  if (!Number.isInteger(port) || port < Number(env.PORT_RANGE_START || 4000) || port > Number(env.PORT_RANGE_END || 5000)) return;
  const child = spawn(binary, ['tunnel', '--config', config, '--url', `http://127.0.0.1:${port}`, '--http-host-header', `localhost:${port}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { child, port, name: project.name, url: null, discovering: false };
  entries.set(project.id, entry);
  const log = fs.createWriteStream(path.join(local, `tunnel-project-${project.id}.log`), { flags: 'a' });
  let pending = '';
  function output(data) {
    log.write(data); pending = (pending + data.toString()).slice(-16000);
    const match = pending.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !entry.discovering) { entry.discovering = true; verify(project.id, entry, match[0]).catch(error => console.error(error.message)); }
  }
  child.stdout.on('data', output); child.stderr.on('data', output);
  function closed() { log.end(); if (entries.get(project.id) === entry) { entries.delete(project.id); publish(); } }
  child.on('error', error => { console.error(error.message); closed(); });
  child.on('exit', closed);
}
let checking = false;
async function reconcile() {
  if (checking) return;
  checking = true;
  try {
    const { rows } = await pool.query("SELECT id, name, assigned_port FROM projects WHERE status = 'RUNNING' AND assigned_port IS NOT NULL");
    const wanted = new Map(rows.map(project => [project.id, project]));
    for (const [id, entry] of entries) if (!wanted.has(id) || Number(wanted.get(id).assigned_port) !== entry.port) stop(id);
    for (const project of rows) if (!entries.has(project.id)) start(project);
  } catch (error) { console.error(error.message); }
  finally { checking = false; }
}
let timer;
async function shutdown() {
  clearInterval(timer);
  for (const id of [...entries.keys()]) stop(id);
  await pool.end(); process.exit(0);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
if (!fs.existsSync(binary)) { console.error('Falta .local/cloudflared.exe. Ejecuta iniciar.bat primero.'); process.exit(1); }
publish(); reconcile(); timer = setInterval(reconcile, 15000);
