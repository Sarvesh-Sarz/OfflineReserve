/**
 * PredictionEngine.js
 * The core of OfflineReserve's magic.
 * 
 * Connects:
 *   MotionDetector → are we moving + how fast + which direction
 *   DeadZoneMap    → is there a dead zone ahead
 * 
 * Outputs:
 *   Notifications  → "Losing signal in ~8 mins"
 *   CacheEngine    → start preparing content NOW
 * 
 * Runs completely silently. User never interacts with this directly.
 */

import MotionDetector from './MotionDetector';
import DeadZoneMap from './DeadZoneMap';

// How often prediction loop runs (ms)
const PREDICTION_INTERVAL_MS = 15000; // every 15 seconds

// Notification thresholds (minutes)
const NOTIFY_AT_MINUTES = {
  EARLY:    10,   // "Signal dropping in ~10 mins" — start caching
  WARNING:  3,    // "Almost offline" — cache aggressively
  CRITICAL: 1,    // "Losing signal now" — last chance
};

// Prediction states
const STATES = {
  CLEAR:    'clear',      // no dead zone ahead
  EARLY:    'early',      // 10 min warning
  WARNING:  'warning',    // 3 min warning
  CRITICAL: 'critical',   // 1 min warning
  OFFLINE:  'offline',    // inside dead zone
};

class PredictionEngine {
  constructor() {
    this.state           = STATES.CLEAR;
    this.currentThreat   = null;
    this.predictionTimer = null;
    this.listeners       = [];          // {onStateChange, onThreatUpdate}
    this.notifiedStates  = new Set();   // prevent duplicate notifications
    this.onCacheStart    = null;        // callback to CacheEngine
    this.onNotify        = null;        // callback to NotificationManager
  }

  /**
   * Start the prediction engine
   * @param {Function} onCacheStart - called when caching should begin
   * @param {Function} onNotify     - called when user should be notified
   */
  async start(onCacheStart, onNotify) {
    this.onCacheStart = onCacheStart;
    this.onNotify     = onNotify;

    // Init dead zone map
    await DeadZoneMap.init();

    // Start motion detection
    MotionDetector.start();

    // Listen to motion changes
    MotionDetector.onChange(({ speed, mode }) => {
      // If user just stopped — clear any active threat
      if (speed < 5 && this.state !== STATES.CLEAR) {
        this._setState(STATES.CLEAR);
        this.currentThreat = null;
        this.notifiedStates.clear();
      }
    });

    // Start prediction loop
    this._runPredictionLoop();

    console.log('[PredictionEngine] Started — watching for dead zones');
  }

  /**
   * Stop everything
   */
  stop() {
    MotionDetector.stop();
    if (this.predictionTimer) {
      clearInterval(this.predictionTimer);
      this.predictionTimer = null;
    }
    console.log('[PredictionEngine] Stopped');
  }

  /**
   * Manual trigger — user selects a mode manually
   * e.g. "I'm boarding a flight"
   */
  manualTrigger(mode, minutesUntilOffline) {
    console.log(`[PredictionEngine] Manual trigger: ${mode} in ${minutesUntilOffline} mins`);

    const fakeThreat = {
      zone: { name: this._manualModeName(mode), type: mode },
      etaMinutes: minutesUntilOffline,
      etaSeconds: minutesUntilOffline * 60,
      distanceMetres: 0,
      confidence: 'high',
      isManual: true,
    };

    this.currentThreat = fakeThreat;
    this._handleThreat(fakeThreat);
  }

  /**
   * Register listener for state changes
   */
  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  getState()  { return this.state; }
  getThreat() { return this.currentThreat; }

  // ── Private ──

  /**
   * Main prediction loop — runs every 15 seconds
   */
  _runPredictionLoop() {
    this.predictionTimer = setInterval(() => {
      this._predict();
    }, PREDICTION_INTERVAL_MS);

    // Also run immediately
    this._predict();
  }

