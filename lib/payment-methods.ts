// Default payment methods and their auto-applied discounts. Created on first-run
// registration (and by the seed) when the PaymentMethod table is empty.
export const DEFAULT_PAYMENT_METHODS = [
  { key: 'CASH', label: 'Cash', discountPercent: 10, sortOrder: 0 },
  { key: 'CARD', label: 'Card', discountPercent: 7, sortOrder: 1 },
  { key: 'KOKO', label: 'Koko', discountPercent: 0, sortOrder: 2 },
];
