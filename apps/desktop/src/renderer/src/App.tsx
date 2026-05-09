import { useEffect, useState } from 'react';

export function App(): JSX.Element {
  const [version, setVersion] = useState<string>('…');
  const [pong, setPong] = useState<string>('…');

  useEffect(() => {
    void window.donkor.getAppVersion().then(setVersion);
    void window.donkor.ping().then(setPong);
  }, []);

  return (
    <main className="shell">
      <header>
        <h1>Donkor &amp; Sons</h1>
        <span className="tag">Rentals</span>
      </header>
      <section className="card">
        <h2>Phase 0 — scaffold</h2>
        <dl>
          <dt>App version</dt>
          <dd>{version}</dd>
          <dt>IPC ping</dt>
          <dd>{pong}</dd>
        </dl>
        <p className="muted">
          Catalog, customers, bookings, invoicing, sync, PDFs, reports and auto-update arrive in
          subsequent phases.
        </p>
      </section>
    </main>
  );
}
