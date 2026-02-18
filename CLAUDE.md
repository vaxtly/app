# Vaxtly Next — AI Development Guide

## What Is This?

Pure Electron + TypeScript + Svelte 5 rewrite of Vaxtly (API client). Replaces the Laravel/NativePHP stack.
See `ARCHITECTURE.md` for the complete technical reference.

## Quick Reference

| What | Where |
|------|-------|
| Full architecture docs | `ARCHITECTURE.md` |
| Migration plan | `/home/emepese/.claude/plans/piped-imagining-wolf.md` |
| Original Laravel app | `/var/www/vaxtly/` |
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

## Current Phase Status

- Phase 0 (Foundation): COMPLETE
- Phase 1 (Core Request Builder): COMPLETE
- Phase 2 (Environments + Variables): COMPLETE
- Phase 3 (Scripting + History + Code Gen): COMPLETE
- Phase 4 (Git Sync): COMPLETE — YAML serializer, sensitive data scanner, GitHub/GitLab providers, remote sync service, IPC handlers, 40 tests. UI: RemoteSyncTab, ConflictModal, SensitiveDataModal, sync status indicators.
- Phase 5 (Vault + Import/Export): COMPLETE — Vault provider + sync, data export/import, Postman import, vault IPC, 28 tests. UI: VaultTab, DataTab, vault sync in EnvironmentEditor, drag-drop, WelcomeGuide, HtmlPreview, WorkspaceSwitcher, EnvironmentAssociationModal, SettingsModal (4 tabs).

## Important: Keep ARCHITECTURE.md Updated

When completing a phase or making significant changes:
1. Update the Migration Status table
2. Add new files to the Project Structure
3. Document new IPC channels
4. Update Known Issues / TODOs
