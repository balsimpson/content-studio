export default defineEventHandler((event) => {
  const page = Number(getQuery(event).page ?? 1)
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw createError({ statusCode: 400, statusMessage: 'Invalid page.' })
  setHeader(event, 'Cache-Control', 'no-store')
  return delivery(event, `/api/v1/posts?page=${page}&limit=12`)
})
