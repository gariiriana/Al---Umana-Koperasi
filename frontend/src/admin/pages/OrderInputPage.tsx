import React, { useState, useEffect } from "react";
import { Plus, Trash2, Copy, ExternalLink, Check, ShoppingBag, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/contexts/ToastContext";
import { listAllItems } from "@/services/stockAdminService";
import { createAdminOrder } from "@/services/orderService";
import type { InventoryItem } from "@/types/inventory";
import type { OrderLineItem, OrderType } from "@/types/order";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatIDR } from "@/lib/format";

interface SelectedItem extends OrderLineItem {
  price: number;
  unit: string;
}

export function OrderInputPage() {
  const { showToast } = useToast();

  // Form Fields
  const [orderType, setOrderType] = useState<OrderType>("event");
  const [institutionName, setInstitutionName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientNotes, setRecipientNotes] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [foodDetails, setFoodDetails] = useState("");
  const [drinkDetails, setDrinkDetails] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [totalPriceOverride, setTotalPriceOverride] = useState<number | null>(null);
  const [additionalFee, setAdditionalFee] = useState<number>(0);

  // DB States
  const [menuItems, setMenuItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Success State
  const [createdOrder, setCreatedOrder] = useState<{ id: string; token: string; phone: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadMenu() {
      try {
        const items = await listAllItems();
        // Filter out unavailable items if needed, or allow selecting any item
        setMenuItems(items);
      } catch (err) {
        console.error("Failed to load menu items", err);
        showToast({ message: "Gagal memuat daftar menu", variant: "error" });
      } finally {
        setLoadingMenu(false);
      }
    }
    loadMenu();
  }, [showToast]);

  // Calculate prices
  const autoCalculatedTotal = selectedItems.reduce((acc, item) => {
    return acc + item.price * item.quantity;
  }, 0);

  const displayTotal = totalPriceOverride !== null ? totalPriceOverride : (autoCalculatedTotal + additionalFee);

  const handleAddItem = (item: InventoryItem) => {
    const existing = selectedItems.find((s) => s.itemId === item.id);
    const finalItemPrice = Math.round(item.price * (1 - (item.discountPercent || 0) / 100));
    
    if (existing) {
      if (existing.quantity >= item.quantity) {
        showToast({ message: `Stok tidak mencukupi. Stok saat ini: ${item.quantity}`, variant: "error" });
        return;
      }
      setSelectedItems(
        selectedItems.map((s) =>
          s.itemId === item.id ? { ...s, quantity: s.quantity + 1 } : s
        )
      );
    } else {
      if (item.quantity < 1) {
        showToast({ message: "Stok produk kosong!", variant: "error" });
        return;
      }
      setSelectedItems([
        ...selectedItems,
        {
          itemId: item.id,
          itemName: item.itemName,
          quantity: 1,
          price: finalItemPrice,
          unit: item.unit,
        },
      ]);
    }
    showToast({ message: `${item.itemName} ditambahkan ke pesanan`, variant: "success" });
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((s) => s.itemId !== itemId));
  };

  const handleQtyChange = (itemId: string, qty: number) => {
    const menuItem = menuItems.find((m) => m.id === itemId);
    if (!menuItem) return;
    if (qty > menuItem.quantity) {
      showToast({ message: `Stok tidak mencukupi. Stok saat ini: ${menuItem.quantity}`, variant: "error" });
      return;
    }
    setSelectedItems(
      selectedItems.map((s) =>
        s.itemId === itemId ? { ...s, quantity: Math.max(1, qty) } : s
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedItems.length === 0) {
      showToast({ message: "Silakan pilih minimal 1 menu item", variant: "error" });
      return;
    }

    setSubmitting(true);

    try {
      const order = await createAdminOrder({
        orderType,
        institutionName: institutionName.trim(),
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        recipientNotes: recipientNotes.trim(),
        eventDate,
        deliveryAddress: deliveryAddress.trim(),
        deliveryTime: deliveryTime.trim(),
        foodDetails: foodDetails.trim() || selectedItems.map(s => `${s.itemName} (${s.quantity} ${s.unit})`).join(", "),
        drinkDetails: drinkDetails.trim(),
        items: selectedItems.map((s) => ({
          itemId: s.itemId,
          itemName: s.itemName,
          quantity: s.quantity,
        })),
        totalPrice: displayTotal,
        additionalFee,
        additionalNotes: additionalNotes.trim(),
      });

      showToast({ message: "Pesanan berhasil dibuat!", variant: "success" });
      setCreatedOrder({
        id: order.id,
        token: order.invoiceToken || "",
        phone: order.recipientPhone,
        name: order.recipientName,
      });
    } catch (err) {
      console.error(err);
      showToast({
        message: err instanceof Error ? err.message : "Gagal membuat pesanan",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdOrder) return;
    const url = `${window.location.origin}/invoice/${createdOrder.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    showToast({ message: "Tautan invoice disalin!", variant: "success" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWA = () => {
    if (!createdOrder) return;
    const url = `${window.location.origin}/invoice/${createdOrder.token}`;
    const shortId = createdOrder.id.slice(-6).toUpperCase();
    const text = `Halo ${createdOrder.name},\n\nPesanan Anda #${shortId} dari ${institutionName} telah berhasil dibuat!\nTotal Tagihan: Rp ${displayTotal.toLocaleString()}\n\nSilakan konfirmasi pesanan dan lakukan tanda tangan digital melalui tautan invoice berikut:\n${url}`;
    const waUrl = `https://wa.me/${createdOrder.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  // Filter menu items by search query
  const filteredMenu = menuItems.filter((item) =>
    item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (createdOrder) {
    const invoiceUrl = `/invoice/${createdOrder.token}`;
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Card className="p-8 text-center space-y-6 border border-[#E5E7EB] bg-white shadow-lg rounded-3xl animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-[#D1FAE5] text-[#10B981] rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>
          <div className="space-y-2">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
              Pesanan Berhasil Dibuat
            </h2>
            <p className="text-sm text-[#6B7280]">
              ID Pesanan: <span className="font-mono font-bold text-[#111827]">{createdOrder.id.slice(-6).toUpperCase()}</span>
            </p>
          </div>

          <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] space-y-3 text-left">
            <div className="text-sm text-[#374151]">
              <span className="font-semibold">Penerima:</span> {createdOrder.name} ({createdOrder.phone})
            </div>
            <div className="text-sm text-[#374151]">
              <span className="font-semibold">Total Tagihan:</span> {formatIDR(displayTotal)}
            </div>
            <div className="pt-2 border-t border-[#E5E7EB]">
              <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                Tautan Invoice Publik:
              </label>
              <div className="flex items-center gap-2 bg-white border border-[#D1D5DB] rounded-lg p-2 text-xs font-mono text-[#374151] break-all">
                {window.location.origin}/invoice/{createdOrder.token}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button onClick={handleCopyLink} variant="outlined" className="w-full sm:w-auto">
              <Copy className="w-4 h-4 mr-2" />
              {copied ? "Tersalin!" : "Salin Link"}
            </Button>
            <Button onClick={handleShareWA} variant="primary" className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20BA5A] border-none text-white">
              Kirim ke WhatsApp
            </Button>
            <Link to={invoiceUrl} target="_blank" className="w-full sm:w-auto">
              <Button variant="outlined" className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Lihat Invoice
              </Button>
            </Link>
          </div>

          <div className="pt-4 border-t border-[#E5E7EB]">
            <Button
              onClick={() => {
                setCreatedOrder(null);
                setInstitutionName("");
                setRecipientName("");
                setRecipientPhone("");
                setRecipientNotes("");
                setEventDate("");
                setDeliveryAddress("");
                setDeliveryTime("");
                setFoodDetails("");
                setDrinkDetails("");
                setAdditionalNotes("");
                setSelectedItems([]);
                setTotalPriceOverride(null);
                setAdditionalFee(0);
              }}
              variant="outlined"
              className="text-xs"
            >
              Buat Pesanan Lain
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-3">
        <Link to="/admin/orders" className="text-[#6B7280] hover:text-[#111827] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Input Pesanan Baru
          </h1>
          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk']">
            Admin mendaftarkan pesanan baru secara manual untuk instansi/pelanggan.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Inputs (Left & Middle Columns) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
              Informasi Pelanggan & Acara
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Jenis Pesanan
                </label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
                    <input
                      type="radio"
                      name="orderType"
                      value="event"
                      checked={orderType === "event"}
                      onChange={() => setOrderType("event")}
                      className="accent-[#FBBF24] w-4 h-4"
                    />
                    Event (Jatuh tempo 7 hari)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
                    <input
                      type="radio"
                      name="orderType"
                      value="rutin"
                      checked={orderType === "rutin"}
                      onChange={() => setOrderType("rutin")}
                      className="accent-[#FBBF24] w-4 h-4"
                    />
                    Rutin (Jatuh tempo 1 bulan)
                  </label>
                </div>
              </div>

              <Input
                label="Nama Instansi/Pelanggan"
                required
                placeholder="e.g. Yayasan Pesantren Al-Mana"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Nama Penerima"
                required
                placeholder="e.g. Ustadz Ahmad"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
              <Input
                label="Nomor Telepon Penerima"
                required
                placeholder="e.g. 08123456789"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
              />
              <Input
                label="Tanggal Acara"
                required
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Alamat Pengiriman"
                required
                placeholder="e.g. Kampus 2 Pesantren Al-Mana, Sukabumi"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
              <Input
                label="Waktu Pengantaran / Jam Acara"
                required
                placeholder="e.g. 10:00 WIB atau Makan Siang"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Catatan Lokasi / Penerima (Opsional)
                </label>
                <textarea
                  placeholder="e.g. Gedung A Lantai 2, hubungi via WA jika sudah di gerbang"
                  rows={2}
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
                  value={recipientNotes}
                  onChange={(e) => setRecipientNotes(e.target.value)}
                />
              </div>
            </div>
          </Card>

          {/* Menu Items Selector */}
          <Card className="p-6 space-y-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
                Detail Menu Makanan & Minuman
              </h3>
              <div className="w-48 sm:w-64">
                <input
                  type="text"
                  placeholder="Cari menu..."
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {loadingMenu ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#FBBF24]" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-1 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                {filteredMenu.map((item) => {
                  const finalPrice = Math.round(item.price * (1 - (item.discountPercent || 0) / 100));
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleAddItem(item)}
                      className="p-3 bg-white hover:bg-[#FFFDF5] border border-[#E5E7EB] hover:border-[#FDE047] rounded-xl cursor-pointer transition-all duration-200 shadow-sm flex flex-col justify-between space-y-2 group"
                    >
                      <div>
                        <div className="text-xs font-bold text-[#111827] group-hover:text-[#D97706] truncate">
                          {item.itemName}
                        </div>
                        <div className="text-[10px] text-[#6B7280]">
                          Stok: {item.quantity} {item.unit}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-[#F3F4F6]">
                        <span className="text-[11px] font-semibold text-[#111827]">
                          {formatIDR(finalPrice)}
                        </span>
                        <div className="w-5 h-5 rounded-full bg-[#FFFBEB] group-hover:bg-[#FCD34D] flex items-center justify-center text-[#B45309] group-hover:text-white transition-colors duration-200">
                          <Plus className="w-3 h-3 stroke-[3]" />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredMenu.length === 0 && (
                  <div className="col-span-full py-8 text-center text-xs text-[#6B7280]">
                    Menu tidak ditemukan.
                  </div>
                )}
              </div>
            )}

            {/* Selected Items List */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#374151]">
                Item Terpilih ({selectedItems.length})
              </label>

              <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-xl overflow-hidden bg-white">
                {selectedItems.map((s) => (
                  <div key={s.itemId} className="p-3 flex items-center justify-between text-sm gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#111827] truncate">{s.itemName}</div>
                      <div className="text-xs text-[#6B7280]">{formatIDR(s.price)} / {s.unit}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-[#D1D5DB] rounded-lg overflow-hidden h-8">
                        <button
                          type="button"
                          className="px-2 hover:bg-[#F9FAFB] text-[#374151] h-full"
                          onClick={() => handleQtyChange(s.itemId, s.quantity - 1)}
                        >
                          -
                        </button>
                        <input title="Jumlah Porsi" placeholder="Qty" aria-label="Jumlah Porsi"
                          type="number"
                          value={s.quantity}
                          min={1}
                          onChange={(e) => handleQtyChange(s.itemId, parseInt(e.target.value, 10) || 1)}
                          className="w-12 text-center text-xs border-x border-[#D1D5DB] h-full focus:outline-none"
                        />
                        <button
                          type="button"
                          className="px-2 hover:bg-[#F9FAFB] text-[#374151] h-full"
                          onClick={() => handleQtyChange(s.itemId, s.quantity + 1)}
                        >
                          +
                        </button>
                      </div>

                      <div className="w-20 text-right font-semibold text-[#111827]">
                        {formatIDR(s.price * s.quantity)}
                      </div>

                      <button title="Hapus Menu" aria-label="Hapus Menu"
                        type="button"
                        onClick={() => handleRemoveItem(s.itemId)}
                        className="text-[#EF4444] hover:text-[#DC2626] p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {selectedItems.length === 0 && (
                  <div className="p-6 text-center text-xs text-[#6B7280] flex flex-col items-center justify-center gap-2">
                    <ShoppingBag className="w-8 h-8 text-[#D1D5DB]" />
                    Belum ada menu terpilih. Klik menu di atas untuk menambahkan.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar Summary & Submit (Right Column) */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm sticky top-6">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] border-b border-[#F3F4F6] pb-3">
              Ringkasan Pembayaran
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                  Detail Makanan (Deskripsi tambahan)
                </label>
                <textarea
                  placeholder="e.g. Nasi Kotak Ayam Bakar sambal pisah"
                  rows={2}
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none"
                  value={foodDetails}
                  onChange={(e) => setFoodDetails(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                  Detail Minuman (Deskripsi tambahan)
                </label>
                <textarea
                  placeholder="e.g. Air Mineral botol 330ml dingin"
                  rows={2}
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none"
                  value={drinkDetails}
                  onChange={(e) => setDrinkDetails(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                  Catatan Tambahan Internal
                </label>
                <textarea
                  placeholder="e.g. Tagihan dikirim ke bendahara yayasan langsung"
                  rows={2}
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none"
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#F3F4F6] space-y-2">
              <div className="flex justify-between text-xs text-[#6B7280]">
                <span>Total Kalkulasi Menu:</span>
                <span>{formatIDR(autoCalculatedTotal)}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-1">
                  Biaya Tambahan (Ongkir, Charge, dll.)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none"
                  value={additionalFee === 0 ? "" : additionalFee}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAdditionalFee(val === "" ? 0 : Number(val));
                  }}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#6B7280]">
                    Total Harga Override (Manual)
                  </label>
                  {totalPriceOverride !== null && (
                    <button
                      type="button"
                      className="text-[10px] text-[#EF4444] hover:underline"
                      onClick={() => setTotalPriceOverride(null)}
                    >
                      Batal Override
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  placeholder="e.g. 500000 (jika kosong pakai total menu)"
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none"
                  value={totalPriceOverride === null ? "" : totalPriceOverride}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTotalPriceOverride(val === "" ? null : Number(val));
                  }}
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-[#E5E7EB]">
                <span className="text-sm font-bold text-[#111827]">Total Tagihan:</span>
                <span className="text-lg font-extrabold text-[#D97706]">{formatIDR(displayTotal)}</span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-xl font-bold shadow-md shadow-amber-700/10 flex items-center justify-center gap-2"
              loading={submitting}
            >
              {submitting ? "Membuat..." : "Buat Pesanan & Invoice"}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}

export default OrderInputPage;
