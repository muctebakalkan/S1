# FleetByte ve Google bağımsız konum sistemi — 21 Eylül 2026

## Mimari ve yayın

Mobil uygulama `fleet-vehicle-catalog` Supabase Edge Function'ını çağırır; FleetByte'a doğrudan istek göndermez. Fonksiyon mevcut SanayiX projesinde yayınlandı. `20260921_fleetbyte_maplibre.sql` aynı projede uygulandı. Eski APK'ları bozmamak için eski `vehicle-catalog` ve `google-places-proxy` fonksiyonları yerinde tutuldu; yeni uygulama bunları kullanmıyor.

- İstek türleri: `brands`, `models`, `years`, `variants`; ebeveyn kimlikleri FleetByte UUID'leridir.
- Sunucu markayı izin listesinde, modeli seçilen markanın listesinde doğrular.
- `vehicle_make_policy`: etkin marka ve görüntülenecek ad; yalnız sunucu erişebilir. Yönetici SQL üzerinden `enabled=false` yapabilir. API'de bulunmayan bir markayı etkinleştirmek veri oluşturmaz.
- `vehicle_catalog_cache`: tam veri kümesi; markalar 30 gün, model/varyantlar 7 gün saklanır. Arama ve sayfalama DB'deki küme üzerinde yapılır; kullanıcı başına dış API isteği yoktur.
- Yenilemeler atomik token/3 dakika kilit ile birleştirilir. Başarısız veya eksik sayfa başarılı önbellek olarak yazılmaz. 90 günden yeni eski veri varsa hata sırasında belirtilerek sunulur.
- Ortak bütçe: dakikada en fazla 40 dış API isteği. FleetByte 429 yanıtında 15 dakika bekleme; uygulama bütçesi dolunca kısa tekrar deneme. Tam kümeler en fazla 30 × 100 kayıtla sınırlı; üstünde sessiz kısmi liste verilmez.
- İşlev ağ geçidindeki mevcut JWT doğrulaması açık kaldı; public anon JWT kayıt öncesi katalog için kullanılabilir. Giriş yapmış kullanıcı token'ı ile de canlı test edildi. Servis anahtarı yalnız sunucudadır.

## Konum

`Konumumu Kullan`, Expo Location ile ön plan izninden sonra telefonun koordinatını alır. Geocoding/adres arama yoktur. Usta kaydında koordinat taslakla aktarılır; mevcut usta profilinde `save_mechanic_location` yalnız giriş yapmış ustanın kendi kaydını günceller. Sıfır koordinat geçerlidir; eksik, sınır dışı ve NaN değerleri reddedilir.

`nearby_mechanics` giriş yapmış müşterinin koordinatıyla çalışır; koordinatı DB'ye yazmaz. Yalnız onaylı ustaları döndürür. Sunucu küresel kuş uçuşu mesafesini hesaplar ve sıralar; varsayılan 30 km / 50 kayıt, üst sınır 100 km / 100 kayıt. Dönen alanlar işletme adı, uzmanlık, değerlendirme, konum ve mesafedir; belge/kimlik/IBAN yoktur.

MapLibre Native 11.4.0 / MapLibre GL JS 6.10.0 ve OpenStreetMap raster döşemeleri kullanılır. Native istekler SanayiX User-Agent kimliği taşır. Sabit ve tıklanabilir OpenStreetMap attribution haritada; kaynak/lisans metni Ayarlar'dadır. Web'de MapLibre'ın resmi ESM/worker dosyaları aynı sunucudan servis edilir (`npm install` sonrasında `prepare-maplibre-web.cjs` hazırlar). Çevrimdışı döşeme indirme eklenmedi. Genel OSM döşeme servisi SLA sağlamaz; yoğun kullanımda uyumlu bir döşeme sunucusu seçilmelidir.

Google Maps SDK, Places çağrısı, Google harita linki ve Google ters adres çözümleme yeni uygulamadan çıkarıldı. Google ile giriş ve önceden var olan sürüş takibi bu değişikliğin konusu değildir.

## Katalog sınırları

