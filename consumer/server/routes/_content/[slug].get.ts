import { renderMarkdown } from '../../../../shared/markdown'
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? ''
  if (slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw createError({ statusCode: 404 })
  setHeader(event, 'Cache-Control', 'no-store')
  const { markdown, ...post } = await delivery<{ markdown: string } & Record<string, unknown>>(event, `/api/v1/posts/${slug}`)
  return { ...post, html: renderMarkdown(markdown) }
})
