declare const global: any;
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform, StatusBar,
} from 'react-native';

import SignalMonitor from './src/engine/SignalMonitor';
import ReserveStorage from './src/storage/ReserveStorage';
import ReserveScreen from './src/screens/ReserveScreen';
import PredictionEngine from './src/prediction/PredictionEngine';
import BrowserScreen from './src/screens/BrowserScreen';
import AutoSaver from './src/engine/AutoSaver';
import NotificationManager from './src/notification/NotificationManager';

type Screen = 'home' | 'reserve' | 'settings' | 'browser';

export default function App() {
  const [screen, setScreen]       = useState<Screen>('home');
  const [sigState, setSigState]   = useState('clear');
  const [threat, setThreat]       = useState<any>(null);
  const [progress, setProgress]   = useState<any>(null);
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    bootEngines();
  }, []);

  const bootEngines = async () => {
    try {
      await ReserveStorage.init();

      SignalMonitor.start();
      SignalMonitor.onChange((newState: string) => {
        setSigState(newState);
      });

      await PredictionEngine.start(
        ({ urgency, threat, etaMinutes }: any) => {
          console.log('Cache start', urgency, etaMinutes);
        },
        (payload: any) => {
          setThreat(payload.threat);
          setSigState(payload.state);
        }
      );

      PredictionEngine.onChange(({ newState, threat }: any) => {
        setSigState(newState);
        setThreat(threat);
      });

      setReady(true);
    } catch (e) {
      console.log('Boot error:', e);
      setReady(true); // show UI anyway
    }
  };

  const nav = (s: string) => setScreen(s as Screen);

  if (!ready) {
    return (
      <View style={s.loading}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
        <Text style={s.loadingText}>OfflineReserve</Text>
        <Text style={s.loadingSub}>Starting...</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      {screen === 'home' && <HomeScreen nav={nav} state={sigState} threat={threat} progress={progress} />}
      {screen === 'reserve' && (
        <ReserveScreen
          onNavigate={nav}
          onClear={async () => {
            await ReserveStorage.clear();
          }}
        />
      )}
      {screen === 'settings' && <SettingsScreen nav={nav} />}
      {screen === 'browser' && <BrowserScreen onNavigate={nav} />}
    </View>
  );
}

