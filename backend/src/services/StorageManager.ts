/**
 * StorageManager.ts
 * Handles secure ZIP upload, extraction with Zip Slip prevention,
 * and project directory lifecycle management.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';
import { config } from '../config/env';
import { normalizeZipEntryPath, safeResolvePath, isZipEntrySafe } from '../utils/pathSafety';
import logger from '../utils/logger';

export class StorageManager {
  private static uploadsBase = path.resolve(process.cwd(), config.UPLOADS_PATH);
  private static projectsBase = path.resolve(process.cwd(), config.PROJECTS_BASE_PATH);

  static ensureDirectories(): void {
    [StorageManager.uploadsBase, StorageManager.projectsBase].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
  }

  static getUploadDir(projectId: string): string {
    return path.join(StorageManager.uploadsBase, `project-${projectId}`);
  }

  static getProjectDir(projectId: string): string {
    return path.join(StorageManager.projectsBase, `project-${projectId}`);
  }

  /**
   * Move an uploaded ZIP file to the upload staging area.
   * Returns the path to the staged ZIP file.
   */
  static stageUpload(projectId: string, tempFilePath: string): string {
    StorageManager.ensureDirectories();
    const uploadDir = StorageManager.getUploadDir(projectId);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const destPath = path.join(uploadDir, 'upload.zip');
    fs.renameSync(tempFilePath, destPath);
    logger.info(`[Storage] Staged ZIP to: ${destPath}`);
    return destPath;
  }

  /**
   * Extract a ZIP file into the project directory with full Zip Slip protection.
   * Uses unzipper.Open.file() which correctly handles Windows backslash ZIP entries
   * produced by PowerShell's Compress-Archive and similar tools.
   * Returns the project directory path.
   */
  static async extractZip(projectId: string, zipPath: string): Promise<string> {
    const projectDir = StorageManager.getProjectDir(projectId);

    // Clean target directory if it exists (re-deployment)
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
    fs.mkdirSync(projectDir, { recursive: true });

    logger.info(`[Storage] Extracting ZIP to: ${projectDir}`);

    let extractedCount = 0;
    let skippedCount = 0;

    // Use Open.file() — correctly parses Windows backslash paths in ZIP central directory
    const directory = await unzipper.Open.file(zipPath);

    if (directory.files.length === 0) {
      throw new Error('ZIP file appears to be empty or could not be read');
    }

    for (const file of directory.files) {
      const rawPath: string = file.path;

      // ── Normalize: convert backslashes to forward slashes ─────
      const normalised = normalizeZipEntryPath(rawPath);

      // ── Zip Slip protection ────────────────────────────────────
      if (
        normalised.includes('..') ||
        normalised.startsWith('/') ||
        /^[a-zA-Z]:[\\/]/.test(normalised)
      ) {
        logger.warn(`[Storage] Skipping dangerous ZIP entry: "${rawPath}"`);
        skippedCount++;
        continue;
      }

      if (!isZipEntrySafe(projectDir, normalised)) {
        logger.warn(`[Storage] Zip Slip detected, skipping: "${rawPath}"`);
        skippedCount++;
        continue;
      }

      const destPath = path.join(projectDir, normalised);

      if (file.type === 'Directory') {
        fs.mkdirSync(destPath, { recursive: true });
        continue;
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(destPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Extract file content
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(destPath);
        file.stream()
          .pipe(writeStream)
          .on('finish', () => { extractedCount++; resolve(); })
          .on('error', reject);
      });
    }

    if (extractedCount === 0 && skippedCount === 0) {
      throw new Error('No files were extracted from the ZIP. The archive may be empty or corrupted.');
    }

    logger.info(`[Storage] Extraction complete: ${extractedCount} files extracted, ${skippedCount} skipped`);

    // Flatten single-root directory (e.g. my-app.zip/my-app/package.json → package.json)
    // BUT only if we don't already have a manifest in the root
    const rootEntries = fs.readdirSync(projectDir);
    const hasManifest = rootEntries.some(e => 
      ['package.json', 'requirements.txt', 'pom.xml', 'build.gradle', 'composer.json'].includes(e)
    );

    if (!hasManifest && rootEntries.length === 1) {
      const singleEntry = rootEntries[0];
      const singlePath = path.join(projectDir, singleEntry);
      const stat = fs.statSync(singlePath);
      if (stat.isDirectory()) {
        logger.info(`[Storage] Flattening single-root directory: ${singleEntry}`);
        await StorageManager.flattenDirectory(singlePath, projectDir);
      }
    }

    return projectDir;
  }

  /**
   * Move all contents of src/ into dest/, then remove src/.
   */
  private static async flattenDirectory(src: string, dest: string): Promise<void> {
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath  = path.join(src, entry);
      const destPath = path.join(dest, entry);
      fs.renameSync(srcPath, destPath);
    }
    fs.rmdirSync(src);
  }

  /**
   * Delete the project directory and its upload staging area.
   */
  static async deleteProject(projectId: string): Promise<void> {
    const projectDir = StorageManager.getProjectDir(projectId);
    const uploadDir  = StorageManager.getUploadDir(projectId);

    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      logger.info(`[Storage] Deleted project directory: ${projectDir}`);
    }
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
      logger.info(`[Storage] Deleted upload directory: ${uploadDir}`);
    }
  }

  /**
   * Check that the project directory exists and is non-empty.
   */
  static projectDirExists(projectId: string): boolean {
    const projectDir = StorageManager.getProjectDir(projectId);
    if (!fs.existsSync(projectDir)) return false;
    const entries = fs.readdirSync(projectDir);
    return entries.length > 0;
  }

  /**
   * Verify the dist/ output was generated (for frontend builds).
   */
  static findProjectRoot(projectId: string, projectPath?: string): string {
    const projectDir = projectPath && fs.existsSync(projectPath)
      ? projectPath
      : StorageManager.getProjectDir(projectId);
    if (!fs.existsSync(projectDir)) return projectDir;

    const manifests = ['package.json', 'requirements.txt', 'pom.xml', 'build.gradle', 'composer.json', 'index.html'];
    const queue: string[] = [projectDir];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (manifests.some(file => fs.existsSync(path.join(current, file)))) {
        return current;
      }

      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(current, entry.name);
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        queue.push(child);
      }
    }

    return projectDir;
  }

  static distExists(projectId: string, projectPath?: string): boolean {
    const projectDir = StorageManager.findProjectRoot(projectId, projectPath);
    const candidates = [
      path.join(projectDir, 'dist', 'index.html'),
      path.join(projectDir, 'build', 'index.html'),
      path.join(projectDir, 'frontend', 'dist', 'index.html'),
      path.join(projectDir, 'client', 'dist', 'index.html'),
      path.join(projectDir, 'public', 'index.html'),
    ];

    return candidates.some(file => fs.existsSync(file));
  }

  /**
   * Return the full path to the dist/index.html for a frontend project.
   */
  static getDistPath(projectId: string, projectPath?: string): string {
    const projectDir = StorageManager.findProjectRoot(projectId, projectPath);
    const candidates = [
      path.join(projectDir, 'dist'),
      path.join(projectDir, 'build'),
      path.join(projectDir, 'frontend', 'dist'),
      path.join(projectDir, 'client', 'dist'),
      path.join(projectDir, 'public'),
    ];

    const found = candidates.find(candidate => fs.existsSync(candidate));
    return found ?? path.join(projectDir, 'dist');
  }

  /**
   * Validate a ZIP file: must be a real ZIP (magic bytes PK\x03\x04).
   */
  static validateZip(filePath: string): boolean {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(4);
      fs.readSync(fd, buf, 0, 4, 0);
      fs.closeSync(fd);
      // ZIP magic bytes: 50 4B 03 04
      return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
    } catch {
      return false;
    }
  }

  /**
   * Clean up upload staging area for a project.
   */
  static cleanUpload(projectId: string): void {
    const uploadDir = StorageManager.getUploadDir(projectId);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  }
}
