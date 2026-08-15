// ============================================================================
// MO Job Desk Management Page (Date-Centric / Per Tanggal - Katering & MBG)
// ============================================================================
// Manager Operational (MO) uses this page to:
// 1. Group & monitor incoming catering orders and MBG batches by operational DATE
// 2. Select any date to view all orders/schools scheduled for that specific date
// 3. Draft & distribute structured Excel job desks per date for Joko, Shifa, Dwi, and Wandi
// 4. Track operational progress & CO_MO reviews across both divisions in real time

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trash2,
  Save,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  Eye,
  X,
  Phone,
  MapPin,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Milk,
  RotateCcw,
  CalendarDays,
  ListTodo,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeOrders } from "@/services/realtimeService";
import {
  subscribeBatches,
  subscribeAllEntries,
} from "@/services/mbgAdminService";
import {
  batchCreateJobDesks,
  deleteJobDesk,
  subscribeAllJobDesks,
  type CreateJobDeskInput,
} from "@/services/cateringJobDeskService";
import type { Order } from "@/types/order";
import type { MbgPmBatch, MbgPmEntry } from "@/types/mbg";
import type {
  CateringJobDesk,
  JobDeskDivision,
  PicShortName,
} from "@/types/cateringJobDesk";
import {
  PIC_NAME_TO_ROLE,
  JOBDESK_ROLE_LABELS,
  HARI_OPTIONS,
  generateKeyId,
  getHariFromDate,
  extractDateOnly,
  extractTimeOnly,
  formatIndoDate,
  formatIndoTime,
} from "@/types/cateringJobDesk";

interface DraftRow {
  id: string;
  division?: JobDeskDivision;
  hari: string;
  tanggal: string;
  startTime: string;
  pic: PicShortName;
  kegiatan: string;
  keterangan: string;
  keyId: string;
  orderId?: string;
  orderLabel?: string;
  mbgBatchId?: string;
  mbgInstitutionName?: string;
  mbgPortionCount?: number;
  mbgMenuType?: string;
}

const PIC_OPTIONS: PicShortName[] = [
  "Joko",
  "Shifa",
  "Dwi",
  "Wandi",
];

interface CateringDateGroup {
  date: string;
  hari: string;
  orders: Order[];
  totalPortions: number;
  totalOrders: number;
  deliveryTimes: string[];
  jobDesks: CateringJobDesk[];
  isAssigned: boolean;
  unassignedOrdersCount: number;
}

interface MbgDateGroup {
  date: string;
  hari: string;
  batch?: MbgPmBatch;
  entries: MbgPmEntry[];
  totalPortions: number;
  totalSchools: number;
  menuName?: string;
  jobDesks: CateringJobDesk[];
  isAssigned: boolean;
}

