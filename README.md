# BEARN — clean root project

## Structure
- Root: one HTML file per page; no duplicated `public/` directory.
- `components/`: shared navbar and footer, imported by `components/components.js`.
- `css/`: shared design system and page styles.
- `js/`: config, core, auth, links and wallet modules.
- `sql/`: separate schema modules plus consolidated `BEARN_MASTER.sql`.

## Setup
1. Deploy this folder as the static site root (Cloudflare Pages output directory `.`). Do not configure `public` as output.
2. Masukkan Supabase URL dan anon key publik (anon key) di `js/config.js`. Jangan pernah memasukkan service_role key ke frontend.
3. Run `sql/BEARN_MASTER.sql` in Supabase SQL Editor.
4. Configure Supabase Auth redirect URLs for your deployed domain.

## Important implementation status
The visual shell, shared imports, auth form wiring, link creation/listing and wallet/withdraw request UI are prepared. Payment gateway checkout, signed webhook, atomic wallet crediting, redirect/click tracking endpoint, admin moderation and production security policies remain integration work. QRIS/DANA are not active and no real payment is accepted in this build. The public short route `/l/:slug` requires a server/edge function before production.

## Pricing rule
Payment Link platform fee = 10% of gross amount; creator net = gross minus fee. Values are calculated in SQL generated columns, not trusted from the browser.


## Status implementasi (audit ulang)
- Sudah tersambung ke Supabase JS: autentikasi, pembuatan Auto Link, pembuatan Payment Link, daftar My Link, daftar Posts, baca saldo, dan pengajuan withdraw.
- Kolom `platform_fee` dan `creator_net` pada Payment Link dihitung otomatis oleh PostgreSQL; frontend tidak mengirim dua kolom tersebut.
- Biaya Payment Link dihitung 10% dan ditampilkan saat pembuatan. Pembayaran belum dapat diproses sampai gateway dan webhook tepercaya dibuat.
- Top-up, riwayat transaksi, pengelolaan endorse/referral/chat/notifikasi/profil, panel admin, serta redirect publik `/l/:slug` masih memerlukan implementasi lanjutan.
- Tampilan memakai satu sistem CSS global (`base.css` + `pages.css`) dan navbar/footer komponen bersama. Fondasi visual seragam sudah ada, tetapi belum berarti seluruh halaman selesai secara visual/fungsional.
