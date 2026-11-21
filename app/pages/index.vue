<script setup lang="ts">
type Project = { _id: string, name: string, slug: string }
type Draft = { title: string, slug: string, metaDescription: string, markdown: string }
type Article = { _id: string, draft: Draft, version: number, publishedVersion: number | null }
const blank = (): Draft => ({ title: '', slug: '', metaDescription: '', markdown: '' })
const rpc = <T,>(operation: string, args: Record<string, unknown> = {}) => $fetch<T>('/api/studio', {
  method: 'POST', headers: { 'x-studio-request': '1' }, body: { operation, ...args },
})
const ready = ref(false), signedIn = ref(false), password = ref('')
const projects = ref<Project[]>([]), projectId = ref(''), projectName = ref(''), projectSlug = ref(''), key = ref('')
const articles = ref<Article[]>([]), active = ref<Article | null>(null), draft = ref<Draft>(blank()), editing = ref(false)
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(active.value?.draft ?? blank()))
const busy = ref(false), status = ref(''), error = ref(''), preview = ref(false), html = ref(''), previewProblem = ref(false), previewPending = ref(false)
const confirmDiscard = ref(false), confirmPublish = ref(false)
let nextAction: (() => void) | undefined
function guard(action: () => void) {
  if (!dirty.value) return action()
  nextAction = action
  confirmDiscard.value = true
}
function discard() {
  const action = nextAction
  nextAction = undefined
  confirmDiscard.value = false
  action?.()
}
function warnUnload(event: BeforeUnloadEvent) { if (dirty.value) event.preventDefault() }
async function run(fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  status.value = error.value = ''
  try { await fn() } catch (e) {
    const failure = e as { data?: { message?: string }, statusMessage?: string }
    error.value = failure.data?.message || failure.statusMessage || 'The request failed. Try again.'
  } finally { busy.value = false }
}
async function loadProjects() { projects.value = await rpc<Project[]>('projects') }
async function init() {
  await run(async () => {
    signedIn.value = (await rpc<{ signedIn: boolean }>('session')).signedIn
    if (signedIn.value) await loadProjects()
  })
  ready.value = true
}
onMounted(() => { window.addEventListener('beforeunload', warnUnload); void init() })
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnUnload))
function selectArticle(article: Article | null) {
  active.value = article
  draft.value = article ? { ...article.draft } : blank()
  editing.value = true
  preview.value = false
}
function leaveEditor() { selectArticle(null); editing.value = false }
async function openProject(id: string) {
  const list = id ? await rpc<Article[]>('articles', { projectId: id }) : []
  projectId.value = id
  articles.value = list
  leaveEditor()
}
const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '')
function login() { return run(async () => { await rpc('login', { password: password.value }); password.value = ''; signedIn.value = true; await loadProjects() }) }
function logout() { guard(() => void run(async () => { await rpc('logout'); leaveEditor(); signedIn.value = false; projects.value = []; projectId.value = ''; articles.value = []; key.value = '' })) }
function createProject() { return run(async () => {
  const name = projectName.value, slug = projectSlug.value || slugify(name)
  const created = await rpc<{ id: string, key: string }>('createProject', { name, slug })
  key.value = created.key
  projects.value.push({ _id: created.id, name, slug })
  projectName.value = projectSlug.value = ''
  projectId.value = created.id
  articles.value = []
  leaveEditor()
}) }
function save(publish: boolean) {
  confirmPublish.value = false
  return run(async () => {
    const saved = await rpc<Article>('save', {
      projectId: projectId.value, draft: { ...draft.value }, publish,
      ...(active.value ? { articleId: active.value._id, expectedVersion: active.value.version } : {}),
    })
    const index = articles.value.findIndex(a => a._id === saved._id)
    if (index >= 0) articles.value.splice(index, 1, saved)
    else articles.value.unshift(saved)
    active.value = saved
    draft.value = { ...saved.draft }
    status.value = publish ? 'Article published.' : 'Draft saved.'
  })
}
watch([preview, () => draft.value.markdown], ([open, markdown], _, cleanup) => {
  if (!open) return
  let obsolete = false
  html.value = ''
  previewProblem.value = false
  previewPending.value = true
  const timer = setTimeout(async () => {
    try {
      const result = await rpc<{ html: string }>('preview', { markdown })
      if (!obsolete) html.value = result.html
    } catch { if (!obsolete) previewProblem.value = true }
    finally { if (!obsolete) previewPending.value = false }
  }, 220)
  cleanup(() => { obsolete = true; clearTimeout(timer) })
})
const publication = (a: Article) => a.publishedVersion == null ? 'Draft' : a.version === a.publishedVersion ? 'Live' : 'Live · pending edits'
useSeoMeta({ title: 'Content Studio', robots: 'noindex, nofollow' })
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 pb-16 sm:px-10">
    <header class="flex min-h-18 items-center justify-between border-b border-stone-300 font-mono text-xs uppercase tracking-widest">
      <span>Content Studio</span>
      <UButton v-if="signedIn" color="neutral" variant="ghost" :disabled="busy" @click="logout">Sign out</UButton>
    </header>
    <p v-if="!ready" class="mt-10 text-stone-600">Opening the studio…</p>
    <template v-else>
      <div class="min-h-12 py-3 text-sm" aria-live="polite">
        <p v-if="error" role="alert" class="text-red-800">{{ error }}</p>
        <p v-else-if="busy" class="text-stone-600">Working…</p>
        <p v-else-if="status" class="text-green-800">{{ status }}</p>
      </div>
      <form v-if="!signedIn" class="max-w-sm space-y-5" @submit.prevent="login">
        <h1 class="paper-title text-5xl">Sign in</h1>
        <label class="block text-sm">Owner password
          <input v-model="password" class="mt-2 w-full border-b border-stone-400 py-2" type="password" autocomplete="current-password" required>
        </label>
        <UButton type="submit" color="neutral" :loading="busy">Sign in</UButton>
      </form>
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-stone-300 pb-6">
          <h1 class="paper-title text-5xl sm:text-7xl">Articles</h1>
          <div class="flex items-end gap-3">
            <label class="block text-xs text-stone-600">Project
              <select class="mt-1 block max-w-48 border-b border-stone-400 bg-transparent py-1 text-sm text-stone-900" :value="projectId" :disabled="busy" @change="event => { const el = event.target as HTMLSelectElement; const id = el.value; el.value = projectId; guard(() => void run(() => openProject(id))) }">
                <option value="">Select a project</option>
                <option v-for="p in projects" :key="p._id" :value="p._id">{{ p.name }}</option>
              </select>
            </label>
            <UButton v-if="projectId" color="neutral" :disabled="busy" @click="guard(() => selectArticle(null))">New article</UButton>
          </div>
        </div>
        <details class="border-b border-stone-300 py-3" :open="!projects.length || undefined">
          <summary class="cursor-pointer text-sm">Add a project</summary>
          <form class="mt-4 flex flex-wrap items-end gap-4 pb-2" @submit.prevent="guard(() => void createProject())">
            <label class="text-sm">Name<input v-model="projectName" required maxlength="100" class="block border-b border-stone-400 py-1"></label>
            <label class="text-sm">Slug (optional)<input v-model="projectSlug" maxlength="80" class="block border-b border-stone-400 py-1" placeholder="auto from name"></label>
            <UButton color="neutral" variant="outline" type="submit" :disabled="busy">Create project</UButton>
          </form>
        </details>
        <section v-if="key" class="space-y-2 bg-stone-200/55 p-4 text-sm" aria-label="Delivery key">
          <p>Copy this project’s delivery key to the consumer’s server environment. It’s shown only once.</p>
          <input :value="key" readonly aria-label="Project delivery key" class="w-full bg-transparent font-mono" @focus="($event.target as HTMLInputElement).select()">
          <UButton color="neutral" variant="ghost" size="xs" @click="key = ''">Hide key</UButton>
        </section>
        <div v-if="projectId" class="grid gap-8 pt-5 lg:grid-cols-[minmax(11rem,1fr)_minmax(0,3fr)] lg:gap-12">
          <nav aria-label="Articles">
            <p v-if="!articles.length" class="py-2 text-sm text-stone-600">No saved articles.</p>
            <button v-for="article in articles" :key="article._id" type="button" :disabled="busy" :aria-current="article._id === active?._id ? 'true' : undefined" class="block w-full cursor-pointer break-words border-b border-stone-300 px-2 py-3 text-left hover:bg-stone-200/60 aria-[current=true]:bg-stone-200/70" @click="guard(() => selectArticle(article))">
              {{ article.draft.title }}
              <span class="block font-mono text-[10px] uppercase tracking-wider text-stone-600">{{ publication(article) }}</span>
            </button>
          </nav>
          <form v-if="editing" class="min-w-0 space-y-5" @submit.prevent="save(false)">
            <fieldset :disabled="busy" class="min-w-0 space-y-4">
              <legend class="sr-only">Article content</legend>
              <label class="block text-xs text-stone-600">Title
                <input v-model="draft.title" required maxlength="160" class="paper-title block w-full border-b border-stone-300 py-2 text-4xl text-stone-900" placeholder="Untitled article" @blur="() => { if (!draft.slug) draft.slug = slugify(draft.title) }">
              </label>
              <div class="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <label class="block text-xs text-stone-600">Slug<input v-model="draft.slug" required maxlength="80" :readonly="active?.publishedVersion != null" class="block w-full border-b border-stone-300 py-2 font-mono text-sm text-stone-900"></label>
                <label class="block text-xs text-stone-600">Search description<input v-model="draft.metaDescription" maxlength="320" class="block w-full border-b border-stone-300 py-2 text-sm text-stone-900"></label>
              </div>
              <div class="flex items-center justify-between border-b border-stone-300 pb-1">
                <span class="font-mono text-[11px] uppercase tracking-widest text-stone-600">{{ preview ? 'Preview' : 'Markdown' }}</span>
                <UButton type="button" color="neutral" variant="ghost" size="sm" :aria-pressed="preview" @click="preview = !preview">{{ preview ? 'Back to editor' : 'Preview' }}</UButton>
              </div>
              <textarea v-show="!preview" v-model="draft.markdown" aria-label="Article Markdown" maxlength="100000" class="min-h-80 w-full resize-y border-b border-stone-300 py-2 font-mono text-sm leading-relaxed outline-offset-4" placeholder="Start writing…" />
              <div v-if="preview" class="reading min-h-80">
                <p v-if="previewProblem" role="alert">Preview unavailable. Your draft is unchanged.</p>
                <div v-else-if="html" v-html="html" />
                <p v-else>{{ previewPending ? 'Rendering preview…' : 'Nothing to preview yet.' }}</p>
              </div>
            </fieldset>
            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300 pt-4">
              <span class="text-xs text-stone-600">{{ dirty ? 'Unsaved changes' : active ? publication(active) : 'New draft' }}</span>
              <div class="flex gap-2">
                <UButton type="submit" color="neutral" variant="outline" :disabled="busy">Save draft</UButton>
                <UButton type="button" color="neutral" :disabled="busy || !draft.title.trim() || !draft.slug || !draft.markdown.trim()" @click="confirmPublish = true">{{ active?.publishedVersion != null ? 'Publish update' : 'Publish' }}</UButton>
              </div>
            </div>
          </form>
          <p v-else class="pt-3 text-sm text-stone-600">Select an article or start a new one.</p>
        </div>
      </template>
    </template>
    <UModal v-model:open="confirmDiscard" title="Discard unsaved edits?" description="No saved draft or published article will be changed.">
      <template #footer><UButton color="neutral" variant="outline" @click="confirmDiscard = false">Keep editing</UButton><UButton color="neutral" @click="discard">Discard edits</UButton></template>
    </UModal>
    <UModal v-model:open="confirmPublish" title="Publish this version?" description="Your connected site will be able to read this version immediately. The published slug cannot be changed in Phase 1.">
      <template #footer><UButton color="neutral" variant="outline" @click="confirmPublish = false">Keep editing</UButton><UButton color="neutral" @click="save(true)">Publish now</UButton></template>
    </UModal>
  </div>
</template>
