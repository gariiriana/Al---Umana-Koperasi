import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { Loader2, Plus, Edit, Trash2, Calendar, FileDown, AlertCircle, X, Check, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { listAllSchedules, saveSchedule, deleteSchedule, type DistributionSchedule } from "@/services/distributionScheduleService";
import type { ReverseGeoResult } from "@/components/MapLocationPicker";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Helper to convert URL to Base64 image with downscaling
const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 256;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        
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
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    console.error("Error converting URL to Base64:", err);
    return null;
  }
};

const MapLocationPicker = lazy(() =>
  import("@/components/MapLocationPicker").then((m) => ({ default: m.MapLocationPicker }))
);

const DAILY_TEMPLATE_ITEMS = [
  { time: "04.00", title: "Makan Pagi Pimpinan & Mahad (Catering/MBG)", destination: "Math'am & Area Santri", notes: "" },
  { time: "07.00", title: "Indocafe, Paket Buah Utk Pimpinan (Catering)", destination: "10B", notes: "" },
  { time: "07.00", title: "Lemper, Risol Mayo dll (Bakery)", destination: "10B", notes: "" },
  { time: "08.00", title: "Snack Pagi Pimpinan (Catering)", destination: "Math'am", notes: "" },
  { time: "08.00", title: "10 Paket Snack Box (Bakery) - SCG (MD Office)", destination: "SCG (MD Office)", notes: "" },
  { time: "11.00", title: "Makan siang Mahad & Pimpinan (Catering)", destination: "Math'am & Area Santri", notes: "" },
  { time: "11.00", title: "Tempe, Kerupuk (catering)", destination: "10B", notes: "" },
  { time: "12.00", title: "Snack siang Pimpinan (Catering)", destination: "Math'am", notes: "" },
  { time: "14.00", title: "Makan Sore Mahad & Pimpinan (Catering)", destination: "Math'am & Area Santri", notes: "" },
  { time: "22.00", title: "Pesanan Extra Vit (Catering)", destination: "SCG", notes: "" },
];

