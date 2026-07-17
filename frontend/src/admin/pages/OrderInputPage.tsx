import React, { useState, useEffect } from "react";
import { Plus, Trash2, Copy, ExternalLink, Check, ShoppingBag, ArrowLeft, Loader2 } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/contexts/ToastContext";
import { listAllItems } from "@/services/stockAdminService";
import { createAdminOrder, updateAdminOrder, getOrder } from "@/services/orderService";
import type { InventoryItem } from "@/types/inventory";
import type { OrderLineItem, OrderType } from "@/types/order";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatIDR } from "@/lib/format";

const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = 1; h < 24; h++) {
    const hStr = h.toString().padStart(2, "0");
    for (let m = 0; m < 60; m += 15) {
      opts.push(`${hStr}:${m.toString().padStart(2, "0")}`);
    }
  }
  opts.push("23:59");
  return opts;
})();

interface SelectedItem extends OrderLineItem {
  price: number;
  unit: string;
}

interface OrderTemplate {
  id: string;
  templateName: string;
  orderType: OrderType;
  isPreOrder: boolean;
  institutionName: string;
  recipientName: string;
  recipientPhone: string;
  recipientNotes: string;
  deliveryAddress: string;
  deliveryTime: string;
  foodDetails: string;
  drinkDetails: string;
  additionalNotes: string;
  items: SelectedItem[];
  additionalFee: number;
  customerName?: string;
}

