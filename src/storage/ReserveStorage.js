/**
 * ReserveStorage.js
 * Manages the 2GB reserve on the user's device.
 * Handles writing, reading, evicting old content, and size tracking.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

// Reserve lives in its own folder on device
const RESERVE_DIR = `${RNFS.DocumentDirectoryPath}/offline_reserve`;
const META_KEY = '@reserve_meta';           // AsyncStorage key for metadata
const DEFAULT_RESERVE_SIZE_MB = 2048;       // 2GB default

class ReserveStorage {
  constructor() {
    this.meta = {
      totalSizeMB: DEFAULT_RESERVE_SIZE_MB,
      usedBytes: 0,
      entries: {},   // url → { filename, sizeBytes, cachedAt, hitCount }
    };
    this.ready = false;
  }

  /**
   * Must call this before using storage.
   * Creates the reserve folder and loads existing metadata.
   */
  async init() {
    try {
      // Create reserve directory if it doesn't exist
      const exists = await RNFS.exists(RESERVE_DIR);
      if (!exists) {
        await RNFS.mkdir(RESERVE_DIR);
        console.log('[ReserveStorage] Created reserve directory');
      }

      // Load existing metadata
      const raw = await AsyncStorage.getItem(META_KEY);
      if (raw) {
        this.meta = JSON.parse(raw);
        console.log(`[ReserveStorage] Loaded ${Object.keys(this.meta.entries).length} cached entries`);
      }

      this.ready = true;
    } catch (e) {
      console.error('[ReserveStorage] Init failed:', e);
    }
  }

  /**
   * Save content to the reserve.
   * Evicts old content if reserve is full.
   */
  async save(url, content, contentType = 'text/html') {
    if (!this.ready) return false;

    try {
      const filename = this._urlToFilename(url);
      const filepath = `${RESERVE_DIR}/${filename}`;
      const contentBytes = Buffer.byteLength(content, 'utf8');
      const contentMB = contentBytes / (1024 * 1024);
      const reserveBytes = this.meta.totalSizeMB * 1024 * 1024;

      // Don't cache single files larger than 50MB
      if (contentMB > 50) {
        console.log(`[ReserveStorage] Skipping ${url} — too large (${contentMB.toFixed(1)}MB)`);
        return false;
      }

      // Evict old content if needed to make space
      if (this.meta.usedBytes + contentBytes > reserveBytes) {
        await this._evict(contentBytes);
      }

      // Write to disk
      await RNFS.writeFile(filepath, content, 'utf8');

      // Update metadata
      this.meta.entries[url] = {
        filename,
        filepath,
        contentType,
        sizeBytes: contentBytes,
        cachedAt: Date.now(),
        hitCount: 0,
      };
      this.meta.usedBytes += contentBytes;

      await this._saveMeta();
      return true;

    } catch (e) {
      console.error('[ReserveStorage] Save failed:', e);
      return false;
    }
  }

  /**
   * Read cached content for a URL.
   * Returns content string or null if not cached.
   */
  async get(url) {
    if (!this.ready) return null;

    const entry = this.meta.entries[url];
    if (!entry) return null;

    try {
      const exists = await RNFS.exists(entry.filepath);
      if (!exists) {
        // File missing — clean up metadata
        delete this.meta.entries[url];
        await this._saveMeta();
        return null;
      }

      // Increment hit count (helps with eviction priority)
      this.meta.entries[url].hitCount++;
      this.meta.entries[url].lastAccessedAt = Date.now();
      await this._saveMeta();

      return await RNFS.readFile(entry.filepath, 'utf8');
    } catch (e) {
      console.error('[ReserveStorage] Get failed:', e);
      return null;
    }
  }

  /**
   * Check if a URL is cached (fast — no file read)
   */
  has(url) {
    return !!this.meta.entries[url];
  }

  /**
   * Delete a specific URL from reserve
   */
  async delete(url) {
    const entry = this.meta.entries[url];
    if (!entry) return;

    try {
      await RNFS.unlink(entry.filepath);
      this.meta.usedBytes -= entry.sizeBytes;
      delete this.meta.entries[url];
      await this._saveMeta();
    } catch (e) {
      console.error('[ReserveStorage] Delete failed:', e);
    }
  }

  /**
   * Wipe the entire reserve — user triggered
   */
  async clear() {
    try {
      await RNFS.unlink(RESERVE_DIR);
      await RNFS.mkdir(RESERVE_DIR);
      this.meta.entries = {};
      this.meta.usedBytes = 0;
      await this._saveMeta();
      console.log('[ReserveStorage] Reserve cleared');
    } catch (e) {
      console.error('[ReserveStorage] Clear failed:', e);
    }
  }

  /**
   * Get reserve stats for the settings screen
   */
  getStats() {
    const usedMB = this.meta.usedBytes / (1024 * 1024);
    const totalMB = this.meta.totalSizeMB;
    const entryCount = Object.keys(this.meta.entries).length;
    return {
      usedMB: Math.round(usedMB * 10) / 10,
      totalMB,
      usedPercent: Math.round((usedMB / totalMB) * 100),
      entryCount,
    };
  }

  /**
   * Set reserve size (user preference)
   */
  async setReserveSizeMB(mb) {
    this.meta.totalSizeMB = mb;
    await this._saveMeta();
  }

  // ── Private helpers ──

  /**
   * Evict least-valuable entries to free up `neededBytes`
   * Strategy: evict lowest hitCount first, then oldest
   */
  async _evict(neededBytes) {
    const entries = Object.entries(this.meta.entries)
      .map(([url, data]) => ({ url, ...data }))
      .sort((a, b) => {
        // Sort by hit count ascending (evict least accessed first)
        if (a.hitCount !== b.hitCount) return a.hitCount - b.hitCount;
        // Then by age descending (evict oldest first)
        return a.cachedAt - b.cachedAt;
      });

    let freed = 0;
    for (const entry of entries) {
      if (freed >= neededBytes) break;
      await this.delete(entry.url);
      freed += entry.sizeBytes;
      console.log(`[ReserveStorage] Evicted ${entry.url}`);
    }
  }

  /**
   * Convert URL to a safe filename
   */
  _urlToFilename(url) {
    return url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 200) + '.cache';
  }

  /**
   * Persist metadata to AsyncStorage
   */
  async _saveMeta() {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(this.meta));
  }
}

// Singleton
export default new ReserveStorage();
