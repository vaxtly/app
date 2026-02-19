/**
 * CodeMirror 6 extension that highlights {{variable}} references.
 * Resolved variables render green, unresolved render red.
 * Hover tooltip shows the value and source.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  hoverTooltip,
} from '@codemirror/view'
import { type Extension, RangeSetBuilder } from '@codemirror/state'

export interface ResolvedVariable {
  value: string
  source: string
}

const VAR_REGEX = /\{\{([\w\-.]+)\}\}/g

const resolvedMark = Decoration.mark({ class: 'cm-var-resolved' })
const unresolvedMark = Decoration.mark({ class: 'cm-var-unresolved' })

function buildDecorations(
  view: EditorView,
  resolved: Record<string, ResolvedVariable>,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let match: RegExpExecArray | null
    VAR_REGEX.lastIndex = 0
    while ((match = VAR_REGEX.exec(text)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      const varName = match[1]
      const mark = resolved[varName] ? resolvedMark : unresolvedMark
      builder.add(start, end, mark)
    }
  }

  return builder.finish()
}

function variableHighlightPlugin(
  getResolved: () => Record<string, ResolvedVariable>,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, getResolved())
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, getResolved())
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}

function variableTooltip(
  getResolved: () => Record<string, ResolvedVariable>,
): Extension {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos)
    const text = line.text
    VAR_REGEX.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = VAR_REGEX.exec(text)) !== null) {
      const from = line.from + match.index
      const to = from + match[0].length
      if (pos >= from && pos <= to) {
        const varName = match[1]
        const resolved = getResolved()
        const info = resolved[varName]
        return {
          pos: from,
          end: to,
          above: true,
          create() {
            const dom = document.createElement('div')
            dom.className = 'cm-var-tooltip'
            if (info) {
              dom.innerHTML = `<span class="cm-var-tooltip-source">${escapeHtml(info.source)}</span><span class="cm-var-tooltip-value">${escapeHtml(info.value)}</span>`
            } else {
              dom.textContent = `Unresolved: ${varName}`
              dom.classList.add('cm-var-tooltip-unresolved')
            }
            return { dom }
          },
        }
      }
    }
    return null
  })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Creates a CodeMirror extension for {{variable}} highlighting with tooltips.
 * @param getResolved - Function returning current resolved variables map (called on every update)
 */
export function variableHighlight(
  getResolved: () => Record<string, ResolvedVariable>,
): Extension {
  return [variableHighlightPlugin(getResolved), variableTooltip(getResolved)]
}
