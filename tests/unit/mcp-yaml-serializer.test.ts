import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openTestDatabase, closeDatabase } from '../../src/main/database/connection'
import { initEncryptionForTesting } from '../../src/main/services/encryption'
import {
  serializeMcpServer,
  serializeMcpServersDirectory,
  importMcpServerFromYaml,
  importMcpServersFromDirectory,
} from '../../src/main/services/mcp-yaml-serializer'
import * as mcpServersRepo from '../../src/main/database/repositories/mcp-servers'
import * as workspacesRepo from '../../src/main/database/repositories/workspaces'
import type { McpServer } from '../../src/shared/types/mcp'
import type { FileContent } from '../../src/shared/types/sync'

beforeEach(() => {
  openTestDatabase()
  initEncryptionForTesting()
})
afterEach(() => closeDatabase())

function createWorkspace(): string {
  return workspacesRepo.create({ name: 'Test Workspace' }).id
}

function createStdioServer(wsId: string, overrides?: Partial<Parameters<typeof mcpServersRepo.create>[0]>): McpServer {
  return mcpServersRepo.create({
    workspace_id: wsId,
    name: 'Test Server',
    transport_type: 'stdio',
    command: 'npx',
    args: JSON.stringify(['-y', '@modelcontextprotocol/server-everything']),
    env: JSON.stringify({ API_KEY: '{{api_key}}', DEBUG: 'true' }),
    cwd: '/tmp/test',
    ...overrides,
  })
}

function createHttpServer(wsId: string, overrides?: Partial<Parameters<typeof mcpServersRepo.create>[0]>): McpServer {
  return mcpServersRepo.create({
    workspace_id: wsId,
    name: 'HTTP Server',
    transport_type: 'streamable-http',
    url: 'http://localhost:3000/mcp',
    headers: JSON.stringify({ Authorization: 'Bearer {{token}}' }),
    ...overrides,
  })
}

describe('serializeMcpServer', () => {
  it('serializes a stdio server to YAML', () => {
    const wsId = createWorkspace()
    const server = createStdioServer(wsId)

    const yaml = serializeMcpServer(server)

    expect(yaml).toContain('name: Test Server')
    expect(yaml).toContain('transport_type: stdio')
    expect(yaml).toContain('command: npx')
    expect(yaml).toContain("- '-y'")
    expect(yaml).toContain("API_KEY: '{{api_key}}'")

    expect(yaml).toContain('cwd: /tmp/test')
  })

  it('serializes an HTTP server to YAML', () => {
    const wsId = createWorkspace()
    const server = createHttpServer(wsId)

    const yaml = serializeMcpServer(server)

    expect(yaml).toContain('name: HTTP Server')
    expect(yaml).toContain('transport_type: streamable-http')
    expect(yaml).toContain('url: http://localhost:3000/mcp')
    expect(yaml).toContain("Authorization: Bearer {{token}}")
  })

  it('sanitizes sensitive env values', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({
      workspace_id: wsId,
      name: 'Sensitive Server',
      transport_type: 'stdio',
      command: 'node',
      env: JSON.stringify({ API_KEY: 'secret123', NORMAL: 'value' }),
    })

    const yaml = serializeMcpServer(server, { sanitize: true })

    // API_KEY should be blanked
    expect(yaml).toContain("API_KEY: ''")
    // NORMAL should remain
    expect(yaml).toContain('NORMAL: value')
  })

  it('preserves {{variable}} references during sanitization', () => {
    const wsId = createWorkspace()
    const server = mcpServersRepo.create({
      workspace_id: wsId,
      name: 'Var Server',
      transport_type: 'stdio',
      command: 'node',
      env: JSON.stringify({ API_KEY: '{{my_key}}' }),
    })

    const yaml = serializeMcpServer(server, { sanitize: true })

    expect(yaml).toContain('{{my_key}}')
  })
})

describe('serializeMcpServersDirectory', () => {
  it('generates files with manifest', () => {
    const wsId = createWorkspace()
    const server1 = createStdioServer(wsId, { name: 'Server A' })
    const server2 = createHttpServer(wsId, { name: 'Server B' })

    const files = serializeMcpServersDirectory([server1, server2])

    expect(Object.keys(files)).toHaveLength(3) // 2 servers + manifest
    expect(files[`${server1.id}.yaml`]).toContain('Server A')
    expect(files[`${server2.id}.yaml`]).toContain('Server B')
    expect(files['_manifest.yaml']).toContain(server1.id)
    expect(files['_manifest.yaml']).toContain(server2.id)
  })

  it('manifest preserves ordering', () => {
    const wsId = createWorkspace()
    const server1 = createStdioServer(wsId, { name: 'First' })
    const server2 = createHttpServer(wsId, { name: 'Second' })

    const files = serializeMcpServersDirectory([server1, server2])
    const manifest = files['_manifest.yaml']

    const idx1 = manifest.indexOf(server1.id)
    const idx2 = manifest.indexOf(server2.id)
    expect(idx1).toBeLessThan(idx2)
  })
})

