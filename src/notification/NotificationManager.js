/**
 * NotificationManager.js
 * Handles all notifications for OfflineReserve.
 *
 * Three types of notifications:
 *  1. EARLY    — "Signal dropping in ~10 mins" (silent, just starts caching)
 *  2. WARNING  — "Almost offline — 3 mins left" (visible, tap to add content)
 *  3. CRITICAL — "Losing signal now" (high priority, can't miss it)
 *
 * Design rules:
 *  - Never spam the user
 *  - One notification per dead zone entry
 *  - Clears itself when signal returns
 *  - Respects Do Not Disturb
 *  - Never notifies when stationary
 */

import { Platform } from 'react-native';
import PushNotification from 'react-native-push-notification';
import { STATES } from '../prediction/PredictionEngine';

// Notification channel IDs (Android)
const CHANNELS = {
  SILENT   : 'offline-reserve-silent',    // early warning — no sound
  NORMAL   : 'offline-reserve-normal',    // warning — soft sound
  CRITICAL : 'offline-reserve-critical',  // critical — loud, heads up
};

// Notification IDs (so we can update/cancel them)
const NOTIF_IDS = {
  EARLY    : 1001,
  WARNING  : 1002,
  CRITICAL : 1003,
  BACK_ONLINE : 1004,
};

class NotificationManager {
  constructor() {
    this.initialised    = false;
    this.lastState      = null;
    this.permissionGranted = false;
  }

  // ── Setup ────────────────────────────────────────────────────

  /**
   * Call once at app launch — sets up channels and requests permission
   */
  async init() {
    PushNotification.configure({
      // Called when user taps a notification
      onNotification: notification => this._onNotificationTap(notification),

      // Required for iOS
      requestPermissions: Platform.OS === 'ios',
    });

    // Create Android notification channels
    this._createChannels();

    // Request permission (iOS + Android 13+)
    this.permissionGranted = await this._requestPermission();

    this.initialised = true;
    console.log('[NotificationManager] Ready — permission:', this.permissionGranted);
  }

  // ── Main API — called by PredictionEngine ────────────────────

  /**
   * Fire the right notification based on prediction state.
   * @param {Object} payload — { state, title, body, threat }
   */
  notify({ state, title, body, threat }) {
    if (!this.initialised || !this.permissionGranted) return;

    // Don't repeat same state
    if (state === this.lastState) return;
    this.lastState = state;

    console.log(`[NotificationManager] Firing: ${state}`);

    switch (state) {
      case STATES.EARLY:
        this._fireEarly(title, body, threat);
        break;

      case STATES.WARNING:
        this._fireWarning(title, body, threat);
        break;

      case STATES.CRITICAL:
        this._fireCritical(title, body, threat);
        break;

      case STATES.OFFLINE:
        this._fireOffline(threat);
        break;
    }
  }

