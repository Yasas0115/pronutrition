import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { mailConfigured } from '@/lib/mail';
import ForgotForm from './forgot-form';

export const dynamic = 'force-dynamic';

// Public page. Deliberately does NOT bounce signed-in people away: someone who is
// logged in may still want to reset their password.
export default function ForgotPasswordPage() {
  const configured = mailConfigured();
  return (
    <AuthShell>
      <div className="auth-card">
        <div className="auth-card__logo">
          <span className="brand" style={{ fontSize: 34 }}>
            PRO<span className="accent">NUTRITION</span>
          </span>
        </div>
        <span className="auth-card__rule" />
        <div className="auth-card__label">Forgot your password?</div>
        <div className="auth-card__body">
          {configured ? (
            <ForgotForm />
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Email is not set up on this server yet, so a reset link can&apos;t be sent. Ask the
              owner to add the mail settings, or to reset your password for you.
            </p>
          )}
        </div>
        <div className="auth-card__foot">
          <Link href="/login" className="accent">Back to sign in</Link>
        </div>
      </div>
    </AuthShell>
  );
}
