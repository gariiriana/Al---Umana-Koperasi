// ============================================================================
// MBG Daily Report PDF Exporter — Landscape Official Layout
// Badan Gizi Nasional & Koperasi Konsumen Al-Umanaa Mandiri Berkah
// ============================================================================

import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type {
  MbgProductionDailyReport,
  MbgPmBatch,
  MbgPmEntry,
  MbgPortionDailyData,
} from '@/types/mbg';

const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/')) {
      return null;
    }
    const blob = await res.blob();
    if (blob.type && !blob.type.startsWith('image/')) {
      return null;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 256;
          let width = img.naturalWidth || 100;
          let height = img.naturalHeight || 100;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(img.src);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(null);
      };
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    console.warn('Error loading image base64:', err);
    return null;
  }
};

function formatRp(val: number | undefined | null): string {
  if (val == null || isNaN(val)) return 'Rp 0';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

function formatNum(val: number | undefined | null, decimals = 1): string {
  if (val == null || isNaN(val)) return '0';
  if (Number.isInteger(val)) return val.toString();
  return Number(val.toFixed(decimals)).toString();
}

// ─── OFFICIAL HEADER FOR LANDSCAPE A4 ─────────────────────────────────────────

const drawLandscapeHeader = (
  doc: jsPDF,
  sectionTitle: string,
  tanggal: string,
  totalPorsi: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  const pageW = doc.internal.pageSize.getWidth();

  if (logoAlUmanaa) {
    try {
      doc.addImage(logoAlUmanaa, 'PNG', 10, 6, 15, 15);
    } catch {
      // ignore
    }
  }

  if (logoBadanGizi) {
    try {
      doc.addImage(logoBadanGizi, 'PNG', pageW - 25, 6, 15, 15);
    } catch {
      // ignore
    }
  }

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42); // slate 900
  doc.text('BADAN GIZI NASIONAL', pageW / 2, 9, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59); // slate 800
  doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU - YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 13.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(180, 83, 9); // amber 700
  doc.text(`LAPORAN OPERASIONAL HARIAN MBG — ${sectionTitle.toUpperCase()}`, pageW / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // slate 500
  doc.text(`Tanggal Batch: ${tanggal} • Sasaran Produksi: ${totalPorsi.toLocaleString('id-ID')} Porsi • Koperasi Konsumen Al-Umanaa Mandiri Berkah`, pageW / 2, 22.5, { align: 'center' });

  // Dividing line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(10, 24.5, pageW - 10, 24.5);
};

// ─── HALAMAN 1: REKAPITULASI PENERIMA MANFAAT (FOTO 1) ────────────────────────

interface RekapPmRowData {
  nama: string;
  kecilL: number;
  kecilP: number;
  besarL: number;
  besarP: number;
  balitaL: number;
  balitaP: number;
  bumilL: number;
  bumilP: number;
  siswaL: number;
  siswaP: number;
  siswaJumlah: number;
  guruL: number;
  guruP: number;
  tendikL: number;
  tendikP: number;
  tendikJumlah: number;
  totalAkhir: number;
}

const buildRekapPmRows = (
  entries: MbgPmEntry[] = [],
  sekolahList: { nama: string; murid: number; guru: number }[] = []
): RekapPmRowData[] => {
  if (entries && entries.length > 0) {
    return entries.map((e) => {
      const isTk =
        e.schoolLevel === 'tk_paud' ||
        e.institutionName.toLowerCase().includes('tk') ||
        e.institutionName.toLowerCase().includes('paud');
      const isPosyandu = e.institutionType === 'posyandu' || e.institutionName.toLowerCase().includes('posyandu');
      const isSd =
        e.schoolLevel === 'sd' ||
        e.institutionName.toLowerCase().includes('sd') ||
        e.institutionName.toLowerCase().includes('mi');
      const isSmaOrSmp =
        e.schoolLevel === 'sma' ||
        (e.schoolLevel as string) === 'smp' ||
        e.institutionName.toLowerCase().includes('smp') ||
        e.institutionName.toLowerCase().includes('sma') ||
        e.institutionName.toLowerCase().includes('smk') ||
        e.institutionName.toLowerCase().includes('mts') ||
        e.institutionName.toLowerCase().includes('ma ');

      // 1. Porsi Kecil
      let kecilL = e.qtPorsiKecilL ?? 0;
      let kecilP = e.qtPorsiKecilP ?? 0;
      if (!kecilL && !kecilP) {
        if (e.qtPorsiKecil && e.qtPorsiKecil > 0) {
          kecilL = Math.ceil(e.qtPorsiKecil / 2);
          kecilP = Math.floor(e.qtPorsiKecil / 2);
        } else if (isTk) {
          const tot = e.qtSiswaBalita || e.jumlah || 0;
          kecilL = Math.ceil(tot / 2);
          kecilP = Math.floor(tot / 2);
        } else if (isSd) {
          const sdKecil = Math.ceil((e.qtSiswaBalita || 0) / 2);
          kecilL = Math.ceil(sdKecil / 2);
          kecilP = Math.floor(sdKecil / 2);
        }
      }

      // 2. Porsi Besar
      let besarL = e.qtPorsiBesarL ?? 0;
      let besarP = e.qtPorsiBesarP ?? 0;
      if (!besarL && !besarP) {
        if (e.qtPorsiBesar && e.qtPorsiBesar > 0) {
          besarL = Math.ceil(e.qtPorsiBesar / 2);
          besarP = Math.floor(e.qtPorsiBesar / 2);
        } else if (isSmaOrSmp) {
          const tot = e.qtSiswaBalita || (e.jumlah ? e.jumlah - (e.qtGuruKader || 0) : 0);
          besarL = Math.ceil(tot / 2);
          besarP = Math.floor(tot / 2);
        } else if (isSd) {
          const sdBesar = Math.floor((e.qtSiswaBalita || 0) / 2);
          besarL = Math.ceil(sdBesar / 2);
          besarP = Math.floor(sdBesar / 2);
        }
      }

      // 3. Porsi Balita
      let balitaL = 0;
      let balitaP = 0;
      if (isPosyandu) {
        const balitaTot = e.qtPorsiBalita || e.qtSiswaBalita || 0;
        balitaL = Math.ceil(balitaTot / 2);
        balitaP = Math.floor(balitaTot / 2);
      }

      // 4. Porsi Bumil/Busui
      let bumilL = 0;
      let bumilP = 0;
      if (isPosyandu) {
        const bumilTot = (e.qtBumil || 0) + (e.qtBusui || 0) || (e.qtPorsiBumilBusui || e.qtBumilBusui || 0);
        bumilP = bumilTot;
      }

      // 5. Total Siswa
      const siswaL = kecilL + besarL + balitaL + bumilL;
      const siswaP = kecilP + besarP + balitaP + bumilP;
      const siswaJumlah = siswaL + siswaP;

      // 6. Guru
      let guruL = e.qtGuruL ?? 0;
      let guruP = e.qtGuruP ?? 0;
      if (!guruL && !guruP && e.qtGuruKader && e.qtGuruKader > 0) {
        guruL = Math.ceil(e.qtGuruKader / 2);
        guruP = Math.floor(e.qtGuruKader / 2);
      }

      // 7. Tendik
      const tendikL = e.qtTendikL ?? 0;
      const tendikP = e.qtTendikP ?? 0;
      const tendikJumlah = tendikL + tendikP;

      // 8. Total Akhir
      const totalAkhir = siswaJumlah + (guruL + guruP) + tendikJumlah;

      return {
        nama: e.institutionName + (e.isSekolahLibur ? ' (Libur)' : ''),
        kecilL,
        kecilP,
        besarL,
        besarP,
        balitaL,
        balitaP,
        bumilL,
        bumilP,
        siswaL,
        siswaP,
        siswaJumlah,
        guruL,
        guruP,
        tendikL,
        tendikP,
        tendikJumlah,
        totalAkhir,
      };
    });
  }

  // Fallback if entries not available but sekolahList is present
  return (sekolahList || []).map((s) => {
    const isTk = s.nama.toLowerCase().includes('tk') || s.nama.toLowerCase().includes('paud');
    const isPosyandu = s.nama.toLowerCase().includes('posyandu');
    const isSd = s.nama.toLowerCase().includes('sd') || s.nama.toLowerCase().includes('mi');
    const isSmaOrSmp = s.nama.toLowerCase().includes('smp') || s.nama.toLowerCase().includes('sma') || s.nama.toLowerCase().includes('smk');

    let kecilL = 0;
    let kecilP = 0;
    let besarL = 0;
    let besarP = 0;
    let balitaL = 0;
    let balitaP = 0;
    let bumilL = 0;
    let bumilP = 0;

    if (isTk) {
      kecilL = Math.ceil(s.murid / 2);
      kecilP = Math.floor(s.murid / 2);
    } else if (isSd) {
      const half = Math.round(s.murid / 2);
      kecilL = Math.ceil(half / 2);
      kecilP = Math.floor(half / 2);
      besarL = Math.ceil((s.murid - half) / 2);
      besarP = Math.floor((s.murid - half) / 2);
    } else if (isSmaOrSmp) {
      besarL = Math.ceil(s.murid / 2);
      besarP = Math.floor(s.murid / 2);
    } else if (isPosyandu) {
      balitaL = Math.ceil(s.murid / 2);
      balitaP = Math.floor(s.murid / 2);
      bumilP = s.guru || 0;
    }

    const siswaL = kecilL + besarL + balitaL + bumilL;
    const siswaP = kecilP + besarP + balitaP + bumilP;
    const siswaJumlah = siswaL + siswaP;

    const guruL = isPosyandu ? 0 : Math.ceil((s.guru || 0) / 2);
    const guruP = isPosyandu ? 0 : Math.floor((s.guru || 0) / 2);

    const tendikL = 0;
    const tendikP = 0;
    const tendikJumlah = 0;

    const totalAkhir = siswaJumlah + (guruL + guruP) + tendikJumlah;

    return {
      nama: s.nama,
      kecilL,
      kecilP,
      besarL,
      besarP,
      balitaL,
      balitaP,
      bumilL,
      bumilP,
      siswaL,
      siswaP,
      siswaJumlah,
      guruL,
      guruP,
      tendikL,
      tendikP,
      tendikJumlah,
      totalAkhir,
    };
  });
};

const renderRekapitulasiPmPage = (
  doc: jsPDF,
  report: MbgProductionDailyReport,
  entries: MbgPmEntry[],
  tanggalStr: string,
  totalPorsiBatch: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  drawLandscapeHeader(doc, 'REKAPITULASI PENERIMA MANFAAT', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

  const rowsData = buildRekapPmRows(entries, report.sekolahList);

  // Calculate Column Totals
  const totals = rowsData.reduce(
    (acc, r) => {
      acc.kecilL += r.kecilL;
      acc.kecilP += r.kecilP;
      acc.besarL += r.besarL;
      acc.besarP += r.besarP;
      acc.balitaL += r.balitaL;
      acc.balitaP += r.balitaP;
      acc.bumilL += r.bumilL;
      acc.bumilP += r.bumilP;
      acc.siswaL += r.siswaL;
      acc.siswaP += r.siswaP;
      acc.siswaJumlah += r.siswaJumlah;
      acc.guruL += r.guruL;
      acc.guruP += r.guruP;
      acc.tendikL += r.tendikL;
      acc.tendikP += r.tendikP;
      acc.tendikJumlah += r.tendikJumlah;
      acc.totalAkhir += r.totalAkhir;
      return acc;
    },
    {
      kecilL: 0,
      kecilP: 0,
      besarL: 0,
      besarP: 0,
      balitaL: 0,
      balitaP: 0,
      bumilL: 0,
      bumilP: 0,
      siswaL: 0,
      siswaP: 0,
      siswaJumlah: 0,
      guruL: 0,
      guruP: 0,
      tendikL: 0,
      tendikP: 0,
      tendikJumlah: 0,
      totalAkhir: 0,
    }
  );

  const bodyRows: RowInput[] = rowsData.map((r) => [
    r.nama,
    r.kecilL > 0 ? r.kecilL : '-',
    r.kecilP > 0 ? r.kecilP : '-',
    r.besarL > 0 ? r.besarL : '-',
    r.besarP > 0 ? r.besarP : '-',
    r.balitaL > 0 ? r.balitaL : '-',
    r.balitaP > 0 ? r.balitaP : '-',
    r.bumilL > 0 ? r.bumilL : '-',
    r.bumilP > 0 ? r.bumilP : '-',
    r.siswaL > 0 ? r.siswaL : '-',
    r.siswaP > 0 ? r.siswaP : '-',
    r.siswaJumlah > 0 ? r.siswaJumlah : '-',
    r.guruL > 0 ? r.guruL : '-',
    r.guruP > 0 ? r.guruP : '-',
    r.tendikL > 0 ? r.tendikL : '-',
    r.tendikP > 0 ? r.tendikP : '-',
    r.tendikJumlah > 0 ? r.tendikJumlah : '-',
    r.totalAkhir > 0 ? r.totalAkhir : '-',
  ]);

  const footRows: RowInput[] = [
    [
      { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.kecilL.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.kecilP.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.besarL.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.besarP.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.balitaL.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.balitaP.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.bumilL.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.bumilP.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.siswaL.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.siswaP.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.siswaJumlah.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.guruL.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.guruP.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.tendikL.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.tendikP.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.tendikJumlah.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: totals.totalAkhir.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [180, 83, 9] } },
    ],
  ];

  autoTable(doc, {
    startY: 27,
    head: [
      // Row 1: Banner navy title
      [
        {
          content: 'REKAPITULASI PENERIMA MANFAAT',
          colSpan: 18,
          styles: {
            fillColor: [15, 45, 89], // Navy #0F2D59
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8.5,
          },
        },
      ],
      // Row 2: Category level
      [
        { content: 'PENERIMA MANFAAT', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Porsi Kecil', colSpan: 2, styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Porsi Besar', colSpan: 2, styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Porsi Balita', colSpan: 2, styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Porsi Bumil/Busui', colSpan: 2, styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Total Siswa', colSpan: 3, styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Guru', colSpan: 2, styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Tendik', colSpan: 3, styles: { halign: 'center', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Total', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' } },
      ],
      // Row 3: Sub-headers
      [
        { content: 'L', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'P', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'L', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'P', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'L', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'P', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'L', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'P', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'L', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'P', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Jumlah', styles: { halign: 'center', fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'L', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'P', styles: { halign: 'center', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'L', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'P', styles: { halign: 'center', fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Jumlah', styles: { halign: 'center', fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' } },
      ],
    ],
    body: bodyRows,
    foot: footRows,
    theme: 'grid',
    styles: {
      fontSize: 6.2,
      cellPadding: 0.9,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 12, halign: 'center' },
      7: { cellWidth: 12, halign: 'center' },
      8: { cellWidth: 12, halign: 'center' },
      9: { cellWidth: 12, halign: 'center' },
      10: { cellWidth: 12, halign: 'center' },
      11: { cellWidth: 14, halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] },
      12: { cellWidth: 12, halign: 'center' },
      13: { cellWidth: 12, halign: 'center' },
      14: { cellWidth: 12, halign: 'center' },
      15: { cellWidth: 12, halign: 'center' },
      16: { cellWidth: 14, halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] },
      17: { cellWidth: 17, halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9], fillColor: [254, 243, 199] },
    },
    margin: { left: 10, right: 10 },
  });
};

