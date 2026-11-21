import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import { ConvexError } from 'convex/values'

const http = httpRouter()
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const errors: Record<number, string> = { 400: 'Invalid request.', 401: 'Invalid credentials.', 404: 'Post not found.', 502: 'Publishing service unavailable.' }
const fail = (status: number, message = errors[status]) => json({ message }, status)
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')

const read = httpAction(async (ctx, request) => {
  const key = request.headers.get('x-api-key')
  if (!key || !/^cs_[a-f0-9]{64}$/.test(key)) return fail(401)
  const url = new URL(request.url)
  const slug = url.pathname.slice('/api/v1/posts/'.length)
  if (url.pathname !== '/api/v1/posts' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return fail(404)
  const page = Number(url.searchParams.get('page') ?? 1)
  const limit = Number(url.searchParams.get('limit') ?? 12)
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 50) return fail(400)
  // Buckets are not created in Phase 1; none of the posts belong to one.
  const result = await ctx.runQuery(internal.delivery.read, { keyHash: await hash(key), ...(slug ? { slug } : {}), page, limit })
  if (result.status !== 200) return fail(result.status)
  return json(!slug && url.searchParams.has('bucket') ? { posts: [], total: 0 } : result.body)
})
http.route({ path: '/api/v1/posts', method: 'GET', handler: read })
http.route({ pathPrefix: '/api/v1/posts/', method: 'GET', handler: read })

http.route({ path: '/studio-admin', method: 'POST', handler: httpAction(async (ctx, request) => {
  const secret = process.env.STUDIO_SERVICE_TOKEN
  const auth = request.headers.get('authorization')
  if (!secret || secret.length < 32 || !auth || await hash(auth) !== await hash(`Bearer ${secret}`)) return fail(401)
  try {
    const { operation, ...args } = await request.json()
    switch (operation) {
      case 'projects': return json(await ctx.runQuery(internal.studio.listProjects, {}))
      case 'createProject': {
        const key = 'cs_' + Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
        const id = await ctx.runMutation(internal.studio.createProject, { ...args, apiKeyHash: await hash(key) })
        return json({ id, key }, 201)
      }
      case 'articles': return json(await ctx.runQuery(internal.studio.listArticles, args))
      case 'save': return json(await ctx.runMutation(internal.studio.save, args))
      default: return fail(400)
    }
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === 'string') return fail(400, error.data)
    return fail(502)
  }
}) })
export default http
