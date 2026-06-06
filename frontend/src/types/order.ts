// Status Operasional
export type OrderStatus =
  | 'PENDING'
  | 'IN_PRODUCTION'
  | 'QC'
  | 'READY_TO_DELIVER'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'DELIVERY_FAILED'
  | 'PLACING'
  | 'AWAITING_PAYMENT_PROOF'
  | 'AWAITING_PAYMENT_APPROVAL'
  | 'PAYMENT_REJECTED'
  | 'CONFIRMED'
  | 'READY'
  | 'DELIVERED'
  | 'FAILED';

// Status Pembayaran (jalur terpisah)
export type PaymentStatus = 'BELUM_DIBAYAR' | 'SUDAH_DIBAYAR' | 'JATUH_TEMPO';

// Jenis Pesanan
export type OrderType = 'event' | 'rutin';

export interface OrderLineItem {
  itemId: string;
  itemName: string;
  quantity: number;
  imageUrl?: string;
}

export interface ManualValidation {
  validatedBy: string;
  validatedAt: string;
  screenshotFileIds: string[];
  contactPhone: string;
  notes: string;
}

export interface Order {
  id: string;
  orderType: OrderType;
  institutionName: string;
  recipientName: string;
  recipientPhone: string;
  recipientNotes?: string;
  eventDate: string;
  foodDetails: string;
  drinkDetails: string;
  totalPrice: number;
  additionalNotes?: string;
  paymentStatus: PaymentStatus;
  paymentDueDate: string;
  invoiceToken?: string;
  invoiceSignedAt?: string;
  invoiceSignatureData?: string;
  manualValidation?: ManualValidation;
  adminComplaintNotes?: string;
  adminComplaintPhotoId?: string;
  status: OrderStatus;
  items: OrderLineItem[];
  deliveryAddress: string;
  deliveryTime: string;

  // Optional/Legacy fields (kept for backward compatibility and references)
  customerId?: string;
  customerName?: string;
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
  paymentMethod?: 'cod' | 'bank_transfer' | 'e_wallet';
  paymentProofFileId?: string;
  paymentApprovedBy?: string;
  paymentApprovedAt?: string;
  paymentRejectedBy?: string;
  paymentRejectedAt?: string;
  paymentRejectionReason?: string;
  productionStartPhotoId?: string;
  productionTimerEnd?: string;
  productionDurationMinutes?: number;
  deliveryStartPhotoId?: string;
  deliveryTimerEnd?: string;
  deliveryStartedAt?: string;
  deliveryDurationMinutes?: number;
  courierLat?: number;
  courierLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  customerConfirmedAt?: string;
  rating?: number;
  review?: string;
  reviewPhotoId?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

