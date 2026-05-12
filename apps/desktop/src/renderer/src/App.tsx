import { Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import type { AuthSession } from '@shared/schemas';
import { Shell, PageLoader } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { routes } from './router/routes';
import { NotFound } from './routes/NotFound';
import Auth from './routes/Auth';
import { api } from './lib/api';

export function App(): JSX.Element {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthGate />
      </ToastProvider>
    </HashRouter>
  );
}

function AuthGate(): JSX.Element {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void api.auth.getSession().then((next) => {
        if (alive) setSession(next);
      });
    };
    load();
    window.addEventListener('donkor:auth-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('donkor:auth-changed', load);
    };
  }, []);

  if (session === undefined) return <div className="auth-screen"><PageLoader /></div>;
  if (!session) return <Auth onAuthenticated={setSession} />;

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
