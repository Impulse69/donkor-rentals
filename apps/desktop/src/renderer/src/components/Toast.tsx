import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastTone = 'ok' | 'error' | 'neutral';
interface Toast {
  id: number;
  tone: ToastTone;
  msg: string;
}

interface ToastApi {
  show: (msg: string, tone?: ToastTone) => void;
  ok: (msg: string) => void;
  error: (msg: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<Toast[]>([]);

  const show = useCallback((msg: string, tone: ToastTone = 'neutral') => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { id, tone, msg }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 3500);
  }, []);

  const api: ToastApi = {
    show,
    ok: (m) => show(m, 'ok'),
    error: (m) => show(m, 'error'),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-shelf" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'ok' ? 'toast-ok' : t.tone === 'error' ? 'toast-error' : ''}`}>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used within <ToastProvider>');
  return v;
}
