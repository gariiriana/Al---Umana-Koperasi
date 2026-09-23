Add-Type -AssemblyName System.Drawing

$W = 1800; $H = 2600
$img = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($img)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.Color]::FromArgb(248,250,252))

$fontTitle = New-Object System.Drawing.Font('Segoe UI', 38, [System.Drawing.FontStyle]::Bold)
$fontSub = New-Object System.Drawing.Font('Segoe UI', 18)
$fontHead = New-Object System.Drawing.Font('Segoe UI', 23, [System.Drawing.FontStyle]::Bold)
$fontText = New-Object System.Drawing.Font('Segoe UI', 17)
$fontSmall = New-Object System.Drawing.Font('Segoe UI', 15)
$ink = [System.Drawing.Color]::FromArgb(26, 38, 54)
$muted = [System.Drawing.Color]::FromArgb(78, 91, 109)
$line = [System.Drawing.Color]::FromArgb(110, 124, 144)

function Box([int]$x,[int]$y,[int]$w,[int]$h,[string]$heading,[string]$body,[System.Drawing.Color]$fill,[System.Drawing.Color]$border) {
  $r = New-Object System.Drawing.RectangleF $x,$y,$w,$h
  $brush = New-Object System.Drawing.SolidBrush $fill
  $pen = New-Object System.Drawing.Pen $border, 2
  $g.FillRectangle($brush,$r); $g.DrawRectangle($pen,$x,$y,$w,$h)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $top = New-Object System.Drawing.RectangleF ($x+18),($y+12),($w-36),42
  $bottom = New-Object System.Drawing.RectangleF ($x+22),($y+58),($w-44),($h-68)
  $g.DrawString($heading,$fontHead,(New-Object System.Drawing.SolidBrush $ink),$top,$fmt)
  $g.DrawString($body,$fontText,(New-Object System.Drawing.SolidBrush $muted),$bottom,$fmt)
  $brush.Dispose(); $pen.Dispose(); $fmt.Dispose()
}

function Arrow([int]$x1,[int]$y1,[int]$x2,[int]$y2) {
  $pen = New-Object System.Drawing.Pen $line, 3
  $cap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 7,9,$true
  $pen.CustomEndCap = $cap
  $g.DrawLine($pen,$x1,$y1,$x2,$y2)
  $cap.Dispose(); $pen.Dispose()
}

function Label([int]$x,[int]$y,[int]$w,[string]$text) {
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString($text,$fontSmall,(New-Object System.Drawing.SolidBrush $muted),(New-Object System.Drawing.RectangleF $x,$y,$w,28),$fmt)
  $fmt.Dispose()
}

$g.DrawString('AL UMANA — ALUR KERJA & PERFORMA SDM',$fontTitle,(New-Object System.Drawing.SolidBrush $ink),70,42)
$g.DrawString('Flowchart pengalaman pengguna setelah fitur Performance & KPI diterapkan',$fontSub,(New-Object System.Drawing.SolidBrush $muted),74,98)

# Start
Box 650 155 500 105 '1. Login' 'Setiap pengguna masuk memakai akun masing-masing.' ([System.Drawing.Color]::FromArgb(226,242,255)) ([System.Drawing.Color]::FromArgb(61,131,190))
Arrow 900 260 900 305
Box 545 305 710 120 '2. Dashboard Sesuai Peran' 'Sistem menampilkan menu dan pekerjaan sesuai peran pengguna.' ([System.Drawing.Color]::FromArgb(238,243,248)) ([System.Drawing.Color]::FromArgb(120,139,160))
Arrow 900 425 350 485; Arrow 900 425 900 485; Arrow 900 425 1450 485

# columns headers
$g.DrawString('PETUGAS / STAF',$fontHead,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15,93,137))),170,445)
$g.DrawString('ATASAN / REVIEWER',$fontHead,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(132,78,0))),710,445)
$g.DrawString('SUPER ADMIN',$fontHead,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(101,52,145))),1325,445)

# staff lane
Box 100 500 500 120 '3. Lihat Daftar Tugas' 'Tugas rutin Catering/MBG dan tugas tambahan tampil di satu tempat.' ([System.Drawing.Color]::FromArgb(230,247,242)) ([System.Drawing.Color]::FromArgb(53,146,119))
Arrow 350 620 350 665
Box 100 665 500 130 '4. Kerjakan Tugas' 'Ikuti instruksi kerja, isi hasil, dan unggah foto atau dokumen bukti bila diminta.' ([System.Drawing.Color]::FromArgb(230,247,242)) ([System.Drawing.Color]::FromArgb(53,146,119))
Arrow 350 795 350 840
Box 100 840 500 115 '5. Kirim untuk Ditinjau' 'Status berubah menjadi Menunggu Pemeriksaan.' ([System.Drawing.Color]::FromArgb(230,247,242)) ([System.Drawing.Color]::FromArgb(53,146,119))
Arrow 600 897 650 897

