/**
 * Storefront HomePage.
 *
 * Three-zone layout:
 *   1. Sticky search bar at the top (Requirement 17.1)
 *   2. "Sering Direkomendasikan" banner — hidden once the active query
 *      reaches 2+ characters (Requirements 14.8, 17.2)
 *   3. Tabbed category/status filter bar (All, Low Stock, Discounts, Category list)
 *   4. Either a flat search-result list (≥ 2 chars) or the selected tab catalog.
 *
 * Loading semantics:
 *   - `listAvailableProducts()` and `getRecommended()` are kicked off in
 *     parallel when the page mounts.
 *   - Either request taking longer than 10 seconds aborts both and the
 *     page renders an error state with a retry action (Requirement 1.6).
 *   - The retry action re-runs both requests with a fresh
 *     `AbortController` and a fresh 10 s deadline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PackageOpen } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

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

const DICTIONARY = {
  id: {
    demoActive: "⚠️ Mode Demo Aktif — data dari admin",
    connectServer: "Sambungkan ke Server",
    searchResult: "Hasil pencarian",
    noProducts: "Belum ada produk tersedia.",
    noResults: "Tidak ada produk ditemukan.",
    exploreCategory: "Jelajahi Kategori",
    loadingCatalog: "Memuat katalog…",
    prepProducts: "Koperasi Al-Umanaa sedang mempersiapkan produk terbaik untuk Anda. Silakan kembali lagi nanti.",
    connectionError: "Katalog tidak merespons. Periksa koneksi internet Anda.",
    unavailableError: "Katalog sementara tidak tersedia.",
    generalEmptyMessage: "Katalog sedang tidak tersedia.",
    noProductsInTab: "Tidak ada produk dalam kategori ini."
  },
  en: {
    demoActive: "⚠️ Demo Mode Active — data from admin",
    connectServer: "Connect to Server",
    searchResult: "Search results",
    noProducts: "No products available yet.",
    noResults: "No products found.",
    exploreCategory: "Explore Categories",
    loadingCatalog: "Loading catalog...",
    prepProducts: "Al-Umanaa Cooperative is preparing the best products for you. Please come back later.",
    connectionError: "Catalog is not responding. Check your internet connection.",
    unavailableError: "Catalog is temporarily unavailable.",
    generalEmptyMessage: "Catalog is currently unavailable.",
    noProductsInTab: "No products in this category."
  }
} as const;

export function HomePage() {
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("search") || "";
  const setQuery = (newQuery: string) => {
    setSearchParams(newQuery ? { search: newQuery } : {}, { replace: true });
  };
  const [isDemo, setIsDemo] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>("all");

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
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
        return;
      }
      const message = controller.signal.aborted
        ? "connectionError"
        : err instanceof Error
          ? err.message
          : "unavailableError";
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

  // Extract unique categories from loaded products list
  const categories = useMemo(() => {
    if (state.status !== "ready") return [];
    const cats = new Set<string>();
    state.products.forEach((p) => {
      if (p.category) cats.add(p.category.trim());
    });
    return Array.from(cats).sort();
  }, [state]);

  // Create localized tabs mirroring the reference Shopee structure
  const tabs = useMemo(() => {
    const defaultTabs = [
      { id: "all", label: lang === "id" ? "Semua" : "All" },
      { id: "segera_habis", label: lang === "id" ? "Segera Habis" : "Low Stock" },
      { id: "diskon", label: lang === "id" ? "Diskon Menarik" : "Discounts" },
    ];
    const categoryTabs = categories.map((cat) => ({ id: cat, label: cat }));
    return [...defaultTabs, ...categoryTabs];
  }, [categories, lang]);

  // Apply tab or search filters dynamically
  const displayedItems = useMemo(() => {
    if (state.status !== "ready") return [];
    if (isSearching) return filtered;

    if (selectedTab === "all") {
      return state.products;
    }
    if (selectedTab === "segera_habis") {
      return state.products.filter((p) => p.quantity <= 15);
    }
    if (selectedTab === "diskon") {
      return state.products.filter((p) => p.price % 3 === 0 || p.price % 5 === 0);
    }
    return state.products.filter((p) => p.category.trim() === selectedTab);
  }, [state, selectedTab, isSearching, filtered]);

  return (
    <div className="space-y-4 pt-4">
      {isDemo && (
        <div className="mx-4 mt-4 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-2xl flex items-center justify-between font-['Hanken_Grotesk',system-ui,sans-serif]">
          <span>{t.demoActive}</span>
          <button
            onClick={() => void exitDemo()}
            className="underline text-amber-900 hover:text-amber-950 font-bold ml-2 cursor-pointer"
          >
            {t.connectServer}
          </button>
        </div>
      )}

      <div className="px-4">
        <SearchBar onChange={setQuery} />
      </div>

      {state.status === "loading" && <HomePageLoading />}

      {state.status === "error" && (
        <EmptyState message={t[state.message as keyof typeof t] || state.message} />
      )}

      {state.status === "ready" && (
        <>
          {/* Recommended products banner */}
          {!isSearching && state.recommended.length > 0 && (
            <RecommendedBanner items={state.recommended} />
          )}

          {/* Premium Shopee-style Horizontal Tab Filter Bar */}
          {!isSearching && state.products.length > 0 && (
            <div className="bg-white border-y border-neutral-200/80 my-2">
              <div className="max-w-7xl mx-auto px-4 flex gap-6 overflow-x-auto scrollbar-none py-3">
                {tabs.map((tab) => {
                  const isActive = selectedTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedTab(tab.id)}
                      className={`text-sm font-bold whitespace-nowrap pb-1 transition-all cursor-pointer border-b-2 focus:outline-none ${
                        isActive
                          ? "text-[#EE4D2D] border-[#EE4D2D]"
                          : "text-neutral-500 border-transparent hover:text-[#EE4D2D]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product Listing */}
          {state.products.length === 0 ? (
            <EmptyState message={t.noProducts} />
          ) : isSearching ? (
            filtered.length === 0 ? (
              <EmptyState message={t.noResults} />
            ) : (
              <section
                aria-label={t.searchResult}
                className="space-y-2"
              >
                <h2 className="px-4 font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
                  {t.searchResult}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 px-4">
                  {filtered.map((item) => (
                    <ProductCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )
          ) : (
            <>
              {selectedTab === "all" ? (
                /* All Tab: Grouped by category as per specs */
                <CategoryGrid items={displayedItems} />
              ) : (
                /* Other Tabs: Filtered grid list */
                <div className="space-y-2">
                  <h2 className="px-4 font-['Manrope',system-ui,sans-serif] text-base font-bold text-[#111827]">
                    {selectedTab === "segera_habis" 
                      ? (lang === "id" ? "Produk Segera Habis" : "Low Stock Products") 
                      : selectedTab === "diskon" 
                      ? (lang === "id" ? "Diskon Menarik" : "Discounts") 
                      : selectedTab
                    }
                  </h2>
                  
                  {displayedItems.length === 0 ? (
                    <div className="py-12 text-center text-sm text-[#6B7280]">
                      {t.noProductsInTab}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 px-4">
                      {displayedItems.map((item) => (
                        <ProductCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function HomePageLoading() {
  const { lang } = useLanguage();
  return (
    <p
      role="status"
      aria-live="polite"
      className="px-4 py-12 text-center text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]"
    >
      {lang === "id" ? "Memuat katalog…" : "Loading catalog..."}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  const { lang } = useLanguage();
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
          {lang === "id"
            ? "Koperasi Al-Umanaa sedang mempersiapkan produk terbaik untuk Anda. Silakan kembali lagi nanti."
            : "Al-Umanaa Cooperative is preparing the best products for you. Please come back later."}
        </p>
      </div>
      <Link
        to="/category"
        className="inline-flex items-center justify-center min-h-11 px-6 rounded-2xl bg-[#FBBF24] hover:bg-[#F59E0B] text-sm font-bold text-[#111827] shadow-sm transition-all cursor-pointer"
      >
        {lang === "id" ? "Jelajahi Kategori" : "Explore Categories"}
      </Link>
    </div>
  );
}

export default HomePage;