export function OrderInputPage() {
  const { showToast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Template States
  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [newTemplateName, setNewTemplateName] = useState<string>("");

  // Load templates on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("admin_order_templates");
      if (stored) {
        setTemplates(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load templates", e);
    }
  }, []);

  // Save as template
  const handleSaveAsTemplate = () => {
    if (!newTemplateName.trim()) {
      showToast({ message: "Silakan isi nama template terlebih dahulu", variant: "error" });
      return;
    }
    const template: OrderTemplate = {
      id: Date.now().toString(),
      templateName: newTemplateName.trim(),
      orderType,
      isPreOrder,
      institutionName,
      recipientName: recipientNames.length > 0 ? recipientNames.join(", ") : customerName.trim(),
      recipientPhone,
      recipientNotes,
      deliveryAddress,
      deliveryTime,
      foodDetails,
      drinkDetails,
      additionalNotes,
      items: selectedItems,
      additionalFee,
      customerName: customerName.trim(),
    };
    const updated = [...templates, template];
    setTemplates(updated);
    localStorage.setItem("admin_order_templates", JSON.stringify(updated));
    setActiveTemplateId(template.id);
    setNewTemplateName("");
    showToast({ message: `Template "${template.templateName}" berhasil disimpan!`, variant: "success" });
  };

  // Apply template
  const handleApplyTemplate = (id: string) => {
    setActiveTemplateId(id);
    if (!id) {
      return;
    }
    const template = templates.find((t) => t.id === id);
    if (!template) return;

    setOrderType(template.orderType);
    setIsPreOrder(template.isPreOrder);
    setInstitutionName(template.institutionName || "");
    setCustomerName(template.customerName || template.recipientName || "");
    setRecipientNames(template.customerName ? (template.recipientName || "").split(", ").filter(Boolean) : []);
    setRecipientPhone(template.recipientPhone || "");
    setRecipientNotes(template.recipientNotes || "");
    setDeliveryAddress(template.deliveryAddress || "");
    setDeliveryTime(template.deliveryTime || "");
    if (template.deliveryTime && template.deliveryTime.includes("T")) {
      const parts = template.deliveryTime.split("T");
      setDeliveryDateOnly(parts[0]);
      setDeliveryTimeOnly(parts[1]);
    } else {
      setDeliveryDateOnly("");
      setDeliveryTimeOnly("12:00");
    }
    setFoodDetails(template.foodDetails || "");
    setDrinkDetails(template.drinkDetails || "");
    setAdditionalNotes(template.additionalNotes || "");
    setSelectedItems(template.items || []);
    setAdditionalFee(template.additionalFee || 0);

    showToast({ message: `Template "${template.templateName}" berhasil diterapkan!`, variant: "success" });
  };

  // Delete template
  const handleDeleteTemplate = () => {
    if (!activeTemplateId) return;
    const templateName = templates.find((t) => t.id === activeTemplateId)?.templateName;
    const updated = templates.filter((t) => t.id !== activeTemplateId);
    setTemplates(updated);
    localStorage.setItem("admin_order_templates", JSON.stringify(updated));
    setActiveTemplateId("");
    showToast({ message: `Template "${templateName}" berhasil dihapus`, variant: "info" });
  };

  // Form Fields
  const [orderType, setOrderType] = useState<OrderType>("event");
  const [isPreOrder, setIsPreOrder] = useState(false);
  const [institutionName, setInstitutionName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [recipientNames, setRecipientNames] = useState<string[]>([]);
  const [newRecipientName, setNewRecipientName] = useState("");

  const handleAddRecipient = () => {
    const name = newRecipientName.trim();
    if (name && !recipientNames.includes(name)) {
      setRecipientNames([...recipientNames, name]);
      setNewRecipientName("");
    }
  };

  const handleRemoveRecipient = (index: number) => {
    setRecipientNames(recipientNames.filter((_, i) => i !== index));
  };

  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientNotes, setRecipientNotes] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");

  // Split states for Jam Pemberangkatan (eventDate: YYYY-MM-DDTHH:MM)
  const [eventDateOnly, setEventDateOnly] = useState("");
  const [eventTimeOnly, setEventTimeOnly] = useState("08:00");

  // Split states for Harus Sampai (deliveryTime: YYYY-MM-DDTHH:MM)
  const [deliveryDateOnly, setDeliveryDateOnly] = useState("");
  const [deliveryTimeOnly, setDeliveryTimeOnly] = useState("12:00");

  // Sync with main state
  useEffect(() => {
    if (eventDateOnly) {
      setEventDate(`${eventDateOnly}T${eventTimeOnly}`);
    } else {
      setEventDate("");
    }
  }, [eventDateOnly, eventTimeOnly]);

  useEffect(() => {
    if (deliveryDateOnly) {
      setDeliveryTime(`${deliveryDateOnly}T${deliveryTimeOnly}`);
    } else {
      setDeliveryTime("");
    }
  }, [deliveryDateOnly, deliveryTimeOnly]);
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

  // Manual Custom Item States
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemPrice, setManualItemPrice] = useState("");
  const [manualItemQty, setManualItemQty] = useState(1);
  const [manualItemUnit, setManualItemUnit] = useState("Porsi");

  const handleAddManualItem = () => {
    if (!manualItemName.trim()) {
      showToast({ message: "Nama menu kustom tidak boleh kosong", variant: "error" });
      return;
    }
    const price = Number(manualItemPrice) || 0;
    if (price <= 0) {
      showToast({ message: "Harga menu kustom harus lebih dari 0", variant: "error" });
      return;
    }
    const qty = manualItemQty || 1;

    const newItem: SelectedItem = {
      itemId: `manual_${Date.now()}`,
      itemName: manualItemName.trim(),
      quantity: qty,
      price: price,
      unit: manualItemUnit.trim() || "Porsi",
    };

    setSelectedItems([...selectedItems, newItem]);
    showToast({ message: `Menu kustom "${newItem.itemName}" ditambahkan`, variant: "success" });

    // Reset manual fields
    setManualItemName("");
    setManualItemPrice("");
    setManualItemQty(1);
    setManualItemUnit("Porsi");
  };

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

  useEffect(() => {
    if (!isEditMode || loadingMenu) return;
    
    async function loadOrder() {
      setLoadingOrder(true);
      try {
        const orderData = await getOrder(id!);
        
        setOrderType(orderData.orderType);
        setIsPreOrder(!!orderData.isPreOrder);
        setInstitutionName(orderData.institutionName || "");
        setCustomerName(orderData.customerName || orderData.recipientName || "");
        
        if (orderData.customerName) {
          setRecipientNames((orderData.recipientName || "").split(", ").filter(Boolean));
        } else {
          setRecipientNames([]);
        }
        
        setRecipientPhone(orderData.recipientPhone || "");
        setRecipientNotes(orderData.recipientNotes || "");
        setDeliveryAddress(orderData.deliveryAddress || "");
        
        if (orderData.eventDate && orderData.eventDate.includes("T")) {
          const parts = orderData.eventDate.split("T");
          setEventDateOnly(parts[0]);
          setEventTimeOnly(parts[1]);
        } else {
          setEventDateOnly(orderData.eventDate || "");
          setEventTimeOnly("08:00");
        }

        if (orderData.deliveryTime && orderData.deliveryTime.includes("T")) {
          const parts = orderData.deliveryTime.split("T");
          setDeliveryDateOnly(parts[0]);
          setDeliveryTimeOnly(parts[1]);
        } else {
          setDeliveryDateOnly("");
          setDeliveryTimeOnly(orderData.deliveryTime || "12:00");
        }

        setFoodDetails(orderData.foodDetails || "");
        setDrinkDetails(orderData.drinkDetails || "");
        setAdditionalNotes(orderData.additionalNotes || "");
        setAdditionalFee(orderData.additionalFee || 0);

        const mappedItems: SelectedItem[] = orderData.items.map((it) => {
          const match = menuItems.find(m => m.id === it.itemId);
          const price = it.price !== undefined ? it.price : (match ? Math.round(match.price * (1 - (match.discountPercent || 0) / 100)) : 0);
          const unit = it.unit !== undefined ? it.unit : (match ? match.unit : "Porsi");
          return {
            ...it,
            price,
            unit,
          };
        });

        setSelectedItems(mappedItems);

        const calculatedSum = orderData.isPreOrder ? 0 : mappedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
        const netTotal = orderData.totalPrice - (orderData.additionalFee || 0);
        if (calculatedSum !== netTotal && !orderData.isPreOrder) {
          setTotalPriceOverride(netTotal);
        } else {
          setTotalPriceOverride(null);
        }

      } catch (err) {
        console.error("Failed to load order details for editing", err);
        showToast({ message: "Gagal memuat detail pesanan untuk diedit", variant: "error" });
      } finally {
        setLoadingOrder(false);
      }
    }

    loadOrder();
  }, [id, isEditMode, loadingMenu, menuItems, showToast]);

  // Calculate prices
  const autoCalculatedTotal = isPreOrder ? 0 : selectedItems.reduce((acc, item) => {
    return acc + item.price * item.quantity;
  }, 0);

  const displayTotal = (totalPriceOverride !== null ? totalPriceOverride : autoCalculatedTotal) + additionalFee;

  const handleAddItem = (item: InventoryItem) => {
    const existing = selectedItems.find((s) => s.itemId === item.id);
    const finalItemPrice = Math.round(item.price * (1 - (item.discountPercent || 0) / 100));
    
    if (existing) {
      if (isPreOrder) {
        showToast({ message: `${item.itemName} sudah ditambahkan`, variant: "error" });
        return;
      }
      if (existing.quantity >= item.quantity) {
        showToast({ message: `Peringatan: Jumlah melebihi stok yang tersedia (${item.quantity})`, variant: "info" });
      }
      setSelectedItems(
        selectedItems.map((s) =>
          s.itemId === item.id ? { ...s, quantity: s.quantity + 1 } : s
        )
      );
    } else {
      if (!isPreOrder && item.quantity < 1) {
        showToast({ message: `Peringatan: Stok produk kosong (${item.itemName})`, variant: "info" });
      }
      setSelectedItems([
        ...selectedItems,
        {
          itemId: item.id,
          itemName: item.itemName,
          quantity: isPreOrder ? 0 : 1,
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
    if (isPreOrder) return;
    const menuItem = menuItems.find((m) => m.id === itemId);
    if (menuItem && qty > menuItem.quantity) {
      showToast({ message: `Peringatan: Jumlah melebihi stok yang tersedia (${menuItem.quantity})`, variant: "info" });
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
      const orderPayload = {
        orderType,
        isPreOrder,
        institutionName: institutionName.trim(),
        recipientName: recipientNames.length > 0 ? recipientNames.join(", ") : customerName.trim(),
        recipientPhone: recipientPhone.trim(),
        recipientNotes: recipientNotes.trim(),
        eventDate,
        deliveryAddress: deliveryAddress.trim(),
        deliveryTime: deliveryTime.trim(),
        foodDetails: foodDetails.trim() || selectedItems.map(s => `${s.itemName}${isPreOrder ? " (Pra-pesanan)" : ` (${s.quantity} ${s.unit})`}`).join(", "),
        drinkDetails: drinkDetails.trim(),
        items: selectedItems.map((s) => ({
          itemId: s.itemId,
          itemName: s.itemName,
          quantity: s.quantity,
          price: s.price,
          unit: s.unit,
        })),
        totalPrice: displayTotal,
        additionalFee,
        additionalNotes: additionalNotes.trim(),
        customerName: customerName.trim(),
      };

      const order = isEditMode
        ? await updateAdminOrder(id!, orderPayload)
        : await createAdminOrder(orderPayload);

      if (order.stockWarnings && order.stockWarnings.length > 0) {
        showToast({ message: isEditMode ? "Pesanan berhasil diperbarui, namun beberapa item melebihi stok!" : "Pesanan berhasil dibuat, namun beberapa item melebihi stok!", variant: "info" });
      } else {
        showToast({ message: isEditMode ? "Pesanan berhasil diperbarui!" : "Pesanan berhasil dibuat!", variant: "success" });
      }

      setCreatedOrder({
        id: order.id,
        token: order.invoiceToken || "",
        phone: order.recipientPhone,
        name: order.recipientName,
      });
    } catch (err) {
      console.error(err);
      showToast({
        message: err instanceof Error ? err.message : (isEditMode ? "Gagal memperbarui pesanan" : "Gagal membuat pesanan"),
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
    const cleanPhone = createdOrder.phone.replace(/\D/g, "");
    const whatsappNumber = cleanPhone.startsWith("0")
      ? "62" + cleanPhone.slice(1)
      : cleanPhone.startsWith("8")
        ? "62" + cleanPhone
        : cleanPhone;
    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  // Filter menu items by search query
  const filteredMenu = menuItems.filter((item) =>
    item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loadingOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6]">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#D97706] mx-auto" />
          <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk']">Memuat Data Pesanan...</p>
        </div>
      </div>
    );
  }

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
              {isEditMode ? "Pesanan Berhasil Diperbarui" : "Pesanan Berhasil Dibuat"}
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
            {isEditMode ? (
              <Button
                onClick={() => navigate("/admin/orders")}
                variant="primary"
                className="text-xs"
              >
                Kembali ke Daftar Pesanan
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setCreatedOrder(null);
                  setIsPreOrder(false);
                  setInstitutionName("");
                  setCustomerName("");
                  setRecipientNames([]);
                  setNewRecipientName("");
                  setRecipientPhone("");
                  setRecipientNotes("");
                  setEventDate("");
                  setEventDateOnly("");
                  setEventTimeOnly("08:00");
                  setDeliveryAddress("");
                  setDeliveryTime("");
                  setDeliveryDateOnly("");
                  setDeliveryTimeOnly("12:00");
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
            )}
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
            {isEditMode ? "Edit Rincian Pesanan" : "Input Pesanan Baru"}
          </h1>
          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk']">
            {isEditMode ? "Admin memperbarui data pesanan instansi/pelanggan." : "Admin mendaftarkan pesanan baru secara manual untuk instansi/pelanggan."}
          </p>
        </div>
      </div>

      {/* Template Manager */}
      {!isEditMode && (
        <Card className="p-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="space-y-1">
            <h4 className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-[#111827]">
              Template Pesanan Admin
            </h4>
            <p className="text-[11px] text-[#6B7280]">
              Pilih template untuk mengisi form otomatis, atau simpan inputan saat ini sebagai template.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <select
              value={activeTemplateId}
              onChange={(e) => handleApplyTemplate(e.target.value)}
              title="Pilih Template Pesanan"
              aria-label="Pilih Template Pesanan"
              className="flex-1 md:flex-initial rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none cursor-pointer"
            >
              <option value="">-- Pilih Template --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.templateName}</option>
              ))}
            </select>
            {activeTemplateId && (
              <Button
                type="button"
                variant="outlined"
                onClick={handleDeleteTemplate}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 text-xs px-3 py-1.5"
              >
                Hapus
              </Button>
            )}
            <div className="flex items-center gap-1.5 w-full md:w-auto mt-2 md:mt-0">
              <input
                type="text"
                placeholder="Nama template baru..."
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="flex-1 md:w-48 rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs text-[#111827] focus:border-[#FBBF24] focus:outline-none"
              />
              <Button
                type="button"
                variant="outlined"
                onClick={handleSaveAsTemplate}
                className="text-xs px-3 py-1.5 border-amber-300 text-[#B45309] hover:bg-amber-50"
              >
                Simpan Template
              </Button>
            </div>
          </div>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Inputs (Left & Middle Columns) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
              Informasi Pelanggan & Acara
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    Event
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
                    Rutin
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Metode Pemesanan
                </label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPreOrder}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsPreOrder(checked);
                        setSelectedItems(prev => prev.map(item => ({
                          ...item,
                          quantity: checked ? 0 : 1
                        })));
                      }}
                      className="accent-[#FBBF24] w-4 h-4 rounded animate-none focus:ring-0 focus:outline-none"
                    />
                    Pra-pesanan
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
                label="Nama Pemesan"
                required
                placeholder="e.g. Ustadz Ahmad"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Input
                label="Nomor Telepon Pemesan"
                required
                placeholder="e.g. 08123456789"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
              />
              
              {/* Jam Pemberangkatan */}
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Jam Pemberangkatan
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    title="Tanggal Pemberangkatan"
                    className="flex-1 bg-[#F9FAFB] border border-[#D1D5DB] rounded-lg px-3 py-2.5 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
                    value={eventDateOnly}
                    onChange={(e) => setEventDateOnly(e.target.value)}
                  />
                  <select
                    title="Waktu Pemberangkatan"
                    className="bg-[#F9FAFB] border border-[#D1D5DB] rounded-lg px-3 py-2.5 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40 cursor-pointer"
                    value={eventTimeOnly}
                    onChange={(e) => setEventTimeOnly(e.target.value)}
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Harus Sampai */}
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Harus Sampai
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    required
                    title="Tanggal Harus Sampai"
                    className="flex-1 bg-[#F9FAFB] border border-[#D1D5DB] rounded-lg px-3 py-2.5 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
                    value={deliveryDateOnly}
                    onChange={(e) => setDeliveryDateOnly(e.target.value)}
                  />
                  <select
                    title="Waktu Harus Sampai"
                    className="bg-[#F9FAFB] border border-[#D1D5DB] rounded-lg px-3 py-2.5 text-sm text-[#111827] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40 cursor-pointer"
                    value={deliveryTimeOnly}
                    onChange={(e) => setDeliveryTimeOnly(e.target.value)}
                  >
                    {TIME_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#374151] mb-1">
                Nama Penerima
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRecipientName}
                  onChange={(e) => setNewRecipientName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddRecipient();
                    }
                  }}
                  placeholder="e.g. Ustadz Ahmad / Nama Penerima Lainnya"
                  className="flex-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl px-4 py-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
                <button
                  type="button"
                  onClick={handleAddRecipient}
                  className="px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#111827] font-bold text-xs rounded-2xl transition-colors cursor-pointer"
                >
                  Tambah
                </button>
              </div>
              {recipientNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-2.5">
                  {recipientNames.map((name, index) => (
                    <span key={index} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                      {name}
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(index)}
                        className="text-amber-500 hover:text-amber-700 font-bold ml-1 focus:outline-none"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Input
                label="Alamat Pengiriman"
                required
                placeholder="e.g. Kampus 2 Pesantren Al-Mana, Sukabumi"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Keterangan Tambahan (Opsional)
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

            {/* Form Menu Kustom (Manual) */}
            <div className="bg-[#FAF5FF] border border-[#E9D5FF] rounded-xl p-4 space-y-3">
              <h4 className="font-['Manrope',system-ui,sans-serif] text-xs font-extrabold text-[#7C3AED] flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Tambah Menu Kustom (Luar Katalog)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div>
                  <input
                    type="text"
                    placeholder="Nama Menu..."
                    className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs text-[#111827] focus:border-[#7C3AED] focus:outline-none"
                    value={manualItemName}
                    onChange={(e) => setManualItemName(e.target.value)}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Harga (Rp)..."
                    className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs text-[#111827] focus:border-[#7C3AED] focus:outline-none"
                    value={manualItemPrice}
                    onChange={(e) => setManualItemPrice(e.target.value)}
                  />
                </div>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="Qty"
                    className="w-20 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs text-[#111827] focus:border-[#7C3AED] focus:outline-none"
                    value={manualItemQty}
                    onChange={(e) => setManualItemQty(parseInt(e.target.value, 10) || 1)}
                    min={1}
                  />
                  <input
                    type="text"
                    placeholder="Satuan (Porsi/Pcs)"
                    className="flex-1 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs text-[#111827] focus:border-[#7C3AED] focus:outline-none"
                    value={manualItemUnit}
                    onChange={(e) => setManualItemUnit(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleAddManualItem}
                  className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white border-none text-xs h-9 px-3 py-2 rounded-lg flex items-center justify-center font-bold cursor-pointer"
                >
                  Tambah Kustom
                </Button>
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
                      {isPreOrder ? (
                        <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-lg">
                          Pra-pesanan
                        </span>
                      ) : (
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
                      )}

                      <div className="w-20 text-right font-semibold text-[#111827]">
                        {isPreOrder ? "—" : formatIDR(s.price * s.quantity)}
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
                  Deskripsi request menu diluar katalog
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
              {submitting ? (isEditMode ? "Memperbarui..." : "Membuat...") : (isEditMode ? "Simpan Perubahan" : "Buat Pesanan & Invoice")}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}

export default OrderInputPage;
