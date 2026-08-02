import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { MbgProductionDailyReport, MbgPmBatch } from '@/types/mbg';

const getBase64ImageFromUrl = async (url: string): Promise<string> => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Error loading image base64:', err);
    return '';
  }
};

const formatRupiah = (val: number | undefined): string => {
  if (val === undefined || isNaN(val)) return 'Rp0';
  return 'Rp' + Math.round(val).toLocaleString('id-ID');
};

const drawPageHeader = async (
  doc: jsPDF,
  _title: string,
  tanggal: string,
  logoAlUmanaa: string,
  logoBadanGizi: string
) => {
  const pageW = doc.internal.pageSize.getWidth();

  // Draw Logos
  if (logoAlUmanaa) {
    doc.addImage(logoAlUmanaa, 'PNG', 12, 8, 16, 16);
  }
  if (logoBadanGizi) {
    doc.addImage(logoBadanGizi, 'PNG', pageW - 28, 8, 16, 16);
  }

  // Header Title Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59); // Slate dark
  doc.text('LAPORAN HARIAN OPERASIONAL', pageW / 2, 12, { align: 'center' });

  doc.setFontSize(10);
  doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU', pageW / 2, 17, { align: 'center' });
  doc.text('YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 22, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // Slate light
  doc.text(tanggal, pageW / 2, 27, { align: 'center' });

  doc.setDrawColor(203, 213, 225);
  doc.line(12, 30, pageW - 12, 30);
};

const drawSectionBanner = (doc: jsPDF, title: string, startY: number) => {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42); // Navy / Slate 900
  doc.rect(12, startY, pageW - 24, 6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(title, pageW / 2, startY + 4.2, { align: 'center' });
};

export async function export8PageDailyReportPdf(
  report: MbgProductionDailyReport,
  batch: MbgPmBatch | undefined
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const logoAlUmanaa = await getBase64ImageFromUrl('/logo_alumana.png');
  const logoBadanGizi = await getBase64ImageFromUrl('/logo_badan_gizi.png');

  const tanggalStr = report.tanggal || batch?.tanggal || '27 Juli 2026';

  // Helper to render Portions Pages (Pages 1-4)
  const renderPortionPage = async (
    pageIndex: number,
    portionData: typeof report.porsiKecil,
    titleBanner: string,
    akgLabels: { label: string; key: string }[]
  ) => {
    if (pageIndex > 1) doc.addPage();

    await drawPageHeader(doc, titleBanner, tanggalStr, logoAlUmanaa, logoBadanGizi);
    drawSectionBanner(doc, titleBanner, 32);

    let currentY = 40;

    // --- 1. KANDUNGAN GIZI ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('KANDUNGAN GIZI', 12, currentY);
    currentY += 2;

    const giziRows: RowInput[] = [];
    portionData.nutritionItems.forEach((item) => {
      giziRows.push([
        item.menuName || '-',
        item.rincianBahan || '-',
        item.beratBersih || 0,
        item.energi || 0,
        item.protein || 0,
        item.lemak || 0,
        item.karbohidrat || 0,
        item.serat || 0,
      ]);
    });

    // Total row
    const totalGizi = portionData.totalGizi;
    giziRows.push([
      { content: 'Total', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: totalGizi.beratBersih, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: totalGizi.energi, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: totalGizi.protein, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: totalGizi.lemak, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: totalGizi.karbohidrat, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: totalGizi.serat, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    ]);

    // AKG Rows
    akgLabels.forEach((akg) => {
      const metric = portionData.akgMetrics?.[akg.key] || { percentMakanSiang: 0, percentHarian: 0 };
      giziRows.push([
        { content: `%Pemenuhan Makan Siang (${akg.label})`, colSpan: 2, styles: { fontStyle: 'bold' } },
        metric.percentMakanSiang || 0,
        '', '', '', '', '',
      ]);
      giziRows.push([
        { content: `%Pemenuhan Harian (${akg.label})`, colSpan: 2, styles: { fontStyle: 'bold' } },
        metric.percentHarian || 0,
        '', '', '', '', '',
      ]);
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Menu', 'Rincian Bahan', 'Berat Bersih', 'Energi (kkal)', 'Protein (g)', 'Lemak (g)', 'Karbohidrat (g)', 'Serat (g)']],
      body: giziRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1, halign: 'center' },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: 12, right: 12 },
    });

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

    // --- 2. PESANAN BAHAN MAKANAN ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PESANAN BAHAN MAKANAN', 12, currentY);
    currentY += 2;

    const bahanRows: RowInput[] = [];
    portionData.bahanItems.forEach((b) => {
      bahanRows.push([
        b.rincianBahan,
        formatRupiah(b.hargaBahan),
        `${b.bddPercent}%`,
        b.beratKotor,
        b.totalGml,
        `${b.sparePercent}%`,
        b.kebutuhan,
        b.satuan,
        formatRupiah(b.harga),
      ]);
    });

    // Summary row
    bahanRows.push([
      { content: 'TOTAL BELANJA', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatRupiah(portionData.totalBelanjaBahan), styles: { fontStyle: 'bold' } },
    ]);
    bahanRows.push([
      { content: 'HARGA BAHAN MAKANAN PER PORSI', colSpan: 8, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatRupiah(portionData.hargaBahanPerPorsi), styles: { fontStyle: 'bold' } },
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Rincian Bahan', 'Harga Bahan', '%BDD', 'Berat Kotor', 'Total (g/ml)', 'Spare %', 'Kebutuhan (Per Unit)', 'Satuan', 'Harga']],
      body: bahanRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1, halign: 'center' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: 12, right: 12 },
    });

    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

    // --- 3. PESANAN BUMBU ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PESANAN BUMBU', 12, currentY);
    currentY += 2;

    const bumbuRows: RowInput[] = [];
    portionData.bumbuItems.forEach((bm) => {
      bumbuRows.push([
        bm.namaMenu || '',
        bm.namaBumbu || '',
        formatRupiah(bm.hargaBumbu),
        bm.kebutuhan,
        bm.satuan,
        formatRupiah(bm.harga),
      ]);
    });

    bumbuRows.push([
      { content: 'TOTAL BELANJA', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatRupiah(portionData.totalBelanjaBumbu), styles: { fontStyle: 'bold' } },
      { content: `HARGA PER PORSI: ${formatRupiah(portionData.hargaPerPorsiOverall)}`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    ]);
    bumbuRows.push([
      { content: 'HARGA BUMBU', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatRupiah(portionData.hargaBumbuPerPorsi), styles: { fontStyle: 'bold' } },
      '',
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Nama Menu', 'Nama Bumbu', 'Harga Bumbu', 'Kebutuhan (Per Unit)', 'Satuan', 'Harga']],
      body: bumbuRows,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1, halign: 'center' },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: 12, right: 12 },
    });
  };

  // --- PAGE 1: PORSI KECIL ---
  await renderPortionPage(1, report.porsiKecil, 'REALISASI MENU — PORSI KECIL', [
    { label: 'PAUD/TK', key: 'paud' },
    { label: 'SD/MI Kelas 1-3', key: 'sd_kecil' },
  ]);

  // --- PAGE 2: PORSI BESAR ---
  await renderPortionPage(2, report.porsiBesar, 'REALISASI MENU — PORSI BESAR', [
    { label: 'SD/MI Kelas 4-6', key: 'sd_besar' },
    { label: 'SMP/MTs', key: 'smp' },
    { label: 'SMA/MA/SMK', key: 'sma' },
  ]);

  // --- PAGE 3: PORSI BALITA ---
  await renderPortionPage(3, report.porsiBalita, 'REALISASI MENU — PORSI BALITA', [
    { label: 'BALITA', key: 'balita' },
  ]);

  // --- PAGE 4: PORSI BUMIL / BUSUI ---
  await renderPortionPage(4, report.porsiBumilBusui, 'REALISASI MENU — PORSI BUMIL/BUSUI', [
    { label: 'BUMIL', key: 'bumil' },
    { label: 'BUSUI', key: 'busui' },
  ]);

  // --- PAGE 5: PAKET SEHAT 3B ---
  doc.addPage();
  await drawPageHeader(doc, 'PAKET SEHAT 3B', tanggalStr, logoAlUmanaa, logoBadanGizi);
  drawSectionBanner(doc, 'PAKET SEHAT 3B', 32);

  const p5Y = 40;
  const paketRows: RowInput[] = [];
  report.paketSehat3b?.keringanItems?.forEach((item) => {
    paketRows.push([item.item, item.qtyPcs, item.qty, item.satuan, formatRupiah(item.hargaSatuan), formatRupiah(item.totalHarga)]);
  });

  autoTable(doc, {
    startY: p5Y,
    head: [['List Bahan Keringan', 'Qty (Pcs)', 'Qty', 'Satuan', 'Harga Satuan', 'Total Harga']],
    body: paketRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 },
  });

  // --- PAGE 6: PO & REALISASI PEMBELIAN ---
  doc.addPage();
  await drawPageHeader(doc, 'PURCHASE ORDER & REALISASI PEMBELIAN', tanggalStr, logoAlUmanaa, logoBadanGizi);
  drawSectionBanner(doc, 'PURCHASE ORDER (PO) BAHAN BAKU', 32);

  let p6Y = 40;
  const poTableRows: RowInput[] = [];
  report.poRows?.forEach((p) => {
    poTableRows.push([p.supplier, p.item, p.jamKedatangan || '-', p.jumlah, p.satuan, p.keterangan || '-']);
  });

  autoTable(doc, {
    startY: p6Y,
    head: [['Supplier', 'List Pesanan Bahan', 'Jam Kedatangan', 'Jumlah', 'Item', 'Keterangan']],
    body: poTableRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, halign: 'center' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 },
  });

  p6Y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  drawSectionBanner(doc, 'REALISASI PEMBELIAN BAHAN BAKU', p6Y);
  p6Y += 8;

  const realisasiRows: RowInput[] = [];
  report.realisasiPembelianRows?.forEach((r) => {
    realisasiRows.push([r.tanggal, r.namaBahan, r.kuantitas, r.satuan, formatRupiah(r.hargaPerUnit), formatRupiah(r.totalHarga)]);
  });

  realisasiRows.push([
    { content: 'TOTAL PENGELUARAN BAHAN MAKANAN', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: formatRupiah(report.totalPengeluaran), styles: { fontStyle: 'bold' } },
  ]);
  realisasiRows.push([
    { content: 'TOTAL ANGGARAN', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: formatRupiah(report.totalAnggaran), styles: { fontStyle: 'bold' } },
  ]);
  realisasiRows.push([
    { content: 'SELISIH', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: formatRupiah(report.selisih), styles: { fontStyle: 'bold', textColor: report.selisih < 0 ? [220, 38, 38] : [22, 163, 74] } },
  ]);

  autoTable(doc, {
    startY: p6Y,
    head: [['TANGGAL', 'NAMA BAHAN', 'KUANTITAS', 'SATUAN', 'HARGA PER UNIT', 'TOTAL HARGA']],
    body: realisasiRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, halign: 'center' },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 },
  });

  // --- PAGE 7: FORM PEMERIKSAAN BAHAN MAKANAN ---
  doc.addPage();
  await drawPageHeader(doc, 'FORM PEMERIKSAAN BAHAN MAKANAN', tanggalStr, logoAlUmanaa, logoBadanGizi);

  let p7Y = 33;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PEMERIKSAAN BAHAN MAKANAN', doc.internal.pageSize.getWidth() / 2, p7Y, { align: 'center' });
  doc.text(`FORM PEMERIKSAAN BAHAN MAKANAN — NO: ${report.inspectionForm?.noForm || '26/PBM/VII/2026'}`, doc.internal.pageSize.getWidth() / 2, p7Y + 4, { align: 'center' });

  p7Y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Dari       : ${report.inspectionForm?.dari || 'Koperasi Al Umanaa Sejahtera Mandiri'}`, 12, p7Y);
  doc.text(`Kepada : ${report.inspectionForm?.kepada || 'SPPG Sukabumi Gunungguruh Kebonmanggu'}`, 12, p7Y + 4);
  doc.text(`Waktu   : ${report.inspectionForm?.waktu || tanggalStr}`, 12, p7Y + 8);

  p7Y += 12;

  const qcRows: RowInput[] = [];
  report.inspectionForm?.rows?.forEach((qc) => {
    qcRows.push([
      qc.jenisBahan,
      qc.banyaknya,
      qc.satuan,
      qc.isSesuai ? 'V' : '',
      !qc.isSesuai ? 'V' : '',
      qc.isBaik ? 'V' : '',
      !qc.isBaik ? 'V' : '',
      qc.notes || '',
    ]);
  });

  autoTable(doc, {
    startY: p7Y,
    head: [
      [
        { content: 'Jenis Bahan Makanan', rowSpan: 2 },
        { content: 'Banyaknya (Angka)', rowSpan: 2 },
        { content: 'Satuan', rowSpan: 2 },
        { content: 'Jumlah', colSpan: 2 },
        { content: 'Kondisi Bahan Makanan', colSpan: 2 },
        { content: 'Dokumentasi', rowSpan: 2 },
      ],
      ['Sesuai', 'Tidak', 'Baik', 'Rusak'],
    ],
    body: qcRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, halign: 'center' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 },
  });

  const finalQcY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

  // Signature Block
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Sukabumi, ${tanggalStr}`, pageW - 25, finalQcY, { align: 'right' });
  doc.text(report.inspectionForm?.officerTitle || 'Kepala Satuan Pelayanan Pemenuhan Gizi', pageW - 25, finalQcY + 5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text(report.inspectionForm?.officerName || 'Ragha Eskha Utama, S.Hum.', pageW - 25, finalQcY + 25, { align: 'right' });

  // --- PAGE 8: REKAPAN LIMBAH SISA MAKANAN ---
  doc.addPage();
  await drawPageHeader(doc, 'REKAPAN LIMBAH SISA MAKANAN', tanggalStr, logoAlUmanaa, logoBadanGizi);
  drawSectionBanner(doc, 'REKAPAN LIMBAH SISA MAKANAN', 32);

  const p8Y = 40;
  const wasteRows: RowInput[] = [];
  report.wasteLogs?.forEach((w, idx) => {
    wasteRows.push([w.no || idx + 1, w.namaMakanan, w.kuantitas, w.satuan, w.dokumentasi || '-']);
  });

  autoTable(doc, {
    startY: p8Y,
    head: [['No', 'Nama Makanan', 'Kuantitas', 'Satuan', 'Dokumentasi']],
    body: wasteRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 12, right: 12 },
  });

  // Save PDF
  const filename = `Laporan_Harian_Produksi_MBG_${tanggalStr.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}
