/**
 * MotionDetector.js — Battery Optimised Version
 *
 * Tiered detection strategy:
 *   Tier 1 — Accelerometer (almost free, always on)
 *             → "is the phone moving at all?"
 *   Tier 2 — OS Activity Recognition (free, built in)
 *             → "STILL / WALKING / IN_VEHICLE"
 *   Tier 3 — GPS (expensive, only when needed)
 *             → "exact speed + position"
 *   Tier 4 — Precise GPS (very expensive, max 5 mins)
 *             → "dead zone is close, need accuracy"
 *
 * Battery budget:
 *   Stationary          → ~0.5% per hour
 *   Moving (no GPS)     → ~1%   per hour
 *   Moving (GPS on)     → ~2%   per hour
 *   Critical (precise)  → ~4%   per hour (max 5 mins)
 */

import Geolocation from '@react-native-community/geolocation';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Intervals (ms) ──────────────────────────────────────────────
const INTERVALS = {
  ACCELEROMETER_CHECK : 5000,
  STATIONARY_GPS      : 600000,
  MOVING_GPS          : 30000,
  ACTIVE_GPS          : 10000,
  CRITICAL_GPS        : 3000,
  ACTIVITY_CHECK      : 20000,
};

// ── Speed thresholds (km/h) ─────────────────────────────────────
const SPEED = {
  STATIONARY : 5,
  WALKING    : 15,
  VEHICLE    : 40,
  TRAIN      : 75,
  FLIGHT     : 200,
};

// ── Battery thresholds ───────────────────────────────────────────
const BATTERY = {
  SUSPEND : 15,
  LOW     : 25,
  NORMAL  : 50,
};

// ── Detection tiers ─────────────────────────────────────────────
const TIER = {
  SLEEPING : 'sleeping',
  PASSIVE  : 'passive',
  ACTIVE   : 'active',
  PRECISE  : 'precise',
};

class MotionDetector {
  constructor() {
    this.tier             = TIER.SLEEPING;
    this.currentSpeed     = 0;
    this.currentMode      = 'stationary';
    this.currentPosition  = null;
    this.previousPosition = null;
    this.isPhoneMoving    = false;
    this.batteryLevel     = 100;
    this.isCharging       = false;
    this.isSuspended      = false;
    this.gpsWatchId       = null;
    this.accelTimer       = null;
    this.activityTimer    = null;
    this.listeners        = [];
    this.appState         = 'active';
    this._appStateSub     = null;
  }

  // ── Public API ───────────────────────────────────────────────

  async start() {
    console.log('[MotionDetector] Starting (battery-optimised)');
    await this._refreshBattery();

    this._appStateSub = AppState.addEventListener('change', s => this._onAppStateChange(s));

    this._setTier(TIER.SLEEPING);
    this._startAccelerometer();
  }

  stop() {
    this._stopGPS();
    this._stopAccelerometer();
    this._stopActivityRecognition();
    if (this._appStateSub) this._appStateSub.remove();
    console.log('[MotionDetector] Stopped');
  }

  setCritical(enabled, durationMs = 5 * 60 * 1000) {
    if (enabled) {
      this._setTier(TIER.PRECISE);
      setTimeout(() => {
        if (this.tier === TIER.PRECISE) this._stepDownTier();
      }, durationMs);
    } else {
      this._stepDownTier();
    }
  }

  updateBattery(level, charging) {
    this.batteryLevel = level;
    this.isCharging   = charging;
    this._applyBatteryPolicy();
  }

  onChange(callback) {
    this.listeners.push(callback);
    return () => { this.listeners = this.listeners.filter(l => l !== callback); };
  }

  getSpeed()    { return this.currentSpeed; }
  getMode()     { return this.currentMode; }
  getPosition() { return this.currentPosition; }
  getTier()     { return this.tier; }
  isMoving()    { return this.currentSpeed > SPEED.STATIONARY; }
  isOnTrain()   { return ['train', 'metro'].includes(this.currentMode); }
  isInVehicle() { return this.currentSpeed > SPEED.VEHICLE; }
  isOnFlight()  { return this.currentMode === 'flight'; }

  // ── Tier management ──────────────────────────────────────────

