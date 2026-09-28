'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, type LoginResult } from '@/app/actions';

export default function LoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<LoginResult | null, FormData>(
    loginAction,
    null,
  );
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      router.replace('/');
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="field-label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          className="input"
          placeholder="you@company.com"
          required
        />
      </div>

      <div>
        <label className="field-label" htmlFor="password">Password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            className="input pr-14"
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] uppercase tracking-wider px-2 py-1"
            style={{ color: 'var(--color-muted)' }}
            tabIndex={-1}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {state && !state.ok && (
        <div
          className="text-sm rounded-lg px-3 py-2.5"
          style={{
            color: 'var(--color-brand)',
            background: 'rgba(239, 68, 68, .1)',
            border: '1px solid rgba(239, 68, 68, .3)',
          }}
        >
          {state.error}
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
