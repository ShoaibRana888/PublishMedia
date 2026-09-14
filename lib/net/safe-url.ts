import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/**
 * SSRF guard for user-supplied hosts (e.g. a Mastodon instance). Server code
 * must never fetch an arbitrary URL the user typed — it could point at
 * localhost, cloud metadata endpoints, or internal services.
 */

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10/8
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) || // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      a >= 224 // multicast / reserved
    )
  }
  if (v === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7)) // v4-mapped
    return false
  }
  return true // not an IP at all → treat as unsafe for the IP check
}

/**
 * Pure part: parse + structural checks. Returns the normalised origin
 * (`https://host`) or throws.
 */
export function normalizePublicHttpsOrigin(raw: string): string {
  let v = raw.trim()
  if (!v) throw new Error('Missing host')
  if (!/^[a-z]+:\/\//i.test(v)) v = `https://${v}`
  let u: URL
  try {
    u = new URL(v)
  } catch {
    throw new Error('Invalid URL')
  }
  if (u.protocol !== 'https:') throw new Error('Only https:// hosts are allowed')
  if (u.username || u.password) throw new Error('Credentials in URL are not allowed')
  if (u.port && u.port !== '443') throw new Error('Non-standard ports are not allowed')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local hosts are not allowed')
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private IP addresses are not allowed')
  } else if (!host.includes('.')) {
    throw new Error('Host must be a public domain')
  }
  return `https://${u.host}`
}

/**
 * Full check: structural rules + DNS resolution to reject hosts that resolve
 * to private ranges. Use at connect time (and again before fetching, since
 * DNS can change).
 */
export async function assertPublicHttpsOrigin(raw: string): Promise<string> {
  const origin = normalizePublicHttpsOrigin(raw)
  const host = new URL(origin).hostname
  if (!isIP(host)) {
    const addrs = await lookup(host, { all: true }).catch(() => [])
    if (addrs.length === 0) throw new Error('Host could not be resolved')
    if (addrs.some((a) => isPrivateIp(a.address))) {
      throw new Error('Host resolves to a private address')
    }
  }
  return origin
}
