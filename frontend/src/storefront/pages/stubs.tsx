/**
 * Placeholder pages for storefront routes that will be filled in by later
 * tasks (9.4 CategoryPage/ProductDetailPage, 9.6 CartPage,
 * 10.2 AddressStep, 10.3 PaymentMethodStep, 10.6 PaymentProofUploadPage,
 * 10.8 OrderListPage/OrderDetailPage). Keeping them in a single file makes
 * the routing task self-contained — each stub is one tiny component.
 *
 * The HomePage stub previously exported here was promoted to a real
 * implementation in `frontend/src/storefront/pages/HomePage.tsx` as part
 * of task 9.2.
 */

import { useParams } from "react-router-dom";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-['Manrope',system-ui,sans-serif] text-xl font-bold text-[#111827]">
      {children}
    </h1>
  );
}

function StubFrame({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="px-4 py-6 space-y-2">
      <Heading>{title}</Heading>
      {detail ? (
        <p className="text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export function CategoryIndexStub() {
  return (
    <StubFrame
      title="Kategori"
      detail="Daftar kategori akan dibangun di task 9.4."
    />
  );
}

export function CategoryPageStub() {
  const { name } = useParams<{ name: string }>();
  return (
    <StubFrame
      title={`Kategori: ${name ?? ""}`}
      detail="CategoryPage akan dibangun di task 9.4."
    />
  );
}

export function ProductDetailPageStub() {
  const { id } = useParams<{ id: string }>();
  return (
    <StubFrame
      title={`Produk ${id ?? ""}`}
      detail="ProductDetailPage akan dibangun di task 9.4."
    />
  );
}

export function CartPageStub() {
  return (
    <StubFrame title="Keranjang" detail="CartPage akan dibangun di task 9.6." />
  );
}

export function AddressStepStub() {
  return (
    <StubFrame
      title="Alamat Pengiriman"
      detail="AddressStep akan dibangun di task 10.2."
    />
  );
}

export function PaymentMethodStepStub() {
  return (
    <StubFrame
      title="Metode Pembayaran"
      detail="PaymentMethodStep akan dibangun di task 10.3."
    />
  );
}

export function PaymentProofUploadPageStub() {
  const { orderId } = useParams<{ orderId: string }>();
  return (
    <StubFrame
      title={`Unggah Bukti Pembayaran ${orderId ?? ""}`}
      detail="PaymentProofUploadPage akan dibangun di task 10.6."
    />
  );
}

export function OrderListPageStub() {
  return (
    <StubFrame
      title="Pesanan Saya"
      detail="OrderListPage akan dibangun di task 10.8."
    />
  );
}

export function OrderDetailPageStub() {
  const { id } = useParams<{ id: string }>();
  return (
    <StubFrame
      title={`Detail Pesanan ${id ?? ""}`}
      detail="OrderDetailPage akan dibangun di task 10.8."
    />
  );
}
