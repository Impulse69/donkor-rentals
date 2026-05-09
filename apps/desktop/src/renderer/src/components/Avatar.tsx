import { initials } from '../lib/format';

interface Props {
  name: string;
  size?: number;
}

/**
 * Circular initials avatar in the deep-umber palette. Used for customers,
 * staff (UserChip), and anywhere a person needs visual identity.
 */
export function Avatar({ name, size = 40 }: Props): JSX.Element {
  const fontSize = Math.max(11, Math.round(size * 0.42));
  return (
    <span
      className="avatar-initials"
      style={{ width: size, height: size, fontSize }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
