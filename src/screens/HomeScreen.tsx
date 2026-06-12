/**
 * HomeScreen.tsx — clean, simple design
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform, Animated,
} from 'react-native';
import { STATES } from '../prediction/PredictionEngine';

const TRIGGERS = [
  { id: 'flight',   label: 'Boarding a flight',     mins: 30 },
  { id: 'metro',    label: 'Taking the metro',       mins: 5  },
  { id: 'highway',  label: 'Long highway stretch',   mins: 15 },
  { id: 'basement', label: 'Going underground',      mins: 3  },
];

interface Props {
  predictionState : string;
  currentThreat   : any;
  saveProgress    : any;
  onNavigate      : (screen: string) => void;
  onManualTrigger : (mode: string, mins: number) => void;
}

export default function HomeScreen({
  predictionState, currentThreat, saveProgress, onNavigate, onManualTrigger,
}: Props) {

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const cfg = getConfig(predictionState, currentThreat);

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Top bar */}
        <View style={styles.topbar}>
          <Text style={styles.appName}>OfflineReserve</Text>
          <TouchableOpacity onPress={() => onNavigate('settings')}>
            <Text style={styles.topbarRight}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Signal status */}
        <View style={styles.signalBlock}>
          <Text style={styles.signalLabel}>Signal status</Text>
          <Text style={styles.signalText}>{cfg.text}</Text>
          <Text style={styles.signalSub}>{cfg.sub}</Text>
        </View>

        <View style={styles.divider} />

        {/* Dead zone info */}
        {currentThreat && (
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Dead zone ahead</Text>
            <Text style={styles.infoVal}>{currentThreat.zone?.name || 'Unknown zone'}</Text>
            <Text style={styles.infoSub}>
              About {Math.round(currentThreat.etaMinutes)} minutes away
              {currentThreat.zone?.route ? ` · ${currentThreat.zone.route}` : ''}
            </Text>
          </View>
        )}

        {/* Save progress */}
        {saveProgress && (
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Saving offline kit</Text>
            <View style={styles.progRow}>
              <Text style={styles.progItem} numberOfLines={1}>
                {saveProgress.currentItem || 'Preparing...'}
              </Text>
              <Text style={styles.progPct}>{saveProgress.percent}%</Text>
            </View>
            <View style={styles.progBar}>
              <View style={[styles.progFill, { width: `${saveProgress.percent}%` }]} />
            </View>
            <Text style={styles.progCount}>
              {saveProgress.saved} of {saveProgress.total} items
            </Text>
          </View>
        )}

        {/* View reserve link */}
        <TouchableOpacity onPress={() => onNavigate('reserve')}>
          <Text style={styles.navLink}>View saved content →</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Manual triggers */}
        <Text style={styles.sectionLabel}>Going offline soon?</Text>
        <View style={styles.triggerList}>
          {TRIGGERS.map(t => (
            <TouchableOpacity
              key={t.id}
              style={styles.triggerRow}
              onPress={() => onManualTrigger(t.id, t.mins)}
              activeOpacity={0.7}
            >
              <Text style={styles.triggerName}>{t.label}</Text>
              <Text style={styles.triggerMins}>{t.mins} min</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <NavItem label="Home"     active onPress={() => onNavigate('home')} />
        <NavItem label="Reserve"         onPress={() => onNavigate('reserve')} />
        <NavItem label="Settings"        onPress={() => onNavigate('settings')} />
      </View>
    </Animated.View>
  );
}

function NavItem({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.navDot, active && styles.navDotOn]} />
      <Text style={[styles.navLbl, active && styles.navLblOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function getConfig(state: string, threat: any) {
  switch (state) {
    case STATES.EARLY:
      return {
        text : `Signal dropping in ~${Math.round(threat?.etaMinutes || 10)} min`,
        sub  : `Approaching ${threat?.zone?.name || 'a dead zone'}`,
      };
    case STATES.WARNING:
      return {
        text : `Almost offline — ${Math.round(threat?.etaMinutes || 3)} min left`,
        sub  : 'Saving aggressively now',
      };
    case STATES.CRITICAL:
      return { text: 'Losing signal now', sub: 'Last save in progress' };
    case STATES.OFFLINE:
      return { text: "You're offline", sub: 'Serving from your reserve' };
    default:
      return { text: "You're online", sub: 'Reserve filling in background' };
  }
}

const styles = StyleSheet.create({
  root         : { flex: 1, backgroundColor: '#0D0D0D' },
  scroll       : { padding: 24, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 16 },
  topbar       : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 },
  appName      : { color: '#fff', fontSize: 14, fontWeight: '500' },
  topbarRight  : { color: '#555', fontSize: 13 },
  signalBlock  : { marginBottom: 24 },
  signalLabel  : { fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  signalText   : { fontSize: 22, fontWeight: '500', color: '#fff', marginBottom: 4, lineHeight: 28 },
  signalSub    : { fontSize: 13, color: '#555' },
  divider      : { height: 1, backgroundColor: '#1A1A1A', marginVertical: 20 },
  infoBox      : { backgroundColor: '#111', borderRadius: 10, padding: 14, marginBottom: 10 },
  infoLabel    : { fontSize: 11, color: '#555', marginBottom: 6 },
  infoVal      : { fontSize: 14, color: '#ccc', fontWeight: '500' },
  infoSub      : { fontSize: 11, color: '#444', marginTop: 3 },
  progRow      : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progItem     : { fontSize: 12, color: '#555', flex: 1 },
  progPct      : { fontSize: 12, color: '#888' },
  progBar      : { height: 2, backgroundColor: '#1A1A1A', borderRadius: 1, overflow: 'hidden', marginBottom: 8 },
  progFill     : { height: 2, backgroundColor: '#fff', borderRadius: 1 },
  progCount    : { fontSize: 11, color: '#444' },
  navLink      : { fontSize: 13, color: '#555', marginBottom: 4 },
  sectionLabel : { fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  triggerList  : { gap: 6 },
  triggerRow   : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#111', borderRadius: 9 },
  triggerName  : { fontSize: 13, color: '#bbb' },
  triggerMins  : { fontSize: 12, color: '#444' },
  bottomNav    : { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, backgroundColor: '#0D0D0D' },
  navItem      : { flex: 1, alignItems: 'center', gap: 3 },
  navDot       : { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  navDotOn     : { backgroundColor: '#fff' },
  navLbl       : { fontSize: 10, color: '#444' },
  navLblOn     : { color: '#fff' },
});
