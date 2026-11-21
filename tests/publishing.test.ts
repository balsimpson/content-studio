import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { internal } from '../convex/_generated/api'
import type { Id } from "../convex/_generated/dataModel"
import { renderMarkdown } from '../shared/markdown'

const modules = import.meta.glob('../convex/**/*.{ts,js}')
const adminToken = 'local-test-service-token-not-for-production'
const example = { slug: 'first-post', title: 'First post', metaDescription: 'An introduction.', markdown: 'Original **body**.' }
function setup() {
  vi.stubEnv('STUDIO_SERVICE_TOKEN', adminToken)
  const t = convexTest(schema, modules)
  async function admin(operation: string, args: Record<string, unknown> = {}, token = adminToken) {
    return t.fetch('/studio-admin', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, ...args }) })
  }
  async function project(name: string, slug: string) {
    const response = await admin('createProject', { name, slug })
    expect(response.status).toBe(201)
    return response.json() as Promise<{ id: string, key: string }>
  }
  function get(key?: string, suffix = '') {
    return t.fetch(`/api/v1/posts${suffix}`, { headers: key ? { 'x-api-key': key } : {} })
  }
  return { admin, project, get, t }
}
afterEach(() => vi.unstubAllEnvs())

describe('publishing pipe', () => {
  it('isolates projects and only serves an explicit published snapshot', async () => {
    const { admin, project, get } = setup()
    expect((await admin('projects', {}, 'wrong-token')).status).toBe(401)
    expect((await get()).status).toBe(401)
    expect((await get(`cs_${'0'.repeat(64)}`)).status).toBe(401)
    const a = await project('Alpha', 'alpha')
    const b = await project('Beta', 'beta')
    const saved = await admin('save', { projectId: a.id, draft: example, publish: false })
    expect(saved.status).toBe(200)
    const article = await saved.json()
    const ids = { projectId: a.id, articleId: article._id }
    expect(await (await get(a.key)).json()).toEqual({ posts: [], total: 0 })
    expect((await get(a.key, '/first-post')).status).toBe(404)
    expect((await admin('save', { ...ids, projectId: b.id, expectedVersion: 1, draft: example, publish: true })).status).toBe(400)
    expect((await admin('save', { ...ids, expectedVersion: 1, draft: example, publish: true })).status).toBe(200)
    expect((await get(b.key, '/first-post')).status).toBe(404)
    expect(await (await get(b.key)).json()).toEqual({ posts: [], total: 0 })
    const original = await (await get(a.key, '/first-post')).json()
    expect(original).toMatchObject({ ...example, readingTime: 1, relatedPosts: [] })
    expect((await (await get(a.key)).json()).posts[0]).not.toHaveProperty('markdown')
    expect(await (await get(a.key, '?page=2&limit=1')).json()).toEqual({ posts: [], total: 1 })
    expect((await get(a.key, '?limit=51')).status).toBe(400)
    const next = { ...example, markdown: 'Updated draft, not live yet.' }
    expect((await admin('save', { ...ids, expectedVersion: 2, draft: next, publish: false })).status).toBe(200)
    expect(await (await get(a.key, '/first-post')).json()).toEqual(original)
    expect((await admin('save', { ...ids, expectedVersion: 3, draft: next, publish: true })).status).toBe(200)
    expect(await (await get(a.key, '/first-post')).json()).toMatchObject({ markdown: next.markdown, publishedAt: original.publishedAt })
  })

  it('keeps drafts, revisions, and live state intact after conflicting publishes', async () => {
    const { admin, project, get, t } = setup()
    const a = await project('Alpha', 'alpha')
    const first = await (await admin('save', { projectId: a.id, draft: example, publish: true })).json()
    const other = { ...example, markdown: 'Do not lose these edits.' }
    const second = await (await admin('save', { projectId: a.id, draft: other, publish: false })).json()
    for (const request of [
      { articleId: first._id, expectedVersion: 0, draft: other },
      { articleId: first._id, expectedVersion: 1, draft: { ...example, slug: 'different' } },
      { articleId: second._id, expectedVersion: 1, draft: { ...other, markdown: 'Rejected update.' } },
    ]) {
      expect((await admin('save', { projectId: a.id, publish: true, ...request })).status).toBe(400)
    }
    expect((await (await get(a.key, '/first-post')).json()).markdown).toBe(example.markdown)
    const drafts = await t.query(internal.studio.listArticles, { projectId: a.id as Id<'projects'> })
    expect(drafts.find(row => row._id === second._id)).toMatchObject({ version: 1, draft: other, publishedVersion: null })
    expect(await t.run(ctx => ctx.db.query('articleRevisions').collect())).toHaveLength(2)
    const projects = await (await admin('projects')).json()
    expect(projects).toEqual([{ _id: a.id, name: 'Alpha', slug: 'alpha' }])
  })

  it('renders Markdown while dropping executable HTML and unsafe links', () => {
    const html = renderMarkdown('# Heading\n\n**Bold**\n\n<a href="javascript:alert(1)">click</a> <img src="https://example.com/img" onerror="alert(1)"> <script>bad()</script>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).not.toMatch(/javascript:|onerror|<script|bad\(\)/)
  })
})
