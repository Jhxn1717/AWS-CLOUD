import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as semver from 'semver';
import * as unzipper from 'unzipper';
import fetch from 'node-fetch';

const execFileAsync = promisify(execFile);
interface Release { version: string; lts: string | false; files: string[] }
export interface NodeRuntime { nodePath: string; version: string; env: Record<string, string> }

export class NodeRuntimeManager {
  private static pending = new Map<string, Promise<NodeRuntime>>();
  private static releaseIndex: Promise<Release[]> | undefined;
  static requirements(projectPath: string): string[] {
    const ranges: string[] = [];
    for (const name of ['.nvmrc', '.node-version']) {
      const file = path.join(projectPath, name);
      if (fs.existsSync(file)) {
        const value = fs.readFileSync(file, 'utf8').trim();
        if (value) { ranges.push(value); break; }
      }
    }
    const manifest = path.join(projectPath, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (pkg.engines?.node) ranges.push(pkg.engines.node);
      const lockFile = path.join(projectPath, 'package-lock.json');
      if (fs.existsSync(lockFile)) {
        const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        const direct = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        for (const name of direct) {
          const range = lock.packages?.[`node_modules/${name}`]?.engines?.node;
          if (range) ranges.push(range);
        }
      }
    }
    for (const range of ranges) {
      if (!['node', 'lts/*'].includes(range) && !/^lts\/[a-z]+$/i.test(range) && !semver.validRange(range)) {
        throw new Error(`Versión de Node no válida: "${range}". Usa una versión, rango semver, node o lts/*.`);
      }
    }
    return [...new Set(ranges)];
  }

  static matches(release: Release, ranges: string[]): boolean {
    return ranges.every(range => range === 'node' ||
      (range === 'lts/*' ? Boolean(release.lts) :
        /^lts\//i.test(range) ? String(release.lts).toLowerCase() === range.slice(4).toLowerCase() :
          semver.satisfies(release.version, range)));
  }

  private static runtime(nodePath: string, version: string): NodeRuntime {
    const directory = path.dirname(nodePath);
    return { nodePath, version, env: { PATH: `${directory}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ''}` } };
  }

  static async resolve(projectPath: string, log: (message: string) => Promise<unknown> = async () => {}): Promise<NodeRuntime> {
    const ranges = this.requirements(projectPath);
    // An unpinned project can use the platform's installed runtime.
    if (ranges.length === 0 || (ranges.every(range => semver.validRange(range)) && this.matches({ version: process.version, lts: false, files: [] }, ranges))) {
      await log(`[RUNTIME] Node ${process.version} (${process.execPath})`);
      return this.runtime(process.execPath, process.version);
    }
    if (process.platform !== 'win32') {
      throw new Error(`Este gestor descarga Node para Windows. Instala en el servidor una versión compatible con: ${ranges.join(' y ')}.`);
    }
    if (!this.releaseIndex) {
      this.releaseIndex = (async () => {
        const response = await fetch('https://nodejs.org/dist/index.json', { timeout: 30000 });
        if (!response.ok) throw new Error(`No se pudo consultar versiones oficiales de Node: HTTP ${response.status}`);
        return await response.json() as Release[];
      })();
      this.releaseIndex.catch(() => { this.releaseIndex = undefined; });
    }
    const releases = await this.releaseIndex;
    const fileType = `win-${process.arch}-zip`;
    const release = releases.filter(item => item.files.includes(fileType) && this.matches(item, ranges))
      .sort((a, b) => semver.rcompare(a.version, b.version))[0];
    if (!release) throw new Error(`No existe una versión oficial de Node para Windows ${process.arch} que cumpla: ${ranges.join(' y ')}.`);
    await log(`[RUNTIME] Node ${release.version} seleccionado para ${ranges.join(' y ')}`);
    let pending = this.pending.get(release.version);
    if (!pending) {
      pending = this.install(release.version);
      this.pending.set(release.version, pending);
      pending.catch(() => this.pending.delete(release.version));
    }
    return pending;
  }

  private static async install(version: string): Promise<NodeRuntime> {
    if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new Error('Versión de Node inválida.');
    const base = path.resolve(process.cwd(), '../.local/node-runtimes');
    const folder = `node-${version}-win-${process.arch}`;
    const target = path.join(base, folder);
    const nodePath = path.join(target, 'node.exe');
    if (fs.existsSync(path.join(target, '.verified'))) {
      const result = await execFileAsync(nodePath, ['--version'], { windowsHide: true });
      if (result.stdout.trim() === version) return this.runtime(nodePath, version);
    }
    fs.mkdirSync(base, { recursive: true });
    const staging = fs.mkdtempSync(path.join(base, 'download-'));
    try {
      const archive = `${folder}.zip`;
      const url = `https://nodejs.org/dist/${version}/`;
      const [zipResponse, hashResponse] = await Promise.all([
        fetch(url + archive, { timeout: 120000 }), fetch(url + 'SHASUMS256.txt', { timeout: 30000 }),
      ]);
      if (!zipResponse.ok || !hashResponse.ok) throw new Error(`No se pudo descargar Node ${version} desde nodejs.org.`);
      const bytes = await zipResponse.buffer();
      const expected = (await hashResponse.text()).split('\n').find(line => line.trim().endsWith(` ${archive}`))?.split(/\s+/)[0];
      if (!expected || crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('La descarga de Node no coincide con su SHA256 oficial.');
      const zip = await unzipper.Open.buffer(bytes);
      for (const entry of zip.files) {
        const relative = entry.path.replace(/\\/g, '/');
        const destination = path.resolve(staging, relative);
        if (!destination.startsWith(staging + path.sep) || !relative.startsWith(folder + '/')) throw new Error('Ruta inválida en la descarga de Node.');
        if (entry.type === 'Directory') { fs.mkdirSync(destination, { recursive: true }); continue; }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, await entry.buffer());
      }
      const extracted = path.join(staging, folder);
      const result = await execFileAsync(path.join(extracted, 'node.exe'), ['--version'], { windowsHide: true });
      if (result.stdout.trim() !== version) throw new Error('El runtime descargado no corresponde a la versión solicitada.');
      // Preserve an incomplete previous download rather than deleting arbitrary paths.
      if (fs.existsSync(target)) fs.renameSync(target, `${target}.incomplete-${Date.now()}`);
      fs.renameSync(extracted, target);
      fs.writeFileSync(path.join(target, '.verified'), expected);
      return this.runtime(nodePath, version);
    } finally {
      if (path.dirname(staging) === base && path.basename(staging).startsWith('download-')) fs.rmSync(staging, { recursive: true, force: true });
    }
  }
}
