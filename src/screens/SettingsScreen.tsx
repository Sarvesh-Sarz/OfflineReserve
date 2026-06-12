/**
 * SettingsScreen.tsx — clean, simple design
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';

interface Props {
  onNavigate   : (screen: string) => void;
  onSizeChange : (mb: number) => void;
  reserveStats : any;
}

export default function SettingsScreen({ onNavigate, onSizeChange, reserveStats }: Props) {
  const [selectedSize, setSelectedSize] = useState(2048);

  const sizes = [
    { label: '1 GB', value: 1024 },
    { label: '2 GB', value: 2048 },
    { label: '5 GB', value: 5120 },
  ];

  const privacy = [
    'Data never leaves your device',
    'We never see what you save',
    'Chats and passwords are blocked',
    'Incognito sessions are ignored',
    'Delete everything anytime',
  ];

  return (
    <View style={styles.root}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('home')}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Reserve size */}
      <Text style={styles.sectionLabel}>Reserve size</Text>
      <Text style={styles.sectionSub}>
        How much storage to keep reserved.{'\n'}
        Filled only from WiFi or pages you already visited.
      </Text>
      <View style={styles.sizeRow}>
        {sizes.map(s => (
          <TouchableOpacity
            key={s.value}
            style={[styles.sizeBtn, selectedSize === s.value && styles.sizeBtnOn]}
            onPress={() => { setSelectedSize(s.value); onSizeChange(s.value); }}
          >
            <Text style={[styles.sizeBtnText, selectedSize === s.value && styles.sizeBtnTextOn]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Privacy */}
      <Text style={styles.sectionLabel}>Privacy</Text>
      <View style={styles.privacyList}>
        {privacy.map((p, i) => (
          <Text key={i} style={styles.privacyItem}>{p}</Text>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Dead zone map */}
      <Text style={styles.sectionLabel}>Dead zone map</Text>
      <Text style={styles.sectionSub}>
        Signal loss location is anonymously logged{'\n'}
        to improve predictions for everyone.
      </Text>
      <View style={styles.infoList}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLbl}>Zones loaded</Text>
          <Text style={styles.infoVal}>57 zones</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLbl}>Coverage</Text>
          <Text style={styles.infoVal}>South India</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLbl}>Reserve used</Text>
          <Text style={styles.infoVal}>
            {reserveStats ? `${reserveStats.usedMB} / ${reserveStats.totalMB} MB` : '— MB'}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />
      <Text style={styles.version}>v0.1.0 — beta</Text>

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <NavItem label="Home"     onPress={() => onNavigate('home')} />
        <NavItem label="Reserve"  onPress={() => onNavigate('reserve')} />
        <NavItem label="Settings" active />
      </View>
    </View>
  );
}

function NavItem({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.navDot, active && styles.navDotOn]} />
      <Text style={[styles.navLbl, active && styles.navLblOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root          : { flex: 1, backgroundColor: '#0D0D0D', paddingTop: Platform.OS === 'ios' ? 56 : 36 },
  header        : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 28 },
  backBtn       : { fontSize: 13, color: '#555' },
  pageTitle     : { fontSize: 14, fontWeight: '500', color: '#fff' },
  sectionLabel  : { fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingHorizontal: 20 },
  sectionSub    : { fontSize: 12, color: '#444', lineHeight: 18, marginBottom: 14, paddingHorizontal: 20 },
  sizeRow       : { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 4 },
  sizeBtn       : { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#1A1A1A' },
  sizeBtnOn     : { borderColor: '#555' },
  sizeBtnText   : { fontSize: 12, color: '#555', fontWeight: '500' },
  sizeBtnTextOn : { color: '#ccc' },
  divider       : { height: 1, backgroundColor: '#1A1A1A', marginVertical: 20, marginHorizontal: 20 },
  privacyList   : { paddingHorizontal: 20, gap: 8 },
  privacyItem   : { fontSize: 12, color: '#555', paddingLeft: 14 },
  infoList      : { paddingHorizontal: 20 },
  infoRow       : { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#161616' },
  infoLbl       : { fontSize: 13, color: '#555' },
  infoVal       : { fontSize: 13, color: '#888', fontWeight: '500' },
  version       : { fontSize: 11, color: '#2A2A2A', textAlign: 'center', paddingHorizontal: 20 },
  bottomNav     : { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, backgroundColor: '#0D0D0D', marginTop: 'auto' },
  navItem       : { flex: 1, alignItems: 'center', gap: 3 },
  navDot        : { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  navDotOn      : { backgroundColor: '#fff' },
  navLbl        : { fontSize: 10, color: '#444' },
  navLblOn      : { color: '#fff' },
});
