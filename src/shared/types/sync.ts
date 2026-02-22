/** Types for git sync and vault operations */

export type SyncProvider = 'github' | 'gitlab'

export interface SyncConfig {
  provider: SyncProvider
  token: string
  repository: string // 'owner/repo'
  branch: string
  auto_sync: boolean
}

export interface FileContent {
  path: string
  content: string
  sha?: string // Blob SHA (GitHub) or null
  commitSha?: string // Commit SHA (GitLab compatibility)
}

export interface SyncResult {
  success: boolean
  message: string
  conflicts?: SyncConflict[]
  pulled?: number
  pushed?: number
}

export interface SyncConflict {
  collectionId: string
  collectionName: string
  localUpdatedAt: string
  remoteUpdatedAt?: string
}

export interface VaultConfig {
  provider?: 'hashicorp' | 'aws'
  url?: string
  auth_method?: 'token' | 'approle'
  token?: string
  role_id?: string
  secret_id?: string
  mount?: string
  namespace?: string
  verify_ssl?: boolean
  aws_region?: string
  aws_profile?: string
}

export interface SessionLogEntry {
  id: string
  category: 'sync' | 'vault' | 'http' | 'script' | 'system'
  type: string
  target: string
  message: string
  success: boolean
  timestamp: string
}
