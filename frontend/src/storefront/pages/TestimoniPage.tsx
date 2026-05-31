import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, Star, MessageSquare, AlertCircle, Award } from "lucide-react";
import { collection, getDocs, query, orderBy, doc, getDoc, Timestamp } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useLanguage } from "@/contexts/LanguageContext";

interface Review {
  orderId: string;
  customerId: string;
  customerName: string;
  rating: number;
  review: string;
  reviewPhotoId?: string;
  createdAt: string | Timestamp | Date;
}

const DICTIONARY = {
  id: {
    title: "Testimoni Pelanggan",
    loading: "Memuat testimoni…",
    empty: "Belum ada testimoni dari pelanggan.",
    ratingLabel: "Penilaian Keseluruhan",
    totalReviews: "{count} Ulasan",
    backToHome: "Kembali ke Beranda",
    error: "Gagal memuat ulasan pelanggan.",
    tryAgain: "Coba Lagi",
    satisfaction: "Kepuasan Pelanggan",
  },
  en: {
    title: "Customer Testimonials",
    loading: "Loading reviews...",
    empty: "No customer reviews yet.",
    ratingLabel: "Overall Rating",
    totalReviews: "{count} Review(s)",
    backToHome: "Back to Home",
    error: "Failed to load customer reviews.",
    tryAgain: "Try Again",
    satisfaction: "Customer Satisfaction",
  }
} as const;

function ReviewImage({ photoId }: { photoId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!photoId) return;

    const loadPhoto = async () => {
      setLoading(true);
      try {
        const fileId = photoId.replace("delivery_files/", "");
        const parentRef = doc(db, "delivery_files", fileId);
        const parentSnap = await getDoc(parentRef);
        
        if (parentSnap.exists()) {
          const meta = parentSnap.data();
          const totalChunks = meta.totalChunks || 0;
          
          const chunkPromises = [];
          for (let i = 0; i < totalChunks; i++) {
            const chunkRef = doc(db, "delivery_files", fileId, "chunks", String(i));
            chunkPromises.push(getDoc(chunkRef));
          }
          const chunkSnaps = await Promise.all(chunkPromises);
          
          let fullDataUri = "";
          for (const chunkSnap of chunkSnaps) {
            if (chunkSnap.exists()) {
              fullDataUri += chunkSnap.data().data || "";
            }
          }
          setSrc(fullDataUri);
        }
      } catch (err) {
        console.error("Gagal memuat foto ulasan:", err);
      } finally {
        setLoading(false);
      }
    };

    loadPhoto();
  }, [photoId]);

  if (loading) {
    return (
      <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-video w-full max-w-sm flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!src) return null;

  return (
    <div className="relative border border-[#E5E7EB] rounded-2xl overflow-hidden bg-[#F3F4F6] aspect-video w-full max-w-xs mt-2.5">
      <img src={src} alt="Foto Ulasan" className="h-full w-full object-cover" />
    </div>
  );
}

