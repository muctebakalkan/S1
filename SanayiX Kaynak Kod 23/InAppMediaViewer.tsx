/**
 * InAppMediaViewer — Uygulama içi video / rehber görüntüleyici
 * ------------------------------------------------------------
 * YouTube videolarını (embed player ile) ve montaj rehberi sayfalarını
 * kullanıcı uygulamadan çıkmadan, tam ekran bir modal içinde gösterir.
 *
 * Çökme / hata korumaları:
 *  - react-native-webview dinamik require edilir; native modül yoksa
 *    (eski build) tarayıcıya yönlendiren zarif bir fallback gösterilir.
 *  - YouTube linkleri youtube-nocookie embed'e çevrilir (watch sayfasının
 *    uygulama açma / yönlendirme davranışları elenir).
 *  - intent://, vnd.youtube:// gibi uygulama dışına çıkaran şemalar bloklanır.
 *  - onError / onHttpError / renderError yakalanır; kullanıcıya "Tekrar Dene"
 *    ve "Tarayıcıda Aç" seçenekleri sunulur, uygulama asla çökmez.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator,
  Platform, Linking,
} from 'react-native';

function loadWebView(): any {
  try { return require('react-native-webview').WebView; } catch { return null; }
}

/** Her tür YouTube URL'inden video ID çıkarır; bulunamazsa null. */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)([\w-]{11})/,
    /youtube-nocookie\.com\/embed\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** İzlenecek URL'i uygulama içinde güvenle oynayacak forma çevirir. */
function toPlayableUrl(url: string): string {
  const id = extractYouTubeId(url);
  if (id) {
    // nocookie embed: reklam yönlendirmeleri ve "uygulamada aç" istekleri azalır
    return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&fs=1`;
  }
  // YouTube arama / kanal / normal web sayfası → mobil web olarak göster
  return url;
}

/** Uygulama dışına çıkarabilecek şemaları blokla (crash/kaçış önlemi). */
function isSafeRequest(reqUrl: string): boolean {
  return /^https?:\/\//i.test(reqUrl) || reqUrl === 'about:blank';
}

export interface InAppMediaViewerProps {
  visible: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
}

export default function InAppMediaViewer({ visible, url, title, onClose }: InAppMediaViewerProps) {
  const WebView = useMemo(loadWebView, []);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const playable = url ? toPlayableUrl(url) : null;

  const openExternal = async () => {
    if (!url) return;
    try { await Linking.openURL(url); } catch { /* sessiz */ }
  };

  const retry = () => { setFailed(false); setReloadKey((k) => k + 1); };

  const handleClose = () => { setFailed(false); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} presentationStyle="fullScreen">
      <View style={st.container}>
        {/* Üst bar */}
        <View style={st.topBar}>
          <TouchableOpacity onPress={handleClose} style={st.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={st.closeTxt}>✕ Kapat</Text>
          </TouchableOpacity>
          <Text style={st.title} numberOfLines={1}>{title ?? 'Video'}</Text>
          <View style={{ width: 70 }} />
        </View>

        {/* İçerik */}
        {!playable || !WebView || failed ? (
          <View style={st.fallback}>
            <Text style={st.fallbackIcon}>📺</Text>
            <Text style={st.fallbackTitle}>
              {!playable ? 'İçerik bulunamadı' : !WebView ? 'Oynatıcı bu sürümde desteklenmiyor' : 'Video yüklenemedi'}
            </Text>
            <Text style={st.fallbackSub}>
              {!playable
                ? 'Bu içerik için bağlantı tanımlı değil.'
                : 'İnternet bağlantınızı kontrol edip tekrar deneyin veya videoyu tarayıcıda açın.'}
            </Text>
            {playable && WebView && (
              <TouchableOpacity style={st.retryBtn} onPress={retry}>
                <Text style={st.retryTxt}>Tekrar Dene</Text>
              </TouchableOpacity>
            )}
            {playable && (
              <TouchableOpacity style={st.externalBtn} onPress={openExternal}>
                <Text style={st.externalTxt}>Tarayıcıda Aç</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <WebView
            key={reloadKey}
            source={{ uri: playable }}
            style={st.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={st.loading}><ActivityIndicator color="#FBB040" size="large" /></View>
            )}
            onError={() => setFailed(true)}
            onHttpError={(e: any) => { if ((e?.nativeEvent?.statusCode ?? 0) >= 400) setFailed(true); }}
            renderError={() => (
              <View style={st.loading}><Text style={st.fallbackSub}>Yüklenemedi.</Text></View>
            )}
            onShouldStartLoadWithRequest={(req: any) => isSafeRequest(req?.url ?? '')}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            androidLayerType="hardware"
          />
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 36, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#0F172A',
  },
  closeBtn: { width: 70 },
  closeTxt: { color: '#FBB040', fontSize: 15, fontWeight: '700' },
  title: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  webview: { flex: 1, backgroundColor: '#000' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  fallbackIcon: { fontSize: 48, marginBottom: 14 },
  fallbackTitle: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  fallbackSub: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 22 },
  retryBtn: { backgroundColor: '#FBB040', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 40, marginBottom: 12 },
  retryTxt: { color: '#0F172A', fontWeight: '800', fontSize: 15 },
  externalBtn: { borderWidth: 1.5, borderColor: '#334155', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 },
  externalTxt: { color: '#CBD5E1', fontWeight: '700', fontSize: 14 },
});
