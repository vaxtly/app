import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'

export interface TestServer {
  url: string
  close: () => Promise<void>
}

function handler(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (url.pathname === '/echo') {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        method: req.method,
        path: url.pathname,
        headers: req.headers,
        body: body || null,
      }))
    })
    return
  }

  const statusMatch = url.pathname.match(/^\/status\/(\d+)$/)
  if (statusMatch) {
    const code = parseInt(statusMatch[1], 10)
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: code }))
    return
  }

  if (url.pathname === '/check-header') {
    const name = url.searchParams.get('name') ?? ''
    const value = req.headers[name.toLowerCase()] ?? null
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ header: name, value }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
}

export async function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('unexpected address'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      })
    })
    server.on('error', reject)
  })
}
