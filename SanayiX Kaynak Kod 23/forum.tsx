import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createForumPost,
  FORUM_CATEGORIES, FORUM_GROUPS, FORUM_PAGE_SIZE, forumGroupName,
  ForumCategory,
  ForumPost,
  forumTimeAgo,
  listForumPosts,
  ForumAuthRequiredError,
} from '../../lib/community';
import { MARKETPLACE_RADIUS as R, MARKETPLACE_THEME as T } from '../../lib/marketplaceTheme';
import { MarketplaceBottomNav, OrangeButton, ScreenHeader } from '../../components/MarketplaceUI';

export default function ForumScreen() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [category, setCategory] = useState('Tümü');
  const [group, setGroup] = useState('all');
  const [error, setError] = useState('');
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async (showLoader = false, nextPage = 0) => {
    const id = ++requestId.current;
    if (showLoader) setLoading(true);
    if (nextPage) setLoadingMore(true);
    setError('');
    try {
      const result = await listForumPosts(category, query, group, nextPage);
      if (id !== requestId.current) return;
      setNeedsSignIn(false);
      setPosts(current => nextPage ? [...current, ...result.filter(row => !current.some(old => old.id === row.id))] : result);
      setPage(nextPage); setHasMore(result.length === FORUM_PAGE_SIZE);
    } catch (error) {
      if (id === requestId.current) {
        const signedOut = error instanceof ForumAuthRequiredError;
        setNeedsSignIn(signedOut);
        if (signedOut) setPosts([]);
        setError(signedOut ? error.message : 'Konular yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
      }
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
    }
  }, [category, query, group]);

  useFocusEffect(useCallback(() => {
    // Invalidate the old group's response immediately, before the search delay.
    ++requestId.current; setLoading(true);
    const timer = setTimeout(() => { void load(true); }, query ? 260 : 0);
    return () => { clearTimeout(timer); ++requestId.current; };
  }, [load, query]));

  const featuredCount = useMemo(() => posts.reduce((sum, post) => sum + post.comments_count, 0), [posts]);
  const openCompose = () => needsSignIn ? router.push('/auth/login') : setComposeOpen(true);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.background} />
      <ScreenHeader
        title="Araç Forumu"
        subtitle="Marka grubunu seç, soru sor ve sohbete katıl"
        right={(
          <TouchableOpacity style={s.addHeaderButton} onPress={openCompose}>
            <Ionicons name="add" size={23} color="#111317" />
          </TouchableOpacity>
        )}
      />

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={T.primary} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={s.introCard}>
          <View style={s.introIcon}><Ionicons name="people" size={25} color={T.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.introTitle}>SanayiX Topluluğu</Text>
            <Text style={s.introText}>Aracınla ilgili sorunu paylaş gerçek kullanıcılar ve ustalardan fikir al</Text>
          </View>
          <View style={s.introStat}>
            <Text style={s.introStatValue}>{featuredCount}</Text>
            <Text style={s.introStatLabel}>yanıt</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Marka Grupları</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.categoryScroll} contentContainerStyle={s.categoryContent}>
          {[{ id: 'all', name: 'Tüm Gruplar' }, ...FORUM_GROUPS].map(item => (
            <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: group === item.id }} style={[s.categoryChip, group === item.id && s.categoryChipActive]} onPress={() => setGroup(item.id)}>
              <Text style={[s.categoryText, group === item.id && s.categoryTextActive]}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={[s.introText, { marginVertical: 12 }]}>{group === 'all' ? 'Tüm markalardan sorular ve sohbetler.' : `${forumGroupName(group)} grubundaki sorular ve sohbetler.`}</Text>
        <View style={s.searchBox}>
          <Ionicons name="search" size={19} color={T.textMuted} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Forumda ara"
            placeholderTextColor={T.textMuted}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={T.textMuted} /></TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.categoryScroll} contentContainerStyle={s.categoryContent}>
          {FORUM_CATEGORIES.map((item) => (
            <TouchableOpacity key={item} style={[s.categoryChip, category === item && s.categoryChipActive]} onPress={() => setCategory(item)}>
              <Text style={[s.categoryText, category === item && s.categoryTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>{group === 'all' ? 'Güncel Konular' : `${forumGroupName(group)} Grubu`}</Text>
          <TouchableOpacity onPress={openCompose}><Text style={s.sectionLink}>Konu Aç</Text></TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={T.primary} style={{ marginTop: 36 }} />
        ) : error ? (
          <View style={s.emptyCard}><Text style={s.emptyText}>{error}</Text><TouchableOpacity onPress={() => needsSignIn ? router.push('/auth/login') : load(true)}><Text style={s.sectionLink}>{needsSignIn ? 'Giriş Yap' : 'Tekrar dene'}</Text></TouchableOpacity></View>
        ) : posts.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="chatbubble-ellipses-outline" size={32} color={T.textMuted} />
            <Text style={s.emptyTitle}>Henüz konu yok</Text>
            <Text style={s.emptyText}>İlk konuyu sen aç topluluğu başlat</Text>
          </View>
        ) : posts.map((post) => (
          <ForumPostCard key={post.id} post={post} />
        ))}
        {!loading && !error && hasMore && <TouchableOpacity disabled={loadingMore} onPress={() => load(false, page + 1)}><Text style={s.sectionLink}>{loadingMore ? 'Yükleniyor...' : 'Daha fazla konu'}</Text></TouchableOpacity>}
      </ScrollView>

      <MarketplaceBottomNav role="user" />
      <ComposeModal
        visible={composeOpen}
        initialGroup={group === 'all' ? 'general' : group}
        bottomInset={insets.bottom}
        onClose={() => setComposeOpen(false)}
        onCreated={(post) => {
          setPosts((current) => [post, ...current]);
          setComposeOpen(false);
          router.push({ pathname: '/user/forum-post' as any, params: { id: post.id } });
        }}
      />
    </View>
  );
}