Canlı API ve SanayiX aracı üzerinden 11 istenen model grubu incelendi. Bu, üretici kataloglarına göre bütün motor/yıl bilgilerinin bağımsız doğrulandığı anlamına gelmez. Kaynak Türkiye'ye özel tam katalog değildir. Golf/Focus/Corolla/i20 için kasa, nesil ve marka önekli ayrı model kayıtları bulunabilir; bunlar yanlış birleştirilmez.

| İstenen araç | Kontrol edilen kayıt / varyant sayısı | Not |
|---|---:|---|
| Fiat Egea | Tipo / Egea: 4 | Egea olarak gösterilir; yalnız manuel örnekler, kapsam eksik |
| Renault Clio | 223 | 1990'dan başlayan kayıtlar |
| Renault Megane | 422 | 1996'dan başlayan kayıtlar |
| Ford Courier | E-Tourneo Courier: 1 | Yalnız elektrikli; benzinli/dizel Courier yok |
| Ford Focus | Focus: 2; Focus 5 Doors: 66 | Kasa seçenekleri ayrı; 5 kapılı kayıtlar 1998'den |
| VW Golf | Golf VII 5 Doors: 26 | Golf adıyla tek toplu kayıt yok; nesiller ayrı |
| VW Passat | 73 | Diğer kasa kayıtları ayrı olabilir |
| Toyota Corolla | 11 | Sedan/diğer adlarla ek kayıtlar, bazı yakıt alanları boş |
| Hyundai i20 | 20 | Bu temel kayıtta yeni yıllar eksik; ayrı i20 kayıtları var |
| Peugeot 3008 | 36 | Bazı yakıt/vites alanları boş; kaynak etiketleri üretici ile doğrulanmalı |
| Opel Astra | 532 | 1991'den başlayan kayıtlar |

Bitiş yılı boş varyantlarda üretimin bittiği varsayılmıyor; seçim ekranı bunu açıklar ve güncel yıla kadar seçenek sunar. Eksik motorlar uydurulmaz. Parça uyumluluğu satıcının kayıtlı uyumluluk bilgisine bağlıdır; farklı eski motor etiketleri otomatik olarak eşit sayılmaz, motor seçmeden de arama yapılabilir.

## Doğrulama

- 328 otomatik test: sayfalama, UUID/ebeveyn kontrolü, bozuk/kısmi yanıt, yıl/yakıt/vites, hata/tekrar deneme, kayıt taslağı ve GPS izin durumları dahil.
- TypeScript kontrolü geçti. Web dışa aktarımı başarılı.
- Canlı Supabase testleri: 11 model grubu, çok sayfalı varyantlar, filtreler, tekrar okuma, geçersiz marka/model, girişli katalog, konum RPC ve anonim erişim engeli.
- DB'de geri alınan test işlemi: 1.11195 / 2.2239 km sırası, onaysız ustanın dışlanması, konum sahipliği, sıfır koordinat, NaN, özel tablo/RPC izinleri, eşzamanlı önbellek kilidi. Test kayıtları kalıcı olmadı.
- Mobil boyutlu web: Renault → Clio → 2020 → motor/varyant; Türkçe yakıt/vites; harita döşemesi, marker seçimi, örnek mesafe/puan ve attribution görüldü.
- Android release APK 1.3.0 / 6: derleme, aynı test imzası, 16 KB ZIP/20 ARM64 kütüphanesi hizalama ve emülatöre kurulum. APK içinde Google Maps/Places SDK bulunmadığı, MapLibre bulunduğu doğrulandı. Paket içindeki 160 yerel kaynak modülü son kaynakla karşılaştırıldı.
- Fiziksel TECNO cihazı bağlı değil. Gerçek GPS, native harita dokunma ve izin akışlarının fiziksel cihaz testi henüz yapılmadı. Emülatöre kurulum, bu akışların uçtan uca test edildiği anlamına gelmez.

## Kaynaklar

- FleetByte resmi açıklama ve ticari kullanım bilgisi: https://github.com/Disturbing-Byte/fleetByteCatalog-docs
- API: https://fleetcatalog.disturbingbyte.pt
- MapLibre: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
- OSM lisans: https://www.openstreetmap.org/copyright
- OSM döşeme kullanım koşulları: https://operations.osmfoundation.org/policies/tiles/
