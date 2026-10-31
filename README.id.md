# OpenCode Telegram Group Topics Bot

[README bahasa Inggris](./README.md)

[![CI](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevindevm/opencode-telegram-group-topics-bot)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: [English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Catatan: README bahasa Inggris ([README.md](./README.md)) tetap menjadi dokumentasi yang otoritatif. Terjemahan ini disediakan untuk kenyamanan; jika ada perbedaan, versi bahasa Inggris yang berlaku.

Sebuah bot Telegram ([grammy](https://grammy.dev/), Node.js 20+) yang mengubah satu supergroup Telegram menjadi **klien seluler multi-sesi untuk [OpenCode](https://opencode.ai)**: topik **General** adalah jalur kontrol, dan setiap sesi OpenCode mendapatkan forum topic-nya sendiri dengan streaming langsung, dashboard status yang di-pin, antrean prompt, alur izin/pertanyaan, serta tombol ⏪ kirim-ke-latar-belakang untuk perintah shell yang berjalan lama.

Proyek ini adalah fork dari [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) karya Ruslan Grinev. Gunakan proyek upstream untuk alur kerja satu chat yang lebih sederhana; gunakan fork ini untuk sesi paralel di forum topics yang dapat dikendalikan dari ponsel Anda.

Tanpa port terbuka, tanpa Web UI yang terekspos. Bot hanya berkomunikasi dengan server OpenCode lokal Anda dan Telegram Bot API. Server OpenCode V1 dan V2 didukung. Satu grup biasanya dipetakan ke satu repo; banyak topik sesi dapat berjalan paralel dalam satu grup, dan banyak grup dapat aktif pada saat yang sama.

Catatan sinkronisasi fork: [`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Daftar Isi

- [Sekilas](#sekilas)
- [Tangkapan Layar](#tangkapan-layar)
- [Fitur](#fitur)
- [Mulai Cepat](#mulai-cepat)
- [Alur Kerja Harian](#alur-kerja-harian)
- [Beban Kerja Paralel dan Batas Rate Telegram](#beban-kerja-paralel-dan-batas-rate-telegram)
- [Perintah](#perintah)
- [Tombol Latar Belakang](#tombol-latar-belakang)
- [Topik Transkrip Subagent](#topik-transkrip-subagent)
- [Menu Tampilan](#menu-tampilan)
- [Konfigurasi](#konfigurasi)
- [Rilis](#rilis)
- [Keamanan](#keamanan)
- [Pengembangan](#pengembangan)
- [Penanganan Masalah](#penanganan-masalah)
- [Kredit](#kredit)
- [Lisensi](#lisensi)

## Sekilas

- Satu grup Telegram dipetakan ke satu repo / ruang kerja proyek.
- Topik **General** adalah jalur kontrol: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, pemeriksaan status.
- Setiap sesi OpenCode baru mendapatkan forum topic-nya sendiri dengan status sesi, model, agent, dan tampilannya sendiri.
- Perintah shell yang berjalan lama menawarkan tombol ⏪ untuk mengirim sesi ke latar belakang sehingga Anda dapat terus mengobrol.
- Setiap subagent men-streaming ke topik transkrip read-only miliknya sendiri plus kartu status langsung di topik induk.
- Prompt yang diketik di PC Anda dicerminkan ke topik sesi sebagai pesan 🧑, sehingga kedua sisi tetap sinkron.
- Balasan audio TTS opsional diaktifkan/dinonaktifkan secara global dengan `/tts` dan bertahan melewati restart.
- DM untuk kontrol ringan dan penggunaan status, bukan alur kerja multi-sesi utama.

## Tangkapan Layar

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Session topic with live assistant streaming" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Pinned status dashboard and reply keyboard" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Model picker with favorites" />
</p>

## Fitur

- **Sesi tercakup per topik**: satu forum topic per sesi OpenCode; General tetap menjadi jalur kontrol dan tidak pernah mem-pin apa pun.
- **Streaming langsung**: balasan asisten di-streaming dengan edit yang sadar-thread dan pengiriman penyelesaian sebagai fallback.
- **⏪ Kirim ke latar belakang**: perintah `bash`/`execute` yang panjang menawarkan tombol yang mengirim sesi ke latar belakang melalui `session.background`.
- **🧩 Topik transkrip subagent**: setiap subagent mendapatkan topik read-only dengan transkrip langsung lengkap; topik induk menyimpan kartu status ringkas.
- **Dashboard yang di-pin**: pesan pinned per topik dengan sesi, proyek, model, penggunaan konteks, biaya, dan file yang berubah.
- **Antrean prompt**: prompt yang dikirim saat sesi sedang sibuk dimasukkan ke antrean, bertahan melewati restart, dan mendukung pembatalan per pesan, pindah-ke-depan, serta interrupt-and-run melalui `/queue`.
- **Izin dan pertanyaan**: alur interaktif `allow once` / `always` / `reject` dan polling pertanyaan dengan opsi bernomor lengkap di dalam pesan plus tombol bernomor singkat, teks kustom, dan jawaban suara; tingkat kepercayaan per sesi melalui `/trust ask|edits|all`.
- **Footer jawaban akhir**: hanya pesan terakhir dari satu giliran yang membawa footer `agent · model · elapsed` (`🛠️ Build · opus · 1m 30s`), sehingga akhir jawaban selalu mudah dikenali. Pesan sebelumnya dikirim polos.
- **Pemilih dan keyboard**: kontrol model, agent, variant, dan konteks dari keyboard persisten, favorit terlebih dahulu.
- **Menu `/display`**: saklar tampilkan/sembunyikan per chat/topik plus pintasan agent dan tombol Batal; pengaturan pengesampingan tersimpan di `settings.json`.
- **Manajemen sesi**: `/retry` untuk prompt terakhir, `/diff`, `/commit`, pelacakan pengeluaran `/cost` dengan `BUDGET_ALERT_USD`, `/close`, `/fork`, `/share`, `/rename`, `/refresh`, pintasan prompt tersimpan (`/saved`), perintah kustom (`/commands`), skills (`/skills`).
- **Tugas terjadwal**: topik terjadwal per proyek melalui `/task` dan `/tasklist` (pause/resume/run-now/logs).
- **Suara dan file**: STT kompatibel Whisper untuk suara/audio, TTS global opsional (`/tts`), lampiran gambar/PDF/teks, diff sebagai file atau blok kode inline.
- **Peramban proyek**: `/open` dan `/projects` dengan penjaga direktori yang diizinkan.
- **Kontrol server**: auto-start OpenCode, `/opencode_start` / `/opencode_stop` jarak jauh, `/reload` konfigurasi V2.
- **Kontrol akses satu pengguna**, tanpa port publik (health endpoint hanya mengikat ke `127.0.0.1`).
- **8 bahasa antarmuka** dengan fallback ke bahasa Inggris.

## Mulai Cepat

### 1. Prasyarat

- Node.js 20+
- OpenCode dari [opencode.ai](https://opencode.ai) atau [GitHub](https://github.com/sst/opencode)
- Sebuah bot Telegram dari [@BotFather](https://t.me/BotFather)
- ID pengguna Telegram numerik Anda dari [@userinfobot](https://t.me/userinfobot)

### 2. Membuat dan Menyiapkan Grup Telegram

1. Buat sebuah **supergroup** Telegram baru untuk satu proyek/repositori OpenCode.
2. Tambahkan bot Anda ke grup dan jadikan admin dengan izin **Manage Topics**.
3. Aktifkan **Topics** di pengaturan grup.
4. Di [@BotFather](https://t.me/BotFather), jalankan `/setprivacy` untuk bot tersebut dan pilih **Disable**.
5. Pertahankan topik default **General**, itulah jalur kontrolnya.

### 3. Menjalankan OpenCode

Jalankan OpenCode di mesin tempat bot akan berjalan:

```bash
# V1
opencode serve
# V2: use the background service (stable port + credentials).
# A bare `opencode serve` binds a random port with a random password,
# so the bot could never reach it.
opencode service start
```

URL API default: `http://localhost:4096` (V1) atau `http://127.0.0.1:49374` (V2, atur `OPENCODE_SERVER_VERSION=v2`).

### 4. Memasang Bot

#### Opsi A: `npx`

```bash
npx @kevindevm/opencode-telegram-group-topics-bot
```

#### Opsi B: Instalasi global

```bash
npm install -g @kevindevm/opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### Opsi C: Menjalankan dari kode sumber

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` adalah entrypoint CLI hasil kompilasi yang dibuat oleh `npm run build`.

#### Opsi D: Docker

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, OPENCODE_MODEL_PROVIDER, OPENCODE_MODEL_ID
docker compose up -d --build
```

`.env` tetap berada di host. File itu diinjeksikan saat runtime dan tidak disalin ke dalam image.

Konfigurasi dan state runtime berada di volume `opencode-group-topics-bot-data` (`OPENCODE_TELEGRAM_HOME=/app/data` di dalam container).

**Linux** (OpenCode di host pada `127.0.0.1:4096`): file compose default menggunakan `network_mode: host`, sehingga container dapat menjangkau server OpenCode di host Anda dan melihat path proyek yang sama.

**Docker Desktop** (macOS/Windows): host networking tidak tersedia, jadi gunakan file override, yang menjangkau OpenCode melalui `host.docker.internal`:

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

Di Docker Desktop, container tidak dapat melihat path proyek host atau menjalankan `opencode` sendiri: jalankan `opencode serve` (V1) atau `opencode service start` (V2) di host dan utamakan path `/projects` yang dapat diresolusi di dalam container (mount repo dengan entri `volumes` tambahan bila perlu). `/opencode_start` dan `/opencode_stop` adalah fitur khusus host.

Rilis stabil dipublikasikan ke `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:<version>` dan `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:latest` untuk `linux/amd64` dan `linux/arm64`. Release candidate hanya menerima tag versi persisnya.

#### Opsi E: Layanan Windows (NSSM, selalu aktif)

Untuk penyiapan 24/7 di Windows, jalankan bot sebagai layanan native dengan [NSSM](https://nssm.cc):

```powershell
# 1. Build once
npm install
npm run build

# 2. Register the service (elevated PowerShell, adjust paths)
nssm install OpenCodeTelegramBot "C:\Program Files\nodejs\node.exe" "E:\path\to\repo\dist\cli.js start --mode installed"
nssm set OpenCodeTelegramBot AppDirectory "E:\path\to\repo"
nssm set OpenCodeTelegramBot AppEnvironmentExtra "OPENCODE_TELEGRAM_HOME=C:\Users\<you>\AppData\Roaming\opencode-telegram-group-topics-bot"
nssm set OpenCodeTelegramBot Start SERVICE_AUTO_START

# 3. Start it
nssm start OpenCodeTelegramBot
```

Konfigurasi kemudian berada di `%APPDATA%\opencode-telegram-group-topics-bot\.env` (atau di mana pun `OPENCODE_TELEGRAM_HOME` menunjuk), layanan membaca file itu, bukan `.env` milik repo. Scheduled task yang menjalankan `opencode pair` saat logon menjaga CLI tetap ter-pair; layanan itu sendiri mengelola proses bot dan me-restart-nya saat gagal.

### 5. Menyelesaikan Wizard Penyiapan

Wizard menanyakan:

- bahasa antarmuka
- token bot Telegram
- ID pengguna Telegram yang diizinkan
- URL API OpenCode
- username/password server OpenCode (opsional)

### 6. Verifikasi Pertama Kali

1. Kirim DM ke bot dan jalankan `/start`; pastikan ia membalas.
2. Di topik **General** grup, jalankan `/start`, lalu `/status` untuk memastikan OpenCode dapat dijangkau.
3. Jalankan `/projects` di **General** dan pilih repo untuk grup ini.
4. Jalankan `/new` di **General** untuk membuat topik sesi.
5. Buka topik baru itu dan kirim sebuah prompt.

Jika itu berhasil, ruang kerja grup sudah siap.

## Alur Kerja Harian

1. Jalankan OpenCode (`opencode serve` di V1, `opencode service start` di V2), lalu jalankan bot.
2. Buka grup Telegram dan masuk ke **General**.
3. Gunakan `/projects` untuk memastikan repo yang dipilih.
4. Gunakan `/new` untuk membuat topik sesi baru.
5. Bekerja di dalam thread topik tersebut; jika perintah shell berjalan lama, ketuk ⏪ untuk mengirimnya ke latar belakang.
6. Gunakan `/sessions` di **General** untuk kembali ke jalur sesi yang lebih lama.

## Beban Kerja Paralel dan Batas Rate Telegram

- Fork ini dirancang untuk kerja paralel: banyak thread topik dalam satu grup, dan banyak grup lintas proyek.
- Telegram menerapkan batas rate pesan, terutama saat banyak topik menerima pembaruan sekaligus.
- Bot memperlambat atau mengatur jeda pembaruan Telegram bila diperlukan (lihat `SERVICE_MESSAGES_INTERVAL_SEC`, jaga nilai `>= 2`).
- Sesi OpenCode tetap berjalan meskipun pembaruan Telegram menjadi lebih jarang: pada beban tinggi, harapkan obrolan real-time per topik yang lebih sedikit, bukan pekerjaan yang hilang.

## Perintah

Pesan teks biasa apa pun di topik sesi diperlakukan sebagai prompt ketika tidak ada interaksi pemblokiran yang aktif. Aksi model, agent, variant, dan konteks tersedia dari keyboard bawah yang persisten.

| Command           | Keterangan                                                     |
| ----------------- | -------------------------------------------------------------- |
| `/status`         | Status server dan sesi                                         |
| `/new`            | Buat sesi baru                                                 |
| `/abort`          | Batalkan tindakan yang sedang berjalan                         |
| `/sessions`       | Tampilkan daftar sesi                                          |
| `/recent`         | Telusuri sesi terbaru antar proyek                             |
| `/last`           | Tampilkan pesan sesi terakhir                                  |
| `/tts`            | Aktifkan/matikan balasan audio                                 |
| `/projects`       | Tampilkan daftar proyek                                        |
| `/open`           | Tambahkan proyek dengan menelusuri direktori                   |
| `/task`           | Buat tugas terjadwal                                           |
| `/tasklist`       | Tampilkan daftar tugas terjadwal                               |
| `/queue`          | Tampilkan dan kelola pesan yang mengantre                      |
| `/trust`          | Tingkat kepercayaan untuk persetujuan izin otomatis            |
| `/retry`          | Kirim ulang prompt terakhir                                    |
| `/diff`           | Tampilkan file yang berubah di sesi ini                        |
| `/commit`         | Commit perubahan sesi dengan sebuah pesan                      |
| `/compact`        | Padatkan konteks sesi (tanpa perlu keyboard)                    |
| `/cost`           | Tampilkan pengeluaran sesi (termasuk subagent) dan harian      |
| `/close`          | Tutup topik sesi ini                                           |
| `/cleanup`        | Hapus topik transkrip subagent                                 |
| `/fork`           | Kloning sesi ini ke topik baru                                 |
| `/share`          | Ekspor transkrip sesi ini sebagai file                         |
| `/saved`          | Pintasan prompt tersimpan                                      |
| `/rename`         | Ganti nama sesi saat ini                                       |
| `/commands`       | Perintah kustom                                                |
| `/skills`         | Katalog skills                                                 |
| `/opencode_start` | Jalankan server OpenCode                                       |
| `/opencode_stop`  | Hentikan server OpenCode                                       |
| `/reload`         | Muat ulang konfigurasi server OpenCode (hanya V2)              |
| `/refresh`        | Segarkan informasi sesi                                        |
| `/display`        | Opsi tampilan untuk chat ini (saklar + agent)                  |
| `/help`           | Bantuan                                                        |

`/start` hanya untuk DM (handshake bot). Pemilih model/agent berupa tombol keyboard, bukan slash command.

## Tombol Latar Belakang

Ketika tool shell (`bash`/`execute`) atau subagent (`task`) terus berjalan lebih lama dari `BACKGROUND_OFFER_AFTER_SEC` (default 3 detik, seperti petunjuk di TUI), bot memposting tombol ⏪ **Kirim ke latar belakang** di topik sesi. Mengetuknya memanggil `session.background` milik OpenCode: perintah tetap berjalan di server sementara Anda terus mengobrol, dan alur penyelesaian normal mengirimkan hasilnya saat selesai.

- Satu penawaran per sesi yang berjalan; penawaran itu hilang jika perintah selesai lebih dulu.
- Sesuaikan jeda dengan `BACKGROUND_OFFER_AFTER_SEC`.

## Topik Transkrip Subagent

Ketika agent memunculkan subagent, masing-masing mendapatkan topik transkrip read-only miliknya sendiri (`🧩 <description>`) dengan transkrip langsung lengkap, sementara topik induk menyimpan kartu status 🧩 ringkas. Ketika subagent selesai, topiknya diganti nama (✅/❌) dan ditutup. Jawaban polling tetap berfungsi di dalam topik transkrip; prompt baru dialihkan ke topik induk dengan sebuah pemberitahuan.

## Menu Tampilan

`/display` membuka menu per chat: menu itu selalu berlaku untuk chat/topik tempat Anda menjalankannya (lihat catatan "Scope: this chat/topic only" di judul menu), tidak pernah global. Menu itu berisi:

- Saklar tampilkan/sembunyikan untuk thinking, pemanggilan tool, file tool, blok kode, pemberitahuan latar belakang, cerminan prompt PC, dan pratinjau tautan.
- Baris pintasan agent (`🤖 Agent: <name>`) yang mengganti menu menjadi pemilih agent untuk chat/topik yang sama.
- Tombol `❌ Cancel` yang menutup menu tanpa mengubah apa pun.

Pengaturan pengesampingan tersimpan per chat/topik di `settings.json`, sehingga setiap topik sesi mempertahankan penataan tampilannya sendiri.

## Konfigurasi

### Lokasi Konfigurasi

- Mode kode sumber menyimpan konfigurasi di root repositori.
- Mode terpasang menyimpan konfigurasi di direktori app-data platform.
- `OPENCODE_TELEGRAM_HOME` mengesampingkan keduanya dan memaksa direktori konfigurasi kustom.

Path konfigurasi mode terpasang:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Variabel Lingkungan

| Variabel | Keterangan | Wajib | Default |
| -------- | ----------- | :----: | ------- |
| `TELEGRAM_BOT_TOKEN` | Token bot dari @BotFather | Ya | - |
| `TELEGRAM_ALLOWED_USER_ID` | ID pengguna Telegram numerik Anda | Ya | - |
| `TELEGRAM_PROXY_URL` | URL proxy untuk Telegram API (SOCKS5/HTTP) | Tidak | - |
| `OPENCODE_API_URL` | URL server OpenCode | Tidak | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION` | Versi API server: `v1` atau `v2` | Tidak | `v1` |
| `OPENCODE_SERVER_USERNAME` | Username autentikasi server | Tidak | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Password autentikasi server | Tidak | - |
| `OPENCODE_MODEL_PROVIDER` | Penyedia model default | Ya | - |
| `OPENCODE_MODEL_ID` | ID model default | Ya | - |
| `OPENCODE_AUTO_START` | Menjalankan server OpenCode terkelola saat bot dimulai bila tidak ada yang dapat dijangkau | Tidak | `true` |
| `BOT_LOCALE` | Bahasa UI bot (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | Tidak | `en` |
| `SESSIONS_LIST_LIMIT` | Sesi per halaman di `/sessions` | Tidak | `10` |
| `PROJECTS_LIST_LIMIT` | Proyek per halaman di `/projects` | Tidak | `10` |
| `COMMANDS_LIST_LIMIT` | Perintah per halaman di `/commands` | Tidak | `10` |
| `OPEN_BROWSER_ROOTS` | Direktori root yang diizinkan untuk `/open`, dipisah koma | Tidak | direktori home |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | Waktu eksekusi maksimum untuk tugas terjadwal, dalam menit | Tidak | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Interval polling tugas terjadwal, dalam detik | Tidak | `30` |
| `BUDGET_ALERT_USD` | Peringatan pengeluaran harian dalam USD (`0` = mati) | Tidak | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Interval pesan layanan; jaga `>= 2`, `0` = langsung (`TOOL_MESSAGES_INTERVAL_SEC` masih berfungsi sebagai alias lama) | Tidak | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | Detik runtime shell/subagent sebelum menawarkan ⏪ kirim-ke-latar-belakang | Tidak | `3` |
| `HIDE_THINKING_MESSAGES` | Sembunyikan pesan layanan `Thinking...` | Tidak | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Sembunyikan pesan layanan pemanggilan tool | Tidak | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Sembunyikan pesan file tool yang dikirim sebagai dokumen | Tidak | `false` |
| `CODE_BLOCKS_IN_TEXT` | Tampilkan diff kode sebagai blok kode teks alih-alih dokumen `.txt` | Tidak | `true` |
| `TRACK_BACKGROUND_SESSIONS` | Lacak sesi latar belakang yang dimulai dari PC dan beri tahu di Telegram | Tidak | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | Tampilkan pemberitahuan sesi latar belakang (juga bisa dibalik lewat `/display`) | Tidak | `true` |
| `SHOW_PC_USER_MIRROR` | Cerminan prompt yang diketik di PC ke dalam topik (juga bisa dibalik lewat `/display`) | Tidak | `true` |
| `SHOW_LINK_PREVIEWS` | Tampilkan pratinjau tautan di bawah pesan asisten (juga bisa dibalik lewat `/display`) | Tidak | `true` |
| `MESSAGE_FORMAT_MODE` | Mode format balasan asisten: `markdown` atau `raw` | Tidak | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Jeda antar pembaruan asisten yang di-streaming, dalam ms | Tidak | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Panjang tampilan maksimum untuk kode `bash`/`execute` dalam ringkasan | Tidak | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Ukuran file maksimum (KB) untuk dikirim sebagai dokumen | Tidak | `100` |
| `STT_API_URL` | URL dasar API kompatibel Whisper (atau endpoint lengkap untuk `plain`) | Tidak | - |
| `STT_API_KEY` | API key untuk penyedia STT Anda (tidak diperlukan untuk `plain`) | Tidak | - |
| `STT_PROTOCOL` | `openai` (POST `{URL}/audio/transcriptions` dengan key) atau `plain` (POST URL apa adanya dengan field `audio` wav, tanpa autentikasi; dikonversi dengan ffmpeg) | Tidak | `openai` |
| `STT_AUDIO_FIELD` | Field multipart yang membawa audio (default: `file` untuk openai, `audio` untuk plain) | Tidak | - |
| `STT_TIMEOUT_SEC` | Batas waktu per transkripsi dalam detik | Tidak | `60` |
| `STT_FFMPEG_PATH` | Path absolut ffmpeg (konversi wav mode plain; hanya diperlukan bila ffmpeg tidak ada di PATH) | Tidak | - |
| `STT_MODEL` | Nama model STT yang dikirim ke `/audio/transcriptions` | Tidak | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | Petunjuk bahasa opsional | Tidak | - |
| `STT_NOTE_PROMPT` | Prompt/catatan tambahan opsional yang dikirim bersama permintaan transkripsi | Tidak | - |
| `TTS_API_URL` | URL dasar API TTS | Tidak | - |
| `TTS_API_KEY` | API key TTS | Tidak | - |
| `TTS_MODEL` | Nama model TTS yang dikirim ke `/audio/speech` | Tidak | `gpt-4o-mini-tts` |
| `TTS_VOICE` | Nama voice TTS kompatibel OpenAI | Tidak | `alloy` |
| `LOG_LEVEL` | Tingkat log (`debug`, `info`, `warn`, `error`) | Tidak | `info` |
| `BOT_HEALTH_PORT` | Port health endpoint internal (`/health`, `/health/live`, `/health/ready`) di `127.0.0.1`; `0` menonaktifkannya | Tidak | mati; `3100` di Docker |

Jaga `.env` Anda tetap privat, file itu berisi token bot Anda. Semua flag `/display` berlaku per chat/topik (jalankan `/display` di tempat Anda ingin perubahannya); pengaturan pengesampingan tersimpan di `settings.json`.

### Opsional: Suara dan Transkripsi Audio

Jika `STT_API_URL` diatur, bot mentranskripsi pesan suara/audio Telegram sebelum mengirimkannya ke OpenCode (`STT_API_KEY` tambahan diperlukan untuk server dengan protokol `openai`).

Worker kustom minimal didukung melalui `STT_PROTOCOL=plain`: bot melakukan POST ke URL apa adanya dengan field `audio` wav dan tanpa autentikasi (input non-wav dikonversi dengan ffmpeg, jadi ffmpeg harus ada di PATH). Permintaan diserialisasi karena worker referensi adalah instansi CPU tunggal.

Jika kredensial TTS dikonfigurasi, `/tts` mengaktifkan/menonaktifkan balasan suara secara global. Preferensi disimpan di `settings.json` dan bertahan melewati restart.

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Contoh kompatibel Whisper:

- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Together: `https://api.together.xyz/v1`

### Catatan Pemilih Model

- Favorit ditampilkan sebelum model terbaru.
- Model saat ini ditandai dengan `✅`.
- Model default dari `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` selalu disertakan.

Untuk menambah favorit, buka TUI OpenCode dan tekan `Cmd+F` / `Ctrl+F` pada sebuah model.

## Rilis

Rilis sepenuhnya diotomatisasi dari kenaikan versi, tanpa tagging manual:

1. Naikkan versi di `package.json` (`npm version patch|minor|major`, atau edit manual).
   - Gunakan akhiran `-rc.N` untuk release candidate: `1.2.3-rc.1` (pratinjau dengan `npm run release:rc`, catatan dengan `npm run release:notes:preview`).
2. Push ke `main`. Workflow **Publish** mendeteksi tag yang belum ada lalu, secara berurutan: lint → build → test → membuat catatan rilis → publish ke npm (`latest`, atau `next` untuk `-rc`) → push tag `vX.Y.Z` → membuat GitHub Release → mempublikasikan image container multi-arsitektur ke GHCR.
3. Tidak terjadi apa pun pada push tanpa kenaikan versi, CI tetap menjalankan lint/build/test pada setiap push dan PR.

Jadi: **rilis lewat commit**, setiap push ke `main` yang membawa kenaikan versi langsung dirilis. Pre-release tidak pernah menyentuh tag npm `latest` maupun tag container.

## Keamanan

Hanya pengguna Telegram yang ID-nya cocok dengan `TELEGRAM_ALLOWED_USER_ID` yang dapat menggunakan bot.

Karena bot berjalan secara lokal dan terhubung ke server OpenCode lokal Anda, tidak ada layanan publik yang terekspos selain Telegram itu sendiri. Health endpoint opsional (`BOT_HEALTH_PORT`) hanya mengikat ke `127.0.0.1` dan menyajikan status read-only.

Jangan pernah meng-commit `.env` Anda (diabaikan secara default) atau `settings.json` (state runtime dengan ID sesi); keduanya tetap berada di mesin yang menjalankan bot.

## Pengembangan

### Menjalankan dari kode sumber

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Skrip

| Skrip | Keterangan |
| ----- | ---------- |
| `npm run dev` | Build dan mulai |
| `npm run build` | Kompilasi TypeScript |
| `npm start` | Jalankan kode hasil kompilasi |
| `npm run release:prepare` | Naikkan versi untuk rilis stabil |
| `npm run release:rc` | Naikkan versi untuk release candidate |
| `npm run release:notes:preview` | Pratinjau catatan rilis |
| `npm run lint` | Jalankan ESLint |
| `npm run format` | Jalankan Prettier |
| `npm test` | Jalankan tes |
| `npm run test:coverage` | Jalankan tes dengan coverage |

Tidak ada watcher yang digunakan karena bot menjaga koneksi SSE dan polling yang persisten.

### Pemeriksaan sebelum setiap perubahan

```bash
npm run build && npm run lint && npm test
```

## Penanganan Masalah

**Bot tidak merespons**

- Pastikan `TELEGRAM_ALLOWED_USER_ID` cocok dengan ID pengguna Telegram asli Anda.
- Pastikan token bot benar.
- Untuk penggunaan di grup, pastikan mode privasi dinonaktifkan di BotFather (`/setprivacy` → Disable).

**Server OpenCode tidak tersedia**

- Pastikan server OpenCode berjalan (`opencode serve` di V1, `opencode service start` di V2; lakukan pairing sekali dengan `opencode pair` jika server meminta kredensial).
- Pastikan `OPENCODE_API_URL` (dan `OPENCODE_SERVER_VERSION` untuk V2) menunjuk ke alamat yang benar.

**Tidak bisa membuat topik sesi baru**

- Pastikan grup adalah supergroup dengan Topics aktif.
- Pastikan bot adalah admin dengan izin **Manage Topics**.

**Tombol ⏪ tidak pernah muncul**

- Tombol ini hanya muncul untuk tool `bash`/`execute`/`task` yang masih berjalan setelah `BACKGROUND_OFFER_AFTER_SEC` (default 3 detik).
- Turunkan ambang waktunya, dan periksa topik sesi, penawaran tombol diposting di sana.

## Kredit

Dibuat dan dipelihara oleh pemilik repositori, dengan kontribusi dari komunitas.

Ditulis bersama dengan **OpenCode (Muse Spark)**, AI pair-programmer yang digunakan untuk arsitektur, implementasi, dan review di seluruh fork ini.

Repositori ini adalah fork yang dikelola oleh [kevindevm](https://github.com/kevindevm), dengan dukungan group-topics di atas proyek upstream.

Proyek upstream: [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) karya Ruslan Grinev.

## Lisensi

[MIT](LICENSE)
