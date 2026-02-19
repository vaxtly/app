/**
 * GitHub Git Data API provider.
 * Port of app/Services/GitProviders/GitHubProvider.php
 *
 * Uses the Git Data API for efficient atomic multi-file commits:
 * - Trees API for listing (recursive=1)
 * - Blob + Tree + Commit + Ref for atomic multi-file commits
 * - Contents API for single file operations
 */

import type { FileContent } from '../../shared/types/sync'
import type { GitProvider, DirectoryItem } from './git-provider.interface'

const GITHUB_API = 'https://api.github.com'

export class GitHubProvider implements GitProvider {
  constructor(
    private repository: string,
    private token: string,
    private branch: string = 'main',
  ) {}

  async listFiles(path: string): Promise<FileContent[]> {
    const response = await this.request(`/repos/${this.repository}/contents/${path}?ref=${this.branch}`)

    if (response.status === 404) return []
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)

    const items = (await response.json()) as Array<{ type: string; name: string; path: string; sha: string }>
    return items
      .filter((item) => item.type === 'file' && item.name.endsWith('.yaml'))
      .map((item) => ({ path: item.path, content: '', sha: item.sha }))
  }

  async listDirectoryRecursive(path: string): Promise<DirectoryItem[]> {
    // Get the tree SHA from the branch ref
    const refRes = await this.request(`/repos/${this.repository}/git/ref/heads/${this.branch}`)
    if (!refRes.ok) {
      if (refRes.status === 404) return []
      throw new Error(`GitHub API error: ${refRes.status}`)
    }
    const refData = (await refRes.json()) as { object: { sha: string } }

    const commitRes = await this.request(`/repos/${this.repository}/git/commits/${refData.object.sha}`)
    if (!commitRes.ok) throw new Error(`GitHub API error: ${commitRes.status}`)
    const commitData = (await commitRes.json()) as { tree: { sha: string } }

    // Get the full tree recursively
    const treeRes = await this.request(`/repos/${this.repository}/git/trees/${commitData.tree.sha}?recursive=1`)
    if (!treeRes.ok) throw new Error(`GitHub API error: ${treeRes.status}`)
    const treeData = (await treeRes.json()) as { tree: Array<{ type: string; path: string; sha: string }> }

    // Filter items under the given path
    const prefix = path.endsWith('/') ? path : `${path}/`
    return treeData.tree
      .filter((item) => item.path.startsWith(prefix) || item.path === path)
      .map((item) => ({
        type: item.type === 'tree' ? 'dir' as const : 'file' as const,
        path: item.path,
        sha: item.sha,
      }))
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
    const response = await this.request(`/repos/${this.repository}/contents/${path}?ref=${this.branch}`)

    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)

    const data = (await response.json()) as { content: string; sha: string }
    return {
      path,
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
    }
  }

  async createFile(path: string, content: string, commitMessage: string): Promise<string> {
    const response = await this.request(`/repos/${this.repository}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        branch: this.branch,
      }),
    })

    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)
    const data = (await response.json()) as { content: { sha: string } }
    return data.content.sha
  }

  async updateFile(path: string, content: string, sha: string, commitMessage: string): Promise<string> {
    const response = await this.request(`/repos/${this.repository}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        sha,
        branch: this.branch,
      }),
    })

    if (!response.ok) {
      if (response.status === 409) {
        const err = new Error('SHA conflict: file has been modified on remote')
        ;(err as any).statusCode = 409
        throw err
      }
      throw new Error(`GitHub API error: ${response.status}`)
    }
    const data = (await response.json()) as { content: { sha: string } }
    return data.content.sha
  }

  async deleteFile(path: string, sha: string, commitMessage: string): Promise<void> {
    const response = await this.request(`/repos/${this.repository}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({
        message: commitMessage,
        sha,
        branch: this.branch,
      }),
    })

    if (response.status === 404) return
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)
  }

  async deleteDirectory(path: string, commitMessage: string): Promise<void> {
    const items = await this.listDirectoryRecursive(path)
    const files = items.filter((item) => item.type === 'file')

    if (files.length === 0) return

    // Delete via atomic commit (more efficient than one-by-one)
    await this.commitMultipleFiles({}, commitMessage, files.map((f) => f.path))
  }

  async commitMultipleFiles(
    files: Record<string, string>,
    commitMessage: string,
    deletePaths: string[] = [],
  ): Promise<string> {
    // 1. Get current ref
    const refRes = await this.request(`/repos/${this.repository}/git/ref/heads/${this.branch}`)
    if (!refRes.ok) throw new Error(`GitHub API error getting ref: ${refRes.status}`)
    const refData = (await refRes.json()) as { object: { sha: string } }
    const latestCommitSha = refData.object.sha

    // 2. Get the current commit to find the tree
    const commitRes = await this.request(`/repos/${this.repository}/git/commits/${latestCommitSha}`)
    if (!commitRes.ok) throw new Error(`GitHub API error getting commit: ${commitRes.status}`)
    const commitData = (await commitRes.json()) as { tree: { sha: string } }

    // 3. Create a new tree with all changes
    const treeItems: Array<{
      path: string
      mode: string
      type: string
      content?: string
      sha?: string | null
    }> = []

    // Add/update files (inline content)
    for (const [path, content] of Object.entries(files)) {
      treeItems.push({
        path,
        mode: '100644',
        type: 'blob',
        content,
      })
    }

    // Delete files (sha: null)
    for (const path of deletePaths) {
      treeItems.push({
        path,
        mode: '100644',
        type: 'blob',
        sha: null,
      })
    }

    const treeRes = await this.request(`/repos/${this.repository}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: commitData.tree.sha,
        tree: treeItems,
      }),
    })
    if (!treeRes.ok) throw new Error(`GitHub API error creating tree: ${treeRes.status}`)
    const treeData = (await treeRes.json()) as { sha: string }

    // 4. Create commit
    const newCommitRes = await this.request(`/repos/${this.repository}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message: commitMessage,
        tree: treeData.sha,
        parents: [latestCommitSha],
      }),
    })
    if (!newCommitRes.ok) throw new Error(`GitHub API error creating commit: ${newCommitRes.status}`)
    const newCommitData = (await newCommitRes.json()) as { sha: string }

    // 5. Update ref to point to new commit
    const updateRefRes = await this.request(`/repos/${this.repository}/git/refs/heads/${this.branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitData.sha }),
    })
    if (!updateRefRes.ok) throw new Error(`GitHub API error updating ref: ${updateRefRes.status}`)

    return newCommitData.sha
  }

  async testConnection(): Promise<boolean> {
    const response = await this.request(`/repos/${this.repository}`)
    return response.ok
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...((options.headers as Record<string, string>) ?? {}),
        },
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}
