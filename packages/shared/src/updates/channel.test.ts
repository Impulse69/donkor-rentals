import { describe, expect, it } from 'vitest';
import { resolveUpdatePolicy } from './index';

describe('resolveUpdatePolicy', () => {
  it('keeps latest on stable releases', () => {
    expect(resolveUpdatePolicy('latest')).toEqual({ channel: 'latest', allowPrerelease: false });
  });

  it('allows prereleases on the beta channel', () => {
    expect(resolveUpdatePolicy('beta')).toEqual({ channel: 'beta', allowPrerelease: true });
  });
});