describe('importMcpServerFromYaml', () => {
  it('imports a new server from YAML', () => {
    const wsId = createWorkspace()
    const yaml = `id: "11111111-1111-1111-1111-111111111111"
name: Imported Server
transport_type: stdio
command: npx
args:
  - "-y"
  - "@modelcontextprotocol/server-echo"
env:
  NODE_ENV: production
cwd: /home/user
`

    const id = importMcpServerFromYaml(yaml, wsId)

    expect(id).toBe('11111111-1111-1111-1111-111111111111')
    const server = mcpServersRepo.findById(id)
    expect(server).toBeDefined()
    expect(server!.name).toBe('Imported Server')
    expect(server!.command).toBe('npx')
    expect(JSON.parse(server!.args!)).toEqual(['-y', '@modelcontextprotocol/server-echo'])
    expect(JSON.parse(server!.env!)).toEqual({ NODE_ENV: 'production' })
    expect(server!.cwd).toBe('/home/user')
  })

  it('upserts an existing server', () => {
    const wsId = createWorkspace()
    const existing = createStdioServer(wsId)

    const yaml = `id: "${existing.id}"
name: Updated Name
transport_type: stdio
command: node
args:
  - server.js
env: {}
`

    importMcpServerFromYaml(yaml, wsId)

    const updated = mcpServersRepo.findById(existing.id)
    expect(updated!.name).toBe('Updated Name')
    expect(updated!.command).toBe('node')
  })
})

describe('importMcpServersFromDirectory', () => {
  it('imports multiple servers from file list', () => {
    const wsId = createWorkspace()
    const id1 = '11111111-1111-1111-1111-111111111111'
    const id2 = '22222222-2222-2222-2222-222222222222'

    const files: FileContent[] = [
      {
        path: `mcp-servers/_manifest.yaml`,
        content: `items:\n  - id: "${id1}"\n  - id: "${id2}"\n`,
      },
      {
        path: `mcp-servers/${id1}.yaml`,
        content: `id: "${id1}"\nname: Server One\ntransport_type: stdio\ncommand: node\nargs: []\nenv: {}\n`,
      },
      {
        path: `mcp-servers/${id2}.yaml`,
        content: `id: "${id2}"\nname: Server Two\ntransport_type: streamable-http\nurl: "http://localhost:8080"\nheaders: {}\n`,
      },
    ]

    const imported = importMcpServersFromDirectory(files, wsId)

    expect(imported).toHaveLength(2)
    expect(imported).toContain(id1)
    expect(imported).toContain(id2)

    const server1 = mcpServersRepo.findById(id1)
    const server2 = mcpServersRepo.findById(id2)
    expect(server1!.name).toBe('Server One')
    expect(server2!.name).toBe('Server Two')
    expect(server2!.transport_type).toBe('streamable-http')

    // Check ordering from manifest
    expect(server1!.order).toBe(0)
    expect(server2!.order).toBe(1)
  })
})

describe('round-trip serialization', () => {
  it('round-trips a stdio server through serialize/import', () => {
    const wsId = createWorkspace()
    const original = createStdioServer(wsId)

    const yaml = serializeMcpServer(original)
    mcpServersRepo.remove(original.id)

    const id = importMcpServerFromYaml(yaml, wsId)
    const restored = mcpServersRepo.findById(id)

    expect(restored!.name).toBe(original.name)
    expect(restored!.command).toBe(original.command)
    expect(restored!.args).toBe(original.args)
    expect(restored!.env).toBe(original.env)
    expect(restored!.cwd).toBe(original.cwd)
  })

  it('round-trips an HTTP server through serialize/import', () => {
    const wsId = createWorkspace()
    const original = createHttpServer(wsId)

    const yaml = serializeMcpServer(original)
    mcpServersRepo.remove(original.id)

    const id = importMcpServerFromYaml(yaml, wsId)
    const restored = mcpServersRepo.findById(id)

    expect(restored!.name).toBe(original.name)
    expect(restored!.url).toBe(original.url)
    expect(restored!.headers).toBe(original.headers)
  })
})
