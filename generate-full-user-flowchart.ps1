Add-Type -AssemblyName System.Drawing

$W = 2400; $H = 3500
$img = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($img)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.Color]::FromArgb(249,250,252))

$title = New-Object System.Drawing.Font('Segoe UI', 40, [System.Drawing.FontStyle]::Bold)
$section = New-Object System.Drawing.Font('Segoe UI', 26, [System.Drawing.FontStyle]::Bold)
$head = New-Object System.Drawing.Font('Segoe UI', 21, [System.Drawing.FontStyle]::Bold)
$body = New-Object System.Drawing.Font('Segoe UI', 16)
$small = New-Object System.Drawing.Font('Segoe UI', 14)
$ink = [System.Drawing.Color]::FromArgb(23,35,51)
$muted = [System.Drawing.Color]::FromArgb(74,88,106)
$grey = [System.Drawing.Color]::FromArgb(236,241,246)
$border = [System.Drawing.Color]::FromArgb(128,145,163)

function B([int]$x,[int]$y,[int]$w,[int]$h,[string]$h1,[string]$t,[System.Drawing.Color]$fill,[System.Drawing.Color]$stroke) {
  $brush = New-Object System.Drawing.SolidBrush $fill; $pen = New-Object System.Drawing.Pen $stroke,2
  $g.FillRectangle($brush,$x,$y,$w,$h); $g.DrawRectangle($pen,$x,$y,$w,$h)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment='Center'; $fmt.LineAlignment='Center'
  $g.DrawString($h1,$head,(New-Object System.Drawing.SolidBrush $ink),(New-Object System.Drawing.RectangleF ($x+16),($y+10),($w-32),35),$fmt)
  $g.DrawString($t,$body,(New-Object System.Drawing.SolidBrush $muted),(New-Object System.Drawing.RectangleF ($x+20),($y+48),($w-40),($h-58)),$fmt)
  $brush.Dispose();$pen.Dispose();$fmt.Dispose()
}
function A([int]$x1,[int]$y1,[int]$x2,[int]$y2) {
  $p=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(106,121,140)),3
  $c=New-Object System.Drawing.Drawing2D.AdjustableArrowCap 7,9,$true; $p.CustomEndCap=$c
  $g.DrawLine($p,$x1,$y1,$x2,$y2);$c.Dispose();$p.Dispose()
}
function S([int]$y,[string]$t,[System.Drawing.Color]$c) {
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $c),70,$y,2260,47)
  $g.DrawString($t,$section,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)),92,($y+7))
}
function T([int]$x,[int]$y,[int]$w,[string]$text) {
  $fmt=New-Object System.Drawing.StringFormat;$fmt.Alignment='Center'
  $g.DrawString($text,$small,(New-Object System.Drawing.SolidBrush $muted),(New-Object System.Drawing.RectangleF $x,$y,$w,26),$fmt);$fmt.Dispose()
}

$blue=[System.Drawing.Color]::FromArgb(223,239,255);$blueB=[System.Drawing.Color]::FromArgb(47,117,181)
$green=[System.Drawing.Color]::FromArgb(225,246,238);$greenB=[System.Drawing.Color]::FromArgb(43,142,109)
$orange=[System.Drawing.Color]::FromArgb(255,244,222);$orangeB=[System.Drawing.Color]::FromArgb(191,129,36)
$purple=[System.Drawing.Color]::FromArgb(244,232,253);$purpleB=[System.Drawing.Color]::FromArgb(138,75,186)
$rose=[System.Drawing.Color]::FromArgb(253,231,236);$roseB=[System.Drawing.Color]::FromArgb(189,69,98)

$g.DrawString('AL UMANA - PETA ALUR PENGGUNA & SELURUH PERAN',$title,(New-Object System.Drawing.SolidBrush $ink),75,38)
$g.DrawString('Versi operasional: menjelaskan apa yang dilihat dan dikerjakan setiap pengguna setelah fitur Performance SDM diterapkan.',$body,(New-Object System.Drawing.SolidBrush $muted),78,94)

B 840 145 720 90 'MASUK SISTEM' 'Login - sistem membaca peran pengguna dan membuka dashboard yang sesuai.' $blue $blueB
A 1200 235 1200 285
S 285 '1. AKSES AWAL: PENGGUNA MASUK SESUAI PERAN' $blueB
B 100 360 390 105 'Pelanggan' 'Belanja produk, buat pesanan, bayar, lalu lacak pesanan.' $blue $blueB
B 540 360 390 105 'Tim Catering' 'Admin, MO, Produksi, Distribusi, Kurir, Monitoring.' $green $greenB
B 980 360 390 105 'Tim MBG' 'Admin MBG, Produksi, Purchasing, Dokumentasi, Distribusi, Kurir.' $orange $orangeB
B 1410 360 390 105 'Pimpinan' 'Super Admin melihat performa seluruh SDM dan mengatur penugasan.' $purple $purpleB
B 1850 360 390 105 'Akun Pendukung' 'Pengaturan profil, notifikasi, bantuan, dan riwayat aktivitas.' $grey $border

