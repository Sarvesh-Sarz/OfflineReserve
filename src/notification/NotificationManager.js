/**
 * NotificationManager.js — powered by Notifee
 * Fires real phone notifications when dead zone detected.
 */

import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';

class NotificationManager {
  constructor() {
    this.initialised = false;
    this.channelId   = null;
  }

  async init() {
    try {
      // Request permission
      await notifee.requestPermission();

      // Create Android channel
      this.channelId = await notifee.createChannel({
        id          : 'offline-reserve',
        name        : 'OfflineReserve Alerts',
        importance  : AndroidImportance.HIGH,
        visibility  : AndroidVisibility.PUBLIC,
        vibration   : true,
      });

      this.initialised = true;
      console.log('[NotificationManager] Ready');
    } catch (e) {
      console.log('[NotificationManager] Init error:', e);
    }
  }

  async notify({ state, title, body, threat }) {
    if (!this.initialised) return;

    try {
      await notifee.displayNotification({
        title,
        body,
        android: {
          channelId    : this.channelId,
          importance   : AndroidImportance.HIGH,
          visibility   : AndroidVisibility.PUBLIC,
          pressAction  : { id: 'default' },
          smallIcon    : 'ic_launcher',
        },
      });
      console.log(`[NotificationManager] Fired: ${title}`);
    } catch (e) {
      console.log('[NotificationManager] Notify error:', e);
    }
  }

  async onSignalRestored() {
    if (!this.initialised) return;
    try {
      await notifee.displayNotification({
        title  : 'Back online',
        body   : 'Signal restored. Reserve refilling.',
        android: {
          channelId : this.channelId,
          importance: AndroidImportance.LOW,
          pressAction: { id: 'default' },
          smallIcon : 'ic_launcher',
        },
      });
    } catch (e) {}
  }

  cancelAll() {
    notifee.cancelAllNotifications().catch(() => {});
  }
}

export default new NotificationManager();