export function SchedulesPage() {
  const { lang } = useLanguage();
  const { showToast } = useToast();
  const { profile } = useAuth();

  const [schedules, setSchedules] = useState<DistributionSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<"day" | "week" | "month" | "all">("day");
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [filterWeekStart, setFilterWeekStart] = useState("");
  const [filterWeekEnd, setFilterWeekEnd] = useState("");
  // Month filter stored as YYYY-MM-start / YYYY-MM-end for cross-browser compatibility
  const [filterMonthStart, setFilterMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  });
  const [filterMonthEnd, setFilterMonthEnd] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  });

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDestination, setFDestination] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fMapsUrl, setFMapsUrl] = useState("");
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Template states
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateDate, setTemplateDate] = useState("");
  const [selectedTemplateItems, setSelectedTemplateItems] = useState<number[]>([]);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);

  const handleGenerateTemplate = async () => {
    if (!templateDate) {
      showToast({
        message: lang === "id" ? "Pilih tanggal terlebih dahulu." : "Please select a date.",
        variant: "error",
      });
      return;
    }
    if (selectedTemplateItems.length === 0) {
      showToast({
        message: lang === "id" ? "Pilih minimal satu item template." : "Please select at least one template item.",
        variant: "error",
      });
      return;
    }

    setGeneratingTemplate(true);
    try {
      const promises = selectedTemplateItems.map((idx) => {
        const item = DAILY_TEMPLATE_ITEMS[idx];
        return saveSchedule({
          date: templateDate,
          time: item.time,
          title: item.title,
          destination: item.destination,
          notes: item.notes,
        });
      });
      await Promise.all(promises);

      showToast({
        message: lang === "id" 
          ? `Berhasil membuat ${selectedTemplateItems.length} jadwal untuk tanggal ${templateDate}.` 
          : `Successfully generated ${selectedTemplateItems.length} schedules for ${templateDate}.`,
        variant: "success",
      });
      setShowTemplateModal(false);
      await load();
    } catch (err) {
      console.error("Failed to generate schedules:", err);
      showToast({
        message: lang === "id" ? "Gagal men-generate jadwal dari template." : "Failed to generate schedules from template.",
        variant: "error",
      });
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const canEdit = profile?.role === "distribusi" || (profile?.role as string) === "distributor" || profile?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAllSchedules();
      setSchedules(data);
    } catch (err) {
      console.error(err);
      setError(lang === "id" ? "Gagal memuat jadwal distribusi." : "Failed to load distribution schedules.");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (filterType === "all") return true;
      if (filterType === "day") {
        return s.date === filterDate;
      }
      if (filterType === "week") {
        if (!filterWeekStart || !filterWeekEnd) return true;
        return s.date >= filterWeekStart && s.date <= filterWeekEnd;
      }
      if (filterType === "month") {
        return s.date >= filterMonthStart && s.date <= filterMonthEnd;
      }
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [schedules, filterType, filterDate, filterWeekStart, filterWeekEnd, filterMonthStart, filterMonthEnd]);

  const openAddForm = () => {
    setEditId(null);
    setFDate(new Date().toISOString().split("T")[0]);
    setFTime("");
    setFTitle("");
    setFDestination("");
    setFMapsUrl("");
    setFNotes("");
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (s: DistributionSchedule) => {
    setEditId(s.id);
    setFDate(s.date);
    setFTime(s.time);
    setFTitle(s.title);
    // Parse existing destination: "Name | https://..." or just text
    const urlMatch = s.destination.match(/(https?:\/\/[^\s|]+)/);
    if (urlMatch) {
      setFMapsUrl(urlMatch[1]);
      setFDestination(s.destination.replace(/\s*\|\s*https?:\/\/[^\s|]+/, "").trim());
    } else {
      setFDestination(s.destination);
      setFMapsUrl("");
    }
    setFNotes(s.notes || "");
    setFormError(null);
    setShowForm(true);
  };

  const handleMapLocationSelected = (result: ReverseGeoResult) => {
    setFDestination(result.displayAddress || `${result.kabupaten}, ${result.kecamatan}, ${result.desa}`);
    setFMapsUrl(result.mapsUrl);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fDate || !fTime || !fTitle || !fDestination) {
      setFormError(lang === "id" ? "Semua field bertanda bintang wajib diisi." : "All starred fields are required.");
      return;
    }

    setSaving(true);
    try {
      // Combine destination name + maps URL if a maps link was selected
      const finalDestination = fMapsUrl
        ? `${fDestination.trim()} | ${fMapsUrl}`
        : fDestination.trim();

      await saveSchedule({
        id: editId || undefined,
        date: fDate,
        time: fTime,
        title: fTitle.trim(),
        destination: finalDestination,
        notes: fNotes.trim(),
      });

      showToast({
        message: lang === "id" ? "Jadwal berhasil disimpan." : "Schedule saved successfully.",
        variant: "success",
      });
      setShowForm(false);
      await load();
    } catch (err) {
      console.error(err);
      const errMessage = err instanceof Error ? err.message : String(err);
      setFormError(errMessage || (lang === "id" ? "Gagal menyimpan jadwal." : "Failed to save schedule."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(lang === "id" ? "Hapus jadwal ini?" : "Delete this schedule?")) return;
    try {
      await deleteSchedule(id);
      showToast({
        message: lang === "id" ? "Jadwal berhasil dihapus." : "Schedule deleted successfully.",
        variant: "success",
      });
      await load();
    } catch (err) {
      console.error(err);
      showToast({
        message: lang === "id" ? "Gagal menghapus jadwal." : "Failed to delete schedule.",
        variant: "error",
      });
    }
  };

  const exportPDF = async () => {
    try {
      showToast({
        message: lang === "id" ? "Sedang menyiapkan PDF..." : "Preparing PDF...",
        variant: "info",
      });

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      
      const brandGold: [number, number, number] = [217, 119, 6];       // #D97706
      const brandAmberDark: [number, number, number] = [180, 83, 9];    // #B45309
      const brandYellowCream: [number, number, number] = [255, 253, 245]; // #FFFDF5
      const brandYellowBorder: [number, number, number] = [253, 230, 138]; // #FDE68A
      const slateDark: [number, number, number] = [30, 41, 59];        // #1E293B
      const slateLight: [number, number, number] = [107, 114, 128];     // #6B7280
      const white: [number, number, number] = [255, 255, 255];

      // Draw PDF Header
      const logoBase64 = await getBase64ImageFromUrl("/logo.png");
      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", 14, 12, 18, 18);
      }
      const titleX = logoBase64 ? 36 : 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...brandAmberDark);
      doc.text("KOPERASI AL-UMANAA", titleX, 16);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...slateDark);
      doc.text("LAPORAN JADWAL DISTRIBUSI", titleX, 20.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text("Pesantren Al-Umanaa, Sukabumi | SIMOL", titleX, 25.5);

      let filterDesc = "Semua Data Jadwal";
      if (filterType === "day") {
        filterDesc = `${new Date(filterDate).toLocaleDateString("id-ID", { dateStyle: "full" })}`;
      } else if (filterType === "week") {
        filterDesc = `${filterWeekStart} s/d ${filterWeekEnd}`;
      } else if (filterType === "month") {
        filterDesc = `${filterMonthStart} s/d ${filterMonthEnd}`;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...brandGold);
      doc.text(filterDesc, pageW - 14, 16, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slateLight);
      doc.text(`Total Jadwal: ${filteredSchedules.length} Kegiatan`, pageW - 14, 20.5, { align: "right" });
      doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID")}`, pageW - 14, 25.5, { align: "right" });

      doc.setDrawColor(...brandGold);
      doc.setLineWidth(0.5);
      doc.line(14, 31, pageW - 14, 31);

      // Table Body preparation
      const tableBody = filteredSchedules.map((item, index) => {
        // Strip out the maps URL from destination label if present
        const label = item.destination.replace(/\s*\|\s*https?:\/\/[^\s|]+/, "").trim();
        return [
          String(index + 1),
          item.date,
          item.time,
          item.title,
          label,
          item.notes || "-"
        ];
      });

      autoTable(doc, {
        startY: 36,
        head: [["No", "Tanggal", "Waktu", "Kegiatan / Nama Distribusi", "Tujuan / Lokasi", "Catatan"]],
        body: tableBody,
        theme: "striped",
        styles: { lineColor: brandYellowBorder, lineWidth: 0.15 },
        headStyles: { fillColor: brandGold, textColor: white, fontStyle: "bold", fontSize: 9, halign: "center", cellPadding: 3.5 },
        bodyStyles: { fontSize: 8.5, textColor: slateDark, cellPadding: 3.5, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 22, halign: "center" },
          2: { cellWidth: 20, halign: "center", fontStyle: "bold" },
          3: { cellWidth: 55, fontStyle: "bold" },
          4: { cellWidth: 45 },
          5: { cellWidth: pageW - 28 - 10 - 22 - 20 - 55 - 45 }
        },
        alternateRowStyles: { fillColor: brandYellowCream },
        margin: { left: 14, right: 14 }
      });

      doc.save(`jadwal-distribusi-${filterType}-${new Date().toISOString().split("T")[0]}.pdf`);
      showToast({
        message: lang === "id" ? "Berhasil mengunduh laporan PDF." : "Successfully downloaded PDF report.",
        variant: "success",
      });
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal membuat PDF", variant: "error" });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto font-['Hanken_Grotesk']">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-['Manrope'] text-xl sm:text-2xl font-extrabold text-[#111827]">
            {lang === "id" ? "Jadwal Distribusi Harian" : "Daily Distribution Schedules"}
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280]">
            {lang === "id" ? "Atur dan pantau jadwal pengiriman makanan, buah, serta snack koperasi." : "Manage and track cooperative deliveries of food, fruit, and snacks."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={exportPDF}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-4 w-full sm:w-auto border border-[#D1D5DB] bg-white hover:bg-neutral-50 text-xs font-bold text-[#374151] rounded-xl transition cursor-pointer"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            <span>{lang === "id" ? "Unduh PDF Laporan" : "Download PDF Report"}</span>
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  setTemplateDate(filterDate || new Date().toISOString().split("T")[0]);
                  setSelectedTemplateItems(DAILY_TEMPLATE_ITEMS.map((_, idx) => idx));
                  setShowTemplateModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-4 w-full sm:w-auto border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-bold text-amber-800 rounded-xl transition cursor-pointer"
              >
                <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{lang === "id" ? "Generate Template" : "Generate Template"}</span>
              </button>
              <button
                type="button"
                onClick={openAddForm}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-4 w-full sm:w-auto bg-[#FBBF24] hover:bg-[#F59E0B] text-xs font-bold text-[#111827] rounded-xl shadow-xs transition cursor-pointer"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>{lang === "id" ? "Tambah Jadwal" : "Add Schedule"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-[#E5E7EB] rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterType("day")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${filterType === "day" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-[#4B5563] hover:bg-neutral-200"}`}
          >
            {lang === "id" ? "Harian" : "Daily"}
          </button>
          <button
            onClick={() => setFilterType("week")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${filterType === "week" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-[#4B5563] hover:bg-neutral-200"}`}
          >
            {lang === "id" ? "Mingguan" : "Weekly"}
          </button>
          <button
            onClick={() => setFilterType("month")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${filterType === "month" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-[#4B5563] hover:bg-neutral-200"}`}
          >
            {lang === "id" ? "Bulanan" : "Monthly"}
          </button>
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-center ${filterType === "all" ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-[#4B5563] hover:bg-neutral-200"}`}
          >
            {lang === "id" ? "Semua Jadwal" : "All Schedules"}
          </button>
        </div>

        <div className="pt-3 border-t border-[#F3F4F6]">
          {filterType === "day" && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <label htmlFor="filter-date" className="text-xs font-bold text-[#4B5563]">{lang === "id" ? "Pilih Tanggal" : "Select Date"}:</label>
              <input
                id="filter-date"
                type="date"
                aria-label={lang === "id" ? "Pilih tanggal filter" : "Filter date"}
                className="w-full sm:w-auto bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
          )}
          {filterType === "week" && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <span className="text-xs font-bold text-[#4B5563]">{lang === "id" ? "Rentang Tanggal" : "Date Range"}:</span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  placeholder="Mulai"
                  aria-label={lang === "id" ? "Tanggal awal minggu" : "Week start date"}
                  className="w-full sm:w-auto bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none"
                  value={filterWeekStart}
                  onChange={(e) => setFilterWeekStart(e.target.value)}
                />
                <span className="text-xs text-[#9CA3AF] shrink-0">s/d</span>
                <input
                  type="date"
                  placeholder="Selesai"
                  aria-label={lang === "id" ? "Tanggal akhir minggu" : "Week end date"}
                  className="w-full sm:w-auto bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none"
                  value={filterWeekEnd}
                  onChange={(e) => setFilterWeekEnd(e.target.value)}
                />
              </div>
            </div>
          )}
          {filterType === "month" && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <label className="text-xs font-bold text-[#4B5563]">{lang === "id" ? "Pilih Bulan (dari – sampai)" : "Select Month (from – to)"}:</label>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  aria-label={lang === "id" ? "Tanggal awal bulan" : "Month start date"}
                  className="w-full sm:w-auto bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none"
                  value={filterMonthStart}
                  onChange={(e) => setFilterMonthStart(e.target.value)}
                />
                <span className="text-xs text-[#9CA3AF] shrink-0">s/d</span>
                <input
                  type="date"
                  aria-label={lang === "id" ? "Tanggal akhir bulan" : "Month end date"}
                  className="w-full sm:w-auto bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-1.5 text-xs text-[#111827] focus:outline-none"
                  value={filterMonthEnd}
                  onChange={(e) => setFilterMonthEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div className="bg-white border border-[#E5E7EB] rounded-3xl p-12 text-center text-neutral-500">
          <Calendar className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
          <p className="font-bold text-sm text-[#111827]">{lang === "id" ? "Tidak Ada Jadwal" : "No Schedules Found"}</p>
          <p className="text-xs text-[#6B7280] mt-1">{lang === "id" ? "Belum ada jadwal distribusi yang tercatat dalam filter yang Anda pilih." : "No distribution run schedules match the current filters."}</p>
        </div>
      ) : (
        <div>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredSchedules.map((s) => {
              const urlMatch = s.destination.match(/(https?:\/\/[^\s|]+)/);
              const mapsLink = urlMatch ? urlMatch[1] : null;
              const destLabel = s.destination.replace(/\s*\|\s*https?:\/\/[^\s|]+/, "").trim();

              return (
                <div key={s.id} className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-800 font-mono font-bold text-[11px] px-2.5 py-1 rounded-lg">
                        {s.time}
                      </span>
                      <span className="text-[11px] font-semibold text-[#6B7280]">
                        {new Date(s.date).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={lang === "id" ? `Ubah jadwal ${s.title}` : `Edit schedule ${s.title}`}
                          onClick={() => openEditForm(s)}
                          className="p-1.5 hover:bg-neutral-100 rounded-lg text-[#4B5563] transition cursor-pointer"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={lang === "id" ? `Hapus jadwal ${s.title}` : `Delete schedule ${s.title}`}
                          onClick={() => void handleDelete(s.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-[#DC2626] transition cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="font-bold text-sm text-[#111827] leading-snug">{s.title}</p>
                  {s.notes && <p className="text-[10px] text-[#6B7280]">{s.notes}</p>}

                  <div className="flex items-center gap-1.5 text-xs text-[#4B5563]">
                    <MapPin className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
                    <span className="font-semibold">{destLabel}</span>
                  </div>
                  {mapsLink && (
                    <a
                      href={mapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 hover:underline transition"
                    >
                      <MapPin className="h-3 w-3" />
                      {lang === "id" ? "Buka Maps ↗" : "Open Maps ↗"}
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white border border-[#E5E7EB] rounded-3xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                    <th className="py-3 px-6">{lang === "id" ? "Tanggal" : "Date"}</th>
                    <th className="py-3 px-4">{lang === "id" ? "Waktu" : "Time"}</th>
                    <th className="py-3 px-4">{lang === "id" ? "Kegiatan / Nama Distribusi" : "Activity / Run"}</th>
                    <th className="py-3 px-4">{lang === "id" ? "Tujuan" : "Destination"}</th>
                    {canEdit && <th className="py-3 px-4 text-center">{lang === "id" ? "Aksi" : "Actions"}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-sm text-[#374151] font-sans">
                  {filteredSchedules.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50/50">
                      <td className="py-3.5 px-6 font-semibold text-[#111827] whitespace-nowrap">
                        {new Date(s.date).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-amber-700 whitespace-nowrap">
                        {s.time}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#111827]">
                        {s.title}
                        {s.notes && <p className="text-[10px] font-normal text-[#6B7280] mt-0.5">{s.notes}</p>}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[#4B5563]">
                        {(() => {
                          const urlMatch = s.destination.match(/(https?:\/\/[^\s|]+)/);
                          if (urlMatch) {
                            const mapsLink = urlMatch[1];
                            const label = s.destination.replace(/\s*\|\s*https?:\/\/[^\s|]+/, "").trim();
                            return (
                              <div className="space-y-1">
                                {label && <span>{label}</span>}
                                <a
                                  href={mapsLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 hover:underline transition w-fit"
                                >
                                  <MapPin className="h-3 w-3" />
                                  {lang === "id" ? "Buka Maps ↗" : "Open Maps ↗"}
                                </a>
                              </div>
                            );
                          }
                          return s.destination;
                        })()}
                      </td>
                      {canEdit && (
                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          <div className="inline-flex gap-1.5 justify-center">
                            <button
                              aria-label={lang === "id" ? `Ubah jadwal ${s.title}` : `Edit schedule ${s.title}`}
                              onClick={() => openEditForm(s)}
                              className="p-1.5 hover:bg-neutral-100 rounded-lg text-[#4B5563] transition cursor-pointer"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              aria-label={lang === "id" ? `Hapus jadwal ${s.title}` : `Delete schedule ${s.title}`}
                              onClick={() => void handleDelete(s.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-[#DC2626] transition cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-[#E5E7EB] shadow-2xl relative">
            <button
              aria-label={lang === "id" ? "Tutup form jadwal" : "Close schedule form"}
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 p-1 hover:bg-neutral-100 rounded-full transition"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="font-['Manrope'] text-lg font-extrabold text-[#111827] mb-4">
              {editId ? (lang === "id" ? "Ubah Jadwal" : "Edit Schedule") : (lang === "id" ? "Tambah Jadwal Baru" : "Add New Schedule")}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold text-[#4B5563]">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="sched-date" className="block">{lang === "id" ? "Tanggal" : "Date"} <span className="text-red-500">*</span></label>
                  <input
                    id="sched-date"
                    type="date"
                    required
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-xs text-[#111827]"
                    value={fDate}
                    onChange={(e) => setFDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="sched-time" className="block">{lang === "id" ? "Waktu" : "Time"} <span className="text-red-500">*</span></label>
                  <input
                    id="sched-time"
                    type="text"
                    required
                    placeholder="E.g. 04.00, 07.00 - 08.00"
                    className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-xs text-[#111827]"
                    value={fTime}
                    onChange={(e) => setFTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block">{lang === "id" ? "Kegiatan / Nama Distribusi" : "Activity / Distribution Run"} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="E.g. Makan Pagi Pimpinan & Mahad"
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-xs text-[#111827]"
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block">{lang === "id" ? "Tujuan / Lokasi" : "Destination / Location"} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="E.g. Math'am & Area Santri"
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-xs text-[#111827]"
                  value={fDestination}
                  onChange={(e) => setFDestination(e.target.value)}
                />

                {/* Map Picker button */}
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-2 mt-1 bg-gradient-to-r from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 border border-amber-300 rounded-xl text-xs font-bold text-amber-800 transition cursor-pointer shadow-sm"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {lang === "id" ? "📍 Pilih Lokasi di Maps" : "📍 Pick Location on Maps"}
                </button>

                {/* Show selected maps URL if any */}
                {fMapsUrl && (
                  <div className="mt-1.5 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <MapPin className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <a
                      href={fMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-green-700 hover:underline truncate flex-1"
                    >
                      {fMapsUrl}
                    </a>
                    <button
                      type="button"
                      onClick={() => setFMapsUrl("")}
                      className="text-red-400 hover:text-red-600 transition shrink-0 cursor-pointer"
                      title={lang === "id" ? "Hapus link maps" : "Remove maps link"}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block">{lang === "id" ? "Catatan Tambahan (Opsional)" : "Additional Notes (Optional)"}</label>
                <textarea
                  rows={2}
                  placeholder="E.g. Catering, Bakery, atau info kurir..."
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-4 py-2 text-xs text-[#111827] resize-none"
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 min-h-11 bg-[#FBBF24] hover:bg-[#F59E0B] font-bold text-xs text-[#111827] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 mt-4"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {lang === "id" ? "Simpan Jadwal" : "Save Schedule"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Map Location Picker Modal */}
      {showMapPicker && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          </div>
        }>
          <MapLocationPicker
            lang={lang}
            onLocationSelected={handleMapLocationSelected}
            onClose={() => setShowMapPicker(false)}
          />
        </Suspense>
      )}

      {/* Template Generator Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg border border-[#E5E7EB] shadow-2xl relative">
            <button
              aria-label={lang === "id" ? "Tutup modal template" : "Close template modal"}
              onClick={() => setShowTemplateModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-neutral-100 rounded-full transition"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="font-['Manrope'] text-lg font-extrabold text-[#111827] mb-2">
              {lang === "id" ? "Generate Jadwal dari Template" : "Generate Schedules from Template"}
            </h2>
            <p className="text-xs text-[#6B7280] mb-4">
              {lang === "id" 
                ? "Pilih tanggal target dan item jadwal yang ingin digenerate secara otomatis." 
                : "Select the target date and schedule items you wish to generate automatically."}
            </p>

            <div className="space-y-4">
              {/* Target Date */}
              <div className="space-y-1">
                <label htmlFor="temp-date" className="block text-xs font-bold text-[#4B5563]">Target Tanggal <span className="text-red-500">*</span></label>
                <input
                  id="temp-date"
                  type="date"
                  required
                  className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3 py-2.5 text-xs text-[#111827]"
                  value={templateDate}
                  onChange={(e) => setTemplateDate(e.target.value)}
                />
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
                  <span className="text-xs font-bold text-[#4B5563]">Daftar Item Jadwal Harian</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTemplateItems.length === DAILY_TEMPLATE_ITEMS.length) {
                        setSelectedTemplateItems([]);
                      } else {
                        setSelectedTemplateItems(DAILY_TEMPLATE_ITEMS.map((_, i) => i));
                      }
                    }}
                    className="text-xs font-bold text-amber-700 hover:text-amber-900 transition cursor-pointer"
                  >
                    {selectedTemplateItems.length === DAILY_TEMPLATE_ITEMS.length
                      ? (lang === "id" ? "Batalkan Semua" : "Clear All")
                      : (lang === "id" ? "Pilih Semua" : "Select All")}
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 divide-y divide-[#F3F4F6] pr-1">
                  {DAILY_TEMPLATE_ITEMS.map((item, idx) => {
                    const isChecked = selectedTemplateItems.includes(idx);
                    return (
                      <label key={idx} className="flex items-start gap-3 pt-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedTemplateItems(selectedTemplateItems.filter((i) => i !== idx));
                            } else {
                              setSelectedTemplateItems([...selectedTemplateItems, idx]);
                            }
                          }}
                          className="h-4 w-4 mt-0.5 accent-amber-500 rounded border-gray-300"
                        />
                        <div className="text-xs text-[#374151]">
                          <p className="font-bold text-amber-800 font-mono inline-block mr-1">[{item.time}]</p>
                          <span className="font-bold">{item.title}</span>
                          <span className="text-gray-500 text-[10px] block">Tujuan: {item.destination}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="flex-1 min-h-11 border border-gray-300 hover:bg-gray-50 text-xs font-bold text-[#4B5563] rounded-xl transition cursor-pointer"
                >
                  {lang === "id" ? "Batal" : "Cancel"}
                </button>
                <button
                  type="button"
                  disabled={generatingTemplate || selectedTemplateItems.length === 0}
                  onClick={handleGenerateTemplate}
                  className="flex-2 flex items-center justify-center gap-2 min-h-11 bg-amber-500 hover:bg-amber-600 font-bold text-xs text-white rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {generatingTemplate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {lang === "id" 
                    ? `Generate (${selectedTemplateItems.length}) Jadwal` 
                    : `Generate (${selectedTemplateItems.length}) Schedules`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default SchedulesPage;
