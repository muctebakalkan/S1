import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { MARKETPLACE_THEME as T, MARKETPLACE_RADIUS as R } from '../lib/marketplaceTheme';
import { loadMarketplaceVehicleFitments, selectVehicleFilter, SavedFilterVehicle, VehicleFilterField, VehicleFilters, VehicleFitment } from '../lib/marketplaceVehicles';

import { appendCatalogPage, CatalogItem, selectedCatalogItemId } from '../lib/vehicleCatalog';
import { loadVehicleFilterChoices } from '../lib/vehicleFilterChoices';
import { vehicleNameKey } from '../supabase/functions/_shared/vehicleNames';

const fields: VehicleFilterField[] = ['brand', 'model', 'year', 'engine'];
const labels = { brand: 'Marka', model: 'Model', year: 'Yıl', engine: 'Motor / Varyant' };
const fuelLabels: Record<string,string> = {Petrol:'Benzin',Diesel:'Dizel',Electric:'Elektrik',Hybrid:'Hibrit',PlugInHybrid:'Şarj edilebilir hibrit',Lpg:'LPG'};
const gearLabels: Record<string,string> = {Manual:'Manuel',Automatic:'Otomatik',Cvt:'CVT',Dct:'Çift kavrama',SemiAutomatic:'Yarı otomatik'};
const allLabels = { brand: 'Tüm markalar', model: 'Tüm modeller', year: 'Tüm yıllar', engine: 'Tüm motorlar' };

