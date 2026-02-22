/** Interface for secrets management providers (e.g., HashiCorp Vault, AWS Secrets Manager). */

export interface SecretsProvider {
  listSecrets(basePath?: string): Promise<string[]>
  getSecrets(path: string): Promise<Record<string, string> | null>
  putSecrets(path: string, data: Record<string, string>): Promise<void>
  deleteSecrets(path: string): Promise<void>
  testConnection(): Promise<boolean>
}
