import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import AuthShell from '@/components/AuthShell';
import RegisterForm from './register-form';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect('/');
  // Registration only bootstraps a brand-new, unclaimed installation.
  const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } });
  if (ownerCount > 0) redirect('/login');

  return (
    <AuthShell>
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="auth-card__logo">
          <span className="brand" style={{ fontSize: 32 }}>
            PRO<span className="accent">NUTRITION</span>
          </span>
        </div>
        <span className="auth-card__rule" />
        <div className="auth-card__label">Set up your company</div>
        <div className="auth-card__body">
          <RegisterForm />
        </div>
      </div>
    </AuthShell>
  );
}
