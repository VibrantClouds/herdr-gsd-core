# External Integrations

**Analysis Date:** 2026-07-01

## APIs & External Services

**Share Link Service:**
- Service: Custom REST API at `https://api.sizelab.app` (production) or `http://localhost:3000` (development)
- SDK/Client: Fetch API (native browser)
- Implementation: `src/app/services/state-export.service.ts`
  - `generateShareLink()` - POST to `/generateShareLink` with MessagePack-encoded state
  - `loadFromShareLink(shareId)` - GET from `/loadFromShareLink/{shareId}` to retrieve saved state
  - Response format: MessagePack binary (application/x-msgpack)

**Icon Library:**
- Service: Phosphor Icons v2.1.1 from unpkg CDN
- Usage: Icon assets for UI components
- Location: Loaded via `<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>` in `src/index.html`
- No additional SDK required (provides web component icons)

## Data Storage

**Client-Side Storage:**
- LocalStorage (deprecated but still supported for backward compatibility)
  - Usage: Legacy user model storage
  - Gradual migration to IndexedDB
  - Safe wrapper utilities: `src/app/utils/safe-local-storage.ts`

**IndexedDB:**
- Database: UserModelDatabase (version 2)
- Purpose: Efficient storage of user-uploaded models and metadata
- Configuration: `src/app/services/indexeddb-config.ts`
- Client: Native IndexedDB API via custom service: `src/app/services/native-indexeddb.service.ts`
- Storage quota: Browser-dependent (typically 50MB+)
- Object Stores:
  - `userModels` - Model metadata (name, dimensions, attachment points)
  - `userModelImages` - Image Blob storage (separate from metadata for efficiency)
  - `storageMetadata` - Migration and tracking information
  - `categories` - Custom user-defined categories
- Services managing IndexedDB:
  - `src/app/services/indexeddb-user-model.service.ts` - User model CRUD operations
  - `src/app/services/category.service.ts` - Category management
  - `src/app/services/model-attachment-defaults.service.ts` - Default attachment configurations

**State Management:**
- In-Memory: BehaviorSubjects for application state
- Service: `src/app/services/state-management.service.ts`
- Scope: Left/right panel states, overlays, scaling, global settings
- Reactive: Components subscribe via async pipe or manual RxJS subscriptions
- Persistence: Export/import via StateExportService; share links via API

## File Storage

**File Storage:** Local filesystem only
- User-uploaded images: Stored as base64 data URLs (then converted to Blobs in IndexedDB)
- Server models: Static assets in `src/assets/images/`
- Metadata: Static JSON files in `src/assets/metadata/`
- No cloud file storage; no S3/Cloudflare R2 integration

## Caching

**Browser Caching:**
- Static assets: Cache-Control 1 year (set in `_worker.js`)
- HTML/CSS/JS: No-cache for SPA shell
- Metadata JSON: 1-year cache via Cloudflare CDN
- Implementation: Headers set in Cloudflare Worker `_worker.js`

**In-Memory Caching:**
- Image metadata service caches loaded models
- User models cached in IndexedDB
- No external caching service (Redis, Memcached)

## Authentication & Identity

**Auth Provider:** None
- Application is completely anonymous and client-side
- No user accounts, login systems, or authentication required
- No OAuth, JWT, or session management
- State is tied to browser storage and share links only

## Monitoring & Observability

**Error Tracking:** Not detected
- No Sentry, Rollbar, or similar integration
- Error handling: Console logging and in-app error states

**Logs:**
- Approach: Browser console logging
- Services log: Model migrations, state loading, storage operations
- No external log aggregation service (no ELK, Splunk, CloudWatch)
- Development mode has more verbose logging

**Structured Data:** JSON-LD schema in `src/index.html`
- WebApplication schema for SEO
- Organization schema with developer info
- FAQ schema for common questions

## CI/CD & Deployment

**Hosting:**
- Platform: Cloudflare Workers (serverless)
- Static asset serving from Cloudflare CDN
- Origin-less architecture (no backend server required)
- Custom domain: `sizelab.app` via Cloudflare DNS

**CI Pipeline:** Not detected
- No GitHub Actions, GitLab CI, or Travis CI configuration
- Manual deployment via `pnpm run wrangler:deploy` or `pnpm run wrangler:deploy:prod`
- Commands defined in `package.json`

**Build Process:**
- Local: `pnpm run build` produces `dist/size-comparison-tool/browser/`
- Deployment: Wrangler reads from dist directory and deploys to Cloudflare Workers
- No continuous deployment automation found

## Environment Configuration

**Required Environment Variables:**
- None detected in client code (all environment configuration in committed files)
- Development: Uses `src/environments/environment.ts`
- Production: Uses `src/environments/environment.prod.ts` (switched via build configuration)
- Cloudflare Worker environment:
  - ASSETS binding (static asset handler)
  - Account ID and Zone ID for production deployment (in wrangler.jsonc)

**Secrets Location:**
- Cloudflare Workers credentials: Local `.wrangler/` directory (git-ignored)
- Account/Zone IDs: `wrangler.jsonc` (committed, non-sensitive)
- No API keys or secrets in client code (stateless architecture)

## Webhooks & Callbacks

**Incoming:** None detected
- No webhook endpoints for external services
- Single-page application only

**Outgoing:**
- Share link generation: POST to `https://api.sizelab.app/generateShareLink`
- Share link loading: GET from `https://api.sizelab.app/loadFromShareLink/{shareId}`
- No other external API calls or webhooks

## Asset Pipeline

**Image Processing:** Not automated
- PNG, JPEG, GIF, SVG images served as-is
- Content-Type headers set in `_worker.js`:
  - `.png` → `image/png`
  - `.jpg/.jpeg` → `image/jpeg`
  - `.gif` → `image/gif`
  - `.svg` → `image/svg+xml`
- No image optimization pipeline (ImageOptim, Sharp, etc.)
- Manual image upload and management via `src/scripts/` utilities

**Metadata Generation:**
- Scripts available: `./scripts/update-image-metadata.sh`, `./scripts/generate-image-metadata.sh`, `./scripts/generate-metadata-manifest.sh`
- Location: `src/assets/metadata/manifest.json` (auto-generated list of available models)
- Format: JSON with model properties, attachment points, dimensions

## Browser APIs Used

**Web APIs:**
- localStorage (deprecated, for backward compatibility)
- IndexedDB (primary client-side storage)
- FileReader API (for image upload processing)
- Fetch API (for share link endpoints)
- Canvas API (for attachment point preview rendering)
- Blob API (for image data handling)

## SEO & Metadata

**Static SEO Files:**
- `public/robots.txt` - Crawler instructions
- `public/sitemap.xml` - Site map
- `public/humans.txt` - Developer credits
- `public/favicon.svg` / `public/favicon.ico` - Site icons

**Meta Tags:** All in `src/index.html`
- Standard: title, description, keywords, author, viewport
- Open Graph: og:title, og:description, og:type, og:url, og:site_name
- Twitter Card: twitter:card, twitter:title, twitter:description
- Canonical URL

**Dynamic SEO Service:**
- Service: `src/app/services/seo.service.ts`
- Updates browser tab title based on selected models
- Formats: Default, single-model, comparison mode titles

---

*Integration audit: 2026-07-01*
