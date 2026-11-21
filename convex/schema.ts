import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const fields = { title: v.string(), slug: v.string(), metaDescription: v.string(), markdown: v.string() }
export const snapshot = v.object(fields)

export default defineSchema({
  projects: defineTable({ name: v.string(), slug: v.string(), apiKeyHash: v.string() })
    .index('by_slug', ['slug']).index('by_hash', ['apiKeyHash']),
  articles: defineTable({
    projectId: v.id('projects'), draft: snapshot, version: v.number(),
  }).index('by_project', ['projectId']),
  articleRevisions: defineTable({
    projectId: v.id('projects'), articleId: v.id('articles'), content: snapshot,
    kind: v.union(v.literal('save'), v.literal('publish')), version: v.number(),
  }).index('by_article', ['projectId', 'articleId']),
  publishedArticles: defineTable({
    projectId: v.id('projects'), articleId: v.id('articles'), content: snapshot,
    slug: v.string(), publishedAt: v.number(), updatedAt: v.number(), version: v.number(),
  }).index('by_article', ['articleId']).index('by_slug', ['projectId', 'slug'])
    .index('by_published', ['projectId', 'publishedAt']),
})
