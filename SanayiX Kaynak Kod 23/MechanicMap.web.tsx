import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Linking, Pressable } from 'react-native';
import type * as MapLibre from 'maplibre-gl';
import { OSM_COPYRIGHT, OSM_MAP_STYLE } from '../lib/mapStyle';
import { loadMapLibreWeb } from '../lib/mapLibreWeb';
import type { MechanicMapProps } from './MechanicMap';

type ActiveMap = { map: MapLibre.Map; api: typeof MapLibre };

export default function MechanicMap({ location, mechanics, selected, onSelect }: MechanicMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const initialLocation = useRef(location);
  initialLocation.current = location;
  const select = useRef(onSelect);
  select.current = onSelect;
  const [active, setActive] = useState<ActiveMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let ownedMap: MapLibre.Map | undefined;
    setActive(null);
    setFailed(false);
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/maplibre-gl.css';
    document.head.appendChild(style);
    void loadMapLibreWeb().then(api => {
      if (cancelled || !host.current) return;
      const point = initialLocation.current;
      const map = new api.Map({ container: host.current, style: OSM_MAP_STYLE,
        center: [point.longitude, point.latitude], zoom: 12, maxZoom: 19, attributionControl: false });
      ownedMap = map;
      map.on('error', () => { if (!cancelled) setFailed(true); });
      map.on('load', () => { if (!cancelled) setFailed(false); });
      map.addControl(new api.NavigationControl(), 'top-right');
      setActive({ map, api });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; ownedMap?.remove(); style.remove(); };
  }, [attempt]);

  // Update the existing map after GPS refresh; do not replace it underneath marker effects.
  useEffect(() => {
    if (!active) return;
    const marker = new active.api.Marker({ color: '#147DDB' })
      .setLngLat([location.longitude, location.latitude]).addTo(active.map);
    return () => { marker.remove(); };
  }, [active, location.latitude, location.longitude]);

  useEffect(() => {
    if (!active) return;
    const markers = mechanics.map(mechanic => {
      const el = document.createElement('button');
      el.textContent = '🔧';
      el.ariaLabel = mechanic.full_name;
      el.setAttribute('aria-pressed', String(selected?.user_id === mechanic.user_id));
      Object.assign(el.style, { background: selected?.user_id === mechanic.user_id ? '#fff' : '#FF9D00',
        border: '2px solid #FF9D00', borderRadius: '50%', width: '38px', height: '38px', cursor: 'pointer' });
      el.onclick = () => select.current(mechanic);
      return new active.api.Marker({ element: el }).setLngLat([mechanic.longitude, mechanic.latitude]).addTo(active.map);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [active, mechanics, selected?.user_id]);

  useEffect(() => {
    active?.map.easeTo({ center: [selected?.longitude ?? location.longitude, selected?.latitude ?? location.latitude],
      zoom: selected ? 14 : 12, duration: 350 });
  }, [active, location.latitude, location.longitude, selected?.latitude, selected?.longitude]);

  return <View style={{ flex: 1 }}>
    <div ref={host} style={{ height: '100%', width: '100%', position: 'absolute' }} />
    {failed && <View style={{ padding: 12, backgroundColor: '#fff' }}>
      <Text accessibilityRole="alert" style={{ color: '#111' }}>Harita yüklenemedi. Ustaları Liste bölümünden görebilirsiniz.</Text>
      <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ paddingVertical: 10 }}>
        <Text style={{ color: '#835000', fontWeight: '700' }}>Haritayı tekrar yükle</Text>
      </Pressable>
    </View>}
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(OSM_COPYRIGHT)} style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#fff', padding: 5 }}>
      <Text style={{ color: '#222', fontSize: 11 }}>© OpenStreetMap contributors</Text>
    </Pressable>
  </View>;
}
