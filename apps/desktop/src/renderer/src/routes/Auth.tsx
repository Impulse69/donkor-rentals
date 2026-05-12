import { useEffect, useState, type FormEvent } from 'react';
import type { AuthSession } from '@shared/schemas';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Input } from '../components/Field';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

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
        <Alert tone="bad" eyebrow="Auth error">{error}</Alert>
      </main>
    );
  }

  if (hasUsers === null) {
    return (
      <main className="auth-screen">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <section className="auth-shell">
        <div className="auth-brand">
          <div className="auth-mark">&amp;</div>
          <p className="auth-eyebrow">Donkor Rentals</p>
          <h1>{hasUsers ? 'Sign in' : 'Owner setup'}</h1>
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
    <form className="auth-form" onSubmit={(e) => { void submit(e); }}>
      <div>
        <p className="auth-eyebrow">Returning user</p>
        <h2>Welcome back</h2>
      </div>
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
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
    <form className="auth-form" onSubmit={(e) => { void submit(e); }}>
      <div>
        <p className="auth-eyebrow">First run</p>
        <h2>Owner setup</h2>
      </div>
      <Input label="Shop name" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
      <Input label="Owner name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
      <Input label="Owner email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
      <label className="field">
        <span>Role</span>
        <input value="Owner" disabled />
      </label>
      <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <Input label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <Button variant="primary" type="submit" loading={busy}>Create owner account</Button>
    </form>
  );
}
