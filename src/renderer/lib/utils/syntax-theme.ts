import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * Custom dark syntax highlighting (Tokyo Night-inspired).
 * Uses blue/amber palette to avoid clashing with variable highlight
 * colors (green = resolved, red = unresolved).
 */
export const darkSyntaxHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: '#7aa2f7' },
  { tag: tags.string, color: '#e0af68' },
  { tag: tags.number, color: '#ff9e64' },
  { tag: [tags.bool, tags.null], color: '#89ddff' },
  { tag: tags.keyword, color: '#bb9af7' },
  { tag: tags.comment, color: '#565f89' },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: '#c0caf5' },
  { tag: tags.tagName, color: '#7aa2f7' },
  { tag: tags.attributeName, color: '#bb9af7' },
  { tag: tags.attributeValue, color: '#e0af68' },
])

/**
 * Custom light syntax highlighting.
 * Same token mapping as dark but with colors suited for white backgrounds.
 */
export const lightSyntaxHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: '#2563eb' },
  { tag: tags.string, color: '#b45309' },
  { tag: tags.number, color: '#c2410c' },
  { tag: [tags.bool, tags.null], color: '#0d9488' },
  { tag: tags.keyword, color: '#7c3aed' },
  { tag: tags.comment, color: '#94a3b8' },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: '#334155' },
  { tag: tags.tagName, color: '#2563eb' },
  { tag: tags.attributeName, color: '#7c3aed' },
  { tag: tags.attributeValue, color: '#b45309' },
])
