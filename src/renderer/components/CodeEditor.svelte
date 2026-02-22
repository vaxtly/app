<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
  import { EditorState, Compartment, type Extension } from '@codemirror/state'
  import { json } from '@codemirror/lang-json'
  import { html } from '@codemirror/lang-html'
  import { xml } from '@codemirror/lang-xml'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { basicSetup } from 'codemirror'
  import { variableHighlight, type ResolvedVariable } from '../lib/utils/variable-highlight'
  import { settingsStore } from '../lib/stores/settings.svelte'

  interface Props {
    value?: string
    language?: 'json' | 'html' | 'xml' | 'text'
    readonly?: boolean
    placeholder?: string
    enableVariableHighlight?: boolean
    getResolvedVariables?: () => Record<string, ResolvedVariable>
    onchange?: (value: string) => void
  }

  let {
    value = '',
    language = 'json',
    readonly = false,
    placeholder = '',
    enableVariableHighlight = false,
    getResolvedVariables,
    onchange,
  }: Props = $props()

  let container: HTMLDivElement
  let view: EditorView | undefined
  let idleHandle: number | ReturnType<typeof setTimeout> | undefined
  const themeCompartment = new Compartment()
  const schedule = typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1)
  const cancelSchedule = typeof cancelIdleCallback === 'function'
    ? cancelIdleCallback
    : (id: ReturnType<typeof setTimeout>) => clearTimeout(id)

  function getLanguageExtension(lang: string): Extension {
    switch (lang) {
      case 'json': return json()
      case 'html': return html()
      case 'xml': return xml()
      default: return []
    }
  }

  function resolveIsDark(): boolean {
    const theme = settingsStore.get('app.theme')
    if (theme === 'light') return false
    if (theme === 'dark') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  onMount(() => {
    idleHandle = schedule(() => {
      const extensions: Extension[] = [
        basicSetup,
        themeCompartment.of(resolveIsDark() ? oneDark : []),
        getLanguageExtension(language),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history()
      ]

      if (readonly) {
        extensions.push(EditorState.readOnly.of(true))
      }

      if (placeholder) {
        extensions.push(placeholderExt(placeholder))
      }

      if (enableVariableHighlight && getResolvedVariables) {
        extensions.push(variableHighlight(getResolvedVariables))
      }

      if (onchange && !readonly) {
        extensions.push(
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onchange(update.state.doc.toString())
            }
          })
        )
      }

      view = new EditorView({
        state: EditorState.create({
          doc: value,
          extensions
        }),
        parent: container
      })
    })
  })

  onDestroy(() => {
    cancelSchedule(idleHandle as any)
    view?.destroy()
  })

  // Update content when value prop changes externally
  $effect(() => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      })
    }
  })

  // Reactively swap CodeMirror theme when app theme changes
  $effect(() => {
    const _theme = settingsStore.get('app.theme')
    if (!view) return
    const isDark = resolveIsDark()
    view.dispatch({
      effects: themeCompartment.reconfigure(isDark ? oneDark : [])
    })
  })
</script>

<div bind:this={container} class="h-full overflow-hidden rounded border border-surface-700 bg-surface-900"></div>
