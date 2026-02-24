<p align="center">
  <img src=".github/assets/name.png" alt="Vaxtly" width="280" />
</p>

<p align="center">
  A fast, native API client for developers. Built with Electron, TypeScript, and Svelte 5.
</p>

<p align="center">
  <a href="https://github.com/vaxtly/app/releases"><img src="https://img.shields.io/github/v/release/vaxtly/app?style=flat-square&color=4f8ff7" alt="Release" /></a>
  <a href="https://github.com/vaxtly/app/releases"><img src="https://img.shields.io/github/downloads/vaxtly/app/total?style=flat-square&color=4f8ff7" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/vaxtly/app?style=flat-square&color=4f8ff7" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-4f8ff7?style=flat-square" alt="Platform" />
</p>

<p align="center">
  <a href="https://vaxtly.app">Website</a> &middot; <a href="https://vaxtly.app/docs">Documentation</a> &middot; <a href="https://github.com/vaxtly/app/releases">Releases</a>
</p>

## Install

### macOS (Homebrew)

```bash
brew install vaxtly/tap/vaxtly
```

### Windows (Scoop)

```bash
scoop bucket add vaxtly https://github.com/vaxtly/scoop-bucket
scoop install vaxtly
```

### Linux (Snap)

```bash
sudo snap install vaxtly
```

See the [Installation Guide](https://vaxtly.app/docs/installation) for all available options including `.dmg`, `.exe`, `.AppImage`, `.deb`, and more.

## Features

**Request Builder** — All HTTP methods, 7 body types (JSON, XML, form-data, URL-encoded, raw, GraphQL, binary), query parameter editor, custom headers with bulk edit mode.

**Authentication** — Bearer Token, Basic Auth, API Key, and OAuth 2.0 (Authorization Code + PKCE, Client Credentials, Password grant) with encrypted token storage and auto-refresh.

**Environments & Variables** — `{{variable}}` substitution everywhere with real-time CodeMirror highlighting and hover tooltips. Workspace-scoped environments with activation toggle.

**Scripting** — Pre-request and post-response JavaScript scripts. Chain dependent requests, extract values from responses, set variables programmatically.

**Git Sync** — Push/pull collections to GitHub, GitLab, or self-hosted instances. 3-way merge with conflict resolution. Sensitive data scanning before push. Per-collection or bulk sync.

**Vault Integration** — HashiCorp Vault KV v2 (Token + AppRole auth, namespace support for Enterprise/HCP) and AWS Secrets Manager. Sync environment variables to/from your secrets provider.

**Code Generation** — Generate request snippets in 9 languages: cURL, Python, JavaScript (fetch), Node.js (axios), PHP (Laravel), Go, Ruby, C#, and Java.

**Import/Export** — Import from Postman (collections, environments, workspace dumps) and Insomnia (v4 JSON). Export/import Vaxtly data as JSON.

**Auto-Update** — Windows and Linux auto-download updates. macOS notifies with the `brew upgrade` command. Snap updates via `snap refresh`.

## Development

```bash
npm install
npm run dev          # Hot-reload dev server
npm run build        # Production build
npm run test         # Run tests
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 35 |
| UI | Svelte 5 (runes) |
| CSS | Tailwind CSS 4 |
| Editor | CodeMirror 6 |
| Database | SQLite (better-sqlite3) |
| HTTP | undici |
| Encryption | AES-256-GCM via Electron safeStorage |
| Tests | Vitest + Playwright |

### Project Structure

```
src/
  shared/     Types and constants shared between main and renderer
  main/       Electron main process (IPC handlers, services, database)
  renderer/   Svelte UI (components, stores, styles)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical reference.

## License

[MIT](LICENSE)
