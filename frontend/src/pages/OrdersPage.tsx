import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApiError } from "@/services/apiClient";
import { createOrder, type PaymentMethod } from "@/services/orderService";
import { subscribeOrders } from "@/services/realtimeService";
import type { Order, OrderLineItem } from "@/types/order";

interface FormItem extends OrderLineItem {
  uid: string;
}

const newItem = (): FormItem => ({
  uid: crypto.randomUUID(),
  itemId: "",
  itemName: "",
  quantity: 1,
});

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [items, setItems] = useState<FormItem[]>([newItem()]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return subscribeOrders(setOrders, console.error);
  }, []);

  const reset = () => {
    setCustomerName("");
    setDeliveryAddress("");
    setDeliveryTime("");
    setItems([newItem()]);
    setPaymentMethod("cod");
    setErrors({});
    setBannerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setBannerError(null);
    setSuccess(null);
    try {
      const created = await createOrder({
        customerName: customerName.trim(),
        deliveryAddress: deliveryAddress.trim(),
        deliveryTime: deliveryTime.trim(),
        items: items.map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: item.quantity,
        })),
        paymentMethod,
      });
      setSuccess(`Order ${created.id.slice(0, 8)}… created with status ${created.status}`);
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details && err.details.length > 0) {
          const map: Record<string, string> = {};
          for (const d of err.details) map[d.field] = d.reason;
          setErrors(map);
        }
        setBannerError(err.message);
      } else {
        setBannerError(err instanceof Error ? err.message : "Failed to create order");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        subtitle="Submit a new order or browse the full order list."
      />

      <Card>
        <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827] mb-4">
          New order
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Customer name"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              error={errors.customerName}
              placeholder="e.g. Budi Santoso"
            />
            <Input
              label="Delivery address"
              required
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              error={errors.deliveryAddress}
              placeholder="Jl. Merdeka No.1, Jakarta"
            />
            <Input
              label="Delivery time"
              required
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
              error={errors.deliveryTime}
              placeholder="e.g. 12:00 PM or Lunch"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-medium text-[#374151]">
                Items
              </label>
              <Button
                type="button"
                variant="outlined"
                size="sm"
                leftIcon={<Plus className="h-3 w-3" />}
                onClick={() => setItems((s) => [...s, newItem()])}
              >
                Add item
              </Button>
            </div>
            <div className="hidden md:grid grid-cols-[1fr_2fr_120px_auto] gap-2 mb-1.5 px-1 font-['Hanken_Grotesk',system-ui,sans-serif] text-xs font-medium text-[#374151]">
              <div>Item ID</div>
              <div>Item name</div>
              <div>Qty</div>
              <div className="w-[38px]"></div>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={it.uid}
                  className="grid grid-cols-[2.5fr_4fr_2fr_auto] md:grid-cols-[1fr_2fr_120px_auto] gap-2 items-center"
                >
                  <Input
                    placeholder="SKU-001"
                    value={it.itemId}
                    onChange={(e) =>
                      setItems((s) =>
                        s.map((x) =>
                          x.uid === it.uid ? { ...x, itemId: e.target.value } : x
                        )
                      )
                    }
                    error={errors[`items[${idx}].itemId`]}
                  />
                  <Input
                    placeholder="e.g. Beras 5kg"
                    value={it.itemName}
                    onChange={(e) =>
                      setItems((s) =>
                        s.map((x) =>
                          x.uid === it.uid ? { ...x, itemName: e.target.value } : x
                        )
                      )
                    }
                    error={errors[`items[${idx}].itemName`]}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={String(it.quantity)}
                    onChange={(e) =>
                      setItems((s) =>
                        s.map((x) =>
                          x.uid === it.uid
                            ? { ...x, quantity: parseInt(e.target.value, 10) || 0 }
                            : x
                        )
                      )
                    }
                    error={errors[`items[${idx}].quantity`]}
                  />
                  <Button
                    type="button"
                    variant="outlined"
                    size="sm"
                    className="p-3"
                    onClick={() =>
                      setItems((s) =>
                        s.length > 1 ? s.filter((x) => x.uid !== it.uid) : s
                      )
                    }
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {errors.items && (
              <p
                role="alert"
                className="mt-2 text-xs text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]"
              >
                {errors.items}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="payment-method"
              className="block mb-1.5 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-medium text-[#374151]"
            >
              Payment method
            </label>
            <select
              id="payment-method"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PaymentMethod)
              }
              className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] font-['Hanken_Grotesk',system-ui,sans-serif] focus:border-[#FBBF24] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]/40"
            >
              <option value="cod">Bayar di Tempat (COD)</option>
              <option value="bank_transfer">Transfer Bank</option>
              <option value="e_wallet">E-Wallet</option>
            </select>
            {errors.paymentMethod && (
              <p
                role="alert"
                className="mt-1 text-xs text-[#EF4444] font-['Hanken_Grotesk',system-ui,sans-serif]"
              >
                {errors.paymentMethod}
              </p>
            )}
          </div>

          {bannerError && (
            <div className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-4 py-3 text-sm text-[#991B1B] font-['Hanken_Grotesk',system-ui,sans-serif]">
              {bannerError}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-[#D1FAE5] border border-[#A7F3D0] px-4 py-3 text-sm text-[#065F46] font-['Hanken_Grotesk',system-ui,sans-serif]">
              {success}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" loading={submitting}>
              Submit order
            </Button>
            <Button type="button" variant="outlined" onClick={reset}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3 border-b border-[#E5E7EB]">
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
            Recent orders
          </h3>
        </div>
        <ul className="divide-y divide-[#E5E7EB]">
          {orders.slice(0, 25).map((o) => (
            <li key={o.id} className="px-6 py-3 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm font-semibold text-[#111827] truncate">
                  {o.customerName}
                </p>
                <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280]">
                  {o.items.length} item(s) · {new Date(o.createdAt).toLocaleString()}
                </p>
              </div>
              <StatusBadge status={o.status} />
            </li>
          ))}
          {orders.length === 0 && (
            <li className="px-6 py-8 text-center text-sm text-[#6B7280] font-['Hanken_Grotesk',system-ui,sans-serif]">
              No orders yet.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

export default OrdersPage;
