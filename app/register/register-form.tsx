'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerAction, type RegisterResult } from '@/app/actions';
import { ALL_MODULES } from '@/lib/modules';

export default function RegisterForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RegisterResult | null, FormData>(registerAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.replace('/');
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="company">Company name</label>
          <input id="company" name="company" className="input" placeholder="Pro Nutrition" defaultValue="Pro Nutrition" required />
        </div>
        <div>
          <label className="field-label" htmlFor="branch">First branch</label>
          <input id="branch" name="branch" className="input" placeholder="Colombo (Main)" defaultValue="Colombo (Main)" required />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" placeholder="Store Owner" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="email">Owner email</label>
          <input id="email" name="email" type="email" autoComplete="username" className="input" placeholder="owner@store.local" required />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" className="input" placeholder="At least 6 characters" required />
        </div>
      </div>

      <div>
        <label className="field-label">Modules to enable</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {ALL_MODULES.map((m) => (
            <label key={m.key} className="flex items-center gap-2 cursor-pointer select-none text-[13px]" style={{ opacity: m.locked ? 0.6 : 1, color: 'var(--color-ash)' }}>
              <input
                type="checkbox"
                name="modules"
                value={m.key}
                defaultChecked
                disabled={m.locked}
                style={{ width: 15, height: 15, accentColor: 'var(--color-brand)' }}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {state && !state.ok && (
        <div className="text-sm rounded-lg px-3 py-2.5" style={{ color: 'var(--color-brand)', background: 'rgba(239, 68, 68, .1)', border: '1px solid rgba(239, 68, 68, .3)' }}>
          {state.error}
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Setting up…' : 'Create company & sign in'}
      </button>

      <div className="text-center text-[13px]" style={{ color: 'var(--color-muted)' }}>
        Already set up? <Link href="/login" className="accent">Sign in</Link>
      </div>
    </form>
  );
}
