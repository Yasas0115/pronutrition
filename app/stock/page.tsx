import { redirect } from 'next/navigation';

// Stock control was merged into the unified Products & Stock page. Keep this
// route as a permanent redirect so old links / bookmarks still land correctly.
export default function StockPage() {
  redirect('/products');
}
