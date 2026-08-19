import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Order } from '@/types/order';

// Helper to load image as base64 with natural dimensions
export const getBase64ImageWithDimensions = async (
  url: string,
  format: 'image/png' | 'image/jpeg' = 'image/jpeg'
): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  if (!url) return null;
  if (url.startsWith('data:image')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl: url,
          width: img.naturalWidth || 4,
          height: img.naturalHeight || 3,
        });
      };
      img.onerror = () => {
        resolve({ dataUrl: url, width: 4, height: 3 });
      };
      img.src = url;
    });
  }

  try {
    const img = new Image();
    if (url.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });

    if (img.complete && img.naturalWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        return {
          dataUrl: canvas.toDataURL(format, 0.92),
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
      }
    }
  } catch {
    // Fallback using fetch
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) return null;

      return await new Promise<{ dataUrl: string; width: number; height: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            dataUrl,
            width: img.naturalWidth || 4,
            height: img.naturalHeight || 3,
          });
        };
        img.onerror = () => {
          resolve({ dataUrl, width: 4, height: 3 });
        };
        img.src = dataUrl;
      });
    } catch {
      return null;
    }
  }
  return null;
};

export const exportCateringDeliveryProofPdf = async (
  order: Order,
  courierDisplayName?: string
): Promise<void> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // 1. Header & Kop Surat
  doc.setFillColor(17, 24, 39); // Slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Gold accent bar
  doc.setFillColor(217, 119, 6); // Amber-600
  doc.rect(0, 28, pageWidth, 2.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('KOPERASI AL-UMANAA', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(229, 231, 235);
  doc.text('DIVISI KATERING & DISTRIBUSI KONSUMSI', margin, 18);
  doc.text('Jl. Raya Cisaat - Sukabumi, Jawa Barat | Telp: (0266) 123456', margin, 23);

  // Document Title Badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(251, 191, 36); // Amber-400
  doc.text('BUKTI PENGANTARAN RESMI', pageWidth - margin, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(209, 213, 219);
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')} WIB`, pageWidth - margin, 20, { align: 'right' });

  let curY = 38;

  // 2. Order Metadata Box
  doc.setFillColor(249, 250, 251); // Gray-50
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, curY, contentWidth, 34, 2, 2, 'FD');

  const shortId = order.id.slice(-6).toUpperCase();
  const instansi = order.institutionName || 'Umum / Personal';
  const pemesan = order.customerName || order.recipientName || '—';
  const penerima = order.recipientName || pemesan;
  const noHp = order.recipientPhone || '—';
  const tglKirim = order.eventDate ? new Date(order.eventDate).toLocaleDateString('id-ID', { dateStyle: 'long' }) : '—';
  const jamKirim = order.deliveryTime || '—';
  const kurir = courierDisplayName || order.assignedCourierId || 'Kurir Katering';
  const tglTiba = order.deliveredAt ? new Date(order.deliveredAt).toLocaleString('id-ID') + ' WIB' : 'Selesai Dikirim';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39);

  // Column 1
  doc.text('No. Pesanan:', margin + 4, curY + 6);
  doc.text('Instansi / Acara:', margin + 4, curY + 12);
  doc.text('Pemesan / PIC:', margin + 4, curY + 18);
  doc.text('Penerima di Lokasi:', margin + 4, curY + 24);
  doc.text('No. Handphone:', margin + 4, curY + 30);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  doc.text(`#${shortId} (${order.id})`, margin + 36, curY + 6);
  doc.text(instansi, margin + 36, curY + 12);
  doc.text(pemesan, margin + 36, curY + 18);
  doc.text(penerima, margin + 36, curY + 24);
  doc.text(noHp, margin + 36, curY + 30);

  // Column 2
  const col2X = margin + (contentWidth / 2) + 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('Tgl. Pengiriman:', col2X, curY + 6);
  doc.text('Jadwal Sampai:', col2X, curY + 12);
  doc.text('Kurir Pengantar:', col2X, curY + 18);
  doc.text('Waktu Konfirmasi:', col2X, curY + 24);
  doc.text('Status:', col2X, curY + 30);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  doc.text(tglKirim, col2X + 30, curY + 6);
  doc.text(jamKirim, col2X + 30, curY + 12);
  doc.text(kurir, col2X + 30, curY + 18);
  doc.text(tglTiba, col2X + 30, curY + 24);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105); // Emerald-600
  doc.text('✓ SUDAH DITERIMA (SELESAI)', col2X + 30, curY + 30);

  curY += 38;

  // Alamat Pengiriman
  doc.setFillColor(254, 243, 199); // Amber-100
  doc.setDrawColor(251, 191, 36);
  doc.roundedRect(margin, curY, contentWidth, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text('ALAMAT PENGIRIMAN:', margin + 3, curY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(31, 41, 55);
  const cleanAddr = order.deliveryAddress ? order.deliveryAddress.split(' | ')[0] : '—';
  doc.text(doc.splitTextToSize(cleanAddr, contentWidth - 40), margin + 36, curY + 4.5);

  curY += 16;

  // 3. Table Items
  const tableRows = (order.items || []).map((it, idx) => [
    idx + 1,
    it.itemName,
    it.notes || it.recipientName ? `${it.notes || ''} ${it.recipientName ? `(Untuk: ${it.recipientName})` : ''}`.trim() : '—',
    `${it.quantity} Porsi / Pcs`,
  ]);

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    head: [['No', 'Menu / Produk Katering', 'Catatan / Varian', 'Jumlah']],
    body: tableRows.length > 0 ? tableRows : [[1, 'Pesanan Katering', '—', '1 Paket']],
    theme: 'grid',
    headStyles: {
      fillColor: [17, 24, 39],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [31, 41, 55],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 50 },
      3: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
    },
    styles: {
      cellPadding: 2,
    },
  });

  // @ts-expect-error autoTable adds lastAutoTable property
  curY = (doc.lastAutoTable?.finalY || curY) + 6;

  // 4. Proof Documentation Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text('DOKUMENTASI BUKTI SERAH TERIMA & PENGANTARAN', margin, curY);
  curY += 3;

  doc.setDrawColor(229, 231, 235);
  doc.line(margin, curY, pageWidth - margin, curY);
  curY += 4;

  // Load photos (proof photos + signatures)
  const proofUrls: string[] = order.proofFileIds || [];
  const kitchenPhotos: string[] = [];
  (order.kitchenSignatures || []).forEach((ks) => {
    if (ks.signatureDataUrl) {
      kitchenPhotos.push(ks.signatureDataUrl);
    }
  });


  // Calculate box positions
  const photoBoxWidth = (contentWidth - 8) / 3;
  const photoBoxHeight = 44;

  // Load image 1: Kitchen handover / QC
  let kitchenImgInfo: { dataUrl: string; width: number; height: number } | null = null;
  if (kitchenPhotos.length > 0) {
    kitchenImgInfo = await getBase64ImageWithDimensions(kitchenPhotos[0]);
  }

  // Load image 2: Delivery proof photo 1
  let proofImgInfo: { dataUrl: string; width: number; height: number } | null = null;
  if (proofUrls.length > 0) {
    proofImgInfo = await getBase64ImageWithDimensions(proofUrls[0]);
  }

  // Load image 3: Delivery proof photo 2 / signature
  let proof2ImgInfo: { dataUrl: string; width: number; height: number } | null = null;
  if (proofUrls.length > 1) {
    proof2ImgInfo = await getBase64ImageWithDimensions(proofUrls[1]);
  }

  // Check if we need page break
  if (curY + photoBoxHeight + 35 > pageHeight) {
    doc.addPage();
    curY = margin;
  }

  // Box 1: Serah Terima Dapur
  const box1X = margin;
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(box1X, curY, photoBoxWidth, photoBoxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(17, 24, 39);
  doc.text('1. Serah Terima Dapur / QC', box1X + 2, curY + 4);

  if (kitchenImgInfo) {
    try {
      doc.addImage(kitchenImgInfo.dataUrl, 'JPEG', box1X + 2, curY + 6, photoBoxWidth - 4, photoBoxHeight - 8, undefined, 'FAST');
    } catch {
      doc.setFontSize(6.5);
      doc.setTextColor(156, 163, 175);
      doc.text('[Foto Serah Dapur]', box1X + 4, curY + 20);
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(156, 163, 175);
    doc.text('QC Dapur Terkonfirmasi', box1X + (photoBoxWidth / 2), curY + 22, { align: 'center' });
  }

  // Box 2: Bukti Pengantaran di Lokasi
  const box2X = box1X + photoBoxWidth + 4;
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(box2X, curY, photoBoxWidth, photoBoxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(17, 24, 39);
  doc.text('2. Foto Lokasi / Penyerahan', box2X + 2, curY + 4);

  if (proofImgInfo) {
    try {
      doc.addImage(proofImgInfo.dataUrl, 'JPEG', box2X + 2, curY + 6, photoBoxWidth - 4, photoBoxHeight - 8, undefined, 'FAST');
    } catch {
      doc.setFontSize(6.5);
      doc.setTextColor(156, 163, 175);
      doc.text('[Foto Pengantaran]', box2X + 4, curY + 20);
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(156, 163, 175);
    doc.text('Foto Belum Tersedia', box2X + (photoBoxWidth / 2), curY + 22, { align: 'center' });
  }

  // Box 3: Bukti Penerima / Tanda Tangan
  const box3X = box2X + photoBoxWidth + 4;
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(box3X, curY, photoBoxWidth, photoBoxHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(17, 24, 39);
  doc.text('3. Bukti Penerima / Tambahan', box3X + 2, curY + 4);

  if (proof2ImgInfo) {
    try {
      doc.addImage(proof2ImgInfo.dataUrl, 'JPEG', box3X + 2, curY + 6, photoBoxWidth - 4, photoBoxHeight - 8, undefined, 'FAST');
    } catch {
      doc.setFontSize(6.5);
      doc.setTextColor(156, 163, 175);
      doc.text('[Foto Penerima]', box3X + 4, curY + 20);
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(156, 163, 175);
    doc.text('Tervalidasi di Lokasi', box3X + (photoBoxWidth / 2), curY + 22, { align: 'center' });
  }

  curY += photoBoxHeight + 8;

  // 5. Signatures Block
  if (curY + 30 > pageHeight) {
    doc.addPage();
    curY = margin;
  }

  const sigColWidth = (contentWidth - 20) / 2;

  // Kurir Signature Box
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Petugas Pengantar (Kurir),', margin + (sigColWidth / 2), curY, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39);
  doc.text(`( ${kurir} )`, margin + (sigColWidth / 2), curY + 20, { align: 'center' });

  // Recipient Signature Box
  const recX = margin + sigColWidth + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(75, 85, 99);
  doc.text('Penerima Pesanan (PIC Instansi),', recX + (sigColWidth / 2), curY, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39);
  doc.text(`( ${penerima} )`, recX + (sigColWidth / 2), curY + 20, { align: 'center' });

  // Footer Note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(156, 163, 175);
  doc.text(
    '* Dokumen ini merupakan bukti resmi penerimaan pengantaran katering Koperasi Al-Umanaa yang dibuat secara otomatis oleh sistem.',
    pageWidth / 2,
    pageHeight - 6,
    { align: 'center' }
  );

  const cleanFileName = `Bukti_Pengantaran_Katering_${(order.institutionName || pemesan || 'Order').replace(/\s+/g, '_')}_#${shortId}.pdf`;
  doc.save(cleanFileName);
};