export default function MarketplaceVehicleFilters({ selection, onChange, savedVehicle, includeListings = true, purpose = 'filter' }: {
  selection: VehicleFilters; onChange: (value: VehicleFilters) => void; savedVehicle?: SavedFilterVehicle | null; includeListings?: boolean; purpose?: 'filter' | 'vehicle';
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [openField, setOpenField] = useState<VehicleFilterField | null>(null);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const generation = useRef(0);
  const ids = useRef<Partial<Record<VehicleFilterField, CatalogItem>>>({});
  const fitments = useRef<Promise<VehicleFitment[]> | null>(null);
  useEffect(() => {
    const current = ++generation.current;
    if (!openField) return;
    setLoading(true); setError('');
    if (!offset) { setItems([]); setNextOffset(null); }
    const timer = setTimeout(async () => {
      try {
        if (!fitments.current) {
          fitments.current = includeListings ? loadMarketplaceVehicleFitments(supabase) : Promise.resolve([]);
        }
        const page = await loadVehicleFilterChoices(supabase, { field: openField, selection, saved: savedVehicle,
          search, offset, fitments: fitments.current ?? Promise.resolve([]), brand: ids.current.brand, model: ids.current.model,
          isCurrent: () => current === generation.current });
        if (current !== generation.current) return;
        setItems(previous => { const merged = appendCatalogPage(offset ? previous : [], page.items); return openField === 'year' ? merged.sort((a,b) => Number(b.name)-Number(a.name)) : merged; });
        setNextOffset(page.nextOffset); setError(page.error);
      } catch (reason) {
        if (current === generation.current) setError(reason instanceof Error ? reason.message : 'Araç kataloğu yüklenemedi.');
      } finally { if (current === generation.current) setLoading(false); }
    }, 350);
    return () => { clearTimeout(timer); generation.current++; };
  }, [openField, selection.brand, selection.model, selection.year, selection.engine, offset, attempt, savedVehicle?.brand, savedVehicle?.model, savedVehicle?.year, savedVehicle?.engine, search, includeListings]);
  const close = () => { generation.current++; setOpenField(null); setSearch(''); setLoading(false); };
  const choose = (item?: CatalogItem) => {
    if (openField) {
      if (openField === 'brand') ids.current = { brand: item };
      if (openField === 'model') ids.current = { brand: ids.current.brand, model: item };
      if (openField === 'year') { ids.current.year = item; ids.current.engine = undefined; }
      if (openField === 'engine') ids.current.engine = item;
      onChange(selectVehicleFilter(selection, openField, item?.name ?? ''));
    }
    close();
  };
  const shownOptions = items.filter(item => openField === 'brand' || openField === 'model' || vehicleNameKey(item.name).includes(vehicleNameKey(search)));
  const checkedId = openField ? selectedCatalogItemId(shownOptions, selection[openField], ids.current[openField]) : undefined;
  return <View style={s.fields}>
    {fields.map(field => {
      const requiresBrand = field !== 'brand' && !selection.brand;
      const requiresModel = (field === 'year' || field === 'engine') && !selection.model;
      const disabled = requiresBrand || requiresModel;
      const placeholder = requiresBrand ? 'Önce marka seçin' : requiresModel ? 'Önce model seçin' : `${labels[field]} seçin`;
      return <Pressable key={field} accessibilityRole="button" accessibilityLabel={`${labels[field]}: ${selection[field] || placeholder}`}
        accessibilityState={{ disabled, expanded: openField === field }} disabled={disabled}
        style={({ pressed }) => [s.field, disabled && s.disabled, pressed && s.pressed]}
        onPress={() => { fitments.current = null; setSearch(''); setOffset(0); setItems([]); setError(''); setLoading(true); setOpenField(field); }}>
        <View style={s.fieldText}>
          {!!selection[field] && <Text style={s.caption}>{labels[field]}</Text>}
          <Text style={[s.value, !selection[field] && s.muted]}>{selection[field] || placeholder}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={disabled ? T.textMuted : T.primary} />
      </Pressable>;
    })}
    <Text style={s.hint}>{purpose === 'vehicle' ? 'Marka, model ve yıl seçin. Motor/varyant alanı isteğe bağlıdır.' : 'Aracınızı listeden seçin. Yıl ve motor/varyant seçmeden de arama yapabilirsiniz.'}</Text>
    {!!selection.engine && <Text style={s.hint}>Motor seçiminin model yılıyla uyumu doğrulanmamıştır.</Text>}
    <Modal visible={openField !== null} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Seçim penceresini kapat" accessibilityRole="button" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16), marginTop: insets.top + 12 }]} accessibilityViewIsModal>
          <View style={s.header}>
            <Text accessibilityRole="header" style={s.title}>{openField ? `${labels[openField]} seçin` : ''}</Text>
            <Pressable style={s.close} onPress={close} accessibilityRole="button" accessibilityLabel="Kapat"><Ionicons name="close" size={25} color={T.text} /></Pressable>
          </View>
          {openField === 'brand' && <Text style={s.hint}>Aracınızın markasını listeden seçin.</Text>}
          {openField === 'model' && <Text style={s.hint}>Aracınızın modelini seçin. Kasa bilgisi varsa motor seçeneklerinde ayrıca gösterilir.</Text>}
          {openField === 'year' && <Text style={s.hint}>Ruhsatınızdaki model yılını seçin. Bu liste, modelin üretildiği yılları doğrulamaz.</Text>}
          {openField === 'engine' && <Text style={s.hint}>Seçtiğiniz modelin motorları listelenir. Yıl eşleştirmesi bulunmadığı için ruhsatınızdaki motoru seçin.</Text>}
          <View style={s.searchBox}><Ionicons name="search" size={18} color={T.textMuted} /><TextInput value={search} onChangeText={value => { setSearch(value); setOffset(0); }} style={s.searchInput}
            placeholder="Listede ara" placeholderTextColor={T.textMuted} accessibilityLabel="Araç seçeneklerinde ara" autoCorrect={false} autoCapitalize="none" /></View>
          {openField && <Pressable style={s.option} onPress={() => choose()} accessibilityRole="radio" aria-checked={!selection[openField]} accessibilityState={{ checked: !selection[openField] }}>
            <Text style={[s.optionText, !selection[openField] && s.selected]}>{purpose === 'vehicle' ? 'Seçimi temizle' : allLabels[openField]}</Text>
            {!selection[openField] && <Ionicons name="checkmark" size={21} color={T.primary} />}
          </Pressable>}
          <FlatList data={shownOptions} keyExtractor={item => String(item.id)} keyboardShouldPersistTaps="handled" style={s.list}
            renderItem={({ item }) => <Pressable style={({ pressed }) => [s.option, pressed && s.pressed]} onPress={() => choose(item)} accessibilityRole="radio" aria-checked={checkedId === item.id} accessibilityState={{ checked: checkedId === item.id }}>
              <View style={{flex:1}}><Text style={[s.optionText, checkedId === item.id && s.selected]}>{item.name}</Text>{item.yearFrom !== undefined && <Text style={s.hint}>{item.yearFrom ?? "Yıl bilinmiyor"} – {item.yearTo ?? "bitiş yılı belirtilmemiş"} · {(item.fuelType && (fuelLabels[item.fuelType] || item.fuelType)) || "Yakıt belirtilmemiş"} · {(item.gearboxType && (gearLabels[item.gearboxType] || item.gearboxType)) || "Vites belirtilmemiş"}</Text>}</View>
              {checkedId === item.id && <Ionicons name="checkmark" size={21} color={T.primary} />}
            </Pressable>}
            ListEmptyComponent={!loading && !error ? <View style={s.empty}><Text style={s.emptyText}>{openField === 'engine' ? 'Bu seçim için motor/varyant kaydı yok. Motor seçmeden devam edebilirsiniz.' : search.trim() ? 'Eşleşen seçenek bulunamadı.' : 'Bu seçim için katalogda kayıt bulunamadı.'}</Text></View> : null}
            ListFooterComponent={<View style={s.empty}>
              {loading && <><ActivityIndicator color={T.primary} />{openField === 'engine' && <Text style={s.hint}>Motor seçenekleri yükleniyor…</Text>}</>}
              {!!error && <><Text accessibilityRole="alert" style={s.emptyText}>{error}</Text><Pressable onPress={() => { fitments.current = null; setAttempt(value => value + 1); }} style={s.retry} accessibilityRole="button"><Text style={s.action}>Tekrar dene</Text></Pressable></>}
              {!loading && <>
                <Text style={s.hint}>{items.length} seçenek yüklendi</Text>
                {nextOffset !== null && <Pressable onPress={() => setOffset(nextOffset)} style={s.retry} accessibilityRole="button"><Text style={s.action}>Daha fazla göster</Text></Pressable>}
              </>}
            </View>} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  fields: { gap: 8 }, field: { minHeight: 52, paddingVertical: 10, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: T.border, borderRadius: R.sm, backgroundColor: T.surfaceRaised },
  fieldText: { flex: 1 }, caption: { color: T.textMuted, fontSize: 10, marginBottom: 3 }, value: { color: T.text, fontSize: 14 }, muted: { color: T.textMuted }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.7 },
  hint: { color: T.textMuted, fontSize: 11, lineHeight: 16 }, status: { flexDirection: 'row', alignItems: 'center', gap: 8 }, action: { color: T.primary, fontSize: 13, fontWeight: '700' }, retry: { paddingVertical: 12, paddingHorizontal: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { height: '80%', maxHeight: 650, width: '100%', maxWidth: 600, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: T.surfaceRaised, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }, title: { flex: 1, fontSize: 20, color: T.text, fontWeight: '700' }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: T.border, borderRadius: R.sm, backgroundColor: T.background, marginBottom: 8 }, searchInput: { flex: 1, color: T.text, fontSize: 15, paddingVertical: 12 },
  list: { flex: 1 }, option: { minHeight: 52, paddingVertical: 15, paddingHorizontal: 4, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border }, optionText: { flex: 1, color: T.text, fontSize: 16 }, selected: { color: T.primary, fontWeight: '700' }, empty: { paddingVertical: 24, alignItems: 'center' }, emptyText: { color: T.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
