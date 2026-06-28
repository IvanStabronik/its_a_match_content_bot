import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { logger } from '../logger.js';

export interface BackupResult {
  filename: string;
  sizeBytes: number;
  fullPath: string;
}

export function createBackup(db: Database.Database, backupDir: string): BackupResult {
  const checkpoint = db.pragma('wal_checkpoint(FULL)') as Array<{ busy: number; log: number; checkpointed: number }>;
  logger.info('backup', 'WAL checkpoint completed', { checkpoint: checkpoint[0] });

  const dbPath = db.name;
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `content_bot_${timestamp}.db`;
  const fullPath = path.join(backupDir, filename);

  fs.copyFileSync(dbPath, fullPath);
  const stats = fs.statSync(fullPath);

  logger.info('backup', 'Backup created', { filename, sizeBytes: stats.size });

  return { filename, sizeBytes: stats.size, fullPath };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
