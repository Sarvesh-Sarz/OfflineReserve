/**
 * SignalMonitor.js
 * Watches the user's connection in real time.
 * Tells the cache engine when to be aggressive, passive, or switch to reserve.
 */

import NetInfo from '@react-native-community/netinfo';

// Signal strength thresholds
const SIGNAL_STATES = {
  STRONG: 'strong',     // WiFi or strong mobile — fill reserve passively
  WEAK: 'weak',         // Weak mobile signal — cache aggressively right now
  OFFLINE: 'offline',   // No connection — serve from reserve
};

class SignalMonitor {
  constructor() {
    this.currentState = SIGNAL_STATES.STRONG;
    this.listeners = [];
    this.unsubscribe = null;
    this.isWifi = false;
  }

  /**
   * Start watching the connection.
   * Call this when the app starts.
   */
  start() {
    this.unsubscribe = NetInfo.addEventListener(state => {
      const newSignalState = this._evaluate(state);

      // Only notify if state actually changed
      if (newSignalState !== this.currentState) {
        const previous = this.currentState;
        this.currentState = newSignalState;
        this.isWifi = state.type === 'wifi';
        this._notify(newSignalState, previous);
      }
    });

    console.log('[SignalMonitor] Started watching connection');
  }

  /**
   * Stop watching — call when app goes to background
   */
  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Register a listener for signal changes.
   * Callback receives (newState, previousState)
   */
  onChange(callback) {
    this.listeners.push(callback);
    // Return unregister function
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Current state getters
   */
  isOffline() { return this.currentState === SIGNAL_STATES.OFFLINE; }
  isWeak()    { return this.currentState === SIGNAL_STATES.WEAK; }
  isStrong()  { return this.currentState === SIGNAL_STATES.STRONG; }
  onWifi()    { return this.isWifi; }
  getState()  { return this.currentState; }

  /**
   * Evaluate raw NetInfo state → our signal state
   */
  _evaluate(netState) {
    // No connection at all
    if (!netState.isConnected || !netState.isInternetReachable) {
      return SIGNAL_STATES.OFFLINE;
    }

    // WiFi = always strong
    if (netState.type === 'wifi') {
      return SIGNAL_STATES.STRONG;
    }

    // Mobile data — check signal strength if available
    if (netState.type === 'cellular') {
      const details = netState.details;

      // If we have signal strength info
      if (details && details.cellularGeneration) {
        // 2G is basically offline for our purposes
        if (details.cellularGeneration === '2g') {
          return SIGNAL_STATES.WEAK;
        }
        // 3G is weak
        if (details.cellularGeneration === '3g') {
          return SIGNAL_STATES.WEAK;
        }
        // 4G/5G is strong
        return SIGNAL_STATES.STRONG;
      }

      // No generation info — assume weak to be safe, cache aggressively
      return SIGNAL_STATES.WEAK;
    }

    // Unknown type — treat as weak
    return SIGNAL_STATES.WEAK;
  }

  /**
   * Notify all listeners of state change
   */
  _notify(newState, previousState) {
    console.log(`[SignalMonitor] ${previousState} → ${newState}`);
    this.listeners.forEach(cb => {
      try { cb(newState, previousState); }
      catch (e) { console.warn('[SignalMonitor] Listener error:', e); }
    });
  }
}

// Export as singleton — one monitor for the whole app
export default new SignalMonitor();
export { SIGNAL_STATES };