S 520 '2. FLOW PELANGGAN & PESANAN CATERING' $blueB
B 100 600 340 115 'Pelanggan' 'Cari produk - masukkan keranjang - checkout - buat pesanan.' $blue $blueB
A 440 657 495 657
B 495 600 340 115 'Admin Catering' 'Terima pesanan, atur detail, invoice, jadwal, dan kebutuhan operasional.' $green $greenB
A 835 657 890 657
B 890 600 340 115 'Tim Produksi' 'Mulai produksi, masak, cek proses, lalu tandai siap dikirim.' $green $greenB
A 1230 657 1285 657
B 1285 600 340 115 'Distribusi' 'Atur jadwal kirim, handover makanan, dan tetapkan kurir.' $green $greenB
A 1625 657 1680 657
B 1680 600 340 115 'Kurir Catering' 'Ambil tugas, antar pesanan, unggah foto dan tanda tangan penerima.' $green $greenB
A 2020 657 2075 657
B 2075 600 225 115 'Selesai' 'Pelanggan menerima pesanan dan status menjadi selesai.' $blue $blueB
T 140 735 2080 'Status pesanan: Pending - Produksi - QC / Siap Kirim - Dalam Pengiriman - Selesai. Bila pengiriman gagal, jadwal dapat diulang.'

S 805 '3. FLOW JOB DESK HARIAN CATERING' $greenB
B 100 885 380 125 'MO Katering' 'Membuat atau impor job desk, pilih divisi, PIC/role, waktu, dan referensi pesanan.' $green $greenB
A 480 947 535 947
B 535 885 380 125 'Petugas Operasional' 'Produksi 1/2, Distribusi 1/2, Produksi MBG 2, atau Distribusi MBG 2 menerima tugas.' $green $greenB
A 915 947 970 947
B 970 885 380 125 'Kerjakan & Submit' 'Tandai selesai atau belum selesai, sertakan alasan bila diperlukan.' $green $greenB
A 1350 947 1405 947
B 1405 885 380 125 'CO-MO Katering' 'Memeriksa hasil. Setujui bila benar atau kirim revisi disertai catatan.' $green $greenB
A 1785 947 1840 947
B 1840 885 460 125 'Hasil Tercatat' 'Tugas disetujui tersimpan pada riwayat pekerjaan dan capaian performa petugas.' $blue $blueB
A 1595 1010 725 1060
T 1300 1022 570 'Jika revisi: petugas memperbaiki lalu submit kembali.'

S 1130 '4. FLOW OPERASIONAL MBG (MAKAN BERGIZI GRATIS)' $orangeB
B 100 1210 330 135 'Admin MBG' 'Buat batch/PM, input institusi, jadwal, jumlah porsi, menu, dan dokumen kegiatan.' $orange $orangeB
A 430 1277 475 1277
B 475 1210 330 135 'Purchasing & Sub Purchasing' 'Siapkan kebutuhan belanja, supplier, pembelian, dan rekap harian.' $orange $orangeB
A 805 1277 850 1277
B 850 1210 330 135 'Produksi MBG' 'Kelola rencana produksi, masak, hasil produksi, dan data menu.' $orange $orangeB
A 1180 1277 1225 1277
B 1225 1210 330 135 'Dokumentasi Produksi' 'Lengkapi foto dan catatan aktivitas produksi.' $orange $orangeB
A 1555 1277 1600 1277
B 1600 1210 330 135 'Distribusi MBG' 'QC barang masuk, buat tugas pengantaran, dan serah-terima ke kurir.' $orange $orangeB
A 1930 1277 1975 1277
B 1975 1210 325 135 'Kurir MBG' 'Antar ke institusi, unggah bukti kirim, lalu laporan/arsip diperbarui.' $orange $orangeB
T 110 1370 2160 'Admin MBG dan Produksi MBG dapat melihat administrasi, batch, produksi, laporan, pesanan, distribusi, dan pengantaran sesuai akses sistem.'