  /**
   * Called when signal returns — clear all notifications
   */
  onSignalRestored() {
    this.lastState = null;

    // Cancel all dead zone notifications
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.EARLY));
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.WARNING));
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.CRITICAL));

    // Show a brief "back online" notification
    PushNotification.localNotification({
      id             : String(NOTIF_IDS.BACK_ONLINE),
      channelId      : CHANNELS.SILENT,
      title          : '✅ Signal restored',
      message        : 'You\'re back online. Reserve refilling silently.',
      smallIcon      : 'ic_notification',
      priority       : 'low',
      importance     : 'low',
      autoCancel     : true,
      timeoutAfter   : 5000, // auto-dismiss after 5 seconds
    });

    console.log('[NotificationManager] Signal restored notification sent');
  }

  /**
   * Cancel everything — called when app closes
   */
  cancelAll() {
    PushNotification.cancelAllLocalNotifications();
    this.lastState = null;
  }

  // ── Notification types ───────────────────────────────────────

  /**
   * EARLY — silent, just lets user know we're preparing
   * No sound, no vibration — just appears in tray
   */
  _fireEarly(title, body, threat) {
    // Cancel any previous early notification first
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.EARLY));

    PushNotification.localNotification({
      id           : String(NOTIF_IDS.EARLY),
      channelId    : CHANNELS.SILENT,
      title,
      message      : body,
      smallIcon    : 'ic_notification',

      // Silent — no sound, no vibration
      soundName    : 'default',
      playSound    : false,
      vibrate      : false,

      // Low priority — slides in quietly
      priority     : 'low',
      importance   : 'low',

      // Action button — "Add more"
      actions      : ['Add content', 'Dismiss'],
      invokeApp    : false,
      autoCancel   : false,

      // Custom data
      userInfo     : {
        type   : 'early',
        zoneName : threat?.zone?.name || '',
        eta    : threat?.etaMinutes || 10,
      },
    });
  }

  /**
   * WARNING — visible notification with sound
   * User should see this clearly
   */
  _fireWarning(title, body, threat) {
    // Cancel early notification — replace with warning
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.EARLY));
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.WARNING));

    PushNotification.localNotification({
      id           : String(NOTIF_IDS.WARNING),
      channelId    : CHANNELS.NORMAL,
      title,
      message      : body,
      smallIcon    : 'ic_notification',
      largeIcon    : 'ic_launcher',

      // Soft sound + vibration
      playSound    : true,
      soundName    : 'default',
      vibrate      : true,
      vibration    : 300,

      // Normal priority
      priority     : 'high',
      importance   : 'high',

      // Two action buttons
      actions      : ['See what\'s saved', 'Add more'],
      invokeApp    : true,
      autoCancel   : false,

      // Big text style (Android)
      bigText      : `${body}\n\nYour offline kit is being prepared automatically.`,
      subText      : threat?.zone?.name || 'Dead zone ahead',

      userInfo     : {
        type     : 'warning',
        zoneName : threat?.zone?.name || '',
        eta      : threat?.etaMinutes || 3,
      },
    });
  }

  /**
   * CRITICAL — heads up notification, can't miss it
   * Appears even if phone is locked
   */
  _fireCritical(title, body, threat) {
    // Cancel previous notifications
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.EARLY));
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.WARNING));
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.CRITICAL));

    PushNotification.localNotification({
      id           : String(NOTIF_IDS.CRITICAL),
      channelId    : CHANNELS.CRITICAL,
      title,
      message      : body,
      smallIcon    : 'ic_notification',
      largeIcon    : 'ic_launcher',

      // Full alert
      playSound    : true,
      soundName    : 'default',
      vibrate      : true,
      vibration    : 500,

      // Heads up — appears over other apps
      priority     : 'max',
      importance   : 'max',
      visibility   : 'public',  // shows on lock screen

      // One action
      actions      : ['Open reserve'],
      invokeApp    : true,
      autoCancel   : true,

      userInfo     : {
        type     : 'critical',
        zoneName : threat?.zone?.name || '',
        eta      : 1,
      },
    });
  }

  /**
   * OFFLINE — user is now in dead zone
   * Persistent notification in tray (like a music player)
   */
  _fireOffline(threat) {
    PushNotification.cancelLocalNotification(String(NOTIF_IDS.CRITICAL));

    PushNotification.localNotification({
      id           : String(NOTIF_IDS.CRITICAL), // reuse same slot
      channelId    : CHANNELS.NORMAL,
      title        : '📡 Offline reserve active',
      message      : `Serving from your reserve. ${threat?.zone?.name || 'Dead zone'}.`,
      smallIcon    : 'ic_notification_offline',

      // No sound — user already knows
      playSound    : false,
      vibrate      : false,

      priority     : 'low',
      importance   : 'low',

      // Persistent — stays until signal returns
      ongoing      : true,
      autoCancel   : false,

      userInfo     : { type: 'offline' },
    });
  }

  // ── Notification tap handler ─────────────────────────────────

  _onNotificationTap(notification) {
    const { type, zoneName, eta } = notification.userInfo || {};

    console.log(`[NotificationManager] Tapped: ${type}`);

    // The app handles navigation — we just log here
    // App.tsx will listen to this and open the right screen
    if (notification.action === 'Add content') {
      // Open the "add to reserve" screen
      console.log('[NotificationManager] User wants to add content');
    }

    if (notification.action === "See what's saved") {
      // Open the reserve viewer
      console.log('[NotificationManager] User wants to see reserve');
    }
  }

  // ── Android channels setup ───────────────────────────────────

  _createChannels() {
    // Silent channel — early warnings
    PushNotification.createChannel(
      {
        channelId    : CHANNELS.SILENT,
        channelName  : 'Offline Reserve — Preparing',
        channelDescription : 'Silent notifications while preparing your offline kit',
        importance   : 4,
        vibrate      : false,
        playSound    : false,
      },
      () => {}
    );

    // Normal channel — warnings
    PushNotification.createChannel(
      {
        channelId    : CHANNELS.NORMAL,
        channelName  : 'Offline Reserve — Warnings',
        channelDescription : 'Alerts when signal is dropping soon',
        importance   : 4,
        vibrate      : true,
        playSound    : true,
        soundName    : 'default',
      },
      () => {}
    );

    // Critical channel — urgent alerts
    PushNotification.createChannel(
      {
        channelId    : CHANNELS.CRITICAL,
        channelName  : 'Offline Reserve — Critical',
        channelDescription : 'Urgent alerts when signal is about to drop',
        importance   : 5,  // IMPORTANCE_HIGH
        vibrate      : true,
        playSound    : true,
        soundName    : 'default',
      },
      () => {}
    );
  }

  // ── Permission request ───────────────────────────────────────

  _requestPermission() {
    return new Promise(resolve => {
      PushNotification.requestPermissions().then(permissions => {
        resolve(permissions.alert || permissions.badge || permissions.sound);
      }).catch(() => resolve(false));
    });
  }
}

export default new NotificationManager();
