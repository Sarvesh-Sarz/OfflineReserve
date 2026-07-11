declare const global: any;
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import ReserveStorage from '../storage/ReserveStorage';
import PrivacyFilter from '../engine/PrivacyFilter';

interface Props {
  onNavigate : (screen: string) => void;
}

export default function BrowserScreen({ onNavigate }: Props) {
  const [url, setUrl]           = useState('https://www.google.com');
  const [inputUrl, setInputUrl] = useState('https://www.google.com');
  const [loading, setLoading]   = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [pageTitle, setPageTitle]   = useState('');
  const webViewRef = useRef<any>(null);

  const go = (target?: string) => {
    let dest = target || inputUrl;
    if (!dest.startsWith('http')) dest = 'https://' + dest;
    setUrl(dest);
    setInputUrl(dest);
  };

  const onLoadEnd = async (e: any) => {
    setLoading(false);
    const currentUrl = e.nativeEvent.url;
    const title      = e.nativeEvent.title || currentUrl;
    setPageTitle(title);
    setInputUrl(currentUrl);

    // Privacy check
    if (!PrivacyFilter.isAllowed(currentUrl)) return;

    // Inject JS to grab page HTML
    webViewRef.current?.injectJavaScript(`
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'html', html: document.documentElement.outerHTML, url: window.location.href })
      );
      true;
    `);
  };

  const onMessage = async (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'html' && data.html) {
        const saved = await ReserveStorage.save(data.url, data.html, 'text/html');
        if (saved) {
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 2000);
        }
      }
    } catch (_) {}
  };

  return (
    <View style={s.root}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => onNavigate('home')} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>

        <TextInput
          style={s.urlBar}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={() => go()}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          placeholder="Enter URL"
          placeholderTextColor="#444"
        />

        <TouchableOpacity onPress={() => go()} style={s.goBtn}>
          <Text style={s.goText}>Go</Text>
        </TouchableOpacity>
      </View>

      {/* Saved toast */}
      {savedToast && (
        <View style={s.toast}>
          <Text style={s.toastText}>Saved to reserve</Text>
        </View>
      )}

      {/* Loading bar */}
      {loading && (
        <View style={s.loadingBar}>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={s.loadingText}>Loading...</Text>
        </View>
      )}

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={s.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        onNavigationStateChange={state => setInputUrl(state.url)}
      />

      {/* Quick links */}
      <View style={s.quickLinks}>
        <Text style={s.quickLabel}>Quick:</Text>
        {[
          { label: 'Wikipedia', url: 'https://en.wikipedia.org' },
          { label: 'News',      url: 'https://news.google.com' },
          { label: 'Maps',      url: 'https://maps.google.com' },
        ].map((item, i) => (
          <TouchableOpacity key={i} onPress={() => go(item.url)} style={s.quickBtn}>
            <Text style={s.quickBtnText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  root        : { flex: 1, backgroundColor: '#0D0D0D' },
  header      : { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 10, gap: 8, backgroundColor: '#0D0D0D', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  backBtn     : { padding: 4 },
  backText    : { color: '#555', fontSize: 18 },
  urlBar      : { flex: 1, backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: '#1A1A1A' },
  goBtn       : { padding: 8 },
  goText      : { color: '#888', fontSize: 13 },
  toast       : { backgroundColor: '#1A1A1A', paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  toastText   : { color: '#fff', fontSize: 12 },
  loadingBar  : { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: '#111' },
  loadingText : { color: '#555', fontSize: 11 },
  webview     : { flex: 1, backgroundColor: '#fff' },
  quickLinks  : { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#1A1A1A', backgroundColor: '#0D0D0D' },
  quickLabel  : { color: '#444', fontSize: 11 },
  quickBtn    : { backgroundColor: '#111', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#1A1A1A' },
  quickBtnText: { color: '#888', fontSize: 11 },
});
