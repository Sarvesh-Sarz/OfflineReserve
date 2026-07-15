/**
 * AutoSaver.js
 * Automatically saves useful content when:
 * - User taps a manual trigger (metro, flight etc.)
 * - PredictionEngine detects a dead zone
 */

import ReserveStorage from '../storage/ReserveStorage';

// Pages that are always useful offline
const CORE_PAGES = [
  'https://en.m.wikipedia.org/wiki/Main_Page',
  'https://news.google.com',
];

class AutoSaver {
  constructor() {
    this.isSaving   = false;
    this.onProgress = null;
  }

  /**
   * Called when user taps a manual trigger
   * or PredictionEngine detects dead zone
   */
  async saveKit(etaMinutes = 5, onProgress = null) {
    if (this.isSaving) return;
    this.isSaving   = true;
    this.onProgress = onProgress;

    console.log(`[AutoSaver] Starting — ${etaMinutes} mins until offline`);

    const pages = [...CORE_PAGES];
    let saved   = 0;

    this._report(saved, pages.length, 'Starting...');

    for (const url of pages) {
      // Stop if we're out of time
      if (etaMinutes < 1) break;

      // Skip if already saved recently
      if (ReserveStorage.has(url)) {
        saved++;
        continue;
      }

      this._report(saved, pages.length, url);

      const ok = await this._fetchAndSave(url);
      if (ok) saved++;
    }

    this._report(saved, pages.length, null);
    this.isSaving = false;
    console.log(`[AutoSaver] Done — saved ${saved}/${pages.length}`);
  }

  /**
   * Add a specific URL to save
   * Called from browser when user is browsing
   */
  async saveUrl(url, content = null, contentType = 'text/html') {
    try {
      if (content) {
        return await ReserveStorage.save(url, content, contentType);
      }
      return await this._fetchAndSave(url);
    } catch (e) {
      console.log('[AutoSaver] saveUrl error:', e);
      return false;
    }
  }

  onSaveProgress(callback) {
    this.onProgress = callback;
  }

  // ── Private ──

  async _fetchAndSave(url) {
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        signal  : controller.signal,
        headers : { 'User-Agent': 'OfflineReserve/1.0' },
      });

      clearTimeout(timeout);

      if (!response.ok) return false;

      const contentType = response.headers.get('content-type') || 'text/html';
      const content     = await response.text();

      if (content.length > 10 * 1024 * 1024) {
        console.log(`[AutoSaver] Too large: ${url}`);
        return false;
      }

      const saved = await ReserveStorage.save(url, content, contentType);
      if (saved) console.log(`[AutoSaver] Saved: ${url}`);
      return saved;

    } catch (e) {
      console.log(`[AutoSaver] Failed: ${url} — ${e.message}`);
      return false;
    }
  }

  _report(saved, total, currentItem) {
    if (!this.onProgress) return;
    this.onProgress({
      saved,
      total,
      currentItem,
      percent: total > 0 ? Math.round((saved / total) * 100) : 0,
    });
  }
}

export default new AutoSaver();