// ─── HALAMAN 2+: INDIVIDUAL PORTION (3 TABEL VERTIKAL: FOTO 2, 3, 4) ──────────

const renderPortionStackedPage = (
  doc: jsPDF,
  portionData: MbgPortionDailyData | undefined,
  defaultTitle: string,
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui',
  tanggalStr: string,
  totalPorsiBatch: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  const pageW = doc.internal.pageSize.getWidth();
  const title = portionData?.portionTitle || defaultTitle;

  drawLandscapeHeader(doc, title, tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

  const data: MbgPortionDailyData = portionData || {
    portionType,
    portionTitle: defaultTitle,
    pmCount: 0,
    menuList: [],
    nutritionItems: [],
    bahanItems: [],
    bumbuItems: [],
    totalGizi: { beratBersih: 0, energi: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 },
    akgMetrics: {},
    totalBelanjaBahan: 0,
    hargaBahanPerPorsi: 0,
    totalBelanjaBumbu: 0,
    hargaBumbuPerPorsi: 0,
    totalBelanjaOverall: 0,
    hargaPerPorsiOverall: 0,
  };

  // Header Banner 1: REALISASI MENU (Navy #0F2D59)
  let curY = 27;
  doc.setFillColor(15, 45, 89);
  doc.rect(10, curY, pageW - 20, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('REALISASI MENU', pageW / 2, curY + 3.5, { align: 'center' });

  // Header Banner 2: PORSI KECIL / BESAR / BALITA (Light Blue #BAE6FD)
  curY += 5;
  doc.setFillColor(186, 230, 253); // Sky 200
  doc.rect(10, curY, pageW - 20, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42); // slate 900
  doc.text(title.toUpperCase(), pageW / 2, curY + 3.5, { align: 'center' });

  curY += 6;

  // ═══════════════════════════════════════════════════════════════════════════
  // TABEL 1: KANDUNGAN GIZI
  // ═══════════════════════════════════════════════════════════════════════════
  const giziRows: RowInput[] = (data.nutritionItems || []).map((nut) => [
    nut.menuName || '',
    nut.rincianBahan || '',
    formatNum(nut.beratBersih, 1),
    formatNum(nut.energi, 1),
    formatNum(nut.protein, 1),
    formatNum(nut.lemak, 1),
    formatNum(nut.karbohidrat, 1),
    formatNum(nut.serat, 1),
  ]);

  if (giziRows.length === 0) {
    giziRows.push(['-', '-', '-', '-', '-', '-', '-', '-']);
  }

  const giziFootRows: RowInput[] = [
    // Row 1: Total
    [
      { content: 'Total', colSpan: 2, styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.beratBersih, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.energi, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [180, 83, 9] } },
      { content: formatNum(data.totalGizi?.protein, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.lemak, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.karbohidrat, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatNum(data.totalGizi?.serat, 1), styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
    ],
  ];

  // AKG % Pemenuhan rows
  if (data.akgMetrics && Object.keys(data.akgMetrics).length > 0) {
    Object.entries(data.akgMetrics).forEach(([akgKey, metric]) => {
      const cleanKey = akgKey.replace(/_/g, ' ').toUpperCase();
      giziFootRows.push([
        { content: `% Pemenuhan Makan Siang (${cleanKey})`, colSpan: 3, styles: { fontStyle: 'bold', halign: 'left', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
        { content: `${formatNum(metric.percentMakanSiang, 1)}%`, styles: { fontStyle: 'bold', halign: 'center', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
        { content: metric.percentHarian > 0 ? `Harian: ${formatNum(metric.percentHarian, 1)}%` : 'Standar Kemkes', colSpan: 4, styles: { halign: 'center', fillColor: [255, 251, 235], textColor: [146, 64, 14] } },
      ]);
    });
  }

  autoTable(doc, {
    startY: curY,
    head: [
      [
        { content: 'Menu', styles: { halign: 'center' } },
        { content: 'Rincian Bahan', styles: { halign: 'center' } },
        { content: 'Berat Bersih', styles: { halign: 'center' } },
        { content: 'Energi', styles: { halign: 'center' } },
        { content: 'Protein', styles: { halign: 'center' } },
        { content: 'Lemak', styles: { halign: 'center' } },
        { content: 'Karbohidrat', styles: { halign: 'center' } },
        { content: 'Serat', styles: { halign: 'center' } },
      ],
    ],
    body: giziRows,
    foot: giziFootRows,
    theme: 'grid',
    headStyles: {
      fillColor: [254, 240, 138], // Yellow #FEF08A
      textColor: [133, 77, 14], // Amber 800
      fontStyle: 'bold',
      fontSize: 6.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 0.9,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 55 },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 28, halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 26, halign: 'center' },
      6: { cellWidth: 32, halign: 'center' },
      7: { cellWidth: 28, halign: 'center' },
    },
    margin: { left: 10, right: 10 },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TABEL 2: PESANAN BAHAN MAKANAN
  // ═══════════════════════════════════════════════════════════════════════════
  const afterGiziY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || curY + 40;
  const bahanStartY = afterGiziY + 4;

  const bahanRows: RowInput[] = (data.bahanItems || []).map((bah) => [
    bah.rincianBahan || '',
    bah.hargaBahan ? formatRp(bah.hargaBahan) : '-',
    bah.bddPercent != null ? `${formatNum(bah.bddPercent, 0)}%` : '-',
    formatNum(bah.beratKotor, 0),
    formatNum(bah.totalGml, 0),
    bah.sparePercent ? `${bah.sparePercent}%` : '-',
    formatNum(bah.kebutuhan, 1),
    bah.satuan || '',
    formatRp(bah.harga),
  ]);

  if (bahanRows.length === 0) {
    bahanRows.push(['-', '-', '-', '-', '-', '-', '-', '-', '-']);
  }

  const bahanFootRows: RowInput[] = [
    // Total Belanja
    [
      { content: 'TOTAL BELANJA', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatRp(data.totalBelanjaBahan), styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
    ],
    // Harga per Porsi
    [
      { content: 'HARGA BAHAN MAKANAN (PER PORSI)', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [71, 85, 105] } },
      { content: `${formatRp(data.hargaBahanPerPorsi || (data.pmCount ? data.totalBelanjaBahan / data.pmCount : 0))} / porsi`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [224, 242, 254], textColor: [3, 105, 161] } },
    ],
  ];

  autoTable(doc, {
    startY: bahanStartY,
    head: [
      [
        { content: 'Rincian Bahan', styles: { halign: 'center' } },
        { content: 'Harga Bahan', styles: { halign: 'center' } },
        { content: '%BDD', styles: { halign: 'center' } },
        { content: 'Berat Kotor', styles: { halign: 'center' } },
        { content: 'Total (g/ml)', styles: { halign: 'center' } },
        { content: 'Spare %', styles: { halign: 'center' } },
        { content: 'Kebutuhan (Per Unit)', styles: { halign: 'center' } },
        { content: 'Satuan', styles: { halign: 'center' } },
        { content: 'Harga', styles: { halign: 'center' } },
      ],
    ],
    body: bahanRows,
    foot: bahanFootRows,
    theme: 'grid',
    headStyles: {
      fillColor: [254, 240, 138], // Yellow #FEF08A
      textColor: [133, 77, 14],
      fontStyle: 'bold',
      fontSize: 6.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 0.9,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 28, halign: 'right' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 34, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 41, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
    },
    margin: { left: 10, right: 10 },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TABEL 3: PESANAN BUMBU
  // ═══════════════════════════════════════════════════════════════════════════
  const afterBahanY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || bahanStartY + 45;
  const bumbuStartY = afterBahanY + 4;

  const bumbuRows: RowInput[] = (data.bumbuItems || []).map((bum) => [
    bum.namaMenu || '',
    bum.namaBumbu || '',
    bum.hargaBumbu ? formatRp(bum.hargaBumbu) : '-',
    bum.kebutuhan !== undefined && bum.kebutuhan !== null
      ? (bum.kebutuhan > 0 ? formatNum(bum.kebutuhan, 2) : '0')
      : '-',
    bum.satuan || '',
    formatRp(bum.harga),
  ]);

  if (bumbuRows.length === 0) {
    bumbuRows.push(['-', '-', '-', '-', '-', '-']);
  }

  const bumbuFootRows: RowInput[] = [
    // Total Belanja Bumbu
    [
      { content: 'TOTAL BELANJA', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 240, 138], textColor: [133, 77, 14] } },
      { content: formatRp(data.totalBelanjaBumbu), styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 243, 199], textColor: [180, 83, 9] } },
    ],
    // Harga Bumbu per Porsi
    [
      { content: 'HARGA BUMBU (PER PORSI)', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [71, 85, 105] } },
      { content: `${formatRp(data.hargaBumbuPerPorsi || (data.pmCount ? data.totalBelanjaBumbu / data.pmCount : 0))} / porsi`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249], textColor: [146, 64, 14] } },
    ],
    // Grand Total per Porsi
    [
      { content: 'HARGA PER PORSI (BAHAN + BUMBU)', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
      { content: `${formatRp(data.hargaPerPorsiOverall || ((data.hargaBahanPerPorsi || 0) + (data.hargaBumbuPerPorsi || 0)))} / porsi`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
    ],
  ];

  autoTable(doc, {
    startY: bumbuStartY,
    head: [
      [
        { content: 'Nama Menu', styles: { halign: 'center' } },
        { content: 'Nama Bumbu', styles: { halign: 'center' } },
        { content: 'Harga Bumbu', styles: { halign: 'center' } },
        { content: 'Kebutuhan (Per Unit)', styles: { halign: 'center' } },
        { content: 'Satuan', styles: { halign: 'center' } },
        { content: 'Harga', styles: { halign: 'center' } },
      ],
    ],
    body: bumbuRows,
    foot: bumbuFootRows,
    theme: 'grid',
    headStyles: {
      fillColor: [254, 240, 138], // Yellow #FEF08A
      textColor: [133, 77, 14],
      fontStyle: 'bold',
      fontSize: 6.8,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 0.9,
      lineWidth: 0.15,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 55 },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 38, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 56, halign: 'right', fontStyle: 'bold', textColor: [180, 83, 9] },
    },
    margin: { left: 10, right: 10 },
  });
};

// ─── HALAMAN AKHIR: TABEL SUPPLIER & PENGESAHAN ───────────────────────────────

const renderSupplierPage = (
  doc: jsPDF,
  report: MbgProductionDailyReport,
  tanggalStr: string,
  totalPorsiBatch: number,
  logoAlUmanaa: string | null,
  logoBadanGizi: string | null
) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  drawLandscapeHeader(doc, 'TABEL SUPPLIER & LEMBAR PENGESAHAN', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);

  const poList = report.poRows || [];
  const poGrandTotal =
    poList.reduce((s, p) => s + (p.totalHarga || (p.jumlah > 0 && p.hargaSatuan ? p.jumlah * p.hargaSatuan : 0)), 0) ||
    report.totalPengeluaran ||
    0;

  const poTableBody: RowInput[] = poList.map((row, idx) => [
    idx + 1,
    row.supplier || 'Koperasi Al Umanaa Sejahtera Mandiri',
    row.item,
    row.jamKedatangan || '06:00',
    formatNum(row.jumlah, 1),
    row.satuan || 'kg',
    row.hargaSatuan ? formatRp(row.hargaSatuan) : '-',
    formatRp(row.totalHarga || (row.jumlah * (row.hargaSatuan || 0))),
  ]);

  if (poTableBody.length === 0) {
    poTableBody.push(['1', 'Koperasi Al Umanaa Sejahtera Mandiri', 'Bahan Baku & Bumbu Masak Terintegrasi', '06:00', '1', 'paket', formatRp(poGrandTotal), formatRp(poGrandTotal)]);
  }

  autoTable(doc, {
    startY: 27,
    head: [
      // Banner row
      [
        {
          content: 'TABEL SUPPLIER — DAFTAR PESANAN BAHAN KE MITRA SUPPLIER',
          colSpan: 8,
          styles: {
            fillColor: [15, 45, 89],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8,
          },
        },
      ],
      // Subheaders
      [
        { content: 'No', styles: { halign: 'center' } },
        { content: 'Supplier', styles: { halign: 'center' } },
        { content: 'List Pesanan Bahan', styles: { halign: 'center' } },
        { content: 'Kedatangan', styles: { halign: 'center' } },
        { content: 'Jumlah', styles: { halign: 'center' } },
        { content: 'Satuan', styles: { halign: 'center' } },
        { content: 'Harga Satuan', styles: { halign: 'center' } },
        { content: 'Total Harga', styles: { halign: 'center' } },
      ],
    ],
    body: poTableBody,
    foot: [
      [
        { content: `TOTAL BELANJA SUPPLIER (${poList.length || 1} ITEM):`, colSpan: 7, styles: { halign: 'right', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: formatRp(poGrandTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: [220, 252, 231], textColor: [22, 101, 52] } },
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 1.2, lineWidth: 0.15, lineColor: [203, 213, 225] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 58, fontStyle: 'bold' },
      2: { cellWidth: 70 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 33, halign: 'right' },
      7: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: [22, 101, 52] },
    },
    margin: { left: 10, right: 10 },
  });

  // Paket Sehat 3B (Balita / Bumil) if exists
  const paketItems = report.paketSehat3b?.keringanItems || [];
  if (paketItems.length > 0) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 100;
    const p3bStartY = lastY + 4;

    const p3bBody: RowInput[] = paketItems.map((p, idx) => [
      idx + 1,
      p.item,
      formatNum(p.qtyPcs, 0),
      formatNum(p.qty, 1),
      p.satuan || 'pcs',
      p.hargaSatuan ? formatRp(p.hargaSatuan) : '-',
      p.totalHarga ? formatRp(p.totalHarga) : '-',
    ]);

    autoTable(doc, {
      startY: p3bStartY,
      head: [
        [
          {
            content: 'PAKET SEHAT 3B — KERINGAN BALITA, IBU HAMIL & IBU MENYUSUI',
            colSpan: 7,
            styles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.5 },
          },
        ],
        ['No', 'Item Bahan Keringan', 'Qty (Pcs)', 'Qty Kebutuhan', 'Satuan', 'Harga Satuan (Rp)', 'Total Biaya (Rp)'],
      ],
      body: p3bBody,
      theme: 'grid',
      styles: { fontSize: 6.8, cellPadding: 1, lineWidth: 0.15, lineColor: [233, 213, 255] },
      headStyles: { fillColor: [107, 33, 168], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 80, fontStyle: 'bold' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 40, halign: 'right' },
        6: { cellWidth: 45, halign: 'right', fontStyle: 'bold', textColor: [107, 33, 168] },
      },
      margin: { left: 10, right: 10 },
    });
  }

  // ─── LEMBAR PENGESAHAN (3 SIGNATURES) ─────────────────────────────────────
  const lastFinalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 130;
  let sigY = lastFinalY + 8;

  if (sigY + 35 > pageH - 10) {
    doc.addPage();
    drawLandscapeHeader(doc, 'LEMBAR PENGESAHAN LAPORAN OPERASIONAL', tanggalStr, totalPorsiBatch, logoAlUmanaa, logoBadanGizi);
    sigY = 35;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);

  const col1X = 45;
  const col2X = pageW / 2;
  const col3X = pageW - 45;

  // Signatures
  doc.text('Mengetahui,', col1X, sigY, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Kepala Satuan Pelayanan (SPPG)', col1X, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('( ___________________________ )', col1X, sigY + 20, { align: 'center' });
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('NIP: SPPG-BGN-001', col1X, sigY + 23.5, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Diperiksa Oleh,', col2X, sigY, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Tenaga Ahli Gizi (Nutrisionis)', col2X, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('( ___________________________ )', col2X, sigY + 20, { align: 'center' });
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('STR: GIZI-MBG-2026', col2X, sigY + 23.5, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Dibuat Oleh,', col3X, sigY, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Koordinator Produksi & Dapur', col3X, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('( ___________________________ )', col3X, sigY + 20, { align: 'center' });
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Koperasi Al Umanaa Sejahtera Mandiri', col3X, sigY + 23.5, { align: 'center' });
};

// ─── EXPORT MAIN FUNCTION ─────────────────────────────────────────────────────

export async function export8PageDailyReportPdf(
  report: MbgProductionDailyReport | null | undefined,
  batch: MbgPmBatch | undefined,
  entries: MbgPmEntry[] = []
) {
  if (!report) {
    throw new Error('Batch ini belum memiliki data import Excel Laporan Harian! Silakan import Google Sheets / Excel terlebih dahulu.');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const logoAlUmanaa = (await getBase64ImageFromUrl('/logo.png')) || (await getBase64ImageFromUrl('/logo_alumana.png'));
  const logoBadanGizi = await getBase64ImageFromUrl('/logo_badan_gizi.png');

  const tanggalStr = report.tanggal || batch?.tanggal || new Date().toISOString().split('T')[0];
  const totalPorsiBatch =
    batch?.totalJumlah ||
    entries.reduce((s, e) => s + (e.isSekolahLibur ? 0 : (e.jumlah || 0)), 0) ||
    (report.sekolahList || []).reduce((s, sk) => s + sk.murid + sk.guru, 0) ||
    0;

  // ─── HALAMAN 1: REKAPITULASI PENERIMA MANFAAT (FOTO 1) ────────────────────
  renderRekapitulasiPmPage(
    doc,
    report,
    entries,
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  // ─── HALAMAN 2: PORSI KECIL (FOTO 2) ──────────────────────────────────────
  doc.addPage();
  renderPortionStackedPage(
    doc,
    report.porsiKecil,
    'PORSI KECIL (PAUD / TK & SD KELAS 1-3)',
    'kecil',
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  // ─── HALAMAN 3: PORSI BESAR (FOTO 3) ──────────────────────────────────────
  doc.addPage();
  renderPortionStackedPage(
    doc,
    report.porsiBesar,
    'PORSI BESAR (SD KELAS 4-6, SMP, SMA)',
    'besar',
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  // ─── HALAMAN 4+: PORSI BALITA & BUMIL / BUSUI (FOTO 4) ────────────────────
  const hasBalita = report.porsiBalita && (report.porsiBalita.nutritionItems?.length || 0) > 0;
  const hasBumil = report.porsiBumilBusui && (report.porsiBumilBusui.nutritionItems?.length || 0) > 0;

  if (hasBalita) {
    doc.addPage();
    renderPortionStackedPage(
      doc,
      report.porsiBalita,
      'PORSI BALITA (USIA 6-59 BULAN)',
      'balita',
      tanggalStr,
      totalPorsiBatch,
      logoAlUmanaa,
      logoBadanGizi
    );
  }

  if (hasBumil) {
    doc.addPage();
    renderPortionStackedPage(
      doc,
      report.porsiBumilBusui,
      'PORSI IBU HAMIL & IBU MENYUSUI (BUMIL / BUSUI)',
      'bumil_busui',
      tanggalStr,
      totalPorsiBatch,
      logoAlUmanaa,
      logoBadanGizi
    );
  }

  // ─── HALAMAN AKHIR: TABEL SUPPLIER & PENGESAHAN ───────────────────────────
  doc.addPage();
  renderSupplierPage(
    doc,
    report,
    tanggalStr,
    totalPorsiBatch,
    logoAlUmanaa,
    logoBadanGizi
  );

  // Save PDF
  const filename = `Laporan_Harian_MBG_Produksi_${tanggalStr}.pdf`;
  doc.save(filename);
}
