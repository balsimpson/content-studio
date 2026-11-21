import { v } from 'convex/values'
import { internalQuery } from './_generated/server'
import type { Doc } from './_generated/dataModel'

function summary(post: Doc<'publishedArticles'>) {
  const { title, slug, metaDescription, markdown } = post.content
  return {
    title, slug, metaDescription, coverImageUrl: null, bucket: null, tags: [],
    readingTime: Math.max(1, Math.ceil(markdown.trim().split(/\s+/).length / 220)),
    publishedAt: new Date(post.publishedAt).toISOString(), updatedAt: new Date(post.updatedAt).toISOString(),
  }
}

export const read = internalQuery({
  args: { keyHash: v.string(), slug: v.optional(v.string()), page: v.number(), limit: v.number() },
  handler: async (ctx, { keyHash, slug, page, limit }) => {
    const project = await ctx.db.query('projects').withIndex('by_hash', q => q.eq('apiKeyHash', keyHash)).unique()
    if (!project) return { status: 401 as const }
    if (slug) {
      const post = await ctx.db.query('publishedArticles').withIndex('by_slug', q => q.eq('projectId', project._id).eq('slug', slug)).unique()
      return post
        ? { status: 200 as const, body: { ...summary(post), markdown: post.content.markdown, relatedPosts: [] } }
        : { status: 404 as const }
    }
    // Small v1 catalogs: exact total for page/limit compatibility. Move to cursors + counts before large catalogs.
    const posts = await ctx.db.query('publishedArticles').withIndex('by_published', q => q.eq('projectId', project._id)).order('desc').collect()
    return { status: 200 as const, body: { posts: posts.slice((page - 1) * limit, page * limit).map(summary), total: posts.length } }
  },
})
