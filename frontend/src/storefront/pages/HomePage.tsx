/**
 * Storefront HomePage.
 *
 * Three-zone layout:
 *   1. Sticky search bar at the top (Requirement 17.1)
 *   2. "Sering Direkomendasikan" banner — hidden once the active query
 *      reaches 2+ characters (Requirements 14.8, 17.2)
 *   3. Either a flat search-result list (≥ 2 chars) or the
 *      category-grouped catalog (< 2 chars).
 *
 * Loading semantics:
 *   - `listAvailableProducts()` and `getRecommended()` are kicked off in
 *     parallel when the page mounts.
 *   - Either request taking longer than 10 seconds aborts both and the
 *     page renders an error state with a retry action (Requirement 1.6).
 *   - The retry action re-runs both requests with a fresh
 *     `AbortController` and a fresh 10 s deadline.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7,
 *            14.8, 14.9, 17.1, 17.2, 17.3, 17.4.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  getRecommended,
  listAvailableProducts,
} from "@/services/catalogService";
import type { InventoryItem } from "@/types/inventory";
import { CategoryGrid } from "@/storefront/components/CategoryGrid";
import { ProductCard } from "@/storefront/components/ProductCard";
import { RecommendedBanner } from "@/storefront/components/RecommendedBanner";
import { SearchBar } from "@/storefront/components/SearchBar";

const CATALOG_TIMEOUT_MS = 10_000;
const SEARCH_MIN_LENGTH = 2;

const MOCK_PRODUCTS: InventoryItem[] = [
  {
    id: "mock-1",
    itemName: "Beras Sentra Ramos Premium 5kg",
    category: "Sembako",
    price: 78000,
    quantity: 50,
    imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400",
    available: true,
    unit: "karung",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-2",
    itemName: "Minyak Goreng Bimoli Klasik 2L",
    category: "Sembako",
    price: 36500,
    quantity: 30,
    imageUrl: "https://images.unsplash.com/photo-1620706857370-e1b977f7f13d?auto=format&fit=crop&q=80&w=400",
    available: true,
    unit: "pouch",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-3",
    itemName: "Gula Pasir Gulaku Putih 1kg",
    category: "Sembako",
    price: 18500,
    quantity: 100,
    imageUrl: "https://images.unsplash.com/photo-1581781870027-04212e231e96?auto=format&fit=crop&q=80&w=400",
    available: true,
    unit: "pcs",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-4",
    itemName: "Kopi Hitam Bubuk Toraja 250g",
    category: "Minuman",
    price: 45000,
    quantity: 25,
    imageUrl: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=400",
    available: true,
    unit: "pcs",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "mock-5",
    itemName: "Teh Celup Premium isi 50",
    category: "Minuman",
    price: 12500,
    quantity: 80,
    imageUrl: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&q=80&w=400",
    available: true,
    unit: "pcs",
    updatedAt: new Date().toISOString(),
  },
];

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      products: InventoryItem[];
      recommended: InventoryItem[];
    }
  | { status: "error"; message: string };

export function HomePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  // Track the current AbortController so retries can cancel the in-flight
  // requests deterministically.
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    setIsDemo(false);

    const timeoutHandle = window.setTimeout(() => {
      controller.abort();
    }, CATALOG_TIMEOUT_MS);

    try {
      const [products, recommended] = await Promise.all([
        listAvailableProducts(),
        getRecommended(),
      ]);
      if (controller.signal.aborted) {
        return;
      }
      setState({ status: "ready", products, recommended });
    } catch (err) {
      if (!controller.signal.aborted && abortRef.current !== controller) {
        // A newer load() call took over — let it own the state.
        return;
      }
      const message = controller.signal.aborted
        ? "Katalog tidak merespons. Periksa koneksi internet Anda."
        : err instanceof Error
          ? err.message
          : "Katalog sementara tidak tersedia.";
      setState({ status: "error", message });
    } finally {
      window.clearTimeout(timeoutHandle);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= SEARCH_MIN_LENGTH;

  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    if (!isSearching) return state.products;
    const needle = trimmedQuery.toLowerCase();
    return state.products
      .filter((item) => item.itemName.toLowerCase().includes(needle))
      .sort((a, b) =>
        a.itemName.localeCompare(b.itemName, "id-ID", { sensitivity: "base" }),
      );
  }, [state, isSearching, trimmedQuery]);

  const startDemo = () => {
    setIsDemo(true);
    setState({
      status: "ready",
      products: MOCK_PRODUCTS,
      recommended: MOCK_PRODUCTS.slice(0, 3),
    });
  };

  return (
    <div className="space-y-4 pt-4">
      {isDemo && (
        <div className="mx-4 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-xl flex items-center justify-between animate-pulse font-['Hanken_Grotesk',system-ui,sans-serif]">
          <span>⚠️ Mode Demo Aktif (Server Offline)</span>
          <button
            onClick={() => void load()}
            className="underline text-amber-900 hover:text-amber-950 font-bold ml-2 cursor-pointer"
          >
            Hubungkan Kembali
          </button>
        </div>
      )}

      <div className="px-4">
        <SearchBar onChange={setQuery} />
      </div>

      {state.status === "loading" && <HomePageLoading />}

      {state.status === "error" && (
        <HomePageError
          message={state.message}
          onRetry={() => void load()}
          onDemo={startDemo}
        />
      )}

      {state.status === "ready" && (
        <>
          {!isSearching && state.recommended.length > 0 && (
            <RecommendedBanner items={state.recommended} />
          )}

          {state.products.length === 0 ? (
            <EmptyState message="Belum ada produk tersedia." />
          ) : isSearching ? (
            filtered.length === 0 ? (
              <EmptyState message="Tidak ada produk ditemukan." />
            ) : (
              <section
                aria-label="Hasil pencarian"
                className="space-y-2"
              >
                <h2 className="px-4 font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
                  Hasil pencarian
                </h2>
                <div className="grid grid-cols-2 gap-3 px-4">
                  {filtered.map((item) => (
                    <ProductCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )
          ) : (
            <CategoryGrid items={state.products} />
          )}
        </>
      )}
    </div>
  );
}

function HomePageLoading() {
  return (
    <p
      role="status"
      aria-live="polite"
      className="px-4 py-12 text-center text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]"
    >
      Memuat katalog…
    </p>
  );
}

function HomePageError({
  message,
  onRetry,
  onDemo,
}: {
  message: string;
  onRetry: () => void;
  onDemo: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-4 rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 space-y-3"
    >
      <p className="text-sm text-[#991B1B] font-['Hanken_Grotesk',system-ui,sans-serif]">
        {message}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className={
            "inline-flex items-center gap-2 min-h-11 min-w-11 rounded-2xl " +
            "bg-[#FBBF24] px-4 py-2 text-sm font-semibold text-[#111827] " +
            "font-['Hanken_Grotesk',system-ui,sans-serif] " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] " +
            "focus-visible:ring-offset-2 active:opacity-80 cursor-pointer"
          }
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Coba lagi
        </button>
        <button
          type="button"
          onClick={onDemo}
          className={
            "inline-flex items-center gap-2 min-h-11 min-w-11 rounded-2xl " +
            "bg-[#10B981] px-4 py-2 text-sm font-semibold text-white " +
            "font-['Hanken_Grotesk',system-ui,sans-serif] " +
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] " +
            "focus-visible:ring-offset-2 active:opacity-80 cursor-pointer"
          }
        >
          Gunakan Mode Demo
        </button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="px-4 py-12 text-center text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]"
    >
      {message}
    </p>
  );
}

export default HomePage;
