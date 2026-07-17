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
  ingredients?: string;
  notes?: string;
  deliveryAddress?: string;
  deliveryTime?: string;
  recipientName?: string;
  price?: number;
  unit?: string;
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
  additionalFee?: number;
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
  isPreOrder?: boolean;

  // Optional/Legacy fields (kept for backward compatibility and references)
  customerId?: string;
  customerName?: string;
  rejectionReason?: string;
  outOfStockItems?: string[];
  stockWarnings?: string[];
  courierSickReported?: boolean;
  courierSickRemark?: string;
  assignedCourierId?: string;
  productionStartedBy?: string;
  productionStartedAt?: string;
  qcReviewedBy?: string;
  qcReviewedAt?: string;
  qcFailReason?: string;
  deliveredAt?: string;
  proofFileIds?: string[];
  deliveryProofPhotos?: { fileId: string; description: string }[];
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
  promoCode?: string;
  discountAmount?: number;
  kitchen?: string;
  /** Per-item kitchen assignment: maps itemId → kitchen name. */
  itemKitchens?: Record<string, string>;
  qaStartChecklist?: {
    kebersihan: boolean;
    kelengkapanBahan: boolean;
    suhuPenyimpanan: boolean;
  };
  kitchenSignatures?: KitchenSignature[];
  createdAt: string;
  updatedAt: string;
}

export interface KitchenSignature {
  kitchenName: string;
  signatureDataUrl: string;
  staffName: string;
  signedAt: string;
}

