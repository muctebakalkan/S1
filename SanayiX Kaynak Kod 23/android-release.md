# Android paketleme ve yayın kontrolü

16 Eylül 2026. Uygulama kimliği `com.sanayix`; mevcut yerel sürüm 1.2.7 / kod 1. Teslim dosyasındaki v11, dosya revizyonudur. Test APK'sı debug sertifikasıyla imzalanmıştır; mağaza sürümü veya yükleme anahtarı doğrulanmış değildir.

## Yerel kontroller

Node, Java ve Android SDK kurulu olmalı. `ANDROID_HOME` ve `JAVA_HOME` ilgili kurulumları göstermeli.

```sh
npm run check:config
npm test
npx tsc --noEmit
npm run check:android-apk -- /absolute/path/SanayiX-Test.apk
```

APK kontrolü imzayı, 16 KB zip hizalamasını, uygulama kimliğini, hata ayıklama bayrağını, gereksiz izinleri, yedekleme/HTTP/klavye ayarlarını ve bilinen örnek veri/gizli Supabase anahtarlarını denetler. Çıktıdaki sertifika parmak izi herkese açık sertifika bilgisidir; anahtar/parola değildir. `storeReady: false` bilinçlidir: bu denetim mağaza erişimini veya doğru yükleme imzasını ispatlamaz. 16 KB zip hizalaması kontrolü tek başına tüm cihaz davranışlarını doğrulamaz.

## Supabase istemci ayarları

Mevcut herkese açık bağlantı `config/supabase.public.json` içindedir. Farklı ortam için HTTPS proje adresi ile publishable/anon anahtar birlikte tanımlanır. `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ve eski `EXPO_PUBLIC_SUPABASE_ANON_KEY` desteklenir; aynı anda iki farklı anahtar tanımlanmaz. `.env.example` örnektir; olduğu gibi gerçek `.env` olarak kullanılamaz.

Expo yapılandırması eksik/karışık proje ayarını, süresi dolmuş veya yetkili JWT'yi, `sb_secret_` anahtarını ve açık istemci değişkenindeki belirgin gizli bilgileri reddeder. Bu yerel denetim JWT imzasını doğrulamaz; yetkilendirme ve RLS sunucuda uygulanır. [Supabase anahtar türleri](https://supabase.com/docs/guides/getting-started/api-keys).

## Kalıcı Android ayarları

`android/` üretilen ve Git dışında tutulan klasördür. Kalıcı ayarlar `app.json` ve `plugins/withAndroidSafety.cjs` içindedir. Yeni bir Android klasörü üretilirken bunlar tekrar uygulanır. Yalnızca üretilmiş AndroidManifest veya Gradle dosyasını değiştirerek teslim yapılmamalıdır.

- İzin dışlamaları diğer uygulamalar üzerinde pencere açmayı ve tüm eski galeriye erişimi kaldırır. Fotoğraf seçici Android'de yalnızca seçilen fotoğrafa erişir. Android 6–9 kamera desteği için yazma izni en fazla API 28'e kadar korunur. Kamera ve sesli arıza tarifi izinleri işlevleri nedeniyle korunmuştur. [Expo izin yapılandırması](https://docs.expo.dev/guides/permissions/), [ImagePicker](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/).
- Açık HTTP trafiği kapatılır. Oturum, önbellek ve henüz gönderilmemiş yerel sürüş verileri Android bulut/cihaz taşıma yedeğinden dışlanır. Normal güncelleme cihazdaki verileri silmez; yeni telefona geçerken sunucuya ulaşmamış kayıtlar bu yedekten geri gelmez. [Android yedekleme kuralları](https://developer.android.com/identity/data/autobackup).
- Klavye açıldığında Android ekranı kullanılabilir yüksekliğe küçültür; sohbet ayrıca ikinci kez küçültülmez. İlanın araç penceresi kaydırılabilir. Gerçek Android klavyesi ve büyük yazı ayarı fiziksel kabulde denenmelidir. [Expo Android yapılandırması](https://docs.expo.dev/versions/v54.0.0/config/app/).

## Mevcut Google Play uygulamasına güncelleme

1. Console'daki mevcut uygulamanın kimliği, kullanılmış en yüksek sürüm kodu ve yükleme sertifikasının SHA-256 değeri alınır. Yükleme sertifikası ile Play'in uygulama imzalama sertifikası aynı şey olmayabilir.
2. Mevcut EAS projesi `200d4818-22f6-4c19-b5ea-2df242d5a03c` üzerindeki uzaktan yönetilen sürüm ve Android yükleme anahtarı bu bilgilerle karşılaştırılır. Yeni uygulama/anahtar oluşturulmaz; sürüm kodu tahmin edilmez.
3. `eas.json` üretim profili store dağıtımı, app-bundle ve otomatik sürüm artırımı içerir. Doğru anahtar/sürüm eşlemesi tamamlanınca üretim AAB alınır. Bu çalışma sırasında bulut derleme veya mağaza yüklemesi yapılmadı.
4. AAB imzası ve içindeki paket/sürüm bilgisi tekrar kontrol edilir. Google giriş için Play uygulama imzası da doğrulanır. Dahili test dağıtımından sonra fiziksel telefon kabulü tamamlanır.
5. Doğrulanmış e-posta gönderimi, resmi işletme/politika bağlantıları, hesap silme sayfası ve gerçek uygulama kullanımına uygun mağaza beyanları tamamlanır. Ardından mağaza güncellemesi gönderilir.

[Android'in uygulama/yükleme imzası açıklaması](https://developer.android.com/studio/publish/app-signing). AAB'nin hazırlanması veya bir APK'nın emülatöre kurulması, mağaza yayınının tamamlandığı anlamına gelmez.
