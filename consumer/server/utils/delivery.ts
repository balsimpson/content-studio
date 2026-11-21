import { createError, type H3Event } from 'h3'
export async function delivery<T>(event: H3Event, pathname: string) {
  const { deliveryUrl, deliveryKey } = useRuntimeConfig(event)
  if (!deliveryUrl || !deliveryKey) throw createError({ statusCode: 503, statusMessage: 'Blog delivery is not configured.' })
  let response: Response
  try {
    response = await fetch(new URL(pathname, deliveryUrl), { headers: { 'x-api-key': deliveryKey }, redirect: 'error', signal: AbortSignal.timeout(10_000) })
  } catch { throw createError({ statusCode: 502, statusMessage: 'Blog delivery unavailable.' }) }
  if (!response.ok) throw createError({ statusCode: response.status === 404 ? 404 : 502, statusMessage: response.status === 404 ? 'Post not found.' : 'Blog delivery unavailable.' })
  return await response.json() as T
}
