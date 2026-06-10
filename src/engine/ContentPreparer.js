/**
 * ContentPreparer.js
 * The "what do we actually save" engine.
 *
 * When PredictionEngine says "dead zone in X mins" —
 * this file figures out exactly what content to prepare
 * based on:
 *  1. What the user was actively doing
 *  2. Their travel mode (train / flight / metro)
 *  3. How much time we have left
 *  4. What's already in the reserve
 *
 * Priority system:
 *  URGENT   → save in first 60 seconds no matter what
 *  HIGH     → save if we have 3+ mins
 *  NORMAL   → save if we have 5+ mins
 *  WISHLIST → save if we have 10+ mins and on WiFi
 */

import axios from 'axios';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReserveStorage from '../storage/ReserveStorage';
import PrivacyFilter from '../engine/PrivacyFilter';

// Save directory for media (audio etc.)
const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/offline_reserve/media`;

// Content priorities
const PRIORITY = {
  URGENT   : 'urgent',    // < 1 min to save
  HIGH     : 'high',      // < 3 min to save
  NORMAL   : 'normal',    // < 5 min to save
  WISHLIST : 'wishlist',  // nice to have
};

// Session keys
const SESSION_KEY      = '@current_session';
const ACTIVE_PAGE_KEY  = '@active_page';

class ContentPreparer {
  constructor() {
    this.isSaving       = false;
    this.saveQueue      = [];      // { url, type, priority, meta }
    this.activePage     = null;    // page user is currently on
    this.recentPages    = [];      // last 10 pages visited
    this.currentMode    = null;    // travel mode from PredictionEngine
    this.etaMinutes     = 10;      // time until dead zone
    this.onProgress     = null;    // callback for UI progress updates
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Called by PredictionEngine when dead zone is detected.
   * This is the main entry point.
   *
   * @param {string} urgency     — 'critical' | 'high' | 'normal'
   * @param {object} threat      — dead zone threat object
   * @param {number} etaMinutes  — minutes until dead zone
   */
  async prepare({ urgency, threat, etaMinutes }) {
    if (this.isSaving) {
      // Already saving — just update urgency if higher
      this.etaMinutes = etaMinutes;
      this._reprioritiseQueue(urgency);
      return;
    }

    console.log(`[ContentPreparer] Starting — ${etaMinutes} mins until ${threat?.zone?.name}`);
    this.isSaving   = true;
    this.etaMinutes = etaMinutes;
    this.currentMode = threat?.zone?.type || 'unknown';

    // Build save list based on what user is doing + how much time we have
    await this._buildSaveQueue(urgency, etaMinutes);

    // Start saving
    await this._processSaveQueue();

    this.isSaving = false;
    console.log('[ContentPreparer] Preparation complete');
  }

  /**
   * Track what page the user is currently on.
   * Call this from your WebView / browser component.
   */
  async setActivePage(url, title, content = null) {
    if (!PrivacyFilter.isAllowed(url)) return;

    this.activePage = { url, title, content, timestamp: Date.now() };

    // Add to recent pages (keep last 10)
    this.recentPages = [
      this.activePage,
      ...this.recentPages.filter(p => p.url !== url),
    ].slice(0, 10);

    // Always save the active page immediately — user is reading it right now
    if (content) {
      await ReserveStorage.save(url, content, 'text/html');
      console.log(`[ContentPreparer] Active page saved: ${url}`);
    }

    await AsyncStorage.setItem(ACTIVE_PAGE_KEY, JSON.stringify(this.activePage));
  }

  /**
   * Manual trigger — user taps "Save this" from notification
   */
  async saveManually(url) {
    if (!PrivacyFilter.isAllowed(url)) return false;
    return await this._fetchAndSave(url, PRIORITY.URGENT);
  }

  /**
   * Register progress callback for UI updates
   * Called with { saved, total, currentItem, percent }
   */
  onSaveProgress(callback) {
    this.onProgress = callback;
  }

  // ── Queue building ────────────────────────────────────────────

  /**
   * Build the save queue based on time available and context
   */
  async _buildSaveQueue(urgency, etaMinutes) {
    this.saveQueue = [];

    // ── ALWAYS SAVE (regardless of time) ─────────────────────
    // 1. Whatever page the user is currently on
    if (this.activePage) {
      this._enqueue({
        url      : this.activePage.url,
        type     : 'active_page',
        priority : PRIORITY.URGENT,
        content  : this.activePage.content,
        label    : `Current page: ${this.activePage.title || this.activePage.url}`,
      });
    }

    // 2. Wikipedia search page (always useful offline)
    this._enqueue({
      url      : 'https://en.wikipedia.org/wiki/Main_Page',
      type     : 'wikipedia',
      priority : PRIORITY.URGENT,
      label    : 'Wikipedia main page',
    });

    // ── SAVE IF 3+ MINS LEFT ──────────────────────────────────
    if (etaMinutes >= 3) {
      // 3. Last 3 pages user visited
      const recentToSave = this.recentPages.slice(0, 3);
      for (const page of recentToSave) {
        this._enqueue({
          url      : page.url,
          type     : 'recent_page',
          priority : PRIORITY.HIGH,
          content  : page.content,
          label    : `Recent: ${page.title || page.url}`,
        });
      }

      // 4. Google Maps offline for current location
      if (this.activePage?.url?.includes('maps.google') ||
          this.activePage?.url?.includes('maps.app')) {
        this._enqueue({
          url      : this.activePage.url,
          type     : 'maps',
          priority : PRIORITY.HIGH,
          label    : 'Your current map view',
        });
      }

      // 5. Any open podcast/audio
      await this._queueActiveAudio();
    }

    // ── SAVE IF 5+ MINS LEFT ──────────────────────────────────
    if (etaMinutes >= 5) {
      // 6. Top 5 most visited pages from history
      const topPages = await this._getTopPages(5);
      for (const page of topPages) {
        this._enqueue({
          url      : page.url,
          type     : 'frequent_page',
          priority : PRIORITY.NORMAL,
          label    : `Frequent: ${page.title || page.url}`,
        });
      }

      // 7. Today's news (cached version)
      this._enqueue({
        url      : 'https://news.google.com',
        type     : 'news',
        priority : PRIORITY.NORMAL,
        label    : 'Today\'s news',
      });

      // 8. Wikipedia articles related to what user has been reading
      await this._queueRelatedWikipedia();
    }

    // ── SAVE IF 10+ MINS LEFT (WISHLIST) ─────────────────────
    if (etaMinutes >= 10) {
      // 9. Travel mode specific content
      await this._queueTravelModeContent();

      // 10. Offline tools
      this._enqueue({
        url      : 'https://en.m.wikipedia.org/wiki/Main_Page',
        type     : 'wikipedia_mobile',
        priority : PRIORITY.WISHLIST,
        label    : 'Wikipedia (mobile)',
      });
    }

    // Sort by priority
    const order = [PRIORITY.URGENT, PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.WISHLIST];
    this.saveQueue.sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));

    console.log(`[ContentPreparer] Queue built — ${this.saveQueue.length} items`);
  }

  /**
   * Queue content based on travel mode
   */
  async _queueTravelModeContent() {
    switch (this.currentMode) {
      case 'flight':
        // Longer trip — save entertainment + destination info
        this._enqueue({
          url      : 'https://en.wikipedia.org/wiki/Special:Random',
          type     : 'entertainment',
          priority : PRIORITY.WISHLIST,
          label    : 'Random Wikipedia article (reading)',
        });
        break;

      case 'train':
      case 'metro':
        // Medium trip — save route + current reads
        this._enqueue({
          url      : 'https://indiarailinfo.com',
          type     : 'train_info',
          priority : PRIORITY.NORMAL,
          label    : 'India Rail Info',
        });
        break;

      case 'vehicle':
        // Car trip — save maps + fuel info
        this._enqueue({
          url      : 'https://www.google.com/maps',
          type     : 'maps',
          priority : PRIORITY.HIGH,
          label    : 'Google Maps (current state)',
        });
        break;
    }
  }

  /**
   * Queue Wikipedia articles related to recent browsing topics
   */
  async _queueRelatedWikipedia() {
    if (this.recentPages.length === 0) return;

    // Extract keywords from recent page titles
    const titles = this.recentPages
      .map(p => p.title || '')
      .filter(Boolean)
      .join(' ');

    // Simple keyword extraction — take meaningful words
    const keywords = titles
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 3);

    for (const keyword of keywords) {
      const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(keyword)}`;
      this._enqueue({
        url      : wikiUrl,
        type     : 'wikipedia_related',
        priority : PRIORITY.NORMAL,
        label    : `Wikipedia: ${keyword}`,
      });
    }
  }

  /**
   * Queue any audio that appears to be playing
   */
  async _queueActiveAudio() {
    try {
      const raw = await AsyncStorage.getItem('@active_audio');
      if (!raw) return;

      const audio = JSON.parse(raw);
      if (audio?.url && PrivacyFilter.isAllowed(audio.url)) {
        this._enqueue({
          url      : audio.url,
          type     : 'audio',
          priority : PRIORITY.HIGH,
          label    : `Audio: ${audio.title || 'Current audio'}`,
          isBinary : true,
        });
      }
    } catch (_) {}
  }

  /**
   * Get top visited pages from history
   */
  async _getTopPages(limit) {
    try {
      const raw = await AsyncStorage.getItem('@visit_history');
      if (!raw) return [];

      const history = JSON.parse(raw);
      const counts  = {};

      for (const { url, title } of history) {
        if (!PrivacyFilter.isAllowed(url)) continue;
        if (!counts[url]) counts[url] = { url, title, count: 0 };
        counts[url].count++;
      }

      return Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (_) {
      return [];
    }
  }

  // ── Queue processing ─────────────────────────────────────────

  /**
   * Process the save queue one by one
   */
  async _processSaveQueue() {
    const total = this.saveQueue.length;
    let saved   = 0;

    for (const item of this.saveQueue) {
      // Skip if already in reserve
      if (ReserveStorage.has(item.url) && !item.isBinary) {
        saved++;
        continue;
      }

      this._reportProgress(saved, total, item.label);

      if (item.content) {
        // Content already available — save directly
        const ok = await ReserveStorage.save(item.url, item.content);
        if (ok) saved++;
      } else {
        // Need to fetch it
        const ok = await this._fetchAndSave(item.url, item.priority, item.isBinary);
        if (ok) saved++;
      }

      // If we're almost out of time — only continue with urgent items
      if (this.etaMinutes < 1 && item.priority !== PRIORITY.URGENT) {
        console.log('[ContentPreparer] Out of time — stopping non-urgent saves');
        break;
      }
    }

    this._reportProgress(saved, total, null);
    console.log(`[ContentPreparer] Saved ${saved}/${total} items`);
  }

  /**
   * Fetch a URL and save it to reserve
   */
  async _fetchAndSave(url, priority, isBinary = false) {
    try {
      const timeout = priority === PRIORITY.URGENT ? 5000 : 10000;

      if (isBinary) {
        // Download binary file (audio etc.) directly to disk
        const filename = this._urlToFilename(url);
        const dest     = `${MEDIA_DIR}/${filename}`;

        await RNFS.mkdir(MEDIA_DIR).catch(() => {});
        await RNFS.downloadFile({ fromUrl: url, toFile: dest }).promise;
        console.log(`[ContentPreparer] Binary saved: ${url}`);
        return true;
      }

      const response = await axios.get(url, {
        timeout,
        headers        : { 'User-Agent': 'OfflineReserve/1.0' },
        maxContentLength : 10 * 1024 * 1024, // 10MB max per item
      });

      const contentType = response.headers['content-type'] || 'text/html';
      if (!PrivacyFilter.isAllowed(url, contentType)) return false;

      const content = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

      return await ReserveStorage.save(url, content, contentType);

    } catch (e) {
      console.log(`[ContentPreparer] Failed to save ${url}: ${e.message}`);
      return false;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  _enqueue(item) {
    // No duplicates
    if (this.saveQueue.find(q => q.url === item.url)) return;
    this.saveQueue.push(item);
  }

  _reprioritiseQueue(urgency) {
    if (urgency !== 'critical') return;
    // Demote all wishlist items — no time for them
    this.saveQueue = this.saveQueue.filter(
      item => item.priority !== PRIORITY.WISHLIST
    );
  }

  _reportProgress(saved, total, currentLabel) {
    if (!this.onProgress) return;
    this.onProgress({
      saved,
      total,
      currentItem : currentLabel,
      percent     : total > 0 ? Math.round((saved / total) * 100) : 0,
    });
  }

  _urlToFilename(url) {
    return url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 100);
  }
}

export default new ContentPreparer();
export { PRIORITY };
