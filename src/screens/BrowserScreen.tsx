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
  onNavigate: (screen: string) => void;
}

export default function BrowserScreen({ onNavigate }: Props) {
  const [liveUrl, setLiveUrl] = useState('https://www.google.com');
  const [inputUrl, setInputUrl] = useState('https://www.google.com');
  const [loading, setLoading]       = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [cachedHtml, setCachedHtml] = useState<string | null>(null);
  const [isOffline, setIsOffline]   = useState(false);
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    if ((global as any).pendingUrl) {
      const target = (global as any).pendingUrl;
      (global as any).pendingUrl = null;
      handleGo(target);
    }
  }, []);

  const normalise = (url: string) => {
    let u = url.trim();
    if (!u.startsWith('http')) u = 'https://' + u;
    return u.split('#')[0].replace(/\/$/, '');
  };

  const handleGo = async (target?: string) => {
    const dest = normalise(target || inputUrl);
    setInputUrl(dest);

    // Always check reserve first
    try {
      const cached = await (ReserveStorage as any).get(dest);
      if (cached) {
        console.log('[Browser] Loaded from reserve:', dest);
        setCachedHtml(cached);
        setIsOffline(true);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.log('[Browser] Reserve check error:', e);
    }

    // Not in reserve — go live
    setCachedHtml(null);
    setIsOffline(false);
    setLiveUrl(dest);
  };

  const SKIP_URLS = [
  'google.com',
  'chrome-error://',
  'about:blank',
  'chrome://',
  ];

  const onLoadEnd = async (e: any) => {
    setLoading(false);
    const currentUrl = e.nativeEvent.url;
    setInputUrl(currentUrl);
    if (isOffline) return;
    const shouldSkip = SKIP_URLS.some(skip => currentUrl.includes(skip));
    if (shouldSkip) return;
    if (!PrivacyFilter.isAllowed(currentUrl)) return;
    webViewRef.current?.injectJavaScript(`
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'html', html: document.documentElement.outerHTML, url: window.location.href })
      ); true;
    `);
  };

  const onMessage = async (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'html' && data.html && data.html.length < 5 * 1024 * 1024) {
        const saved = await ReserveStorage.save(data.url, data.html, 'text/html');
        if (saved) {
          setSavedToast(true);
          setTimeout(() => setSavedToast(false), 2000);
        }
      }
    } catch (_) {}
  };

  const onError = async (e: any) => {
    const failedUrl = normalise(e.nativeEvent.url || liveUrl);
    try {
      const cached = await (ReserveStorage as any).get(failedUrl);
      if (cached) {
        setCachedHtml(cached);
        setIsOffline(true);
        setLoading(false);
      }
    } catch (_) {}
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => onNavigate('home')} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <TextInput
          style={s.urlBar}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={() => handleGo()}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          placeholder="Enter URL"
          placeholderTextColor="#444"
        />
        <TouchableOpacity onPress={() => handleGo()} style={s.goBtn}>
          <Text style={s.goText}>Go</Text>
        </TouchableOpacity>
      </View>

      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineBannerText}>Offline — showing saved version</Text>
        </View>
      )}

      {savedToast && (
        <View style={s.toast}>
          <Text style={s.toastText}>Saved to reserve</Text>
        </View>
      )}

      {loading && (
        <View style={s.loadingBar}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={s.loadingText}>Loading...</Text>
        </View>
      )}

      {cachedHtml ? (
        <WebView
          source={{ html: cachedHtml, baseUrl: inputUrl }}
          style={s.webview}
          javaScriptEnabled
          domStorageEnabled
        />
      ) : (
        <WebView
          ref={webViewRef}
          source={liveUrl ? { uri: liveUrl } : { html: '<html><body style="background:#0D0D0D"></body></html>' }}
          style={s.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={onLoadEnd}
          onMessage={onMessage}
          onError={onError}
          javaScriptEnabled
          domStorageEnabled
          onNavigationStateChange={state => setInputUrl(state.url)}
        />
      )}

      <View style={s.quickLinks}>
        <Text style={s.quickLabel}>Quick:</Text>
        {[
          { label: 'Wikipedia', url: 'https://en.wikipedia.org' },
          { label: 'News',      url: 'https://news.google.com'  },
          { label: 'Maps',      url: 'https://maps.google.com'  },
        ].map((item, i) => (
          <TouchableOpacity key={i} onPress={() => handleGo(item.url)} style={s.quickBtn}>
            <Text style={s.quickBtnText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root           : { flex: 1, backgroundColor: '#0D0D0D' },
  header         : { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 10, gap: 8, backgroundColor: '#0D0D0D', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  backBtn        : { padding: 4 },
  backText       : { color: '#555', fontSize: 18 },
  urlBar         : { flex: 1, backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: '#1A1A1A' },
  goBtn          : { padding: 8 },
  goText         : { color: '#888', fontSize: 13 },
  offlineBanner  : { backgroundColor: '#111', paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  offlineBannerText: { color: '#555', fontSize: 11 },
  toast          : { backgroundColor: '#111', paddingVertical: 6, alignItems: 'center' },
  toastText      : { color: '#fff', fontSize: 12 },
  loadingBar     : { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: '#111' },
  loadingText    : { color: '#555', fontSize: 11 },
  webview        : { flex: 1, backgroundColor: '#fff' },
  quickLinks     : { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#1A1A1A', backgroundColor: '#0D0D0D' },
  quickLabel     : { color: '#444', fontSize: 11 },
  quickBtn       : { backgroundColor: '#111', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#1A1A1A' },
  quickBtnText   : { color: '#888', fontSize: 11 },
});
