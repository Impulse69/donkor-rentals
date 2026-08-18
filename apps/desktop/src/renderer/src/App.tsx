import { Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Shell, PageLoader } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { routes } from './router/routes';
import { NotFound } from './routes/NotFound';
import Settings from './routes/Settings';
import { api } from './lib/api';

export function App(): JSX.Element {
  return (
    <HashRouter>
      <ToastProvider>
        <CompanyGate />
      </ToastProvider>
    </HashRouter>
  );
}

function CompanyGate(): JSX.Element {
  const [hasProfile, setHasProfile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void api.company.hasProfile().then((next) => {
        if (alive) setHasProfile(next);
      });
    };
    load();
    window.addEventListener('donkor:company-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('donkor:company-changed', load);
    };
  }, []);

  if (hasProfile === undefined) return <div className="auth-screen"><PageLoader /></div>;
  if (!hasProfile) return <Settings onCompanySaved={() => setHasProfile(true)} />;

  return (
    <Shell>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {routes.map((r) => {
            const Element = r.element;
            return <Route key={r.path} path={r.path} element={<Element />} />;
          })}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
