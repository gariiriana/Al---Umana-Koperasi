import { useState, useEffect } from "react";
import {
  Search,
  HelpCircle,
  CreditCard,
  Truck,
  FileText,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
} from "lucide-react";

interface FAQItem {
  id: string;
  category: "shopping" | "payment" | "shipping" | "policy";
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
  {
    id: "faq-1",
    category: "shopping",
    question: {
      id: "Bagaimana cara memesan produk di Koperasi Al-Umanaa?",
      en: "How do I order products at Al-Umanaa Cooperative?",
    },
    answer: {
      id: "Anda dapat memilih produk berkualitas dari halaman Beranda, menambahkannya ke Keranjang belanja, lalu klik tombol Checkout untuk melengkapi alamat pengiriman dan menyelesaikan pesanan.",
      en: "You can select quality products from the Home page, add them to your shopping Cart, then click the Checkout button to fill in the delivery address and complete your order.",
    },
  },
  {
    id: "faq-2",
    category: "shopping",
    question: {
      id: "Apakah saya harus memiliki akun untuk berbelanja?",
      en: "Do I need to have an account to shop?",
    },
    answer: {
      id: "Ya, Anda perlu mendaftar akun pelanggan terlebih dahulu agar kami dapat memproses pesanan, melacak pengiriman, dan mencatat transaksi keanggotaan koperasi Anda.",
      en: "Yes, you need to register a customer account first so that we can process your orders, track shipments, and record your cooperative membership transactions.",
    },
  },
  {
    id: "faq-3",
    category: "payment",
    question: {
      id: "Metode pembayaran apa saja yang didukung?",
      en: "What payment methods are supported?",
    },
    answer: {
      id: "Kami mendukung metode Cash on Delivery (COD/Bayar di Tempat) serta transfer bank/e-wallet. Untuk metode transfer, Anda wajib mengunggah bukti pembayaran agar dapat diverifikasi oleh admin.",
      en: "We support Cash on Delivery (COD) as well as bank transfer/e-wallet. For transfer methods, you must upload a payment proof to be verified by the admin.",
    },
  },
  {
    id: "faq-4",
    category: "payment",
    question: {
      id: "Mengapa bukti transfer saya ditolak?",
      en: "Why was my bank transfer proof rejected?",
    },
    answer: {
      id: "Penolakan biasanya terjadi jika foto/screenshot bukti transfer kurang jelas, nominal tidak sesuai, atau rekening tujuan salah. Anda dapat melihat alasan penolakan di detail pesanan Anda dan mengunggah kembali bukti yang valid.",
      en: "Rejection usually occurs if the transfer proof photo/screenshot is unclear, the transfer amount does not match, or the destination account is incorrect. You can view the rejection reason in your order details and re-upload a valid proof.",
    },
  },
  {
    id: "faq-5",
    category: "shipping",
    question: {
      id: "Bagaimana cara melacak pesanan saya?",
      en: "How do I track my order?",
    },
    answer: {
      id: "Anda dapat melihat status pesanan di halaman 'Pesanan' -> 'Pesanan Saya'. Setelah kurir dikirimkan, Anda dapat memantau lokasi GPS kurir secara langsung di halaman pelacakan.",
      en: "You can view your order status on the 'Orders' -> 'My Orders' page. Once the courier is dispatched, you can monitor the courier's GPS location in real time on the tracking page.",
    },
  },
  {
    id: "faq-6",
    category: "shipping",
    question: {
      id: "Berapa lama proses pengiriman pesanan?",
      en: "How long does order delivery take?",
    },
    answer: {
      id: "Pesanan akan diproses oleh Tim Produksi terlebih dahulu untuk jaminan kualitas. Waktu pengiriman bergantung pada jarak lokasi Anda dan jadwal pengiriman yang Anda pilih saat checkout.",
      en: "Orders will be processed by the Production Team first for quality assurance. Delivery time depends on your distance and the delivery schedule you selected during checkout.",
    },
  },
  {
    id: "faq-7",
    category: "policy",
    question: {
      id: "Apakah saya bisa membatalkan pesanan yang sudah dibayar?",
      en: "Can I cancel an order that has been paid for?",
    },
    answer: {
      id: "Pesanan yang sudah masuk ke proses produksi tidak dapat dibatalkan. Jika Anda perlu mengubah pesanan sebelum produksi dimulai, silakan hubungi kontak layanan pelanggan Koperasi Al-Umanaa.",
      en: "Orders that have entered the production phase cannot be cancelled. If you need to modify your order before production starts, please contact Al-Umanaa Cooperative customer support.",
    },
  },
  {
    id: "faq-8",
    category: "policy",
    question: {
      id: "Bagaimana kebijakan pengembalian barang jika produk rusak?",
      en: "What is the return policy if a product is damaged?",
    },
    answer: {
      id: "Koperasi Al-Umanaa menjamin kualitas setiap produk. Jika barang diterima dalam keadaan rusak atau tidak sesuai, Anda dapat mengajukan klaim pengembalian dana atau tukar barang dengan menyertakan bukti foto ke admin melalui Pusat Bantuan.",
      en: "Al-Umanaa Cooperative guarantees the quality of every product. If items are received damaged or incorrect, you can submit a claim for refund or replacement by providing photographic evidence to the admin through the Help Center.",
    },
  },
];

const CATEGORIES = [
  { id: "all", label: { id: "Semua", en: "All" }, icon: HelpCircle },
  { id: "shopping", label: { id: "Belanja", en: "Shopping" }, icon: ShoppingBag },
  { id: "payment", label: { id: "Pembayaran", en: "Payment" }, icon: CreditCard },
  { id: "shipping", label: { id: "Pengiriman", en: "Shipping" }, icon: Truck },
  { id: "policy", label: { id: "Kebijakan", en: "Policy" }, icon: FileText },
];

export function HelpCenterPage() {
  const [lang, setLang] = useState<"id" | "en">("id");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);

  // Sync language with localStorage
  useEffect(() => {
    const checkLang = () => {
      const saved = localStorage.getItem("al-umana-lang");
      setLang(saved === "en" ? "en" : "id");
    };

    checkLang();
    // Listen to storage events to stay sync'd if user toggles language
    window.addEventListener("storage", checkLang);
    return () => window.removeEventListener("storage", checkLang);
  }, []);

  // Poll for language changes periodically (as custom storage changes don't always fire storage events in same window)
  useEffect(() => {
    const interval = setInterval(() => {
      const saved = localStorage.getItem("al-umana-lang");
      const current = saved === "en" ? "en" : "id";
      if (current !== lang) {
        setLang(current);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [lang]);

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
    title: lang === "id" ? "Pusat Bantuan Al-Umanaa" : "Al-Umanaa Help Center",
    subtitle: lang === "id" ? "Ada yang bisa kami bantu hari ini?" : "How can we help you today?",
    placeholder: lang === "id" ? "Ketik pertanyaan Anda di sini..." : "Type your question here...",
    noResults: lang === "id" ? "Tidak ada pertanyaan ditemukan." : "No questions found.",
    popularFaqs: lang === "id" ? "Pertanyaan Populer (FAQ)" : "Popular Questions (FAQ)",
    faqCategory: lang === "id" ? "Kategori Bantuan" : "Help Categories",
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                      <div className="px-4 pb-4 pt-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-neutral-600 leading-relaxed border-t border-neutral-50">
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
