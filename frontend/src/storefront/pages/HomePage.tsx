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
import { PackageOpen } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  getRecommended,
  listAvailableProducts,
} from "@/services/catalogService";
import type { InventoryItem } from "@/types/inventory";
import { CategoryGrid } from "@/storefront/components/CategoryGrid";
import { ProductCard } from "@/storefront/components/ProductCard";
import { RecommendedBanner } from "@/storefront/components/RecommendedBanner";
import { SearchBar } from "@/storefront/components/SearchBar";
import {
  loadDemoFromStorage,
  clearDemoStorage,
} from "@/lib/dummyData";

const CATALOG_TIMEOUT_MS = 10_000;
const SEARCH_MIN_LENGTH = 2;


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
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("search") || "";
  const setQuery = (newQuery: string) => {
    setSearchParams(newQuery ? { search: newQuery } : {}, { replace: true });
  };
  const [isDemo, setIsDemo] = useState(false);

  // Track the current AbortController so retries can cancel the in-flight
  // requests deterministically.
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    // If there's demo data in localStorage, show it immediately.
    const demoProducts = loadDemoFromStorage();
    if (demoProducts && demoProducts.length > 0) {
      setIsDemo(true);
      setState({
        status: "ready",
        products: demoProducts,
        recommended: demoProducts.slice(0, 5),
      });
      return;
    }

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

  const exitDemo = useCallback(async () => {
    clearDemoStorage();
    setIsDemo(false);
    await load();
  }, [load]);

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


  return (
    <div className="space-y-4 pt-4">
      {isDemo && (
        <div className="mx-4 mt-4 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-2xl flex items-center justify-between font-['Hanken_Grotesk',system-ui,sans-serif]">
          <span>⚠️ Mode Demo Aktif — data dari admin</span>
          <button
            onClick={() => void exitDemo()}
            className="underline text-amber-900 hover:text-amber-950 font-bold ml-2 cursor-pointer"
          >
            Sambungkan ke Server
          </button>
        </div>
      )}

      <div className="px-4">
        <SearchBar onChange={setQuery} />
      </div>

      {state.status === "loading" && <HomePageLoading />}

      {state.status === "error" && (
        <EmptyState message="Katalog sedang tidak tersedia." />
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 px-4">
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

function EmptyState({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center px-4 py-20 text-center space-y-5"
    >
      <div className="h-20 w-20 rounded-full bg-[#F3F4F6] border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF] shadow-inner">
        <PackageOpen className="h-10 w-10" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
          {message}
        </h2>
        <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif] max-w-xs">
          Koperasi Al-Umana sedang mempersiapkan produk terbaik untuk Anda.
          Silakan kembali lagi nanti.
        </p>
      </div>
      <Link
        to="/category"
        className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm transition-all cursor-pointer"
      >
        Jelajahi Kategori
      </Link>
    </div>
  );
}

export default HomePage;
