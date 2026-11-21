/**
 * Data tetap Laporan 2 Minggu, disalin dari "Lampiran 2 minggu format baru.docx" (November 2026).
 * Angka jumlah, L/P guru-tendik, dan L/P balita diambil dari data admin MBG; yang di sini hanya
 * nama tampil, alamat, rincian kelas (L/P per kelas tidak ada di aplikasi), dan Tim Pelaksana.
 * Nama dari admin MBG dicocokkan lewat `aliases` (huruf besar/kecil, spasi, titik, tanda hubung diabaikan).
 */

export const SPPG_NAMA = 'SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU';
export const SPPG_ID = 'VNAPR2J6';
export const KECAMATAN = 'Kec. Gunungguruh';

/** Satu kelas di tabel Peserta Didik: nama kelas + jumlah laki-laki/perempuan dari Word. */
export type KelasRow = readonly [kelas: string, laki: number, perempuan: number];

export interface LaporanSchool {
  /** Nama seperti di Word. */
  name: string;
  /** Nama di data admin MBG (dan ejaan lain yang pernah dipakai). */
  aliases: readonly string[];
  /** Alamat di tabel Peserta Didik. */
  address: string;
  /** Alamat di tabel Pendidik dan Tenaga Kependidikan (ejaannya sedikit beda di Word). */
  ptkAddress: string;
  kelas: readonly KelasRow[];
}

const AL_MUJAHID = 'Jl. Pelabuhan ii km.9, ds. Kebonmanggu, kec. Gunungguruh, kab. Sukabumi.';

