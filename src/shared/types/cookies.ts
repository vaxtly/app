/** Cookie Jar types */

export interface StoredCookie {
  name: string
  value: string
  domain: string
  path: string
  expires?: number // epoch ms, undefined = session cookie
  httpOnly: boolean
  secure: boolean
  sameSite?: string
  createdAt: number // epoch ms
}
