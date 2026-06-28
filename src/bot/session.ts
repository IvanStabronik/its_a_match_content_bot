import type { SessionState } from '../types.js';

const sessions = new Map<number, SessionState>();

export function getSession(userId: number): SessionState {
  return sessions.get(userId) ?? { type: 'idle' };
}

export function setSession(userId: number, state: SessionState): void {
  sessions.set(userId, state);
}

export function clearSession(userId: number): void {
  sessions.set(userId, { type: 'idle' });
}

export function getQueuePage(userId: number): number {
  return queuePages.get(userId) ?? 0;
}

export function setQueuePage(userId: number, page: number): void {
  queuePages.set(userId, page);
}

const queuePages = new Map<number, number>();