function ForumPostCard({ post }: { post: ForumPost }) {
  const initials = post.author_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR');
  return (
    <TouchableOpacity
      style={s.postCard}
      onPress={() => router.push({ pathname: '/user/forum-post' as any, params: { id: post.id } })}
      activeOpacity={0.84}
    >
      <View style={s.postTop}>
        <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.author}>{post.author_name}</Text>
          <Text style={s.meta}>{forumGroupName(post.brand_group)} · {post.vehicle_label || post.category}  ·  {forumTimeAgo(post.created_at)}</Text>
        </View>
        <View style={s.categoryPill}><Text style={s.categoryPillText}>{post.category}</Text></View>
      </View>
      <Text style={s.postTitle}>{post.title}</Text>
      <Text style={s.postBody} numberOfLines={3}>{post.body}</Text>
      <View style={s.postFooter}>
        <View style={s.metric}><Ionicons name="heart-outline" size={16} color={T.textMuted} /><Text style={s.metricText}>{post.likes_count}</Text></View>
        <View style={s.metric}><Ionicons name="chatbubble-outline" size={15} color={T.textMuted} /><Text style={s.metricText}>{post.comments_count} yanıt</Text></View>
        <View style={{ flex: 1 }} />
        <Text style={s.readText}>Konuyu aç</Text><Ionicons name="chevron-forward" size={15} color={T.primary} />
      </View>
    </TouchableOpacity>
  );
}

