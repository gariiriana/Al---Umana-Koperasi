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
      result.push({
        id: e.id,
        institutionName: e.institutionName,
        categoryLabel: cat,
        portionCount: count,
        totalJumlah: e.jumlah || count,
        petugasName: e.assignedPetugasName || 'Belum Ditugaskan',
        jadwal: e.jadwalPengantaran || '06.30 - 08.00',
        isLibur: !!e.isSekolahLibur,
        address: e.address,
        detailBreakdown: detail,
      });
    }
  });

  return result;
}
