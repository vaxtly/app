import type { SSEEvent } from '../../shared/types/http'

/**
 * Stateful SSE text parser per the HTML spec:
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 *
 * Handles multi-line data fields, event/id fields, comments, and all line ending styles.
 * Buffers partial lines across chunk boundaries.
 */
export class SSEParser {
  private buffer = ''
  private eventType = ''
  private dataLines: string[] = []
  private lastEventId = ''
  private startTime: number

  constructor(startTime: number) {
    this.startTime = startTime
  }

  push(chunk: string): SSEEvent[] {
    this.buffer += chunk
    const events: SSEEvent[] = []

    // Split on any line ending while preserving partial last line
    const lines = this.buffer.split(/\r\n|\r|\n/)
    // Last element is either empty (complete line) or partial (incomplete)
    this.buffer = lines.pop()!

    for (const line of lines) {
      if (line === '') {
        // Empty line = dispatch event
        if (this.dataLines.length > 0) {
          const data = this.dataLines.join('\n')
          events.push({
            event: this.eventType || 'message',
            data,
            ...(this.lastEventId && { id: this.lastEventId }),
            timestamp: performance.now() - this.startTime,
          })
        }
        // Reset per-event fields (lastEventId persists across events per spec)
        this.dataLines = []
        this.eventType = ''
        continue
      }

      if (line.startsWith(':')) {
        // Comment line — ignored
        continue
      }

      const colonIndex = line.indexOf(':')
      let field: string
      let value: string

      if (colonIndex === -1) {
        // Line with no colon: field name is the entire line, value is empty string
        field = line
        value = ''
      } else {
        field = line.slice(0, colonIndex)
        // If there's a space after the colon, skip it (per spec)
        value = line[colonIndex + 1] === ' ' ? line.slice(colonIndex + 2) : line.slice(colonIndex + 1)
      }

      switch (field) {
        case 'data':
          this.dataLines.push(value)
          break
        case 'event':
          this.eventType = value
          break
        case 'id':
          // Per spec, id field must not contain U+0000 NULL
          if (!value.includes('\0')) {
            this.lastEventId = value
          }
          break
        case 'retry':
          // Retry field — ignored (we don't reconnect)
          break
        // Unknown fields are ignored per spec
      }
    }

    return events
  }
}