function ComposeModal({
  visible,
  initialGroup,
  bottomInset,
  onClose,
  onCreated,
}: {
  visible: boolean;
  initialGroup: string;
  bottomInset: number;
  onClose: () => void;
  onCreated: (post: ForumPost) => void;
}) {
  const [brandGroup, setBrandGroup] = useState(initialGroup);
  const publishLock = useRef(false);
  useEffect(() => { if (visible) setBrandGroup(initialGroup); }, [visible, initialGroup]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [category, setCategory] = useState<ForumCategory>('Soru');
  const [saving, setSaving] = useState(false);

  const publish = async () => {
    if (publishLock.current) return;
    if (title.trim().length < 6 || body.trim().length < 15) {
      return Alert.alert('Biraz daha detay ekleyin', 'Başlık en az 6 açıklama en az 15 karakter olmalı');
    }
    publishLock.current = true;
    setSaving(true);
    try {
      const post = await createForumPost({ title, body, category, vehicleLabel: vehicle, brandGroup });
      setTitle('');
      setBody('');
      setVehicle('');
      setCategory('Soru');
      onCreated(post);
    } catch (error: any) {
      Alert.alert('Konu açılamadı', error?.message || 'Lütfen tekrar deneyin');
    } finally {
      publishLock.current = false;
      setSaving(false);
    }
  };

  const close = () => { if (!publishLock.current) onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={s.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={s.modalShade} onPress={close} disabled={saving} accessibilityRole="button" accessibilityLabel="Konuyu kapat" activeOpacity={1} />
        <View style={[s.modalSheet, { paddingBottom: Math.max(bottomInset, 12) + 12 }]}>
          <View style={s.modalHandle} />
          <View style={s.modalHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.modalTitle}>Yeni Konu</Text>
              <Text style={s.modalSubtitle}>Sorunu veya deneyimini toplulukla paylaş</Text>
            </View>
            <TouchableOpacity style={s.closeButton} onPress={close} disabled={saving} accessibilityRole="button" accessibilityLabel="Konuyu kapat"><Ionicons name="close" size={21} color={T.text} /></TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.modalCategories} contentContainerStyle={s.categoryContent}>
            {FORUM_CATEGORIES.filter((item) => item !== 'Tümü').map((item) => (
              <TouchableOpacity key={item} style={[s.categoryChip, category === item && s.categoryChipActive]} disabled={saving} onPress={() => setCategory(item as ForumCategory)}>
                <Text style={[s.categoryText, category === item && s.categoryTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.inputLabel}>Paylaşılacak grup</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.modalCategories} contentContainerStyle={s.categoryContent}>
            {FORUM_GROUPS.map(item => <TouchableOpacity key={item.id} style={[s.categoryChip, brandGroup === item.id && s.categoryChipActive]} disabled={saving} onPress={() => setBrandGroup(item.id)}><Text style={[s.categoryText, brandGroup === item.id && s.categoryTextActive]}>{item.name}</Text></TouchableOpacity>)}
          </ScrollView>
          <Text style={s.inputLabel}>Başlık</Text>
          <TextInput style={s.modalInput} accessibilityLabel="Konu başlığı" editable={!saving} value={title} onChangeText={setTitle} placeholder="Kısaca ne hakkında" placeholderTextColor={T.textMuted} maxLength={100} />
          <Text style={s.inputLabel}>Araç  isteğe bağlı</Text>
          <TextInput style={s.modalInput} accessibilityLabel="Araç bilgisi" editable={!saving} value={vehicle} onChangeText={setVehicle} placeholder="Örn  Renault Clio 2021" placeholderTextColor={T.textMuted} maxLength={80} />
          <Text style={s.inputLabel}>Açıklama</Text>
          <TextInput
            style={[s.modalInput, s.modalTextarea]}
            accessibilityLabel="Konu açıklaması"
            editable={!saving}
            value={body}
            onChangeText={setBody}
            placeholder="Detayları anlaşılır şekilde yaz"
            placeholderTextColor={T.textMuted}
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />
          <OrangeButton title={saving ? 'Yayınlanıyor' : 'Konuyu Yayınla'} onPress={publish} disabled={saving} icon="send" />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.background },
  content: { paddingHorizontal: 15, paddingBottom: 112 },
  addHeaderButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' },
  introCard: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: T.surface, borderWidth: 1, borderColor: T.borderWarm, borderRadius: R.md, padding: 13, marginBottom: 11 },
  introIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: '#2A1B0D', alignItems: 'center', justifyContent: 'center' },
  introTitle: { color: T.text, fontSize: 13, fontWeight: '900' },
  introText: { color: T.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  introStat: { minWidth: 44, alignItems: 'center' },
  introStatValue: { color: T.primary, fontSize: 19, fontWeight: '900' },
  introStatLabel: { color: T.textMuted, fontSize: 8 },
  searchBox: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border, borderRadius: R.md, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: T.text, fontSize: 12, paddingVertical: 0 },
  categoryScroll: { flexGrow: 0, marginHorizontal: -15, marginTop: 10 },
  categoryContent: { gap: 7, paddingHorizontal: 15 },
  categoryChip: { minHeight: 44, justifyContent: 'center', borderRadius: R.pill, backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border, paddingHorizontal: 13, paddingVertical: 8 },
  categoryChipActive: { backgroundColor: T.primary, borderColor: T.primary },
  categoryText: { color: T.textMuted, fontSize: 10, fontWeight: '700' },
  categoryTextActive: { color: '#111317', fontWeight: '900' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, marginBottom: 9 },
  sectionTitle: { color: T.text, fontSize: 15, fontWeight: '900' },
  sectionLink: { color: T.primary, fontSize: 10, fontWeight: '900' },
  postCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.md, padding: 13, marginBottom: 9 },
  postTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#2A1B0D', borderWidth: 1, borderColor: T.borderWarm, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: T.primary, fontSize: 11, fontWeight: '900' },
  author: { color: T.textSoft, fontSize: 10.5, fontWeight: '800' },
  meta: { color: T.textMuted, fontSize: 8.5, marginTop: 3 },
  categoryPill: { borderRadius: R.pill, backgroundColor: '#2A1B0D', paddingHorizontal: 9, paddingVertical: 5 },
  categoryPillText: { color: T.primary, fontSize: 8.5, fontWeight: '800' },
  postTitle: { color: T.text, fontSize: 14, fontWeight: '900', lineHeight: 19, marginTop: 12 },
  postBody: { color: T.textSoft, fontSize: 10.5, lineHeight: 16, marginTop: 6 },
  postFooter: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: T.border, marginTop: 11, paddingTop: 9 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 9 },
  metricText: { color: T.textMuted, fontSize: 9 },
  readText: { color: T.primary, fontSize: 9, fontWeight: '800' },
  emptyCard: { alignItems: 'center', justifyContent: 'center', backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: R.md, paddingVertical: 42 },
  emptyTitle: { color: T.text, fontSize: 13, fontWeight: '900', marginTop: 10 },
  emptyText: { color: T.textMuted, fontSize: 10, marginTop: 4 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  modalSheet: { maxHeight: '90%', backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: T.border, paddingHorizontal: 16, paddingTop: 8 },
  modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 13 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  modalTitle: { color: T.text, fontSize: 18, fontWeight: '900' },
  modalSubtitle: { color: T.textMuted, fontSize: 9.5, marginTop: 3 },
  closeButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: T.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  modalCategories: { flexGrow: 0, marginHorizontal: -16, marginBottom: 14 },
  inputLabel: { color: T.textSoft, fontSize: 10, fontWeight: '800', marginBottom: 6 },
  modalInput: { height: 44, color: T.text, fontSize: 12, backgroundColor: T.surfaceRaised, borderWidth: 1, borderColor: T.border, borderRadius: R.sm, paddingHorizontal: 12, marginBottom: 11 },
  modalTextarea: { minHeight: 105, height: 105, paddingTop: 11 },
});
