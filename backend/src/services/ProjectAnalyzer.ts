/**
 * ProjectAnalyzer.ts
 * Inspects an extracted project directory and determines:
 *  - Runtime (nodejs, python, java, php)
 *  - Framework (react, vite, express, fastapi, django, flask, spring, laravel, ...)
 *  - Project type (BACKEND, STATIC_FRONTEND, FULLSTACK)
 *  - Build command (if any)
 *  - Start command + args
 *  - Whether it needs a database and which type
 *
 * RULES:
 *  - Never invent commands. Only use commands that exist in the project's manifest.
 *  - A React/Vite project is STATIC_FRONTEND and must be built, then served via HTTP.
 *  - node index.js is NEVER used unless index.js actually exists and is a server.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AnalysisResult, Runtime, Framework, ProjectType, DatabaseType,
} from '../types';
import logger from '../utils/logger';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fileExists(base: string, ...parts: string[]): boolean {
  return fs.existsSync(path.join(base, ...parts));
}

function readJson(base: string, ...parts: string[]): Record<string, unknown> | null {
  const filePath = path.join(base, ...parts);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readText(base: string, ...parts: string[]): string | null {
  const filePath = path.join(base, ...parts);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function globExists(base: string, pattern: RegExp): boolean {
  try {
    const entries = fs.readdirSync(base);
    return entries.some(e => pattern.test(e));
  } catch {
    return false;
  }
}

function findNestedProjectDescriptor(basePath: string): {
  type: 'node' | 'python' | 'java' | 'php';
  dir: string;
  pkg?: Record<string, unknown>;
  requirementsText?: string;
  pyprojectText?: string;
  pomText?: string;
  gradleText?: string;
  composerJson?: Record<string, unknown>;
} | null {
  const ignoredDirs = new Set(['node_modules', '.git', '.venv', 'dist', 'build', 'coverage', '.next', '.turbo']);
  const queue = [basePath];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const entries = fs.existsSync(current) ? fs.readdirSync(current, { withFileTypes: true }) : [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ignoredDirs.has(entry.name)) continue;
      queue.push(path.join(current, entry.name));
    }

    const pkg = readJson(current, 'package.json');
    if (pkg) {
      return {
        type: 'node',
        dir: current,
        pkg,
      };
    }

    const requirements = readText(current, 'requirements.txt');
    const pyproject = readText(current, 'pyproject.toml');
    const managePy = fileExists(current, 'manage.py');
    if (requirements || pyproject || managePy) {
      return {
        type: 'python',
        dir: current,
        requirementsText: requirements ?? pyproject ?? '',
        pyprojectText: pyproject ?? undefined,
      };
    }

    const pomXml = readText(current, 'pom.xml');
    const gradleFile = readText(current, 'build.gradle') ?? readText(current, 'build.gradle.kts');
    if (pomXml || gradleFile) {
      return {
        type: 'java',
        dir: current,
        pomText: pomXml ?? undefined,
        gradleText: gradleFile ?? undefined,
      };
    }

    const composerJson = readJson(current, 'composer.json');
    if (composerJson || fileExists(current, 'index.php') || fileExists(current, 'artisan')) {
      return {
        type: 'php',
        dir: current,
        composerJson: composerJson ?? undefined,
      };
    }
  }

  return null;
}

// ─── Database detection helpers ──────────────────────────────────────────────

const PG_PACKAGES   = ['pg', 'postgres', 'sequelize', 'typeorm', 'prisma', 'knex', 'objection'];
const MYSQL_PACKAGES = ['mysql', 'mysql2', 'mariadb'];
const SQLITE_PACKAGES = ['sqlite', 'sqlite3', 'better-sqlite3'];

function detectDatabaseFromPackageJson(pkg: Record<string, unknown>): DatabaseType {
  const deps = {
    ...((pkg.dependencies ?? {}) as Record<string, string>),
    ...((pkg.devDependencies ?? {}) as Record<string, string>),
  };
  const names = Object.keys(deps);

  // Require explicit schema/migration evidence, not just the package name
  // We look for schema files AND the package together
  if (names.some(n => SQLITE_PACKAGES.includes(n)))   return DatabaseType.SQLITE;
  if (names.some(n => MYSQL_PACKAGES.includes(n)))     return DatabaseType.MYSQL;
  if (names.some(n => PG_PACKAGES.includes(n)))        return DatabaseType.POSTGRESQL;

  return DatabaseType.NONE;
}

function hasSchemaEvidence(projectPath: string): boolean {
  const indicators = [
    'schema.sql', 'database.sql', 'dump.sql', 'init.sql',
    'migrations', 'prisma/schema.prisma',
  ];
  return indicators.some(p => fs.existsSync(path.join(projectPath, p)));
}

function detectDatabaseFromPython(requirementsText: string): DatabaseType {
  const text = requirementsText.toLowerCase();
  if (text.includes('psycopg') || text.includes('asyncpg'))   return DatabaseType.POSTGRESQL;
  if (text.includes('pymysql') || text.includes('mysqlclient')) return DatabaseType.MYSQL;
  if (text.includes('sqlite'))                                  return DatabaseType.SQLITE;
  return DatabaseType.NONE;
}

// ─── Start command builders ──────────────────────────────────────────────────

interface StartCommand {
  command: string;
  args:    string[];
}

function buildNodeStartCommand(
  pkg: Record<string, unknown>,
  projectPath: string,
  port: number = 0,
): StartCommand | null {
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;

  // Priority: start > serve > dev (only start/serve for production)
  for (const scriptName of ['start', 'serve']) {
    if (scripts[scriptName]) {
      return { command: 'npm', args: ['run', scriptName] };
    }
  }

  return null;
}

// ─── Main analyzer ───────────────────────────────────────────────────────────

export class ProjectAnalyzer {
  static async analyze(projectPath: string): Promise<AnalysisResult> {
    logger.info(`[Analyzer] Analyzing project at: ${projectPath}`);

    const warnings:      string[] = [];
    const detectedFiles: string[] = [];

    // ── 0. FULLSTACK: detect frontend/ + backend/ subdirectory structure ──────
    // Common in monorepos: frontend/ has Vite/React, backend/ has Python/Node
    const hasFrontendDir = fs.existsSync(path.join(projectPath, 'frontend'));
    const hasBackendDir  = fs.existsSync(path.join(projectPath, 'backend'));
    const hasApiDir      = fs.existsSync(path.join(projectPath, 'api'));

    const frontendPkg = readJson(projectPath, 'frontend', 'package.json');
    const backendReqs = readText(projectPath, 'backend', 'requirements.txt')
                     ?? readText(projectPath, 'requirements.txt');
    const apiPython   = fs.existsSync(path.join(projectPath, 'api', 'index.py'))
                     || fs.existsSync(path.join(projectPath, 'api', 'main.py'));

    // Full-stack: has a frontend/ with Vite and a Python backend
    if (hasFrontendDir && frontendPkg && (hasBackendDir || hasApiDir || backendReqs)) {
      logger.info(`[Analyzer] Full-stack project detected (frontend/ + backend/)`);
      return ProjectAnalyzer._analyzeFullStack(
        projectPath, frontendPkg, backendReqs ?? '', detectedFiles, warnings
      );
    }

    // Frontend-only in subdirectory (frontend/ exists, no backend evidence at root)
    if (hasFrontendDir && frontendPkg && !hasBackendDir && !backendReqs) {
      warnings.push('Project root has no manifest. Using frontend/ subdirectory.');
      return ProjectAnalyzer._analyzeNodeProject(
        path.join(projectPath, 'frontend'), frontendPkg, detectedFiles, warnings
      );
    }

    // ── 1. Collect manifest files ────────────────────────────────
    const pkg           = readJson(projectPath, 'package.json');
    const requirementsT = readText(projectPath, 'requirements.txt');
    const pyprojectT    = readText(projectPath, 'pyproject.toml');
    const pomXml        = readText(projectPath, 'pom.xml');
    const gradleFile    = readText(projectPath, 'build.gradle') ?? readText(projectPath, 'build.gradle.kts');
    const composerJson  = readJson(projectPath, 'composer.json');
    const managePy      = fileExists(projectPath, 'manage.py');

    if (pkg)           detectedFiles.push('package.json');
    if (requirementsT) detectedFiles.push('requirements.txt');
    if (pyprojectT)    detectedFiles.push('pyproject.toml');
    if (pomXml)        detectedFiles.push('pom.xml');
    if (gradleFile)    detectedFiles.push('build.gradle');
    if (composerJson)  detectedFiles.push('composer.json');
    if (managePy)      detectedFiles.push('manage.py');

    // ─────────────────────────────────────────────────────────────
    // NODE.JS
    // ─────────────────────────────────────────────────────────────
    if (pkg) {
      return ProjectAnalyzer._analyzeNodeProject(projectPath, pkg, detectedFiles, warnings);
    }

    // ─────────────────────────────────────────────────────────────
    // PYTHON
    // ─────────────────────────────────────────────────────────────
    if (requirementsT || pyprojectT || managePy) {
      return ProjectAnalyzer._analyzePythonProject(
        projectPath,
        requirementsT ?? pyprojectT ?? '',
        managePy,
        detectedFiles,
        warnings,
      );
    }

    // ─────────────────────────────────────────────────────────────
    // JAVA
    // ─────────────────────────────────────────────────────────────
    if (pomXml || gradleFile) {
      return ProjectAnalyzer._analyzeJavaProject(
        projectPath,
        pomXml,
        gradleFile,
        detectedFiles,
        warnings,
      );
    }

    // ─────────────────────────────────────────────────────────────
    // PHP
    // ─────────────────────────────────────────────────────────────
    if (composerJson || fileExists(projectPath, 'index.php') || fileExists(projectPath, 'artisan')) {
      return ProjectAnalyzer._analyzePhpProject(projectPath, composerJson, detectedFiles, warnings);
    }

    const nested = findNestedProjectDescriptor(projectPath);
    if (nested) {
      warnings.push(`Nested project detected under: ${path.relative(projectPath, nested.dir) || '.'}`);

      if (nested.type === 'node') {
        return ProjectAnalyzer._analyzeNodeProject(nested.dir, nested.pkg!, detectedFiles, warnings, nested.dir);
      }
      if (nested.type === 'python') {
        return ProjectAnalyzer._analyzePythonProject(
          nested.dir,
          nested.requirementsText ?? '',
          fileExists(nested.dir, 'manage.py'),
          detectedFiles,
          warnings,
          nested.dir,
        );
      }
      if (nested.type === 'java') {
        return ProjectAnalyzer._analyzeJavaProject(
          nested.dir,
          nested.pomText ?? null,
          nested.gradleText ?? null,
          detectedFiles,
          warnings,
          nested.dir,
        );
      }
      if (nested.type === 'php') {
        return ProjectAnalyzer._analyzePhpProject(nested.dir, nested.composerJson ?? null, detectedFiles, warnings, nested.dir);
      }
    }

    throw new Error(
      'Unable to detect project runtime. Expected one of: package.json, requirements.txt, pom.xml, build.gradle, composer.json',
    );
  }

  // ── Node.js ─────────────────────────────────────────────────────────────────

  private static _analyzeNodeProject(
    projectPath: string,
    pkg: Record<string, unknown>,
    detectedFiles: string[],
    warnings: string[],
    explicitProjectRoot?: string,
  ): AnalysisResult {
    const deps    = { ...((pkg.dependencies ?? {}) as Record<string, string>) };
    const devDeps = { ...((pkg.devDependencies ?? {}) as Record<string, string>) };
    const allDeps = { ...deps, ...devDeps };
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;

    // ── Framework detection ──────────────────────────────────────
    const hasViteConfig = globExists(projectPath, /^vite\.config\.(ts|js|mjs)$/);
    const hasNextConfig = globExists(projectPath, /^next\.config\.(ts|js|mjs)$/);
    const hasAngularJson = fileExists(projectPath, 'angular.json');
    const hasVueCli = fileExists(projectPath, 'vue.config.js') || fileExists(projectPath, 'vue.config.ts');

    if (hasViteConfig) detectedFiles.push('vite.config.*');
    if (hasNextConfig) detectedFiles.push('next.config.*');
    if (hasAngularJson) detectedFiles.push('angular.json');

    // ── Is it a frontend-only app? ───────────────────────────────
    const isReact   = 'react' in allDeps;
    const isVue     = 'vue' in allDeps;
    const isAngular = '@angular/core' in allDeps;
    const isNext    = 'next' in allDeps;

    // Backend indicators
    const isExpress  = 'express' in allDeps;
    const isFastify  = 'fastify' in allDeps;
    const isNestjs   = '@nestjs/core' in allDeps;
    const isKoa      = 'koa' in allDeps;
    const hasBackend = isExpress || isFastify || isNestjs || isKoa;

    // ── Project type ─────────────────────────────────────────────
    let projectType: ProjectType;
    let framework:   Framework;
    let buildCommand: string | null = null;
    let startCommand: string;
    let startArgs:    string[];

    // ── NEXT.JS (fullstack by nature) ────────────────────────────
    if (isNext) {
      framework   = Framework.NEXTJS;
      projectType = ProjectType.FULLSTACK;
      buildCommand = 'npm run build';

      if (scripts['start']) {
        startCommand = 'npm';
        startArgs    = ['run', 'start'];
      } else {
        startCommand = 'npx';
        startArgs    = ['next', 'start'];
      }

      return ProjectAnalyzer._buildResult({
        runtime: Runtime.NODEJS, framework, projectType,
        buildCommand, startCommand, startArgs,
        needsDatabase: false, databaseType: DatabaseType.NONE,
        detectedFiles, warnings,
        projectRoot: explicitProjectRoot ?? projectPath,
      });
    }

    // ── VITE / React / Vue frontend ──────────────────────────────
    if ((hasViteConfig || (isReact && !hasBackend) || (isVue && !hasBackend)) && !isAngular) {
      // Determine if it's really a static frontend
      const hasBuildScript = !!scripts['build'];

      if (!hasBuildScript) {
        warnings.push('No "build" script found in package.json for what appears to be a frontend project.');
      }

      framework   = isReact ? Framework.REACT : (isVue ? Framework.VUE : Framework.VITE);
      projectType = ProjectType.STATIC_FRONTEND;
      buildCommand = hasBuildScript ? 'npm run build' : null;

      // For static frontend the "start" is our internal static server,
      // not npm start — we flag this with a special marker.
      startCommand = '__STATIC_SERVER__';
      startArgs    = [];

      return ProjectAnalyzer._buildResult({
        runtime: Runtime.NODEJS, framework, projectType,
        buildCommand, startCommand, startArgs,
        needsDatabase: false, databaseType: DatabaseType.NONE,
        detectedFiles, warnings,
        projectRoot: explicitProjectRoot ?? projectPath,
      });
    }

    // ── ANGULAR ──────────────────────────────────────────────────
    if (isAngular) {
      framework   = Framework.ANGULAR;
      projectType = ProjectType.STATIC_FRONTEND;
      buildCommand = scripts['build'] ? 'npm run build' : null;
      startCommand = '__STATIC_SERVER__';
      startArgs    = [];

      return ProjectAnalyzer._buildResult({
        runtime: Runtime.NODEJS, framework, projectType,
        buildCommand, startCommand, startArgs,
        needsDatabase: false, databaseType: DatabaseType.NONE,
        detectedFiles, warnings,
        projectRoot: explicitProjectRoot ?? projectPath,
      });
    }

    // ── BACKEND (Express, Fastify, NestJS, Koa, generic Node) ────
    if (hasBackend || scripts['start'] || scripts['serve']) {
      framework = isExpress ? Framework.EXPRESS :
                  isFastify ? Framework.PLAIN :
                  isNestjs  ? Framework.PLAIN :
                  Framework.PLAIN;
      projectType = ProjectType.BACKEND;
      buildCommand = scripts['build'] ? 'npm run build' : null;

      // Find a safe start script
      const startScript = scripts['start'] ?? scripts['serve'];
      if (!startScript) {
        throw new Error(
          'No "start" script found in package.json. Cannot determine how to run this Node.js application.',
        );
      }

      startCommand = 'npm';
      startArgs    = ['run', scripts['start'] ? 'start' : 'serve'];

      // Database detection (only if there's schema evidence OR it's obvious)
      const rawDbType  = detectDatabaseFromPackageJson(pkg);
      const needsDb    = rawDbType !== DatabaseType.NONE && hasSchemaEvidence(projectPath);
      const databaseType = needsDb ? rawDbType : DatabaseType.NONE;

      if (rawDbType !== DatabaseType.NONE && !needsDb) {
        warnings.push(
          `DB package detected (${rawDbType}) but no schema/migration files found. Database will NOT be provisioned automatically.`,
        );
      }

      return ProjectAnalyzer._buildResult({
        runtime: Runtime.NODEJS, framework, projectType,
        buildCommand, startCommand, startArgs,
        needsDatabase: needsDb, databaseType,
        detectedFiles, warnings,
        projectRoot: explicitProjectRoot ?? projectPath,
      });
    }

    // ── Full-stack (both frontend and backend indicators) ─────────
    if (isReact || isVue) {
      warnings.push('Project has frontend dependencies but no clear backend entry. Treating as STATIC_FRONTEND.');
      framework    = isReact ? Framework.REACT : Framework.VUE;
      projectType  = ProjectType.STATIC_FRONTEND;
      buildCommand = scripts['build'] ? 'npm run build' : null;
      startCommand = '__STATIC_SERVER__';
      startArgs    = [];

      return ProjectAnalyzer._buildResult({
        runtime: Runtime.NODEJS, framework, projectType,
        buildCommand, startCommand, startArgs,
        needsDatabase: false, databaseType: DatabaseType.NONE,
        detectedFiles, warnings,
        projectRoot: explicitProjectRoot ?? projectPath,
      });
    }

    // ── Generic fallback for real-world apps that are valid but not in a strict framework list ──
    const hasBuildScript = !!scripts['build'];
    const hasHtmlEntry = fileExists(projectPath, 'index.html') || globExists(projectPath, /^index\.html$/);
    const hasServerEntry =
      fileExists(projectPath, 'server.js') ||
      fileExists(projectPath, 'server.mjs') ||
      fileExists(projectPath, 'server.ts') ||
      fileExists(projectPath, 'src', 'server.js') ||
      fileExists(projectPath, 'src', 'server.mjs') ||
      fileExists(projectPath, 'src', 'server.ts') ||
      fileExists(projectPath, 'src', 'index.js') ||
      fileExists(projectPath, 'src', 'index.ts') ||
      fileExists(projectPath, 'app.js') ||
      fileExists(projectPath, 'app.mjs') ||
      fileExists(projectPath, 'app.ts');

    const genericScript =
      scripts['start'] ? 'start' :
      scripts['serve'] ? 'serve' :
      scripts['preview'] ? 'preview' :
      scripts['dev'] ? 'dev' :
      null;

    if (hasHtmlEntry || hasBuildScript || hasServerEntry || genericScript) {
      if (hasHtmlEntry || hasBuildScript || hasViteConfig || hasNextConfig || hasAngularJson || hasVueCli) {
        framework    = Framework.PLAIN;
        projectType  = ProjectType.STATIC_FRONTEND;
        buildCommand = scripts['build'] ? 'npm run build' : null;
        startCommand = '__STATIC_SERVER__';
        startArgs    = [];

        if (!buildCommand && hasHtmlEntry) {
          warnings.push('Static frontend detected without a build script; using the generated static output if present.');
        }

        return ProjectAnalyzer._buildResult({
          runtime: Runtime.NODEJS, framework, projectType,
          buildCommand, startCommand, startArgs,
          needsDatabase: false, databaseType: DatabaseType.NONE,
          detectedFiles, warnings,
          projectRoot: explicitProjectRoot ?? projectPath,
        });
      }

      framework = Framework.PLAIN;
      projectType = ProjectType.BACKEND;
      buildCommand = scripts['build'] ? 'npm run build' : null;

      if (genericScript) {
        startCommand = 'npm';
        startArgs    = ['run', genericScript];
      } else if (hasServerEntry) {
        const serverFiles = [
          'server.js', 'server.mjs', 'server.ts',
          'app.js', 'app.mjs', 'app.ts',
          'src/server.js', 'src/server.mjs', 'src/server.ts',
          'src/index.js', 'src/index.ts',
        ];
        const entry = serverFiles.find(file => fileExists(projectPath, ...file.split('/')));
        if (entry) {
          startCommand = 'node';
          startArgs    = [entry];
        } else {
          startCommand = 'node';
          startArgs    = ['index.js'];
        }
      } else {
        startCommand = 'npm';
        startArgs    = ['run', 'start'];
      }

      return ProjectAnalyzer._buildResult({
        runtime: Runtime.NODEJS, framework, projectType,
        buildCommand, startCommand, startArgs,
        needsDatabase: false, databaseType: DatabaseType.NONE,
        detectedFiles, warnings,
        projectRoot: explicitProjectRoot ?? projectPath,
      });
    }

    throw new Error(
      'Could not determine project type from package.json. Add a "start" script or recognizable framework dependency.',
    );
  }

  // ── Python ───────────────────────────────────────────────────────────────────

  private static _analyzePythonProject(
    projectPath: string,
    requirementsText: string,
    hasDjango: boolean,
    detectedFiles: string[],
    warnings: string[],
    explicitProjectRoot?: string,
  ): AnalysisResult {
    const text = requirementsText.toLowerCase();

    let framework:    Framework;
    let startCommand: string;
    let startArgs:    string[];

    const isFastAPI = text.includes('fastapi');
    const isFlask   = text.includes('flask');
    const isDjango  = hasDjango || text.includes('django');

    const dbType = detectDatabaseFromPython(requirementsText);
    const needsDb = dbType !== DatabaseType.NONE && hasSchemaEvidence(projectPath);

    if (isFastAPI) {
      framework    = Framework.FASTAPI;
      // Find the main app file and working directory
      let mainFile: string;
      let workingDir: string | null = null;

      if (fs.existsSync(path.join(projectPath, 'main.py'))) {
        mainFile = 'main:app';
      } else if (fs.existsSync(path.join(projectPath, 'app.py'))) {
        mainFile = 'app:app';
      } else if (fs.existsSync(path.join(projectPath, 'src', 'main.py'))) {
        mainFile = 'src.main:app';
      } else if (fs.existsSync(path.join(projectPath, 'backend', 'app', 'main.py'))) {
        // Fullstack project: run from backend/ directory
        mainFile = 'app.main:app';
        workingDir = path.join(projectPath, 'backend');
        warnings.push('FastAPI app detected in backend/app/main.py. Running from backend/ directory.');
      } else if (fs.existsSync(path.join(projectPath, 'backend', 'main.py'))) {
        mainFile = 'main:app';
        workingDir = path.join(projectPath, 'backend');
        warnings.push('FastAPI app detected in backend/main.py. Running from backend/ directory.');
      } else {
        mainFile = 'main:app';
      }

      // For fullstack projects, use python -m uvicorn with proper working directory
      // The workingDir will be handled by ProcessManager
      if (workingDir) {
        // Store working dir hint in startArgs (hacky but works)
        startCommand = 'python';
        startArgs    = ['-m', 'uvicorn', mainFile, '--host', '0.0.0.0', '--port', '{{PORT}}', '--working-dir-hint', workingDir];
      } else {
        startCommand = 'uvicorn';
        startArgs    = [mainFile, '--host', '0.0.0.0', '--port', '{{PORT}}'];
      }
    } else if (isDjango) {
      framework    = Framework.DJANGO;
      startCommand = 'python';
      startArgs    = ['manage.py', 'runserver', '0.0.0.0:{{PORT}}'];
    } else if (isFlask) {
      framework    = Framework.FLASK;
      startCommand = 'flask';
      startArgs    = ['run', '--host=0.0.0.0', '--port={{PORT}}'];
    } else {
      // Generic Python — look for common entry points
      const mainFile = ['main.py', 'app.py', 'run.py', 'server.py']
        .find(f => fs.existsSync(path.join(projectPath, f)));

      if (!mainFile) {
        throw new Error('Cannot find Python entry point (main.py, app.py, run.py, server.py)');
      }

      framework    = Framework.PLAIN;
      startCommand = 'python';
      startArgs    = [mainFile];
      warnings.push(`Generic Python app detected. Using: python ${mainFile}`);
    }

    return ProjectAnalyzer._buildResult({
      runtime: Runtime.PYTHON, framework,
      projectType: ProjectType.BACKEND,
      buildCommand: null, startCommand, startArgs,
      needsDatabase: needsDb, databaseType: needsDb ? dbType : DatabaseType.NONE,
      detectedFiles, warnings,
      projectRoot: explicitProjectRoot ?? projectPath,
    });
  }

  // ── Java ─────────────────────────────────────────────────────────────────────

  private static _analyzeJavaProject(
    projectPath: string,
    pomXml: string | null,
    gradleFile: string | null,
    detectedFiles: string[],
    warnings: string[],
    explicitProjectRoot?: string,
  ): AnalysisResult {
    const isMaven  = !!pomXml;
    const isGradle = !!gradleFile;

    const isSpringBoot =
      (pomXml   && (pomXml.includes('spring-boot')   || pomXml.includes('spring-boot-starter'))) ||
      (gradleFile && (gradleFile.includes('spring-boot') || gradleFile.includes('org.springframework.boot')));

    let startCommand: string;
    let startArgs:    string[];
    let buildCommand: string | null = null;

    if (isMaven) {
      buildCommand  = 'mvn package -DskipTests';
      startCommand  = 'mvn';
      startArgs     = ['spring-boot:run', `-Dserver.port={{PORT}}`];
    } else if (isGradle) {
      buildCommand  = './gradlew build -x test';
      startCommand  = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
      startArgs     = ['bootRun', `--args=--server.port={{PORT}}`];
    } else {
      throw new Error('Java project detected but neither Maven (pom.xml) nor Gradle (build.gradle) found');
    }

    if (!isSpringBoot) {
      warnings.push('Spring Boot not detected; attempting generic Maven/Gradle run. May not work for all projects.');
    }

    return ProjectAnalyzer._buildResult({
      runtime: Runtime.JAVA, framework: Framework.SPRING_BOOT,
      projectType: ProjectType.BACKEND,
      buildCommand, startCommand, startArgs,
      needsDatabase: false, databaseType: DatabaseType.NONE,
      detectedFiles, warnings,
      projectRoot: explicitProjectRoot ?? projectPath,
    });
  }

  // ── PHP ──────────────────────────────────────────────────────────────────────

  private static _analyzePhpProject(
    projectPath: string,
    composerJson: Record<string, unknown> | null,
    detectedFiles: string[],
    warnings: string[],
    explicitProjectRoot?: string,
  ): AnalysisResult {
    const hasArtisan = fileExists(projectPath, 'artisan');
    const isLaravel  = hasArtisan ||
      (composerJson &&
       ((composerJson.require as Record<string, string>)?.['laravel/framework']));

    let framework:   Framework;
    let startCommand: string;
    let startArgs:    string[];

    if (isLaravel) {
      framework    = Framework.LARAVEL;
      startCommand = 'php';
      startArgs    = ['artisan', 'serve', '--host=0.0.0.0', '--port={{PORT}}'];
    } else {
      framework    = Framework.PLAIN;
      startCommand = 'php';
      startArgs    = ['-S', '0.0.0.0:{{PORT}}'];
      warnings.push('Generic PHP project detected. Using built-in PHP server.');
    }

    return ProjectAnalyzer._buildResult({
      runtime: Runtime.PHP, framework,
      projectType: ProjectType.BACKEND,
      buildCommand: null, startCommand, startArgs,
      needsDatabase: false, databaseType: DatabaseType.NONE,
      detectedFiles, warnings,
      projectRoot: explicitProjectRoot ?? projectPath,
    });
  }

  // ── Result builder ───────────────────────────────────────────────────────────

  private static _buildResult(params: {
    runtime:       Runtime;
    framework:     Framework;
    projectType:   ProjectType;
    buildCommand:  string | null;
    startCommand:  string;
    startArgs:     string[];
    needsDatabase: boolean;
    databaseType:  DatabaseType;
    detectedFiles: string[];
    warnings:      string[];
    projectRoot?:  string;
  }): AnalysisResult {
    logger.info(
      `[Analyzer] Result: runtime=${params.runtime} framework=${params.framework} type=${params.projectType}`,
    );
    if (params.warnings.length > 0) {
      logger.warn(`[Analyzer] Warnings: ${params.warnings.join('; ')}`);
    }

    return {
      runtime:        params.runtime,
      runtimeVersion: null,
      framework:      params.framework,
      projectType:    params.projectType,
      buildCommand:   params.buildCommand,
      startCommand:   params.startCommand,
      startArgs:      params.startArgs,
      needsDatabase:  params.needsDatabase,
      databaseType:   params.databaseType,
      hasPackageJson: params.detectedFiles.includes('package.json'),
      hasPython:      params.detectedFiles.some(f => f.includes('requirements') || f === 'manage.py'),
      hasJava:        params.detectedFiles.some(f => f === 'pom.xml' || f === 'build.gradle'),
      hasPhp:         params.detectedFiles.includes('composer.json'),
      projectRoot:    params.projectRoot,
      detectedFiles:  params.detectedFiles,
      warnings:       params.warnings,
    };
  }

  /**
   * Resolve {{PORT}} placeholders in args with the actual port number.
   */
  static resolvePort(args: string[], port: number): string[] {
    return args.map(a => a.replace('{{PORT}}', String(port)));
  }

  // ── Full-stack (frontend/ + backend/ subdirectory layout) ────────────────────

  private static _analyzeFullStack(
    projectPath: string,
    frontendPkg: Record<string, unknown>,
    backendRequirements: string,
    detectedFiles: string[],
    warnings: string[],
  ): AnalysisResult {
    const frontendPath = path.join(projectPath, 'frontend');
    const backendPath  = path.join(projectPath, 'backend');
    const apiPath      = path.join(projectPath, 'api');

    detectedFiles.push('frontend/package.json');

    const frontendScripts = (frontendPkg.scripts ?? {}) as Record<string, string>;
    const hasBuild = !!frontendScripts['build'];

    // Build: go into frontend/ and run build
    // The build command is relative to the project root
    const buildCommand = hasBuild
      ? `npm --prefix frontend run build`
      : null;

    // Detect Python backend (FastAPI is the most common in this kind of project)
    const text = backendRequirements.toLowerCase();
    const isFastAPI = text.includes('fastapi');
    const isDjango  = text.includes('django') || fs.existsSync(path.join(backendPath, 'manage.py'));
    const isFlask   = text.includes('flask');

    // Determine backend entry point
    let backendStart: { command: string; args: string[] };

    if (isFastAPI) {
      // Look for main app file inside backend/ or api/
      const appModule =
        fs.existsSync(path.join(backendPath, 'main.py')) ? 'backend.main:app' :
        fs.existsSync(path.join(backendPath, 'app', 'main.py')) ? 'backend.app.main:app' :
        fs.existsSync(path.join(apiPath, 'index.py')) ? 'api.index:app' :
        fs.existsSync(path.join(apiPath, 'main.py')) ? 'api.main:app' :
        fs.existsSync(path.join(projectPath, 'main.py')) ? 'main:app' :
        'main:app';
      backendStart = { command: 'uvicorn', args: [appModule, '--host', '0.0.0.0', '--port', '{{PORT}}'] };
      detectedFiles.push('requirements.txt (FastAPI)');
    } else if (isDjango) {
      backendStart = { command: 'python', args: ['backend/manage.py', 'runserver', '0.0.0.0:{{PORT}}'] };
      detectedFiles.push('manage.py (Django)');
    } else if (isFlask) {
      backendStart = { command: 'flask', args: ['run', '--host=0.0.0.0', '--port={{PORT}}'] };
      detectedFiles.push('requirements.txt (Flask)');
    } else {
      // Fallback: serve the frontend static build
      warnings.push('No recognizable Python backend framework. Will serve frontend as static site.');
      return ProjectAnalyzer._buildResult({
        runtime: Runtime.NODEJS, framework: Framework.REACT,
        projectType: ProjectType.STATIC_FRONTEND,
        buildCommand, startCommand: '__STATIC_SERVER__', startArgs: [],
        needsDatabase: false, databaseType: DatabaseType.NONE,
        detectedFiles, warnings,
      });
    }

    const dbType  = detectDatabaseFromPython(backendRequirements);
    const needsDb = dbType !== DatabaseType.NONE &&
      (hasSchemaEvidence(projectPath) || hasSchemaEvidence(backendPath));

    warnings.push(
      'Full-stack project detected. Deploying backend API only. ' +
      'Build the frontend separately or use a build script that combines both.',
    );

    return ProjectAnalyzer._buildResult({
      runtime: Runtime.PYTHON, framework: Framework.FASTAPI,
      projectType: ProjectType.FULLSTACK,
      buildCommand,
      startCommand: backendStart.command,
      startArgs:    backendStart.args,
      needsDatabase: needsDb,
      databaseType:  needsDb ? dbType : DatabaseType.NONE,
      detectedFiles, warnings,
    });
  }
}
