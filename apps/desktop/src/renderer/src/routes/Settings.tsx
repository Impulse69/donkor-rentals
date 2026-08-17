import { useEffect, useState } from 'react';
import type { ShopProfile } from '@shared/schemas';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Field';
import { Alert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { KV } from '../components/KV';
import { useToast } from '../components/Toast';

export default function Settings({ onCompanySaved }: { onCompanySaved?: () => void }): JSX.Element {
  const company = useAsync(() => api.company.getProfile(), []);

  if (company.status === 'idle' || company.status === 'loading') {
    return (
      <div className="row" style={{ justifyContent: 'center', padding: 60, color: 'var(--ink-mute)' }}>
        <Spinner /> <span style={{ marginLeft: 10 }}>Loading settings...</span>
      </div>
    );
  }

  if (company.status === 'error') {
    return <Alert tone="bad" eyebrow="Settings" title="Could not load settings">{company.error.message}</Alert>;
  }

  if (!company.data) {
    return (
      <div className="page fade-up" style={{ maxWidth: 900 }}>
        <CompanySetupForm
          onSaved={() => {
            company.refresh();
            onCompanySaved?.();
            window.dispatchEvent(new Event('donkor:company-changed'));
          }}
        />
      </div>
    );
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 1000 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Admin · Settings</div>
          <h1 className="page-title">Workstation</h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8, lineHeight: 1.55 }}>
            Company profile, local company-file backup, updates, and crash diagnostics for this Windows workstation.
          </p>
        </div>
      </header>

      <ActiveSettings company={company.data} onCompanyRefresh={company.refresh} />
    </div>
  );
}

function ActiveSettings({
  company,
  onCompanyRefresh,
}: {
  company: ShopProfile;
  onCompanyRefresh: () => void;
}): JSX.Element {
  const toast = useToast();
  const appSettings = useAsync(() => api.settings.get(), []);
  const [checking, setChecking] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  async function createBackup(): Promise<void> {
    setBackingUp(true);
    try {
      const backup = await api.backup.create();
      if (backup) toast.ok(`Backup saved: ${backup.filePath}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create backup');
    } finally {
      setBackingUp(false);
    }
  }

  async function restoreBackup(): Promise<void> {
    setRestoring(true);
    try {
      const restored = await api.backup.restore();
      if (restored) toast.ok('Backup restored. The app will restart.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not restore backup');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="grid-2 fade-up fade-up-1">
      <section className="card">
        <h3 className="card-title">Company profile</h3>
        <div className="grid-2">
          <KV label="Name" value={company.name} />
          <KV label="Currency" value={company.currency} />
          <KV label="TIN" value={company.tin ?? 'Not set'} />
          <KV label="Phone" value={company.phone ?? 'Not set'} />
          <KV label="Fiscal year start" value={company.fiscal_year_start ?? 'Not set'} />
        </div>
        {company.address && (
          <p className="muted" style={{ whiteSpace: 'pre-wrap', marginBottom: 0, marginTop: 12, fontSize: 13 }}>
            {company.address}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" onClick={onCompanyRefresh}>Refresh</Button>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">Company file</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
          Backups are local SQLite copies with a manifest. Restoring replaces all current data with the selected backup.
        </p>
        <div className="form-actions">
          <Button type="button" variant="primary" onClick={() => { void createBackup(); }} loading={backingUp}>
            Back up company file
          </Button>
          <Button type="button" variant="danger" onClick={() => { void restoreBackup(); }} loading={restoring}>
            Restore company file
          </Button>
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
            label="Last status"
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
        <div className="switch-row">
          <div className="copy">
            <span className="t">Send crash diagnostics</span>
            <span className="h">
              Only sent when a DSN is configured. Status:{' '}
              {appSettings.status === 'ok'
                ? appSettings.data.crash.configured ? 'configured' : 'waiting for DSN'
                : 'loading'}
            </span>
          </div>
          <input
            type="checkbox"
            checked={appSettings.status === 'ok' ? appSettings.data.settings.crash_reporting_enabled : false}
            onChange={(e) => { void toggleCrash(e.target.checked); }}
            aria-label="Send crash diagnostics"
          />
        </div>
      </section>
    </div>
  );
}

function UpdateRing({ percent, active }: { percent: number | null; active: boolean }): JSX.Element {
  const value = Math.round(percent ?? 0);
  const style = { '--p': `${value * 3.6}deg` } as React.CSSProperties;
  return (
    <div className={`update-ring${active ? ' active' : ''}`} style={style} title={`Update download ${value}%`}>
      <span>{percent === null ? '-' : value}</span>
    </div>
  );
}

function CompanySetupForm({ onSaved }: { onSaved: () => void }): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('Donkor & Sons');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [tin, setTin] = useState('');
  const [fiscalYearStart, setFiscalYearStart] = useState('01-01');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      await api.company.setup({
        name,
        phone: phone || null,
        address: address || null,
        tin: tin || null,
        currency: 'GHS',
        fiscal_year_start: fiscalYearStart,
      });
      toast.ok('Company setup saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save setup');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card fade-up fade-up-1" onSubmit={(e) => { void submit(e); }}>
      <span className="eyebrow">First-run wizard</span>
      <h3 style={{ marginTop: 6 }}>Set up your company</h3>
      <div className="form-grid" style={{ marginTop: 18 }}>
        <Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="TIN" value={tin} onChange={(e) => setTin(e.target.value)} />
        <Input label="Currency" value="GHS" readOnly />
        <Input
          label="Fiscal year start"
          value={fiscalYearStart}
          onChange={(e) => setFiscalYearStart(e.target.value)}
          required
        />
        <Textarea
          containerClass="full"
          label="Address"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <Button variant="primary" type="submit" loading={saving}>Save company setup</Button>
      </div>
    </form>
  );
}
