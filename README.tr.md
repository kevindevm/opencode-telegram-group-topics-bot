# OpenCode Telegram Group Topics Bot

[İngilizce README](./README.md)

[![CI](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevindevm/opencode-telegram-group-topics-bot)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: [English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Not: İngilizce [`README.md`](./README.md) güncel ve yetkili dokümandır. İçerikler arasında fark varsa İngilizce sürüm geçerlidir.

Bir Telegram botu ([grammy](https://grammy.dev/), Node.js 20+); tek bir Telegram süpergrubunu [OpenCode](https://opencode.ai) için **çok oturumlu bir mobil istemciye** dönüştürür: **General** konusu kontrol hattıdır ve her OpenCode oturumu, canlı akış, sabitlenmiş durum panosu, prompt kuyruğu, izin/soru akışları ve uzun shell komutları için ⏪ arka plana gönderme düğmesiyle birlikte kendi forum konusunu alır.

Bu proje, Ruslan Grinev'in [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) projesinin bir forkudur. Daha basit tek sohbet akışı için upstream projeyi; forum konularında paralel oturumlar için, telefonunuzdan yönetilebilir olan bu forku kullanın.

Açık port yok, dışa açık web arayüzü yok. Bot yalnızca yerel OpenCode sunucunuz ve Telegram Bot API ile konuşur. OpenCode V1 ve V2 sunucular desteklenir. Bir grup genellikle bir repoya karşılık gelir; tek bir grupta birçok oturum konusu paralel çalışabilir ve aynı anda birçok grup aktif kalabilir.

Fork senkronizasyon notları: [`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## İçindekiler

- [Kısa bakış](#kısa-bakış)
- [Ekran görüntüleri](#ekran-görüntüleri)
- [Özellikler](#özellikler)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Günlük akış](#günlük-akış)
- [Paralel iş yükleri ve Telegram hız limitleri](#paralel-iş-yükleri-ve-telegram-hız-limitleri)
- [Komutlar](#komutlar)
- [Arka plan düğmesi](#arka-plan-düğmesi)
- [Subagent transkript konuları](#subagent-transkript-konuları)
- [Görüntüleme menüsü](#görüntüleme-menüsü)
- [Yapılandırma](#yapılandırma)
- [Sürümler](#sürümler)
- [Güvenlik](#güvenlik)
- [Geliştirme](#geliştirme)
- [Sorun giderme](#sorun-giderme)
- [Katkıda bulunanlar](#katkıda-bulunanlar)
- [Lisans](#lisans)

## Kısa bakış

- Bir Telegram grubu bir repo / proje çalışma alanına karşılık gelir.
- **General** kontrol hattıdır: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, durum kontrolleri.
- Her yeni OpenCode oturumu, kendi oturumu, modeli, agent'ı ve görüntüleme durumu olan ayrı bir forum konusu alır.
- Uzun shell komutları, oturumu arka plana göndererek sohbete devam etmenizi sağlayan bir ⏪ düğmesi sunar.
- Her subagent, kendi salt okunur transkript konusuna akar ve üst konu içinde canlı bir durum kartı tutar.
- PC'nizde yazdığınız promptlar 🧑 mesajları olarak oturum konusuna yansıtılır; böylece iki taraf da senkron kalır.
- İsteğe bağlı TTS sesli yanıtlar `/tts` ile global olarak açılıp kapatılır ve yeniden başlatmalarda korunur.
- DM'ler hafif kontrol ve durum kullanımı içindir; ana çoklu oturum akışı değildir.

## Ekran görüntüleri

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Canlı asistan akışıyla oturum konusu" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Sabitlenmiş durum panosu ve yanıt klavyesi" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Favorileri olan model seçici" />
</p>

## Özellikler

- **Konu kapsamlı oturumlar**: her OpenCode oturumu için bir forum konusu; General kontrol hattı olarak kalır ve hiçbir şeyi sabitlemez.
- **Canlı akış**: asistan yanıtları, thread duyarlı düzenlemeler ve yedek tamamlama teslimiyle akar.
- **⏪ Arka plana gönderme**: uzun `bash`/`execute` komutları, oturumu `session.background` ile arka plana alan bir düğme sunar.
- **🧩 Subagent transkript konuları**: her subagent, tam canlı transkripti içeren salt okunur bir konu alır; üst konu kompakt bir durum kartı tutar.
- **Sabitlenen panolar**: oturum, proje, model, bağlam kullanımı, maliyet ve değişen dosyaları içeren konu başına sabitlenmiş mesaj.
- **Prompt kuyruğu**: oturum meşgulken gönderilen promptlar kuyruğa alınır, yeniden başlatmalarda korunur ve `/queue` ile mesaj başına iptal, en öne taşıma ve kes-yürüt destekler.
- **İzinler ve sorular**: `allow once` / `always` / `reject` etkileşimli akışları ve mesajın içinde tam numaralı seçenekler artı kısa numaralı düğmeler, özel metin ve sesli yanıtlarla soru anketleri; `/trust ask|edits|all` ile oturum başına güven seviyeleri.
- **Son yanıt dipnotu**: yalnızca bir turun son mesajı `agent · model · süre` dipnotunu taşır (`🛠️ Build · opus · 1m 30s`); böylece yanıtın sonu her zaman tanınır. Önceki mesajlar düz gider.
- **Seçiciler ve klavye**: kalıcı klavyeden model, agent, varyant ve bağlam kontrolleri; favoriler önce.
- **`/display` menüsü**: sohbet/konuya özel göster/gizle geçişleri artı bir agent kısayolu ve İptal düğmesi; geçersiz kılmalar `settings.json` içinde saklanır.
- **Oturum yönetimi**: son promptu `/retry` ile tekrar gönderme, `/diff`, `/commit`, `BUDGET_ALERT_USD` ile `/cost` harcama takibi, `/close`, `/fork`, `/share`, `/rename`, `/refresh`, kayıtlı prompt kısayolları (`/saved`), özel komutlar (`/commands`), skills (`/skills`).
- **Zamanlanmış görevler**: `/task` ve `/tasklist` ile proje başına zamanlanmış konu (duraklat/devam et/şimdi çalıştır/loglar).
- **Ses ve dosyalar**: ses/audio için Whisper uyumlu STT, isteğe bağlı global TTS (`/tts`), görsel/PDF/metin ekleri, dosya veya satır içi kod blokları olarak diff'ler.
- **Projeye göz atma**: izin verilen dizin korumalarıyla `/open` ve `/projects`.
- **Sunucu kontrolü**: OpenCode otomatik başlatma, uzaktan `/opencode_start` / `/opencode_stop`, V2 yapılandırması `/reload`.
- **Tek kullanıcılı erişim kontrolü**, genel port yok (health endpoint yalnızca `127.0.0.1` adresine bağlanır).
- İngilizceye geri düşen **8 arayüz dili**.

## Hızlı başlangıç

### 1. Ön koşullar

- Node.js 20+
- [opencode.ai](https://opencode.ai) veya [GitHub](https://github.com/sst/opencode) üzerinden OpenCode
- [@BotFather](https://t.me/BotFather) üzerinden bir Telegram botu
- [@userinfobot](https://t.me/userinfobot) üzerinden sayısal Telegram kullanıcı ID'niz

### 2. Telegram grubunu oluşturma ve hazırlama

1. Bir OpenCode projesi/reposu için yeni bir Telegram **süpergrubu** oluşturun.
2. Botu gruba ekleyin ve **Manage Topics** izniyle yönetici yapın.
3. Grup ayarlarından **Topics** özelliğini etkinleştirin.
4. [@BotFather](https://t.me/BotFather) içinde bot için `/setprivacy` çalıştırın ve **Disable** seçin.
5. Varsayılan **General** konusunu koruyun: kontrol hattı odur.

### 3. OpenCode'u başlatma

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

### 4. Botu kurma

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

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, OPENCODE_MODEL_PROVIDER, OPENCODE_MODEL_ID değerlerini doldurun
docker compose up -d --build
```

`.env` ana makinede kalır. Çalışma zamanında enjekte edilir ve imajın içine kopyalanmaz.

Yapılandırma ve çalışma zamanı durumu `opencode-group-topics-bot-data` volume'ünde yaşar (`OPENCODE_TELEGRAM_HOME=/app/data` konteyner içinde).

**Linux** (OpenCode ana makinede `127.0.0.1:4096` adresinde): varsayılan compose dosyası `network_mode: host` kullanır; böylece konteyner ana makinedeki OpenCode sunucunuza ulaşır ve aynı proje yollarını görür.

**Docker Desktop** (macOS/Windows): host networking kullanılamaz; bu yüzden OpenCode'a `host.docker.internal` üzerinden ulaşan override dosyasını kullanın:

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

Docker Desktop'ta konteyner ana makinedeki proje yollarını göremez ve `opencode`'un kendisini başlatamaz: OpenCode'u ana makinede çalıştırın (`opencode serve` V1, `opencode service start` V2) ve konteyner içinde çözümlenen `/projects` yollarını tercih edin (gerekirse repoları ekstra bir `volumes` girişiyle mount edin). `/opencode_start` ve `/opencode_stop` yalnızca ana makinede çalışan özelliklerdir.

Stabil sürümler `linux/amd64` ve `linux/arm64` için `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:<version>` ve `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:latest` olarak yayınlanır. Release candidate'lar yalnızca tam sürüm etiketlerini alır.

#### Seçenek E: Windows servisi (NSSM, her zaman açık)

Windows'ta 7/24 kurulum için botu [NSSM](https://nssm.cc) ile yerel bir servis olarak çalıştırın:

```powershell
# 1. Bir kez derleyin
npm install
npm run build

# 2. Servisi kaydedin (yönetici PowerShell, yolları ayarlayın)
nssm install OpenCodeTelegramBot "C:\Program Files\nodejs\node.exe" "E:\path\to\repo\dist\cli.js start --mode installed"
nssm set OpenCodeTelegramBot AppDirectory "E:\path\to\repo"
nssm set OpenCodeTelegramBot AppEnvironmentExtra "OPENCODE_TELEGRAM_HOME=C:\Users\<you>\AppData\Roaming\opencode-telegram-group-topics-bot"
nssm set OpenCodeTelegramBot Start SERVICE_AUTO_START

# 3. Başlatın
nssm start OpenCodeTelegramBot
```

Yapılandırma daha sonra `%APPDATA%\opencode-telegram-group-topics-bot\.env` içinde (veya `OPENCODE_TELEGRAM_HOME` gösteren yerde) yaşar: servis o dosyayı okur, repodaki `.env`'i değil. Oturum açılışında `opencode pair` çalıştıran zamanlanmış bir görev CLI'ı eşlenmiş tutar; servisin kendisi bot sürecini yönetir ve hata durumunda yeniden başlatır.

### 5. Kurulum sihirbazını tamamlama

Sihirbaz şunları sorar:

- arayüz dili
- Telegram bot token'ı
- izin verilen Telegram kullanıcı ID'si
- OpenCode API URL'si
- isteğe bağlı OpenCode sunucu kullanıcı adı/şifresi

### 6. İlk kez doğrulama

1. Bota DM gönderin ve `/start` çalıştırın; yanıtladığını doğrulayın.
2. Gruptaki **General** konusunda `/start`, ardından OpenCode erişilebilirliğini doğrulamak için `/status` çalıştırın.
3. **General** içinde `/projects` çalıştırın ve bu grup için repoyu seçin.
4. **General** içinde `/new` çalıştırın ve bir oturum konusu oluşturun.
5. Yeni konuyu açın ve bir prompt gönderin.

Bunlar çalışıyorsa grup çalışma alanı hazırdır.

## Günlük akış

1. OpenCode'u başlatın (V1'de `opencode serve`, V2'de `opencode service start`), ardından botu başlatın.
2. Telegram grubunu açın ve **General** konusuna gidin.
3. Seçili repoyu doğrulamak için `/projects` kullanın.
4. Yeni bir oturum konusu oluşturmak için `/new` kullanın.
5. Konu içinde çalışın; bir shell komutu uzun sürerse oturumu arka plana göndermek için ⏪ düğmesine dokunun.
6. Eski oturum kanallarına dönmek için **General** içinde `/sessions` kullanın.

## Paralel iş yükleri ve Telegram hız limitleri

- Bu fork paralel çalışma için tasarlandı: tek grupta birçok konu, projeler arasında birçok grup.
- Telegram mesaj hız limitleri uygular; özellikle birçok konuya aynı anda güncelleme gittiğinde.
- Bot gerektiğinde Telegram güncellemelerini yavaşlatır veya aralıklı gönderir (`SERVICE_MESSAGES_INTERVAL_SEC` değişkenine bakın, `>= 2` tutun).
- Telegram güncellemeleri seyrekleşse bile OpenCode oturumları çalışmaya devam eder: yüksek yük altında konu başına daha az gerçek zamanlı mesaj bekleyin, ancak iş kaybolmaz.

## Komutlar

Oturum konusundaki düz metin mesaj, engelleyen bir etkileşim yoksa prompt olarak değerlendirilir. Model, agent, varyant ve bağlam eylemleri kalıcı alt klavyeden kullanılabilir.

| Komut             | Açıklama                                                  |
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
| `/display`        | Bu sohbet için görüntüleme seçenekleri (geçişler + agent)  |
| `/help`           | Yardım                                                     |

`/start` yalnızca DM'de çalışır (bot tanışma adımı). Model/agent seçicileri slash komutları değil, klavye düğmeleridir.

## Arka plan düğmesi

Bir shell (`bash`/`execute`) veya subagent (`task`) aracı `BACKGROUND_OFFER_AFTER_SEC` süresinden (TUI ipucu gibi varsayılan 3 sn) uzun çalışmaya devam ettiğinde, bot oturum konusunda bir ⏪ **Send to background** düğmesi gönderir. Dokunmak OpenCode'un `session.background` fonksiyonunu çağırır: komut sunucuda çalışmaya devam ederken sohbete devam edersiniz ve normal tamamlama akışı bittiğinde sonucu teslim eder.

- Çalışan her oturum için bir öneri; komut önce biterse kaybolur.
- Gecikmeyi `BACKGROUND_OFFER_AFTER_SEC` ile ayarlayın.

## Subagent transkript konuları

Agent subagent'lar başlattığında, her biri üst konu kompakt bir 🧩 durum kartı tutarken kendi salt okunur transkript konusunu (`🧩 <açıklama>`) tam canlı transkriptle alır. Subagent bittiğinde, konusu yeniden adlandırılır (✅/❌) ve kapatılır. Ankete yanıtlar transkript konuları içinde çalışmaya devam eder; yeni promptlar bir bildirimle üst konuya yönlendirilir.

## Görüntüleme menüsü

`/display` sohbet başına bir menü açar: yalnızca çalıştırdığınız sohbet/konuya uygulanır (menü başlığındaki "Kapsam: yalnızca bu sohbet/konu" notuna bakın), asla global olarak. İçeriği:

- Düşünme, araç çağrıları, araç dosyaları, kod blokları, arka plan bildirimleri, PC prompt yansıması ve link önizlemeleri için göster/gizle geçişleri.
- Aynı sohbet/konu için menüyü agent seçicisine çeviren bir agent kısayol satırı (`🤖 Agent: <ad>`).
- Hiçbir şeyi değiştirmeden menüyü kapatan bir `❌ Cancel` düğmesi.

Geçersiz kılmalar `settings.json` içinde sohbet/konu başına saklanır; böylece her oturum konusu kendi görüntüleme kurulumunu tutar.

## Yapılandırma

### Yapılandırma konumu

- Kaynak modu yapılandırmayı depo kök dizininde saklar.
- Kurulu mod yapılandırmayı platformun uygulama veri dizininde saklar.
- `OPENCODE_TELEGRAM_HOME` ikisini de geçersiz kılar ve özel bir yapılandırma dizini zorlar.

Kurulu mod yapılandırma yolları:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Ortam değişkenleri

| Değişken | Açıklama | Zorunlu | Varsayılan |
| -------- | -------- | :-----: | ---------- |
| `TELEGRAM_BOT_TOKEN` | @BotFather'dan alınan bot token'ı | Evet | - |
| `TELEGRAM_ALLOWED_USER_ID` | Sayısal Telegram kullanıcı ID'niz | Evet | - |
| `TELEGRAM_PROXY_URL` | Telegram API için proxy URL'si (SOCKS5/HTTP) | Hayır | - |
| `OPENCODE_API_URL` | OpenCode sunucu adresi | Hayır | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION` | Sunucu API sürümü: `v1` veya `v2` | Hayır | `v1` |
| `OPENCODE_SERVER_USERNAME` | Sunucu kimlik doğrulama kullanıcı adı | Hayır | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Sunucu kimlik doğrulama şifresi | Hayır | - |
| `OPENCODE_MODEL_PROVIDER` | Varsayılan model sağlayıcısı | Evet | - |
| `OPENCODE_MODEL_ID` | Varsayılan model ID | Evet | - |
| `OPENCODE_AUTO_START` | Ulaşılabilir sunucu yoksa bot başlangıcında yönetilen bir OpenCode sunucusu başlatır | Hayır | `true` |
| `BOT_LOCALE` | Bot arayüz dili (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | Hayır | `en` |
| `SESSIONS_LIST_LIMIT` | `/sessions` içinde sayfa başına oturum | Hayır | `10` |
| `PROJECTS_LIST_LIMIT` | `/projects` içinde sayfa başına proje | Hayır | `10` |
| `COMMANDS_LIST_LIMIT` | `/commands` içinde sayfa başına komut | Hayır | `10` |
| `OPEN_BROWSER_ROOTS` | `/open` için izin verilen kök dizinler, virgülle ayrılmış | Hayır | ana dizin |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | Zamanlanmış bir görev için azami çalışma süresi, dakika cinsinden | Hayır | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Zamanlanmış görev yoklama aralığı, saniye cinsinden | Hayır | `30` |
| `BUDGET_ALERT_USD` | Günlük harcama uyarısı, USD (`0` = kapalı) | Hayır | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Servis mesaj aralığı; `>= 2` tutun, `0` = anında (`TOOL_MESSAGES_INTERVAL_SEC` eski takma ad olarak çalışmaya devam eder) | Hayır | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | ⏪ arka plana gönderme önerilmeden önceki shell/subagent çalışma süresi, saniye | Hayır | `3` |
| `HIDE_THINKING_MESSAGES` | `Thinking...` servis mesajlarını gizler | Hayır | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Araç çağrısı servis mesajlarını gizler | Hayır | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Belge olarak gönderilen araç dosyası mesajlarını gizler | Hayır | `false` |
| `CODE_BLOCKS_IN_TEXT` | Kod diff'lerini `.txt` belgeler yerine metin kod blokları olarak gösterir | Hayır | `true` |
| `TRACK_BACKGROUND_SESSIONS` | PC'den başlatılan arka plan oturumlarını takip eder ve Telegram'da bildirir | Hayır | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | Arka plan oturumu bildirimlerini gösterir (`/display` ile de çevrilebilir) | Hayır | `true` |
| `SHOW_PC_USER_MIRROR` | PC'de yazılan promptları konuya yansıtır (`/display` ile de çevrilebilir) | Hayır | `true` |
| `SHOW_LINK_PREVIEWS` | Asistan mesajlarının altında link önizlemeleri gösterir (`/display` ile de çevrilebilir) | Hayır | `true` |
| `MESSAGE_FORMAT_MODE` | Asistan yanıt biçimlendirme modu: `markdown` veya `raw` | Hayır | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Akış halindeki asistan güncellemeleri arasındaki gecikme, ms | Hayır | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Özetlerde `bash`/`execute` kodu için azami görüntülenen uzunluk | Hayır | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Belge olarak gönderilecek azami dosya boyutu (KB) | Hayır | `100` |
| `STT_API_URL` | Whisper uyumlu API taban adresi (`plain` için tam endpoint) | Hayır | - |
| `STT_API_KEY` | STT sağlayıcınız için API anahtarı (`plain` için gerekli değildir) | Hayır | - |
| `STT_PROTOCOL` | `openai` (anahtarla `{URL}/audio/transcriptions` POST) veya `plain` (`audio` wav alanıyla URL'e olduğu gibi POST, kimlik doğrulama yok; ffmpeg ile dönüştürülür) | Hayır | `openai` |
| `STT_AUDIO_FIELD` | Sesi taşıyan multipart alanı (varsayılanlar: openai için `file`, plain için `audio`) | Hayır | - |
| `STT_TIMEOUT_SEC` | Transkripsiyon başına zaman aşımı, saniye | Hayır | `60` |
| `STT_FFMPEG_PATH` | Mutlak ffmpeg yolu (plain mod wav dönüşümü; yalnızca ffmpeg PATH'te değilken gereklidir) | Hayır | - |
| `STT_MODEL` | `/audio/transcriptions` adresine aktarılan STT model adı | Hayır | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | İsteğe bağlı dil ipucu | Hayır | - |
| `STT_NOTE_PROMPT` | Transkripsiyon istekleriyle gönderilen isteğe bağlı ek prompt/not | Hayır | - |
| `TTS_API_URL` | TTS API taban adresi | Hayır | - |
| `TTS_API_KEY` | TTS API anahtarı | Hayır | - |
| `TTS_MODEL` | `/audio/speech` adresine aktarılan TTS model adı | Hayır | `gpt-4o-mini-tts` |
| `TTS_VOICE` | OpenAI uyumlu TTS ses adı | Hayır | `alloy` |
| `LOG_LEVEL` | Günlük seviyesi (`debug`, `info`, `warn`, `error`) | Hayır | `info` |
| `BOT_HEALTH_PORT` | `127.0.0.1` üzerindeki dahili health endpoint'inin (`/health`, `/health/live`, `/health/ready`) portu; `0` bunu devre dışı bırakır | Hayır | kapalı; Docker'da `3100` |

`.env` dosyanızı gizli tutun: içinde bot token'ınız bulunur. Tüm `/display` geçişleri sohbet/konuya göre uygulanır (değişikliği istediğiniz yerde `/display` çalıştırın); geçersiz kılmalar `settings.json` içinde saklanır.

### İsteğe bağlı: ses ve ses transkripsiyonu

`STT_API_URL` ayarlanmışsa, bot Telegram ses/audio mesajlarını OpenCode'a göndermeden önce transkribe eder (`openai` protokolü sunucuları için ek olarak `STT_API_KEY` gerekir).

Minimum özel worker'lar `STT_PROTOCOL=plain` ile desteklenir: bot, `audio` wav alanıyla ve kimlik doğrulama olmadan URL'e olduğu gibi POST yapar (wav olmayan girdi ffmpeg ile dönüştürülür, bu yüzden PATH üzerinde olmalıdır). İstekler sıralanır çünkü referans worker'lar tek CPU örneğidir.

TTS kimlik bilgileri yapılandırılmışsa, `/tts` sesli yanıtları global olarak açar/kapatır. Tercih `settings.json` içinde saklanır ve yeniden başlatmalarda korunur.

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Whisper uyumlu örnekler:

- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Together: `https://api.together.xyz/v1`

### Model seçici notları

- Favoriler yakın modellerden önce gösterilir.
- Geçerli model `✅` ile işaretlenir.
- `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` kaynaklı varsayılan model her zaman dahil edilir.

Favori eklemek için OpenCode TUI'yi açın ve bir model üzerinde `Cmd+F` / `Ctrl+F` tuşlarına basın.

## Sürümler

Sürümler, sürüm artışlarından tamamen otomatiktir; manuel etiketleme yoktur:

1. `package.json` içindeki sürümü yumuşatın (`npm version patch|minor|major` veya elle düzenleyin).
   - Release candidate'lar için bir `-rc.N` son eki kullanın: `1.2.3-rc.1` (`npm run release:rc` ile önizleme, `npm run release:notes:preview` ile notlar).
2. `main`e pushlayın. **Publish** workflow'u eksik etiketi algılar ve sırasıyla: lint → build → test → release notları üretimi → npm'e yayınlama (`latest`, `-rc` için `next`) → `vX.Y.Z` etiketini pushlama → GitHub Release oluşturma → çok mimarili konteyner imajını GHCR'ye yayınlama.
3. Sürüm yumuşatması olmayan pushlarda hiçbir şey olmaz: CI her push ve PR'da yine lint/build/test çalıştırır.

Yani: **commit ile release**: sürüm yumuşatması taşıyan herhangi bir `main` pushu gönderilir. Ön sürümler asla `latest` npm etiketine veya konteyner etiketine dokunmaz.

## Güvenlik

Yalnızca ID'si `TELEGRAM_ALLOWED_USER_ID` ile eşleşen Telegram kullanıcısı botu kullanabilir.

Bot yerel olarak çalıştığından ve yerel OpenCode sunucunuza bağlandığından, Telegram'ın kendisinin ötesinde dışa açık bir genel servis yoktur. İsteğe bağlı health endpoint (`BOT_HEALTH_PORT`) yalnızca `127.0.0.1` adresine bağlanır ve salt okunur durum sunar.

`.env` dosyanızı (varsayılan olarak yoksayılır) veya `settings.json` dosyasını (oturum ID'leri içeren çalışma zamanı durumu) asla commit etmeyin; ikisi de botu çalıştıran makinede kalır.

## Geliştirme

### Kaynak koddan çalıştırma

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Scriptler

| Script | Açıklama |
| ------ | -------- |
| `npm run dev` | Build alır ve başlatır |
| `npm run build` | TypeScript derler |
| `npm start` | Derlenmiş kodu çalıştırır |
| `npm run release:prepare` | Stabil release için sürüm yumuşatır |
| `npm run release:rc` | Release candidate için sürüm yumuşatır |
| `npm run release:notes:preview` | Release notlarını önizler |
| `npm run lint` | ESLint çalıştırır |
| `npm run format` | Prettier çalıştırır |
| `npm test` | Testleri çalıştırır |
| `npm run test:coverage` | Testleri coverage ile çalıştırır |

Bot kalıcı SSE ve polling bağlantıları sürdürdüğü için watcher kullanılmaz.

### Her değişiklikten önceki kontroller

```bash
npm run build && npm run lint && npm test
```

## Sorun giderme

**Bot yanıt vermiyor**

- `TELEGRAM_ALLOWED_USER_ID` değerinin gerçek Telegram kullanıcı ID'nizle eşleştiğini doğrulayın.
- Bot token'ın doğru olduğunu doğrulayın.
- Grup kullanımı için BotFather'da privacy mode'un devre dışı olduğundan emin olun (`/setprivacy` → Disable).

**OpenCode sunucusuna ulaşılamıyor**

- OpenCode sunucusunun çalıştığından emin olun (V1'de `opencode serve`, V2'de `opencode service start`; kimlik bilgisi isterse bir kez `opencode pair` çalıştırın).
- `OPENCODE_API_URL` (ve V2 için `OPENCODE_SERVER_VERSION`) değerinin doğru adrese işaret ettiğini doğrulayın.

**Yeni oturum konuları oluşturulamıyor**

- Grubun Topics'in etkin olduğu bir süpergrup olduğunu doğrulayın.
- Botun **Manage Topics** izniyle yönetici olduğunu doğrulayın.

**⏪ düğmesi hiç görünmüyor**

- Yalnızca `BACKGROUND_OFFER_AFTER_SEC` (varsayılan 3 sn) sonrasına kadar çalışmaya devam eden `bash`/`execute`/`task` araçları için gösterilir.
- Eşiği düşürün ve oturum konusunu kontrol edin: öneri orada gönderilir.

## Katkıda bulunanlar

Depo sahibi tarafından oluşturulur ve sürdürülür; topluluktan katkılarla.

**OpenCode (Muse Spark)** ile birlikte yazılmıştır: bu fork boyunca mimari, uygulama ve incelemede kullanılan AI pair-programmer.

Upstream proje: Ruslan Grinev'in [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) projesi.

## Lisans

[MIT](LICENSE)
