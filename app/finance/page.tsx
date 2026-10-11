import { redirect } from 'next/navigation';

// Profit & Expenses was split into Accounting › Profit & Cash and Expenses &
// Payroll. Profit & loss was its landing tab, so send old links there.
export default function FinancePage() {
  redirect('/accounting/profit');
}
