export type OrderStatus =
  | 'PLACING'
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
  createdAt: string;
  updatedAt: string;
}
