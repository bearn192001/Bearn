# BEARN SQL
Run `BEARN_MASTER.sql` in Supabase SQL Editor, or execute numbered files in order. Supabase Auth handles login/register; `profiles` stores public profile metadata.

Payment gateway is deliberately not implemented. Do not mark orders paid from browser code. A trusted provider webhook/Edge Function must verify provider signatures, update order status and credit wallet balances atomically.

Admin policies should be added only after defining an explicit admin authorization strategy (e.g. protected role claims / server-side checks). Never grant users direct update rights to wallet balances or payment status.

Profile role changes are guarded against self-promotion. Admin role assignment must be performed through a trusted server-side process, not a browser update.


## Kesesuaian halaman dan database
- `login.js` / `register.js` memakai Supabase Auth; profil dan wallet dibuat oleh trigger setelah SQL domain 00 dan 01 dipasang.
- `buat-link.js`, `my-link.js`, dan `posts.js` memakai `auto_links` serta `payment_links` sesuai kolom pada SQL 02 dan 03.
- `dashboard.js`, `saldo.js`, dan `withdraw.js` memakai `wallet_accounts` serta `withdraw_requests` dari SQL 01 dan 07.
- File JS halaman lain saat ini merupakan entry point khusus halaman yang menjalankan inisialisasi bersama; modul CRUD-nya belum diimplementasikan dan tidak boleh dianggap sudah aktif.
- CSS tiap halaman (`css/<nama-halaman>.css`) mengimpor `css/global.css`, sehingga gaya inti konsisten dan penyesuaian khusus halaman tetap terpisah.

- Jalankan `08_link_sales_checkout.sql` setelah migrasi 00–07 untuk order Auto Link, pencatatan penjualan, saldo hasil pembayaran, dan RPC metrik dashboard/My Link.
- Payment status `paid` hanya boleh diubah oleh webhook server yang sudah memverifikasi tanda tangan provider.
