/**
 * pathSafety.ts
 * Utilities to prevent path traversal and Zip Slip attacks.
 */

import * as path from 'path';

/**
 * Resolves `filePath` relative to `baseDir` and verifies the result
 * stays within `baseDir`. Throws if a traversal is detected.
 */
export function safeResolvePath(baseDir: string, filePath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, filePath);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) &&
      resolvedTarget !== resolvedBase) {
    throw new Error(
      `Path traversal detected: "${filePath}" escapes base directory "${baseDir}"`
    );
  }

  return resolvedTarget;
}

/**
 * Returns true if the given ZIP entry path is safe (no traversal).
 */
export function isZipEntrySafe(baseDir: string, entryPath: string): boolean {
  try {
    safeResolvePath(baseDir, entryPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips any leading directory separators and Windows-style drive prefixes
 * from a ZIP entry path to normalise it.
 */
export function normalizeZipEntryPath(entryPath: string): string {
  // Replace backslashes with forward slashes
  let normalised = entryPath.replace(/\\/g, '/');
  // Remove leading slashes
  normalised = normalised.replace(/^\/+/, '');
  // Remove Windows drive letters like C:/
  normalised = normalised.replace(/^[a-zA-Z]:\//, '');
  return normalised;
}
