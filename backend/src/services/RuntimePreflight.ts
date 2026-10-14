import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisResult } from '../types';
import { NodeRuntimeManager } from './NodeRuntimeManager';

const execute = promisify(execFile);
export class RuntimePreflight {
  static async inspect(command: string, args: string[]): Promise<string> {
    const result = await execute(command, args, { windowsHide: true, timeout: 15000 });
    return `${result.stdout}\n${result.stderr}`.trim();
  }
  static async check(analysis: AnalysisResult, projectPath: string, log: (message: string) => Promise<unknown>): Promise<void> {
    if (analysis.runtime === 'nodejs') {
      if (analysis.hasPackageJson || analysis.buildCommand) await NodeRuntimeManager.resolve(projectPath, log);
      return;
    }
    const commands: Record<string, [string, string[]]> = {
      python: [process.platform === 'win32' ? 'python.exe' : 'python', ['--version']],
      java: ['java', ['-version']],
      php: ['php', ['--version']],
    };
    const entry = commands[analysis.runtime];
    if (!entry) throw new Error(`Runtime no soportado: ${analysis.runtime}.`);
    let output: string;
    try {
      output = await this.inspect(entry[0], entry[1]);
    } catch {
      throw new Error(`No se encontró un runtime funcional de ${analysis.runtime}. Instálalo en esta máquina y agrégalo al PATH antes de desplegar.`);
    }
    const version = analysis.runtime === 'java'
      ? output.match(/"(\d+(?:\.\d+){0,2})/)?.[1]
      : output.match(/\d+\.\d+(?:\.\d+)?/)?.[0];
    const versionFile = analysis.runtime === 'python' ? '.python-version' : analysis.runtime === 'java' ? '.java-version' : null;
    if (versionFile && fs.existsSync(path.join(projectPath, versionFile))) {
      const expected = fs.readFileSync(path.join(projectPath, versionFile), 'utf8').trim();
      const actual = analysis.runtime === 'java' && version?.startsWith('1.') ? version.slice(2) : version;
      if (!/^\d+(?:\.\d+){0,2}$/.test(expected) || !actual || !(actual === expected || actual.startsWith(expected + '.'))) {
        throw new Error(`El proyecto solicita ${analysis.runtime} ${expected} en ${versionFile}, pero la máquina tiene ${version ?? 'una versión desconocida'}. Configura el runtime solicitado en el PATH.`);
      }
    }
    await log(`[RUNTIME] ${output.split('\n')[0]}`);
    const tools: Array<[string, string[]]> = [];
    if (analysis.runtime === 'python' && ['requirements.txt', 'pyproject.toml', 'backend/requirements.txt'].some(file => fs.existsSync(path.join(projectPath, file)))) tools.push([entry[0], ['-m', 'pip', '--version']]);
    if (analysis.runtime === 'java' && fs.existsSync(path.join(projectPath, 'pom.xml'))) tools.push(['mvn', ['--version']]);
    if (analysis.runtime === 'java' && ['build.gradle', 'build.gradle.kts'].some(file => fs.existsSync(path.join(projectPath, file)))) tools.push(['gradle', ['--version']]);
    if (analysis.runtime === 'php' && fs.existsSync(path.join(projectPath, 'composer.json'))) tools.push(['composer', ['--version']]);
    for (const [tool, args] of tools) {
      try {
        const info = process.platform === 'win32' && ['mvn', 'gradle', 'composer'].includes(tool)
          ? await this.inspect('cmd.exe', ['/d', '/c', `${tool} --version`])
          : await this.inspect(tool, args);
        await log(`[RUNTIME] ${info.split('\n')[0]}`);
      } catch { throw new Error(`Falta la herramienta ${tool === entry[0] ? 'pip' : tool} necesaria para este proyecto. Instálala antes de desplegar.`); }
    }
  }
}
