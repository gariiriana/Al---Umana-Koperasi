# Pengujian perbaikan kurir

Jalankan dari root proyek setelah dependency frontend terpasang:

```powershell
npm --prefix frontend test -- --reporter=dot
npm --prefix frontend run build
npm run test:courier-rules
```

Tes rules membutuhkan Firebase CLI dan Java 21 atau lebih baru di `PATH`.
Konfigurasi `firebase.test.json` menggunakan proyek demo `demo-courier-fixes`
dan port lokal 8088. Tes ini tidak mengakses data produksi.

Tes regresi mencakup identitas UID kurir/kenek, penugasan kosong atau ambigu,
empat foto bukti MBG, status produksi sebelum penyelesaian, penugasan yang
berubah saat form terbuka, notifikasi kurir lama, sinkronisasi checklist,
dan pembatasan baca/tulis Firestore. Suite rules dilewati dalam tes unit biasa
dan dijalankan oleh perintah emulator di atas.

Perubahan frontend dan `firestore.rules` perlu dirilis bersama. Penugasan MBG
lama yang memakai ID dari nama diperbaiki saat distribusi menyinkronkan tugas
dengan akun terdaftar. Penugasan katering yang masih memakai nama perlu
ditugaskan ulang melalui pilihan akun kurir agar menyimpan UID.
