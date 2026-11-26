'use client';

import { startTransition } from 'react';
import { useRouter } from 'next/navigation';
import ErrorScreen from '@/components/ErrorScreen';

// Catches crashes in any page (and in the signed-in layout) below the root.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // reset() alone only re-renders; refresh() asks the server for the data again.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <main className="px-4">
      <ErrorScreen digest={error.digest} onRetry={retry} />
    </main>
  );
}
