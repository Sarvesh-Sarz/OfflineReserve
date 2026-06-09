/**
 * App.tsx
 * The main entry point of OfflineReserve.
 * 
 * Boots up all engines in the right order.
 * Handles navigation between screens.
 * Everything starts here — user sees none of it.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  AppState,
  Platform,
  PermissionsAndroid,
} from 'react-native';

// ── Engines ──────────────────────────────────────────────────────
import PredictionEngine, { STATES } from './src/prediction/PredictionEngine';
import NotificationManager          from './src/notification/NotificationManager';
import ContentPreparer               from './src/engine/ContentPreparer';
import ReserveStorage                from './src/storage/ReserveStorage';
import SignalMonitor                  from './src/engine/SignalMonitor';
import MotionDetector                 from './src/prediction/MotionDetector';

// ── Screens ───────────────────────────────────────────────────────
import HomeScreen      from './src/screens/HomeScreen';
import ReserveScreen   from './src/screens/ReserveScreen';
import SettingsScreen  from './src/screens/SettingsScreen';

// ── App states ────────────────────────────────────────────────────
type AppScreen = 'home' | 'reserve' | 'settings';

type EngineStatus = {
  prediction : string;
  signal     : string;
  motion     : string;
  reserve    : string;
  ready      : boolean;
};

export default function App() {
  // ── State ──────────────────────────────────────────────────────
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('home');
  const [predictionState, setPredictionState] = useState(STATES.CLEAR);
  const [currentThreat, setCurrentThreat]     = useState<any>(null);
  const [saveProgress, setSaveProgress]       = useState<any>(null);
  const [engineStatus, setEngineStatus]       = useState<EngineStatus>({
    prediction : 'starting',
    signal     : 'starting',
    motion     : 'starting',
    reserve    : 'starting',
    ready      : false,
  });

  // ── Boot sequence ──────────────────────────────────────────────
  useEffect(() => {
    bootEngines();
    return () => shutdownEngines();
  }, []);

  /**
   * Boot all engines in the correct order.
   * Order matters — storage must be ready before engines that use it.
   */
  const bootEngines = async () => {
    console.log('[App] Booting OfflineReserve...');

    try {
      // Step 1 — Request permissions first
      await requestPermissions();

      // Step 2 — Init notification system
      await NotificationManager.init();
      console.log('[App] ✅ Notifications ready');

      // Step 3 — Init reserve storage
      await ReserveStorage.init();
      setEngineStatus(s => ({ ...s, reserve: 'ready' }));
      console.log('[App] ✅ Reserve storage ready');

      // Step 4 — Start signal monitor
      SignalMonitor.start();
      SignalMonitor.onChange((newState, prevState) => {
        setEngineStatus(s => ({ ...s, signal: newState }));

        // Signal came back → notify + refill reserve
        if (prevState === 'offline' && newState !== 'offline') {
          NotificationManager.onSignalRestored();
        }
      });
      setEngineStatus(s => ({ ...s, signal: 'ready' }));
      console.log('[App] ✅ Signal monitor ready');

      // Step 5 — Wire up content preparer progress
      ContentPreparer.onSaveProgress(progress => {
        setSaveProgress(progress);
      });

      // Step 6 — Start prediction engine (starts motion detector inside)
      await PredictionEngine.start(
        // onCacheStart — dead zone detected, start saving
        ({ urgency, threat, etaMinutes }) => {
          console.log(`[App] Cache start — urgency: ${urgency}, eta: ${etaMinutes} mins`);
          ContentPreparer.prepare({ urgency, threat, etaMinutes });
        },

        // onNotify — fire notification to user
        (payload) => {
          NotificationManager.notify(payload);
          setCurrentThreat(payload.threat);
          setPredictionState(payload.state);
        }
      );

      // Listen to prediction state changes for UI
      PredictionEngine.onChange(({ newState, prevState, threat }) => {
        setPredictionState(newState);
        setCurrentThreat(threat);

        // Went clear → reset UI
        if (newState === STATES.CLEAR) {
          setCurrentThreat(null);
          setSaveProgress(null);
        }
      });

      setEngineStatus(s => ({ ...s, prediction: 'ready', motion: 'ready', ready: true }));
      console.log('[App] ✅ All engines running');

    } catch (error) {
      console.error('[App] Boot failed:', error);
      setEngineStatus(s => ({ ...s, ready: false }));
    }
  };

  /**
   * Clean shutdown when app closes
   */
  const shutdownEngines = () => {
    PredictionEngine.stop();
    SignalMonitor.stop();
    NotificationManager.cancelAll();
    console.log('[App] All engines stopped');
  };

  // ── Permissions ────────────────────────────────────────────────

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return;

    const permissions = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    ];

    try {
      const results = await PermissionsAndroid.requestMultiple(permissions);

      const locationGranted =
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted' ||
        results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === 'granted';

      if (!locationGranted) {
        console.warn('[App] Location permission denied — prediction disabled');
      }

      console.log('[App] Permissions:', results);
    } catch (e) {
      console.warn('[App] Permission request failed:', e);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────

  const navigate = useCallback((screen: AppScreen) => {
    setCurrentScreen(screen);
  }, []);

  // ── App state handling (foreground / background) ───────────────

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'background') {
        console.log('[App] Backgrounded — engines continue running');
      }
      if (nextAppState === 'active') {
        console.log('[App] Foregrounded');
      }
    });
    return () => subscription.remove();
  }, []);

  // ── Loading screen ─────────────────────────────────────────────

  if (!engineStatus.ready) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
        <Text style={styles.loadingTitle}>OfflineReserve</Text>
        <Text style={styles.loadingSubtitle}>Starting engines...</Text>
        <View style={styles.statusList}>
          <StatusRow label="Storage"      status={engineStatus.reserve} />
          <StatusRow label="Signal watch" status={engineStatus.signal} />
          <StatusRow label="Prediction"   status={engineStatus.prediction} />
          <StatusRow label="Motion"       status={engineStatus.motion} />
        </View>
      </View>
    );
  }

  // ── Main app ───────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />

      {/* Active screen */}
      {currentScreen === 'home' && (
        <HomeScreen
          predictionState = {predictionState}
          currentThreat   = {currentThreat}
          saveProgress    = {saveProgress}
          onNavigate      = {navigate}
          onManualTrigger = {(mode, mins) => PredictionEngine.manualTrigger(mode, mins)}
        />
      )}

      {currentScreen === 'reserve' && (
        <ReserveScreen
          onNavigate = {navigate}
          onClear    = {async () => {
            await ReserveStorage.clear();
            setSaveProgress(null);
          }}
        />
      )}

      {currentScreen === 'settings' && (
        <SettingsScreen
          onNavigate    = {navigate}
          onSizeChange  = {(mb) => ReserveStorage.setReserveSizeMB(mb)}
          reserveStats  = {ReserveStorage.getStats()}
        />
      )}

      {/* Bottom navigation */}
      <View style={styles.bottomNav}>
        <NavButton
          label    = "Home"
          icon     = "🏠"
          active   = {currentScreen === 'home'}
          onPress  = {() => navigate('home')}
        />
        <NavButton
          label    = "Reserve"
          icon     = "📦"
          active   = {currentScreen === 'reserve'}
          onPress  = {() => navigate('reserve')}
          badge    = {ReserveStorage.getStats().entryCount}
        />
        <NavButton
          label    = "Settings"
          icon     = "⚙️"
          active   = {currentScreen === 'settings'}
          onPress  = {() => navigate('settings')}
        />
      </View>
    </View>
  );
}

