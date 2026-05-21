import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Shimmering placeholder for loading states.
 * Use sparingly — prefer concrete skeletons that mirror the final layout.
 */
export function Skeleton({ width, height, rounded, className, style }: SkeletonProps): JSX.Element {
  const css: CSSProperties = {
    width: width ?? '100%',
    height: height ?? 12,
    borderRadius: rounded ? 999 : undefined,
    ...style,
  };
  return <span className={`skel ${className ?? ''}`.trim()} style={css} aria-hidden />;
}

/**
 * Pre-built table skeleton — N rows of M cells. Matches the .dtable layout
 * so it can be dropped into card-flush sections during loading.
 */
export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}): JSX.Element {
  return (
    <div className="dtable-wrap" aria-busy="true" aria-label="Loading table">
      <table className="dtable">
        <tbody>
          {Array.from({ length: rows }).map((_, ri) => (
            <tr key={ri} style={{ cursor: 'default' }}>
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci}>
                  <Skeleton width={ci === 0 ? '60%' : '80%'} height={12} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Detail-page skeleton — eyebrow, title, then a few body lines.
 */
export function DetailSkeleton(): JSX.Element {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <Skeleton width={120} height={10} />
      <div style={{ marginTop: 12 }}>
        <Skeleton width="60%" height={28} />
      </div>
      <div style={{ marginTop: 24, display: 'grid', gap: 10 }}>
        <Skeleton width="90%" />
        <Skeleton width="70%" />
        <Skeleton width="80%" />
        <Skeleton width="55%" />
      </div>
    </div>
  );
}