  /**
   * One prediction cycle
   */
  _predict() {
    const position = MotionDetector.getPosition();
    const speed    = MotionDetector.getSpeed();
    const mode     = MotionDetector.getMode();

    // Don't predict if stationary
    if (!position || speed < 5) return;

    const { latitude, longitude } = position.coords;
    const heading = position.coords.heading;

    // Check if currently inside a dead zone
    const insideDeadZone = DeadZoneMap.isInsideDeadZone(latitude, longitude);
    if (insideDeadZone) {
      if (this.state !== STATES.OFFLINE) {
        this._setState(STATES.OFFLINE);
        DeadZoneMap.logSignalLoss(latitude, longitude);
      }
      return;
    }

    // Look ahead for dead zones
    const threat = DeadZoneMap.predictAhead(latitude, longitude, speed, heading);

    if (!threat) {
      // No threat — clear state
      if (this.state !== STATES.CLEAR) {
        this._setState(STATES.CLEAR);
        this.currentThreat = null;
        this.notifiedStates.clear();
      }
      return;
    }

    this.currentThreat = threat;
    this._handleThreat(threat);
  }

  /**
   * Handle a detected threat — decide what notification to fire
   */
  _handleThreat(threat) {
    const eta = threat.etaMinutes;

    if (eta <= NOTIFY_AT_MINUTES.CRITICAL) {
      this._triggerState(STATES.CRITICAL, threat);
    } else if (eta <= NOTIFY_AT_MINUTES.WARNING) {
      this._triggerState(STATES.WARNING, threat);
    } else if (eta <= NOTIFY_AT_MINUTES.EARLY) {
      this._triggerState(STATES.EARLY, threat);
    }
  }

  /**
   * Trigger a new state — fires notification + cache start
   */
  _triggerState(newState, threat) {
    // Don't repeat same notification
    if (this.notifiedStates.has(newState)) return;

    this._setState(newState);
    this.notifiedStates.add(newState);

    const message = this._buildMessage(newState, threat);

    console.log(`[PredictionEngine] ${newState}: ${message.title}`);

    // Tell notification manager to show notification
    if (this.onNotify) {
      this.onNotify({
        state: newState,
        title: message.title,
        body: message.body,
        threat,
      });
    }

    // Tell cache engine to start/intensify caching
    if (this.onCacheStart) {
      const urgency = newState === STATES.CRITICAL ? 'critical'
                    : newState === STATES.WARNING   ? 'high'
                    : 'normal';
      this.onCacheStart({ urgency, threat, etaMinutes: threat.etaMinutes });
    }

    // Speed up GPS polling when close
    if (newState === STATES.WARNING || newState === STATES.CRITICAL) {
      MotionDetector.setCritical(true);
    }
  }

  /**
   * Build human readable notification message
   */
  _buildMessage(state, threat) {
    const zoneName = threat.zone.name || 'a dead zone';
    const eta      = threat.etaMinutes;
    const etaText  = eta < 1 ? 'less than a minute'
                   : eta === 1 ? '1 minute'
                   : `~${Math.round(eta)} minutes`;

    switch (state) {
      case STATES.EARLY:
        return {
          title: `Signal dropping in ${etaText}`,
          body:  `Approaching ${zoneName}. Preparing your offline kit...`,
        };

      case STATES.WARNING:
        return {
          title: `Almost offline — ${etaText} left`,
          body:  'Tap to see what\'s saved or add more content.',
        };

      case STATES.CRITICAL:
        return {
          title: 'Losing signal now',
          body:  'Switching to offline reserve. You\'re covered.',
        };

      case STATES.OFFLINE:
        return {
          title: 'You\'re offline',
          body:  'Serving from your reserve. No interruption.',
        };

      default:
        return { title: 'OfflineReserve', body: '' };
    }
  }

  _setState(state) {
    if (state !== this.state) {
      const prev  = this.state;
      this.state  = state;
      this._notifyListeners(state, prev);
    }
  }

  _notifyListeners(newState, prevState) {
    this.listeners.forEach(cb => {
      try { cb({ newState, prevState, threat: this.currentThreat }); }
      catch (e) { console.warn('[PredictionEngine] Listener error:', e); }
    });
  }

  _manualModeName(mode) {
    const names = {
      flight:     'Flight mode',
      metro:      'Metro / underground',
      highway:    'Low coverage area',
      basement:   'Basement / building',
      custom:     'Offline area',
    };
    return names[mode] || 'Offline area';
  }
}

export default new PredictionEngine();
export { STATES, NOTIFY_AT_MINUTES };
