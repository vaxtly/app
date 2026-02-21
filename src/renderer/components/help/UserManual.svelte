<script lang="ts">
  import { onMount, tick } from 'svelte'

  interface Props {
    open: boolean
    onclose: () => void
  }

  let { open, onclose }: Props = $props()

  interface Section {
    id: string
    title: string
    icon: string
  }

  const sections: Section[] = [
    { id: 'getting-started', title: 'Getting Started', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'collections-folders', title: 'Collections & Folders', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { id: 'request-builder', title: 'Request Builder', icon: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
    { id: 'headers-params', title: 'Headers & Query Params', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
    { id: 'request-body', title: 'Request Body', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'authentication', title: 'Authentication', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
    { id: 'environments', title: 'Environments & Variables', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { id: 'scripts', title: 'Scripts', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    { id: 'response-viewer', title: 'Response Viewer', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'code-generation', title: 'Code Generation', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'remote-sync', title: 'Remote Sync (Git)', icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4' },
    { id: 'vault', title: 'Vault Integration', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { id: 'data-management', title: 'Data Management', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
    { id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  ]

  let search = $state('')
  let activeSection = $state('getting-started')
  let contentEl = $state<HTMLElement | null>(null)

  const filteredSections = $derived(
    search.trim()
      ? sections.filter((s) => s.title.toLowerCase().includes(search.trim().toLowerCase()))
      : sections
  )

  function scrollToSection(id: string): void {
    activeSection = id
    const el = contentEl?.querySelector(`[data-section="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') onclose()
  }

  function handleScroll(): void {
    if (!contentEl) return
    const scrollTop = contentEl.scrollTop + 40
    let current = sections[0].id
    for (const section of sections) {
      const el = contentEl.querySelector(`[data-section="${section.id}"]`) as HTMLElement | null
      if (el && el.offsetTop <= scrollTop) {
        current = section.id
      }
    }
    activeSection = current
  }

  $effect(() => {
    if (open) {
      search = ''
      activeSection = 'getting-started'
      tick().then(() => {
        if (contentEl) contentEl.scrollTop = 0
      })
    }
  })
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    role="dialog"
    aria-modal="true"
    onkeydown={handleKeydown}
  >
    <!-- Backdrop -->
    <button class="absolute inset-0" onclick={onclose} aria-label="Close"></button>

    <!-- Modal -->
    <div class="modal-container">
      <!-- Header -->
      <div class="modal-header">
        <div class="flex items-center gap-2">
          <svg class="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <h2 class="text-sm font-semibold text-surface-200">User Manual</h2>
        </div>
        <button onclick={onclose} class="text-surface-500 hover:text-surface-200" aria-label="Close">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body: sidebar + content -->
      <div class="modal-body">
        <!-- Sidebar -->
        <div class="sidebar">
          <div class="search-wrapper">
            <svg class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              bind:value={search}
              placeholder="Search sections..."
              class="search-input"
            />
          </div>
          <nav class="nav-list">
            {#each filteredSections as section}
              <button
                class="nav-item"
                class:active={activeSection === section.id}
                onclick={() => scrollToSection(section.id)}
              >
                <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path d={section.icon} />
                </svg>
                <span class="truncate">{section.title}</span>
              </button>
            {/each}
          </nav>
        </div>

        <!-- Content -->
        <div class="content" bind:this={contentEl} onscroll={handleScroll}>

          <!-- Getting Started -->
          <div data-section="getting-started" class="section">
            <h3 class="section-title">Getting Started</h3>
            <p class="prose">
              Vaxtly is a modern API client for crafting, testing, and managing HTTP requests.
              Everything is organized around <strong>workspaces</strong> — each workspace holds its own
              collections, environments, and settings.
            </p>
            <h4 class="subsection-title">UI Layout</h4>
            <p class="prose">
              The interface is split into three main areas: a collapsible <strong>sidebar</strong> on
              the left for browsing collections and environments, a <strong>tab bar</strong> across the
              top for switching between open requests and environments, and the main
              <strong>editor area</strong> for building and viewing requests.
            </p>
            <h4 class="subsection-title">Creating Your First Request</h4>
            <p class="prose">
              Press <kbd>Cmd+N</kbd> (or <kbd>Ctrl+N</kbd> on Linux/Windows) to create a new request.
              If no collection exists yet, one will be created automatically. Enter a URL, choose an
              HTTP method, and hit <kbd>Cmd+Enter</kbd> to send.
            </p>
            <div class="tip">
              <strong>Tip:</strong> Use <kbd>Cmd+B</kbd> to toggle the sidebar for more screen space while working.
            </div>
          </div>

          <!-- Collections & Folders -->
          <div data-section="collections-folders" class="section">
            <h3 class="section-title">Collections & Folders</h3>
            <p class="prose">
              Collections group related requests together. Within a collection you can create nested
              <strong>folders</strong> to further organize requests (e.g., by resource or feature).
            </p>
            <h4 class="subsection-title">Managing Collections</h4>
            <p class="prose">
              Right-click in the sidebar to create, rename, or delete collections. You can reorder
              collections and folders by dragging them. Requests can be moved between folders and
              collections via drag-and-drop.
            </p>
            <h4 class="subsection-title">Default Environments</h4>
            <p class="prose">
              Each collection or folder can have a <strong>default environment</strong> associated with
              it. When you open a request inside that folder/collection, its default environment
              activates automatically. Set this by right-clicking a collection or folder and choosing
              "Set Default Environment."
            </p>
            <div class="tip">
              <strong>Tip:</strong> Folder-level defaults take precedence over collection-level defaults,
              so you can have a collection-wide "staging" env but override it for specific folders.
            </div>
          </div>

          <!-- Request Builder -->
          <div data-section="request-builder" class="section">
            <h3 class="section-title">Request Builder</h3>
            <p class="prose">
              The request builder is the main area for composing HTTP requests. At the top is the
              <strong>URL bar</strong> with a method selector dropdown supporting
              GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
            </p>
            <h4 class="subsection-title">Sending & Cancelling</h4>
            <p class="prose">
              Press the <strong>Send</strong> button or <kbd>Cmd+Enter</kbd> to execute the request.
              While a request is in flight you can cancel it by clicking the cancel button that
              replaces Send. The response panel will show status, timing, and body once complete.
            </p>
            <h4 class="subsection-title">Saving</h4>
            <p class="prose">
              Press <kbd>Cmd+S</kbd> to save the current request. Unsaved changes are indicated
              by a dot on the tab. Tab state is preserved across sessions — unsaved edits won't be
              lost if you switch tabs.
            </p>
          </div>

          <!-- Headers & Query Params -->
          <div data-section="headers-params" class="section">
            <h3 class="section-title">Headers & Query Params</h3>
            <p class="prose">
              Both headers and query parameters use the same <strong>key-value editor</strong>.
              Each row has a key, a value, and a toggle to enable or disable it without deleting.
            </p>
            <h4 class="subsection-title">Implicit Headers</h4>
            <p class="prose">
              Some headers are added automatically based on your request configuration:
              <code>Content-Type</code> is set based on the selected body type, and
              <code>Authorization</code> is set if you configure authentication. You can override
              these by adding them explicitly.
            </p>
            <h4 class="subsection-title">Environment Variables</h4>
            <p class="prose">
              Use <code>{"{{variable}}"}</code> syntax in any header or param value. Variables are
              resolved from the active environment when the request is sent.
            </p>
          </div>

          <!-- Request Body -->
          <div data-section="request-body" class="section">
            <h3 class="section-title">Request Body</h3>
            <p class="prose">
              Vaxtly supports seven body types, selectable from the body tab dropdown:
            </p>
            <ul class="list">
              <li><strong>None</strong> — no body (used for GET, HEAD, etc.)</li>
              <li><strong>JSON</strong> — syntax-highlighted JSON editor with validation</li>
              <li><strong>XML</strong> — syntax-highlighted XML editor</li>
              <li><strong>Form Data</strong> — key-value pairs supporting both text values and <strong>file uploads</strong></li>
              <li><strong>URL-Encoded</strong> — key-value pairs sent as <code>application/x-www-form-urlencoded</code></li>
              <li><strong>Raw</strong> — plain text editor for any content type</li>
              <li><strong>GraphQL</strong> — dedicated editor with query and variables fields</li>
            </ul>
            <div class="tip">
              <strong>Tip:</strong> The body type is remembered per-request. Switching between body types
              preserves your content — switching away and back restores the previous content for that type.
            </div>
          </div>

          <!-- Authentication -->
          <div data-section="authentication" class="section">
            <h3 class="section-title">Authentication</h3>
            <p class="prose">
              The Auth tab supports four authentication methods:
            </p>
            <ul class="list">
              <li><strong>None</strong> — no authentication header</li>
              <li><strong>Bearer Token</strong> — sends <code>Authorization: Bearer &lt;token&gt;</code></li>
              <li><strong>Basic Auth</strong> — sends base64-encoded <code>Authorization: Basic &lt;credentials&gt;</code> from a username and password</li>
              <li><strong>API Key</strong> — sends a custom header with your API key (you specify the header name and value)</li>
            </ul>
            <p class="prose">
              Auth credentials are <strong>encrypted at rest</strong> using AES-256-CBC, so tokens and
              passwords are never stored in plain text in the database.
            </p>
            <div class="note">
              <strong>Note:</strong> Environment variables (<code>{"{{token}}"}</code>) work in all auth fields,
              so you can store sensitive tokens in environments and reference them here.
            </div>
          </div>

          <!-- Environments & Variables -->
          <div data-section="environments" class="section">
            <h3 class="section-title">Environments & Variables</h3>
            <p class="prose">
              Environments let you define sets of variables (like <code>base_url</code>,
              <code>api_key</code>) and switch between them — e.g., development vs. staging vs.
              production.
            </p>
            <h4 class="subsection-title">Creating & Activating</h4>
            <p class="prose">
              Create environments from the sidebar's Environments panel. Activate one using the
              <strong>environment selector</strong> dropdown in the tab bar. Only one environment is
              active at a time per workspace.
            </p>
            <h4 class="subsection-title">Variable Syntax</h4>
            <p class="prose">
              Use <code>{"{{variableName}}"}</code> anywhere in your request — URL, headers, query
              params, body, and auth fields. Variables are resolved at send time from the active
              environment.
            </p>
            <h4 class="subsection-title">Resolution Order</h4>
            <p class="prose">
              Variables are resolved in this priority: <strong>collection-level overrides</strong> take
              precedence over <strong>base environment values</strong>. If a collection has variables
              that overlap with the environment, the collection values win.
            </p>
            <h4 class="subsection-title">Nested References</h4>
            <p class="prose">
              Variables can reference other variables: if <code>base_url</code> is
              <code>{"{{protocol}}://{{host}}"}</code>, Vaxtly resolves the chain automatically (up to
              a depth limit to prevent infinite loops).
            </p>
            <div class="tip">
              <strong>Tip:</strong> Sensitive variable values (like tokens) are encrypted at rest. The
              <code>enc:</code> prefix in the database indicates encrypted values — this is handled
              transparently.
            </div>
          </div>

          <!-- Scripts -->
          <div data-section="scripts" class="section">
            <h3 class="section-title">Scripts</h3>
            <p class="prose">
              Vaxtly supports <strong>pre-request</strong> and <strong>post-response</strong> scripts
              for each request, enabling dynamic workflows and variable extraction.
            </p>
            <h4 class="subsection-title">Pre-Request Scripts</h4>
            <p class="prose">
              Pre-request scripts run before the request is sent. The primary use case is
              <strong>dependent request execution</strong> — you can fire another request first (e.g.,
              to get an auth token) and use its response in the current request.
            </p>
            <h4 class="subsection-title">Post-Response Scripts</h4>
            <p class="prose">
              Post-response scripts run after a response is received. Use them to extract values from
              the response body, headers, or status code and <strong>set environment variables</strong>
              for subsequent requests.
            </p>
            <div class="note">
              <strong>Note:</strong> Script chain depth is limited to prevent infinite loops when
              requests trigger other requests via pre-request scripts.
            </div>
          </div>

          <!-- Response Viewer -->
          <div data-section="response-viewer" class="section">
            <h3 class="section-title">Response Viewer</h3>
            <p class="prose">
              After sending a request, the response panel shows several tabs:
            </p>
            <ul class="list">
              <li><strong>Body</strong> — syntax-highlighted response body (JSON, XML, HTML, or plain text)</li>
              <li><strong>Headers</strong> — all response headers in a readable table</li>
              <li><strong>Cookies</strong> — parsed cookies from <code>Set-Cookie</code> headers</li>
              <li><strong>HTML Preview</strong> — live rendered preview for HTML responses</li>
            </ul>
            <p class="prose">
              The status bar shows the HTTP status code (color-coded: green for 2xx, yellow for 3xx,
              red for 4xx/5xx), response time, and response size.
            </p>
          </div>

          <!-- Code Generation -->
          <div data-section="code-generation" class="section">
            <h3 class="section-title">Code Generation</h3>
            <p class="prose">
              Generate ready-to-use code snippets from any request in five languages:
            </p>
            <ul class="list">
              <li><strong>cURL</strong> — command-line HTTP</li>
              <li><strong>Python</strong> — using the <code>requests</code> library</li>
              <li><strong>PHP</strong> — using cURL functions</li>
              <li><strong>JavaScript</strong> — using the Fetch API</li>
              <li><strong>Node.js</strong> — using the <code>http</code>/<code>https</code> module</li>
            </ul>
            <p class="prose">
              Environment variables are substituted with their actual values before code is generated,
              so the output is ready to copy and run.
            </p>
          </div>

          <!-- Remote Sync -->
          <div data-section="remote-sync" class="section">
            <h3 class="section-title">Remote Sync (Git)</h3>
            <p class="prose">
              Sync your collections to a Git repository (GitHub or GitLab) for backup, sharing, and
              version control.
            </p>
            <h4 class="subsection-title">Setup</h4>
            <p class="prose">
              Go to <strong>Settings &rarr; Remote Sync</strong> and configure your provider (GitHub
              or GitLab), repository URL, branch, and personal access token. Use <strong>Test
              Connection</strong> to verify access.
            </p>
            <h4 class="subsection-title">Pull & Push</h4>
            <p class="prose">
              <strong>Pull</strong> downloads collections from the remote repo and merges them into your
              workspace. <strong>Push</strong> uploads your local collections (serialized as YAML) to
              the remote. You can push individual collections or all at once.
            </p>
            <h4 class="subsection-title">Conflict Resolution</h4>
            <p class="prose">
              When both local and remote have changed, Vaxtly detects the conflict and presents a modal
              to choose: <strong>Keep Local</strong> (overwrite remote) or <strong>Keep Remote</strong>
              (overwrite local).
            </p>
            <h4 class="subsection-title">Sensitive Data Scanning</h4>
            <p class="prose">
              Before pushing, Vaxtly scans for sensitive data (tokens, passwords, API keys) in your
              collections. If findings are detected, a modal lets you review and choose whether to
              sanitize before pushing or push as-is.
            </p>
            <div class="tip">
              <strong>Tip:</strong> Enable <strong>auto-sync</strong> in settings to automatically pull
              and push on a schedule.
            </div>
          </div>

          <!-- Vault -->
          <div data-section="vault" class="section">
            <h3 class="section-title">Vault Integration</h3>
            <p class="prose">
              Integrate with <strong>HashiCorp Vault</strong> (KV v1 and v2 secrets engines) to manage
              sensitive environment variables externally. Works with open-source Vault, Vault Enterprise,
              and HCP Vault.
            </p>
            <h4 class="subsection-title">Configuration Fields</h4>
            <p class="prose">
              Open <strong>Settings &rarr; Vault</strong> and fill in the following fields:
            </p>
            <ul class="list">
              <li><strong>Vault URL</strong> — The base URL of your Vault server, e.g. <code>https://vault.example.com</code> or <code>https://vault-cluster.vault.xxxxx.aws.hashicorp.cloud:8200</code>. Do not include a trailing slash or any path.</li>
              <li><strong>Authentication</strong> — Choose <strong>Token</strong> (direct Vault token) or <strong>AppRole</strong> (Role ID + Secret ID). AppRole is recommended for automated or shared environments.</li>
              <li><strong>Token</strong> — Your Vault token (for Token auth). Starts with <code>hvs.</code> for service tokens.</li>
              <li><strong>Role ID / Secret ID</strong> — Your AppRole credentials (for AppRole auth).</li>
              <li><strong>Namespace</strong> — <em>Optional, AppRole only.</em> The Vault namespace used during AppRole login (sent as <code>X-Vault-Namespace</code> header). Only needed if your AppRole is in a specific namespace. Leave empty for token auth or if the AppRole is in the root namespace.</li>
              <li><strong>Engine Path</strong> — The <strong>full mount path</strong> to the KV secrets engine. This is the complete path as it appears in the Vault URL, including any namespace prefixes. For example: <code>secret</code>, <code>admin/kv</code>, or <code>organization/team/kv-engine</code>. For HCP Vault and Vault Enterprise with namespaces, include the full path from the root (e.g. <code>admin/my-namespace/secret</code>).</li>
              <li><strong>Verify SSL</strong> — Validate the server's TLS certificate. Disable only for self-signed certificates in development.</li>
              <li><strong>Auto Sync</strong> — When enabled, automatically pulls secrets from Vault on application startup.</li>
            </ul>
            <div class="note">
              <strong>Important:</strong> The <strong>Namespace</strong> field is only used during AppRole authentication.
              For all data operations (list, read, write, delete), Vaxtly uses the <strong>Engine Path</strong> directly.
              If your KV engine is nested inside Vault namespaces, include the full namespace path in the Engine Path
              field, not in the Namespace field.
            </div>
            <h4 class="subsection-title">Testing the Connection</h4>
            <p class="prose">
              Click <strong>Test Connection</strong> to verify your configuration. This checks that
              authentication succeeds and that the configured engine path exists. The test will show
              descriptive error messages for common issues like SSL errors, DNS failures, or
              authentication problems.
            </p>
            <h4 class="subsection-title">Pull & Push Secrets</h4>
            <p class="prose">
              <strong>Pull All</strong> lists all secrets at the engine root and creates local
              environments for each one that doesn't already exist locally. Use this for initial
              setup or to discover new secrets added by teammates.
            </p>
            <p class="prose">
              <strong>Push</strong> sends your local environment variables to Vault. You can push from
              individual environment editors (for vault-synced environments) or use the Vault settings
              tab for bulk operations.
            </p>
            <h4 class="subsection-title">Vault-Synced Environments</h4>
            <p class="prose">
              When editing an environment, you can enable <strong>Vault sync</strong> to link it with a
              specific Vault path. This allows granular pull/push of individual environments. The Vault
              path defaults to a slugified version of the environment name, but you can customize it.
            </p>
            <h4 class="subsection-title">Migrate Path</h4>
            <p class="prose">
              If you need to move secrets between Vault paths (e.g., after renaming an environment),
              use the <strong>Migrate</strong> feature to copy secrets from the old path to the new one
              and delete the old path, without manual re-entry.
            </p>
            <div class="tip">
              <strong>Tip:</strong> Vaxtly automatically tries both KV v2 and KV v1 API formats when listing
              secrets, so it works with either engine version without extra configuration.
            </div>
          </div>

          <!-- Data Management -->
          <div data-section="data-management" class="section">
            <h3 class="section-title">Data Management</h3>
            <p class="prose">
              Export and import your data from <strong>Settings &rarr; Data</strong>.
            </p>
            <h4 class="subsection-title">Export</h4>
            <p class="prose">
              Export options: <strong>All</strong> (collections + environments + config),
              <strong>Collections only</strong>, <strong>Environments only</strong>, or
              <strong>Config only</strong>. Exported data is saved as a JSON file.
            </p>
            <h4 class="subsection-title">Import — Vaxtly Format</h4>
            <p class="prose">
              Import a previously exported Vaxtly JSON file. Collections, environments, and config
              are restored into the current workspace.
            </p>
            <h4 class="subsection-title">Import — Postman</h4>
            <p class="prose">
              Vaxtly supports importing three Postman formats:
            </p>
            <ul class="list">
              <li><strong>Workspace dump</strong> — full Postman export with multiple collections</li>
              <li><strong>Collection v2.1</strong> — single Postman collection export</li>
              <li><strong>Environment</strong> — Postman environment export</li>
            </ul>
            <div class="tip">
              <strong>Tip:</strong> You can drag and drop JSON files directly onto the Data tab to import them.
            </div>
          </div>

          <!-- Keyboard Shortcuts -->
          <div data-section="keyboard-shortcuts" class="section">
            <h3 class="section-title">Keyboard Shortcuts</h3>
            <p class="prose">
              The modifier key is <kbd>Cmd</kbd> on macOS and <kbd>Ctrl</kbd> on Linux/Windows.
            </p>
            <div class="shortcuts-table">
              <table>
                <thead>
                  <tr>
                    <th>Shortcut</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td><kbd>Mod+N</kbd></td><td>New request</td></tr>
                  <tr><td><kbd>Mod+S</kbd></td><td>Save request</td></tr>
                  <tr><td><kbd>Mod+Enter</kbd></td><td>Send request</td></tr>
                  <tr><td><kbd>Mod+W</kbd></td><td>Close tab</td></tr>
                  <tr><td><kbd>Mod+B</kbd></td><td>Toggle sidebar</td></tr>
                  <tr><td><kbd>Mod+,</kbd></td><td>Open settings</td></tr>
                  <tr><td><kbd>Mod+L</kbd></td><td>Focus URL bar</td></tr>
                  <tr><td><kbd>Ctrl+PageDown</kbd></td><td>Next tab</td></tr>
                  <tr><td><kbd>Ctrl+PageUp</kbd></td><td>Previous tab</td></tr>
                  <tr><td><kbd>F1</kbd></td><td>Open user manual</td></tr>
                  <tr><td><kbd>Escape</kbd></td><td>Close modal / cancel</td></tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-container {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 64rem;
    max-height: 90vh;
    border-radius: 0.5rem;
    border: 1px solid var(--border-subtle);
    background-color: var(--color-surface-900);
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.5);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-default);
  }

  .modal-body {
    display: flex;
    min-height: 0;
    flex: 1;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    width: 14rem;
    flex-shrink: 0;
    border-right: 1px solid var(--border-default);
    background-color: var(--color-surface-850);
  }

  .search-wrapper {
    position: relative;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-default);
  }

  .search-icon {
    position: absolute;
    left: 1.15rem;
    top: 50%;
    transform: translateY(-50%);
    width: 0.875rem;
    height: 0.875rem;
    color: var(--color-surface-500);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 0.375rem 0.5rem 0.375rem 1.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--color-surface-600);
    background-color: var(--color-surface-800);
    color: var(--color-surface-200);
    font-size: 0.75rem;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--color-surface-500);
  }

  .search-input:focus {
    border-color: var(--color-brand-500);
  }

  .nav-list {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-surface-400);
    text-align: left;
    transition: all 0.15s;
    cursor: pointer;
    background: none;
    border: none;
    width: 100%;
  }

  .nav-item:hover {
    color: var(--color-surface-200);
    background-color: var(--color-surface-700);
  }

  .nav-item.active {
    color: var(--color-brand-400);
    background-color: var(--color-brand-500/0.1);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 2rem;
  }

  .section {
    padding-bottom: 2rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--color-surface-800);
  }

  .section:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .section-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-surface-100);
    margin-bottom: 0.75rem;
  }

  .subsection-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-surface-200);
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }

  .prose {
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--color-surface-300);
    margin-bottom: 0.5rem;
  }

  .prose strong {
    color: var(--color-surface-200);
    font-weight: 500;
  }

  .prose code {
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background-color: var(--color-surface-800);
    color: var(--color-brand-300);
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .prose kbd {
    display: inline-block;
    padding: 0.0625rem 0.375rem;
    border-radius: 0.25rem;
    border: 1px solid var(--color-surface-600);
    background-color: var(--color-surface-800);
    color: var(--color-surface-300);
    font-size: 0.6875rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    line-height: 1.5;
  }

  .list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
  }

  .list li {
    position: relative;
    padding-left: 1rem;
    margin-bottom: 0.375rem;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--color-surface-300);
  }

  .list li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 0.25rem;
    height: 0.25rem;
    border-radius: 50%;
    background-color: var(--color-surface-500);
  }

  .list li strong {
    color: var(--color-surface-200);
    font-weight: 500;
  }

  .list li code {
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background-color: var(--color-surface-800);
    color: var(--color-brand-300);
    font-size: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .tip, .note {
    margin-top: 0.75rem;
    padding: 0.625rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .tip {
    border-left: 3px solid var(--color-brand-500);
    background-color: var(--color-brand-500/0.06);
    color: var(--color-surface-300);
  }

  .tip strong {
    color: var(--color-brand-400);
  }

  .note {
    border-left: 3px solid var(--color-surface-500);
    background-color: var(--color-surface-800/0.5);
    color: var(--color-surface-300);
  }

  .note strong {
    color: var(--color-surface-200);
  }

  .note code, .tip code {
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background-color: var(--color-surface-800);
    color: var(--color-brand-300);
    font-size: 0.6875rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .shortcuts-table {
    margin-top: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border-subtle);
    overflow: hidden;
  }

  .shortcuts-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }

  .shortcuts-table thead {
    background-color: var(--color-surface-800);
  }

  .shortcuts-table th {
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 500;
    color: var(--color-surface-300);
    font-size: 0.75rem;
  }

  .shortcuts-table td {
    padding: 0.375rem 0.75rem;
    color: var(--color-surface-400);
    border-top: 1px solid var(--color-surface-800);
  }

  .shortcuts-table kbd {
    display: inline-block;
    padding: 0.0625rem 0.375rem;
    border-radius: 0.25rem;
    border: 1px solid var(--color-surface-600);
    background-color: var(--color-surface-800);
    color: var(--color-surface-300);
    font-size: 0.6875rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
</style>
