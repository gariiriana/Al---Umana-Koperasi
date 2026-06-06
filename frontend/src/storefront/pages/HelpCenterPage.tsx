import { useState } from "react";
import {
  Search,
  HelpCircle,
  Shield,
  Package,
  Truck,
  MapPin,
  Monitor,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface FAQItem {
  id: string;
  category: "admin" | "production" | "distribution" | "courier" | "monitoring";
  question: {
    id: string;
    en: string;
  };
  answer: {
    id: string;
    en: string;
  };
}

const FAQ_DATA: FAQItem[] = [
  // Admin FAQs
  {
    id: "faq-admin-1",
    category: "admin",
    question: {
      id: "Bagaimana cara menyetujui atau menolak bukti transfer pembayaran?",
      en: "How do I approve or reject bank transfer payment proofs?",
    },
    answer: {
      id: "1. Tinjau Bukti: Buka menu 'Orders' -> klik detail pada pesanan pelanggan.\n2. Cek Berkas: Periksa gambar bukti transfer yang diunggah pelanggan.\n3. Aksi: Klik tombol 'Setujui Pembayaran' untuk memvalidasi transaksi, atau klik 'Tolak Pembayaran' dan masukkan alasan penolakan jika bukti transfer tidak valid.",
      en: "1. Review Proof: Go to the 'Orders' menu -> click on the order details.\n2. Check Document: Inspect the uploaded transfer proof image.\n3. Action: Click 'Setujui Pembayaran' to approve, or click 'Tolak Pembayaran' and enter a clear rejection reason if the proof is invalid.",
    },
  },
  {
    id: "faq-admin-2",
    category: "admin",
    question: {
      id: "Bagaimana cara mengunduh invoice pesanan untuk arsip koperasi?",
      en: "How do I download order invoices for cooperative archives?",
    },
    answer: {
      id: "1. Buka Catatan: Masuk ke halaman 'Daftar Invoice' atau 'Invoices' di sidebar.\n2. Cari Pesanan: Cari pesanan berdasarkan ID atau nama pelanggan.\n3. Unduh PDF: Klik ikon/tombol download PDF di samping pesanan untuk mengunduh berkas invoice resmi.",
      en: "1. Open Invoices: Go to the 'Daftar Invoice' or 'Invoices' page in the sidebar.\n2. Locate Order: Find the order using the ID or customer name.\n3. Download PDF: Click the PDF download icon/button next to the order to save the official invoice file.",
    },
  },
  {
    id: "faq-admin-3",
    category: "admin",
    question: {
      id: "Bagaimana cara beralih peran (multi-role) untuk mengakses fitur staf lain?",
      en: "How do I switch roles (multi-role) to access other staff features?",
    },
    answer: {
      id: "Sebagai Administrator, Anda memiliki akses penuh ke seluruh fitur staf. Cukup klik foto profil Anda di sudut kanan atas untuk membuka menu 'Akses Peran', lalu klik fitur peran staf yang ingin Anda buka (seperti Monitoring, Produksi, Distribusi, Penjadwal, atau Kurir).",
      en: "As an Administrator, you have full access to all staff features. Simply click your profile photo in the top right corner to open the 'Role Access' menu, and click on the staff role feature you want to access (such as Monitoring, Production, Distribution, Scheduler, or Courier).",
    },
  },
  // Production FAQs
  {
    id: "faq-prod-1",
    category: "production",
    question: {
      id: "Bagaimana cara memproses pesanan baru ke tahap produksi?",
      en: "How do I process a new order into the production stage?",
    },
    answer: {
      id: "1. Buka Dashboard Produksi: Buka menu 'Production' pada sidebar admin.\n2. Pilih Antrean: Temukan pesanan baru yang berstatus PENDING.\n3. Mulai Produksi: Klik tombol 'Mulai Produksi' untuk memindahkan status pesanan menjadi IN_PRODUCTION.",
      en: "1. Open Production: Navigate to the 'Production' page in the admin sidebar.\n2. Select Queue: Find the new orders with a PENDING status.\n3. Start Production: Click the 'Mulai Produksi' button to advance the status to IN_PRODUCTION.",
    },
  },
  {
    id: "faq-prod-2",
    category: "production",
    question: {
      id: "Bagaimana melakukan Quality Control (QC) setelah produksi selesai?",
      en: "How do I perform Quality Control (QC) after production is finished?",
    },
    answer: {
      id: "1. Tinjau Antrean QC: Buka menu 'Quality Control' (QC) di sidebar.\n2. Cek Kelayakan: Periksa produk apakah telah diproduksi dengan benar sesuai pesanan.\n3. Lolos QC: Klik tombol 'Lolos QC' untuk mengubah status pesanan menjadi Siap Dikirim (READY_TO_DELIVER).",
      en: "1. Open QC Queue: Go to the 'Quality Control' (QC) page in the sidebar.\n2. Inspect Quality: Check if the product matches the order specs and is in good condition.\n3. Pass QC: Click the 'Lolos QC' button to mark the order as READY_TO_DELIVER.",
    },
  },
  {
    id: "faq-prod-3",
    category: "production",
    question: {
      id: "Bagaimana cara menambah atau mengedit produk dalam katalog?",
      en: "How do I add or edit products in the catalog?",
    },
    answer: {
      id: "1. Manajemen Produk: Masuk ke halaman 'Daftar Produk' di sidebar.\n2. Tambah Baru: Klik 'Tambah Produk', lalu masukkan nama, harga, stok, deskripsi, kategori, serta unggah gambar produk.\n3. Ubah Produk: Klik tombol edit pada produk aktif untuk memperbarui detail yang ada lalu klik Simpan.",
      en: "1. Product Catalog: Go to the 'Daftar Produk' page in the sidebar.\n2. Add New: Click 'Tambah Produk' and fill in the name, price, stock, description, category, and upload a product image.\n3. Edit Product: Click the edit button on any active product to modify details and save.",
    },
  },
  {
    id: "faq-prod-4",
    category: "production",
    question: {
      id: "Bagaimana cara mengatur jadwal menu katering/makanan harian santri?",
      en: "How do I configure the daily student catering/food menu schedule?",
    },
    answer: {
      id: "1. Buka Penjadwal Makanan: Masuk ke menu 'Jadwal Makanan' di sidebar.\n2. Atur Menu Harian: Isi atau edit daftar menu makanan untuk setiap hari dalam seminggu.\n3. Simpan: Klik tombol simpan untuk memperbarui jadwal yang akan diakses oleh tim dapur dan monitoring.",
      en: "1. Open Food Schedule: Go to the 'Jadwal Makanan' page in the sidebar.\n2. Configure Daily Menu: Add or edit the catering menu for each day of the week.\n3. Save: Click the save button to update the schedule accessed by the kitchen and monitoring teams.",
    },
  },
  {
    id: "faq-prod-5",
    category: "production",
    question: {
      id: "Bagaimana cara melihat riwayat produksi dan kontrol kualitas (QC) yang telah selesai?",
      en: "How do I view the completed production and quality control (QC) history?",
    },
    answer: {
      id: "1. Buka Halaman Riwayat: Masuk ke halaman 'Riwayat' di bawah menu produksi di sidebar.\n2. Tinjau Data: Anda akan melihat daftar semua pesanan yang telah selesai diproduksi dan lolos QC beserta catatan waktunya.",
      en: "1. Open History Page: Go to the 'Riwayat' page under the production menu in the sidebar.\n2. Review Data: You will see a list of all orders that have completed production and passed QC, along with their timestamps.",
    },
  },
  // Distribution FAQs
  {
    id: "faq-dist-1",
    category: "distribution",
    question: {
      id: "Bagaimana cara mendistribusikan pesanan kepada kurir lapangan?",
      en: "How do I dispatch orders to the field couriers?",
    },
    answer: {
      id: "1. Buka Dispatcher: Masuk ke menu 'Dispatch' di sidebar.\n2. Pilih Pesanan: Cari pesanan berstatus Siap Dikirim (READY_TO_DELIVER).\n3. Tugaskan Kurir: Pilih kurir aktif yang tersedia, isi detail rute pengantaran, lalu klik 'Kirim' untuk melimpahkan tugas ke kurir tersebut.",
      en: "1. Open Dispatch: Navigate to the 'Dispatch' page in the sidebar.\n2. Select Order: Look for orders with a READY_TO_DELIVER status.\n3. Assign Courier: Choose an active, available courier, enter the route instructions, and click 'Kirim' to assign the delivery.",
    },
  },
  {
    id: "faq-dist-2",
    category: "distribution",
    question: {
      id: "Bagaimana cara mengatur jadwal kloter pengiriman kurir?",
      en: "How do I schedule courier delivery runs?",
    },
    answer: {
      id: "1. Buka Penjadwal Rute: Buka halaman 'Delivery Scheduler' di sidebar.\n2. Urutan Pengantaran: Atur jadwal tanggal pengantaran dan urutan pesanan untuk kurir agar rute jalan efisien.\n3. Sinkronisasi: Perubahan jadwal otomatis tersinkronisasi ke perangkat kurir.",
      en: "1. Open Route Scheduler: Go to the 'Delivery Scheduler' page in the sidebar.\n2. Delivery Order: Arrange the delivery dates and sequence of orders for the courier to optimize the delivery route.\n3. Sync: Schedule updates automatically synchronize with the courier's device.",
    },
  },
  // Courier FAQs
  {
    id: "faq-cour-1",
    category: "courier",
    question: {
      id: "Bagaimana cara kurir memulai proses pengantaran pesanan?",
      en: "How does a courier start the order delivery process?",
    },
    answer: {
      id: "1. Akses Halaman Delivery: Buka menu 'Delivery' di perangkat mobile Anda.\n2. Pilih Tugas: Lihat daftar pesanan yang ditugaskan kepada Anda.\n3. Mulai Perjalanan: Klik tombol 'Mulai Pengiriman'. Langkah ini secara otomatis mengaktifkan pengiriman koordinat GPS berkala dari perangkat Anda ke sistem pelacakan.",
      en: "1. Access Delivery Page: Open the 'Delivery' page on your mobile device.\n2. Select Assignment: View the list of orders assigned to you.\n3. Start Run: Click the 'Mulai Pengiriman' button. This automatically enables periodic GPS coordinate updates from your device to the tracking system.",
    },
  },
  {
    id: "faq-cour-2",
    category: "courier",
    question: {
      id: "Bagaimana menyelesaikan pengantaran dengan bukti pengiriman (Proof of Delivery)?",
      en: "How do I complete a delivery with Proof of Delivery?",
    },
    answer: {
      id: "1. Konfirmasi Tiba: Setelah tiba di lokasi tujuan, klik 'Selesaikan Pengiriman'.\n2. Tanda Tangan: Mintalah penerima menandatangani secara digital langsung pada layar perangkat Anda.\n3. Foto Serah Terima: Ambil foto dokumentasi produk yang diserahkan kepada penerima.\n4. Kirim Bukti: Klik tombol 'Kirim Bukti' untuk menyelesaikan tugas secara resmi di sistem.",
      en: "1. Confirm Arrival: Upon reaching the destination, click 'Selesaikan Pengiriman'.\n2. Signature: Have the recipient draw their digital signature directly on your screen.\n3. Take Photo: Capture a photo of the product being handed over to the recipient.\n4. Submit: Click the 'Kirim Bukti' button to officially complete the task in the system.",
    },
  },
  {
    id: "faq-cour-3",
    category: "courier",
    question: {
      id: "Mengapa GPS harus selalu aktif saat pengantaran barang?",
      en: "Why must GPS stay enabled during deliveries?",
    },
    answer: {
      id: "Pengaktifan GPS penting agar sistem dapat merekam koordinat pengantaran secara real-time. Hal ini memungkinkan tim monitoring memantau lokasi kurir pada peta untuk memastikan keselamatan kurir dan ketepatan estimasi waktu pengantaran.",
      en: "Keeping GPS active allows the system to capture real-time delivery coordinates. This enables the monitoring team to track courier positions on the map to ensure courier safety and precise delivery time estimates.",
    },
  },
  // Monitoring FAQs
  {
    id: "faq-mon-1",
    category: "monitoring",
    question: {
      id: "Bagaimana cara memantau pergerakan kurir secara langsung (real-time)?",
      en: "How do I monitor courier movements in real-time?",
    },
    answer: {
      id: "1. Buka Dasbor Monitoring: Masuk ke halaman 'Dashboard' di sidebar.\n2. Tinjau Peta: Perhatikan peta pelacakan interaktif di halaman utama.\n3. Pantau Posisi: Ikon penanda kurir akan bergerak secara dinamis berdasarkan sinyal GPS teraktif dari perangkat kurir yang sedang di perjalanan.",
      en: "1. Open Monitoring Dashboard: Navigate to the 'Dashboard' page in the sidebar.\n2. View Map: Inspect the interactive tracking map on the main screen.\n3. Track Courier: Courier pin icons move dynamically on the map based on active GPS updates sent by couriers currently on the road.",
    },
  },
  {
    id: "faq-mon-2",
    category: "monitoring",
    question: {
      id: "Metrik operasional apa saja yang ditampilkan di Dasbor?",
      en: "What operational metrics are displayed on the Dashboard?",
    },
    answer: {
      id: "Dasbor menampilkan total omzet penjualan koperasi (harian/bulanan), jumlah pesanan berdasarkan status (Pending, Produksi, QC, Siap Dikirim, Pengiriman, Selesai), daftar kurir aktif, dan log aktivitas pengantaran real-time.",
      en: "The Dashboard showcases cooperative sales revenue (daily/monthly), order volume breakdown by status (Pending, In Production, QC, Ready, Out for Delivery, Completed), active couriers, and real-time delivery logs.",
    },
  },
  {
    id: "faq-mon-3",
    category: "monitoring",
    question: {
      id: "Bagaimana cara mengevaluasi performa pengiriman kurir?",
      en: "How do I evaluate courier delivery performance?",
    },
    answer: {
      id: "Di bagian bawah halaman Dashboard, Anda dapat meninjau 'Daftar Riwayat Tugas Selesai'. Bagian ini mencatat waktu mulai pengantaran, waktu selesai, nama kurir, pesanan yang dibawa, serta bukti tanda tangan dan dokumentasi serah terima.",
      en: "At the bottom of the Dashboard page, you can review the 'Daftar Riwayat Tugas Selesai' log list. This logs the start time, completion time, courier name, orders carried, and links to signature & photo proofs.",
    },
  },
];

const CATEGORIES = [
  { id: "all", label: { id: "Semua", en: "All" }, icon: HelpCircle },
  { id: "admin", label: { id: "Admin", en: "Admin" }, icon: Shield },
  { id: "production", label: { id: "Produksi", en: "Production" }, icon: Package },
  { id: "distribution", label: { id: "Distribusi", en: "Distribution" }, icon: Truck },
  { id: "courier", label: { id: "Kurir", en: "Courier" }, icon: MapPin },
  { id: "monitoring", label: { id: "Monitoring", en: "Monitoring" }, icon: Monitor },
];

export function HelpCenterPage() {
  const { lang } = useLanguage();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (!profile?.role) return "all";
    if (profile.role === "tim_produksi") return "production";
    if (profile.role === "distribusi") return "distribution";
    if (profile.role === "kurir") return "courier";
    return profile.role; // admin, monitoring
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  const handleToggleFaq = (id: string) => {
    setExpandedFaqId(expandedFaqId === id ? null : id);
  };

  // Filter FAQs based on search and active tab
  const filteredFaqs = FAQ_DATA.filter((faq) => {
    const matchesTab = activeTab === "all" || faq.category === activeTab;
    const qText = faq.question[lang].toLowerCase();
    const aText = faq.answer[lang].toLowerCase();
    const matchesSearch =
      searchQuery.trim() === "" ||
      qText.includes(searchQuery.toLowerCase()) ||
      aText.includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const t = {
    title: lang === "id" ? "Pusat Tutorial Operasional" : "Operational Tutorials",
    subtitle: lang === "id" ? "Temukan panduan penggunaan sistem berdasarkan peran Anda:" : "Find system usage guides based on your role:",
    placeholder: lang === "id" ? "Ketik peran atau kata kunci tutorial..." : "Type role or search keyword...",
    noResults: lang === "id" ? "Tidak ada tutorial ditemukan." : "No tutorials found.",
    popularFaqs: lang === "id" ? "Tutorial Operasional & FAQ Peran" : "Operational Tutorials & Role FAQs",
    faqCategory: lang === "id" ? "Pilih Peran Staf" : "Select Staff Role",
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] pb-12">
      {/* Hero Search Section */}
      <section className="bg-gradient-to-r from-[#FBBF24] to-[#F59E0B] py-12 px-4 shadow-sm">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="space-y-2">
            <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl md:text-3xl font-extrabold text-[#111827]">
              {t.title}
            </h1>
            <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm md:text-base text-amber-900 font-medium">
              {t.subtitle}
            </p>
          </div>

          {/* Search bar */}
          <div className="max-w-2xl mx-auto relative flex items-center bg-white rounded-xl shadow-md overflow-hidden border border-amber-200 focus-within:ring-2 focus-within:ring-[#B45309]">
            <Search className="absolute left-4 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.placeholder}
              className="w-full pl-12 pr-4 py-3.5 text-sm text-neutral-800 placeholder:text-neutral-400 bg-white border-none focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 mt-8 space-y-8">
        {/* Categories Tab Grid */}
        <section className="space-y-3">
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            {t.faqCategory}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(cat.id);
                    setExpandedFaqId(null);
                  }}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-white border-[#F59E0B] shadow-sm text-[#B45309]"
                      : "bg-white border-transparent hover:border-[#FBBF24] hover:shadow-xs text-neutral-600"
                  }`}
                >
                  <Icon className={`h-6 w-6 mb-2 ${isActive ? "text-[#F59E0B]" : "text-neutral-400"}`} />
                  <span className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-bold text-center">
                    {cat.label[lang]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Accordions FAQ List */}
        <section className="space-y-4">
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
            {t.popularFaqs}
          </h2>

          {filteredFaqs.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-neutral-500 shadow-xs border border-neutral-100">
              {t.noResults}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFaqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="bg-white rounded-xl border border-[#E5E7EB] hover:border-amber-200 transition-colors shadow-xs overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleFaq(faq.id)}
                      className="w-full flex items-center justify-between p-4 text-left font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-bold text-neutral-800 cursor-pointer focus:outline-none"
                    >
                      <span>{faq.question[lang]}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-[#F59E0B] shrink-0 ml-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0 ml-2" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-neutral-600 leading-relaxed border-t border-neutral-50 whitespace-pre-line">
                        {faq.answer[lang]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default HelpCenterPage;
