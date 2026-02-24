import {
  entriesToBulk,
  bulkToEntries,
  formDataToBulk,
  bulkToFormData,
} from '../../src/renderer/lib/utils/bulk-edit'

// ---------------------------------------------------------------------------
// entriesToBulk
// ---------------------------------------------------------------------------
describe('entriesToBulk', () => {
  it('serializes enabled entries', () => {
    const result = entriesToBulk([
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'Accept', value: '*/*', enabled: true },
    ])
    expect(result).toBe('Content-Type:application/json\nAccept:*/*')
  })

  it('prefixes disabled entries with #', () => {
    const result = entriesToBulk([
      { key: 'X-Old', value: 'gone', enabled: false },
    ])
    expect(result).toBe('#X-Old:gone')
  })

  it('skips entries where both key and value are empty', () => {
    const result = entriesToBulk([
      { key: '', value: '', enabled: true },
      { key: 'Host', value: 'example.com', enabled: true },
    ])
    expect(result).toBe('Host:example.com')
  })

  it('keeps entries with only a key', () => {
    const result = entriesToBulk([
      { key: 'X-Flag', value: '', enabled: true },
    ])
    expect(result).toBe('X-Flag:')
  })

  it('keeps entries with only a value', () => {
    const result = entriesToBulk([
      { key: '', value: 'orphan', enabled: true },
    ])
    expect(result).toBe(':orphan')
  })

  it('returns empty string for no entries', () => {
    expect(entriesToBulk([])).toBe('')
  })
})

// ---------------------------------------------------------------------------
// bulkToEntries
// ---------------------------------------------------------------------------
describe('bulkToEntries', () => {
  it('parses basic key:value lines', () => {
    const entries = bulkToEntries('Host:example.com\nAccept:*/*')
    expect(entries).toEqual([
      { key: 'Host', value: 'example.com', enabled: true },
      { key: 'Accept', value: '*/*', enabled: true },
    ])
  })

  it('splits on first colon only — values can contain colons', () => {
    const entries = bulkToEntries('Authorization:Bearer token:with:colons')
    expect(entries).toEqual([
      { key: 'Authorization', value: 'Bearer token:with:colons', enabled: true },
    ])
  })

  it('handles disabled lines prefixed with #', () => {
    const entries = bulkToEntries('#X-Old:gone')
    expect(entries).toEqual([
      { key: 'X-Old', value: 'gone', enabled: false },
    ])
  })

  it('skips empty and whitespace-only lines', () => {
    const entries = bulkToEntries('A:1\n\n  \nB:2')
    expect(entries).toEqual([
      { key: 'A', value: '1', enabled: true },
      { key: 'B', value: '2', enabled: true },
    ])
  })

  it('handles lines without colon as key-only', () => {
    const entries = bulkToEntries('no-colon-here')
    expect(entries).toEqual([
      { key: 'no-colon-here', value: '', enabled: true },
    ])
  })

  it('returns empty array for empty string', () => {
    expect(bulkToEntries('')).toEqual([])
  })

  it('round-trips with entriesToBulk', () => {
    const original = [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'X-Disabled', value: 'yes', enabled: false },
      { key: 'Authorization', value: 'Bearer a:b:c', enabled: true },
    ]
    const text = entriesToBulk(original)
    const parsed = bulkToEntries(text)
    expect(parsed).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// formDataToBulk
// ---------------------------------------------------------------------------
describe('formDataToBulk', () => {
  it('serializes text entries like entriesToBulk', () => {
    const result = formDataToBulk([
      { key: 'name', value: 'Alice', type: 'text', enabled: true },
    ])
    expect(result).toBe('name:Alice')
  })

  it('serializes file entries as read-only #key:@filename (file)', () => {
    const result = formDataToBulk([
      { key: 'avatar', value: 'pic.png', type: 'file', fileName: 'pic.png', filePath: '/tmp/pic.png', enabled: true },
    ])
    expect(result).toBe('#avatar:@pic.png (file)')
  })

  it('uses value as fallback when fileName is missing', () => {
    const result = formDataToBulk([
      { key: 'doc', value: 'report.pdf', type: 'file', enabled: true },
    ])
    expect(result).toBe('#doc:@report.pdf (file)')
  })

  it('skips entries where both key and value are empty', () => {
    const result = formDataToBulk([
      { key: '', value: '', type: 'text', enabled: true },
      { key: 'x', value: 'y', type: 'text', enabled: true },
    ])
    expect(result).toBe('x:y')
  })
})

// ---------------------------------------------------------------------------
// bulkToFormData
// ---------------------------------------------------------------------------
describe('bulkToFormData', () => {
  it('parses text entries', () => {
    const result = bulkToFormData('name:Alice\nage:30', [])
    expect(result).toEqual([
      { key: 'name', value: 'Alice', type: 'text', enabled: true },
      { key: 'age', value: '30', type: 'text', enabled: true },
    ])
  })

  it('restores file entries from original array', () => {
    const original = [
      { key: 'avatar', value: 'pic.png', type: 'file' as const, fileName: 'pic.png', filePath: '/tmp/pic.png', enabled: true },
    ]
    const result = bulkToFormData('#avatar:@pic.png (file)', original)
    expect(result).toEqual([
      { ...original[0], enabled: false },
    ])
  })

  it('preserves file entry order with duplicate keys', () => {
    const original = [
      { key: 'file', value: 'a.txt', type: 'file' as const, fileName: 'a.txt', filePath: '/a', enabled: true },
      { key: 'file', value: 'b.txt', type: 'file' as const, fileName: 'b.txt', filePath: '/b', enabled: true },
    ]
    const text = '#file:@a.txt (file)\n#file:@b.txt (file)'
    const result = bulkToFormData(text, original)
    expect(result[0].filePath).toBe('/a')
    expect(result[1].filePath).toBe('/b')
  })

  it('creates file stub when no original match exists', () => {
    const result = bulkToFormData('#upload:@missing.pdf (file)', [])
    expect(result).toEqual([
      { key: 'upload', value: 'missing.pdf', type: 'file', fileName: 'missing.pdf', enabled: false },
    ])
  })

  it('handles disabled text entries', () => {
    const result = bulkToFormData('#old:val', [])
    expect(result).toEqual([
      { key: 'old', value: 'val', type: 'text', enabled: false },
    ])
  })

  it('round-trips text entries with formDataToBulk', () => {
    const original = [
      { key: 'a', value: '1', type: 'text' as const, enabled: true },
      { key: 'b', value: '2', type: 'text' as const, enabled: false },
    ]
    const text = formDataToBulk(original)
    const parsed = bulkToFormData(text, original)
    expect(parsed).toEqual(original)
  })
})
