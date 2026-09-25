export type ShoppingListItem = {
  id: string;
  label: string;
  // Number of packages still to collect for this row.
  quantity: number;
  checked: boolean;
  productId?: string;
  // Explicit generic CanonicalType. Absent on notes and exact-product rows.
  genericType?: string;
  createdAt: string;
  checkedAt?: string;
};

export type ProductListInput = {
  productId: string;
  label: string;
  quantity?: number;
};

export type ShoppingListBatchSummary = {
  added: number;
  merged: number;
  skipped: number;
};

