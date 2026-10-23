# SanayiX araç kataloğu — teslim edilen veri entegrasyonu

21 Eylül 2026; mobil sürüm 1.4.0 / Android kod 8 (teslim revizyonu v22).

## Kaynak ve kapsam

`arac-marka-model.sql` dosyası veri olarak okunur; tedarikçinin MS SQL komutları çalıştırılmaz. JSON ile ortak 14.455 kayıt aynı kimlik, ad ve bağlantıları taşır. Excel sürümleri bazı motor adlarını tarihe çevirdiği için aktarımda kullanılmaz.

Otomobil, Arazi/SUV/Pick-up, Minivan/Panelvan ve Elektrikli Araçlar kategorileri dahil edildi. Elektrikli Araçlar içindeki ek kategori seviyesi açıldı; scooter, motosiklet, ATV ve hizmet aracı dalları marka listesine alınmadı. Aynı marka/model birden fazla kategoride bulunuyorsa birleştirilir. v22.1 sunucu düzeltmesi sonrası sonuç: **105 marka, 962 model, 2.756 motor/varyant**. Motor olarak tanınan kayıt bulunmayan **201 model** vardır. Bu sayılar tüm araçların veya motorların eksiksiz olduğunu göstermez.

21 Eylül kontrolünde BMW, Audi, Lexus ve bazı diğer markaların farklı yazılmış motor kodlarının aktarımda atlandığı bulundu. 111 motor/varyant eklendi; mevcut kimlik ve adlar korundu. v22 APK değişmedi. Ayrıntılar: `REVIEW_V22_CATALOG_FIX.md`.

Üst kaydı 6139 bulunamayan 6140, 6141, 6142 ve bunların alt kayıtları 12486, 12487, 12488 karantinaya ayrıldı. Üst marka/model tahmin edilmedi. Model adı yerinde `1.8 GT` bulunan Alpine kaydı ile modeli bulunmayan Aion/Seres markaları seçimden çıkarıldı; ayrıntılar `catalog-warnings.json` dosyasına yazıldı.

Motor adları kaynakta yazıldığı gibi korunur. Gövde bilgisi varsa etikette yer alır. Motorun altındaki Urban/Easy gibi donanım paketleri ayrı motor yapılmaz. Veri yapısı her markada aynı olmadığından yalnız tanınan motor/varyant kalıpları alınır; diğer etiketler motor diye sunulmaz.

**Yıl, motor–yıl eşleştirmesi, ayrı yakıt ve vites alanları yoktur.** Yıl listesi 1900–gelecek yıl aralığında kullanıcının ruhsatından beyan ettiği bilgidir; modelin üretim yılları olduğu iddia edilmez. Seçilen yıl motor listesini filtrelemez. Bu sınır seçim penceresinde ve motor seçildikten sonra açıklanır. Kaynakta olmayan özellikler tahmin edilmez. Eksiksiz üretim/yıl/motor doğrulaması için tedarikçiden ek ilişkilendirilmiş veri gerekir.

## Mimari

Teslim edilen dosya → doğrulamalı aktarım → SanayiX/Supabase veritabanı → salt okunur RPC → mobil uygulama.

- Tablo: `public.sanayix_catalog_entries`. RLS açık; anon/authenticated doğrudan tablo okuyamaz/yazamaz.
- RPC: `public.sanayix_vehicle_catalog(p_query jsonb)`. Kayıt öncesi seçim için anon/authenticated okuyabilir. Yalnız id/ad ve kapsam bilgisi döner; kaynak yolları/kimlikleri döndürülmez.
- İstekler: brands, models, years, variants; sayfa boyutu 100. Marka/model ilişkisi ve tüm girişler doğrulanır. Arama metni joker karakter olarak yorumlanmaz.
- `enabled=false` ile bir marka, model veya motor seçeneklerden çıkarılabilir. Kapalı markanın altına doğrudan erişim de reddedilir. Bu alan otomatik yeniden aktarımda değiştirilmez.
- Mobil araç seçimleri FleetByte, vPIC veya OtoAPI'ye doğrudan gitmez. Mevcut FleetByte fonksiyonu eski APK'ların çalışması için korunmuştur; yeni APK onu kullanmaz.
- Motor listesi, tüm sayfalar eksiksiz gelmeden tamamlanmış liste olarak gösterilmez. İstek sırasında seçim değişirse eski sonuç kullanılmaz. Kayıtlı araç etiketleri korunur; aynı motor ikinci kez eklenmez.
- Müşteri/usta kayıtları, harita, konum ve diğer uygulama işlevleri bu aktarımda değiştirilmez.

## Tekrar aktarım

```sh
node scripts/import-purchased-catalog.cjs /private/source/arac-marka-model.sql /private/output
node scripts/verify-purchased-catalog.cjs /private/output
node scripts/verify-purchased-catalog-live.cjs
```

İlk kurulumda `supabase/20260921_purchased_vehicle_catalog.sql` uygulanır. Üretilen `seed.sql` aynı kimlikleri günceller; `enabled` değerlerini korur. Güncel dosyada artık olmayan kayıtları otomatik silmez: yeni teslimatta kaldırılan kayıtlar ayrıca değerlendirilip pasifleştirilmelidir. Şema, seed ve `tests/purchased-catalog-db.sql` doğrulamaları tek işlemde uygulandı; bütün aktif kayıtların ad/kimlik/üst kayıt bilgileri üretilen katalogla toplu özet değeri üzerinden birebir karşılaştırıldı; doğrulamalar başarılı olunca commit edildi.

Tedarikçi ham verisi ve üretilen seed uygulama paketine ya da kaynak kod arşivine konulmaz. Özel veri yedeği ayrıca teslim edilir. İzin/lisans kapsamını değiştirerek başka kişilere yayımlamayın.

## Kontrol edilen modeller

| Marka / model | Motor/varyant |
| --- | ---: |
| Fiat Egea | 7 |
| Renault Clio | 20 |
| Renault Megane | 21 |
| Ford Tourneo Courier | 4 |
| Ford Transit Courier | 7 |
| Ford Focus | 14 |
| Volkswagen Golf | 15 |
| Volkswagen Passat | 19 |
| Toyota Corolla | 9 |
| Hyundai i20 | 6 |
| Peugeot 3008 | 10 |
| Opel Astra | 19 |
| BMW iX | 3 |
| BMW iX1 | 2 |
| BMW X1 | 9 |
| BMW X5 | 11 |
| Audi Q8 | 3 |
| Lexus RX | 5 |
| Fiat 500 Ailesi | 13 |

Bunlar veri ve canlı servis kontrolleridir; üretici belgeleriyle motor uygunluğu onayı değildir. Parça uyumluluğu için mevcut ilan/OEM doğrulaması gereklidir.
