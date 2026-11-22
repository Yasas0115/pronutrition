'use client';

import { useActionState } from 'react';
import { forgotPasswordAction, type FormState } from '@/app/password/actions';
import { useT } from '@/components/I18nProvider';

export default function ForgotForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState<FormState, FormData>(forgotPasswordAction, null);

  // Same message whether or not the address is registered.
  if (state?.ok) {
    return (
      <div
        className="text-sm rounded-lg px-3 py-3"
        style={{ color: 'var(--color-ash)', background: 'var(--color-ink-1)', border: '1px solid var(--color-line-2)' }}
      >
        {t("If that email belongs to an account, we've sent a link to set a new password. It works once and expires in 30 minutes. Check your spam folder if it doesn't arrive.")}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {t("Enter the email you sign in with and we'll send you a link to set a new password.")}
      </p>
      <div>
        <label className="field-label" htmlFor="email">{t("Email")}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          className="input"
          placeholder={t("you@company.com")}
          required
          autoFocus
        />
      </div>

      {state && !state.ok && (
        <div
          className="text-sm rounded-lg px-3 py-2.5"
          style={{ color: 'var(--color-brand)', background: 'rgba(239, 68, 68, .1)', border: '1px solid rgba(239, 68, 68, .3)' }}
        >
          {t(state.error)}
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-block" aria-busy={pending} disabled={pending}>
        {pending ? t("Sending…") : t("Send reset link")}
      </button>
    </form>
  );
}
