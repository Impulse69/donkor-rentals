import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';
import { BOOKING_STATUS_LABELS, type Booking } from '@shared/schemas';
import { bookingStatusTone } from './helpers';

type Row = Booking & { customer_name: string };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TONE_TO_DOT: Record<string, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  info: 'var(--info)',
  neutral: 'var(--ink-faint)',
  gold: 'var(--accent)',
};

export default function BookingsCalendar(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayMonth = monthKey(new Date());
  const month = searchParams.get('m') ?? todayMonth;
  const cursor = parseMonthKey(month);

  const window = useMemo(() => {
    const cursorDate = parseMonthKey(month);
    const start = startOfCalendarMonth(cursorDate);
    const end = endOfCalendarMonth(cursorDate);
    return { start, end };
  }, [month]);

  const list = useAsync(
    () =>
      api.bookings.list({
        windowStart: window.start.toISOString(),
        windowEnd: window.end.toISOString(),
      }),
    [window.start.toISOString(), window.end.toISOString()],
  );

  function shift(delta: number): void {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    const next = new URLSearchParams(searchParams);
    next.set('m', monthKey(d));
    setSearchParams(next, { replace: true });
  }

  function jumpToday(): void {
    const next = new URLSearchParams(searchParams);
    next.delete('m');
    setSearchParams(next, { replace: true });
  }

  const days = useMemo(() => buildGrid(window.start, window.end), [window.start, window.end]);
  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    if (list.status !== 'ok') return map;
    for (const day of days) {
      const key = ymd(day);
      map.set(key, []);
    }
    for (const b of list.data) {
      const start = new Date(b.starts_at);
      const end = new Date(b.ends_at);
      for (const day of days) {
        if (sameDayOrLater(day, start) && earlierThan(day, end)) {
          const key = ymd(day);
          const arr = map.get(key);
          if (arr) arr.push(b);
        }
      }
    }
    return map;
  }, [list, days]);

  const monthLabel = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Schedule</div>
          <h1 className="page-title">{monthLabel}</h1>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">← Prev</Button>
          <Button variant="ghost" onClick={jumpToday}>Today</Button>
          <Button variant="ghost" onClick={() => shift(1)} aria-label="Next month">Next →</Button>
          <Link to={paths.bookings.list}><Button>List view</Button></Link>
          <Link to={paths.bookings.new}><Button variant="primary">+ New</Button></Link>
        </div>
      </header>

      <div className="cal fade-up fade-up-1">
        <div className="cal-head">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-head-cell">{d}</div>
          ))}
        </div>
        <div className="cal-grid">
          {days.map((day) => {
            const key = ymd(day);
            const bookings = byDay.get(key) ?? [];
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = ymd(new Date()) === key;
            return (
              <div
                key={key}
                className={`cal-cell${inMonth ? '' : ' is-out'}${isToday ? ' is-today' : ''}`}
              >
                <div className="cal-num">{day.getDate()}</div>
                <div className="cal-bars">
                  {bookings.slice(0, 4).map((b) => {
                    const tone = bookingStatusTone(b.status);
                    return (
                      <button
                        key={b.id}
                        className="cal-bar"
                        onClick={() => navigate(paths.bookings.detail(b.id))}
                        title={`${b.customer_name} · ${BOOKING_STATUS_LABELS[b.status]}`}
                      >
                        <span
                          className="badge-dot"
                          aria-hidden
                          style={{ background: TONE_TO_DOT[tone] ?? 'var(--ink-faint)' }}
                        />
                        <span className="cal-bar-name">{b.customer_name}</span>
                      </button>
                    );
                  })}
                  {bookings.length > 4 && (
                    <span className="cal-more">+{bookings.length - 4} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {list.status === 'loading' && (
          <div className="row" style={{ justifyContent: 'center', padding: 20, color: 'var(--ink-mute)' }}>
            <Spinner /> <span style={{ marginLeft: 10 }}>Loading window…</span>
          </div>
        )}
        {list.status === 'error' && (
          <div style={{ padding: 16 }}>
            <Alert tone="bad" eyebrow="Calendar">{list.error.message}</Alert>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- date math ------------------------------------------------------------

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function parseMonthKey(s: string): Date {
  const [y, m] = s.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y || 1970, (m ?? 1) - 1, 1);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameDayOrLater(target: Date, ref: Date): boolean {
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  return t >= r;
}
function earlierThan(target: Date, ref: Date): boolean {
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return t < ref.getTime();
}
function startOfCalendarMonth(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const wd = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - wd);
  start.setHours(0, 0, 0, 0);
  return start;
}
function endOfCalendarMonth(d: Date): Date {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const wd = (last.getDay() + 6) % 7;
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - wd) + 1);
  end.setHours(0, 0, 0, 0);
  return end;
}
function buildGrid(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur < end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
