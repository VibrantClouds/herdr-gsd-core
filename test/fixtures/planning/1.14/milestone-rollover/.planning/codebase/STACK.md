# Technology Stack

**Analysis Date:** 2026-07-01

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code, services, components
- HTML - Template markup for Angular components
- SCSS - Component-scoped styling throughout application

**Secondary:**
- JavaScript - Cloudflare Worker runtime handler (`_worker.js`)

## Runtime

**Environment:**
- Node.js - Development runtime (no version lock file present; Angular 20 requires Node 20.19+)
- Cloudflare Workers - Production deployment runtime

**Package Manager:**
- pnpm - Project package manager
- Lockfile: `pnpm-lock.yaml` (version 9.0)
- Built dependencies: `@parcel/watcher`, `esbuild`, `lmdb`, `msgpackr-extract`, `sharp`, `workerd`

## Frameworks

**Core:**
- Angular 20.3.17 - Standalone components architecture (no NgModules)
- RxJS 7.8.0 - Reactive state management with BehaviorSubjects

**Testing:**
- Karma 6.4.0 - Test runner
- Jasmine 5.6.0 - Testing framework
- @types/jasmine 5.1.0 - Type definitions

**Build/Dev:**
- @angular-devkit 20.3.19 - Angular build system and dev server
- @angular/cli 20.3.19 - Angular CLI tooling
- TypeScript 5.9.3 - Language compiler
- wrangler 4.0.0 - Cloudflare Workers CLI for deployment

## Key Dependencies

**Critical:**
- @msgpack/msgpack 3.1.2 - Binary serialization for state export/import and share links
- zone.js 0.15.0 - Angular change detection runtime
- tslib 2.3.0 - TypeScript runtime helpers

**Platform:**
- @angular/common 20.3.17 - HTTP client, pipes, directives
- @angular/forms 20.3.17 - Form handling (reactive and template-driven)
- @angular/router 20.3.17 - Client-side routing
- @angular/compiler 20.3.17 - Angular template compiler
- @angular/platform-browser 20.3.17 - Browser platform adapters
- @angular/platform-browser-dynamic 20.3.17 - Dynamic bootstrapping

**Testing/Dev:**
- karma-chrome-launcher 3.2.0 - Chrome test runner
- karma-coverage 2.2.0 - Code coverage reporting
- karma-jasmine 5.1.0 - Jasmine integration for Karma
- karma-jasmine-html-reporter 2.1.0 - HTML test reports
- @angular-devkit/build-angular 20.3.19 - Angular build schema

## Configuration

**Environment:**
- `src/environments/environment.ts` - Development configuration
  - API Base URL: `http://localhost:3000`
  - Production: `false`
- `src/environments/environment.prod.ts` - Production configuration
  - API Base URL: `https://api.sizelab.app`
  - Production: `true`
- Environment switching via Angular build configuration (`angular.json`)

**Build:**
- `tsconfig.json` - TypeScript compiler configuration
  - Target: ES2022
  - Module: ES2022
  - Strict mode enabled
  - Output: `dist/out-tsc`
  - Angular compiler options: strict templates, strict injection parameters
- `tsconfig.app.json` - Application-specific TypeScript config
- `tsconfig.spec.json` - Test-specific TypeScript config
- `.editorconfig` - Editor formatting standards

**Framework:**
- `angular.json` - Angular CLI configuration
  - Project type: application
  - Root: empty (monorepo root)
  - Source root: `src`
  - Component prefix: `app`
  - Default style: SCSS
  - Production budget: 750kB initial, 1.5MB max error; 20kB component styles warning, 30kB error
  - Development source maps enabled
  - Analytics disabled

**Deployment:**
- `wrangler.jsonc` - Cloudflare Workers configuration
  - Entry point: `_worker.js`
  - Compatibility date: 2024-12-01
  - Node.js compatibility flag enabled
  - Static assets from: `dist/size-comparison-tool/browser`
  - SPA mode enabled with `single-page-application` handling
  - Custom domain: `sizelab.app`
  - Dev server: localhost:8787
  - Production account and zone IDs configured

## Platform Requirements

**Development:**
- Node.js 20.19+ (Angular 20 requirement)
- pnpm package manager
- Chrome or Chromium for test execution

**Production:**
- Cloudflare Workers serverless platform
- Static asset serving from Cloudflare CDN
- Cache control: 1 year for assets in `/assets/` directory
- Custom domain DNS configured to Cloudflare

## Styling

**Approach:**
- SCSS preprocessor for all styles
- Component-scoped styling (each component has its own `.scss` file)
- Global styles: `src/styles.scss`
- Inline style language: SCSS (configured in `angular.json`)

**Generated Components:**
- Default style for newly generated components: SCSS

## Angular-Specific Configuration

**Standalone Components:**
- No NgModules required
- All components marked as `standalone: true`
- Services provided with `providedIn: 'root'`
- Configuration via `ApplicationConfig` in `src/app/app.config.ts`

**Providers:**
- Zone change detection with event coalescing
- Router configuration from `src/app/app.routes`
- HTTP client for API calls

---

*Stack analysis: 2026-07-01*
