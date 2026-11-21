export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  buildDir: '.nuxt',
  ui: { fonts: false, colorMode: false },
  css: ['~/assets/css/main.css'],
  runtimeConfig: { convexSiteUrl: '', studioPassword: '', sessionPassword: '', studioServiceToken: '' },
})
