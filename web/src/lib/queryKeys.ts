// TanStack Query key factories — keep all keys here so invalidation is consistent

export const queryKeys = {
  connections: {
    all: () => ['connections'] as const,
    session: (id: string) => ['connections', id, 'session'] as const,
    status: (id: string) => ['connections', id, 'status'] as const,
    overview: (id: string) => ['connections', id, 'overview'] as const,
  },

  topics: {
    all: (clusterId: string) => ['topics', clusterId] as const,
    detail: (clusterId: string, name: string) => ['topics', clusterId, name] as const,
  },

  groups: {
    all: (clusterId: string) => ['groups', clusterId] as const,
    detail: (clusterId: string, groupId: string) => ['groups', clusterId, groupId] as const,
    lagHistory: (clusterId: string, groupId: string) => ['groups', clusterId, groupId, 'lag-history'] as const,
  },

  brokers: {
    all: (clusterId: string) => ['brokers', clusterId] as const,
  },

  aws: {
    context: (profile?: string) => ['aws', 'context', profile ?? null] as const,
    profiles: () => ['aws', 'profiles'] as const,
  },

  msk: {
    clusters: (region?: string, profile?: string) =>
      ['msk', 'clusters', region ?? null, profile ?? null] as const,
  },

  metrics: {
    byScope: (clusterId: string, scope: string, extra?: string, range?: string) =>
      ['metrics', clusterId, scope, extra, range] as const,
  },

  version: {
    info: () => ['version'] as const,
  },
} as const
