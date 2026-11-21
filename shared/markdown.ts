import { marked } from 'marked'
import sanitize from 'sanitize-html'

export function renderMarkdown(source: string) {
  return sanitize(marked.parse(source, { async: false }), {
    allowedTags: [...sanitize.defaults.allowedTags, 'img', 'del'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'], allowProtocolRelative: false,
  })
}
