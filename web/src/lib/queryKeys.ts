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
  },

  brokers: {
    all: (clusterId: string) => ['brokers', clusterId] as const,
  },

  msk: {
    clusters: () => ['msk', 'clusters'] as const,
  },
} as const
