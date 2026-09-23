Add-Type -AssemblyName System.Drawing

$W=3000;$H=3400
$img=New-Object System.Drawing.Bitmap $W,$H
$g=[System.Drawing.Graphics]::FromImage($img)
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.Color]::FromArgb(249,250,252))

$fTitle=New-Object System.Drawing.Font('Segoe UI',42,[System.Drawing.FontStyle]::Bold)
$fSub=New-Object System.Drawing.Font('Segoe UI',20)
$fSection=New-Object System.Drawing.Font('Segoe UI',27,[System.Drawing.FontStyle]::Bold)
$fHead=New-Object System.Drawing.Font('Segoe UI',21,[System.Drawing.FontStyle]::Bold)
$fBody=New-Object System.Drawing.Font('Segoe UI',16)
$fNote=New-Object System.Drawing.Font('Segoe UI',14)
$ink=[System.Drawing.Color]::FromArgb(23,35,51);$muted=[System.Drawing.Color]::FromArgb(74,88,106)
$blue=[System.Drawing.Color]::FromArgb(224,239,255);$blueB=[System.Drawing.Color]::FromArgb(47,117,181)
$green=[System.Drawing.Color]::FromArgb(225,246,238);$greenB=[System.Drawing.Color]::FromArgb(39,143,106)
$orange=[System.Drawing.Color]::FromArgb(255,244,222);$orangeB=[System.Drawing.Color]::FromArgb(190,128,36)
$purple=[System.Drawing.Color]::FromArgb(243,231,252);$purpleB=[System.Drawing.Color]::FromArgb(125,70,173)
$greyB=[System.Drawing.Color]::FromArgb(118,136,155)

function Box([int]$x,[int]$y,[int]$w,[int]$h,[string]$head,[string]$text,[System.Drawing.Color]$fill,[System.Drawing.Color]$stroke) {
  $b=New-Object System.Drawing.SolidBrush $fill;$p=New-Object System.Drawing.Pen $stroke,3
  $g.FillRectangle($b,$x,$y,$w,$h);$g.DrawRectangle($p,$x,$y,$w,$h)
  $fmt=New-Object System.Drawing.StringFormat;$fmt.Alignment='Center';$fmt.LineAlignment='Center'
  $g.DrawString($head,$fHead,(New-Object System.Drawing.SolidBrush $ink),(New-Object System.Drawing.RectangleF ($x+15),($y+10),($w-30),34),$fmt)
  $g.DrawString($text,$fBody,(New-Object System.Drawing.SolidBrush $muted),(New-Object System.Drawing.RectangleF ($x+18),($y+48),($w-36),($h-58)),$fmt)
  $fmt.Dispose();$p.Dispose();$b.Dispose()
}
function Arrow([int]$x1,[int]$y1,[int]$x2,[int]$y2,[System.Drawing.Color]$color,[int]$width=4) {
  $p=New-Object System.Drawing.Pen $color,$width;$cap=New-Object System.Drawing.Drawing2D.AdjustableArrowCap 9,11,$true;$p.CustomEndCap=$cap
  $g.DrawLine($p,$x1,$y1,$x2,$y2);$cap.Dispose();$p.Dispose()
}
function CornerArrow([int]$x1,[int]$y1,[int]$x2,[int]$y2,[System.Drawing.Color]$color,[int]$width=4) {
  $mid=[int](($y1+$y2)/2);$p=New-Object System.Drawing.Pen $color,$width;$cap=New-Object System.Drawing.Drawing2D.AdjustableArrowCap 9,11,$true;$p.CustomEndCap=$cap
  $g.DrawLine($p,$x1,$y1,$x1,$mid);$g.DrawLine($p,$x1,$mid,$x2,$mid);$g.DrawLine($p,$x2,$mid,$x2,$y2);$cap.Dispose();$p.Dispose()
}
function Label([int]$x,[int]$y,[int]$w,[string]$text,[System.Drawing.Color]$color=$muted) {
  $fmt=New-Object System.Drawing.StringFormat;$fmt.Alignment='Center'
  $g.DrawString($text,$fNote,(New-Object System.Drawing.SolidBrush $color),(New-Object System.Drawing.RectangleF $x,$y,$w,26),$fmt);$fmt.Dispose()
}
function Bar([int]$y,[string]$text,[System.Drawing.Color]$color) {
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $color),65,$y,2870,48)
  $g.DrawString($text,$fSection,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)),88,($y+6))
}

$g.DrawString('AL UMANA - FLOW SELURUH ROLE TERHUBUNG KE SUPER ADMIN',$fTitle,(New-Object System.Drawing.SolidBrush $ink),70,34)
$g.DrawString('Panah ungu menunjukkan kendali Super Admin. Panah biru menunjukkan aktivitas kerja yang masuk ke catatan performa.', $fSub,(New-Object System.Drawing.SolidBrush $muted),74,95)