  _setTier(newTier) {
    if (newTier === this.tier) return;
    const prev = this.tier;
    this.tier  = newTier;
    console.log(`[MotionDetector] Tier: ${prev} → ${newTier}`);

    switch (newTier) {
      case TIER.SLEEPING:
        this._stopGPS();
        this._stopActivityRecognition();
        break;
      case TIER.PASSIVE:
        this._stopGPS();
        this._startActivityRecognition();
        break;
      case TIER.ACTIVE:
        this._stopActivityRecognition();
        this._startGPS(INTERVALS.ACTIVE_GPS, 20);
        break;
      case TIER.PRECISE:
        this._stopActivityRecognition();
        this._startGPS(INTERVALS.CRITICAL_GPS, 5);
        break;
    }
  }

  _stepDownTier() {
    const order = [TIER.SLEEPING, TIER.PASSIVE, TIER.ACTIVE, TIER.PRECISE];
    const idx   = order.indexOf(this.tier);
    if (idx > 0) this._setTier(order[idx - 1]);
  }

  _stepUpTier() {
    const order = [TIER.SLEEPING, TIER.PASSIVE, TIER.ACTIVE, TIER.PRECISE];
    const idx   = order.indexOf(this.tier);
    if (idx < order.length - 1) this._setTier(order[idx + 1]);
  }

  // ── Tier 1 — Accelerometer ───────────────────────────────────

  _startAccelerometer() {
    this.accelTimer = setInterval(() => this._accelerometerTick(), INTERVALS.ACCELEROMETER_CHECK);
  }

  _stopAccelerometer() {
    if (this.accelTimer) { clearInterval(this.accelTimer); this.accelTimer = null; }
  }

