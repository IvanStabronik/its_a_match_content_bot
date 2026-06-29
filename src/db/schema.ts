import type { Db } from './connection.js';
import { runMigrations } from './migrations.js';
import { logger } from '../logger.js';

export function initSchema(db: Db): void {
  runMigrations(db);
  logger.info('database', 'Schema initialized');
}
