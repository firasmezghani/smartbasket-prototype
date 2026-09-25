export type PurchaseHistoryType = 'smart_basket';

export type PurchaseHistorySummary = {
  id: string;
  type: PurchaseHistoryType;
  sourceLabel: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  itemCount: number;
  uniqueProductCount: number | null;
  total: number | null;
  estimatedTotal: number | null;
  summary: string;
  validationStatus?: string | null;
  validatedBy?: string | null;
};

export type CashierValidationRecord = {
  id: number;
  sessionId: number;
  validatedBy: string | null;
  validationStatus: string;
  notes: string | null;
  createdAt: string;
};

export type PurchaseHistoryLineItem = {
  id: number;
  productId?: string;
  productCode?: string | null;
  productName: string;
  barcodeSnapshot?: string | null;
  quantity: number;
  unitPrice?: number | null;
  unitPriceSnapshot?: number | null;
  lineTotal?: number | null;
};

export type PurchaseHistoryDetail = {
  id: string;
  type: PurchaseHistoryType;
  sourceLabel: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  itemCount: number;
  uniqueProductCount: number | null;
  total: number | null;
  estimatedTotal: number | null;
  summary: string;
  session: {
    id: number;
    customerId: number;
    status: string;
    expiresAt: string;
    createdAt: string;
    validatedAt: string | null;
    rejectedAt: string | null;
    cancelledAt: string | null;
    validationNote: string | null;
  } | null;
  items: PurchaseHistoryLineItem[];
  validations: CashierValidationRecord[];
  validationNote: string | null;
  latestValidation?: CashierValidationRecord | null;
};