/** Urutan = urutan baris di Word. */
export const LAPORAN_SCHOOLS: readonly LaporanSchool[] = [
  { name: 'TK IT Qurrotaayun', aliases: ['TK QURROTAYAUN', 'TK QURROTA AYUN', 'TK IT QURROTA AYUN', 'TK IT QURROTAYAUN'], address: 'Jl. Pelabuhan ii km.12,5', ptkAddress: 'Jl. Pelabuhan ii km.12,5', kelas: [['A', 12, 10], ['B', 13, 16]] },
  { name: 'TK Al – Mujahid', aliases: ['TK AL-MUJAHID', 'TK AL MUJAHID'], address: AL_MUJAHID, ptkAddress: AL_MUJAHID, kelas: [['A', 17, 9], ['B', 10, 18]] },
  { name: 'TK Padaraang', aliases: ['TK PADARAANG', 'TK PADARAAANG'], address: 'Kp. Padaraang rt.48 rw.12', ptkAddress: 'Kp. Padaraang rt.48 rw.12', kelas: [['A', 5, 2], ['B', 7, 3]] },
  { name: 'SPS Cempaka', aliases: ['SPS CEMPAKA'], address: AL_MUJAHID, ptkAddress: 'Jl. Pelabuhan II km.9, ds. Kebonmanggu, kec. Gunungguruh, kab. Sukabumi.', kelas: [['A', 9, 7], ['B', 5, 10]] },
  { name: 'SPS Cempaka 10', aliases: ['SPS CEMPAKA 10'], address: 'Kp. Cipeundeuy rt.01/10', ptkAddress: 'Kp. Cipeundeuy rt.01/10', kelas: [['A', 15, 17], ['B1', 7, 4], ['B2', 5, 5]] },
  { name: 'SDN Pasirbadak', aliases: ['SDN PASIRBADAK', 'SDN PASIR BADAK'], address: 'Jl.pelabuhan ii km.9 pasirbadak', ptkAddress: 'Jl. Pelabuhan ii km.9 pasirbadak', kelas: [['I', 14, 18], ['II', 17, 14], ['III', 18, 14], ['IV', 12, 16], ['V', 9, 9], ['VI', 20, 12]] },
  { name: 'SD Islam Masagi', aliases: ['SD ISLAM MASAGI', 'SD MASAGI'], address: 'Jl pelabuhan 2 km. 10', ptkAddress: 'Jl Pelabuhan 2 Km. 10', kelas: [['I', 2, 12], ['II', 2, 2], ['III', 3, 9], ['IV', 6, 8], ['V', 9, 8], ['VI', 0, 0]] },
  { name: 'SD IT Qurrotaayun', aliases: ['SD QURROTAYAUN', 'SD QURROTA AYUN', 'SD IT QURROTA AYUN', 'SD IT QURROTAYAUN'], address: 'Jl. Pelabuhan ii km.12,5', ptkAddress: 'Jl. Pelabuhan ii km.12,5', kelas: [['I', 37, 28], ['II', 25, 25], ['III', 24, 24], ['IV', 13, 11], ['V', 12, 14], ['VI', 15, 7]] },
  { name: 'SDN Padaraang', aliases: ['SDN PADARAANG'], address: 'Kp. Padaraang rt.48 rw.12', ptkAddress: 'Kp. Padaraang rt.48 rw.12', kelas: [['I', 15, 21], ['II', 15, 10], ['III', 28, 18], ['IV', 21, 11], ['V', 18, 16], ['VI', 20, 27]] },
  { name: 'SMP Islam Masagi', aliases: ['SMP ISLAM MASAGI', 'SMP MASAGI'], address: 'Jl pelabuhan 2 km. 10', ptkAddress: 'Jl Pelabuhan 2 Km. 10', kelas: [['VII', 33, 34], ['VIII', 28, 19], ['IX', 43, 12]] },
  { name: 'SMP Al – Umanaa', aliases: ['SMP AL - UMANAA', 'SMP AL UMANAA', 'SMP ALUMANAA'], address: 'Jl. Pelabuan 2 km 10 cikaret rt02/14', ptkAddress: 'Jl. Pelabuhan 2 Km 10 Cikaret RT02/14', kelas: [['VII', 47, 39], ['VIII', 48, 50], ['IX', 52, 41]] },
  { name: 'MTs Al – Mujahid', aliases: ['MTS AL-MUJAHID', 'MTS AL MUJAHID'], address: AL_MUJAHID, ptkAddress: AL_MUJAHID, kelas: [['VII', 9, 4], ['VIII', 11, 13], ['IX', 20, 16]] },
  { name: 'Mts Samsul Ulum II', aliases: ['MTS SAMSUL ULUM 2', 'MTS SYAMSUL ULUM 2', 'MTS SAMSUL ULUM II'], address: 'Kp. Padaraang rt. 002/011', ptkAddress: 'Kp. Padaraang rt. 002/011', kelas: [['VII', 6, 11], ['VIII', 7, 12], ['IX', 5, 6]] },
  { name: 'SMK Al – Fathonah', aliases: ['SMK AL-FATHONAH', 'SMK AL FATHONAH'], address: 'Jl pelabuhan 2 km. 10', ptkAddress: 'Jl Pelabuhan 2 Km. 10', kelas: [['VII', 86, 79], ['VIII', 37, 34], ['IX', 36, 37]] },
  { name: 'SMA Al - Umanaa', aliases: ['SMA AL UMANAA', 'SMA AL - UMANAA', 'SMA ALUMANAA'], address: 'Jl. Pelabuan 2 km 10 cikaret rt02/14', ptkAddress: 'Jl. Pelabuhan 2 Km 10 Cikaret RT02/14', kelas: [['VII', 30, 28], ['VIII', 28, 32], ['IX', 43, 19]] },
  { name: 'MA Syamsul Ma’arif', aliases: ["MA SAMSUL MA'ARIF", "MA SYAMSUL MA'ARIF", 'MA SAMSUL MAARIF', 'MA SYAMSUL MAARIF'], address: AL_MUJAHID, ptkAddress: AL_MUJAHID, kelas: [['VII', 5, 4], ['VIII', 7, 2], ['IX', 10, 16]] },
  { name: 'MA Nurul Aziz', aliases: ['MA NURUL AZIZ'], address: 'Kp. Padaraang rt. 002/011', ptkAddress: 'Kp. Padaraang rt. 002/011', kelas: [['VII', 14, 10], ['VIII', 9, 9], ['IX', 10, 9]] },
];

/** Alamat Posyandu Cempaka 1–13 (indeks 0 = Cempaka 1). */
export const POSYANDU_ADDRESSES: readonly string[] = [
  'Kp. Kebonmanggu RT 001/001',
  'Kp. Cipeusing RT 002 RT 002',
  'Kp. Cibeueus RT 002 RW 003',
  'Kp. Cikaret RT 001 RW 014',
  'Kp. Muara RT 002 RW 005',
  'Kp. Pasirmalang RT 003 RW 003',
  'Kp. Cikadu RT 004 RW 007',
  'Kp. Cipendeuy RT 002 RW 008',
  'Kp. Cipeundeuy',
  'Kp. Cipeundeuy RT 003 RW 09',
  'Kp. Padaraang RT 001 RW 011',
  'Kp. Padaraang RT 002 RW 013',
  'Kp. Pasirbadak',
];

/** Tim Pelaksana: jabatan, nama, jenis kelamin, umur, kecamatan tempat tinggal. */
export type TimMember = readonly [jabatan: string, nama: string, jk: 'L' | 'P', umur: number, kecamatan: string];