function HomeScreen({ nav, state, threat, progress }: any) {
  const cfg: any = {
    clear:   { text: "You're online",               sub: 'Reserve filling in background' },
    early:   { text: `Signal dropping in ~${Math.round(threat?.etaMinutes || 10)} min`, sub: `Approaching ${threat?.zone?.name || 'a dead zone'}` },
    warning: { text: `Almost offline — ${Math.round(threat?.etaMinutes || 3)} min left`, sub: 'Saving aggressively now' },
    critical:{ text: 'Losing signal now',            sub: 'Last save in progress' },
    offline: { text: "You're offline",              sub: 'Serving from your reserve' },
  };
  const c = cfg[state] || cfg.clear;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.topbar}>
          <Text style={s.appName}>OfflineReserve</Text>
          <TouchableOpacity onPress={() => nav('settings')}>
            <Text style={s.topbarRight}>Settings</Text>
          </TouchableOpacity>
        </View>

        <View style={s.signalBlock}>
          <Text style={s.signalLabel}>Signal status</Text>
          <Text style={s.signalText}>{c.text}</Text>
          <Text style={s.signalSub}>{c.sub}</Text>
        </View>

        {threat && (
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Dead zone ahead</Text>
            <Text style={s.infoVal}>{threat.zone?.name}</Text>
            <Text style={s.infoSub}>~{Math.round(threat.etaMinutes)} min · {threat.zone?.route}</Text>
          </View>
        )}

        {progress && (
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>Saving offline kit</Text>
            <View style={s.progRow}>
              <Text style={s.progItem} numberOfLines={1}>{progress.currentItem}</Text>
              <Text style={s.progPct}>{progress.percent}%</Text>
            </View>
            <View style={s.progBar}>
              <View style={[s.progFill, { width: progress.percent + '%' as any }]} />
            </View>
            <Text style={s.progCount}>{progress.saved} of {progress.total} items</Text>
          </View>
        )}

        <View style={s.divider} />
        <TouchableOpacity onPress={() => nav('reserve')}>
          <Text style={s.navLink}>View saved content →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => nav('browser')}>
          <Text style={s.navLink}>Browse & save →</Text>
        </TouchableOpacity>
        <View style={s.divider} />

        <Text style={s.sectionLabel}>Going offline soon?</Text>
        <View style={s.triggerList}>
          {[
            { label: 'Boarding a flight',    mode: 'flight',   mins: 30 },
            { label: 'Taking the metro',     mode: 'metro',    mins: 5  },
            { label: 'Long highway stretch', mode: 'highway',  mins: 15 },
            { label: 'Going underground',    mode: 'basement', mins: 3  },
          ].map((t, i) => (
            <TouchableOpacity key={i} style={s.triggerRow}
              onPress={() => PredictionEngine.manualTrigger(t.mode, t.mins)}>
              <Text style={s.triggerName}>{t.label}</Text>
              <Text style={s.triggerMins}>{t.mins} min</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <BottomNav screen="home" nav={nav} />
    </View>
  );
}


function SettingsScreen({ nav }: any) {
  const [size, setSize] = useState(2048);
  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => nav('home')}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={s.pageTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionLabel}>Reserve size</Text>
        <Text style={s.sectionSub}>Filled only from WiFi or pages you already visited.</Text>
        <View style={s.sizeRow}>
          {[{ l: '1 GB', v: 1024 }, { l: '2 GB', v: 2048 }, { l: '5 GB', v: 5120 }].map(item => (
            <TouchableOpacity key={item.v} style={[s.sizeBtn, size === item.v && s.sizeBtnOn]}
              onPress={() => { setSize(item.v); ReserveStorage.setReserveSizeMB(item.v); }}>
              <Text style={[s.sizeBtnText, size === item.v && s.sizeBtnTextOn]}>{item.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.divider} />
        <Text style={s.sectionLabel}>Privacy</Text>
        {['Data never leaves your device','We never see what you save','Chats and passwords are blocked','Incognito sessions are ignored','Delete everything anytime'].map((p, i) => (
          <Text key={i} style={s.privacyItem}>{p}</Text>
        ))}
        <View style={s.divider} />
        <Text style={s.sectionLabel}>Dead zone map</Text>
        <View style={s.infoRow}><Text style={s.infoLbl}>Zones loaded</Text><Text style={s.infoVal}>57 zones</Text></View>
        <View style={s.infoRow}><Text style={s.infoLbl}>Coverage</Text><Text style={s.infoVal}>South India</Text></View>
        <View style={s.divider} />
        <Text style={s.version}>v0.1.0 — beta</Text>
      </ScrollView>
      <BottomNav screen="settings" nav={nav} />
    </View>
  );
}

function BottomNav({ screen, nav }: any) {
  return (
    <View style={s.bottomNav}>
      {['home', 'reserve', 'settings'].map(item => (
        <TouchableOpacity key={item} style={s.navItem} onPress={() => nav(item)}>
          <View style={[s.navDot, screen === item && s.navDotOn]} />
          <Text style={[s.navLbl, screen === item && s.navLblOn]}>
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root         : { flex: 1, backgroundColor: '#0D0D0D' },
  loading      : { flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' },
  loadingText  : { color: '#fff', fontSize: 24, fontWeight: '500' },
  loadingSub   : { color: '#555', fontSize: 13, marginTop: 8 },
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
  sectionSub   : { fontSize: 12, color: '#444', lineHeight: 18, marginBottom: 14 },
  triggerList  : { gap: 6 },
  triggerRow   : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#111', borderRadius: 9, marginBottom: 6 },
  triggerName  : { fontSize: 13, color: '#bbb' },
  triggerMins  : { fontSize: 11, color: '#444' },
  header       : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 36 },
  backBtn      : { fontSize: 13, color: '#555' },
  pageTitle    : { fontSize: 14, fontWeight: '500', color: '#fff' },
  statRow      : { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 10 },
  statBox      : { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 10 },
  statN        : { fontSize: 16, fontWeight: '500', color: '#fff' },
  statL        : { fontSize: 10, color: '#444', marginTop: 2 },
  empty        : { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle   : { color: '#fff', fontSize: 16, fontWeight: '500', marginBottom: 8 },
  emptySub     : { color: '#444', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  sizeRow      : { flexDirection: 'row', gap: 6, marginBottom: 4 },
  sizeBtn      : { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#1A1A1A' },
  sizeBtnOn    : { borderColor: '#555' },
  sizeBtnText  : { fontSize: 12, color: '#555', fontWeight: '500' },
  sizeBtnTextOn: { color: '#ccc' },
  privacyItem  : { fontSize: 12, color: '#555', paddingLeft: 14, marginBottom: 8 },
  infoRow      : { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#161616' },
  infoLbl      : { fontSize: 13, color: '#555' as any },
  infoVal: { fontSize: 13, color: '#888' as any, fontWeight: '500' as '500' },
  version      : { fontSize: 11, color: '#2A2A2A', textAlign: 'center', marginTop: 8 },
  bottomNav    : { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, backgroundColor: '#0D0D0D' },
  navItem      : { flex: 1, alignItems: 'center', gap: 3 },
  navDot       : { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  navDotOn     : { backgroundColor: '#fff' },
  navLbl       : { fontSize: 10, color: '#444' },
  navLblOn     : { color: '#fff' },
});
