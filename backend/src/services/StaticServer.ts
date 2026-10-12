/**
 * StaticServer.ts
 * Creates a standalone HTTP server that serves a Vite/React/Angular dist/ folder.
 * - GET /             → dist/index.html
 * - GET /assets/...   → dist/assets/...
 * - GET /unknown      → dist/index.html  (SPA fallback for React Router)
 *
 * Does NOT depend on nginx, Apache, or Docker.
 * Each deployed frontend project gets its own instance on its assigned port.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ProcessManager } from './ProcessManager';
import { ProjectModel } from '../models/ProjectModel';
import { ProjectStatus, ProcessStatus } from '../types';
import logger from '../utils/logger';

// MIME type map
const MIME_TYPES: Record<string, string> = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.webp':  'image/webp',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.eot':   'application/vnd.ms-fontobject',
  '.mp4':   'video/mp4',
  '.webm':  'video/webm',
  '.txt':   'text/plain; charset=utf-8',
  '.xml':   'application/xml',
  '.pdf':   'application/pdf',
  '.map':   'application/json',
};

function getMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

// Registry: projectId → http.Server
const serverRegistry = new Map<string, http.Server>();

export class StaticServer {
  /**
   * Start a static file server for a project's dist/ directory.
   * Returns the listening port (same as `port` parameter).
   */
  static async start(options: {
    projectId: string;
    distPath:  string;
    port:      number;
  }): Promise<number> {
    const { projectId, distPath, port } = options;

    // Stop any existing server for this project
    StaticServer.stop(projectId);

    const indexHtml = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      throw new Error(`dist/index.html not found at: ${distPath}`);
    }

    const server = http.createServer((req, res) => {
      const url = req.url ?? '/';

      // Strip query string
      const urlPath = url.split('?')[0];

      // Resolve to a file inside distPath
      const requestedFile = path.join(distPath, urlPath);

      // Security: ensure we stay inside distPath
      const resolvedDistPath = path.resolve(distPath);
      const resolvedFile     = path.resolve(requestedFile);

      if (!resolvedFile.startsWith(resolvedDistPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      // Try to serve the exact file first
      if (fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isFile()) {
        const mime = getMime(resolvedFile);
        const content = fs.readFileSync(resolvedFile);
        res.writeHead(200, {
          'Content-Type':  mime,
          'Content-Length': content.length,
          'Cache-Control':  resolvedFile.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000',
        });
        res.end(content);
        return;
      }

      // SPA fallback: serve index.html for all unknown paths
      // (React Router, Vue Router, Angular Router handle client-side routing)
      const indexContent = fs.readFileSync(indexHtml);
      res.writeHead(200, {
        'Content-Type':  'text/html; charset=utf-8',
        'Content-Length': indexContent.length,
        'Cache-Control':  'no-cache',
      });
      res.end(indexContent);
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(port, '0.0.0.0', () => {
        logger.info(`[StaticServer] Serving ${distPath} on port ${port} (project ${projectId})`);
        resolve();
      });
      server.on('error', reject);
    });

    serverRegistry.set(projectId, server);

    // Update project
    await ProjectModel.update(projectId, { processPid: process.pid });

    return port;
  }

  /**
   * Stop the static server for a project.
   */
  static stop(projectId: string): void {
    const server = serverRegistry.get(projectId);
    if (server) {
      server.close();
      serverRegistry.delete(projectId);
      logger.info(`[StaticServer] Stopped server for project ${projectId}`);
    }
  }

  /**
   * Check if a static server is running.
   */
  static isRunning(projectId: string): boolean {
    return serverRegistry.has(projectId);
  }

  /**
   * Restart a static server.
   */
  static async restart(projectId: string, distPath: string, port: number): Promise<number> {
    StaticServer.stop(projectId);
    await new Promise(r => setTimeout(r, 500));
    return StaticServer.start({ projectId, distPath, port });
  }

  /**
   * Get all running static servers.
   */
  static getRunning(): Array<{ projectId: string }> {
    return Array.from(serverRegistry.keys()).map(projectId => ({ projectId }));
  }
}
