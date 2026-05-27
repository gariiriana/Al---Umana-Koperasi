import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { listAvailableProducts } from "@/services/catalogService";
import type { InventoryItem } from "@/types/inventory";
import { ProductCard } from "@/storefront/components/ProductCard";

/**
 * CategoryPage — lists available products in a single category.
 *
 * - Reads `:name` from the URL via `useParams` and decodes it before
 *   calling the catalog API so spaces and Indonesian characters survive
 *   round-trip through the route.
 * - Calls `listAvailableProducts({ category })` on mount.
 * - 10-second timeout fires an error UI with retry (Requirement 1.6).
 * - Empty state with back-to-home link (Requirement 1.7 generalized to a
 *   single-category empty result).
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8.
 */

const CATALOG_TIMEOUT_MS = 10_000;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; items: InventoryItem[] }
  | { status: "error"; message: string };

export function CategoryPage() {
  const { name } = useParams<{ name: string }>();
  // Decode the URL-encoded segment so the API receives the literal
  // category string (e.g. "Makanan Siap Saji").
  const categoryName = name ? safeDecode(name) : "";

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(() => {
    if (!categoryName) {
      setState({
        status: "error",
        message: "Kategori tidak ditemukan.",
      });
      return;
    }

    setState({ status: "loading" });

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setState({
        status: "error",
        message: "Kategori sementara tidak dapat dimuat. Silakan coba lagi.",
      });
    }, CATALOG_TIMEOUT_MS);

    listAvailableProducts({ category: categoryName })
      .then((items) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setState({ status: "ready", items });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setState({
          status: "error",
          message: "Kategori sementara tidak dapat dimuat. Silakan coba lagi.",
        });
      });
  }, [categoryName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-4 py-5 space-y-4">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
          Kategori
        </p>
        <h1 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-[#111827]">
          {categoryName || "Kategori"}
        </h1>
      </header>

      {state.status === "loading" ? (
        <div
          role="status"
          className="flex items-center justify-center py-16 text-[#6B7280]"
        >
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <span className="ml-2 text-sm">Memuat produk…</span>
        </div>
      ) : null}

      {state.status === "error" ? (
        <ErrorState message={state.message} onRetry={load} />
      ) : null}

      {state.status === "ready" && state.items.length === 0 ? (
        <EmptyState />
      ) : null}

      {state.status === "ready" && state.items.length > 0 ? (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {state.items.map((item) => (
            <li key={item.id}>
              <ProductCard item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center space-y-3"
    >
      <p className="text-sm text-red-900">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={
          "inline-flex items-center justify-center min-h-11 px-4 rounded-xl " +
          "bg-[#FBBF24] text-[#111827] font-medium " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2"
        }
      >
        Coba Lagi
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center space-y-4">
      <p className="text-sm text-[#6B7280]">
        Belum ada produk di kategori ini.
      </p>
      <Link
        to="/"
        className={
          "inline-flex items-center justify-center min-h-11 px-4 rounded-xl " +
          "bg-[#111827] text-white font-medium " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2"
        }
      >
        Kembali ke Beranda
      </Link>
    </div>
  );
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    // Malformed URI sequences fall back to the raw segment so we still
    // render something sensible.
    return raw;
  }
}

export default CategoryPage;
