export type CartItem = {
  id: number;
  productId: string;
  productName?: string | null;
  productCode?: string | null;
  unitPrice?: number | null;
  salePrice?: number | null;
  quantity: number;
  lineTotal?: number | null;
  priceDisplayMode?: string | null;
  imageUrl?: string | null;
  imageEndpoint?: string | null;
  hasImageBinary?: boolean;
};

export type Cart = {
  items: CartItem[];
  totalQuantity: number;
  grandTotal: number;
  // Basket age info from the server, for offering "Resume" or "Start new".
  lastActivityAt?: string | null;
  serverTime?: string | null;
  stale?: boolean;
  staleThresholdMs?: number | null;
};
