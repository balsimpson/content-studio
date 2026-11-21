import { v, ConvexError } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { snapshot } from './schema'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
function slugCheck(slug: string) {
  if (slug.length > 80 || !slugPattern.test(slug)) throw new ConvexError('Use a lowercase, hyphen-separated slug (up to 80 characters).')
}

export const listProjects = internalQuery({ args: {}, handler: async (ctx) =>
  (await ctx.db.query('projects').collect()).map(({ _id, name, slug }) => ({ _id, name, slug })),
})

export const createProject = internalMutation({
  args: { name: v.string(), slug: v.string(), apiKeyHash: v.string() },
  handler: async (ctx, { name, slug, apiKeyHash }) => {
    slugCheck(slug)
    name = name.trim()
    if (!name || name.length > 100) throw new ConvexError('Enter a project name of 1–100 characters.')
    if (await ctx.db.query('projects').withIndex('by_slug', q => q.eq('slug', slug)).unique())
      throw new ConvexError('That project slug is already in use.')
    return await ctx.db.insert('projects', { name, slug, apiKeyHash })
  },
})

export const listArticles = internalQuery({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    const articles = await ctx.db.query('articles').withIndex('by_project', q => q.eq('projectId', projectId)).order('desc').collect()
    return await Promise.all(articles.map(async ({ _id, draft, version }) => {
      const live = await ctx.db.query('publishedArticles').withIndex('by_article', q => q.eq('articleId', _id)).unique()
      return { _id, draft, version, publishedVersion: live?.version ?? null }
    }))
  },
})

export const save = internalMutation({
  args: {
    projectId: v.id('projects'), articleId: v.optional(v.id('articles')), expectedVersion: v.optional(v.number()),
    draft: snapshot, publish: v.boolean(),
  },
  handler: async (ctx, { projectId, articleId, expectedVersion, draft, publish }) => {
    if (!await ctx.db.get(projectId)) throw new ConvexError('Project not found.')
    slugCheck(draft.slug)
    if (!draft.title.trim() || draft.title.length > 160 || draft.metaDescription.length > 320 || draft.markdown.length > 100_000)
      throw new ConvexError('Enter a title and stay within the title, description and Markdown limits.')
    if (publish && !draft.markdown.trim()) throw new ConvexError('Add some Markdown before publishing.')

    const previous = articleId ? await ctx.db.get(articleId) : null
    if (articleId && (!previous || previous.projectId !== projectId)) throw new ConvexError('Article not found.')
    if (previous && previous.version !== expectedVersion) throw new ConvexError('This article changed in another session. Copy your edits before reloading.')
    const live = articleId ? await ctx.db.query('publishedArticles').withIndex('by_article', q => q.eq('articleId', articleId!)).unique() : null
    if (live && live.slug !== draft.slug) throw new ConvexError('A published slug is permanent in this version.')
    if (publish) {
      const occupied = await ctx.db.query('publishedArticles').withIndex('by_slug', q => q.eq('projectId', projectId).eq('slug', draft.slug)).unique()
      if (occupied && occupied.articleId !== articleId) throw new ConvexError('That slug belongs to another published article.')
    }

    const version = (previous?.version ?? 0) + 1
    const id = articleId ?? await ctx.db.insert('articles', { projectId, draft, version })
    if (articleId) await ctx.db.patch(articleId, { draft, version })
    await ctx.db.insert('articleRevisions', { articleId: id, projectId, content: draft, version, kind: publish ? 'publish' : 'save' })
    if (publish) {
      const now = Date.now()
      const entry = { projectId, articleId: id, slug: draft.slug, content: draft, publishedAt: live?.publishedAt ?? now, updatedAt: now, version }
      if (live) await ctx.db.replace(live._id, entry)
      else await ctx.db.insert('publishedArticles', entry)
    }
    return { _id: id, draft, version, publishedVersion: publish ? version : live?.version ?? null }
  },
})
