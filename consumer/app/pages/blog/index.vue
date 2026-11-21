<script setup lang="ts">
type Post = { slug: string, title: string, metaDescription: string, readingTime: number }
const route = useRoute()
const page = computed(() => Number(route.query.page ?? 1))
const { data, error } = await useFetch<{ posts: Post[], total: number }>('/_content', { query: { page } })
if (error.value) throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.statusMessage, fatal: true })
useSeoMeta({ title: 'Field Notes' })
</script>
<template>
  <main>
    <header><p class="folio">Example publication</p><h1>Field Notes</h1></header>
    <p v-if="error" role="alert">Could not load these posts.</p>
    <p v-else-if="!data?.posts.length">No published articles on this page.</p>
    <article v-for="post in data?.posts" :key="post.slug">
      <p class="folio">{{ post.readingTime }} min read</p>
      <h2><NuxtLink :to="`/blog/${post.slug}`">{{ post.title }}</NuxtLink></h2>
      <p>{{ post.metaDescription }}</p>
    </article>
    <nav class="pagination" aria-label="Blog pages">
      <NuxtLink v-if="page > 1" :to="{ path: '/blog', query: { page: page - 1 } }">Previous</NuxtLink>
      <NuxtLink v-if="page * 12 < (data?.total ?? 0)" :to="{ path: '/blog', query: { page: page + 1 } }">Next</NuxtLink>
    </nav>
  </main>
</template>
