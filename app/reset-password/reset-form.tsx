'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { resetPasswordAction, type FormState } from '@/app/password/actions';

export default function ResetForm({ token, email, minLength }: { token: string; email: string; minLength: number }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetPasswordAction, null);
  const [show, setShow] = useState(false);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="text-sm rounded-lg px-3 py-3"
          style={{ color: 'var(--color-ash)', background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}
        >
          Your password has been changed. You&apos;ve been signed out everywhere — sign in with the new one.
        </div>
        <Link href="/login" className="btn btn-primary btn-block">Go to sign in</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        New password for <b style={{ color: 'var(--color-strong)' }}>{email}</b>
      </p>

      <div>
        <label className="field-label" htmlFor="password">New password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            className="input pr-14"
            minLength={minLength}
            required
            autoFocus
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
        <p className="text-[12px] mt-1" style={{ color: 'var(--color-faint)' }}>At least {minLength} characters.</p>
      </div>

      <div>
        <label className="field-label" htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          name="confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          className="input"
          minLength={minLength}
          required
        />
      </div>

      {state && !state.ok && (
        <div
          className="text-sm rounded-lg px-3 py-2.5"
          style={{ color: 'var(--color-brand)', background: 'rgba(239, 68, 68, .1)', border: '1px solid rgba(239, 68, 68, .3)' }}
        >
          {state.error}
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
