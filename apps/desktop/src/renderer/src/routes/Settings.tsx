import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Field';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { KV } from '../components/KV';
import { useToast } from '../components/Toast';

export default function Settings(): JSX.Element {
  const session = useAsync(() => api.auth.getSession(), []);

  if (session.status === 'idle' || session.status === 'loading') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }

  if (session.status === 'error') {
    return <Alert tone="bad" eyebrow="Error">{session.error.message}</Alert>;
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 980 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Admin · Settings</div>
          <h1 className="page-title" style={{ fontStyle: 'normal' }}>Shop setup</h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8 }}>
            Owner setup, role context, and cloud sync readiness for this Windows workstation.
          </p>
        </div>
      </header>

      {session.data ? (
        <ActiveSettings onRefresh={session.refresh} session={session.data} />
      ) : (
        <FirstRunForm onSaved={session.refresh} />
      )}
    </div>
  );
}

function ActiveSettings({
  session,
  onRefresh,
}: {
  session: Awaited<ReturnType<typeof api.auth.getSession>>;
  onRefresh: () => void;
}): JSX.Element {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const appSettings = useAsync(() => api.settings.get(), []);
  const [checking, setChecking] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null);

  useEffect(() => {
    const offProgress = api.settings.onUpdateProgress((percent) => setDownloadPercent(percent));
    const offDownloaded = api.settings.onUpdateDownloaded((version) => {
      setDownloadPercent(100);
      setDownloadedVersion(version);
      appSettings.refresh();
    });
    return () => {
      offProgress();
      offDownloaded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function drain(): Promise<void> {
    setSyncing(true);
    try {
      const status = await api.sync.drain();
      toast.ok(status.configured ? 'Sync pass finished' : 'Cloud sync is not configured');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function signOut(): Promise<void> {
    await api.auth.signOut();
    onRefresh();
  }

  async function updateChannel(channel: 'latest' | 'beta'): Promise<void> {
    try {
      await api.settings.update({ update_channel: channel });
      toast.ok(`Update channel set to ${channel}`);
      appSettings.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update channel');
    }
  }

  async function toggleCrash(enabled: boolean): Promise<void> {
    try {
      await api.settings.update({ crash_reporting_enabled: enabled });
      toast.ok(enabled ? 'Crash reporting enabled' : 'Crash reporting disabled');
      appSettings.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update crash reporting');
    }
  }

  async function checkUpdates(): Promise<void> {
    setChecking(true);
    try {
      const status = await api.settings.checkForUpdates();
      setDownloadPercent(status.downloadPercent);
      setDownloadedVersion(status.downloadedVersion);
      toast.ok(status.lastMessage ?? 'Update check finished');
      appSettings.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check for updates');
    } finally {
      setChecking(false);
    }
  }

  async function restartAndInstall(): Promise<void> {
    try {
      await api.settings.restartAndInstall();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not restart for update');
    }
  }

  if (!session) return <FirstRunForm onSaved={onRefresh} />;

  return (
    <div className="grid-2 fade-up fade-up-1">
      <section className="card">
        <h3 className="card-title">Shop profile</h3>
        <div className="grid-2">
          <KV label="Name" value={session.shop.name} />
          <KV label="Currency" value={session.shop.currency} />
          <KV label="Locale" value={session.shop.locale} />
          <KV label="Phone" value={session.shop.phone ?? 'Not set'} />
        </div>
        {session.shop.address && (
          <p className="muted" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{session.shop.address}</p>
        )}
      </section>

      <section className="card card-warm">
        <h3 className="card-title">Signed in</h3>
        <div className="stack">
          <KV label="User" value={session.user.name} />
          <KV label="Email" value={session.user.email} />
          <KV label="Role" value={session.user.role} />
          <KV label="Supabase" value={session.supabaseConfigured ? 'Configured' : 'Local only'} />
        </div>
        <div className="form-actions">
          <Button type="button" onClick={() => { void drain(); }} loading={syncing}>Run sync</Button>
          <Button type="button" variant="ghost" onClick={() => { void signOut(); }}>Sign out</Button>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">Updates</h3>
        <div className="settings-update-row">
          <Select
            label="Release channel"
            value={appSettings.status === 'ok' ? appSettings.data.settings.update_channel : 'latest'}
            onChange={(e) => { void updateChannel(e.target.value as 'latest' | 'beta'); }}
            options={[
              { value: 'latest', label: 'Latest' },
              { value: 'beta', label: 'Beta' },
            ]}
          />
          <Input
            label="Last update status"
            value={appSettings.status === 'ok' ? appSettings.data.updates.lastMessage ?? 'Not checked' : 'Loading'}
            readOnly
          />
          <UpdateRing
            percent={downloadPercent ?? (appSettings.status === 'ok' ? appSettings.data.updates.downloadPercent : null)}
            active={checking || Boolean(downloadPercent && downloadPercent < 100)}
          />
        </div>
        <div className="form-actions">
          {downloadedVersion || (appSettings.status === 'ok' && appSettings.data.updates.downloadedVersion) ? (
            <Button type="button" variant="primary" onClick={() => { void restartAndInstall(); }}>
              Restart to update
            </Button>
          ) : null}
          <Button type="button" onClick={() => { void checkUpdates(); }} loading={checking}>
            Check for updates
          </Button>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">Crash reporting</h3>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={appSettings.status === 'ok' ? appSettings.data.settings.crash_reporting_enabled : false}
            onChange={(e) => { void toggleCrash(e.target.checked); }}
          />
          <span>Send crash diagnostics when a DSN is configured</span>
        </label>
        <p className="muted" style={{ marginBottom: 0 }}>
          Status:{' '}
          {appSettings.status === 'ok'
            ? appSettings.data.crash.configured
              ? 'configured'
              : 'waiting for DSN'
            : 'loading'}
        </p>
      </section>
    </div>
  );
}

function UpdateRing({ percent, active }: { percent: number | null; active: boolean }): JSX.Element {
  const value = Math.round(percent ?? 0);
  const style = { '--p': `${value * 3.6}deg` } as React.CSSProperties;
  return (
    <div className={`update-ring${active ? ' active' : ''}`} style={style} title={`Update download ${value}%`}>
      <span>{percent === null ? '—' : value}</span>
    </div>
  );
}

function FirstRunForm({ onSaved }: { onSaved: () => void }): JSX.Element {
  const toast = useToast();
  const [shopName, setShopName] = useState('Donkor & Sons');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      await api.auth.completeFirstRun({
        shop_name: shopName,
        shop_phone: shopPhone || null,
        shop_address: shopAddress || null,
        owner_name: ownerName,
        owner_email: ownerEmail,
        password: password || undefined,
      });
      toast.ok('Owner setup saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save setup');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card card-warm fade-up fade-up-1" onSubmit={(e) => { void submit(e); }}>
      <span className="eyebrow">First-run wizard</span>
      <h3 style={{ marginTop: 6 }}>Create the owner profile</h3>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <Input label="Shop name" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
        <Input label="Shop phone" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
        <Textarea
          containerClass="full"
          label="Shop address"
          rows={2}
          value={shopAddress}
          onChange={(e) => setShopAddress(e.target.value)}
        />
        <Input label="Owner name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
        <Input label="Owner email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
        <Input
          label="Supabase password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Optional when the workstation is local-only."
        />
      </div>
      <div className="form-actions">
        <Button variant="primary" type="submit" loading={saving}>Save setup</Button>
      </div>
    </form>
  );
}
