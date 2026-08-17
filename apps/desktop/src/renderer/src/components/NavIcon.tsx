import type { SVGProps } from 'react';
import type { RouteDef } from '../router/routes';

type IconKey = NonNullable<RouteDef['nav']>['icon'];

const iconPaths: Record<IconKey, JSX.Element> = {
  dashboard: (
    <>
      <path d="M4 11.5 10 6l6 5.5" />
      <path d="M6 10.5V16h8v-5.5" />
      <path d="M9 16v-4h2v4" />
    </>
  ),
  invoice: (
    <>
      <path d="M6 4h8v12H6z" />
      <path d="M8 7h4" />
      <path d="M8 10h4" />
      <path d="M8 13h2" />
    </>
  ),
  customers: (
    <>
      <path d="M7.5 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M3.5 16c.6-2.3 2-3.5 4-3.5s3.4 1.2 4 3.5" />
      <path d="M13 10a2 2 0 1 0 0-4" />
      <path d="M12.8 12.5c1.6.2 2.7 1.4 3.2 3.5" />
    </>
  ),
  bookings: (
    <>
      <path d="M5 5h10v11H5z" />
      <path d="M7 3.5V6" />
      <path d="M13 3.5V6" />
      <path d="M5 8h10" />
      <path d="m7.5 12 1.5 1.5 3.5-3.5" />
    </>
  ),
  products: (
    <>
      <path d="M5 7.5 10 4l5 3.5v5L10 16l-5-3.5z" />
      <path d="m5.2 7.7 4.8 3.2 4.8-3.2" />
      <path d="M10 10.9V16" />
    </>
  ),
  returns: (
    <>
      <path d="M6.5 7H14a3 3 0 0 1 0 6H8" />
      <path d="m8.5 4.5-3 2.5 3 2.5" />
      <path d="M5.5 7H14" />
    </>
  ),
  calendar: (
    <>
      <path d="M5 5h10v11H5z" />
      <path d="M7 3.5V6" />
      <path d="M13 3.5V6" />
      <path d="M5 8h10" />
      <path d="M8 11h1" />
      <path d="M11 11h1" />
      <path d="M8 14h1" />
    </>
  ),
  reports: (
    <>
      <path d="M5 15.5V4.5h10" />
      <path d="M8 13v-3" />
      <path d="M11 13V7" />
      <path d="M14 13V9" />
      <path d="M5 15.5h11" />
    </>
  ),
};

export function NavIcon({ icon, ...props }: { icon: IconKey } & SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {iconPaths[icon]}
    </svg>
  );
}
