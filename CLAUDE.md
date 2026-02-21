# Vaxtly — AI Development Guide

## What Is This?

A fast, native API client for developers. Built with Electron, TypeScript, and Svelte 5.
See `ARCHITECTURE.md` for the complete technical reference.

## Quick Reference

| What | Where |
|------|-------|
| Full architecture docs | `ARCHITECTURE.md` |
| Shared types | `src/shared/types/*.ts` + `src/shared/constants.ts` |
| Database schema | `src/main/database/migrations/001_initial_schema.ts` |
| All IPC handlers | `src/main/ipc/*.ts` |
| All repositories | `src/main/database/repositories/*.ts` |
| Preload (full API) | `src/main/preload.ts` |
| Stores | `src/renderer/lib/stores/*.svelte.ts` |
| Tests | `tests/unit/repositories.test.ts` |

## Commands

```bash
npm run dev          # Hot-reload dev server
npm run build        # Production build (electron-vite build)
npm run test         # Vitest single run
npm run test:watch   # Vitest watch mode
```

## Conventions

### TypeScript
- Strict mode everywhere. No `any` unless absolutely necessary.
- All entity interfaces in `src/shared/types/models.ts`.
- IPC channels in `src/shared/types/ipc.ts` as const object.
- Path alias: `@shared/*` → `src/shared/*` (configured in both tsconfigs + electron.vite.config.ts).

### Svelte 5
- **Runes only**: `$state`, `$derived`, `$props`, `$effect`. No legacy `let` reactivity.
- **Store pattern**: module-level `$state` + exported object with getters + action functions.
- **No `<svelte:self>`**: use explicit self-import (`import FolderItem from './FolderItem.svelte'`).
- **Curly braces in attributes**: use JS expression syntax `placeholder={"text with {braces}"}`, not string attributes.
- **No nested `<button>`**: use `<div role="button" tabindex="0">` as outer interactive element when it contains a button child.
- **Bind `HTMLElement` refs**: always use `let el = $state<HTMLElement | null>(null)`, not bare `let el: HTMLElement`.

### Database
- UUID primary keys (TEXT) via `uuid` package.
- JSON stored as TEXT columns, parsed in repositories/stores.
- Foreign keys with CASCADE (except requests→folders which is SET NULL).
- Repositories are plain exported functions, not classes.
- `getDatabase()` returns the singleton `better-sqlite3` instance.
- **Encryption**: sensitive data encrypted transparently at the repository layer (AES-256-CBC). Settings tokens, environment variable values (`enc:` prefix), and request auth credentials (`enc:` prefix) are encrypted on write and decrypted on read. See `services/encryption.ts`.

### IPC
- Pattern: `ipcMain.handle('domain:action', handler)` in main.
- Preload exposes typed API: `window.api.domain.action()`.
- Domain prefixes: workspaces, collections, folders, requests, environments, histories, proxy, sync, vault, settings, window.

### Testing
- Vitest with `openTestDatabase()` (in-memory SQLite) in `beforeEach`.
- `globals: true` — no need to import describe/it/expect.
- Test file naming: `tests/unit/<name>.test.ts`.

### CSS
- Tailwind v4 with `@theme` in `src/renderer/styles/app.css`.
- Custom color scales: `brand-*` (blue), `surface-*` (slate).
- CodeMirror overrides in app.css.

## Important: Keep ARCHITECTURE.md Updated

When making significant changes:
1. Add new files to the Project Structure
2. Document new IPC channels
3. Update relevant service/component documentation