  _accelerometerTick() {
    if (this.isSuspended) return;

    Geolocation.getCurrentPosition(
      position => {
        const speed      = (position.coords.speed || 0) * 3.6;
        const wasMoving  = this.isPhoneMoving;
        this.isPhoneMoving = speed > SPEED.STATIONARY;

        if (!wasMoving && this.isPhoneMoving && this.tier === TIER.SLEEPING) {
          console.log('[MotionDetector] Movement detected → PASSIVE');
          this._setTier(TIER.PASSIVE);
        }

        if (wasMoving && !this.isPhoneMoving && this.tier !== TIER.SLEEPING) {
          console.log('[MotionDetector] Stopped → SLEEPING');
          this._setTier(TIER.SLEEPING);
          this._updateMotion(0, 'stationary', position);
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 30000 }
    );
  }

  // ── Tier 2 — Activity Recognition ───────────────────────────

  _startActivityRecognition() {
    this.activityTimer = setInterval(() => this._activityTick(), INTERVALS.ACTIVITY_CHECK);
  }

  _stopActivityRecognition() {
    if (this.activityTimer) { clearInterval(this.activityTimer); this.activityTimer = null; }
  }

  _activityTick() {
    if (this.isSuspended) return;

    Geolocation.getCurrentPosition(
      position => {
        const speed = (position.coords.speed || 0) * 3.6;

        if (speed > SPEED.VEHICLE && this.tier === TIER.PASSIVE) {
          console.log(`[MotionDetector] Vehicle speed ${speed.toFixed(0)} km/h → ACTIVE`);
          this._setTier(TIER.ACTIVE);
        }

        if (speed <= SPEED.VEHICLE && this.tier === TIER.ACTIVE) {
          console.log('[MotionDetector] Slowed → PASSIVE');
          this._setTier(TIER.PASSIVE);
        }

        this._updateMotion(speed, this._detectMode(speed, position), position);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 20000 }
    );
  }

  // ── Tier 3 & 4 — GPS ─────────────────────────────────────────

  _startGPS(interval, distanceFilter) {
    this._stopGPS();
    this.gpsWatchId = Geolocation.watchPosition(
      pos => this._onGPSPosition(pos),
      err => console.log('[MotionDetector] GPS error:', err.message),
      { enableHighAccuracy: true, distanceFilter, interval, fastestInterval: Math.floor(interval / 2) }
    );
    console.log(`[MotionDetector] GPS started (${interval}ms / ${distanceFilter}m)`);
  }

  _stopGPS() {
    if (this.gpsWatchId !== null) {
      Geolocation.clearWatch(this.gpsWatchId);
      this.gpsWatchId = null;
    }
  }

  _onGPSPosition(position) {
    this.previousPosition = this.currentPosition;
    this.currentPosition  = position;
    const speed = this._calculateSpeed(position);
    const mode  = this._detectMode(speed, position);
    this._updateMotion(speed, mode, position);
  }

  // ── Motion helpers ───────────────────────────────────────────

  _updateMotion(speed, mode, position) {
    const speedChanged = Math.abs(speed - this.currentSpeed) > 5;
    const modeChanged  = mode !== this.currentMode;
    this.currentSpeed    = speed;
    this.currentMode     = mode;
    this.currentPosition = position;
    if (speedChanged || modeChanged) {
      this._notify({ speed, mode, position, tier: this.tier });
    }
  }

  _calculateSpeed(position) {
    if (position.coords.speed !== null && position.coords.speed >= 0) {
      return position.coords.speed * 3.6;
    }
    if (!this.previousPosition) return 0;
    const dist  = this._haversine(this.previousPosition.coords, position.coords);
    const dt    = (position.timestamp - this.previousPosition.timestamp) / 1000;
    return dt > 0 ? (dist / dt) * 3.6 : this.currentSpeed;
  }

  _detectMode(speed, position) {
    const alt = position?.coords?.altitude || 0;
    if (speed < SPEED.STATIONARY)                   return 'stationary';
    if (speed < SPEED.WALKING)                       return 'walking';
    if (alt > 3000 && speed > SPEED.FLIGHT)          return 'flight';
    if (alt < -5   && speed >= SPEED.TRAIN)          return 'metro';
    if (speed >= SPEED.TRAIN)                        return 'train';
    if (speed >= SPEED.VEHICLE)                      return 'vehicle';
    return 'walking';
  }

  // ── Battery policy ───────────────────────────────────────────

  async _refreshBattery() {
    try {
      const raw = await AsyncStorage.getItem('@battery_state');
      if (raw) {
        const { level, charging } = JSON.parse(raw);
        this.batteryLevel = level;
        this.isCharging   = charging;
      }
    } catch (_) {}
  }

  _applyBatteryPolicy() {
    if (this.isCharging) {
      if (this.isSuspended) {
        this.isSuspended = false;
        console.log('[MotionDetector] Charging → resuming');
        this._setTier(TIER.SLEEPING);
        this._startAccelerometer();
      }
      return;
    }

    if (this.batteryLevel <= BATTERY.SUSPEND) {
      if (!this.isSuspended) {
        this.isSuspended = true;
        this._stopGPS();
        this._stopActivityRecognition();
        this._stopAccelerometer();
        console.log(`[MotionDetector] Battery ${this.batteryLevel}% → SUSPENDED`);
      }
      return;
    }

    if (this.batteryLevel <= BATTERY.LOW) {
      if (this.tier === TIER.ACTIVE || this.tier === TIER.PRECISE) {
        console.log(`[MotionDetector] Low battery → capping at PASSIVE`);
        this._setTier(TIER.PASSIVE);
      }
    }
  }

  // ── App state ─────────────────────────────────────────────────

  _onAppStateChange(nextState) {
    const prev    = this.appState;
    this.appState = nextState;
    if (prev === 'active' && nextState === 'background') {
      if (this.tier === TIER.ACTIVE) this._setTier(TIER.PASSIVE);
    }
  }

  // ── Utilities ─────────────────────────────────────────────────

  _haversine(c1, c2) {
    const R    = 6371000;
    const dLat = (c2.latitude  - c1.latitude)  * Math.PI / 180;
    const dLng = (c2.longitude - c1.longitude) * Math.PI / 180;
    const a    =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(c1.latitude * Math.PI / 180) *
      Math.cos(c2.latitude * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _notify(data) {
    this.listeners.forEach(cb => {
      try { cb(data); } catch (e) { console.warn('[MotionDetector] Listener error:', e); }
    });
  }
}

export default new MotionDetector();
export { SPEED, TIER, BATTERY };