export function TestimoniPage() {
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          orderId: d.id,
          customerId: data.customerId || "",
          customerName: data.customerName || "",
          rating: data.rating || 0,
          review: data.review || "",
          reviewPhotoId: data.reviewPhotoId || undefined,
          createdAt: data.createdAt,
        } as Review;
      });
      setReviews(list);
    } catch (err) {
      console.error("Gagal memuat testimoni:", err);
      setError(t.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const avg = sum / reviews.length;
    const distribution = [0, 0, 0, 0, 0]; // index 0 is 5 stars, index 4 is 1 star
    reviews.forEach((r) => {
      const idx = 5 - Math.max(1, Math.min(5, Math.round(r.rating)));
      distribution[idx]++;
    });
    return {
      avg: Number(avg.toFixed(1)),
      count: reviews.length,
      distribution,
    };
  }, [reviews]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[#6B7280] bg-[#F3F4F6] min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" aria-hidden="true" />
        <p className="mt-2 text-sm font-['Hanken_Grotesk']">{t.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] px-4 py-8 flex flex-col items-center justify-center text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-2xl p-4 font-['Hanken_Grotesk']">
          {error}
        </p>
        <button
          onClick={fetchReviews}
          className="inline-flex items-center gap-2 min-h-11 px-6 rounded-2xl bg-amber-400 text-sm font-bold text-neutral-900 cursor-pointer hover:bg-amber-500 transition"
        >
          {t.tryAgain}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#F3F4F6] min-h-screen pb-24">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <Link
          to="/"
          className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] text-[#111827]"
          aria-label={t.backToHome}
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {t.title}
        </h1>
      </div>

      <div className="p-4 max-w-[480px] lg:max-w-4xl mx-auto space-y-5">
        {/* Rating Summary Card */}
        {reviews.length > 0 && (
          <div className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left part: Overall numeric display */}
            <div className="flex flex-col items-center justify-center text-center space-y-2 border-b md:border-b-0 md:border-r border-[#F3F4F6] pb-5 md:pb-0 md:pr-5">
              <span className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">{t.ratingLabel}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl sm:text-5xl font-['Manrope'] font-extrabold text-[#111827]">{stats.avg}</span>
                <span className="text-neutral-400 text-sm">/ 5.0</span>
              </div>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-5 w-5 ${
                      star <= Math.round(stats.avg)
                        ? "fill-[#FBBF24] text-[#FBBF24]"
                        : "text-neutral-200"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-bold text-neutral-500 font-['Hanken_Grotesk'] pt-1">
                {t.totalReviews.replace("{count}", String(stats.count))}
              </span>
            </div>

            {/* Right part: Distribution bars */}
            <div className="space-y-2 font-['Hanken_Grotesk']">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = stats.distribution[5 - stars];
                const pct = stats.count > 0 ? (count / stats.count) * 100 : 0;
                return (
                  <div key={stars} className="flex items-center gap-3 text-xs">
                    <span className="w-3 text-neutral-500 font-bold text-right">{stars}</span>
                    <Star className="h-3.5 w-3.5 fill-[#FBBF24] text-[#FBBF24] shrink-0" />
                    <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        ref={(el) => {
                          if (el) el.style.width = `${pct}%`;
                        }}
                        className="h-full bg-[#FBBF24] rounded-full transition-all"
                      />
                    </div>
                    <span className="w-8 text-neutral-400 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reviews List */}
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 py-20 bg-white rounded-3xl border border-[#E5E7EB] text-center space-y-4">
            <div className="h-16 w-16 bg-[#F9FAFB] rounded-full flex items-center justify-center text-[#9CA3AF]">
              <MessageSquare className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">{t.title}</h2>
              <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk'] max-w-xs">
                {t.empty}
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-amber-400 hover:bg-amber-500 text-sm font-bold text-[#111827] shadow-sm transition"
            >
              {t.backToHome}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((r, idx) => {
              let dateString = "";
              if (r.createdAt) {
                const d = r.createdAt instanceof Timestamp ? r.createdAt.toDate() : new Date(r.createdAt as string);
                if (!isNaN(d.getTime())) {
                  dateString = d.toLocaleDateString(lang === "en" ? "en-US" : "id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                }
              }

              return (
                <div
                  key={r.orderId || idx}
                  className="bg-white rounded-3xl p-5 border border-[#E5E7EB] shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    {/* Header */}
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h4 className="font-['Manrope'] font-bold text-[#111827] text-sm truncate max-w-[200px]">
                          {r.customerName || "Pelanggan Koperasi"}
                        </h4>
                        <span className="text-[10px] text-neutral-400 font-['Hanken_Grotesk']">{dateString}</span>
                      </div>
                      <div className="flex items-center gap-0.5 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                        <Star className="h-3 w-3 fill-[#FBBF24] text-[#FBBF24]" />
                        <span className="text-[10px] font-extrabold text-amber-800 font-mono">{r.rating}</span>
                      </div>
                    </div>

                    {/* Review text */}
                    {r.review && (
                      <p className="text-xs text-[#4B5563] leading-relaxed font-['Hanken_Grotesk']">
                        {r.review}
                      </p>
                    )}

                    {/* Optional Photo */}
                    {r.reviewPhotoId && (
                      <ReviewImage photoId={r.reviewPhotoId} />
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#F9FAFB] flex items-center gap-1.5 text-[9px] font-bold text-emerald-600 bg-emerald-50/30 px-2 py-1 rounded-lg mt-1 w-fit">
                    <Award className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span>Verified Purchase</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default TestimoniPage;
