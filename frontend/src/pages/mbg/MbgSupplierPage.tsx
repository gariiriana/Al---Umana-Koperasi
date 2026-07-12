// ============================================================================
// MBG Supplier Page — Purchasing MBG: Master Data Supplier
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Save,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { MbgSupplier } from '@/types/mbg';
import {
  subscribeSuppliers,
  addSupplier,
  updateSupplier,
  deleteSupplier,
} from '@/services/mbgPurchasingService';
import { MBG_SUPPLIER_CATEGORIES } from '@/constants/mbgConstants';

export function MbgSupplierPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState<MbgSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Drawer / Form State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<MbgSupplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    kategoriBarang: [] as string[],
    isActive: true,
  });

  // Subscribe to suppliers list
  useEffect(() => {
    const unsub = subscribeSuppliers(
      (data) => {
        setSuppliers(data);
        setLoading(false);
      },
      () => {
        showToast({ message: 'Gagal memuat supplier', variant: 'error' });
        setLoading(false);
      }
    );
    return unsub;
  }, [showToast]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phone.includes(searchQuery);
      
      const matchesCategory =
        selectedCategory === 'all' || s.kategoriBarang.includes(selectedCategory);

      return matchesSearch && matchesCategory;
    });
  }, [suppliers, searchQuery, selectedCategory]);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      address: '',
      phone: '',
      kategoriBarang: [],
      isActive: true,
    });
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (s: MbgSupplier) => {
    setEditingSupplier(s);
    setFormData({
      name: s.name,
      address: s.address,
      phone: s.phone,
      kategoriBarang: s.kategoriBarang || [],
      isActive: s.isActive ?? true,
    });
    setIsDrawerOpen(true);
  };

  const handleToggleCategory = (cat: string) => {
    setFormData((prev) => {
      const list = [...prev.kategoriBarang];
      const idx = list.indexOf(cat);
      if (idx > -1) {
        list.splice(idx, 1);
      } else {
        list.push(cat);
      }
      return { ...prev, kategoriBarang: list };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast({ message: 'Nama supplier wajib diisi', variant: 'error' });
      return;
    }
    if (!user) return;

    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: formData.name,
          address: formData.address,
          phone: formData.phone,
          kategoriBarang: formData.kategoriBarang,
          isActive: formData.isActive,
        });
        showToast({ message: 'Supplier berhasil diperbarui', variant: 'success' });
      } else {
        await addSupplier({
          name: formData.name,
          address: formData.address,
          phone: formData.phone,
          kategoriBarang: formData.kategoriBarang,
          isActive: formData.isActive,
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        showToast({ message: 'Supplier berhasil ditambahkan', variant: 'success' });
      }
      setIsDrawerOpen(false);
    } catch {
      showToast({ message: 'Gagal menyimpan data supplier', variant: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus supplier ini?')) return;
    try {
      await deleteSupplier(id);
      showToast({ message: 'Supplier berhasil dihapus', variant: 'success' });
    } catch {
      showToast({ message: 'Gagal menghapus supplier', variant: 'error' });
    }
  };

  return (
    <div className="min-h-screen font-['Hanken_Grotesk',system-ui,sans-serif] p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-[#111827] tracking-tight">
            Master Supplier MBG
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Kelola data pemasok bahan baku untuk katering Makan Bergizi Gratis
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 bg-[#111827] text-white hover:bg-black font-extrabold text-xs px-4 py-3 rounded-xl cursor-pointer transition-all shadow-md active:scale-95"
        >
          <Plus className="h-4 w-4 text-[#FBBF24]" />
          Tambah Supplier
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama, alamat, atau no HP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
          />
        </div>
        <div className="shrink-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            title="Filter Kategori"
            className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all cursor-pointer"
          >
            <option value="all">Semua Kategori</option>
            {MBG_SUPPLIER_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Supplier Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#FBBF24]" />
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center">
          <Tag className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <h3 className="text-lg font-bold text-[#111827]">Belum ada data supplier</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Supplier yang terdaftar akan memudahkan Anda dalam membuat Purchase Order.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.map((s) => (
            <motion.div
              layout
              key={s.id}
              className="bg-white rounded-2xl border border-[#E5E7EB] hover:border-gray-300 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header Card */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-extrabold text-[#111827] text-base leading-tight">
                      {s.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {s.isActive ? (
                        <span className="flex items-center gap-1 text-[10px] font-extrabold text-[#059669] bg-[#D1FAE5] px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aktif
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          <XCircle className="h-3.5 w-3.5" /> Nonaktif
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenEdit(s)}
                      title="Edit Supplier"
                      aria-label="Edit Supplier"
                      className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-[#111827] transition-all cursor-pointer"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      title="Hapus Supplier"
                      aria-label="Hapus Supplier"
                      className="p-2 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2.5 text-xs text-gray-600 mb-5">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span>{s.phone || '-'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{s.address || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Categories */}
              {s.kategoriBarang && s.kategoriBarang.length > 0 && (
                <div className="border-t border-gray-100 pt-3 flex flex-wrap gap-1">
                  {s.kategoriBarang.map((cat) => (
                    <span
                      key={cat}
                      className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Drawer Dialog to Add/Edit */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
            {/* Backdrop click */}
            <div
              className="absolute inset-0"
              onClick={() => setIsDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between"
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-[#E5E7EB] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-[#111827]">
                    {editingSupplier ? 'Ubah Supplier' : 'Tambah Supplier Baru'}
                  </h2>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Masukkan detail informasi pemasok
                  </p>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  title="Tutup"
                  aria-label="Tutup"
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body Form */}
              <form
                onSubmit={handleSubmit}
                className="flex-1 overflow-y-auto p-6 space-y-5"
              >
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Nama Supplier *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Contoh: H. DONAT"
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    No. Handphone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Contoh: 08123456789"
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Alamat
                  </label>
                  <textarea
                    rows={3}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Alamat lengkap supplier..."
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Kategori Barang
                  </label>
                  <p className="text-[10px] text-gray-500 mb-3">
                    Pilih satu atau beberapa kategori komoditas supplier ini
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {MBG_SUPPLIER_CATEGORIES.map((cat) => {
                      const isSelected = formData.kategoriBarang.includes(cat);
                      return (
                        <button
                          type="button"
                          key={cat}
                          onClick={() => handleToggleCategory(cat)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#111827] text-[#FBBF24] border-[#111827]'
                              : 'bg-white text-gray-700 border-[#E5E7EB] hover:border-gray-400'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                              isSelected
                                ? 'bg-[#FBBF24] border-[#FBBF24] text-[#111827]'
                                : 'border-gray-300 bg-white'
                            }`}
                          >
                            {isSelected && '✓'}
                          </div>
                          <span className="truncate">{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-bold text-gray-700">Status Aktif</span>
                    <span className="block text-[10px] text-[#6B7280]">
                      Apakah supplier masih melayani pemesanan?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    title="Toggle Status Aktif"
                    aria-label="Toggle Status Aktif"
                    className={`w-12 h-6 rounded-full p-0.5 transition-all duration-200 cursor-pointer focus:outline-none ${
                      formData.isActive ? 'bg-[#059669]' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-all duration-200 ${
                        formData.isActive ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </form>

              {/* Drawer Footer Actions */}
              <div className="p-6 border-t border-[#E5E7EB] bg-gray-50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="flex-1 py-3 text-xs font-bold border border-gray-300 rounded-xl hover:bg-gray-100 text-gray-700 cursor-pointer text-center"
                >
                  Batal
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 py-3 text-xs font-bold bg-[#111827] text-white hover:bg-black rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-md"
                >
                  <Save className="h-4 w-4 text-[#FBBF24]" />
                  Simpan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