# reviewer
Box 650 500 500 120 '3. Terima Pekerjaan Masuk' 'Atasan melihat tugas yang telah dikirim oleh tim.' ([System.Drawing.Color]::FromArgb(255,244,222)) ([System.Drawing.Color]::FromArgb(192,132,45))
Arrow 900 620 900 665
Box 650 665 500 130 '4. Periksa Hasil & Bukti' 'Cek pekerjaan, catatan, foto, dokumen, dan ketepatan waktu.' ([System.Drawing.Color]::FromArgb(255,244,222)) ([System.Drawing.Color]::FromArgb(192,132,45))
Arrow 900 795 900 840
Box 650 840 500 115 '5. Setujui atau Minta Revisi' 'Setuju jika sesuai. Jika belum, tulis catatan revisi untuk petugas.' ([System.Drawing.Color]::FromArgb(255,244,222)) ([System.Drawing.Color]::FromArgb(192,132,45))
Arrow 650 897 600 897; Arrow 900 955 900 1015
Label 430 870 170 'Perlu revisi'

# super admin lane
Box 1200 500 500 120 '3. Buka Control Center' 'Satu halaman untuk memantau SDM, tugas, dan performa seluruh divisi.' ([System.Drawing.Color]::FromArgb(243,234,252)) ([System.Drawing.Color]::FromArgb(140,83,187))
Arrow 1450 620 1450 665
Box 1200 665 500 130 '4. Pantau Performa' 'Filter periode, divisi, peran, atau nama personel; lalu lihat hasil dan status tugas.' ([System.Drawing.Color]::FromArgb(243,234,252)) ([System.Drawing.Color]::FromArgb(140,83,187))
Arrow 1450 795 1450 840
Box 1200 840 500 115 '5. Lihat Detail Pekerjaan' 'Buka sampai ke tugas, bukti, komentar, dan riwayat persetujuan.' ([System.Drawing.Color]::FromArgb(243,234,252)) ([System.Drawing.Color]::FromArgb(140,83,187))

# shared performance
Box 570 1015 660 135 '6. Performa Pribadi Tercatat' 'Pekerjaan yang disetujui masuk ke riwayat dan capaian performa orang yang mengerjakannya.' ([System.Drawing.Color]::FromArgb(222,239,255)) ([System.Drawing.Color]::FromArgb(61,131,190))
Arrow 900 1150 900 1210
Box 570 1210 660 120 '7. Lihat Riwayat & Capaian' 'Staf melihat hasil miliknya; atasan dan Super Admin melihat sesuai kewenangan.' ([System.Drawing.Color]::FromArgb(222,239,255)) ([System.Drawing.Color]::FromArgb(61,131,190))

# admin actions
$g.DrawString('AKSI TAMBAHAN SUPER ADMIN',$fontHead,(New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(101,52,145))),660,1410)
Box 100 1470 500 145 'Berikan Tugas Tambahan' 'Pilih personel, tulis instruksi, atur prioritas dan batas waktu. Tugas langsung masuk ke daftar tugas user.' ([System.Drawing.Color]::FromArgb(243,234,252)) ([System.Drawing.Color]::FromArgb(140,83,187))
Box 650 1470 500 145 'Ubah Peran Personel' 'Pilih user dan peran baru. Riwayat pekerjaan serta performa lama tetap aman dan tidak berpindah.' ([System.Drawing.Color]::FromArgb(243,234,252)) ([System.Drawing.Color]::FromArgb(140,83,187))
Box 1200 1470 500 145 'Tinjau Semua Aktivitas' 'Telusuri siapa mengerjakan apa, kapan dikerjakan, hasilnya, dan bukti pendukungnya.' ([System.Drawing.Color]::FromArgb(243,234,252)) ([System.Drawing.Color]::FromArgb(140,83,187))
Arrow 350 1615 350 1690; Arrow 900 1615 900 1690; Arrow 1450 1615 1450 1690
Box 100 1690 1600 130 'Transparan, Terukur, dan Bisa Ditelusuri' 'Setiap perubahan peran, tugas tambahan, pengiriman hasil, revisi, dan persetujuan tercatat sebagai riwayat.' ([System.Drawing.Color]::FromArgb(236,241,246)) ([System.Drawing.Color]::FromArgb(120,139,160))

# legend and footer
$g.DrawString('Catatan penting untuk pengguna: perubahan peran berlaku ke depan. Hasil kerja lama tetap tercatat pada orang dan peran saat pekerjaan tersebut dilakukan.',$fontSmall,(New-Object System.Drawing.SolidBrush $muted),(New-Object System.Drawing.RectangleF 120,1900,1560,44))
$g.DrawLine((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(205,214,224)),1),120,1970,1680,1970)
$g.DrawString('Catering dan MBG memakai alur pengguna yang sama: menerima tugas - kerjakan - kirim bukti - review - performa tercatat.',$fontSub,(New-Object System.Drawing.SolidBrush $ink),(New-Object System.Drawing.RectangleF 180,2010,1440,70))

$path = Join-Path $PSScriptRoot 'al-umana-user-performance-flowchart.jpg'
$img.Save($path,[System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $img.Dispose()
Write-Output $path