Box 1040 155 920 105 'LOGIN & DASHBOARD ROLE' 'Setiap pengguna hanya melihat menu dan tugas sesuai perannya.' $blue $blueB
Arrow 1500 260 1500 320 $blueB
Bar 320 'A. USER MASUK KE WORKFLOW SESUAI DIVISI' $blueB

# Catering lane
Box 90 405 850 85 'CATERING - ADMIN & MONITORING' 'Admin mengelola pesanan/invoice/katalog. Monitoring melihat dashboard dan status operasional.' $green $greenB
Arrow 515 490 515 545 $greenB
Box 90 545 850 110 'ADMIN CATERING: PESANAN MASUK' 'Pesanan pelanggan dicatat, kebutuhan dan jadwal produksi disiapkan.' $green $greenB
Arrow 515 655 515 710 $greenB
Box 90 710 850 120 'MO KATERING: BUAT JOB DESK' 'MO membagi pekerjaan berdasarkan order, waktu, dan role/PIC yang bertugas.' $green $greenB
Arrow 515 830 515 885 $greenB
Box 90 885 850 125 'PETUGAS CATERING' 'Produksi 1 / Produksi 2: siapkan dan produksi makanan. Distribusi 1 / Distribusi 2: siapkan pengiriman dan handover.' $green $greenB
Arrow 515 1010 515 1065 $greenB
Box 90 1065 850 110 'KIRIM HASIL & BUKTI' 'Petugas tandai selesai/belum selesai lalu kirim hasil untuk diperiksa.' $green $greenB
Arrow 515 1175 515 1230 $greenB
Box 90 1230 850 110 'CO-MO KATERING: REVIEW' 'Setujui pekerjaan, atau minta revisi beserta catatan. Setelah disetujui, proses produksi/pengiriman dapat diteruskan.' $green $greenB

# MBG lane
Box 2060 405 850 85 'MBG - ADMIN & KOORDINASI' 'Admin MBG dan Produksi MBG mengatur batch, institusi, menu, jadwal, serta laporan.' $orange $orangeB
Arrow 2485 490 2485 545 $orangeB
Box 2060 545 850 110 'ADMIN MBG: BATCH & RENCANA' 'Buat PM/batch, data institusi, jumlah porsi, menu, jadwal, dan dokumen.' $orange $orangeB
Arrow 2485 655 2485 710 $orangeB
Box 2060 710 850 120 'PURCHASING & SUB PURCHASING' 'Siapkan belanja, supplier, kebutuhan bahan, dan rekap pembelian.' $orange $orangeB
Arrow 2485 830 2485 885 $orangeB
Box 2060 885 850 125 'PRODUKSI & DOKUMENTASI MBG' 'Produksi MBG / Produksi MBG 2 (MBG2) memasak. Dokumentasi Produksi melengkapi foto dan catatan aktivitas.' $orange $orangeB
Arrow 2485 1010 2485 1065 $orangeB
Box 2060 1065 850 110 'DISTRIBUSI MBG' 'Distribusi MBG / Distribusi MBG 2 melakukan QC, menyiapkan serah-terima, dan menugaskan kurir.' $orange $orangeB
Arrow 2485 1175 2485 1230 $orangeB
Box 2060 1230 850 110 'KURIR MBG: ANTAR & BUKTI' 'Kurir mengantar ke institusi, mengunggah bukti kirim, lalu laporan/arsip diperbarui.' $orange $orangeB

# central correlation
Bar 1410 'B. SEMUA AKTIVITAS YANG VALID BERTEMU DI SATU PUSAT DATA' $blueB
Box 790 1490 1420 145 'ACTIVITY & PERFORMANCE RECORD' 'Pesanan, job desk, status produksi, QC, handover, bukti foto/dokumen, pengiriman, review, dan revisi tercatat dengan pelaku, waktu, role, serta divisi saat aktivitas terjadi.' $blue $blueB
CornerArrow 515 1340 1120 1490 $blueB 5
CornerArrow 2485 1340 1880 1490 $blueB 5
Label 580 1400 430 'Catering mengirim hasil kerja' $blueB
Label 1990 1400 430 'MBG mengirim hasil kerja' $blueB
Arrow 1500 1635 1500 1705 $blueB 5

# Super admin center
Bar 1705 'C. SUPER ADMIN PERFORMANCE CONTROL CENTER' $purpleB
Box 675 1785 1650 175 'SUPER ADMIN: PUSAT KENDALI SDM' 'Melihat performa seluruh orang dan divisi, lalu dapat membuka detail sampai ke pekerjaan dan bukti sumbernya. Semua tindakan penting tercatat di audit trail.' $purple $purpleB
Arrow 1500 1960 1500 2040 $purpleB 6

