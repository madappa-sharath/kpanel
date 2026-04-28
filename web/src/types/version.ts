export interface VersionInfo {
  current: string
  latest?: string
  updateAvailable: boolean
  releasesURL: string
  latestReleaseURL?: string
  platform: string
  arch: string
  installCmd: string
}