export const TIM_PELAKSANA: readonly TimMember[] = [
  ['Kepala SPPG', 'Ragha Eskha Utama, S. Hum', 'L', 31, 'Kec. Cisaat'],
  ['Pengawas Gizi', 'Hashifah Dzihniyah Zhafirah, S. Gz', 'P', 23, 'Kec. Gunungguruh'],
  ['Pengawas Keuangan', 'Siti Nuraisyah, S. Ak', 'P', 32, 'Kec. Gunungguruh'],
  ['Jurutama Masak', 'Risa Agisti', 'P', 25, 'Kec. Gunungguruh'],
  ['Asisten Lapangan', 'Wandi Sugih Triyana', 'L', 27, 'Kec. Gunungguruh'],
  ['Persiapan', 'Dwi Zana Abdurrahman, S. Pd', 'L', 29, 'Kec. Gunungguruh'],
  ['Persiapan', 'Eni Nuraeni', 'P', 38, 'Kec. Gunungguruh'],
  ['Persiapan', 'Mia Mulyati', 'P', 41, 'Kec. Gunungguruh'],
  ['Persiapan', 'Ina Karlina', 'P', 41, 'Kec. Gunungguruh'],
  ['Persiapan', 'Hendri', 'L', 21, 'Kec. Gunungguruh'],
  ['Persiapan', 'Aco', 'L', 28, 'Kec. Gunungguruh'],
  ['Persiapan', 'Ichdal Husnaya', 'L', 21, 'Kec. Gunungguruh'],
  ['Persiapan', 'Tuti Nurhasanah', 'P', 53, 'Kec. Gunungguruh'],
  ['Persiapan', 'Masruroh Amelia', 'P', 19, 'Kec. Gunungguruh'],
  ['Persiapan', 'Sumyati', 'P', 48, 'Kec. Gunungguruh'],
  ['Persiapan', 'Susilawati', 'P', 36, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Yeti Rahmawati', 'P', 41, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Ajah', 'P', 46, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Wiwin', 'P', 56, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Yulianti', 'P', 46, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Jannah', 'P', 48, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Saepul Hidayat', 'L', 30, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Yendi', 'L', 36, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Sunarti', 'P', 48, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Ade Mulyani', 'P', 43, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Harun Firdaus', 'L', 35, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Sepriana', 'L', 32, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Rita Resita', 'P', 36, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Nurjanah', 'P', 31, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Nia Kurniawati', 'P', 45, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Ida Royani', 'P', 46, 'Kec. Gunungguruh'],
  ['Pengolahan', 'Arif', 'L', 27, 'Kec. Gunungguruh'],
  ['Distribusi', 'Yusep Saepul Akbar', 'L', 24, 'Kec. Gunungguruh'],
  ['Distribusi', 'Agus Ridwansyah', 'L', 32, 'Kec. Gunungguruh'],
  ['Distribusi', 'Muhamad Erik', 'L', 27, 'Kec. Gunungguruh'],
  ['Distribusi', 'Rahmat Wijaya J', 'L', 20, 'Kec. Gunungguruh'],
  ['Pencucian', 'Anggi Andriani', 'P', 32, 'Kec. Gunungguruh'],
  ['Pencucian', 'Eva Julianti', 'P', 39, 'Kec. Gunungguruh'],
  ['Pencucian', 'Evi', 'P', 42, 'Kec. Gunungguruh'],
  ['Pencucian', 'Minarti', 'P', 42, 'Kec. Gunungguruh'],
  ['Pencucian', 'Deni Gumelar', 'L', 40, 'Kec. Gunungguruh'],
  ['Pencucian', 'Usep', 'L', 42, 'Kec. Gunungguruh'],
  ['Pencucian', 'Deni K', 'L', 54, 'Kec. Gunungguruh'],
  ['Pencucian', 'Hamdan', 'L', 36, 'Kec. Gunungguruh'],
  ['Pencucian', 'Rifki Hediawan', 'L', 21, 'Kec. Gunungguruh'],
  ['Pencucian', 'M. Abdul Rohman S', 'L', 23, 'Kec. Gunungguruh'],
  ['Kebersihan', 'Fendi Hidayat', 'L', 48, 'Kec. Gunungguruh'],
  ['Kebersihan', 'Edo Kurniawan', 'L', 36, 'Kec. Gunungguruh'],
  ['Kebersihan', 'Mahmudin', 'L', 42, 'Kec. Gunungguruh'],
];

/** Teks template. `{periode}` diganti rentang tanggal, mis. "09 November - 20 November 2026". */
export const LAPORAN_TEMPLATE = {
  judul: 'Laporan Pelaksanaan Program Makan Bergizi Gratis',
  latarBelakang: [
    'Masalah gizi buruk masih menjadi tantangan besar di berbagai daerah, terutama di desa terpencil yang memiliki akses terbatas terhadap makanan bergizi. Kondisi ini dapat berdampak negatif pada kesehatan dan perkembangan anak-anak serta produktivitas masyarakat. Oleh karena itu, diperlukan langkah nyata untuk memberikan akses makanan bergizi kepada masyarakat yang membutuhkan, sekaligus meningkatkan kesadaran akan pentingnya pola makan sehat.',
    'Indonesia sebagai negara berkembang menghadapi berbagai tantangan di bidang kesehatan masyarakat, salah satunya adalah prevalensi stunting yang tinggi akibat kekurangan gizi kronis. Data dari Kementerian Kesehatan menunjukkan bahwa anak-anak di bawah usia lima tahun di beberapa wilayah mengalami kekurangan gizi, yang berdampak pada tingkat kecerdasan dan daya saing mereka di masa depan. Program intervensi yang terfokus pada penyediaan makanan bergizi menjadi solusi yang mendesak untuk diterapkan.',
    'Program ini dirancang untuk memberikan dampak jangka pendek dan jangka panjang. Dalam jangka pendek, diharapkan masyarakat dapat merasakan manfaat langsung dari makanan bergizi yang disediakan. Dalam jangka panjang, program ini bertujuan untuk meningkatkan kualitas hidup masyarakat melalui edukasi berkelanjutan tentang pentingnya pola makan yang sehat.',
  ],
  tujuan: [
    'Memberikan makanan bergizi secara gratis kepada masyarakat yang membutuhkan.',
    'Meningkatkan kesadaran masyarakat akan pentingnya pola makan sehat.',
    'Memperbaiki akses makanan gizi seimbang dan di lokasi sasaran.',
  ],
  sasaran:
    'Jumlah sasaran pada periode {periode} berubah-ubah setiap harinya karena terkait dengan ada nya Surat Edaran No 8 tahun 2026 tentang Pendistribusian dan Penyajian Makanan dalam Program Makan Bergizi Gratis yang menyatakan bahwa sekolah yang tidak masuk dihari sabtu dan sekolah yang siswanya tidak berkegiatan di sekolah tidak akan mendapatkan menu MBG.',
  persiapan:
    'Persiapan program melibatkan koordinasi lintas sektor antara Yayasan Lembaga Wakaf Al Umanaa, pemerintah daerah, pihak sekolah dan komunitas setempat. Rangkaian kegiatan meliputi:',
  persiapanList: [
    'Sosialisasi program kepada pihak sekolah',
    'Penyusunan menu makanan bergizi berdasarkan kebutuhan gizi anak sekolah.',
    'Pengadaan bahan makanan dari supplier lokal.',
  ],
  pelaksanaan:
    'Kegiatan pemberian makan bergizi pada periode ini dilaksanakan pada tanggal {periode}. Selama kegiatan, siswa menerima makanan bergizi yang telah disusun sesuai dengan pedoman gizi seimbang. Berikut adalah rincian pelaksanaan:',
  timIntro: 'Berikut Tim Pelaksana Program MBG di SPPG yang terdiri dari :',
  dokumentasiIntro: 'Dokumentasi Pemberian MBG (berupa foto open camera dan/atau video kegiatan pemberian MBG).',
  permasalahan: [
    'Adanya perubahan data siswa yang disampaikan secara mendadak',
    'Ada beberapa sekolah yang meminta perubahan waktu disribusi',
    'Adanya sekolah yang meminta request menu.',
  ],
  penanganan: [
    'Memastikan setiap hari terkait update data siswa',
    'Menjadwalkan ulang dan memastikan kesiapan juru masak sampai distribusi',
    'Menampung aspirasi menu dari setiap sekolah dengan tetap memperhatikan kesesuaian gizi.',
  ],
  tindakLanjut: [
    'Mendata ulang data jumlah siswa secara nyata dan meningkatkan koordinasi dengan sekolah',
    'Memastikan jadwal distribusi ke setiap sekolah',
    'Berkoordinasi dengan instansi terkait.',
  ],
  penutup:
    'Program Makan Bergizi Gratis yang dilaksanakan oleh SPPG Sukabumi Gunungguruh Kebonmanggu Yayasan Lembaga Wakaf Al Umanaa telah berjalan dengan baik. Dengan adanya program ini, diharapkan status gizi siswa meningkat, yang pada akhirnya akan mendukung tumbuh kembang mereka secara optimal. Kebersihan program ini tidak terlepas dari dukungan berbagai pihak, dan kami berharap kegiatan serupa dapat terus dilaksanakan secara berkesinambungan.',
} as const;
