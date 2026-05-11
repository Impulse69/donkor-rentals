export type UpdateChannel = 'latest' | 'beta';

export interface UpdatePolicy {
  channel: UpdateChannel;
  allowPrerelease: boolean;
}

export function resolveUpdatePolicy(channel: UpdateChannel): UpdatePolicy {
  return {
    channel,
    allowPrerelease: channel === 'beta',
  };
}
