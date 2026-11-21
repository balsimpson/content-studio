import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { renderMarkdown } from '../../../shared/markdown'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  requireStudioRequest(event)
  const session = await studioSession(event)
  const body = await readBody<Record<string, unknown>>(event)
  if (!body || typeof body !== 'object') throw createError({ statusCode: 400 })
  if (body.operation === 'session') return { signedIn: session.data.owner === true }
  if (body.operation === 'login') {
    if (typeof body.password !== 'string' || !passwordMatches(body.password, useRuntimeConfig(event).studioPassword))
      throw createError({ statusCode: 401, statusMessage: 'Incorrect password.' })
    await session.update({ owner: true })
    return { signedIn: true }
  }
  if (!session.data.owner) throw createError({ statusCode: 401, statusMessage: 'Sign in first.' })
  if (body.operation === 'logout') {
    await session.clear()
    return { signedIn: false }
  }
  if (body.operation === 'preview') {
    if (typeof body.markdown !== 'string' || body.markdown.length > 100_000) throw createError({ statusCode: 400 })
    return { html: renderMarkdown(body.markdown) }
  }
  if (!['projects', 'createProject', 'articles', 'save'].includes(String(body.operation))) throw createError({ statusCode: 400 })
  return callStudio(event, body)
})
