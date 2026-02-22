/**
 * AWS Secrets Manager provider.
 * Stores one JSON secret per environment (key-value pairs).
 * Supports explicit credentials, named profiles, or the SDK default credential chain.
 */

import {
  SecretsManagerClient,
  ListSecretsCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  CreateSecretCommand,
  DeleteSecretCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager'
import type { SecretsProvider } from './secrets-provider.interface'
import { logVault } from '../services/session-log'

export interface AwsSecretsManagerOptions {
  region: string
  accessKeyId?: string
  secretAccessKey?: string
  profile?: string
}

export class AwsSecretsManagerProvider implements SecretsProvider {
  private constructor(private readonly client: SecretsManagerClient) {}

  static async create(opts: AwsSecretsManagerOptions): Promise<AwsSecretsManagerProvider> {
    let credentials: { accessKeyId: string; secretAccessKey: string } | undefined

    if (opts.accessKeyId && opts.secretAccessKey) {
      credentials = { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
    } else if (opts.profile) {
      const { fromIni } = await import('@aws-sdk/credential-providers')
      const resolved = await fromIni({ profile: opts.profile })()
      credentials = { accessKeyId: resolved.accessKeyId, secretAccessKey: resolved.secretAccessKey }
    }
    // else: SDK default credential chain

    const client = new SecretsManagerClient({
      region: opts.region,
      ...(credentials ? { credentials } : {}),
    })

    return new AwsSecretsManagerProvider(client)
  }

  async listSecrets(basePath?: string): Promise<string[]> {
    const names: string[] = []
    let nextToken: string | undefined

    do {
      const command = new ListSecretsCommand({
        MaxResults: 100,
        NextToken: nextToken,
        ...(basePath ? { Filters: [{ Key: 'name', Values: [basePath] }] } : {}),
      })

      const response = await this.client.send(command)

      for (const secret of response.SecretList ?? []) {
        if (secret.Name) names.push(secret.Name)
      }

      nextToken = response.NextToken
    } while (nextToken)

    logVault('list', basePath ?? '/', `Found ${names.length} secret(s) in AWS Secrets Manager`)
    return names
  }

  async getSecrets(path: string): Promise<Record<string, string> | null> {
    try {
      const command = new GetSecretValueCommand({ SecretId: path })
      const response = await this.client.send(command)

      if (!response.SecretString) {
        logVault('get', path, 'Secret has no string value', false)
        return null
      }

      const data = JSON.parse(response.SecretString) as Record<string, string>
      logVault('get', path, `Retrieved ${Object.keys(data).length} key(s)`)
      return data
    } catch (e) {
      if (e instanceof ResourceNotFoundException) {
        logVault('get', path, 'Secret not found', false)
        return null
      }
      throw e
    }
  }

  async putSecrets(path: string, data: Record<string, string>): Promise<void> {
    const secretString = JSON.stringify(data)

    try {
      await this.client.send(new PutSecretValueCommand({
        SecretId: path,
        SecretString: secretString,
      }))
      logVault('put', path, `Saved ${Object.keys(data).length} key(s)`)
    } catch (e) {
      if (e instanceof ResourceNotFoundException) {
        await this.client.send(new CreateSecretCommand({
          Name: path,
          SecretString: secretString,
        }))
        logVault('put', path, `Created new secret with ${Object.keys(data).length} key(s)`)
        return
      }
      throw e
    }
  }

  async deleteSecrets(path: string): Promise<void> {
    try {
      await this.client.send(new DeleteSecretCommand({
        SecretId: path,
        ForceDeleteWithoutRecovery: true,
      }))
      logVault('delete', path, 'Deleted secret')
    } catch (e) {
      if (e instanceof ResourceNotFoundException) return
      throw e
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.send(new ListSecretsCommand({ MaxResults: 1 }))
      return true
    } catch {
      return false
    }
  }
}
