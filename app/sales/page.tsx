import { redirect } from 'next/navigation';

// Sales & Reports moved under Accounting. Keep this route as a permanent
// redirect so old links / bookmarks still land correctly.
export default function SalesPage() {
  redirect('/accounting/sales');
}
