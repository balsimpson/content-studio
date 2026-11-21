# Content Studio

A single-owner Markdown publishing studio (Nuxt 4, Nuxt UI, Tailwind 4 and Convex) with a standalone Nuxt blog example in `consumer/`. A site needs only a server-side delivery key; it owns its URLs, metadata rendering and design.

## Run Phase 1 locally

Requirements: Node 24, npm, and a Convex **development** deployment. No LLM, Firecrawl, R2 or Vercel account is needed for local development.

1. Run `npm ci`, then `npm run convex:dev` in a terminal. Select or create a dedicated development deployment, not a project's existing production database. Keep the watcher running. Find the HTTP Actions URL (`*.convex.site` for cloud, not `*.convex.cloud`) in the deployment settings.
2. Copy `.env.example` to `.env`. Set `NUXT_CONVEX_SITE_URL` and generate **three separate random secrets** (e.g. `openssl rand -hex 32` for each one). Put the owner password, session password and service token in the three corresponding environment variables. In that same Convex deployment, set `STUDIO_SERVICE_TOKEN` to the Studio service token using the Convex dashboard's environment settings or `npx convex env set` from your own terminal. Don't copy secrets into issues, chat, or source control.
3. Run `npm run dev`. Sign in at `http://localhost:3000`, add a project, and copy its one-time delivery key. Open **New article**, fill the title and Markdown, check **Preview**, and save a draft.
4. Copy `consumer/.env.example` to `consumer/.env`. Set `NUXT_DELIVERY_URL` to the same HTTP Actions URL and `NUXT_DELIVERY_KEY` to this project's key. Run `npm run dev:consumer` from the root. Check `http://localhost:3001/blog`: the draft should be absent. Explicitly publish it in Studio and refresh the blog. Save another edit as a draft and verify the live article is still unchanged; then publish the update and refresh again.

The Studio stores revision snapshots on saves and publishes, but does not expose a revision browser or restore action yet. These are small-catalog tools: the current Studio article list and delivery total read the full project index. Published slugs are immutable in Phase 1. There is no unpublish/delete action or self-service key rotation yet; if a delivery key is lost or exposed, an operator must replace its SHA-256 hash in the Convex dashboard and update the consuming server environment.

## Delivery API

Both GET routes live on Convex HTTP Actions. Send `x-api-key` from the consuming site's server only. The key identifies exactly one project, contains 32 random bytes, and is stored in Convex only as a hash. Never set it in a public Nuxt environment variable.

| Route | Response |
| --- | --- |
| `/api/v1/posts?page=1&limit=12` | `{ posts, total }`; recent published summaries, no Markdown; maximum 50 per page. |
| `/api/v1/posts/:slug` | A published article with `title`, `slug`, `metaDescription`, `markdown`, `readingTime`, `publishedAt`, `updatedAt`, `coverImageUrl`, `bucket`, `tags`, and `relatedPosts`. |

Invalid keys return `401`; a missing, draft, or other project's post returns `404` for an otherwise valid key. Media and buckets are not configured in Phase 1: image/bucket values are `null`, tags and related posts are empty, and a supplied bucket filter matches nothing. The example renders sanitized Markdown server-side and forwards only public article data, never the key. Studio previews use the same sanitizer.

## Decisions and checks

- Draft, immutable revision history, and the currently live snapshot are separate. Publish updates the relevant records in one Convex transaction. An expected version prevents stale tabs from overwriting newer changes. Failed saves keep the editor input and do not update the live post.
- The browser talks only to its Nuxt server. Studio uses an HTTP-only signed-and-encrypted owner session and a separate server-to-server credential; Convex read/write functions are internal. The service token must never be used as a delivery key.
- The example fetches live without ISR or webhooks; add caching and revalidation after the first real site is connected. Research, links, annotation rewrites and media are later phases.
- `npm test` runs the delivery, access, publication and Markdown tests using `convex-test` (no external account required). `npm run typecheck`, `npm run build`, and `npm run build:consumer` check the two apps. Run these checks from the committed lockfile before merging changes.

## Deployment handoff

No cloud resources are provisioned by this repo. Use separate credentials, runtime environments and Convex datasets for development, preview, and production. Deploy Convex to the intended environment first and pass that environment's Actions URL to the separate Nuxt services. From the repository root, use the two build commands above. The Node entrypoints are `.output/server/index.mjs` (Studio) and `consumer/.output/server/index.mjs` (consumer); supply env vars at runtime. Studio production cookies require HTTPS. Keep the owner-only Studio behind hosting access protection or an authenticated gateway and rate-limit sign-in at the edge before making it internet-accessible. The reading site can be public when you choose to publish there. Build output does not commit or configure a Vercel project.
