/**
 * upload.ts
 * Multer configuration for ZIP file uploads.
 * Enforces: ZIP only, max size, stores to temp dir.
 */

import multer, { FileFilterCallback } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Request } from 'express';
import { config } from '../config/env';
import { ValidationError } from '../utils/errors';

const ALLOWED_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/octet-stream',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Use OS temp directory — StorageManager will move it
    const tmpDir = path.join(os.tmpdir(), 'mycloud-uploads');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (_req, _file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    cb(null, `upload-${unique}.zip`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  // Accept by mime type OR by extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME_TYPES.includes(file.mimetype) || ext === '.zip') {
    cb(null, true);
  } else {
    cb(new ValidationError(`Only ZIP files are allowed. Received: ${file.mimetype}`));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
}).single('file');
