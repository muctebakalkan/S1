import React,{useRef,useState,useEffect} from 'react';
import {View,Text,Pressable,ActivityIndicator,FlatList,StyleSheet} from 'react-native';
import {router} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MechanicMap from '../../components/MechanicMap';
import {currentGps,type GpsPoint} from '../../lib/location';
import {loadNearbyMechanics,formatMechanicDistance,type NearbyMechanic} from '../../lib/nearbyMechanics';
import {supabase} from '../../lib/supabase';
import {MARKETPLACE_THEME as T} from '../../lib/marketplaceTheme';
export default function NearbyServiceScreen(){
 const insets=useSafeAreaInsets(),generation=useRef(0);
 const [location,setLocation]=useState<GpsPoint|null>(null),[mechanics,setMechanics]=useState<NearbyMechanic[]>([]),[selected,setSelected]=useState<NearbyMechanic|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState<'map'|'list'>('map'),[searched,setSearched]=useState(false);
 useEffect(()=>()=>{generation.current++;},[]);
 const load=async()=>{const turn=++generation.current;setLoading(true);setError('');setSelected(null);
  try{const point=await currentGps();const rows=await loadNearbyMechanics(supabase,point);if(turn!==generation.current)return;setLocation(point);setMechanics(rows);setSearched(true);}
  catch(e:any){if(turn===generation.current)setError(e.message||'Konum alınamadı.');}
  finally{if(turn===generation.current)setLoading(false);}
 };
 const profile=(m:NearbyMechanic)=>router.push({pathname:'/user/mechanic-profile',params:{id:m.user_id}});
 const card=(m:NearbyMechanic)=><View style={s.card}><Text style={s.name}>{m.full_name}</Text><Text style={s.info}>{m.specialty} · {formatMechanicDistance(m.distance_km)}</Text><Text style={s.info}>{m.review_count?`★ ${Number(m.rating).toFixed(1)} (${m.review_count} değerlendirme)`:'Henüz değerlendirme yok'} · {m.is_available?'Müsait':'Şu an müsait değil'}</Text><Text style={s.info}>{[m.district,m.city].filter(Boolean).join(', ')}</Text><Pressable accessibilityRole="button" onPress={()=>profile(m)} style={s.action}><Text style={s.actionText}>Ustaya Git</Text></Pressable></View>;
 return <View style={[s.root,{paddingTop:insets.top,paddingBottom:insets.bottom}]}>
  <View style={s.header}><Pressable onPress={()=>router.back()} accessibilityRole="button" accessibilityLabel="Geri"><Text style={s.back}>‹</Text></Pressable><Text style={s.title}>Yakınımdaki Ustalar</Text></View>
  <View style={s.toolbar}><Pressable onPress={load} disabled={loading} accessibilityRole="button" style={s.locate}>{loading?<ActivityIndicator color={T.primary}/>:<Text style={s.link}>{location?'Konumumu Yenile':'Konumumu Kullan'}</Text>}</Pressable>{(['map','list'] as const).map(m=><Pressable key={m} onPress={()=>setMode(m)} style={[s.tab,mode===m&&s.active]}><Text style={s.link}>{m==='map'?'Harita':'Liste'}</Text></Pressable>)}</View>
  <Text style={s.note}>30 km içindeki onaylı ustalar, kuş uçuşu mesafeye göre sıralanır.</Text>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {!location?<View style={s.empty}><Text style={s.info}>Yakınınızdaki ustaları görmek için konumunuzu kullanın. Konumunuz bu arama için sunucuya gönderilir.</Text></View>:<>
   {searched&&mechanics.length===0&&<Text style={s.note}>30 km içinde kayıtlı ve onaylı usta bulunamadı.</Text>}
   {mode==='map'?<><MechanicMap location={location} mechanics={mechanics} selected={selected} onSelect={setSelected}/>{selected&&card(selected)}</>:<FlatList data={mechanics} keyExtractor={m=>m.user_id} renderItem={({item})=>card(item)} contentContainerStyle={{padding:14,gap:10}}/>}
  </>}
 </View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:T.background},header:{flexDirection:'row',alignItems:'center',paddingHorizontal:18,gap:14,paddingVertical:10},back:{color:T.text,fontSize:35},title:{color:T.text,fontSize:22,fontWeight:'700',flex:1},toolbar:{flexDirection:'row',gap:7,paddingHorizontal:14,paddingVertical:8},locate:{flex:1,padding:10,borderRadius:12,backgroundColor:T.surfaceRaised},tab:{padding:10,borderRadius:12,borderWidth:1,borderColor:T.border},active:{borderColor:T.primary},link:{color:T.primary,fontWeight:'700'},note:{color:T.textMuted,fontSize:12,lineHeight:18,paddingHorizontal:16,paddingBottom:10},empty:{flex:1,justifyContent:'center',padding:28},error:{color:'#FFB5A7',padding:14},card:{backgroundColor:T.surfaceRaised,padding:16,gap:7,borderRadius:14,borderWidth:1,borderColor:T.border},name:{fontSize:19,fontWeight:'700',color:T.text},info:{color:T.textMuted,fontSize:14,lineHeight:21},action:{backgroundColor:T.primary,borderRadius:10,padding:12,alignItems:'center',marginTop:4},actionText:{fontWeight:'700',color:'#111'}});
