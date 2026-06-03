import { useState, useEffect } from "react";
import { Calendar, Plus, Trash2, Check, X, Loader2, ClipboardList, Info } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { listAllItems } from "@/services/stockAdminService";
import type { InventoryItem } from "@/types/inventory";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

interface ScheduledItem {
  itemId: string;
  itemName: string;
  capacity: number;
  ingredients: string;
}

interface DailySchedule {
  date: string;
  menuItems: ScheduledItem[];
  updatedAt: string;
  updatedBy: string;
}

export function FoodSchedulePage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const isEditor = profile?.role === "tim_produksi" || profile?.role === "admin";

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [menuItems, setMenuItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit fields
  const [editMode, setEditMode] = useState(false);
  const [selectedMenuItems, setSelectedMenuItems] = useState<ScheduledItem[]>([]);

  // Add Item Temp state
  const [tempItemId, setTempItemId] = useState("");
  const [tempCapacity, setTempCapacity] = useState<number>(50);
  const [tempIngredients, setTempIngredients] = useState("");

  // Load schedule and inventory items
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const inventory = await listAllItems();
        setMenuItems(inventory);

        // Fetch schedule from Firestore
        const docRef = doc(db, "food_schedules", selectedDate);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as DailySchedule;
          setSchedule(data);
          setSelectedMenuItems(data.menuItems || []);
        } else {
          setSchedule(null);
          setSelectedMenuItems([]);
        }
      } catch (err) {
        console.error(err);
        showToast({ message: "Gagal memuat jadwal makanan", variant: "error" });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedDate, showToast]);

  const handleAddItemToSchedule = () => {
    if (!tempItemId) {
      showToast({ message: "Silakan pilih menu item", variant: "error" });
      return;
    }
    const menuItem = menuItems.find((m) => m.id === tempItemId);
    if (!menuItem) return;

    // Check if already in list
    if (selectedMenuItems.some((s) => s.itemId === tempItemId)) {
      showToast({ message: "Menu sudah dijadwalkan untuk hari ini", variant: "error" });
      return;
    }

    setSelectedMenuItems([
      ...selectedMenuItems,
      {
        itemId: tempItemId,
        itemName: menuItem.itemName,
        capacity: tempCapacity,
        ingredients: tempIngredients.trim(),
      },
    ]);

    // Reset temp inputs
    setTempItemId("");
    setTempCapacity(50);
    setTempIngredients("");
    showToast({ message: "Menu ditambahkan ke jadwal harian", variant: "success" });
  };

  const handleRemoveItemFromSchedule = (itemId: string) => {
    setSelectedMenuItems(selectedMenuItems.filter((s) => s.itemId !== itemId));
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, "food_schedules", selectedDate);
      const payload: DailySchedule = {
        date: selectedDate,
        menuItems: selectedMenuItems,
        updatedAt: new Date().toISOString(),
        updatedBy: profile?.displayName || profile?.email || "System",
      };

      await setDoc(docRef, payload);
      setSchedule(payload);
      setEditMode(false);
      showToast({ message: "Jadwal makanan berhasil disimpan", variant: "success" });
    } catch (err) {
      console.error(err);
      showToast({ message: "Gagal menyimpan jadwal makanan", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-6 rounded-2xl border border-[#E5E7EB] shadow-xs">
        <div>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-[#111827]">
            Jadwal Makanan Harian
          </h1>
          <p className="text-xs text-[#6B7280] font-['Hanken_Grotesk'] mt-1">
            Kelola menu masakan harian, kapasitas produksi porsi, dan detail bahan dapur.
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#6B7280]" />
          <input
            type="date"
            className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm font-semibold text-[#374151] focus:border-[#FBBF24] focus:outline-none"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setEditMode(false);
            }}
            aria-label="Pilih Tanggal Jadwal"
          />
        </div>
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#D97706] mx-auto mb-2" />
          <p className="text-sm text-[#6B7280]">Memuat jadwal makanan...</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Schedule list (Main view) */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#F3F4F6] pb-3">
                <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-[#D97706]" />
                  Menu Terjadwal: {new Date(selectedDate).toLocaleDateString("id-ID", { dateStyle: "long" })}
                </h3>

                {isEditor && !editMode && (
                  <Button
                    variant="primary"
                    onClick={() => setEditMode(true)}
                    className="bg-[#D97706] hover:bg-[#B45309] text-white border-none py-1.5 h-8 rounded-lg text-xs"
                  >
                    Kustomisasi Jadwal
                  </Button>
                )}
              </div>

              {editMode ? (
                // EDIT MODE
                <div className="space-y-6">
                  {/* Add item sub-form */}
                  <div className="bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB] space-y-3">
                    <h4 className="text-xs font-bold text-[#374151] uppercase tracking-wide">Tambah Menu ke Jadwal</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-[#6B7280] uppercase mb-1">Pilih Menu</label>
                        <select
                          className="w-full rounded-lg border border-[#D1D5DB] bg-white px-2 py-1.5 text-xs text-[#111827] focus:outline-none"
                          value={tempItemId}
                          onChange={(e) => setTempItemId(e.target.value)}
                          aria-label="Pilih Menu"
                        >
                          <option value="">-- Pilih Menu --</option>
                          {menuItems.map((m) => (
                            <option key={m.id} value={m.id}>{m.itemName} ({m.category})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-[#6B7280] uppercase mb-1">Kapasitas Porsi</label>
                        <Input
                          type="number"
                          placeholder="e.g. 50"
                          value={String(tempCapacity)}
                          onChange={(e) => setTempCapacity(Number(e.target.value) || 0)}
                          className="h-8 py-1 px-2 text-xs"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outlined"
                          onClick={handleAddItemToSchedule}
                          className="w-full h-8 text-xs border border-[#D97706] hover:bg-[#FFFBEB] text-[#B45309]"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Tambah Menu
                        </Button>
                      </div>

                      <div className="col-span-full">
                        <label className="block text-[10px] font-bold text-[#6B7280] uppercase mb-1">Bahan Baku Utama / Catatan Dapur (Opsional)</label>
                        <input title="Bahan Baku Utama atau Catatan Dapur" aria-label="Bahan Baku Utama atau Catatan Dapur"
                          type="text"
                          placeholder="e.g. Ayam Broiler 10kg, Beras Ramos 5kg, Bumbu Halus Kuning"
                          className="w-full rounded-lg border border-[#D1D5DB] px-3 py-1.5 text-xs text-[#111827] focus:outline-none"
                          value={tempIngredients}
                          onChange={(e) => setTempIngredients(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Scheduled items table editable */}
                  <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-xl overflow-hidden bg-white">
                    {selectedMenuItems.map((s) => (
                      <div key={s.itemId} className="p-3 flex items-center justify-between text-sm gap-3 hover:bg-neutral-50/50">
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-[#111827] block truncate">{s.itemName}</span>
                          <span className="text-xs text-[#6B7280] block truncate">
                            <span className="font-semibold text-amber-700">Bahan:</span> {s.ingredients || "Tidak ada catatan bahan"}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-xs text-[#6B7280] block">Kapasitas</span>
                            <input title="Kapasitas Porsi" placeholder="0" aria-label="Kapasitas Porsi"
                              type="number"
                              className="w-16 border border-[#D1D5DB] rounded-lg px-2 py-0.5 text-xs font-mono font-bold text-center"
                              value={s.capacity}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setSelectedMenuItems(selectedMenuItems.map(x => x.itemId === s.itemId ? { ...x, capacity: val } : x));
                              }}
                            />
                          </div>

                          <button title="Hapus dari Jadwal" aria-label="Hapus dari Jadwal"
                            type="button"
                            onClick={() => handleRemoveItemFromSchedule(s.itemId)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {selectedMenuItems.length === 0 && (
                      <div className="p-8 text-center text-xs text-[#6B7280]">
                        Belum ada menu yang dijadwalkan. Silakan tambah menu di atas.
                      </div>
                    )}
                  </div>

                  {/* Save/Cancel Actions */}
                  <div className="flex gap-3 border-t border-[#F3F4F6] pt-4">
                    <Button
                      onClick={handleSaveSchedule}
                      loading={saving}
                      variant="primary"
                      className="flex-1 bg-[#D97706] hover:bg-[#B45309] text-white border-none rounded-xl"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Simpan Jadwal Harian
                    </Button>
                    <Button
                      onClick={() => {
                        setSelectedMenuItems(schedule?.menuItems || []);
                        setEditMode(false);
                      }}
                      disabled={saving}
                      variant="outlined"
                      className="px-6 rounded-xl hover:bg-neutral-50"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Batal
                    </Button>
                  </div>
                </div>
              ) : (
                // READ MODE
                <div className="space-y-4">
                  <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-xl overflow-hidden bg-white shadow-xs">
                    {selectedMenuItems.map((s) => (
                      <div key={s.itemId} className="p-4 flex items-center justify-between text-sm gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-[#111827] block text-base">{s.itemName}</span>
                          <p className="text-xs text-[#6B7280] mt-1">
                            <span className="font-semibold text-amber-700">Catatan Bahan Baku:</span> {s.ingredients || "-"}
                          </p>
                        </div>
                        <div className="text-right shrink-0 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                          <span className="text-[10px] font-bold text-amber-600 block uppercase tracking-wide">Kapasitas</span>
                          <span className="text-lg font-black text-amber-800 font-mono">{s.capacity} porsi</span>
                        </div>
                      </div>
                    ))}

                    {selectedMenuItems.length === 0 && (
                      <div className="p-12 text-center text-xs text-[#6B7280] space-y-2">
                        <Info className="w-8 h-8 mx-auto text-[#9CA3AF]" />
                        <p>Belum ada menu yang dijadwalkan untuk tanggal ini.</p>
                      </div>
                    )}
                  </div>

                  {schedule && (
                    <div className="text-[11px] text-[#9CA3AF] text-right font-medium">
                      Terakhir diperbarui oleh {schedule.updatedBy} pada {new Date(schedule.updatedAt).toLocaleString("id-ID")}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar calendar list / quick stats */}
          <div className="space-y-6">
            <Card className="p-6 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm space-y-4">
              <h3 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827] border-b border-[#F3F4F6] pb-3">
                Keterangan Produksi
              </h3>
              <div className="text-xs text-[#6B7280] space-y-3 leading-relaxed">
                <p>
                  Jadwal Makanan diisi oleh <strong>Tim Produksi</strong> untuk memberi tahu bagian distribusi, admin, dan monitoring tentang apa yang dimasak hari ini.
                </p>
                <p>
                  Setiap hidangan yang dijadwalkan memiliki kapasitas maksimal porsi yang diproduksi dapur untuk menghindari overload produksi harian.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

export default FoodSchedulePage;
