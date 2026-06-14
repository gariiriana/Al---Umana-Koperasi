import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { Loader2, FileText, Calendar, User, Phone, MapPin, Printer, ShieldCheck, AlertCircle, Clock } from "lucide-react";
import { getOrderByInvoiceToken, signInvoice } from "@/services/invoiceService";
import type { Order } from "@/types/order";
import { formatIDR } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProductImage } from "@/components/ProductImage";
import { aggregateIngredients } from "@/lib/ingredientsParser";

export function InvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const sigCanvasRef = useRef<SignatureCanvas | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!order || order.invoiceSignedAt) return;
    const timer = setTimeout(() => {
      const canvas = sigCanvasRef.current?.getCanvas();
      const container = canvasContainerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = 150;
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [order]);

  useEffect(() => {
    async function loadInvoice() {
      if (!token) {
        setError("Token invoice tidak valid");
        setLoading(false);
        return;
      }
      try {
        const data = await getOrderByInvoiceToken(token);
        setOrder(data);
      } catch (err) {
        console.error(err);
        setError("Invoice tidak ditemukan atau telah kedaluwarsa.");
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [token]);

  const handleClear = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear();
    }
  };

  const handleSign = async () => {
    if (!token || !sigCanvasRef.current) return;
    
    if (sigCanvasRef.current.isEmpty()) {
      showToastMessage("Silakan coret tanda tangan Anda pada canvas terlebih dahulu.", "error");
      return;
    }

    setSigning(true);
    try {
      const signatureData = sigCanvasRef.current.getTrimmedCanvas().toDataURL("image/png");
      await signInvoice(token, signatureData);
      
      // Reload order data
      const data = await getOrderByInvoiceToken(token);
      setOrder(data);
    } catch (err) {
      console.error(err);
      showToastMessage("Gagal menyimpan tanda tangan", "error");
    } finally {
      setSigning(false);
    }
  };

  // Simple toast implementation for public page since useToast context might not be available out of Admin shell
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToastMessage = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#D97706] mx-auto" />
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk']">Memuat Invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4 bg-white border border-[#E5E7EB] rounded-3xl shadow-lg">
          <div className="w-12 h-12 bg-red-100 text-[#EF4444] rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-[#111827]">
            Invoice Tidak Ditemukan
          </h2>
          <p className="text-sm text-[#6B7280]">
            {error || "Tautan invoice yang Anda gunakan tidak valid atau telah dihapus."}
          </p>
        </Card>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#F3F4F6] py-8 px-4 sm:px-6 lg:px-8 font-['Hanken_Grotesk']">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-xs font-bold transition-all duration-300 ${
          toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Printable Invoice Container */}
        <Card className="p-8 sm:p-12 bg-white border border-[#E5E7EB] rounded-3xl shadow-xl space-y-8 relative overflow-hidden">
          {/* Decorative Brand Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-[#F3F4F6] pb-8">
            <div className="space-y-1">
              <h2 className="font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-[#D97706] tracking-wide">
                KOPERASI AL-UMANAA
              </h2>
              <p className="text-xs text-[#6B7280]">
                Pesantren Al-Umanaa, Sukabumi, Jawa Barat
              </p>
            </div>
            <div className="text-right sm:text-right">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-[#B45309] border border-amber-200 rounded-full text-xs font-bold uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5" />
                Invoice Resmi
              </span>
              <p className="text-[11px] text-[#9CA3AF] mt-1">ID: #{order.id.slice(0, 12).toUpperCase()}</p>
            </div>
          </div>

          {/* Digital Signature section */}
          <div className="pt-2 pb-2 space-y-4">
            <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider text-center sm:text-left">
              Konfirmasi & Tanda Tangan Pelanggan
            </h4>

            {order.invoiceSignedAt ? (
              <div className="bg-[#D1FAE5] border border-[#A7F3D0] rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-12 h-12 bg-white text-[#10B981] rounded-full flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[#065F46] text-sm">Pesanan Terkonfirmasi & Tanda Tangan Valid</p>
                  <p className="text-xs text-[#047857]">
                    Diverifikasi secara digital pada {new Date(order.invoiceSignedAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}
                  </p>
                </div>
                {order.invoiceSignatureData && (
                  <div className="bg-white border border-[#A7F3D0] rounded-xl p-2 max-w-[200px]">
                    <img src={order.invoiceSignatureData} alt="Tanda Tangan Pelanggan" className="max-h-24 mx-auto" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 bg-neutral-50 p-6 rounded-2xl border border-[#E5E7EB]">
                <p className="text-xs text-[#6B7280] text-center max-w-md">
                  Dengan menandatangani di bawah ini, Anda menyatakan setuju dengan seluruh rincian hidangan, jumlah pesanan, alamat, dan total harga di bawah.
                </p>

                {/* Signature Canvas */}
                <div 
                  ref={canvasContainerRef}
                  className="border border-[#D1D5DB] rounded-xl bg-white w-full max-w-[400px] overflow-hidden"
                >
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    penColor="#111827"
                    canvasProps={{
                      className: "sigCanvas w-full bg-white cursor-crosshair",
                      style: { height: "150px" }
                    }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center w-full max-w-[400px]">
                  <Button
                    type="button"
                    variant="outlined"
                    onClick={handleClear}
                    disabled={signing}
                    className="w-full sm:flex-1 rounded-xl text-xs py-2.5 h-10 border border-[#D1D5DB]"
                  >
                    Bersihkan
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSign}
                    loading={signing}
                    className="w-full sm:flex-1 bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-xl text-xs py-2.5 h-10 font-bold whitespace-nowrap"
                  >
                    {signing ? "Memproses..." : "Konfirmasi & TTD"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <hr className="border-[#F3F4F6]" />

          {/* Invoice Meta Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-[#F9FAFB] rounded-2xl p-6 border border-[#E5E7EB]">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                Detail Pengiriman & Acara
              </h4>
              <div className="space-y-2 text-sm text-[#374151]">
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-[#9CA3AF] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{order.recipientName}</span>
                    <p className="text-xs text-[#6B7280]">{order.institutionName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                  <span className="font-mono">{order.recipientPhone}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#9CA3AF] shrink-0 mt-0.5" />
                  {(() => {
                    const address = order.deliveryAddress || "";
                    const mapsUrlMatch = address.match(/https?:\/\/[^\s]+/);
                    const mapsUrl = mapsUrlMatch ? mapsUrlMatch[0] : null;
                    const cleanAddress = mapsUrl ? address.replace(mapsUrl, "").replace(/\s+/g, " ").trim() : address;
                    return (
                      <div className="space-y-1">
                        <span>{cleanAddress}</span>
                        {mapsUrl && (
                          <div className="mt-1">
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline cursor-pointer bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>Buka Link Peta ↗</span>
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
 
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                Informasi Tagihan
              </h4>
              <div className="space-y-2 text-sm text-[#374151]">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#9CA3AF]" />
                  <span>Jam Pemberangkatan: <span className="font-bold">{(() => {
                    if (!order.eventDate) return "—";
                    const dObj = new Date(order.eventDate);
                    if (isNaN(dObj.getTime())) return order.eventDate;
                    const fd = dObj.toLocaleDateString("id-ID", { dateStyle: "long" });
                    if (order.eventDate.includes("T")) {
                      const ft = dObj.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
                      return `${fd} ${ft}`;
                    }
                    return fd;
                  })()}</span></span>
                </div>
                {order.deliveryTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#9CA3AF]" />
                    <span>Harus Sampai: <span className="font-bold">{order.deliveryTime}</span></span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#9CA3AF]" />
                  <span>Jatuh Tempo: <span className="font-bold text-red-600">{new Date(order.paymentDueDate).toLocaleDateString("id-ID", { dateStyle: "long" })}</span></span>
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
              Rincian Pesanan
            </h4>
            <div className="border border-[#E5E7EB] rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Foto</th>
                    <th className="py-3 px-4">Menu Item</th>
                    <th className="py-3 px-4 text-center">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-sm text-[#374151]">
                  {order.items.map((it, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50/50">
                      <td className="py-3.5 px-4">
                        <ProductImage
                          imageUrl={it.imageUrl || ""}
                          alt={it.itemName}
                          className="h-10 w-10 rounded-lg object-cover bg-white border border-neutral-200 shrink-0"
                          fallbackClassName="h-4 w-4 text-[#9CA3AF]"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#111827]">
                        <div>{it.itemName}</div>
                        {(it.recipientName || it.deliveryAddress || it.deliveryTime) && (
                          <div className="text-[10px] text-amber-700 font-semibold mt-1 leading-normal">
                            *Kirim ke: {it.recipientName || "—"} - {it.deliveryAddress ? it.deliveryAddress.split(" | ")[0] : "—"} - {it.deliveryTime ? it.deliveryTime.replace("T", " ") : "—"}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold font-mono">
                        {order.isPreOrder ? "Pra-pesanan" : `×${it.quantity}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total Ingredients Composition */}
          {(() => {
            if (order.isPreOrder) return null;
            const ingredients = aggregateIngredients(order.items);
            if (ingredients.length === 0) return null;
            return (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">
                  Total Kebutuhan Bahan
                </h4>
                <div className="border border-[#E5E7EB] rounded-2xl p-5 bg-[#F9FAFB] text-xs font-semibold text-[#4B5563]">
                  <div className="divide-y divide-[#E5E7EB]">
                    {ingredients.map((ing, idx) => (
                      <div key={idx} className="py-2.5 flex justify-between items-center">
                        <span className="capitalize">{ing.name}</span>
                        <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                          {ing.amount} {ing.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Food/Drink Details Notes */}
          {(order.foodDetails || order.drinkDetails || order.recipientNotes) && (
            <div className="space-y-3 p-5 bg-[#FFFBEB] rounded-2xl border border-[#FDE047]/50">
              <h5 className="text-xs font-bold text-[#B45309] uppercase tracking-wider">Catatan Detail Hidangan</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#78350F]">
                {order.foodDetails && (
                  <div>
                    <span className="font-bold">Request Menu:</span>
                    <p className="mt-1">{order.foodDetails}</p>
                  </div>
                )}
                {order.drinkDetails && (
                  <div>
                    <span className="font-bold">Detail Minuman:</span>
                    <p className="mt-1">{order.drinkDetails}</p>
                  </div>
                )}
                {order.recipientNotes && (
                  <div className="col-span-full pt-2 border-t border-[#FCD34D]/40">
                    <span className="font-bold">Catatan Lokasi:</span>
                    <p className="mt-1">{order.recipientNotes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Totals */}
          <div className="pt-6 border-t border-[#F3F4F6] space-y-2">
            <div className="flex justify-between items-center text-xs text-[#6B7280]">
              <span>Subtotal Pesanan:</span>
              <span>{formatIDR(order.totalPrice + (order.discountAmount || 0) - (order.additionalFee || 0))}</span>
            </div>
            {order.discountAmount !== undefined && order.discountAmount > 0 && (
              <div className="flex justify-between items-center text-xs text-emerald-600 font-semibold">
                <span>Diskon Promo ({order.promoCode}):</span>
                <span>-{formatIDR(order.discountAmount)}</span>
              </div>
            )}
            {order.additionalFee !== undefined && order.additionalFee > 0 && (
              <div className="flex justify-between items-center text-xs text-[#6B7280]">
                <span>Biaya Tambahan:</span>
                <span>{formatIDR(order.additionalFee)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
              <span className="font-['Manrope'] font-extrabold text-base text-[#111827]">Grand Total Tagihan:</span>
              <span className="font-['Manrope'] font-black text-2xl text-[#D97706]">{formatIDR(order.totalPrice)}</span>
            </div>
          </div>
        </Card>

        {/* Footer print action */}
        <div className="flex justify-center">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 text-xs font-bold text-[#6B7280] hover:text-[#111827] bg-white border border-[#D1D5DB] hover:border-[#9CA3AF] rounded-xl px-4 py-2 shadow-xs transition-all"
          >
            <Printer className="w-4 h-4" />
            Cetak Invoice (PDF)
          </button>
        </div>
      </div>
    </div>
  );
}

export default InvoicePage;
