// ============================================================================
// MBG Report Page — Pembuatan & Ekspor Laporan Harian & Mingguan MBG
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import {
  FileText, Loader2, Download,
  Settings2, Info, BookOpen
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgPmBatch, MbgPmEntry } from '@/types/mbg';
import { subscribeBatches, subscribeEntries } from '@/services/mbgAdminService';

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export function MbgReportPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'harian' | 'mingguan'>('harian');
  const [batches, setBatches] = useState<MbgPmBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [harianEntries, setHarianEntries] = useState<MbgPmEntry[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Weekly report configuration
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [weeklyLatarBelakang, setWeeklyLatarBelakang] = useState(
    'Masalah gizi buruk masih menjadi tantangan besar di berbagai daerah, terutama di wilayah perdesaan yang memiliki akses terbatas terhadap makanan bergizi. Kondisi ini dapat berdampak negatif pada kesehatan dan perkembangan anak-anak serta produktivitas masyarakat. Oleh karena itu, diperlukan langkah nyata untuk memberikan akses makanan bergizi kepada masyarakat yang membutuhkan, sekaligus meningkatkan kesadaran akan pentingnya pola makan sehat.\n\nIndonesia sebagai negara berkembang menghadapi berbagai tantangan di bidang kesehatan masyarakat, salah satunya adalah prevalensi stunting yang tinggi akibat kekurangan gizi kronis. Program Makan Bergizi Gratis (MBG) ini dirancang untuk memberikan dampak jangka pendek dan jangka panjang bagi generasi penerus bangsa.'
  );
  const [weeklyTujuan, setWeeklyTujuan] = useState(
    '1. Menyediakan makanan bergizi seimbang secara rutin untuk meningkatkan derajat kesehatan penerima manfaat.\n2. Mencegah dan menurunkan angka stunting pada balita dan anak-anak usia tumbuh kembang.\n3. Meningkatkan kesadaran gizi bagi ibu hamil dan menyusui di wilayah pelayanan.\n4. Membantu meringankan beban ekonomi keluarga penerima manfaat dalam pemenuhan nutrisi harian.'
  );
  const [generatingWeekly, setGeneratingWeekly] = useState(false);

  // Load batches for daily dropdown (all non-draft/submitted batches)
  useEffect(() => {
    const unsub = subscribeBatches(
      (b) => {
        // Show all batches that have been submitted / processed
        const active = b.filter((batch) => batch.status !== 'DRAFT');
        setBatches(active);
        setLoadingBatches(false);
        if (active.length > 0) {
          setSelectedBatchId((current) => current || active[0].id);
        }
      },
      (err) => {
        console.error('Error loading batches:', err);
        setLoadingBatches(false);
      }
    );
    return unsub;
  }, []);

  // Load entries for selected daily batch
  useEffect(() => {
    if (!selectedBatchId) {
      setHarianEntries([]);
      return;
    }
    setLoadingEntries(true);
    const unsub = subscribeEntries(
      selectedBatchId,
      (e) => {
        setHarianEntries(e);
        setLoadingEntries(false);
      },
      (err) => {
        console.error('Error loading entries:', err);
        setLoadingEntries(false);
      }
    );
    return unsub;
  }, [selectedBatchId]);

  const selectedBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId);
  }, [batches, selectedBatchId]);

  // Format date helper (Indonesian format)
  const formatIndoDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Helper to load logo image
  const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Error loading logo for PDF:", err);
      return null;
    }
  };

  // ==========================================================================
  // EXPORT LAPORAN HARIAN PDF
  // ==========================================================================
  const handleExportHarianPdf = async () => {
    if (!selectedBatch || harianEntries.length === 0) return;
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      // Brand Color Schemes
      const brandAmberDark: [number, number, number] = [146, 64, 14];   // #92400E
      const brandYellow: [number, number, number] = [251, 191, 36];     // #FBBF24
      const slateDark: [number, number, number] = [17, 24, 39];         // #111827
      const slateLight: [number, number, number] = [107, 114, 128];     // #6B7280

      // 1. Logo and Title Header (Centered Layout)
      const logoBase64 = await getBase64ImageFromUrl('/logo_badan_gizi.png');
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', (pageW / 2) - 9, 8, 18, 18);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...brandAmberDark);
      doc.text('YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 31, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...slateDark);
      doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU', pageW / 2, 36.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text('Jl. Pelabuhan II Km. 9 Cibolang, Sukabumi | SIMOL MBG', pageW / 2, 41, { align: 'center' });

      // Horizontal separator line
      doc.setDrawColor(229, 231, 235);
      doc.line(14, 44, pageW - 14, 44);

      // Yellow highlights bar for Date
      doc.setFillColor(...brandYellow);
      doc.rect(14, 48, pageW - 28, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...slateDark);
      doc.text(
        `LAPORAN OPERASIONAL HARIAN MBG - ${formatIndoDate(selectedBatch.tanggal).toUpperCase()}`,
        pageW / 2,
        53,
        { align: 'center' }
      );

      // 2. Table Data compilation
      // Split posyandu rows into Balita, Bumil, Busui if count > 0.
      const rows: string[][] = [];
      let totalPM = 0;
      let totalPIC = 0;

      harianEntries.forEach((entry) => {
        if (entry.isSekolahLibur) return;

        if (entry.institutionType === 'posyandu') {
          const balitaCount = entry.qtSiswaBalita || 0;
          const bumilCount = entry.qtBumil || 0;
          const busuiCount = entry.qtBusui || 0;
          const kaderCount = entry.qtGuruKader || 0;

          // Balita
          if (balitaCount > 0) {
            rows.push([
              `Balita Posyandu ${entry.institutionName}`,
              balitaCount.toLocaleString('id-ID'),
              kaderCount.toLocaleString('id-ID'),
              entry.notes || '-',
            ]);
            totalPM += balitaCount;
            totalPIC += kaderCount;
          }

          // Bumil
          if (bumilCount > 0) {
            rows.push([
              `Bumil Posyandu ${entry.institutionName}`,
              bumilCount.toLocaleString('id-ID'),
              '0',
              entry.notes || '-',
            ]);
            totalPM += bumilCount;
          }

          // Busui
          if (busuiCount > 0) {
            rows.push([
              `Busui Posyandu ${entry.institutionName}`,
              busuiCount.toLocaleString('id-ID'),
              '0',
              entry.notes || '-',
            ]);
            totalPM += busuiCount;
          }

          // Fallback if older data does not have qtBumil/qtBusui split but has qtBumilBusui
          if (bumilCount === 0 && busuiCount === 0 && entry.qtBumilBusui > 0) {
            rows.push([
              `Bumil/Busui Posyandu ${entry.institutionName}`,
              entry.qtBumilBusui.toLocaleString('id-ID'),
              '0',
              entry.notes || '-',
            ]);
            totalPM += entry.qtBumilBusui;
          }
        } else {
          // Sekolah
          rows.push([
            entry.institutionName,
            entry.qtSiswaBalita.toLocaleString('id-ID'),
            entry.qtGuruKader.toLocaleString('id-ID'),
            entry.notes || '-',
          ]);
          totalPM += entry.qtSiswaBalita;
          totalPIC += entry.qtGuruKader;
        }
      });

      // 3. Render Table
      autoTable(doc, {
        startY: 59,
        head: [['Nama Penerima Manfaat', 'Jumlah PM', 'Jumlah PIC', 'Keterangan']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 8.5 },
        bodyStyles: { fontSize: 8, textColor: [31, 41, 55] },
        columnStyles: {
          0: { cellWidth: 75, fontStyle: 'bold' },
          1: { cellWidth: 25, halign: 'center' },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 55 },
        },
        margin: { left: 14, right: 14 },
      });

      // 4. Totals and Notes at the bottom
      let nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      doc.text(`Total Porsi Penerima Manfaat (PM): ${totalPM.toLocaleString('id-ID')}`, 14, nextY);
      doc.text(`Total Porsi PIC (Guru/Kader): ${totalPIC.toLocaleString('id-ID')}`, 14, nextY + 4.5);
      doc.text(`Total Keseluruhan Porsi: ${(totalPM + totalPIC).toLocaleString('id-ID')} Porsi`, 14, nextY + 9);

      // Footnote notes
      nextY += 14;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...slateLight);
      doc.text(
        '*) Kolom keterangan digunakan untuk memberikan informasi apabila terdapat perubahan data yang signifikan dari rekapan sebelumnya.',
        14,
        nextY
      );

      // Signature block
      nextY += 20;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      
      const todayStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.text(`Sukabumi, ${todayStr}`, pageW - 60, nextY);
      doc.text('Penanggung Jawab SPPG Sukabumi,', pageW - 60, nextY + 4.5);
      
      doc.setDrawColor(200, 200, 200);
      doc.line(pageW - 60, nextY + 23, pageW - 14, nextY + 23);
      doc.setFont('helvetica', 'bold');
      doc.text(user?.displayName || 'Tim Admin SPPG', pageW - 60, nextY + 27);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text('Koperasi Al Umanaa', pageW - 60, nextY + 30.5);

      // Draw page decorations/variations (header/footer accent lines) and page numbers (e.g. Page X of Y)
      const totalPages = doc.getNumberOfPages();
      const pageH = doc.internal.pageSize.getHeight();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Header accent: Solid Amber Gold header band (3mm height) with a dark accent line
        doc.setFillColor(251, 191, 36); // #FBBF24 (Gold)
        doc.rect(0, 0, pageW, 3, 'F');
        doc.setFillColor(180, 83, 9); // #B45309 (Amber Dark)
        doc.rect(0, 3, pageW, 0.8, 'F');

        // Footer accent line
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(14, pageH - 12, pageW - 14, pageH - 12);

        // Footer left: branding & report details
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...slateLight);
        doc.text("Sistem Informasi Makanan Bergizi - SIMOL MBG", 14, pageH - 7);

        // Footer right: page numbers
        doc.text(`Halaman ${i} dari ${totalPages}`, pageW - 14, pageH - 7, { align: "right" });
      }

      doc.save(`Laporan_Harian_MBG_${selectedBatch.tanggal}.pdf`);
      showToast({ message: 'Laporan harian berhasil diunduh!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal mengekspor PDF', variant: 'error' });
    }
  };

  // ==========================================================================
  // EXPORT LAPORAN MINGGUAN PDF
  // ==========================================================================
  const handleExportWeeklyPdf = async () => {
    if (!startDate || !endDate) return;
    setGeneratingWeekly(true);
    try {
      // 1. Fetch all batches in date range
      const batchesRef = collection(db, 'mbg_pm_batches');
      const bq = query(
        batchesRef,
        where('tanggal', '>=', startDate),
        where('tanggal', '<=', endDate),
        orderBy('tanggal', 'asc')
      );
      const batchesSnapshot = await getDocs(bq);

      if (batchesSnapshot.empty) {
        showToast({ message: 'Tidak ada data batch pada rentang tanggal tersebut', variant: 'error' });
        setGeneratingWeekly(false);
        return;
      }

      const dateRangeBatches = batchesSnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MbgPmBatch[];

      // 2. Fetch all entries for these batches by chunking batchIds in 10s
      const batchIds = dateRangeBatches.map((b) => b.id);
      const batchIdChunks = chunkArray(batchIds, 10);

      const allEntriesSnapshot = await Promise.all(
        batchIdChunks.map(async (chunk) => {
          const eq = query(
            collection(db, 'mbg_pm_entries'),
            where('batchId', 'in', chunk)
          );
          return getDocs(eq);
        })
      );

      const allEntries = allEntriesSnapshot.flatMap((snapshot) =>
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as MbgPmEntry))
      );

      if (allEntries.length === 0) {
        showToast({ message: 'Tidak ada data PM pada rentang tanggal tersebut', variant: 'error' });
        setGeneratingWeekly(false);
        return;
      }

      // Compile Laporan data
      // Target 1: Sasaran penerima (group by institutionName to find max/latest stats)
      const latestEntriesMap = new Map<string, MbgPmEntry>();
      allEntries.forEach((entry) => {
        const key = entry.institutionName.toLowerCase().trim();
        const existing = latestEntriesMap.get(key);
        if (!existing || entry.createdAt > existing.createdAt) {
          latestEntriesMap.set(key, entry);
        }
      });

      const uniqueEntries = Array.from(latestEntriesMap.values());
      
      let maxSiswa = 0;
      let maxBalita = 0;
      let maxBumil = 0;
      let maxBusui = 0;
      let maxGuru = 0;
      let maxKader = 0;

      uniqueEntries.forEach((entry) => {
        if (entry.institutionType === 'posyandu') {
          maxBalita += entry.qtSiswaBalita || 0;
          maxBumil += entry.qtBumil || 0;
          maxBusui += entry.qtBusui || 0;
          maxKader += entry.qtGuruKader || 0;
        } else {
          maxSiswa += entry.qtSiswaBalita || 0;
          maxGuru += entry.qtGuruKader || 0;
        }
      });

      // PDF document generation
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const brandAmberDark: [number, number, number] = [146, 64, 14];   // #92400E
      const slateDark: [number, number, number] = [17, 24, 39];         // #111827
      const slateLight: [number, number, number] = [107, 114, 128];     // #6B7280

      // Cover / Document Header block
      const logoBase64 = await getBase64ImageFromUrl('/logo_badan_gizi.png');
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', (pageW / 2) - 9, 8, 18, 18);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...brandAmberDark);
      doc.text('YAYASAN LEMBAGA WAKAF AL UMANAA', pageW / 2, 31, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...slateDark);
      doc.text('SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU', pageW / 2, 36.5, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateLight);
      doc.text('LAPORAN OPERASIONAL MINGGUAN KOPERASI AL-UMANAA | MBG', pageW / 2, 41, { align: 'center' });

      doc.setDrawColor(229, 231, 235);
      doc.line(14, 44, pageW - 14, 44);

      // Title header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...brandAmberDark);
      doc.text('LAPORAN MINGGUAN OPERASIONAL', pageW / 2, 52, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(...slateDark);
      doc.text(`Periode: ${startDate} s/d ${endDate}`, pageW / 2, 57, { align: 'center' });

      // BAB I. PENDAHULUAN
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...slateDark);
      doc.text('BAB I. PENDAHULUAN', 14, 66);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('a. Latar Belakang', 14, 72);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(31, 41, 55);

      // Render paragraph block safely wrapping lines
      const splitLatarBelakang = doc.splitTextToSize(weeklyLatarBelakang, pageW - 28);
      doc.text(splitLatarBelakang, 14, 76);
      
      let curY = 76 + (splitLatarBelakang.length * 4) + 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...slateDark);
      doc.text('b. Tujuan Kegiatan', 14, curY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(31, 41, 55);
      
      const splitTujuan = doc.splitTextToSize(weeklyTujuan, pageW - 28);
      doc.text(splitTujuan, 14, curY + 4);

      curY = curY + 4 + (splitTujuan.length * 4) + 4;

      // c. Sasaran Penerima
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...slateDark);
      doc.text('c. Sasaran Penerima', 14, curY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(31, 41, 55);
      
      const sasaranText = `Selama periode laporan ini, SPPG Sukabumi Gunungguruh Kebonmanggu telah mendistribusikan makan bergizi seimbang dengan rincian sasaran penerima manfaat unik maksimal sebagai berikut:`;
      const splitSasaranText = doc.splitTextToSize(sasaranText, pageW - 28);
      doc.text(splitSasaranText, 14, curY + 4);

      curY = curY + 4 + (splitSasaranText.length * 4) + 3;

      // Draw Sasaran breakdown boxes
      doc.setFillColor(249, 250, 251);
      doc.rect(14, curY, pageW - 28, 22, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.rect(14, curY, pageW - 28, 22, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...brandAmberDark);
      doc.text('RINCIAN TOTAL PENERIMA MASSAIL & PIC (UNIK MAKSIMAL)', 18, curY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...slateDark);
      doc.text(`- Siswa Sekolah: ${maxSiswa.toLocaleString('id-ID')} anak`, 18, curY + 10);
      doc.text(`- Balita Posyandu: ${maxBalita.toLocaleString('id-ID')} anak`, 18, curY + 14);
      doc.text(`- Guru Sekolah: ${maxGuru.toLocaleString('id-ID')} orang`, 18, curY + 18);

      doc.text(`- Ibu Hamil (Bumil): ${maxBumil.toLocaleString('id-ID')} orang`, 100, curY + 10);
      doc.text(`- Ibu Menyusui (Busui): ${maxBusui.toLocaleString('id-ID')} orang`, 100, curY + 14);
      doc.text(`- Kader Posyandu: ${maxKader.toLocaleString('id-ID')} orang`, 100, curY + 18);

      curY += 28;

      // Draw page break to begin BAB II
      doc.addPage();
      
      // BAB II. PELAKSANAAN KEGIATAN
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...slateDark);
      doc.text('BAB II. PELAKSANAAN KEGIATAN', 14, 16);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('A. Penerima MBG & Alamat Sasaran (Tabel 1)', 14, 22);

      // Compile Tabel 1 Rows (Unique Schools)
      let table1Idx = 1;
      const table1Rows = uniqueEntries.map((e) => {
        let pmLabel = '';
        if (e.institutionType === 'posyandu') {
          pmLabel = `Balita: ${e.qtSiswaBalita || 0}, Bumil: ${e.qtBumil || 0}, Busui: ${e.qtBusui || 0}`;
        } else {
          pmLabel = `Siswa: ${e.qtSiswaBalita || 0}`;
        }
        return [
          table1Idx++,
          'Sukabumi',
          e.institutionName,
          e.address || 'Kec. Gunungguruh Kebonmanggu',
          pmLabel,
        ];
      });

      autoTable(doc, {
        startY: 25,
        head: [['No', 'Kabupaten/Kota', 'Nama Sekolah/Sasaran', 'Alamat Lengkap', 'Jumlah Sasaran']],
        body: table1Rows,
        theme: 'striped',
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [31, 41, 55] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 45, fontStyle: 'bold' },
          3: { cellWidth: 60 },
          4: { cellWidth: 42 },
        },
        margin: { left: 14, right: 14 },
      });

      let nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...slateDark);
      doc.text('B. Rekapitulasi Distribusi & Menu Harian (Tabel 2)', 14, nextY);

      // Compile Tabel 2 Rows (Rekap Menu Harian per Sekolah/Posyandu)
      let table2Idx = 1;
      const table2Rows: (string | number)[][] = [];

      // Sort entries by batch date, then sort order
      const sortedAllEntries = [...allEntries].sort((a, b) => {
        const dateA = dateRangeBatches.find((batch) => batch.id === a.batchId)?.tanggal || '';
        const dateB = dateRangeBatches.find((batch) => batch.id === b.batchId)?.tanggal || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });

      sortedAllEntries.forEach((e) => {
        if (e.isSekolahLibur) return;
        const dateStr = dateRangeBatches.find((batch) => batch.id === e.batchId)?.tanggal || '';
        const formattedDate = dateStr
          ? new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : '-';

        const menus = [...(e.menuItems || [])];
        if (e.menuKeringanItems && e.menuKeringanItems.length > 0) {
          menus.push(`Alt Keringan: ${e.menuKeringanItems.join(', ')}`);
        }
        const menuString = menus.join(', ') || 'Menu belum ditentukan';

        table2Rows.push([
          table2Idx++,
          formattedDate,
          e.institutionName,
          menuString,
          e.jumlah ? `${e.jumlah.toLocaleString('id-ID')} Porsi` : '-',
        ]);
      });

      autoTable(doc, {
        startY: nextY + 3,
        head: [['No', 'Tanggal', 'Nama Sekolah/Sasaran', 'Jenis Menu MBG yang Diberikan', 'Total PM']],
        body: table2Rows,
        theme: 'striped',
        headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [31, 41, 55] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 50, fontStyle: 'bold' },
          3: { cellWidth: 77 },
          4: { cellWidth: 25, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });

      nextY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // Totals at the bottom
      const totalOverallPorsi = allEntries.reduce((sum, e) => sum + (e.isSekolahLibur ? 0 : e.jumlah || 0), 0);

      if (nextY > pageH - 30) {
        doc.addPage();
        nextY = 16;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      doc.text(`Total Keseluruhan Porsi Didistribusikan: ${totalOverallPorsi.toLocaleString('id-ID')} Porsi`, 14, nextY);

      // Signature block
      nextY += 12;
      if (nextY > pageH - 40) {
        doc.addPage();
        nextY = 16;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...slateDark);
      
      const todayStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.text(`Sukabumi, ${todayStr}`, pageW - 60, nextY);
      doc.text('Penanggung Jawab SPPG Sukabumi,', pageW - 60, nextY + 4.5);
      
      doc.setDrawColor(200, 200, 200);
      doc.line(pageW - 60, nextY + 23, pageW - 14, nextY + 23);
      doc.setFont('helvetica', 'bold');
      doc.text(user?.displayName || 'Tim Admin SPPG', pageW - 60, nextY + 27);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text('Koperasi Al Umanaa', pageW - 60, nextY + 30.5);

      // Draw page decorations/variations (header/footer accent lines) and page numbers (e.g. Page X of Y)
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Header accent: Solid Amber Gold header band (3mm height) with a dark accent line
        doc.setFillColor(251, 191, 36); // #FBBF24 (Gold)
        doc.rect(0, 0, pageW, 3, 'F');
        doc.setFillColor(180, 83, 9); // #B45309 (Amber Dark)
        doc.rect(0, 3, pageW, 0.8, 'F');

        // Footer accent line
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(14, pageH - 12, pageW - 14, pageH - 12);

        // Footer left: branding & report details
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...slateLight);
        doc.text("Sistem Informasi Makanan Bergizi - SIMOL MBG", 14, pageH - 7);

        // Footer right: page numbers
        doc.text(`Halaman ${i} dari ${totalPages}`, pageW - 14, pageH - 7, { align: "right" });
      }

      doc.save(`Laporan_Mingguan_MBG_${startDate}_ke_${endDate}.pdf`);
      showToast({ message: 'Laporan mingguan berhasil diunduh!', variant: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ message: 'Gagal mengekspor PDF laporan mingguan', variant: 'error' });
    } finally {
      setGeneratingWeekly(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto font-['Hanken_Grotesk',system-ui,sans-serif] min-h-screen text-[#111827]">
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2 text-[#92400E]">
            <FileText className="h-6 w-6" /> Laporan Operasional MBG
          </h2>
          <p className="text-xs text-[#6B7280] mt-1">
            Unduh Laporan Harian Operasional dan Laporan Mingguan MBG dengan format SPPG Sukabumi Al Umanaa.
          </p>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-[#E5E7EB] mb-6">
        <button
          onClick={() => setActiveTab('harian')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'harian'
              ? 'border-[#FBBF24] text-[#B45309]'
              : 'border-transparent text-[#6B7280] hover:text-[#111827]'
          }`}
        >
          Laporan Harian Operasional
        </button>
        <button
          onClick={() => setActiveTab('mingguan')}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'mingguan'
              ? 'border-[#FBBF24] text-[#B45309]'
              : 'border-transparent text-[#6B7280] hover:text-[#111827]'
          }`}
        >
          Laporan Mingguan Operasional
        </button>
      </div>

      {/* Content based on Active Tab */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {activeTab === 'harian' ? (
          <>
            {/* Harian configuration form */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 lg:col-span-1 space-y-5 h-fit shadow-sm">
              <h3 className="text-sm font-extrabold flex items-center gap-1.5 text-gray-800 uppercase tracking-wider">
                <Settings2 className="h-4 w-4 text-[#D97706]" /> Konfigurasi Laporan
              </h3>

              {/* Batch Date Dropdown */}
              <div>
                <label htmlFor="harian-date-select" className="block text-xs font-bold text-[#374151] mb-1.5">
                  Pilih Tanggal Laporan (Batch)
                </label>
                {loadingBatches ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 p-2 border border-gray-100 rounded-xl bg-gray-50/50">
                    <Loader2 className="h-3 w-3 animate-spin" /> Memuat data batch...
                  </div>
                ) : batches.length === 0 ? (
                  <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 font-semibold italic">
                    Belum ada batch yang disubmit (Status aktif PM). Silakan buat & submit data PM di halaman administrasi.
                  </div>
                ) : (
                  <select
                    id="harian-date-select"
                    title="Pilih Tanggal Laporan (Batch)"
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  >
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.tanggal} — status: {b.status}
                      </option>
                    ))}
                  </select>
                )}
              </div>


              {/* Action export button */}
              <button
                onClick={handleExportHarianPdf}
                disabled={batches.length === 0 || harianEntries.length === 0}
                className="w-full py-3 bg-[#FBBF24] hover:bg-[#F59E0B] text-xs font-bold text-[#111827] rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Download className="h-4 w-4" /> Export PDF Laporan Harian
              </button>
            </div>

            {/* Harian preview table */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 lg:col-span-2 shadow-sm">
              <h3 className="text-sm font-extrabold flex items-center gap-1.5 text-gray-800 uppercase tracking-wider mb-4 border-b border-[#F3F4F6] pb-3">
                <Info className="h-4 w-4 text-[#D97706]" /> Preview Laporan Operasional Harian
              </h3>

              {loadingEntries ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
                  <span className="text-xs font-semibold">Memuat rekapitulasi data harian...</span>
                </div>
              ) : harianEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 italic text-xs">
                  Tidak ada data untuk ditampilkan. Silakan pilih tanggal batch yang memiliki data PM.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary widgets */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center">
                      <span className="text-[10px] font-bold text-gray-400 block uppercase">Total PM</span>
                      <span className="text-base font-extrabold text-[#92400E]">
                        {harianEntries.reduce((sum, e) => sum + (e.isSekolahLibur ? 0 : e.qtSiswaBalita + e.qtBumilBusui), 0)}
                      </span>
                    </div>
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center">
                      <span className="text-[10px] font-bold text-gray-400 block uppercase">Total PIC (Guru/Kdr)</span>
                      <span className="text-base font-extrabold text-[#92400E]">
                        {harianEntries.reduce((sum, e) => sum + (e.isSekolahLibur ? 0 : e.qtGuruKader), 0)}
                      </span>
                    </div>
                  </div>

                  {/* Preview grid */}
                  <div className="overflow-x-auto border border-[#E5E7EB] rounded-xl max-h-[350px]">
                    <table className="w-full text-xs text-left min-w-[600px]">
                      <thead className="bg-[#F9FAFB] text-[10px] font-bold text-gray-500 uppercase sticky top-0 border-b border-[#E5E7EB]">
                        <tr>
                          <th className="px-4 py-3">Nama Penerima Manfaat</th>
                          <th className="px-3 py-3 text-center">Jumlah PM</th>
                          <th className="px-3 py-3 text-center">Jumlah PIC</th>
                          <th className="px-4 py-3">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {harianEntries.map((e) => {
                          if (e.isSekolahLibur) return null;
                          return (
                            <tr key={e.id} className="hover:bg-gray-50/50 text-[#374151]">
                              <td className="px-4 py-2.5 font-semibold text-gray-800">{e.institutionName}</td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-700">
                                {e.institutionType === 'posyandu' ? e.qtSiswaBalita + e.qtBumilBusui : e.qtSiswaBalita}
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-gray-700">{e.qtGuruKader}</td>
                              <td className="px-4 py-2.5 text-gray-400 italic truncate max-w-[150px]">
                                {e.notes || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Weekly configuration form */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 lg:col-span-1 space-y-4 h-fit shadow-sm">
              <h3 className="text-sm font-extrabold flex items-center gap-1.5 text-gray-800 uppercase tracking-wider mb-2">
                <Settings2 className="h-4 w-4 text-[#D97706]" /> Parameter Periode
              </h3>

              {/* Start Date */}
              <div>
                <label htmlFor="weekly-start-date" className="block text-xs font-bold text-[#374151] mb-1">
                  Tanggal Mulai
                </label>
                <input
                  id="weekly-start-date"
                  type="date"
                  title="Tanggal Mulai"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              {/* End Date */}
              <div>
                <label htmlFor="weekly-end-date" className="block text-xs font-bold text-[#374151] mb-1">
                  Tanggal Selesai
                </label>
                <input
                  id="weekly-end-date"
                  type="date"
                  title="Tanggal Selesai"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>


              {/* Action export weekly */}
              <button
                onClick={handleExportWeeklyPdf}
                disabled={generatingWeekly || !startDate || !endDate}
                className="w-full py-3 bg-[#FBBF24] hover:bg-[#F59E0B] text-xs font-bold text-[#111827] rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {generatingWeekly ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Menyusun Laporan...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Export PDF Laporan Mingguan
                  </>
                )}
              </button>
            </div>

            {/* Weekly document edit values */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 lg:col-span-2 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold flex items-center gap-1.5 text-gray-800 uppercase tracking-wider mb-2 border-b border-[#F3F4F6] pb-3">
                <BookOpen className="h-4 w-4 text-[#D97706]" /> Redaksi Laporan Mingguan (BAB I)
              </h3>

              {/* Latar Belakang */}
              <div>
                <label htmlFor="weekly-latar-belakang" className="block text-xs font-bold text-[#374151] mb-1.5">
                  Bab I. Latar Belakang (Dapat Diedit Sesuai Kebutuhan)
                </label>
                <textarea
                  id="weekly-latar-belakang"
                  rows={6}
                  value={weeklyLatarBelakang}
                  onChange={(e) => setWeeklyLatarBelakang(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-xs text-[#374151] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              {/* Tujuan */}
              <div>
                <label htmlFor="weekly-tujuan" className="block text-xs font-bold text-[#374151] mb-1.5">
                  Bab I. Tujuan (Dapat Diedit Sesuai Kebutuhan)
                </label>
                <textarea
                  id="weekly-tujuan"
                  rows={4}
                  value={weeklyTujuan}
                  onChange={(e) => setWeeklyTujuan(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-xs text-[#374151] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MbgReportPage;
