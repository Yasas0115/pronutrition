import { redirect } from 'next/navigation';

// Accounts was split across Accounting › Stock value / Receivables / Sales /
// Activity log. Stock valuation was its landing tab, so send old links there.
export default function AccountsPage() {
  redirect('/accounting/stock-value');
}
