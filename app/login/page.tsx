import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AuthShell from '@/components/AuthShell';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <AuthShell>
      <div className="auth-card">
        <div className="auth-card__logo">
          <span className="brand" style={{ fontSize: 34 }}>
            PRO<span className="accent">NUTRITION</span>
          </span>
        </div>
        <span className="auth-card__rule" />
        <div className="auth-card__label">Point of Sale — Sign in</div>
        <div className="auth-card__body">
          <LoginForm />
        </div>
        <div className="auth-card__foot">
          New here? <Link href="/register" className="accent">Create your company</Link>
        </div>
      </div>
    </AuthShell>
  );
}
