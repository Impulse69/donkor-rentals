import { formatDateTime, relTime } from '../lib/format';

interface Props {
  createdAt: string;
  updatedAt: string;
  id: string;
  createdLabel?: string;
}

export function AuditCard({
  createdAt,
  updatedAt,
  id,
  createdLabel = 'Created',
}: Props): JSX.Element {
  return (
    <div className="card card-warm">
      <span className="eyebrow">Audit</span>
      <div className="kv-stack" style={{ marginTop: 10 }}>
        <span className="k">{createdLabel}</span>
        <span className="v">{formatDateTime(createdAt)}</span>
      </div>
      <div className="kv-stack" style={{ marginTop: 10 }}>
        <span className="k">Last edited</span>
        <span className="v">{relTime(updatedAt)}</span>
      </div>
      <div className="kv-stack" style={{ marginTop: 10 }}>
        <span className="k">Internal ID</span>
        <span className="v" style={{ wordBreak: 'break-all', fontSize: 11 }}>{id}</span>
      </div>
    </div>
  );
}
