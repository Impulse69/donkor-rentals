import { Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Shell, PageLoader } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { routes } from './router/routes';
import { NotFound } from './routes/NotFound';

export function App(): JSX.Element {
  return (
    <HashRouter>
      <ToastProvider>
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
      </ToastProvider>
    </HashRouter>
  );
}