# four functions
Box 85 2040 620 150 '1. PANTAU & DRILL-DOWN' 'Filter periode, divisi, role, atau nama. Lihat target, status, hasil, bukti, komentar, dan persetujuan.' $purple $purpleB
Box 790 2040 620 150 '2. UBAH ROLE / DIVISI' 'Pilih personel, peran baru, dan tanggal berlaku. Riwayat kerja serta performa lama tetap milik pelaku lama.' $purple $purpleB
Box 1495 2040 620 150 '3. BERI TUGAS TAMBAHAN' 'Pilih personel, tulis instruksi, prioritas, deadline, dan bukti yang wajib dikirim.' $purple $purpleB
Box 2200 2040 620 150 '4. AUDIT & TINDAKAN' 'Telusuri perubahan, review, revisi, dan approval. Akses sensitif dikendalikan oleh kewenangan Super Admin.' $purple $purpleB
Arrow 1500 2010 395 2040 $purpleB 5;Arrow 1500 2010 1100 2040 $purpleB 5;Arrow 1500 2010 1805 2040 $purpleB 5;Arrow 1500 2010 2510 2040 $purpleB 5

Bar 2290 'D. PANAH KENDALI SUPER ADMIN KE SELURUH ROLE' $purpleB
Box 90 2370 850 135 'UBAH ROLE / DIVISI' 'Super Admin membuat perubahan role yang berlaku ke depan untuk seluruh tim Catering dan MBG.' $purple $purpleB
Box 1030 2370 940 135 'BERI TASK AD-HOC' 'Tugas tambahan dikirim langsung ke user yang dipilih, lalu mengikuti alur: dikerjakan - kirim bukti - review - tercatat.' $purple $purpleB
Box 2060 2370 850 135 'LIHAT HASIL SEMUA TIM' 'Super Admin memantau hasil Catering, MBG, kurir, dan tugas tambahan tanpa mengubah kepemilikan historis.' $purple $purpleB
CornerArrow 515 2370 515 1100 $purpleB 6
CornerArrow 2485 2370 2485 1100 $purpleB 6
CornerArrow 1500 2370 1500 1010 $purpleB 6
Label 120 2318 790 'Perubahan role mengatur dashboard dan tugas ke depan' $purpleB
Label 1060 2318 880 'Task tambahan masuk ke daftar tugas user' $purpleB
Label 2090 2318 790 'Pantauan Super Admin ke semua hasil kerja' $purpleB

# delivery side-line
Bar 2660 'E. DISTRIBUSI KE PENERIMA & SIKLUS SELESAI' $greyB
Box 130 2740 640 125 'KURIR CATERING' 'Antar pesanan, foto dan tanda tangan penerima, status selesai atau jadwal ulang bila gagal.' $green $greenB
Arrow 770 2802 870 2802 $greyB
Box 870 2740 640 125 'PENERIMA / PELANGGAN' 'Menerima pesanan dan dapat melihat status/riwayat pesanan.' $blue $blueB
Arrow 1510 2802 1610 2802 $greyB
Box 1610 2740 640 125 'KURIR MBG' 'Antar ke institusi, unggah bukti kirim, dan laporan diarsipkan.' $orange $orangeB
Arrow 2250 2802 2350 2802 $greyB
Box 2350 2740 560 125 'INSTITUSI MBG' 'Menerima distribusi makanan sesuai batch dan jadwal.' $blue $blueB

Box 360 2965 2280 145 'ATURAN UTAMA DATA PERFORMA' 'Setiap pekerjaan selalu tercatat kepada orang yang melakukan pekerjaan itu, bersama role/divisi saat itu. Saat role berubah, pekerjaan dan KPI lama tidak ikut berpindah ke pengganti role. Inilah yang membuat Super Admin bisa melihat performa dengan adil dan dapat diaudit.' $blue $blueB

$g.DrawLine((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(205,214,224)),1),120,3160,2880,3160)
$g.DrawString('Keterangan warna: Hijau = Catering | Oranye = MBG | Biru = data/aktivitas/performa | Ungu = kendali Super Admin | Panah tebal ungu = hubungan langsung Super Admin ke workflow pengguna.', $fNote,(New-Object System.Drawing.SolidBrush $muted),(New-Object System.Drawing.RectangleF 150,3190,2700,36))

$out=Join-Path $PSScriptRoot 'al-umana-superadmin-integrated-flowchart.jpg'
$img.Save($out,[System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose();$img.Dispose();Write-Output $out
