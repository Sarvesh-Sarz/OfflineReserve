/**
 * CacheEngine.js
 * The brain of OfflineReserve.
 * Connects SignalMonitor + PrivacyFilter + ReserveStorage together.
 * Runs silently in the background. User never touches this directly.
 */

import axios from 'axios';
import SignalMonitor, { SIGNAL_STATES } from './SignalMonitor';
import PrivacyFilter from './PrivacyFilter';
import ReserveStorage from '../storage/ReserveStorage';

// How often to run the background fill cycle (in ms)
const PASSIVE_INTERVAL_MS  = 5 * 60 * 1000;   // every 5 min on strong signal
const AGGRESSIVE_INTERVAL_MS = 60 * 1000;      // every 1 min on weak signal

// Max pages to fetch per cycle
const PASSIVE_BATCH_SIZE   = 3;
const AGGRESSIVE_BATCH_SIZE = 10;

class CacheEngine {
  constructor() {
    this.queue = [];           // URLs waiting to be cached
    this.isCaching = false;    // prevent overlapping cycles
    this.cycleTimer = null;
    this.visitHistory = [];    // URLs user has visited this session
  }

  /**
   * Start the engine — call once when app launches
   */
  async start() {
    console.log('[CacheEngine] Starting...');

    // Init storage first
    await ReserveStorage.init();

    // Start watching signal
    SignalMonitor.start();

    // React to signal changes
    SignalMonitor.onChange((newState, prevState) => {
      this._onSignalChange(newState, prevState);
    });

    // Start the first cycle
    this._scheduleCycle();

    console.log('[CacheEngine] Running silently in background');
  }

  /**
   * Stop the engine — call when app fully closes
   */
  stop() {
    SignalMonitor.stop();
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    console.log('[CacheEngine] Stopped');
  }

  /**
   * Call this every time the user visits a URL.
   * This is the "passive copy" — we already paid for this data, save it.
   */
  async onUserVisit(url, content = null, contentType = 'text/html') {
    // Track visit for prediction
    this._trackVisit(url);

    // Privacy check first — always
    const check = PrivacyFilter.check(url, contentType);
    if (!check.allowed) {
      console.log(`[CacheEngine] Blocked: ${url} (${check.reason})`);
      return;
    }

    // If we already have content (intercepted from browser), save immediately
    if (content) {
      await ReserveStorage.save(url, content, contentType);
      console.log(`[CacheEngine] Passively saved: ${url}`);
      return;
    }

    // Otherwise queue for background fetch
    this._enqueue(url, 'high');
  }

  /**
   * Serve a URL from reserve when offline.
   * Returns cached content or null.
   */
  async serve(url) {
    if (!SignalMonitor.isOffline()) return null; // Only serve when offline

    const content = await ReserveStorage.get(url);
    if (content) {
      console.log(`[CacheEngine] Serving from reserve: ${url}`);
    }
    return content;
  }

  /**
   * Get reserve stats for settings screen
   */
  getStats() {
    return ReserveStorage.getStats();
  }

  /**
   * User explicitly clears reserve
   */
  async clearReserve() {
    await ReserveStorage.clear();
    this.queue = [];
    console.log('[CacheEngine] Reserve cleared by user');
  }

  // ── Private methods ──

  /**
   * React to signal changes
   */
  _onSignalChange(newState, prevState) {
    // Signal just went weak → start caching aggressively RIGHT NOW
    if (newState === SIGNAL_STATES.WEAK) {
      console.log('[CacheEngine] Weak signal detected — caching aggressively');
      this._runCycle(AGGRESSIVE_BATCH_SIZE);
    }

    // Just came back online after being offline → refill reserve
    if (prevState === SIGNAL_STATES.OFFLINE && newState !== SIGNAL_STATES.OFFLINE) {
      console.log('[CacheEngine] Back online — refilling reserve');
      this._runCycle(AGGRESSIVE_BATCH_SIZE);
    }

    // Connected to WiFi → turbo fill
    if (SignalMonitor.onWifi()) {
      console.log('[CacheEngine] WiFi detected — turbo filling reserve');
      this._runCycle(AGGRESSIVE_BATCH_SIZE * 3);
    }

    // Reschedule cycle at new interval
    this._scheduleCycle();
  }

  /**
   * Schedule the next background cycle
   */
  _scheduleCycle() {
    if (this.cycleTimer) clearTimeout(this.cycleTimer);

    const interval = SignalMonitor.isWeak()
      ? AGGRESSIVE_INTERVAL_MS
      : PASSIVE_INTERVAL_MS;

    this.cycleTimer = setTimeout(() => {
      const batchSize = SignalMonitor.isWeak()
        ? AGGRESSIVE_BATCH_SIZE
        : PASSIVE_BATCH_SIZE;
      this._runCycle(batchSize);
      this._scheduleCycle(); // schedule next
    }, interval);
  }

  /**
   * Run one cache cycle — fetch `batchSize` URLs from queue
   */
  async _runCycle(batchSize) {
    // Don't run if offline or already running
    if (SignalMonitor.isOffline()) return;
    if (this.isCaching) return;
    if (this.queue.length === 0) {
      this._fillQueueFromHistory();
      return;
    }

    this.isCaching = true;
    console.log(`[CacheEngine] Running cycle — ${Math.min(batchSize, this.queue.length)} URLs`);

    const batch = this.queue.splice(0, batchSize);

    await Promise.allSettled(
      batch.map(item => this._fetchAndCache(item.url))
    );

    this.isCaching = false;
  }

  /**
   * Fetch a URL and save it to reserve
   */
  async _fetchAndCache(url) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'OfflineReserve/1.0' },
        maxContentLength: 50 * 1024 * 1024, // 50MB max
      });

      const contentType = response.headers['content-type'] || 'text/html';

      // Privacy check on actual response too
      if (!PrivacyFilter.isAllowed(url, contentType)) return;

      const content = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

      await ReserveStorage.save(url, content, contentType);
      console.log(`[CacheEngine] Cached: ${url}`);

    } catch (e) {
      // Silently fail — never crash because of a cache miss
      console.log(`[CacheEngine] Could not cache ${url}: ${e.message}`);
    }
  }

  /**
   * Add URL to cache queue (deduped)
   */
  _enqueue(url, priority = 'normal') {
    const already = this.queue.find(q => q.url === url);
    if (already) return;
    if (ReserveStorage.has(url)) return; // already cached

    if (priority === 'high') {
      this.queue.unshift({ url, priority }); // high priority → front of queue
    } else {
      this.queue.push({ url, priority });
    }
  }

  /**
   * Track user visit for prediction
   */
  _trackVisit(url) {
    this.visitHistory.push({ url, visitedAt: Date.now() });

    // Keep only last 500 visits
    if (this.visitHistory.length > 500) {
      this.visitHistory.shift();
    }
  }

  /**
   * Fill queue from visit history when queue is empty
   * Prioritizes most visited URLs
   */
  _fillQueueFromHistory() {
    // Count visits per URL
    const counts = {};
    this.visitHistory.forEach(({ url }) => {
      counts[url] = (counts[url] || 0) + 1;
    });

    // Sort by visit count, take top 20
    const topUrls = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url]) => url);

    topUrls.forEach(url => this._enqueue(url, 'normal'));

    console.log(`[CacheEngine] Filled queue with ${topUrls.length} predicted URLs`);
  }
}

// Singleton
export default new CacheEngine();
