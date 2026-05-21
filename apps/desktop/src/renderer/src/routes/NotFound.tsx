import { Link, useLocation } from 'react-router-dom';
import { Button } from '../components/Button';
import { paths } from '../router/paths';

export function NotFound(): JSX.Element {
  const { pathname } = useLocation();
  return (
    <div className="page fade-up" style={{ marginTop: 'var(--s-10)' }}>
      <div style={{ maxWidth: 560 }}>
        <span className="page-eyebrow">404 · Page not on file</span>
        <h1 className="page-title">No record of this route.</h1>
        <p className="muted" style={{ marginTop: 12, lineHeight: 1.55 }}>
          The path <code className="mono">{pathname}</code> doesn&rsquo;t resolve to a screen in
          this build. Use the sidebar to navigate, or return to the workspace overview.
        </p>
        <div className="row" style={{ marginTop: 20 }}>
          <Link to={paths.home}><Button variant="primary">Back to overview</Button></Link>
          <Link to={paths.catalog.list}><Button variant="ghost">Open catalog</Button></Link>
        </div>
      </div>
    </div>
  );
}
