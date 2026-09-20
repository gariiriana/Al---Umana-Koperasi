import type { MbgPmEntry } from '../types/mbg';

export interface FilteredPmRow {
  id: string;
  institutionName: string;
  categoryLabel: string;
  portionCount: number;
  totalJumlah: number;
  petugasName: string;
  jadwal: string;
  isLibur: boolean;
  address?: string;
  detailBreakdown?: string;
}

export function getFilteredPmEntries(
  entries: MbgPmEntry[] = [],
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil',
  fallbackSekolahList: { nama: string; murid: number; guru: number }[] = []
): FilteredPmRow[] {
  if (!entries || entries.length === 0) {
    if (fallbackSekolahList && fallbackSekolahList.length > 0) {
      return fallbackSekolahList
        .map((s, idx) => {
          let count = 0;
          let cat = 'Sekolah';
          if (portionType === 'kecil') {
            const isTk = s.nama.toLowerCase().includes('tk') || s.nama.toLowerCase().includes('paud');
            count = isTk ? s.murid : Math.ceil(s.murid / 2);
            cat = isTk ? 'TK / PAUD' : 'SD Kelas 1-3';
          } else if (portionType === 'besar') {
            const isSma = s.nama.toLowerCase().includes('sma') || s.nama.toLowerCase().includes('smk');
            const isSmp = s.nama.toLowerCase().includes('smp') || s.nama.toLowerCase().includes('mts');
            count = (isSma || isSmp ? s.murid : Math.floor(s.murid / 2)) + (s.guru || 0);
            cat = isSma ? 'SMA / SMK' : isSmp ? 'SMP / MTs' : 'SD Kelas 4-6 + Guru';
          } else if (portionType === 'balita') {
            count = s.nama.toLowerCase().includes('posyandu') ? s.murid : 0;
            cat = 'Balita Posyandu';
          } else if (portionType === 'bumil') {
            count = s.nama.toLowerCase().includes('posyandu') ? s.guru : 0;
            cat = 'Bumil & Busui';
          }

          return {
            id: `fallback-${idx}`,
            institutionName: s.nama,
            categoryLabel: cat,
            portionCount: count,
            totalJumlah: s.murid + s.guru,
            petugasName: 'Tim Distribusi MBG',
            jadwal: '06.30 - 08.00',
            isLibur: false,
          };
        })
        .filter((it) => it.portionCount > 0);
    }
    return [];
  }

  const seenNames = new Set<string>();
  const result: FilteredPmRow[] = [];

  entries.forEach((e) => {
    let count = 0;
    let cat = '';
    let detail = '';

    if (portionType === 'kecil') {
      if (e.institutionType === 'sekolah') {
        const isTk =
          e.schoolLevel === 'tk_paud' ||
          e.institutionName.toLowerCase().includes('tk') ||
          e.institutionName.toLowerCase().includes('paud');
        const isSd =
          e.schoolLevel === 'sd' ||
          e.institutionName.toLowerCase().includes('sd') ||
          e.institutionName.toLowerCase().includes('mi');

        if (isTk) {
          count = e.qtPorsiKecil || e.qtSiswaBalita || 0;
          cat = 'TK / PAUD';
          detail = `${count} Siswa TK/PAUD`;
        } else if (isSd) {
          count = e.qtPorsiKecil || Math.ceil((e.qtSiswaBalita || 0) / 2);
          cat = 'SD / MI (Kelas 1-3)';
          detail = `${count} Siswa Kelas 1-3`;
        } else if (e.qtPorsiKecil && e.qtPorsiKecil > 0) {
          count = e.qtPorsiKecil;
          cat = 'Porsi Kecil';
          detail = `${count} Porsi Kecil`;
        }
      }
    } else if (portionType === 'besar') {
      if (e.institutionType === 'sekolah') {
        const isSma =
          e.schoolLevel === 'sma' ||
          e.institutionName.toLowerCase().includes('sma') ||
          e.institutionName.toLowerCase().includes('smk') ||
          e.institutionName.toLowerCase().includes('ma ');
        const isSmp =
          (e.schoolLevel as string) === 'smp' ||
          e.institutionName.toLowerCase().includes('smp') ||
          e.institutionName.toLowerCase().includes('mts');
        const isSd =
          e.schoolLevel === 'sd' ||
          e.institutionName.toLowerCase().includes('sd') ||
          e.institutionName.toLowerCase().includes('mi');

        if (isSma) {
          const siswa = e.qtPorsiBesar || e.qtSiswaBalita || 0;
          const guru = e.qtGuruKader || 0;
          count = siswa + guru;
          cat = 'SMA / SMK';
          detail = `${siswa} Siswa + ${guru} Guru/Staff`;
        } else if (isSmp) {
          const siswa = e.qtPorsiBesar || e.qtSiswaBalita || 0;
          const guru = e.qtGuruKader || 0;
          count = siswa + guru;
          cat = 'SMP / MTs';
          detail = `${siswa} Siswa + ${guru} Guru/Staff`;
        } else if (isSd) {
          const siswaBesar = e.qtPorsiBesar || Math.floor((e.qtSiswaBalita || 0) / 2);
          const guru = e.qtGuruKader || 0;
          count = siswaBesar + guru;
          cat = 'SD (Kelas 4-6 + Guru)';
          detail = `${siswaBesar} Siswa Kls 4-6 + ${guru} Guru`;
        } else {
          const siswa = e.qtPorsiBesar || e.qtSiswaBalita || 0;
          const guru = e.qtGuruKader || 0;
          count = siswa + guru;
          cat = 'Porsi Besar & Guru';
          detail = `${siswa} Siswa + ${guru} Guru`;
        }
      } else if (e.qtGuruKader && e.qtGuruKader > 0) {
        count = e.qtGuruKader;
        cat = 'Kader Posyandu';
        detail = `${count} Kader Posyandu`;
      }
    } else if (portionType === 'balita') {
      if (e.institutionType === 'posyandu') {
        count = e.qtPorsiBalita || e.qtSiswaBalita || 0;
        cat = 'Balita Posyandu (6-59 bln)';
        detail = `${count} Balita Sasaran`;
      }
    } else if (portionType === 'bumil') {
      if (e.institutionType === 'posyandu') {
        const bumil = e.qtBumil || 0;
        const busui = e.qtBusui || 0;
        const total = e.qtPorsiBumilBusui || e.qtBumilBusui || bumil + busui;
        count = total;
        cat = 'Ibu Hamil & Ibu Menyusui';
        detail = bumil > 0 || busui > 0 ? `${bumil} Bumil + ${busui} Busui` : `${total} Bumil/Busui`;
      }
    }

    if (count > 0 || (portionType === 'kecil' && e.schoolLevel === 'tk_paud')) {
      const cleanName = e.institutionName.toLowerCase()
        .replace(/kelas\s*[0-9-]+/gi, '')
        .replace(/kls\s*[0-9-]+/gi, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
      const normKey = cleanName || e.institutionName.toLowerCase().trim();
      if (seenNames.has(normKey)) {
        return;
      }
      seenNames.add(normKey);

      result.push({
        id: e.id,
        institutionName: e.institutionName,
        categoryLabel: cat,
        portionCount: count,
        totalJumlah: e.jumlah || count,
        petugasName: e.assignedPetugasName || '-',
        jadwal: e.jadwalPengantaran || '06.30 - 08.00',
        isLibur: !!e.isSekolahLibur,
        address: e.address,
        detailBreakdown: detail,
      });
    }
  });

  return result;
}

export interface DetailedPmRow {
  id: string;
  institutionName: string;
  categoryLabel: string;
  porsiKecil: number;
  porsiBesar: number;
  porsiBalita: number;
  porsiBumilBusui: number;
  totalJumlah: number;
  rincian?: string;
  petugasName: string;
  jadwal: string;
  isLibur: boolean;
  address?: string;
}

export function getAllDetailedPmEntries(
  entries: MbgPmEntry[] = [],
  fallbackSekolahList: { nama: string; murid: number; guru: number }[] = []
): DetailedPmRow[] {
  if (!entries || entries.length === 0) {
    if (fallbackSekolahList && fallbackSekolahList.length > 0) {
      return fallbackSekolahList.map((s, idx) => {
        const name = (s.nama || '').toLowerCase().trim();
        const isTk = name.includes('tk') || name.includes('paud') || name.includes('sps') || name.includes('kober');
        const isSma = name.includes('sma') || name.includes('smk') || name.includes('ma ') || name.includes('aliyah');
        const isSmp = name.includes('smp') || name.includes('mts');
        const isPosyandu = name.includes('posyandu');

        let cat = 'SD / MI';
        let pKecil = 0;
        let pBesar = 0;
        let pBalita = 0;
        let pBumil = 0;

        if (isPosyandu) {
          cat = 'Posyandu';
          pBalita = s.murid || 0;
          pBumil = 0;
          pBesar = s.guru || 0;
        } else if (isTk) {
          cat = 'TK / PAUD';
          pKecil = s.murid || 0;
          pBesar = s.guru || 0;
        } else if (isSma || isSmp) {
          cat = isSma ? 'SMA / SMK' : 'SMP / MTs';
          pBesar = (s.murid || 0) + (s.guru || 0);
        } else {
          cat = 'SD / MI';
          pKecil = Math.ceil((s.murid || 0) / 2);
          pBesar = Math.floor((s.murid || 0) / 2) + (s.guru || 0);
        }

        const total = pKecil + pBesar + pBalita + pBumil;

        return {
          id: `fallback-${idx}`,
          institutionName: s.nama,
          categoryLabel: cat,
          porsiKecil: pKecil,
          porsiBesar: pBesar,
          porsiBalita: pBalita,
          porsiBumilBusui: pBumil,
          totalJumlah: total || (s.murid + s.guru),
          rincian: `${s.murid} Murid + ${s.guru} Guru`,
          petugasName: 'Tim Distribusi MBG',
          jadwal: '06.30 - 08.00',
          isLibur: false,
        };
      });
    }
    return [];
  }

  const seenNames = new Set<string>();
  const result: DetailedPmRow[] = [];

  entries.forEach((e) => {
    const cleanName = (e.institutionName || '')
      .toLowerCase()
      .replace(/kelas\s*[0-9-]+/gi, '')
      .replace(/kls\s*[0-9-]+/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
    const normKey = cleanName || (e.institutionName || '').toLowerCase().trim();
    if (!normKey) return;
    if (seenNames.has(normKey)) return;
    seenNames.add(normKey);

    const name = (e.institutionName || '').toLowerCase().trim();
    const isPosyandu = e.institutionType === 'posyandu' || name.includes('posyandu');
    const isTk =
      e.schoolLevel === 'tk_paud' ||
      name.includes('tk') ||
      name.includes('paud') ||
      name.includes('sps') ||
      name.includes('kober');
    const isSd =
      e.schoolLevel === 'sd' ||
      name.includes('sd') ||
      name.includes('mi');
    const isSma =
      e.schoolLevel === 'sma' ||
      name.includes('sma') ||
      name.includes('smk') ||
      name.includes('ma ') ||
      name.includes('aliyah');
    const isSmp =
      (e.schoolLevel as string) === 'smp' ||
      name.includes('smp') ||
      name.includes('mts');

    let cat = 'Sekolah';
    if (isPosyandu) cat = 'Posyandu';
    else if (isTk) cat = 'TK / PAUD';
    else if (isSd) cat = 'SD / MI';
    else if (isSmp) cat = 'SMP / MTs';
    else if (isSma) cat = 'SMA / SMK';

    let pKecil = 0;
    let pBesar = 0;
    let pBalita = 0;
    let pBumil = 0;

    // Check classes breakdown if specified
    if (e.classesBreakdown && e.classesBreakdown.length > 0) {
      e.classesBreakdown.forEach((c) => {
        const q = c.totalSiswa || c.jumlah || 0;
        if (c.portionType === 'kecil') pKecil += q;
        else pBesar += q;
      });
      if (pBesar > 0 || e.qtGuruKader) {
        pBesar += (e.qtGuruKader || 0);
      }
    }

    if (isPosyandu) {
      pBalita = e.qtPorsiBalita || e.qtSiswaBalita || 0;
      const bumil = e.qtBumil || 0;
      const busui = e.qtBusui || 0;
      pBumil = e.qtPorsiBumilBusui || e.qtBumilBusui || (bumil + busui);
      pBesar = e.qtGuruKader || 0; // kader makan porsi besar
    } else {
      // Sekolah
      if (pKecil === 0 && pBesar === 0) {
        if (e.qtPorsiKecil && e.qtPorsiKecil > 0) {
          pKecil = e.qtPorsiKecil;
        }
        if (e.qtPorsiBesar && e.qtPorsiBesar > 0) {
          pBesar = e.qtPorsiBesar;
        }
      }

      if (isTk) {
        if (pKecil === 0) {
          pKecil = e.qtSiswaBalita || (e.jumlah ? Math.max(0, e.jumlah - (e.qtGuruKader || 0)) : 0);
        }
        if (pBesar === 0) {
          pBesar = e.qtGuruKader || 0;
        }
      } else if (isSd) {
        if (pKecil === 0 && pBesar === 0) {
          const siswa = e.qtSiswaBalita || (e.jumlah ? Math.max(0, e.jumlah - (e.qtGuruKader || 0)) : 0);
          pKecil = Math.ceil(siswa / 2);
          pBesar = Math.floor(siswa / 2) + (e.qtGuruKader || 0);
        } else if (pBesar === 0 && e.qtGuruKader) {
          pBesar += e.qtGuruKader;
        }
      } else if (isSma || isSmp) {
        if (pBesar === 0) {
          const siswa = e.qtSiswaBalita || (e.jumlah ? Math.max(0, e.jumlah - (e.qtGuruKader || 0)) : 0);
          pBesar = siswa + (e.qtGuruKader || 0);
        }
      } else {
        if (pKecil === 0 && pBesar === 0) {
          pBesar = (e.qtSiswaBalita || 0) + (e.qtGuruKader || 0);
        }
      }
    }

    const calculatedTotal = pKecil + pBesar + pBalita + pBumil;
    const finalTotal = calculatedTotal > 0 ? calculatedTotal : (e.jumlah || 0);

    // Build detail / rincian string
    const rincianParts: string[] = [];
    if (isTk) {
      if (pKecil > 0) rincianParts.push(`${pKecil} Siswa TK`);
      if (pBesar > 0) rincianParts.push(`${pBesar} Guru`);
    } else if (isSd) {
      if (pKecil > 0) rincianParts.push(`${pKecil} Kls 1-3`);
      const kls46 = Math.max(0, pBesar - (e.qtGuruKader || 0));
      if (kls46 > 0) rincianParts.push(`${kls46} Kls 4-6`);
      if (e.qtGuruKader) rincianParts.push(`${e.qtGuruKader} Guru`);
    } else if (isSma || isSmp) {
      const siswa = Math.max(0, pBesar - (e.qtGuruKader || 0));
      if (siswa > 0) rincianParts.push(`${siswa} Siswa`);
      if (e.qtGuruKader) rincianParts.push(`${e.qtGuruKader} Guru/Staff`);
    } else if (isPosyandu) {
      if (pBalita > 0) rincianParts.push(`${pBalita} Balita`);
      if (pBumil > 0) rincianParts.push(`${pBumil} Bumil/Busui`);
      if (pBesar > 0) rincianParts.push(`${pBesar} Kader`);
    } else {
      if (pKecil > 0) rincianParts.push(`${pKecil} Porsi Kecil`);
      if (pBesar > 0) rincianParts.push(`${pBesar} Porsi Besar`);
    }

    result.push({
      id: e.id,
      institutionName: e.institutionName,
      categoryLabel: cat,
      porsiKecil: pKecil,
      porsiBesar: pBesar,
      porsiBalita: pBalita,
      porsiBumilBusui: pBumil,
      totalJumlah: finalTotal,
      rincian: rincianParts.join(' + ') || '-',
      petugasName: e.assignedPetugasName || '-',
      jadwal: e.jadwalPengantaran || '06.30 - 08.30',
      isLibur: !!e.isSekolahLibur,
      address: e.address,
    });
  });

  return result;
}
