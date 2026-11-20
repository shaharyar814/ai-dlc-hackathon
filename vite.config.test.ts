import { describe, expect, it } from 'vitest'
import config from './vite.config.ts'

type ConfigFn = (env: { command: 'build' | 'serve'; mode: string }) => {
  base?: string
  server?: { port?: number; allowedHosts?: string[]; hmr?: unknown }
}

const resolve = config as unknown as ConfigFn

describe('vite config base', () => {
  it('uses / for the production build', () => {
    expect(resolve({ command: 'build', mode: 'production' }).base).toBe('/')
  })
  it('keeps /absproxy/5173/ for the dev server', () => {
    expect(resolve({ command: 'serve', mode: 'development' }).base).toBe('/absproxy/5173/')
  })
  it('leaves the dev server settings unchanged', () => {
    const server = resolve({ command: 'serve', mode: 'development' }).server
    expect(server?.port).toBe(5173)
    expect(server?.allowedHosts).toEqual(['d149s395dq6r7g.cloudfront.net'])
    expect(server?.hmr).toEqual({ protocol: 'wss', clientPort: 443 })
  })
})
