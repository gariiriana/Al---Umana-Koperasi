// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'buyer' } } }));
vi.mock('@/services/authService', () => ({ currentUser: () => ({ uid: 'buyer' }), getIdToken: async () => 'id-token' }));
vi.mock('@/services/whatsappService', () => ({
  sendWhatsAppNotification: vi.fn(async () => {}), sendWhatsAppNotificationDirect: vi.fn(async () => {}),
  WA_MESSAGES: { placedCOD: () => '', placedNonCOD: () => '' },
}));
vi.mock('@/services/notificationWriter', () => ({ pushNotification: vi.fn(async () => {}), shortOrderId: (id: string) => id.slice(-6) }));

import { ApiError } from '@/services/apiClient';
import { createOrder, type CreateOrderPayload } from '@/services/orderService';

const payload: CreateOrderPayload = {
  requestId: 'f3b1c2d4-0000-4000-8000-000000000001', customerName: 'Buyer', deliveryAddress: 'Jl. Pesantren 1',
  deliveryTime: '', items: [{ itemId: 'nasi', quantity: 2, notes: '' }], paymentMethod: 'cod',
};
const respond = (status: number, body: string, type = 'application/json') =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers: { 'content-type': type } }));

afterEach(() => { vi.restoreAllMocks(); });

it('posts the choice to the checkout server with the idempotency key and returns its order', async () => {
  const fetch = respond(201, JSON.stringify({
    id: 'abc123', customerId: 'buyer', customerName: 'Buyer', status: 'CONFIRMED', paymentMethod: 'cod',
    items: [{ itemId: 'nasi', itemName: 'Nasi', quantity: 2, price: 8000 }], totalPrice: 28000, additionalFee: 12000,
    createdAt: '2026-10-23T08:00:00Z', updatedAt: '2026-10-23T08:00:00Z',
  }));
  const order = await createOrder(payload);
  expect(order).toMatchObject({ id: 'abc123', status: 'CONFIRMED', totalPrice: 28000 });
  const [url, init] = fetch.mock.calls[0];
  expect(String(url)).toMatch(/\/api\/orders$/);
  const headers = new Headers(init?.headers);
  expect(headers.get('Idempotency-Key')).toBe(payload.requestId);
  expect(headers.get('Authorization')).toBe('Bearer id-token');
  expect(JSON.parse(String(init?.body))).not.toHaveProperty('requestId');
});

it('fails clearly when a host without the checkout server answers with the app page', async () => {
  respond(200, '<!doctype html><html></html>', 'text/html');
  await expect(createOrder(payload)).rejects.toThrow(/Server pesanan tidak merespons/);
});

it('surfaces out-of-stock items without retrying', async () => {
  const fetch = respond(409, JSON.stringify({ error: { code: 'OUT_OF_STOCK', message: 'habis', details: [{ field: 'nasi', reason: 'out_of_stock' }] } }));
  const error = await createOrder(payload).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).details?.map((d) => d.field)).toEqual(['nasi']);
  expect(fetch).toHaveBeenCalledTimes(1);
});
