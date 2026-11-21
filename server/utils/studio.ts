import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, getHeader, useSession, type H3Event } from 'h3'

function sha(value: string) { return createHash('sha256').update(value).digest() }
export function passwordMatches(input: string, password: string) { return timingSafeEqual(sha(input), sha(password)) }

export function studioSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (config.sessionPassword.length < 32 || config.studioPassword.length < 24 || config.studioServiceToken.length < 32)
    throw createError({ statusCode: 503, statusMessage: 'Studio secrets are not configured.' })
  return useSession<{ owner?: boolean }>(event, {
    name: 'content-studio-session', password: config.sessionPassword, maxAge: 8 * 60 * 60,
    cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' },
  })
}

export function requireStudioRequest(event: H3Event) {
  if (getHeader(event, 'x-studio-request') !== '1' || getHeader(event, 'sec-fetch-site') === 'cross-site')
    throw createError({ statusCode: 403, statusMessage: 'Studio requests must come from this site.' })
}

export async function callStudio(event: H3Event, body: Record<string, unknown>) {
  const config = useRuntimeConfig(event)
  if (!config.convexSiteUrl) throw createError({ statusCode: 503, statusMessage: 'Convex HTTP Actions URL is not configured.' })
  let response: Response
  try {
    response = await fetch(new URL('/studio-admin', config.convexSiteUrl), {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.studioServiceToken}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Could not reach Convex.' })
  }
  if (!response.ok) {
    const result = response.status === 400 ? await response.json().catch(() => null) : null
    throw createError({ statusCode: result ? 400 : 502, message: result?.message ?? 'Convex rejected the request. Check your service configuration.' })
  }
  return response.json()
}