export function MoJobDeskPage() {
  const { user } = useAuth();
  const [jobDesks, setJobDesks] = useState<CateringJobDesk[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [mbgBatches, setMbgBatches] = useState<MbgPmBatch[]>([]);
  const [mbgEntries, setMbgEntries] = useState<MbgPmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dates" | "form" | "table">("dates");

  // Division switcher in Tab 1 (Date-Centric Handover)
  const [handoverDivision, setHandoverDivision] = useState<"katering" | "mbg">("katering");

  // Selected date context for form drafting
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedOperationalDate, setSelectedOperationalDate] = useState<string>(todayStr);

  // Expanded dates state in Tab 1
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  // Modal detail states
  const [detailOrderModal, setDetailOrderModal] = useState<Order | null>(null);
  const [detailMbgModal, setDetailMbgModal] = useState<{
    batch?: MbgPmBatch;
    entry: MbgPmEntry;
  } | null>(null);
  const [detailJobDeskModal, setDetailJobDeskModal] = useState<CateringJobDesk | null>(null);

  // Filter state for table view
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPic, setSelectedPic] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [tableDivisionFilter, setTableDivisionFilter] = useState<"all" | "katering" | "mbg">("all");

  // Filter for dates list
  const [dateSearchQuery, setDateSearchQuery] = useState("");
  const [dateHandoverFilter, setDateHandoverFilter] = useState<"all" | "unassigned" | "assigned">("all");

  // Draft rows for batch entry
  const [rows, setRows] = useState<DraftRow[]>([
    {
      id: "row-1",
      division: "katering",
      hari: getHariFromDate(todayStr),
      tanggal: todayStr,
      startTime: "07:00",
      pic: "Joko",
      kegiatan: "",
      keterangan: "",
      keyId: generateKeyId(todayStr, 1, "CAT"),
      orderId: "",
      orderLabel: "",
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Subscribe to all job desks, orders, and MBG data
  useEffect(() => {
    let mounted = true;

    // Safety fallback timeout to prevent infinite spinner
    const timer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 1200);

    const unsubDesks = subscribeAllJobDesks(
      (data) => {
        if (!mounted) return;
        setJobDesks(data);
        setLoading(false);
      },
      (err) => {
        console.error("MO: failed to load job desks:", err);
        if (mounted) setLoading(false);
      }
    );

    const unsubOrders = subscribeOrders(
      (allOrders) => {
        if (!mounted) return;
        setOrders(allOrders);
      },
      (err) => {
        console.error("MO: failed to load orders:", err);
      }
    );

    const unsubBatches = subscribeBatches(
      (batches) => {
        if (!mounted) return;
        setMbgBatches(batches);
      },
      (err) => {
        console.error("MO: failed to load MBG batches:", err);
      }
    );

    const unsubEntries = subscribeAllEntries(
      (entries) => {
        if (!mounted) return;
        setMbgEntries(entries);
      },
      (err) => {
        console.error("MO: failed to load MBG entries:", err);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timer);
      unsubDesks();
      unsubOrders();
      unsubBatches();
      unsubEntries();
    };
  }, []);

  // Map of orderId / entryId -> array of existing job desks
  const jobDesksByOrderId = useMemo(() => {
    const map = new Map<string, CateringJobDesk[]>();
    for (const jd of jobDesks) {
      if (jd.orderId) {
        const list = map.get(jd.orderId) || [];
        list.push(jd);
        map.set(jd.orderId, list);
      }
    }
    return map;
  }, [jobDesks]);

  // Batch lookup map for MBG entries
  const batchMap = useMemo(() => {
    const map = new Map<string, MbgPmBatch>();
    for (const b of mbgBatches) {
      map.set(b.id, b);
    }
    return map;
  }, [mbgBatches]);

  // Calculate next sequential Key ID for a given date and division
  const computeKeyId = useCallback(
    (targetDate: string, indexInBatch: number, div: JobDeskDivision = "katering") => {
      const prefix = div === "mbg" ? "MBG" : "CAT";
      const existingForDate = jobDesks.filter(
        (jd) => jd.tanggal === targetDate && (jd.keyId || "").startsWith(prefix)
      );
      let maxSeq = 0;
      const regex = new RegExp(`${prefix}-\\d{8}-(\\d+)`);
      for (const jd of existingForDate) {
        const match = (jd.keyId || "").match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
      return generateKeyId(targetDate, maxSeq + indexInBatch + 1, prefix);
    },
    [jobDesks]
  );

  // Initialize draft rows with correct auto Key ID once jobDesks load
  useEffect(() => {
    setRows((prev) =>
      prev.map((r, idx) => ({
        ...r,
        keyId: computeKeyId(r.tanggal || todayStr, idx, r.division || "katering"),
      }))
    );
  }, [jobDesks, todayStr, computeKeyId]);

  // Toggle expand/collapse of date card
  const toggleDateExpanded = useCallback((dateKey: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  }, []);

  // =========================================================================
  // GROUPING 1: KATERING ORDERS GROUPED BY DATE (Tanggal Acara)
  // =========================================================================
  const cateringDateGroups = useMemo<CateringDateGroup[]>(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      const d = extractDateOnly(order.eventDate) || todayStr;
      const list = map.get(d) || [];
      list.push(order);
      map.set(d, list);
    }

    const groups: CateringDateGroup[] = [];
    map.forEach((ordersList, date) => {
      let totalPortions = 0;
      const times = new Set<string>();
      let unassignedOrdersCount = 0;

      for (const ord of ordersList) {
        const portions = (ord.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
        totalPortions += portions;
        if (ord.deliveryTime) times.add(ord.deliveryTime);
        const existingDesks = jobDesksByOrderId.get(ord.id) || [];
        if (existingDesks.length === 0) {
          unassignedOrdersCount++;
        }
      }

      const dateJobDesks = jobDesks.filter(
        (jd) => jd.tanggal === date && (jd.division === "katering" || !jd.division)
      );

      groups.push({
        date,
        hari: getHariFromDate(date),
        orders: ordersList,
        totalPortions,
        totalOrders: ordersList.length,
        deliveryTimes: Array.from(times).sort(),
        jobDesks: dateJobDesks,
        isAssigned: unassignedOrdersCount === 0 && dateJobDesks.length > 0,
        unassignedOrdersCount,
      });
    });

    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, todayStr, jobDesksByOrderId, jobDesks]);

  // =========================================================================
  // GROUPING 2: MBG ENTRIES GROUPED BY BATCH DATE (Tanggal Input Admin MBG)
  // =========================================================================
  const mbgDateGroups = useMemo<MbgDateGroup[]>(() => {
    const map = new Map<string, { batch?: MbgPmBatch; entries: MbgPmEntry[] }>();

    for (const batch of mbgBatches) {
      const d = extractDateOnly(batch.tanggal) || todayStr;
      if (!map.has(d)) {
        map.set(d, { batch, entries: [] });
      } else {
        map.get(d)!.batch = batch;
      }
    }

    for (const entry of mbgEntries) {
      const batch = batchMap.get(entry.batchId);
      const d = batch?.tanggal ? extractDateOnly(batch.tanggal) : todayStr;
      if (!map.has(d)) {
        map.set(d, { batch, entries: [entry] });
      } else {
        map.get(d)!.entries.push(entry);
      }
    }

    const groups: MbgDateGroup[] = [];
    map.forEach((item, date) => {
      let totalPortions = 0;
      for (const entry of item.entries) {
        totalPortions +=
          (entry.qtSiswaBalita || 0) +
          (entry.qtGuruKader || 0) +
          (entry.qtBumilBusui || 0) +
          (entry.qtPobiaNasi || 0);
      }

      const dateJobDesks = jobDesks.filter(
        (jd) => jd.tanggal === date && jd.division === "mbg"
      );

      groups.push({
        date,
        hari: getHariFromDate(date),
        batch: item.batch,
        entries: item.entries,
        totalPortions,
        totalSchools: item.entries.length,
        menuName: item.batch?.batchNotes || (item.entries[0]?.menuItems?.join(", ")) || "Menu MBG",
        jobDesks: dateJobDesks,
        isAssigned: dateJobDesks.length > 0,
      });
    });

    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }, [mbgBatches, mbgEntries, batchMap, todayStr, jobDesks]);

  // Filtered Catering Date Groups
  const filteredCateringDateGroups = useMemo(() => {
    return cateringDateGroups.filter((g) => {
      if (dateHandoverFilter === "unassigned" && g.unassignedOrdersCount === 0) return false;
      if (dateHandoverFilter === "assigned" && !g.isAssigned) return false;

      if (dateSearchQuery.trim()) {
        const q = dateSearchQuery.toLowerCase();
        const dateMatch = g.date.toLowerCase().includes(q) || g.hari.toLowerCase().includes(q);
        const orderMatch = g.orders.some(
          (o) =>
            (o.institutionName || "").toLowerCase().includes(q) ||
            (o.customerName || "").toLowerCase().includes(q) ||
            (o.recipientName || "").toLowerCase().includes(q) ||
            (o.deliveryAddress || "").toLowerCase().includes(q)
        );
        return dateMatch || orderMatch;
      }
      return true;
    });
  }, [cateringDateGroups, dateHandoverFilter, dateSearchQuery]);

  // Filtered MBG Date Groups
  const filteredMbgDateGroups = useMemo(() => {
    return mbgDateGroups.filter((g) => {
      if (dateHandoverFilter === "unassigned" && g.isAssigned) return false;
      if (dateHandoverFilter === "assigned" && !g.isAssigned) return false;

      if (dateSearchQuery.trim()) {
        const q = dateSearchQuery.toLowerCase();
        const dateMatch = g.date.toLowerCase().includes(q) || g.hari.toLowerCase().includes(q);
        const entryMatch = g.entries.some(
          (e) =>
            (e.institutionName || "").toLowerCase().includes(q) ||
            (e.address || "").toLowerCase().includes(q)
        );
        const menuMatch = (g.menuName || "").toLowerCase().includes(q);
        return dateMatch || entryMatch || menuMatch;
      }
      return true;
    });
  }, [mbgDateGroups, dateHandoverFilter, dateSearchQuery]);

  // =========================================================================
  // ACTIONS: GENERATE FULL-DAY JOB DESK FOR A SELECTED DATE
  // =========================================================================

  // 1. Generate full-day catering job desk for a selected date
  const handleGenerateCateringJobDesksForDate = useCallback(
    (group: CateringDateGroup) => {
      setSelectedOperationalDate(group.date);
      const targetDate = group.date;
      const targetHari = group.hari || getHariFromDate(targetDate);

      const newRows: DraftRow[] = [];
      let seqIndex = 0;

      group.orders.forEach((order) => {
        const orderLabel =
          order.institutionName ||
          order.customerName ||
          order.recipientName ||
          `Pesanan #${order.id.slice(-6).toUpperCase()}`;

        const itemsSummary = (order.items || [])
          .map((it) => `${it.itemName} (${it.quantity} ${it.unit || "porsi"})`)
          .join(", ");

        const deliveryTime = extractTimeOnly(order.deliveryTime || order.eventDate, "09:00");
        let prodTime = "06:00";
        const [hStr, mStr] = deliveryTime.split(":");
        const hNum = parseInt(hStr, 10);
        if (!isNaN(hNum)) {
          const prodHour = Math.max(4, hNum - 2);
          prodTime = `${String(prodHour).padStart(2, "0")}:${mStr || "00"}`;
        }

        // Row 1: Produksi Katering (Default: Joko / Shifa)
        newRows.push({
          id: `row-${Date.now()}-${seqIndex++}`,
          division: "katering",
          hari: targetHari,
          tanggal: targetDate,
          startTime: prodTime,
          pic: "Joko",
          kegiatan: `Produksi: ${orderLabel}`,
          keterangan: `Menu: ${itemsSummary || "Menu Standar Katering"}${order.recipientNotes ? ` | Note: ${order.recipientNotes}` : ""}`,
          keyId: computeKeyId(targetDate, newRows.length, "katering"),
          orderId: order.id,
          orderLabel,
        });

        // Row 2: Pengiriman Katering (Default: Dwi / Wandi)
        newRows.push({
          id: `row-${Date.now()}-${seqIndex++}`,
          division: "katering",
          hari: targetHari,
          tanggal: targetDate,
          startTime: deliveryTime,
          pic: "Dwi",
          kegiatan: `Pengiriman: ${orderLabel}`,
          keterangan: `Alamat: ${order.deliveryAddress || "-"} | Penerima: ${order.recipientName} (${order.recipientPhone || "-"})`,
          keyId: computeKeyId(targetDate, newRows.length, "katering"),
          orderId: order.id,
          orderLabel,
        });
      });

      if (newRows.length === 0) {
        newRows.push({
          id: `row-${Date.now()}-1`,
          division: "katering",
          hari: targetHari,
          tanggal: targetDate,
          startTime: "07:00",
          pic: "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: computeKeyId(targetDate, 0, "katering"),
        });
      }

      setRows(newRows);
      setActiveTab("form");
    },
    [computeKeyId]
  );

  // 2. Generate full-day MBG job desk for a selected date
  const handleGenerateMbgJobDesksForDate = useCallback(
    (group: MbgDateGroup) => {
      setSelectedOperationalDate(group.date);
      const targetDate = group.date;
      const targetHari = group.hari || getHariFromDate(targetDate);
      const batch = group.batch;
      const entries = group.entries;

      const newRows: DraftRow[] = [];
      let seqIndex = 0;

      // Row 1: Produksi MBG Dapur Utama (Default: Shifa - ProduksiMBG@alumana.id)
      newRows.push({
        id: `row-${Date.now()}-${seqIndex++}`,
        division: "mbg",
        hari: targetHari,
        tanggal: targetDate,
        startTime: "05:30",
        pic: "Shifa",
        kegiatan: `Produksi MBG (${group.menuName || "Menu MBG"})`,
        keterangan: `Persiapan & porsi total ${group.totalPortions} porsi (${entries.length} sekolah/lembaga)`,
        keyId: computeKeyId(targetDate, newRows.length, "mbg"),
        mbgBatchId: batch?.id,
        orderLabel: `Batch MBG ${formatIndoDate(targetDate)}`,
        mbgPortionCount: group.totalPortions,
      });

      // Row 2: Produksi MBG Dapur 2 (Jika porsi besar > 500 porsi, default: Joko)
      if (group.totalPortions > 500) {
        newRows.push({
          id: `row-${Date.now()}-${seqIndex++}`,
          division: "mbg",
          hari: targetHari,
          tanggal: targetDate,
          startTime: "06:00",
          pic: "Joko",
          kegiatan: `Produksi MBG Dapur 2 - Masak & Porsi Nasi/Lauk`,
          keterangan: `Dukungan porsi porsi besar batch ${formatIndoDate(targetDate)}`,
          keyId: computeKeyId(targetDate, newRows.length, "mbg"),
          mbgBatchId: batch?.id,
          orderLabel: `Batch MBG ${formatIndoDate(targetDate)}`,
          mbgPortionCount: group.totalPortions,
        });
      }

      // Row 3+: Pengantaran MBG per Sekolah (Default bergantian: Dwi & Wandi)
      entries.forEach((entry, idx) => {
        const entryPortions =
          (entry.qtSiswaBalita || 0) +
          (entry.qtGuruKader || 0) +
          (entry.qtBumilBusui || 0) +
          (entry.qtPobiaNasi || 0);

        const assignedPic: PicShortName = idx % 2 === 0 ? "Dwi" : "Wandi";

        newRows.push({
          id: `row-${Date.now()}-${seqIndex++}`,
          division: "mbg",
          hari: targetHari,
          tanggal: targetDate,
          startTime: "08:30",
          pic: assignedPic,
          kegiatan: `Pengantaran MBG - ${entry.institutionName}`,
          keterangan: `Antar ${entryPortions} porsi ke ${entry.institutionName} (${entry.address || "-"})`,
          keyId: computeKeyId(targetDate, newRows.length, "mbg"),
          orderId: entry.id,
          orderLabel: `MBG: ${entry.institutionName}`,
          mbgBatchId: entry.batchId,
          mbgInstitutionName: entry.institutionName,
          mbgPortionCount: entryPortions,
        });
      });

      if (newRows.length === 0) {
        newRows.push({
          id: `row-${Date.now()}-1`,
          division: "mbg",
          hari: targetHari,
          tanggal: targetDate,
          startTime: "06:00",
          pic: "Shifa",
          kegiatan: "Produksi MBG",
          keterangan: "",
          keyId: computeKeyId(targetDate, 0, "mbg"),
        });
      }

      setRows(newRows);
      setActiveTab("form");
    },
    [computeKeyId]
  );

  // Reload template for selectedOperationalDate
  const handleReloadTemplateForSelectedDate = useCallback(() => {
    if (handoverDivision === "katering") {
      const group = cateringDateGroups.find((g) => g.date === selectedOperationalDate);
      if (group) {
        handleGenerateCateringJobDesksForDate(group);
        return;
      }
    } else {
      const group = mbgDateGroups.find((g) => g.date === selectedOperationalDate);
      if (group) {
        handleGenerateMbgJobDesksForDate(group);
        return;
      }
    }

    // Default blank row if no group matches
    const d = selectedOperationalDate || todayStr;
    const div = handoverDivision;
    setRows([
      {
        id: `row-${Date.now()}-1`,
        division: div,
        hari: getHariFromDate(d),
        tanggal: d,
        startTime: "07:00",
        pic: div === "mbg" ? "Shifa" : "Joko",
        kegiatan: "",
        keterangan: "",
        keyId: computeKeyId(d, 0, div),
      },
    ]);
  }, [
    handoverDivision,
    cateringDateGroups,
    mbgDateGroups,
    selectedOperationalDate,
    todayStr,
    handleGenerateCateringJobDesksForDate,
    handleGenerateMbgJobDesksForDate,
    computeKeyId,
  ]);

  // Add new empty row to draft form
  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const lastRow = prev[prev.length - 1];
      const defaultDate = lastRow ? lastRow.tanggal : selectedOperationalDate || todayStr;
      const defaultDivision: JobDeskDivision = lastRow?.division || handoverDivision;
      const nextIndex = prev.length;
      return [
        ...prev,
        {
          id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          division: defaultDivision,
          hari: lastRow ? lastRow.hari : getHariFromDate(defaultDate),
          tanggal: defaultDate,
          startTime: lastRow ? lastRow.startTime : "07:00",
          pic: defaultDivision === "mbg" ? "Shifa" : "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: computeKeyId(defaultDate, nextIndex, defaultDivision),
          orderId: lastRow?.orderId || "",
          orderLabel: lastRow?.orderLabel || "",
          mbgBatchId: lastRow?.mbgBatchId,
          mbgInstitutionName: lastRow?.mbgInstitutionName,
          mbgPortionCount: lastRow?.mbgPortionCount,
        },
      ];
    });
  }, [selectedOperationalDate, todayStr, handoverDivision, computeKeyId]);

  // Remove a row from draft form and re-index Key IDs
  const handleRemoveRow = useCallback(
    (rowId: string) => {
      setRows((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((r) => r.id !== rowId);
        return filtered.map((r, idx) => ({
          ...r,
          keyId: computeKeyId(r.tanggal || selectedOperationalDate, idx, r.division || "katering"),
        }));
      });
    },
    [selectedOperationalDate, computeKeyId]
  );

  // Handle in-line cell change in draft table
  const handleRowChange = useCallback(
    (rowId: string, field: keyof DraftRow, value: unknown) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          const updated = { ...r, [field]: value };
          if (field === "tanggal") {
            const dateVal = String(value);
            updated.hari = getHariFromDate(dateVal);
            updated.keyId = computeKeyId(dateVal, 0, updated.division || "katering");
          }
          if (field === "division") {
            const divVal = value as JobDeskDivision;
            updated.keyId = computeKeyId(updated.tanggal, 0, divVal);
            if (!r.pic || r.pic === "Joko" || r.pic === "Shifa") {
              updated.pic = divVal === "mbg" ? "Shifa" : "Joko";
            }
          }
          return updated;
        })
      );
    },
    [computeKeyId]
  );

  // Save all draft rows to Firestore in a single batch
  const handleSaveAll = useCallback(async () => {
    const invalidRow = rows.find((r) => !r.kegiatan.trim());
    if (invalidRow) {
      alert("Harap isi nama kegiatan untuk seluruh baris job desk!");
      return;
    }

    setSaving(true);
    try {
      const inputs: CreateJobDeskInput[] = rows.map((r) => ({
        division: r.division || "katering",
        hari: r.hari || getHariFromDate(r.tanggal),
        tanggal: r.tanggal || todayStr,
        startTime: r.startTime || "07:00",
        pic: r.pic,
        assignedRole: PIC_NAME_TO_ROLE[r.pic] || "produksi_1",
        kegiatan: r.kegiatan.trim(),
        keterangan: r.keterangan.trim(),
        keyId: r.keyId,
        orderId: r.orderId || undefined,
        orderLabel: r.orderLabel || undefined,
        mbgBatchId: r.mbgBatchId || undefined,
        mbgInstitutionName: r.mbgInstitutionName || undefined,
        mbgPortionCount: r.mbgPortionCount || undefined,
        mbgMenuType: r.mbgMenuType || undefined,
        title: r.kegiatan.trim(),
        description: r.keterangan.trim(),
        assignedByUid: user?.uid || "mo-user",
      }));

      await batchCreateJobDesks(inputs);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);

      // Reset form
      setRows([
        {
          id: `row-${Date.now()}-1`,
          division: handoverDivision,
          hari: getHariFromDate(selectedOperationalDate || todayStr),
          tanggal: selectedOperationalDate || todayStr,
          startTime: "07:00",
          pic: handoverDivision === "mbg" ? "Shifa" : "Joko",
          kegiatan: "",
          keterangan: "",
          keyId: computeKeyId(selectedOperationalDate || todayStr, 0, handoverDivision),
          orderId: "",
          orderLabel: "",
        },
      ]);

      setActiveTab("table");
    } catch (err) {
      console.error("Failed saving job desks:", err);
      alert("Terjadi kesalahan saat menyimpan job desk ke database.");
    } finally {
      setSaving(false);
    }
  }, [rows, user?.uid, todayStr, selectedOperationalDate, handoverDivision, computeKeyId]);

  // Delete a single job desk
  const handleDeleteDesk = useCallback(async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus baris job desk ini?")) return;
    try {
      await deleteJobDesk(id);
    } catch (err) {
      console.error("Failed deleting job desk:", err);
      alert("Gagal menghapus job desk.");
    }
  }, []);

  // Filtered job desks for Tab 3 (Table)
  const filteredJobDesks = useMemo(() => {
    return jobDesks.filter((jd) => {
      if (tableDivisionFilter !== "all" && (jd.division || "katering") !== tableDivisionFilter) {
        return false;
      }
      if (selectedPic !== "all" && jd.pic !== selectedPic) {
        return false;
      }
      if (selectedDate && jd.tanggal !== selectedDate) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const kegiatan = (jd.kegiatan || jd.title || "").toLowerCase();
        const keterangan = (jd.keterangan || jd.description || "").toLowerCase();
        const keyId = (jd.keyId || "").toLowerCase();
        const pic = (jd.pic || "").toLowerCase();
        const label = (jd.orderLabel || jd.mbgInstitutionName || "").toLowerCase();
        return (
          kegiatan.includes(q) ||
          keterangan.includes(q) ||
          keyId.includes(q) ||
          pic.includes(q) ||
          label.includes(q)
        );
      }
      return true;
    });
  }, [jobDesks, tableDivisionFilter, selectedPic, selectedDate, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalMbgEntries = mbgEntries.length;
    const totalCateringDates = cateringDateGroups.length;
    const totalMbgDates = mbgDateGroups.length;
    const unassignedCateringDates = cateringDateGroups.filter((g) => !g.isAssigned).length;
    const unassignedMbgDates = mbgDateGroups.filter((g) => !g.isAssigned).length;

    const totalDesks = jobDesks.length;
    const kateringDesks = jobDesks.filter((d) => d.division !== "mbg").length;
    const mbgDesks = jobDesks.filter((d) => d.division === "mbg").length;
    const pendingReviewDesks = jobDesks.filter((d) => d.reviewStatus === "pending_review").length;
    const approvedDesks = jobDesks.filter((d) => d.reviewStatus === "approved").length;

    return {
      totalOrders,
      totalMbgEntries,
      totalCateringDates,
      totalMbgDates,
      unassignedCateringDates,
      unassignedMbgDates,
      totalDesks,
      kateringDesks,
      mbgDesks,
      pendingReviewDesks,
      approvedDesks,
    };
  }, [orders, mbgEntries, cateringDateGroups, mbgDateGroups, jobDesks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-500">Memuat data Manager Operational...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-20 font-['Hanken_Grotesk',system-ui,sans-serif]">
      {/* Toast Notifikasi Sukses */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-3 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-xl border border-emerald-500 text-sm font-bold"
          >
            <CheckCircle className="h-5 w-5" />
            <span>Job Desk Harian Berhasil Disimpan & Didistribusikan!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* HERO HEADER */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-400 text-slate-950 shadow-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Manager Operational (MO)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700">
                <CalendarDays className="h-3.5 w-3.5 text-amber-400" />
                Sistem Job Desk Berbasis Tanggal (Per Tanggal)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Penyusunan & Distribusi Job Desk Harian
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Pilih tanggal operasional untuk melihat seluruh pesanan katering atau batch MBG pada hari tersebut, lalu bagikan penugasan ke tim operasional (Joko, Shifa, Dwi, Wandi).
            </p>
          </div>

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 gap-3 shrink-0">
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Tanggal Katering
              </p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {stats.totalCateringDates} <span className="text-xs font-normal text-slate-300">Hari</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {stats.unassignedCateringDates} hari belum tuntas
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Tanggal Batch MBG
              </p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {stats.totalMbgDates} <span className="text-xs font-normal text-slate-300">Batch</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {stats.unassignedMbgDates} batch belum tuntas
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3-TAB SWITCHER */}
      {/* ========================================================================= */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("dates")}
          className={`flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "dates"
              ? "border-amber-500 text-slate-950 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <CalendarDays className="h-4 w-4 text-amber-600" />
          <span>1. Jadwal & Pesanan Per Tanggal</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
            {stats.totalCateringDates + stats.totalMbgDates} Hari
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("form")}
          className={`flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "form"
              ? "border-amber-500 text-slate-950 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <ListTodo className="h-4 w-4 text-amber-600" />
          <span>2. Draft & Bagikan Job Desk</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-900 font-bold">
            {rows.length} Baris
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("table")}
          className={`flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "table"
              ? "border-amber-500 text-slate-950 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 text-amber-600" />
          <span>3. Rekap Semua Job Desk & Status CO_MO</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
            {stats.totalDesks}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: JADWAL & PESANAN PER TANGGAL (DATE-CENTRIC HANDOVER) */}
      {/* ========================================================================= */}
      {activeTab === "dates" && (
        <div className="space-y-6">
          {/* Sub-Header & Division Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            {/* Division Switcher */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setHandoverDivision("katering")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  handoverDivision === "katering"
                    ? "bg-amber-400 text-slate-950 shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                <UtensilsCrossed className="h-4 w-4" />
                <span>🍱 Katering Reguler ({cateringDateGroups.length} Tanggal Acara)</span>
              </button>
              <button
                type="button"
                onClick={() => setHandoverDivision("mbg")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  handoverDivision === "mbg"
                    ? "bg-emerald-600 text-white shadow-xs font-extrabold"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                <Milk className="h-4 w-4" />
                <span>🥛 Program MBG ({mbgDateGroups.length} Tanggal Batch)</span>
              </button>
            </div>

            {/* Search and Handover Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={dateSearchQuery}
                  onChange={(e) => setDateSearchQuery(e.target.value)}
                  placeholder={
                    handoverDivision === "katering"
                      ? "Cari tanggal, nama pemesan, alamat..."
                      : "Cari tanggal batch, nama sekolah..."
                  }
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <select
                value={dateHandoverFilter}
                onChange={(e) => setDateHandoverFilter(e.target.value as "all" | "unassigned" | "assigned")}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-slate-900 cursor-pointer"
              >
                <option value="all">Semua Status</option>
                <option value="unassigned">Belum Ditugaskan</option>
                <option value="assigned">Sudah Ditugaskan</option>
              </select>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SECTION 1: KATERING REGULER PER TANGGAL */}
          {/* ------------------------------------------------------------- */}
          {handoverDivision === "katering" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-slate-500">
                  Menampilkan <span className="font-bold text-slate-900">{filteredCateringDateGroups.length}</span> tanggal operasional katering
                </p>
              </div>

              {filteredCateringDateGroups.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-xs">
                  <CalendarDays className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Tidak ada tanggal pesanan katering yang sesuai filter</p>
                  <p className="text-xs text-slate-400 mt-1">Admin Katering belum menambahkan pesanan atau sesuaikan kata kunci pencarian / filter Anda</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCateringDateGroups.map((group) => {
                    const isExpanded = !!expandedDates[group.date];
                    return (
                      <div
                        key={group.date}
                        className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all duration-200 hover:border-slate-300"
                      >
                        {/* Date Group Card Header */}
                        <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50 border-b border-slate-200/80">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex flex-col items-center justify-center text-amber-900 shrink-0 font-extrabold">
                              <span className="text-[10px] uppercase">{group.hari.slice(0, 3)}</span>
                              <span className="text-base font-black leading-none">{group.date.split("-")[2] || "01"}</span>
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-extrabold text-slate-900">
                                  {group.hari}, {formatIndoDate(group.date)}
                                </h3>
                                {group.isAssigned ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="h-3 w-3" /> Job Desk Lengkap
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <AlertCircle className="h-3 w-3" /> {group.unassignedOrdersCount} Pesanan Belum Ditugaskan
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Total <strong className="text-slate-800">{group.totalOrders} Pesanan</strong> •{" "}
                                <strong className="text-slate-800">{group.totalPortions} Porsi/Item</strong> • Jam Kirim:{" "}
                                <span className="font-mono font-bold text-slate-700">
                                  {group.deliveryTimes.length > 0 ? group.deliveryTimes.join(", ") : "-"}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => toggleDateExpanded(group.date)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                            >
                              {isExpanded ? "Sembunyikan Pesanan ˄" : "Lihat Daftar Pesanan >"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleGenerateCateringJobDesksForDate(group)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-xs cursor-pointer transition-all active:scale-95"
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                              <span>Susun Job Desk Tanggal Ini</span>
                            </button>
                          </div>
                        </div>

                        {/* Expandable Order List for this Date */}
                        {isExpanded && (
                          <div className="p-4 bg-slate-50 border-t border-slate-200/80 space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                              Daftar Pesanan ({group.orders.length})
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {group.orders.map((ord, oIdx) => {
                                const ordDesks = jobDesksByOrderId.get(ord.id) || [];
                                const isOrdAssigned = ordDesks.length > 0;
                                return (
                                  <div
                                    key={ord.id}
                                    className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs space-y-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-mono font-bold text-slate-400">
                                            #{oIdx + 1}
                                          </span>
                                          <span className="text-xs font-extrabold text-slate-900">
                                            {ord.institutionName || ord.recipientName || "Pesanan"}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                                          Menu: <strong className="text-slate-800">{(ord.items || []).map((it) => `${it.itemName} (x${it.quantity})`).join(", ") || "Menu Katering Standar"}</strong>
                                        </p>
                                      </div>

                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                          isOrdAssigned
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-amber-100 text-amber-800"
                                        }`}
                                      >
                                        {isOrdAssigned ? "Ada Job Desk" : "Belum Dibuat"}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                                      <span>
                                        Jam Kirim:{" "}
                                        <strong className="font-mono font-bold text-slate-700">
                                          {ord.deliveryTime || "-"}
                                        </strong>
                                      </span>
                                      <span className="truncate max-w-[180px]" title={ord.deliveryAddress}>
                                        Alamat: {ord.deliveryAddress || "-"}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* SECTION 2: PROGRAM MBG PER TANGGAL BATCH */}
          {/* ------------------------------------------------------------- */}
          {handoverDivision === "mbg" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold text-slate-500">
                  Menampilkan <span className="font-bold text-slate-900">{filteredMbgDateGroups.length}</span> tanggal batch MBG yang diinput Admin MBG
                </p>
              </div>

              {filteredMbgDateGroups.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-xs">
                  <Milk className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Tidak ada tanggal batch MBG yang sesuai filter</p>
                  <p className="text-xs text-slate-400 mt-1">Admin MBG belum menambahkan batch jadwal atau sesuaikan filter pencarian Anda</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMbgDateGroups.map((group) => {
                    const isExpanded = !!expandedDates[`mbg-${group.date}`];
                    return (
                      <div
                        key={group.date}
                        className="bg-white rounded-2xl border border-emerald-200/80 shadow-xs overflow-hidden transition-all duration-200 hover:border-emerald-300"
                      >
                        {/* MBG Date Group Card Header */}
                        <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-emerald-50/40 border-b border-emerald-100">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-white flex flex-col items-center justify-center shrink-0 font-extrabold shadow-xs">
                              <span className="text-[10px] uppercase">{group.hari.slice(0, 3)}</span>
                              <span className="text-base font-black leading-none">{group.date.split("-")[2] || "01"}</span>
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-extrabold text-slate-900">
                                  {group.hari}, {formatIndoDate(group.date)}
                                </h3>
                                {group.isAssigned ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="h-3 w-3" /> Job Desk MBG Lengkap ({group.jobDesks.length} Tugas)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <AlertCircle className="h-3 w-3" /> Belum Dibuat Job Desk
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Menu: <strong className="text-slate-900">{group.menuName}</strong> • Total:{" "}
                                <strong className="text-emerald-700">{group.totalPortions} Porsi Makanan</strong> •{" "}
                                <span>{group.totalSchools} Sekolah/Lembaga</span>
                              </p>
                            </div>
                          </div>

                          {/* Header Action Buttons */}
                          <div className="flex items-center gap-2 self-start sm:self-center">
                            <button
                              type="button"
                              onClick={() => toggleDateExpanded(`mbg-${group.date}`)}
                              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <span>{isExpanded ? "Sembunyikan Sekolah" : "Lihat Daftar Sekolah"}</span>
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleGenerateMbgJobDesksForDate(group)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs cursor-pointer transition-all active:scale-95"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              <span>🥛 Susun Job Desk MBG Tanggal Ini</span>
                            </button>
                          </div>
                        </div>

                        {/* Collapsible List of Schools on this Batch Date */}
                        {isExpanded && (
                          <div className="p-4 sm:p-5 bg-white space-y-3 divide-y divide-slate-100">
                            {group.entries.map((entry, idx) => {
                              const entryPortions =
                                (entry.qtSiswaBalita || 0) +
                                (entry.qtGuruKader || 0) +
                                (entry.qtBumilBusui || 0) +
                                (entry.qtPobiaNasi || 0);

                              return (
                                <div
                                  key={entry.id}
                                  className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-slate-50"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                        #{idx + 1}
                                      </span>
                                      <h4 className="text-xs font-bold text-slate-900">{entry.institutionName}</h4>
                                      <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full uppercase">
                                        {entry.schoolLevel || entry.institutionType || "Sekolah"}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600">
                                      Porsi: <strong className="text-emerald-700">{entryPortions} Porsi</strong> (Siswa: {entry.qtSiswaBalita || 0}, Guru: {entry.qtGuruKader || 0}, Bumil: {entry.qtBumilBusui || 0})
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      Alamat: <span>{entry.address || "-"}</span>
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setDetailMbgModal({ batch: group.batch, entry })}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 cursor-pointer self-start sm:self-center"
                                  >
                                    Detail Sekolah
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DRAFT & BAGIKAN JOB DESK (EXCEL SPREADSHEET FORM) */}
      {/* ========================================================================= */}
      {activeTab === "form" && (
        <div className="space-y-5">
          {/* Header Context Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white">
                  Formulir Job Desk Harian
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  Tanggal Operasional: <strong className="text-slate-900">{formatIndoDate(selectedOperationalDate)}</strong>
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Susun pembagian tugas untuk Joko (Produksi MBG 2/Katering), Shifa (Produksi MBG), Dwi (Distribusi MBG/Katering), dan Wandi (Distribusi 2).
              </p>
            </div>

            {/* Date Selector & Reload Template */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                  Ubah Tanggal:
                </label>
                <input
                  type="date"
                  value={selectedOperationalDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setSelectedOperationalDate(newDate);
                    setRows((prev) =>
                      prev.map((r, idx) => ({
                        ...r,
                        tanggal: newDate,
                        hari: getHariFromDate(newDate),
                        keyId: computeKeyId(newDate, idx, r.division || "katering"),
                      }))
                    );
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <button
                type="button"
                onClick={handleReloadTemplateForSelectedDate}
                className="flex items-center gap-1 px-3 py-2 mt-4 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors"
                title="Muat ulang template dari data pesanan/batch pada tanggal ini"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Muat Pesanan Tanggal Ini</span>
              </button>
            </div>
          </div>

          {/* Interactive Spreadsheet Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3 w-28">Divisi</th>
                  <th className="py-3 px-3 w-28">Hari</th>
                  <th className="py-3 px-3 w-32">Tanggal</th>
                  <th className="py-3 px-3 w-24 text-center">Start Time</th>
                  <th className="py-3 px-3 w-52">PIC Penugasan</th>
                  <th className="py-3 px-3 min-w-[220px]">Kegiatan</th>
                  <th className="py-3 px-3 min-w-[240px]">Keterangan</th>
                  <th className="py-3 px-3 w-36 font-mono">Key ID</th>
                  <th className="py-3 px-3 w-36">Link Pesanan / MBG</th>
                  <th className="py-3 px-2 w-12 text-center">Hapus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Divisi */}
                    <td className="py-2.5 px-3 align-top">
                      <select
                        value={row.division || "katering"}
                        onChange={(e) => handleRowChange(row.id, "division", e.target.value as JobDeskDivision)}
                        className={`w-full px-2 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                          row.division === "mbg"
                            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                            : "bg-amber-50 text-amber-900 border-amber-300"
                        }`}
                      >
                        <option value="katering">🍱 Katering</option>
                        <option value="mbg">🥛 MBG</option>
                      </select>
                    </td>

                    {/* Hari */}
                    <td className="py-2.5 px-3 align-top">
                      <select
                        value={row.hari}
                        onChange={(e) => handleRowChange(row.id, "hari", e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-slate-900 cursor-pointer"
                      >
                        {HARI_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Tanggal */}
                    <td className="py-2.5 px-3 align-top">
                      <input
                        type="date"
                        value={row.tanggal}
                        onChange={(e) => handleRowChange(row.id, "tanggal", e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-slate-900"
                      />
                    </td>

                    {/* Start Time */}
                    <td className="py-2.5 px-3 align-top">
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => handleRowChange(row.id, "startTime", e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-center focus:ring-2 focus:ring-slate-900"
                      />
                    </td>

                    {/* PIC Penugasan */}
                    <td className="py-2.5 px-3 align-top">
                      <select
                        value={row.pic}
                        onChange={(e) => handleRowChange(row.id, "pic", e.target.value as PicShortName)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-900 text-xs focus:ring-2 focus:ring-slate-900 cursor-pointer"
                      >
                        {PIC_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]] || p}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Kegiatan */}
                    <td className="py-2.5 px-3 align-top">
                      <textarea
                        rows={2}
                        placeholder={
                          row.division === "mbg"
                            ? "Misal: Produksi MBG SDN 01"
                            : "Misal: Produksi Pesanan PT SCG"
                        }
                        value={row.kegiatan}
                        onChange={(e) => handleRowChange(row.id, "kegiatan", e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 resize-y leading-relaxed min-h-[52px]"
                      />
                    </td>

                    {/* Keterangan */}
                    <td className="py-2.5 px-3 align-top">
                      <textarea
                        rows={2}
                        placeholder={
                          row.division === "mbg"
                            ? "Misal: 120 porsi porsi kecil saji..."
                            : "Misal: 50 box saji pukul 10.00..."
                        }
                        value={row.keterangan}
                        onChange={(e) => handleRowChange(row.id, "keterangan", e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:bg-white text-xs focus:ring-2 focus:ring-slate-900 resize-y leading-relaxed min-h-[52px]"
                      />
                    </td>

                    {/* Key ID */}
                    <td className="py-2.5 px-3 whitespace-nowrap align-top">
                      <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
                        <span className="text-xs font-mono font-bold text-slate-800">
                          {row.keyId}
                        </span>
                        <span className="text-[8px] font-bold uppercase text-slate-500 bg-slate-200 px-1 py-0.5 rounded ml-auto">
                          Auto
                        </span>
                      </div>
                    </td>

                    {/* Link Order / MBG */}
                    <td className="py-2.5 px-3 align-top">
                      <input
                        type="text"
                        placeholder="(Tugas Harian)"
                        value={row.orderLabel || ""}
                        onChange={(e) => handleRowChange(row.id, "orderLabel", e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-slate-900"
                      />
                    </td>

                    {/* Delete button */}
                    <td className="py-2.5 px-2 text-center align-top pt-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={rows.length === 1}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 cursor-pointer transition-colors"
                        title="Hapus baris"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Baris Tugas Baru</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold text-white bg-slate-950 hover:bg-slate-800 rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? "Menyimpan ke Database..." : `Simpan Semua Baris (${rows.length})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REKAP SEMUA JOB DESK & STATUS REVIEW CO_MO */}
      {/* ========================================================================= */}
      {activeTab === "table" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Filter Divisi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Filter Divisi
              </label>
              <select
                value={tableDivisionFilter}
                onChange={(e) => setTableDivisionFilter(e.target.value as "all" | "katering" | "mbg")}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">⚡ Semua Divisi ({jobDesks.length})</option>
                <option value="katering">🍱 Katering Reguler ({stats.kateringDesks})</option>
                <option value="mbg">🥛 Program MBG ({stats.mbgDesks})</option>
              </select>
            </div>

            {/* Filter by PIC */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Filter PIC Penugasan
              </label>
              <select
                value={selectedPic}
                onChange={(e) => setSelectedPic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">Semua PIC</option>
                {PIC_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {JOBDESK_ROLE_LABELS[PIC_NAME_TO_ROLE[p]] || p}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Cari Kata Kunci
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kegiatan, Key ID, PIC..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:ring-2 focus:ring-slate-900 focus:bg-white font-medium"
                />
              </div>
            </div>

            {/* Filter by Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Filter Tanggal
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <p className="text-xs font-bold text-slate-700">
                Menampilkan <span className="text-slate-950 font-black">{filteredJobDesks.length}</span> baris job desk
              </p>
              {(tableDivisionFilter !== "all" || selectedPic !== "all" || selectedDate || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setTableDivisionFilter("all");
                    setSelectedPic("all");
                    setSelectedDate("");
                    setSearchQuery("");
                  }}
                  className="text-xs font-bold text-amber-600 hover:text-amber-800 cursor-pointer underline"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {filteredJobDesks.length === 0 ? (
              <div className="text-center py-16">
                <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700">
                  Belum ada data job desk yang cocok
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Pilih tanggal dari tab "Jadwal & Pesanan Per Tanggal" untuk menyusun penugasan
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3.5 w-20">Divisi</th>
                      <th className="py-3 px-3.5 w-20">Hari</th>
                      <th className="py-3 px-3.5 w-24">Tanggal</th>
                      <th className="py-3 px-3.5 w-20 text-center">Start Time</th>
                      <th className="py-3 px-3.5 w-32">PIC</th>
                      <th className="py-3 px-3.5 min-w-[200px]">Kegiatan</th>
                      <th className="py-3 px-3.5 min-w-[220px]">Keterangan</th>
                      <th className="py-3 px-3.5 w-36 font-mono">Key ID</th>
                      <th className="py-3 px-3.5 w-28 text-center">Status PIC</th>
                      <th className="py-3 px-3.5 w-32 text-center">Review CO_MO</th>
                      <th className="py-3 px-2 w-16 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredJobDesks.map((jd) => (
                      <tr key={jd.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Divisi Badge */}
                        <td className="py-3 px-3.5">
                          {jd.division === "mbg" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <Milk className="h-3 w-3 text-emerald-600" />
                              MBG
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                              <UtensilsCrossed className="h-3 w-3 text-amber-600" />
                              Katering
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 font-bold text-slate-900">{jd.hari || "-"}</td>
                        <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap">{jd.tanggal || "-"}</td>
                        <td className="py-3 px-3.5 font-mono text-center font-bold text-slate-700">
                          {jd.startTime || "-"}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-800 border border-slate-200">
                            {jd.pic}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-900">
                          <span
                            onClick={() => setDetailJobDeskModal(jd)}
                            className="cursor-pointer hover:text-amber-600 transition-colors"
                          >
                            {jd.kegiatan || jd.title}
                          </span>
                          {(jd.orderLabel || jd.mbgInstitutionName) && (
                            <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                              {jd.division === "mbg" ? `Lembaga: ${jd.mbgInstitutionName || jd.orderLabel}` : `Pesanan: ${jd.orderLabel}`}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600">
                          {jd.keterangan || jd.description || "-"}
                          {jd.incompleteReason && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1">
                              Alasan: {jd.incompleteReason}
                            </p>
                          )}
                          {jd.rejectionRemark && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1">
                              Catatan CO_MO: {jd.rejectionRemark}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono font-extrabold text-slate-800 bg-slate-100 border border-slate-200">
                            {jd.keyId}
                          </span>
                        </td>
                        {/* Status PIC */}
                        <td className="py-3 px-3.5 text-center">
                          {jd.status === "complete" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Complete
                            </span>
                          ) : jd.status === "incomplete" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              <AlertCircle className="h-3 w-3" /> Incomplete
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                              <Clock className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </td>
                        {/* Review CO_MO */}
                        <td className="py-3 px-3.5 text-center">
                          {jd.reviewStatus === "approved" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </span>
                          ) : jd.reviewStatus === "rejected" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              <XCircle className="h-3 w-3" /> Rejected
                            </span>
                          ) : jd.reviewStatus === "pending_review" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                              <Clock className="h-3 w-3" /> Perlu Review
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Belum Submit</span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailJobDeskModal(jd)}
                              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Lihat detail"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDesk(jd.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Hapus job desk"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: DETAIL LENGKAP PESANAN KATERING */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {detailOrderModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200"
            >
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-white/10 rounded-lg">
                    <ShoppingBag className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                      Pesanan Katering #{detailOrderModal.id.slice(-6).toUpperCase()}
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {detailOrderModal.institutionName || detailOrderModal.recipientName}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailOrderModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-xs text-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Tanggal Acara:</p>
                      <p className="font-semibold text-slate-900">
                        {detailOrderModal.eventDate ? `${getHariFromDate(detailOrderModal.eventDate)}, ${formatIndoDate(detailOrderModal.eventDate)}` : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Jam Pengiriman:</p>
                      <p className="font-semibold text-slate-900">{formatIndoTime(detailOrderModal.deliveryTime || detailOrderModal.eventDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Nomor Telepon:</p>
                      <p className="font-semibold text-slate-900">{detailOrderModal.recipientPhone || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">Alamat Pengiriman:</p>
                      <p className="font-semibold text-slate-900">{detailOrderModal.deliveryAddress || "-"}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-slate-500" />
                    Daftar Menu & Jumlah Porsi
                  </h4>
                  {detailOrderModal.items && detailOrderModal.items.length > 0 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                            <th className="py-2 px-3 w-10 text-center">#</th>
                            <th className="py-2 px-3">Nama Menu</th>
                            <th className="py-2 px-3 text-center">Jumlah</th>
                            <th className="py-2 px-3">Catatan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {detailOrderModal.items.map((it, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60">
                              <td className="py-2 px-3 text-center font-medium text-slate-400">{idx + 1}</td>
                              <td className="py-2 px-3 font-semibold text-slate-900">{it.itemName}</td>
                              <td className="py-2 px-3 text-center font-bold text-slate-900">
                                {it.quantity} {it.unit || "porsi"}
                              </td>
                              <td className="py-2 px-3 text-slate-500">{it.notes || it.ingredients || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
                      {detailOrderModal.foodDetails || "Rincian menu katering standar"}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailOrderModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: DETAIL MBG INSTITUSI */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {detailMbgModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200"
            >
              <div className="p-5 bg-emerald-950 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-800/60 rounded-lg">
                    <Milk className="h-4 w-4 text-emerald-300" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-300">
                      Lembaga Program MBG • {detailMbgModal.entry.institutionType === "posyandu" ? "Posyandu" : "Sekolah"}
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {detailMbgModal.entry.institutionName}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailMbgModal(null)}
                  className="p-1.5 text-emerald-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-xs text-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Jadwal Batch Tanggal:</p>
                    <p className="font-semibold text-slate-900">
                      {detailMbgModal.batch?.tanggal ? formatIndoDate(detailMbgModal.batch.tanggal) : "Jadwal Reguler"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Tingkatan / Tipe:</p>
                    <p className="font-semibold text-slate-900 uppercase">
                      {detailMbgModal.entry.schoolLevel || detailMbgModal.entry.institutionType}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Total Porsi:</p>
                    <p className="font-bold text-emerald-700 text-sm">
                      {(detailMbgModal.entry.qtSiswaBalita || 0) +
                        (detailMbgModal.entry.qtGuruKader || 0) +
                        (detailMbgModal.entry.qtBumilBusui || 0)}{" "}
                      Porsi
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Alamat Pengantaran:</p>
                    <p className="font-semibold text-slate-900">{detailMbgModal.entry.address || "-"}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                    Rincian Penerima Makanan Bergizi:
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Siswa/Balita</span>
                      <strong className="text-sm font-bold text-slate-900">{detailMbgModal.entry.qtSiswaBalita || 0}</strong>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Guru/Kader</span>
                      <strong className="text-sm font-bold text-slate-900">{detailMbgModal.entry.qtGuruKader || 0}</strong>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-medium">Bumil & Busui</span>
                      <strong className="text-sm font-bold text-slate-900">{detailMbgModal.entry.qtBumilBusui || 0}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailMbgModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3: DETAIL JOB DESK SPESIFIK */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {detailJobDeskModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
            >
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-white/10 px-2 py-0.5 rounded text-amber-400">
                    {detailJobDeskModal.keyId}
                  </span>
                  <h3 className="text-sm font-bold text-white">Detail Baris Job Desk</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailJobDeskModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-700">
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Divisi:</p>
                    <p className="font-bold text-slate-900 uppercase">{detailJobDeskModal.division || "katering"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Hari & Tanggal:</p>
                    <p className="font-semibold text-slate-900">{detailJobDeskModal.hari}, {detailJobDeskModal.tanggal}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Jam Mulai:</p>
                    <p className="font-mono font-bold text-slate-900">{detailJobDeskModal.startTime}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Petugas (PIC):</p>
                    <p className="font-bold text-slate-900">{detailJobDeskModal.pic}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Kegiatan:</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{detailJobDeskModal.kegiatan}</p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Keterangan / Rincian:</p>
                  <p className="text-xs text-slate-700 mt-0.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {detailJobDeskModal.keterangan || "-"}
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Status Pengerjaan:</p>
                    <span className="font-semibold text-slate-800">{detailJobDeskModal.status}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400">Review CO_MO:</p>
                    <span className="font-semibold text-emerald-700">{detailJobDeskModal.reviewStatus}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailJobDeskModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MoJobDeskPage;
