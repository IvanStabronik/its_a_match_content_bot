import type { SourceAdapter } from '../types.js';

export const redditAdapter: SourceAdapter = {
  type: 'reddit',

  validateConfig() {
    return 'Reddit source is not configured yet.';
  },

  async fetchRecentItems() {
    throw new Error('Источник Reddit пока не настроен.');
  },
};
