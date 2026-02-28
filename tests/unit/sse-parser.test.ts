import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SSEParser } from '../../src/main/services/sse-parser'

// Mock performance.now for deterministic timestamps
let mockNow = 1000
vi.stubGlobal('performance', { now: () => mockNow })

describe('SSEParser', () => {
  let parser: SSEParser

  beforeEach(() => {
    mockNow = 1000
    parser = new SSEParser(0)
  })

  it('parses a basic message event', () => {
    const events = parser.push('data: hello world\n\n')
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      event: 'message',
      data: 'hello world',
      timestamp: 1000,
    })
  })

  it('parses multi-line data fields', () => {
    const events = parser.push('data: line 1\ndata: line 2\ndata: line 3\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('line 1\nline 2\nline 3')
  })

  it('parses named event types', () => {
    const events = parser.push('event: delta\ndata: token\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('delta')
    expect(events[0].data).toBe('token')
  })

  it('defaults event type to "message"', () => {
    const events = parser.push('data: test\n\n')
    expect(events[0].event).toBe('message')
  })

  it('tracks id field', () => {
    const events = parser.push('id: 42\ndata: test\n\n')
    expect(events[0].id).toBe('42')
  })

  it('persists last event id across events', () => {
    const events = parser.push('id: 1\ndata: first\n\ndata: second\n\n')
    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('1')
    expect(events[1].id).toBe('1') // persists
  })

  it('ignores comment lines', () => {
    const events = parser.push(': this is a comment\ndata: hello\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello')
  })

  it('ignores comment-only blocks', () => {
    const events = parser.push(': comment\n\n')
    expect(events).toHaveLength(0)
  })

  it('handles empty data field', () => {
    const events = parser.push('data:\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('')
  })

  it('handles data field with no space after colon', () => {
    const events = parser.push('data:no-space\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('no-space')
  })

  it('handles \\r\\n line endings', () => {
    const events = parser.push('data: hello\r\n\r\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello')
  })

  it('handles \\r line endings', () => {
    const events = parser.push('data: hello\r\r')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello')
  })

  it('handles mixed line endings', () => {
    const events = parser.push('data: a\r\ndata: b\rdata: c\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('a\nb\nc')
  })

  it('handles partial chunks across push boundaries', () => {
    let events = parser.push('dat')
    expect(events).toHaveLength(0)

    events = parser.push('a: hello\n')
    expect(events).toHaveLength(0)

    events = parser.push('\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello')
  })

  it('handles data split mid-line', () => {
    let events = parser.push('data: hel')
    expect(events).toHaveLength(0)

    events = parser.push('lo world\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello world')
  })

  it('parses multiple events in a single chunk', () => {
    const events = parser.push('data: first\n\ndata: second\n\n')
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('first')
    expect(events[1].data).toBe('second')
  })

  it('handles [DONE] sentinel from OpenAI', () => {
    const events = parser.push('data: {"text":"hi"}\n\ndata: [DONE]\n\n')
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('{"text":"hi"}')
    expect(events[1].data).toBe('[DONE]')
  })

  it('ignores retry field', () => {
    const events = parser.push('retry: 5000\ndata: hello\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello')
  })

  it('ignores unknown fields', () => {
    const events = parser.push('foo: bar\ndata: hello\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('hello')
  })

  it('handles field with no colon (empty value)', () => {
    const events = parser.push('data\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('')
  })

  it('does not dispatch event without data lines', () => {
    const events = parser.push('event: ping\n\n')
    expect(events).toHaveLength(0)
  })

  it('resets event type after dispatch', () => {
    const events = parser.push('event: custom\ndata: first\n\ndata: second\n\n')
    expect(events[0].event).toBe('custom')
    expect(events[1].event).toBe('message') // reset to default
  })

  it('handles JSON data from OpenAI-style streaming', () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
    const events = parser.push(chunk)
    expect(events).toHaveLength(1)
    const parsed = JSON.parse(events[0].data)
    expect(parsed.choices[0].delta.content).toBe('Hello')
  })

  it('handles Anthropic-style streaming with event types', () => {
    const stream = [
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('')

    const events = parser.push(stream)
    expect(events).toHaveLength(3)
    expect(events[0].event).toBe('message_start')
    expect(events[1].event).toBe('content_block_delta')
    expect(events[2].event).toBe('message_stop')
  })

  it('rejects id with null character', () => {
    const events = parser.push('id: bad\0id\ndata: test\n\n')
    expect(events).toHaveLength(1)
    expect(events[0].id).toBeUndefined()
  })
})
