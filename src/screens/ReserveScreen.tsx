/**
 * ReserveScreen.tsx — clean, simple design
 */
declare const global: any;
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, Platform,
} from 'react-native';
import ReserveStorage from '../storage/ReserveStorage';

interface Props {
  onNavigate : (screen: string) => void;
  onClear    : () => void;
}



export default function ReserveScreen({ onNavigate, onClear }: Props) {
  const [stats,   setStats]   = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    const storage = ReserveStorage as any;
    const s = storage.getStats();
    setStats(s);
    const raw = storage.meta?.entries || {};
    const list = Object.entries(raw).map(([url, data]: [string, any]) => ({
      url,
      ...data,
    }));
    list.sort((a: any, b: any) => b.cachedAt - a.cachedAt);
    setEntries(list);
  };

  useEffect(() => {
    const timer = setInterval(loadData, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleClearAll = () => {
    Alert.alert('Clear all', 'Delete all saved content?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        try {
          await ReserveStorage.clear();
          loadData();
        } catch (e) {
          console.log('Clear error:', e);
        }
      }},
    ]);
  };

  const handleDelete = async (url: string) => {
    await ReserveStorage.delete(url);
    loadData();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 60)  return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <View style={styles.root}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onNavigate('home')}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Saved content</Text>
        <TouchableOpacity onPress={async () => {
          await ReserveStorage.clear();
          loadData();
        }}>
          <Text style={{ color: '#5A2020', fontSize: 13 }}>Clear all</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {stats && (
        <>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statN}>{stats.usedMB} MB</Text>
              <Text style={styles.statL}>used</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statN}>{stats.entryCount}</Text>
              <Text style={styles.statL}>items</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statN}>{stats.usedPercent}%</Text>
              <Text style={styles.statL}>full</Text>
            </View>
          </View>
          <View style={styles.progBar}>
            <View style={[styles.progFill, { width: (Math.min(stats.usedPercent, 100) + '%') as any }]} />
          </View>
        </>
      )}

      {/* List */}
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptySub}>
            Content will appear here automatically{'\n'}as you browse and travel.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.url}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: any }) => (
            <View style={styles.entryRow}>
              <View style={styles.entryInfo}>
                <Text style={styles.entryUrl} numberOfLines={1}>
                  {item.url.replace(/https?:\/\//, '')}
                </Text>
                <Text style={styles.entryMeta}>
                  {formatSize(item.sizeBytes)} · {formatTime(item.cachedAt)} · {item.hitCount} reads
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item.url)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.delBtn}>remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {entries.map((item: any, i: number) => (
        <View key={i} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#161616' }}>
          <TouchableOpacity
            onPress={() => {
              (global as any).pendingUrl = item.url;
              onNavigate('browser');
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 2 }} numberOfLines={1}>
              {item.url?.replace(/https?:\/\//, '') || 'Unknown'}
            </Text>
            <Text style={{ color: '#3A3A3A', fontSize: 10, marginBottom: 6 }}>
              {formatSize(item.sizeBytes)} · {item.hitCount || 0} reads
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await ReserveStorage.delete(item.url);
              loadData();
            }}
          >
            <Text style={{ color: '#442222', fontSize: 11 }}>remove</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Clear link */}
      <View style={styles.clearWrap}>
        <TouchableOpacity onPress={handleClearAll}>
          <Text style={styles.clearLink}>Clear all saved content</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <NavItem label="Home"    onPress={() => onNavigate('home')} />
        <NavItem label="Reserve" active />
        <NavItem label="Settings" onPress={() => onNavigate('settings')} />
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
  root      : { flex: 1, backgroundColor: '#0D0D0D', paddingTop: Platform.OS === 'ios' ? 56 : 36 },
  header    : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  backBtn   : { fontSize: 13, color: '#555' },
  pageTitle : { fontSize: 14, fontWeight: '500', color: '#fff' },
  statRow   : { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 10 },
  statBox   : { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 10 },
  statN     : { fontSize: 16, fontWeight: '500', color: '#fff' },
  statL     : { fontSize: 10, color: '#444', marginTop: 2 },
  progBar   : { height: 2, backgroundColor: '#1A1A1A', marginHorizontal: 20, marginBottom: 20, borderRadius: 1 },
  progFill  : { height: 2, backgroundColor: '#fff', borderRadius: 1 },
  empty     : { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '500', marginBottom: 8 },
  emptySub  : { color: '#444', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  list      : { paddingHorizontal: 20 },
  entryRow  : { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#161616' },
  entryInfo : { flex: 1 },
  entryUrl  : { fontSize: 12, color: '#888', marginBottom: 2 },
  entryMeta : { fontSize: 10, color: '#3A3A3A' },
  delBtn    : { fontSize: 11, color: '#333', paddingLeft: 10 },
  clearWrap : { padding: 20, paddingTop: 16 },
  clearLink : { fontSize: 13, color: '#5A2020' },
  bottomNav : { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1A1A1A', paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, backgroundColor: '#0D0D0D' },
  navItem   : { flex: 1, alignItems: 'center', gap: 3 },
  navDot    : { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  navDotOn  : { backgroundColor: '#fff' },
  navLbl    : { fontSize: 10, color: '#444' },
  navLblOn  : { color: '#fff' },
});