// ── Small helper components ────────────────────────────────────────

function StatusRow({ label, status }: { label: string; status: string }) {
  const isReady = status === 'ready';
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, isReady ? styles.statusOk : styles.statusPending]}>
        {isReady ? '✅ Ready' : '⏳ Starting'}
      </Text>
    </View>
  );
}

function NavButton({
  label, icon, active, onPress, badge,
}: {
  label: string; icon: string; active: boolean;
  onPress: () => void; badge?: number;
}) {
  return (
    <View style={styles.navItem}>
      <Text
        style={[styles.navIcon, active && styles.navIconActive]}
        onPress={onPress}
      >
        {icon}
      </Text>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex            : 1,
    backgroundColor : '#0A0A0A',
  },

  // Loading
  loading: {
    flex            : 1,
    backgroundColor : '#0A0A0A',
    justifyContent  : 'center',
    alignItems      : 'center',
    paddingHorizontal: 32,
  },
  loadingTitle: {
    color      : '#FFFFFF',
    fontSize   : 28,
    fontWeight : '700',
    marginBottom: 8,
  },
  loadingSubtitle: {
    color      : '#666666',
    fontSize   : 14,
    marginBottom: 40,
  },
  statusList: {
    width     : '100%',
    gap       : 12,
  },
  statusRow: {
    flexDirection  : 'row',
    justifyContent : 'space-between',
    alignItems     : 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  statusLabel: {
    color    : '#888888',
    fontSize : 14,
  },
  statusValue: {
    fontSize   : 14,
    fontWeight : '500',
  },
  statusOk: {
    color: '#00C853',
  },
  statusPending: {
    color: '#FF9800',
  },

  // Bottom nav
  bottomNav: {
    flexDirection   : 'row',
    backgroundColor : '#111111',
    borderTopWidth  : 1,
    borderTopColor  : '#1E1E1E',
    paddingBottom   : Platform.OS === 'ios' ? 24 : 8,
    paddingTop      : 8,
  },
  navItem: {
    flex           : 1,
    alignItems     : 'center',
    justifyContent : 'center',
    position       : 'relative',
  },
  navIcon: {
    fontSize  : 22,
    opacity   : 0.4,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    color    : '#666666',
    fontSize : 10,
    marginTop: 2,
  },
  navLabelActive: {
    color     : '#FFFFFF',
    fontWeight: '600',
  },
  badge: {
    position       : 'absolute',
    top            : -2,
    right          : 12,
    backgroundColor: '#007AFF',
    borderRadius   : 8,
    minWidth       : 16,
    height         : 16,
    alignItems     : 'center',
    justifyContent : 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color    : '#FFFFFF',
    fontSize : 9,
    fontWeight: '700',
  },
});
