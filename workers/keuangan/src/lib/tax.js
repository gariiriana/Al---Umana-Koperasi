// Mesin hitung pajak & pemotongan (uang dalam INTEGER sen, tarif dalam basis poin: 11% = 1100).
import { KeuanganError } from "../http.js";

/**
 * Menghitung tarif efektif (basis poin) untuk pajak tunggal saat harga termasuk pajak.
 * Pajak pengali 11/12 memiliki tarif efektif persen_bp * 11 / 12 (mis. 12% * 11/12 = 11% = 1100 bp).
 */
export function effectiveRateBp(tax) {
  if (!tax) return 0;
  if (tax.pengali_11_12) return (tax.persen_bp * 11) / 12;
  return tax.persen_bp;
}

/**
 * Mengurai satu baris pajak (satuan atau grup) terhadap `rawAmount` (sen).
 * Mengembalikan:
 * - `dpp`: INTEGER sen (setelah ekstraksi jika hargaTermasukPajak)
 * - `dppNilaiLain`: INTEGER sen (nilai DPP * 11 / 12 jika ada pajak berpengali 11/12, selain itu 0)
 * - `taxTotal`: INTEGER sen (jumlah bersih pajak yang menambah/mengurangi tagihan)
 * - `parts`: [{ taxId, nama, amount, akunJual, akunBeli, pemotongan }]
 */
export function calculateLineTaxes({ rawAmount, taxes = [], hargaTermasukPajak = false }) {
  // Validasi aturan Jurnal: harga termasuk pajak tidak berlaku untuk pajak majemuk atau pemotongan.
  const expanded = expandTaxes(taxes);

  if (hargaTermasukPajak && taxes.some((t) => t.tipe === "grup" && t.majemuk)) {
    throw new KeuanganError("VALIDATION_ERROR", 400, "Harga termasuk pajak tidak berlaku untuk pajak grup majemuk.");
  }
  if (hargaTermasukPajak && expanded.some((t) => t.pemotongan)) {
    throw new KeuanganError("VALIDATION_ERROR", 400, "Harga termasuk pajak tidak berlaku untuk pajak pemotongan.");
  }

  let dpp = rawAmount;
  if (hargaTermasukPajak && expanded.length > 0) {
    const totalRateBp = expanded.reduce((s, t) => s + effectiveRateBp(t), 0);
    if (totalRateBp > 0) {
      dpp = Math.round((rawAmount * 10_000) / (10_000 + totalRateBp));
    }
  }

  const parts = [];
  let dppNilaiLain = 0;

  if (hargaTermasukPajak && expanded.length === 1) {
    // Pastikan dpp + pajak === rawAmount persis (tanpa selisih pembulatan 1 sen)
    const t = expanded[0];
    const amt = rawAmount - dpp;
    if (t.pengali_11_12) dppNilaiLain = Math.round((dpp * 11) / 12);
    parts.push({
      taxId: t.id,
      nama: t.nama,
      amount: amt,
      akunJual: t.akun_jual,
      akunBeli: t.akun_beli,
      pemotongan: Boolean(t.pemotongan),
    });
  } else {
    for (const tax of taxes) {
      if (tax.tipe === "grup") {
        const items = tax.items || [];
        let base = dpp;
        for (const item of items) {
          const amt = computeSingleTaxAmount(base, item);
          if (item.pengali_11_12) dppNilaiLain = Math.round((base * 11) / 12);
          parts.push({
            taxId: item.id,
            nama: item.nama,
            amount: amt,
            akunJual: item.akun_jual,
            akunBeli: item.akun_beli,
            pemotongan: Boolean(item.pemotongan),
          });
          if (tax.majemuk) base += amt;
        }
      } else {
        const amt = computeSingleTaxAmount(dpp, tax);
        if (tax.pengali_11_12) dppNilaiLain = Math.round((dpp * 11) / 12);
        parts.push({
          taxId: tax.id,
          nama: tax.nama,
          amount: amt,
          akunJual: tax.akun_jual,
          akunBeli: tax.akun_beli,
          pemotongan: Boolean(tax.pemotongan),
        });
      }
    }
  }

  // Jika hargaTermasukPajak dengan > 1 pajak positif non-majemuk, sesuaikan selisih pembulatan ke pajak terakhir
  if (hargaTermasukPajak && parts.length > 1) {
    const expectedTotalTax = rawAmount - dpp;
    const sumTax = parts.reduce((s, p) => s + p.amount, 0);
    if (sumTax !== expectedTotalTax) {
      parts[parts.length - 1].amount += expectedTotalTax - sumTax;
    }
  }

  const taxTotal = parts.reduce((s, p) => s + p.amount, 0);
  return { dpp, dppNilaiLain, taxTotal, parts };
}

function expandTaxes(taxes) {
  const out = [];
  for (const t of taxes) {
    if (t.tipe === "grup") out.push(...(t.items || []));
    else out.push(t);
  }
  return out;
}

function computeSingleTaxAmount(dpp, tax) {
  const sign = tax.pemotongan ? -1 : 1;
  const absBp = Math.abs(tax.persen_bp);
  const raw = tax.pengali_11_12
    ? Math.round((dpp * 11 * absBp) / (12 * 10_000))
    : Math.round((dpp * absBp) / 10_000);
  return sign * raw;
}
