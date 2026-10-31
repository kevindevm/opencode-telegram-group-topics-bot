# OpenCode Telegram Group Topics Bot

[README bahasa Inggris](./README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Sebuah bot Telegram untuk [OpenCode](https://opencode.ai) yang mengubah satu supergroup Telegram menjadi klien seluler multi-sesi untuk OpenCode: topik **General** menjadi jalur kontrol, dan setiap sesi OpenCode mendapatkan topik forum-nya sendiri dengan streaming langsung, dashboard status yang dipin, antrean prompt, alur izin/pertanyaan, dan tombol kirim-ke-latar-belakang untuk perintah shell yang berjalan lama.

Proyek ini adalah fork dari [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) karya Ruslan Grinev.

- Gunakan proyek upstream jika Anda menginginkan alur kerja satu chat yang lebih sederhana.
- Gunakan fork ini jika Anda menginginkan topik **General** sebagai jalur kontrol, ditambah beberapa forum topic yang menjalankan sesi OpenCode secara paralel, yang bisa dikendalikan dari ponsel Anda.

Tanpa port terbuka, tanpa Web UI yang terekspos. Bot hanya berkomunikasi dengan server OpenCode lokal Anda dan Telegram Bot API. Server OpenCode V1 dan V2 didukung. Satu grup biasanya dipetakan ke satu repo; banyak topik sesi bisa berjalan paralel dalam satu grup, dan banyak grup bisa aktif pada saat yang sama.

Bahasa antarmuka bot: English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Catatan: [`README.md`](./README.md) bahasa Inggris tetap menjadi dokumentasi yang otoritatif. Jika ada perbedaan isi, versi bahasa Inggris yang berlaku.

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Sekilas

- Satu grup Telegram biasanya dipetakan ke satu repo / ruang kerja proyek.
- Topik **General** adalah jalur kontrol, untuk `/projects`, `/sessions`, `/recent`, `/new`, `/task`, dan pemeriksaan status.
- Setiap sesi OpenCode yang baru mendapatkan forum topic-nya sendiri.
- Setiap topik menyimpan status session, model, agent, dan dashboard-nya sendiri.
- Perintah shell yang berjalan lama menawarkan tombol ⏪ untuk mengirim sesi ke latar belakang agar Anda bisa terus mengobrol.
- Beberapa topik bisa berjalan bersamaan, dan beberapa grup bisa aktif sekaligus untuk proyek yang berbeda.
- DM lebih cocok untuk kontrol ringan dan pengecekan status, bukan pintu masuk utama alur kerja multi-sesi.

## Mulai Cepat

### 1. Persyaratan

- **Node.js 20+**
- **OpenCode** dari [opencode.ai](https://opencode.ai) atau [GitHub](https://github.com/sst/opencode)
- Sebuah bot Telegram dari [@BotFather](https://t.me/BotFather)
- ID pengguna Telegram (numerik) Anda dari [@userinfobot](https://t.me/userinfobot)

### 2. Membuat dan Menyiapkan Grup Telegram

1. Buat **supergroup** Telegram baru untuk satu proyek / repo OpenCode.
2. Tambahkan bot Anda ke grup dan jadikan admin dengan izin **Manage Topics**.
3. Aktifkan **Topics** di pengaturan grup.
4. Di [@BotFather](https://t.me/BotFather), jalankan `/setprivacy` untuk bot tersebut dan pilih **Disable**.
5. Biarkan topik default **General** tetap ada; itulah jalur kontrolnya.

### 3. Menjalankan OpenCode

Jalankan OpenCode di mesin tempat bot akan berjalan:

```bash
# V1
opencode serve
# V2: gunakan layanan latar belakang (port stabil + kredensial).
# `opencode serve` tanpa layanan mengikat port acak dengan password acak,
# sehingga bot tidak akan pernah bisa menjangkaunya.
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

#### Opsi C: Menjalankan dari source

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

Docker juga merupakan pilihan instalasi (option D). Lihat bagian Installation pada [`README.md`](./README.md) bahasa Inggris untuk detail lengkapnya: Docker Compose, Docker Desktop (macOS/Windows), dan image yang tersedia di GHCR.

### 5. Menyelesaikan Wizard Konfigurasi

Wizard akan menanyakan:

- bahasa antarmuka
- token bot Telegram
- ID pengguna Telegram yang diizinkan
- URL API OpenCode
- opsional: username / password server OpenCode

### 6. Verifikasi Pertama Kali

1. Kirim DM ke bot dan jalankan `/start`; pastikan bot membalas.
2. Di topik **General** grup, jalankan `/start`, lalu `/status` untuk memastikan OpenCode terjangkau.
3. Jalankan `/projects` di **General** dan pilih repo untuk grup ini.
4. Jalankan `/new` di **General** untuk membuat topik sesi.
5. Buka topik baru itu dan kirim sebuah prompt.

Jika semuanya berhasil, ruang kerja grup Anda siap digunakan.

## Alur Kerja Harian

1. Jalankan OpenCode (`opencode serve` di V1, `opencode service start` di V2), lalu jalankan bot.
2. Buka grup Telegram dan masuk ke **General**.
3. Gunakan `/projects` untuk memastikan repo yang dipilih.
4. Gunakan `/new` untuk membuat topik sesi baru.
5. Bekerja di dalam thread topik tersebut; jika perintah shell berjalan lama, ketuk ⏪ untuk mengirimnya ke latar belakang.
6. Gunakan `/sessions` di **General** untuk kembali ke jalur sesi yang lebih lama.

## Kerja Paralel dan Batas Rate Telegram

- Fork ini dirancang untuk kerja paralel: banyak thread topik dalam satu grup, dan banyak grup untuk banyak proyek.
- Telegram menerapkan batas rate pesan, terutama saat banyak topik menerima pembaruan sekaligus.
- Bot memperlambat atau mengatur jeda pembaruan Telegram bila diperlukan (lihat `SERVICE_MESSAGES_INTERVAL_SEC`, jaga nilainya `>= 2`).
- Sesi OpenCode tetap berjalan meskipun pembaruan Telegram menjadi lebih jarang: saat beban tinggi, harapkan output real-time per topik yang lebih sedikit, bukan pekerjaan yang hilang.

## Perintah

Pesan teks biasa di topik sesi diperlakukan sebagai prompt ketika tidak ada interaksi pemblokiran yang aktif. Pemilih model/agent tersedia dari keyboard bawah yang persisten, bukan sebagai slash command.

| Command           | Keterangan                                                     |
| ----------------- | -------------------------------------------------------------- |
| `/status`         | Status server dan sesi                                         |
| `/new`            | Buat sesi baru                                                 |
| `/abort`          | Batalkan tindakan yang sedang berjalan                         |
| `/sessions`       | Tampilkan daftar sesi                                          |
| `/recent`         | Telusuri sesi terbaru antar proyek                             |
| `/last`           | Tampilkan pesan sesi terakhir                                  |
| `/tts`            | Aktif/matikan balasan audio                                    |
| `/projects`       | Tampilkan daftar proyek                                        |
| `/open`           | Tambahkan proyek dengan menelusuri direktori                   |
| `/task`           | Buat tugas terjadwal                                           |
| `/tasklist`       | Tampilkan daftar tugas terjadwal                               |
| `/queue`          | Tampilkan dan kelola pesan yang mengantre                      |
| `/trust`          | Tingkat kepercayaan untuk persetujuan izin otomatis            |
| `/retry`          | Kirim ulang prompt terakhir                                    |
| `/diff`           | Tampilkan file yang berubah di sesi ini                        |
| `/commit`         | Commit perubahan sesi dengan pesan                             |
| `/compact`        | Padatkan konteks sesi                                          |
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

## Konfigurasi

### Lokasi Konfigurasi

- Mode source menyimpan konfigurasi di root repositori.
- Mode installed menyimpan konfigurasi di direktori app-data platform.
- `OPENCODE_TELEGRAM_HOME` menimpa keduanya dan memaksa direktori konfigurasi kustom.

Path konfigurasi mode installed:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Variabel Lingkungan Utama

| Variabel                     | Keterangan                                                          | Wajib | Default                                                          |
| ---------------------------- | ------------------------------------------------------------------- | :---: | ---------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`         | Token bot dari @BotFather                                           |  Yes  | -                                                                |
| `TELEGRAM_ALLOWED_USER_ID`   | ID pengguna Telegram (numerik) Anda                                 |  Yes  | -                                                                |
| `OPENCODE_API_URL`           | URL server OpenCode                                                 |  No   | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2)      |
| `OPENCODE_SERVER_VERSION`    | Versi API server: `v1` atau `v2`                                    |  No   | `v1`                                                             |
| `OPENCODE_SERVER_USERNAME`   | Username autentikasi server                                         |  No   | `opencode`                                                       |
| `OPENCODE_SERVER_PASSWORD`   | Password autentikasi server                                         |  No   | -                                                                |
| `OPENCODE_MODEL_PROVIDER`    | Penyedia model default                                              |  Yes  | -                                                                |
| `OPENCODE_MODEL_ID`          | ID model default                                                    |  Yes  | -                                                                |
| `OPENCODE_AUTO_START`        | Menjalankan server OpenCode terkelola saat bot start                |  No   | `true`                                                           |
| `BOT_LOCALE`                 | Bahasa antarmuka bot (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`)|  No   | `en`                                                             |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Interval pesan layanan; jaga `>= 2`                              |  No   | `5`                                                              |
| `BUDGET_ALERT_USD`           | Peringatan pengeluaran harian dalam USD (`0` = mati)                |  No   | `0`                                                              |
| `LOG_LEVEL`                  | Tingkat log (`debug`, `info`, `warn`, `error`)                      |  No   | `info`                                                           |

Tabel lengkap semua variabel lingkungan ada di bagian Configuration pada [`README.md`](./README.md) bahasa Inggris.

## Penanganan Masalah

**Bot tidak merespons**

- Pastikan `TELEGRAM_ALLOWED_USER_ID` cocok dengan ID pengguna Telegram asli Anda.
- Pastikan token bot benar.
- Untuk penggunaan di grup, pastikan mode privasi dinonaktifkan di BotFather (`/setprivacy` ke Disable).

**Server OpenCode tidak tersedia**

- Pastikan server OpenCode berjalan (`opencode serve` di V1, `opencode service start` di V2; lakukan pairing sekali dengan `opencode pair` jika server meminta kredensial).
- Pastikan `OPENCODE_API_URL` (dan `OPENCODE_SERVER_VERSION` untuk V2) menunjuk ke alamat yang benar.

**Tidak bisa membuat topik sesi baru**

- Pastikan grup adalah supergroup dengan Topics aktif.
- Pastikan bot adalah admin dengan izin **Manage Topics**.

**Tombol ⏪ tidak pernah muncul**

- Tombol ini hanya muncul untuk tool `bash`/`execute`/`task` yang masih berjalan setelah `BACKGROUND_OFFER_AFTER_SEC` (default 3 detik).
- Turunkan ambang waktunya, dan periksa topik sesi: penawaran tombol diposting di sana.

## Keamanan

Hanya pengguna Telegram yang ID-nya cocok dengan `TELEGRAM_ALLOWED_USER_ID` yang bisa menggunakan bot.

Karena bot berjalan secara lokal dan terhubung ke server OpenCode lokal Anda, tidak ada layanan publik yang terekspos selain Telegram itu sendiri. Health endpoint opsional hanya mengikat ke `127.0.0.1` dan hanya menyajikan status read-only.

Jangan pernah meng-commit `.env` (diabaikan secara default) atau `settings.json` (berisi state runtime dengan ID sesi); keduanya tetap berada di mesin yang menjalankan bot.

## Dokumentasi Lainnya

- English main docs: [`README.md`](./README.md)
- [`FORK_SYNC.md`](./FORK_SYNC.md)
- [`PRODUCT.md`](./PRODUCT.md)
- [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Lisensi

[MIT](LICENSE) - Proyek asli © Ruslan Grinev - Modifikasi fork © Shane Kunz
