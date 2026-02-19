/**
 * GitLab Repository API v4 provider.
 * Port of app/Services/GitProviders/GitLabProvider.php
 *
 * Uses the Commits API for atomic multi-file operations.
 * Key difference from GitHub: uses `last_commit_id` for conflict detection (not blob SHA).
 */

import type { FileContent } from '../../shared/types/sync'
import type { GitProvider, DirectoryItem } from './git-provider.interface'

const GITLAB_API = 'https://gitlab.com/api/v4'

export class GitLabProvider implements GitProvider {
  private projectId: string

  constructor(
    private repository: string,
    private token: string,
    private branch: string = 'main',
  ) {
    this.projectId = encodeURIComponent(this.repository)
  }

  async listFiles(path: string): Promise<FileContent[]> {
    const items = await this.paginateTree({ path, ref: this.branch })
    return items
      .filter((item) => item.type === 'blob' && item.name!.endsWith('.yaml'))
      .map((item) => ({ path: item.path, content: '', sha: item.id }))
  }

  async listDirectoryRecursive(path: string): Promise<DirectoryItem[]> {
    const items = await this.paginateTree({ path, ref: this.branch, recursive: 'true' })
    return items.map((item) => ({
      type: item.type === 'tree' ? 'dir' as const : 'file' as const,
      path: item.path,
      sha: item.id,
    }))
  }

  /**
   * Paginate through all pages of the GitLab repository tree API.
   * GitLab returns `x-next-page` header when there are more pages.
   */
  private async paginateTree(
    query: Record<string, string>,
  ): Promise<Array<{ type: string; name?: string; path: string; id: string }>> {
    const all: Array<{ type: string; name?: string; path: string; id: string }> = []
    let page = 1

    while (true) {
      const params = new URLSearchParams({ ...query, per_page: '100', page: String(page) })
      const response = await this.request(`/projects/${this.projectId}/repository/tree?${params}`)

      if (response.status === 404) return all
      if (!response.ok) throw new Error(`GitLab API error: ${response.status}`)

      const items = (await response.json()) as Array<{ type: string; name?: string; path: string; id: string }>
      all.push(...items)

      const nextPage = response.headers.get('x-next-page')
      if (!nextPage || nextPage === '') break
      page = parseInt(nextPage, 10)
    }

    return all
  }

  async getDirectoryTree(path: string): Promise<FileContent[]> {
    const items = await this.listDirectoryRecursive(path)
    const files: FileContent[] = []

    for (const item of items) {
      if (item.type === 'file' && item.path.endsWith('.yaml')) {
        const file = await this.getFile(item.path)
        if (file) files.push(file)
      }
    }

    return files
  }

  async getFile(path: string): Promise<FileContent | null> {
    const encodedPath = encodeURIComponent(path)
    const params = new URLSearchParams({ ref: this.branch })

    const response = await this.request(
      `/projects/${this.projectId}/repository/files/${encodedPath}?${params}`,
    )

    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitLab API error: ${response.status}`)

    const data = (await response.json()) as { content: string; blob_id: string; last_commit_id?: string }
    return {
      path,
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.blob_id,
      commitSha: data.last_commit_id,
    }
  }

  async createFile(path: string, content: string, commitMessage: string): Promise<string> {
    const encodedPath = encodeURIComponent(path)

    const response = await this.request(
      `/projects/${this.projectId}/repository/files/${encodedPath}`,
      {
        method: 'POST',
        body: JSON.stringify({
          branch: this.branch,
          content,
          commit_message: commitMessage,
        }),
      },
    )

    if (!response.ok) throw new Error(`GitLab API error: ${response.status}`)

    // Fetch the new blob_id
    const file = await this.getFile(path)
    return file?.sha ?? ''
  }

  async updateFile(path: string, content: string, sha: string, commitMessage: string): Promise<string> {
    const encodedPath = encodeURIComponent(path)

    const response = await this.request(
      `/projects/${this.projectId}/repository/files/${encodedPath}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          branch: this.branch,
          content,
          commit_message: commitMessage,
          last_commit_id: sha, // GitLab uses commit SHA for conflict detection
        }),
      },
    )

    if (!response.ok) {
      if (response.status === 400) {
        const err = new Error('Conflict: file has been modified on remote')
        ;(err as any).statusCode = 400
        throw err
      }
      throw new Error(`GitLab API error: ${response.status}`)
    }

    const file = await this.getFile(path)
    return file?.sha ?? ''
  }

  async deleteFile(path: string, _sha: string, commitMessage: string): Promise<void> {
    const encodedPath = encodeURIComponent(path)

    const response = await this.request(
      `/projects/${this.projectId}/repository/files/${encodedPath}`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          branch: this.branch,
          commit_message: commitMessage,
        }),
      },
    )

    if (response.status === 404) return
    if (!response.ok) throw new Error(`GitLab API error: ${response.status}`)
  }

  async deleteDirectory(path: string, commitMessage: string): Promise<void> {
    const items = await this.listDirectoryRecursive(path)
    if (items.length === 0) return

    const files = items.filter((item) => item.type === 'file')
    if (files.length === 0) return

    // Use atomic commit to delete all files at once
    await this.commitMultipleFiles({}, commitMessage, files.map((f) => f.path))
  }

  async commitMultipleFiles(
    files: Record<string, string>,
    commitMessage: string,
    deletePaths: string[] = [],
  ): Promise<string> {
    // Build actions array for the commit
    const actions: Array<{ action: string; file_path: string; content?: string }> = []

    for (const [path, content] of Object.entries(files)) {
      // Check if file exists to determine action type
      const existingFile = await this.getFile(path)
      actions.push({
        action: existingFile ? 'update' : 'create',
        file_path: path,
        content,
      })
    }

    // Add deletion actions
    for (const path of deletePaths) {
      actions.push({
        action: 'delete',
        file_path: path,
      })
    }

    const response = await this.request(
      `/projects/${this.projectId}/repository/commits`,
      {
        method: 'POST',
        body: JSON.stringify({
          branch: this.branch,
          commit_message: commitMessage,
          actions,
        }),
      },
    )

    if (!response.ok) throw new Error(`GitLab API error: ${response.status}`)
    const data = (await response.json()) as { id: string }
    return data.id
  }

  async testConnection(): Promise<boolean> {
    const response = await this.request(`/projects/${this.projectId}`)
    return response.ok
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${GITLAB_API}${path}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'PRIVATE-TOKEN': this.token,
          'Content-Type': 'application/json',
          ...((options.headers as Record<string, string>) ?? {}),
        },
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}
