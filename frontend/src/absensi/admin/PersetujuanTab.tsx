import { listAdminRequests, reviewAdminLateOut, reviewAdminRequest, reviewAdminSilah, reviewAdminZone } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { ApprovalBoard } from "@/absensi/components/ApprovalBoard";

/** Tab Admin: setujui / tolak cuti, pergantian shift, absen luar zona, masuk Silah, dan clock out telat semua karyawan. */
export function PersetujuanTab() {
  const { reloadMe } = useAbsensiSession();
  return (
    <ApprovalBoard
      title="Persetujuan Cuti, Shift & Luar Zona"
      subtitle="Tidak ada pengajuan tertunda"
      load={listAdminRequests}
      reviewRequest={reviewAdminRequest}
      reviewZone={reviewAdminZone}
      reviewSilah={reviewAdminSilah}
      reviewLateOut={reviewAdminLateOut}
      photoScope="admin"
      onChanged={reloadMe}
    />
  );
}
