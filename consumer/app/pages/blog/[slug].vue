<script setup lang="ts">
const route = useRoute()
const { data: post, error } = await useFetch<{ title: string, metaDescription: string, readingTime: number, html: string }>(`/_content/${encodeURIComponent(String(route.params.slug))}`)
if (error.value) throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.statusMessage, fatal: true })
useSeoMeta({ title: () => post.value?.title, description: () => post.value?.metaDescription })
</script>
<template>
  <main v-if="post">
    <NuxtLink to="/blog">← Field Notes</NuxtLink>
    <header><p class="folio">{{ post.readingTime }} min read</p><h1>{{ post.title }}</h1></header>
    <div class="prose" v-html="post.html" />
  </main>
</template>
