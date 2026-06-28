import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { createBackup } from '../src/services/backup.js';

describe('createBackup', () => {
  let dbPath: string;
  let backupDir: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `backup-test-${Date.now()}.db`);
    backupDir = path.join(os.tmpdir(), `backup-dir-${Date.now()}`);
    db = openDatabase(dbPath);
    initSchema(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(backupDir)) {
      for (const file of fs.readdirSync(backupDir)) {
        fs.unlinkSync(path.join(backupDir, file));
      }
      fs.rmdirSync(backupDir);
    }
  });

  it('throws and does not copy when WAL checkpoint is busy', () => {
    const copySpy = vi.spyOn(fs, 'copyFileSync');
    const busyDb = {
      name: dbPath,
      pragma: vi.fn().mockReturnValue([{ busy: 1, log: 2, checkpointed: 0 }]),
    } as unknown as Database.Database;

    expect(() => createBackup(busyDb, backupDir)).toThrow(/backup aborted/i);
    expect(copySpy).not.toHaveBeenCalled();
    copySpy.mockRestore();
  });

  it('creates backup file when checkpoint succeeds', () => {
    const result = createBackup(db, backupDir);

    expect(fs.existsSync(result.fullPath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.filename).toMatch(/^content_bot_.*\.db$/);
  });
});
