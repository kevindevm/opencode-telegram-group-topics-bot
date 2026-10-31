<h1>OpenCode Telegram Group Topics Bot</h1>

[İngilizce README](./README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[OpenCode](https://opencode.ai) için yazılmış bir Telegram botu; tek bir Telegram süpergrubunu OpenCode için çok oturumlu bir mobil istemciye dönüştürür: **General** konusu kontrol hattıdır ve her OpenCode oturumu kendi forum konusunu alır; canlı akış, sabitlenmiş durum panosu, prompt kuyruğu, izin/soru akışları ve uzun shell komutları için ⏪ arka plana gönderme butonu ile birlikte.

Bu proje, Ruslan Grinev'in [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) projesinin bir forkudur. Daha basit tek sohbet akışı için upstream projeyi; forum konularında paralel oturumlar, telefonunuzdan yönetilebilir şekilde kullanmak isterseniz bu forku kullanın.

Açık port yok, dışa açık Web UI yok. Bot yalnızca yerel OpenCode sunucunuz ve Telegram Bot API ile konuşur. OpenCode V1 ve V2 sunucular desteklenir. Bir grup genellikle bir repoya karşılık gelir; tek bir grupta birçok oturum konusu paralel çalışabilir ve aynı anda birçok grup aktif kalabilir.

Bot arayüz dilleri: English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Not: İngilizce [`README.md`](./README.md) güncel ve yetkili dokümandır. İçerikler arasında fark varsa İngilizce sürüm geçerlidir.

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Hızlı Bakış

- Bir Telegram grubu bir repo / proje çalışma alanına karşılık gelir.
- **General** kontrol hattıdır: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, durum kontrolleri.
- Her yeni OpenCode oturumu, kendi session, model, agent ve panosu olan ayrı bir forum konusu alır.
- Uzun shell komutları, oturumu arka plana gönderen bir ⏪ butonu sunar; böylece sohbete devam edebilirsiniz.
- Her subagent, kendi salt okunur transkript konusuna akar ve üst konu içinde canlı bir durum kartı tutar.
- PC'nizde yazdığınız promptlar 🧑 mesajları olarak oturum konusuna yansıtılır; böylece iki taraf da senkron kalır.
- İsteğe bağlı TTS sesli yanıtlar `/tts` ile genel olarak açılıp kapatılır ve yeniden başlatmalarda korunur.
- DM'ler hafif kontrol ve durum kullanımı içindir; ana çoklu oturum akışı değildir.

## Quick Start

### 1. Ön Koşullar

- Node.js 20+
- [opencode.ai](https://opencode.ai) veya [GitHub](https://github.com/sst/opencode) üzerinden OpenCode
- [@BotFather](https://t.me/BotFather) üzerinden bir Telegram botu
- [@userinfobot](https://t.me/userinfobot) üzerinden sayısal Telegram kullanıcı ID'niz

### 2. Telegram Grubunu Oluşturma ve Hazırlama

1. Bir OpenCode projesi / reposu için yeni bir Telegram **süpergrubu** oluşturun.
2. Botu gruba ekleyin ve **Manage Topics** izniyle yönetici yapın.
3. Grup ayarlarından **Topics** özelliğini etkinleştirin.
4. [@BotFather](https://t.me/BotFather) içinde bot için `/setprivacy` çalıştırın ve **Disable** seçin.
5. Varsayılan **General** konusunu koruyun: kontrol hattı odur.

### 3. OpenCode'u Başlatma

Botun çalışacağı makinede OpenCode'u çalıştırın:

```bash
# V1
opencode serve
# V2: arka plan servisini kullanın (sabit port + kimlik bilgileri).
# Çıplak bir `opencode serve` rastgele port ve rastgele şifre bağlar,
# bu yüzden bot ona asla ulaşamazdı.
opencode service start
```

Varsayılan API adresi: `http://localhost:4096` (V1) veya `http://127.0.0.1:49374` (V2, `OPENCODE_SERVER_VERSION=v2` ayarlayın).

### 4. Botu Kurma

#### Seçenek A: `npx`

```bash
npx @kevindevm/opencode-telegram-group-topics-bot
```

#### Seçenek B: Global kurulum

```bash
npm install -g @kevindevm/opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### Seçenek C: Kaynak koddan çalıştırma

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js`, `npm run build` tarafından üretilen derlenmiş CLI giriş noktasıdır.

#### Seçenek D: Docker

Docker ile kurulum da mümkündür; ayrıntılar için İngilizce [`README.md`](./README.md) dosyasının ilgili bölümüne bakın.

### 5. Kurulum Sihirbazını Tamamlama

Sihirbaz şunları sorar:

- arayüz dili
- Telegram bot token
- izin verilen Telegram kullanıcı ID
- OpenCode API URL
- isteğe bağlı OpenCode sunucu kullanıcı adı / şifresi

### 6. İlk Kez Doğrulama

1. Bota DM gönderin ve `/start` çalıştırın; yanıtladığını doğrulayın.
2. Gruptaki **General** konusunda `/start`, ardından OpenCode erişilebilirliğini doğrulamak için `/status` çalıştırın.
3. **General** içinde `/projects` çalıştırın ve bu grup için repoyu seçin.
4. **General** içinde `/new` çalıştırın ve bir oturum konusu oluşturun.
5. Yeni konuyu açın ve bir prompt gönderin.

Bunlar çalışıyorsa grup çalışma alanı hazırdır.

## Günlük Kullanım

1. OpenCode'u başlatın (V1'de `opencode serve`, V2'de `opencode service start`), ardından botu başlatın.
2. Telegram grubunu açın ve **General** konusuna gidin.
3. Seçili repoyu doğrulamak için `/projects` kullanın.
4. Yeni bir oturum konusu oluşturmak için `/new` kullanın.
5. Konu içinde çalışın; bir shell komutu uzun sürerse oturumu arka plana göndermek için ⏪ düğmesine dokunun.
6. Eski oturum dizilerine dönmek için **General** içinde `/sessions` kullanın.

## Paralel Çalışma ve Telegram Limitleri

- Bu fork paralel çalışma için tasarlandı: tek grupta çok konu, projeler arasında çok grup.
- Telegram mesaj hız limitleri uygular; özellikle birçok konuya aynı anda güncelleme gittiğinde.
- Bot gerektiğinde Telegram güncellemelerini yavaşlatır veya aralıklı gönderir (`SERVICE_MESSAGES_INTERVAL_SEC` değişkenine bakın, `>= 2` tutun).
- Telegram güncellemeleri sıklık azalsa bile OpenCode oturumları çalışmaya devam eder: yüksek yük altında konu başına daha az gerçek zamanlı mesaj bekleyin, ancak iş kaybolmaz.

## Komutlar

Oturum konusundaki düz metin mesaj, engelleyen bir etkileşim yoksa prompt olarak değerlendirilir. `/start` yalnızca DM'de çalışır (bot tanışma adımı).

| Command           | Açıklama                                                  |
| ----------------- | ---------------------------------------------------------- |
| `/status`         | Sunucu ve oturum durumu                                    |
| `/new`            | Yeni bir oturum oluşturur                                  |
| `/abort`          | Geçerli eylemi durdurur                                    |
| `/sessions`       | Oturumları listeler                                        |
| `/recent`         | Projeler arası son oturumlara göz atar                     |
| `/last`           | En son oturum mesajını gösterir                            |
| `/tts`            | Sesli yanıtları açıp kapatır                               |
| `/projects`       | Projeleri listeler                                         |
| `/open`           | Dizinlere göz atarak bir proje ekler                       |
| `/task`           | Zamanlanmış bir görev oluşturur                            |
| `/tasklist`       | Zamanlanmış görevleri listeler                             |
| `/queue`          | Kuyruktaki mesajları gösterir ve yönetir                   |
| `/trust`          | İzinleri otomatik onaylama için güven seviyesi             |
| `/retry`          | Son promptu yeniden gönderir                               |
| `/diff`           | Bu oturumda değişen dosyaları gösterir                     |
| `/commit`         | Oturum değişikliklerini bir mesajla commit eder            |
| `/compact`        | Oturum bağlamını sıkıştırır (klavyeye gerek yok)           |
| `/cost`           | Oturum (subagentler dahil) ve günlük harcamayı gösterir    |
| `/close`          | Bu oturum konusunu kapatır                                 |
| `/cleanup`        | Subagent transkript konularını siler                       |
| `/fork`           | Bu oturumu yeni bir konuya klonlar                         |
| `/share`          | Bu oturumun transkriptini bir dosya olarak dışa aktarır    |
| `/saved`          | Kayıtlı prompt kısayolları                                 |
| `/rename`         | Geçerli oturumu yeniden adlandırır                         |
| `/commands`       | Özel komutlar                                              |
| `/skills`         | Yetenek kataloğu                                           |
| `/opencode_start` | OpenCode sunucusunu başlatır                               |
| `/opencode_stop`  | OpenCode sunucusunu durdurur                               |
| `/reload`         | OpenCode sunucu yapılandırmasını yeniden yükler (yalnızca V2) |
| `/refresh`        | Oturum bilgilerini yeniler                                 |
| `/display`        | Bu sohbet için görüntüleme seçenekleri (aç/kapat + agent)  |
| `/help`           | Yardım                                                     |

Model/agent seçicileri slash komutları değil, klavye butonlarıdır.

## Yapılandırma

### Yapılandırma Konumu

- Kaynak modu yapılandırmayı depo kök dizininde saklar.
- Kurulu mod yapılandırmayı platformun uygulama veri dizininde saklar.
- `OPENCODE_TELEGRAM_HOME` ikisini de geçersiz kılar ve özel bir yapılandırma dizini zorlar.

Kurulu mod yapılandırma yolları:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Temel Ortam Değişkenleri

| Değişken                   | Açıklama                                              | Zorunlu | Varsayılan                                    |
| -------------------------- | ------------------------------------------------------ | :-----: | --------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`       | @BotFather'dan alınan bot token                        |   Evet   | -                                              |
| `TELEGRAM_ALLOWED_USER_ID` | Sizin sayısal Telegram kullanıcı ID'niz                |   Evet   | -                                              |
| `OPENCODE_API_URL`         | OpenCode sunucu adresi                                 |   Hayır  | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION`  | Sunucu API sürümü: `v1` veya `v2`                      |   Hayır  | `v1`                                           |
| `OPENCODE_SERVER_USERNAME` | Sunucu kimlik doğrulama kullanıcı adı                  |   Hayır  | `opencode`                                     |
| `OPENCODE_SERVER_PASSWORD` | Sunucu kimlik doğrulama şifresi                        |   Hayır  | -                                              |
| `OPENCODE_MODEL_PROVIDER`  | Varsayılan model sağlayıcısı                           |   Evet   | -                                              |
| `OPENCODE_MODEL_ID`        | Varsayılan model ID                                    |   Evet   | -                                              |
| `OPENCODE_AUTO_START`      | Erişilebilir sunucu yoksa bot başlangıcında yönetilen bir OpenCode sunucusu başlatır | Hayır | `true` |
| `BOT_LOCALE`               | Bot arayüz dili (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | Hayır | `en` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Servis mesaj aralığı; `>= 2` tutun, `0` = anında  |   Hayır  | `5`                                            |
| `BUDGET_ALERT_USD`         | Günlük harcama uyarısı, USD (`0` = kapalı)             |   Hayır  | `0`                                            |
| `LOG_LEVEL`                | Günlük seviyesi (`debug`, `info`, `warn`, `error`)     |   Hayır  | `info`                                         |

Tüm ortam değişkenlerinin tam tablosu için İngilizce [`README.md`](./README.md) dosyasının Configuration bölümüne bakın.

`.env` dosyanızı gizli tutun; içinde bot tokenınız bulunur.

## Sorun Giderme

**Bot yanıt vermiyor**

- `TELEGRAM_ALLOWED_USER_ID` değerinin gerçek Telegram kullanıcı ID'nizle eşleştiğini doğrulayın.
- Bot tokenının doğru olduğunu doğrulayın.
- Grup kullanımı için BotFather'da privacy mode'un devre dışı olduğundan emin olun (`/setprivacy` → Disable).

**OpenCode sunucusuna ulaşılamıyor**

- OpenCode sunucusunun çalıştığından emin olun (V1'de `opencode serve`, V2'de `opencode service start`; kimlik bilgisi isterse bir kez `opencode pair` çalıştırın).
- `OPENCODE_API_URL` (V2 için `OPENCODE_SERVER_VERSION`) değerinin doğru adrese işaret ettiğini doğrulayın.

**Yeni oturum konuları oluşturulamıyor**

- Grubun Topics'in etkin olduğu bir süpergrup olduğunu doğrulayın.
- Botun **Manage Topics** izniyle yönetici olduğunu doğrulayın.

**⏪ butonu hiç görünmüyor**

- Yalnızca `BACKGROUND_OFFER_AFTER_SEC` (varsayılan 3 sn) sonrasına kadar çalışmaya devam eden `bash`/`execute`/`task` araçları için gösterilir.
- Eşiği düşürün ve oturum konusunu kontrol edin: öneri orada gönderilir.

## Güvenlik

Yalnızca ID'si `TELEGRAM_ALLOWED_USER_ID` ile eşleşen Telegram kullanıcısı botu kullanabilir.

Bot yerel olarak çalıştığı ve yerel OpenCode sunucunuza bağlandığı için, Telegram'ın kendisinin ötesinde dışa açık bir genel servis yoktur. İsteğe bağlı health endpoint'i (`BOT_HEALTH_PORT`) yalnızca `127.0.0.1` adresine bağlanır ve salt okunur durum sunar.

`.env` dosyanızı (varsayılan olarak yoksayılır) veya `settings.json` dosyasını (oturum ID'leri içeren çalışma zamanı durumu) asla commit etmeyin; ikisi de botu çalıştıran makinede kalır.

## Daha Fazla Doküman

- İngilizce ana doküman: [`README.md`](./README.md)
- Fork sync notları: [`FORK_SYNC.md`](./FORK_SYNC.md)
- Ürün kapsamı ve durum: [`PRODUCT.md`](./PRODUCT.md)
- Katkı kuralları: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Lisans

[MIT](LICENSE) - Orijinal proje © Ruslan Grinev - Fork değişiklikleri © Shane Kunz
