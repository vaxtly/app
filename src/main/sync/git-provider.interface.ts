/**
 * Git provider interface — abstraction for GitHub/GitLab API operations.
 * Port of app/Contracts/GitProviderInterface.php
 */

import type { FileContent } from '../../shared/types/sync'

export interface DirectoryItem {
  type: 'file' | 'dir'
  path: string
  sha: string
}

export interface GitProvider {
  /** List files in a directory (non-recursive, .yaml files only). */
  listFiles(path: string): Promise<FileContent[]>

  /** List all items in a directory recursively (files and subdirectories). */
  listDirectoryRecursive(path: string): Promise<DirectoryItem[]>

  /** Get the full directory tree with file contents (.yaml files only). */
  getDirectoryTree(path: string): Promise<FileContent[]>

  /** Get a single file with its content. */
  getFile(path: string): Promise<FileContent | null>

  /** Create a new file. Returns the new blob SHA. */
  createFile(path: string, content: string, commitMessage: string): Promise<string>

  /** Update an existing file. `sha` is blob SHA (GitHub) or commit SHA (GitLab). Returns new SHA. */
  updateFile(path: string, content: string, sha: string, commitMessage: string): Promise<string>

  /** Delete a file. */
  deleteFile(path: string, sha: string, commitMessage: string): Promise<void>

  /** Delete an entire directory and all its contents. */
  deleteDirectory(path: string, commitMessage: string): Promise<void>

  /** Commit multiple files in a single atomic commit. Returns the new commit SHA. */
  commitMultipleFiles(
    files: Record<string, string>,
    commitMessage: string,
    deletePaths?: string[],
  ): Promise<string>

  /** Test the connection to the remote repository. */
  testConnection(): Promise<boolean>
}
