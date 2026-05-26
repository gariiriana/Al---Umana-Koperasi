export type OrderStatus =
  | 'PLACING'
  | 'AWAITING_PAYMENT_PROOF'
  | 'AWAITING_PAYMENT_APPROVAL'
  | 'PAYMENT_REJECTED'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'READY_TO_DELIVER'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED';

export interface OrderLineItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  items: OrderLineItem[];
  deliveryAddress: string;
  deliveryTime: string;
  status: OrderStatus;
  rejectionReason?: string;
  outOfStockItems?: string[];
  assignedCourierId?: string;
  productionStartedBy?: string;
  productionStartedAt?: string;
  qcReviewedBy?: string;
  qcReviewedAt?: string;
  qcFailReason?: string;
  deliveredAt?: string;
  proofFileIds?: string[];
  paymentProofFileId?: string;
  createdAt: string;
  updatedAt: string;
}
