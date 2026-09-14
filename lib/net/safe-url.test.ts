import { describe, it, expect } from 'vitest'
import { isPrivateIp, normalizePublicHttpsOrigin } from './safe-url'

describe('isPrivateIp', () => {
  it('flags loopback, RFC1918, link-local, metadata, CGNAT', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
  })
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })
})

describe('normalizePublicHttpsOrigin', () => {
  it('normalises a bare host to an https origin', () => {
    expect(normalizePublicHttpsOrigin('mastodon.social')).toBe('https://mastodon.social')
    expect(normalizePublicHttpsOrigin('https://mastodon.social/@me')).toBe('https://mastodon.social')
  })
  it('rejects http, ports, credentials', () => {
    expect(() => normalizePublicHttpsOrigin('http://mastodon.social')).toThrow(/https/)
    expect(() => normalizePublicHttpsOrigin('https://mastodon.social:8443')).toThrow(/port/)
    expect(() => normalizePublicHttpsOrigin('https://user:pw@mastodon.social')).toThrow(/Credentials/)
  })
  it('rejects local and private targets', () => {
    expect(() => normalizePublicHttpsOrigin('localhost')).toThrow()
    expect(() => normalizePublicHttpsOrigin('https://169.254.169.254')).toThrow(/Private/)
    expect(() => normalizePublicHttpsOrigin('https://10.0.0.5')).toThrow(/Private/)
    expect(() => normalizePublicHttpsOrigin('https://[::1]')).toThrow()
    expect(() => normalizePublicHttpsOrigin('intranet')).toThrow(/public domain/)
    expect(() => normalizePublicHttpsOrigin('db.internal')).toThrow(/Local/)
  })
})
