export interface VersionInfo {
  current: string
  latest?: string
  updateAvailable: boolean
  releasesURL: string
  latestReleaseURL?: string
  platform: string
  arch: string
  /** Pinned to `latest`; set only when updateAvailable. */
  installCmd?: string
  /** A newer release still in its 72h waiting period. */
  pending?: string
  /** ISO time when `pending` becomes eligible. */
  pendingAt?: string
}
