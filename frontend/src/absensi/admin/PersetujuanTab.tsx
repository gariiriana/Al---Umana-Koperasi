import { listAdminRequests, reviewAdminRequest, reviewAdminZone } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { ApprovalBoard } from "@/absensi/components/ApprovalBoard";

/** Tab Admin: setujui / tolak cuti, pergantian shift, dan absen di luar zona semua karyawan. */
export function PersetujuanTab() {
  const { reloadMe } = useAbsensiSession();
  return (
    <ApprovalBoard
      title="Persetujuan Cuti, Shift & Luar Zona"
      subtitle="Tidak ada pengajuan tertunda"
      load={listAdminRequests}
      reviewRequest={reviewAdminRequest}
      reviewZone={reviewAdminZone}
      photoScope="admin"
      onChanged={reloadMe}
    />
  );
}