S 1440 '5. PERAN PENDUKUNG & PENGAWASAN' $roseB
B 100 1520 470 125 'Monitoring' 'Melihat dashboard, pesanan, jadwal, dan status operasional secara baca-saja.' $rose $roseB
B 640 1520 470 125 'Admin' 'Kelola pesanan, katalog produk, kategori, invoice, promo, dan konfigurasi operasional.' $rose $roseB
B 1180 1520 470 125 'Produksi / Distribusi Lama' 'Akses tetap dipertahankan untuk flow lama: produksi, jadwal, handover, dan penugasan kurir.' $rose $roseB
B 1720 1520 580 125 'Notifikasi & Riwayat' 'Setiap user menerima pemberitahuan tugas, perubahan status, revisi, serta dapat membuka riwayatnya.' $rose $roseB

S 1715 '6. FITUR BARU: SUPER ADMIN & PERFORMANCE CONTROL CENTER' $purpleB
B 100 1795 420 135 'Kelola Personel' 'Cari user, lihat peran saat ini, lalu ubah peran/divisi dengan tanggal mulai berlaku.' $purple $purpleB
A 520 1862 575 1862
B 575 1795 420 135 'Beri Tugas Tambahan' 'Pilih personel, isi instruksi, prioritas, deadline, dan bukti yang wajib dikirim.' $purple $purpleB
A 995 1862 1050 1862
B 1050 1795 420 135 'Pantau Performa' 'Filter periode, divisi, peran, atau nama. Lihat tugas selesai, tertunda, revisi, dan capaian.' $purple $purpleB
A 1470 1862 1525 1862
B 1525 1795 420 135 'Telusuri Bukti' 'Buka sampai ke tugas/job desk, pesanan, foto, dokumen, catatan, dan persetujuan.' $purple $purpleB
A 1945 1862 2000 1862
B 2000 1795 300 135 'Audit Trail' 'Perubahan role, tugas, revisi, dan approval tercatat.' $purple $purpleB

B 400 2010 1600 145 'PRINSIP DATA PERFORMA' 'Performa melekat pada orang yang benar-benar mengerjakan tugas, bersama peran dan divisinya saat itu. Jika role berubah, pekerjaan dan KPI lama tetap milik orang tersebut - tidak ikut berpindah ke pengganti role.' $blue $blueB

S 2235 '7. RINGKASAN PERJALANAN USER' $blueB
B 120 2315 410 125 '1. Terima Informasi' 'User login, membuka dashboard, melihat tugas atau pesanan yang relevan.' $blue $blueB
A 530 2377 590 2377
B 590 2315 410 125 '2. Kerjakan Peran' 'User menjalankan pekerjaan sesuai job desk atau tahap alur operasionalnya.' $blue $blueB
A 1000 2377 1060 2377
B 1060 2315 410 125 '3. Kirim Hasil' 'User memperbarui status dan mengunggah bukti bila diminta.' $blue $blueB
A 1470 2377 1530 2377
B 1530 2315 410 125 '4. Diperiksa' 'Atasan/reviewer mengecek, menyetujui, atau meminta perbaikan.' $blue $blueB
A 1940 2377 2000 2377
B 2000 2315 280 125 '5. Tercatat' 'Riwayat dan performa diperbarui.' $blue $blueB

S 2520 'LEGENDA ROLE YANG DIGABUNG DALAM FLOWCHART' $border
$g.DrawString('Catering: Admin, Monitoring, MO Katering, CO-MO Katering, Produksi 1, Produksi 2, Distribusi 1, Distribusi 2, Kurir.',$body,(New-Object System.Drawing.SolidBrush $ink),120,2595)
$g.DrawString('MBG: Admin MBG, Produksi MBG, Dokumentasi Produksi MBG, Purchasing MBG, Sub Purchasing MBG, Distribusi MBG, Kurir MBG, Produksi MBG 2 / MBG2, Distribusi MBG 2.',$body,(New-Object System.Drawing.SolidBrush $ink),120,2640)
$g.DrawString('Catatan: beberapa akun/role adalah alias atau memiliki cakupan ganda. Diagram menampilkan fungsi kerjanya agar mudah dipahami semua user.',$small,(New-Object System.Drawing.SolidBrush $muted),120,2690)

$g.DrawLine((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(205,214,224)),1),120,2775,2280,2775)
$g.DrawString('AL UMANA - Peta alur operasional untuk pengguna. Dibuat dari flow dan akses role yang ada di project, plus fitur Super Admin/Performance yang akan diimplementasikan.',$small,(New-Object System.Drawing.SolidBrush $muted),(New-Object System.Drawing.RectangleF 120,2810,2160,50))

$out = Join-Path $PSScriptRoot 'al-umana-full-user-flowchart.jpg'
$img.Save($out,[System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $img.Dispose(); Write-Output $out
