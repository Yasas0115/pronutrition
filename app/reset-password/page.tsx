import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { checkResetToken, TOKEN_PROBLEM, MIN_NEW_PASSWORD } from '@/lib/password-reset';
import ResetForm from './reset-form';

export const dynamic = 'force-dynamic';

// The page an emailed link opens. The token is checked on the server before any
// form is shown; the form posts it back and it is checked again, atomically,
// when the password is actually changed.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const check = await checkResetToken(token);

  return (
    <AuthShell>
      <div className="auth-card">
        <div className="auth-card__logo">
          <span className="brand" style={{ fontSize: 34 }}>
            PRO<span className="accent">NUTRITION</span>
          </span>
        </div>
        <span className="auth-card__rule" />
        <div className="auth-card__label">Set a new password</div>
        <div className="auth-card__body">
          {check.ok ? (
            <ResetForm token={token as string} email={check.email} minLength={MIN_NEW_PASSWORD} />
          ) : (
            <div className="flex flex-col gap-4">
              <div
                className="text-sm rounded-lg px-3 py-2.5"
                style={{ color: 'var(--color-brand)', background: 'rgba(239, 68, 68, .1)', border: '1px solid rgba(239, 68, 68, .3)' }}
              >
                {TOKEN_PROBLEM[check.reason]}
              </div>
              <Link href="/forgot-password" className="btn btn-primary btn-block">Get a new link</Link>
            </div>
          )}
        </div>
        <div className="auth-card__foot">
          <Link href="/login" className="accent">Back to sign in</Link>
        </div>
      </div>
    </AuthShell>
  );
}
