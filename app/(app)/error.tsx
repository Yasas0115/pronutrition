'use client';

import { startTransition } from 'react';
import { useRouter } from 'next/navigation';
import ErrorScreen from '@/components/ErrorScreen';

// A crash in one of these pages stays inside the shared shell, so the sidebar and
// header keep working and staff can move to another screen.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return <ErrorScreen digest={error.digest} onRetry={retry} />;
}
