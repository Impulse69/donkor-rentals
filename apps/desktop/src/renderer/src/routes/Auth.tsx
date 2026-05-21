import { useEffect, useState, type FormEvent } from 'react';
import type { AuthSession } from '@shared/schemas';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Input } from '../components/Field';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import logoUrl from '../assets/logo.png';

export default function Auth({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }): JSX.Element {
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api.auth.hasUsers()
      .then((next) => {
        if (!alive) return;
        setHasUsers(next);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not load authentication state');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <main className="auth-screen">
        <div style={{ width: 'min(520px, 100%)' }}>
          <Alert tone="bad" eyebrow="Auth error" title="Could not reach the local database">
            {error}
          </Alert>
        </div>
      </main>
    );
  }

  if (hasUsers === null) {
    return (
      <main className="auth-screen">
        <div className="row" style={{ color: 'var(--ink-mute)' }}>
          <Spinner /> <span style={{ marginLeft: 8 }}>Loading…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <section className="auth-shell">
        <div className="auth-brand">
          <img src={logoUrl} alt="Donkor & Sons" className="auth-logo" />
          <p className="auth-eyebrow">Rentals workstation</p>
          <h1>{hasUsers ? 'Sign in to your workstation' : 'Welcome — let’s set you up'}</h1>
          <p className="auth-tagline">
            {hasUsers
              ? 'Your local data lives on this Windows machine. Cloud sync, when configured, runs in the background.'
              : 'Create the owner account that will administer this workstation. You can add staff later from Settings.'}
          </p>
        </div>

        <section className="auth-card">
          {hasUsers ? (
            <SignInForm onAuthenticated={onAuthenticated} />
          ) : (
            <FirstRunForm onAuthenticated={onAuthenticated} />
          )}
        </section>
      </section>
    </main>
  );
}

function SignInForm({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }): JSX.Element {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      const session = await api.auth.signIn({ email, password });
      toast.ok('Signed in');
      onAuthenticated(session);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(e) => { void submit(e); }} noValidate>
      <div style={{ marginBottom: 4 }}>
        <p className="auth-eyebrow" style={{ marginBottom: 4 }}>Returning user</p>
        <h2 style={{ margin: 0, fontSize: 'var(--t-xl)' }}>Sign in</h2>
      </div>
      <Input
        label="Email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Button variant="primary" type="submit" loading={busy}>Sign in</Button>
    </form>
  );
}

function FirstRunForm({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }): JSX.Element {
  const toast = useToast();
  const [shopName, setShopName] = useState('Donkor & Sons');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password' | 'confirm', string>>>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) next.email = 'Email looks off';
    if (password.length < 8) next.password = 'Use at least 8 characters';
    if (password !== confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const session = await api.auth.completeFirstRun({
        shop_name: shopName,
        shop_phone: null,
        shop_address: null,
        owner_name: ownerName,
        owner_email: ownerEmail,
        password,
        role: 'owner',
      });
      toast.ok('Owner account created');
      onAuthenticated(session);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not complete setup');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(e) => { void submit(e); }} noValidate>
      <div style={{ marginBottom: 4 }}>
        <p className="auth-eyebrow" style={{ marginBottom: 4 }}>First run</p>
        <h2 style={{ margin: 0, fontSize: 'var(--t-xl)' }}>Owner setup</h2>
      </div>
      <Input
        label="Shop name"
        value={shopName}
        onChange={(e) => setShopName(e.target.value)}
        required
      />
      <Input
        label="Owner name"
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        autoComplete="name"
        required
      />
      <Input
        label="Owner email"
        type="email"
        autoComplete="username"
        value={ownerEmail}
        onChange={(e) => setOwnerEmail(e.target.value)}
        error={errors.email}
        required
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={errors.password ? undefined : 'Minimum 8 characters'}
        required
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        required
      />
      <Button variant="primary" type="submit" loading={busy}>Create owner account</Button>
    </form>
  );
}
