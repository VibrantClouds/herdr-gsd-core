# Codebase Concerns

**Analysis Date:** 2026-07-01

## Tech Debt

**Large Components Approaching Complexity Ceiling:**
- Issue: Several components exceed 850 lines and combine multiple concerns
- Files: 
  - `src/app/components/upload-modal/upload-modal.component.ts` (978 lines)
  - `src/app/components/attachment-edit-modal/attachment-edit-modal.component.ts` (909 lines)
  - `src/app/components/attachment-preview/attachment-preview.component.ts` (856 lines)
- Impact: Difficult to test, maintain, and understand. Changes have ripple effects. Components handle file processing, form validation, image preview, ruler interactions, and attachment point definition simultaneously.
- Fix approach: Extract concerns into smaller sub-components or services:
  - Separate image processing logic from form handling
  - Extract ruler/measurement UI into dedicated component
  - Extract attachment point definition into dedicated service
  - Create dedicated attachment point UI component

**State Serialization Fragility:**
- Issue: Version management is critical but manual. Adding any field to serialized structures requires explicit version bump.
- Files: `src/app/services/state-export.service.ts` (line 9)
- Impact: Forgetting to bump version breaks share link loading. Old versions accumulate in SUPPORTED_VERSIONS array with no cleanup path.
- Fix approach: 
  - Document a version deprecation strategy (e.g., keep last 3 versions)
  - Add migration functions to handle schema changes automatically
  - Consider schema validation/transformation layer instead of version gating

**Circular Dependency Workaround:**
- Issue: `CategoryService` uses lazy-loaded `Injector` pattern to avoid circular dependency with `IndexedDBUserModelService`
- Files: `src/app/services/category.service.ts` (line 68)
- Impact: Reduces clarity, introduces `any` typing, makes dependency graph harder to understand
- Fix approach: Restructure to eliminate circular dependency (split into separate concern or reorganize service hierarchy)

## Fragile Areas

**Timing/Race Conditions in Modal Components:**
- **PenetrationModalComponent:**
  - Problem: `ngOnChanges` uses `setTimeout` (line 73) then immediately unsubscribes (line 79). This looks like broken logic that happens to work by accident.
  - Files: `src/app/components/penetration-modal/penetration-modal.component.ts`
  - Safe modification: Remove setTimeout and rewrite state fetching logic. Use RxJS properly with takeUntil pattern already established elsewhere.
  - Test coverage: No tests for timing/race conditions

- **CompareModalComponent:**
  - Problem: `calculateDefaultPositions` uses `setTimeout` (line 604) to defer DOM measurements, but doesn't validate that canvas has laid out before using dimensions.
  - Files: `src/app/components/compare-modal/compare-modal.component.ts`
  - Safe modification: Use ResizeObserver (already established pattern in image-display) or wait for explicit layout signal rather than setTimeout

**Upload/Edit Modal Complex State Management:**
- Problem: Multiple independent state tracking systems in single component:
  - Form validation state (reactive forms)
  - Image processing state (isProcessingImage, cropResult, compressionResult)
  - Ruler/measurement state (measurementLine, isDraggingRulerPoint)
  - Attachment point definition state (isDefiningAttachmentPoint)
- Files: `src/app/components/upload-modal/upload-modal.component.ts`, `src/app/components/attachment-edit-modal/attachment-edit-modal.component.ts`
- Why fragile: State transitions aren't validated. Switching between measurement mode and attachment definition without proper cleanup could leave document listeners attached.
- Safe modification: Extract state machines per feature, ensure cleanup in ngOnDestroy

**Document-Level Event Listeners:**
- Problem: Both upload and edit modals attach document-level listeners for dragging ruler points:
  - `boundOnRulerMove` / `boundOnRulerEnd` (lines 54-55 in upload-modal)
  - `boundOnDialMove` / `boundOnDialEnd` (lines 79-80 in attachment-edit-modal)
- Files: `src/app/components/upload-modal/upload-modal.component.ts`, `src/app/components/attachment-edit-modal/attachment-edit-modal.component.ts`
- Risk: If modal closes while dragging, listeners persist and respond to unrelated drags. Component cleanup code catches this (ngOnDestroy lines 196-199) but cleanup is defensive.
- Safe modification: Use PointerCapture API instead of document listeners, or wrap in explicit drag context manager

## Test Coverage Gaps

**Missing Tests:**
- `src/app/components/attachment-edit-modal/attachment-edit-modal.component.ts` (909 lines) - **No test file exists**
  - Large, complex component with form handling, image processing, ruler interactions, and attachment point definition
  - Touches IndexedDB, state management, and category service
  - Risk: High - any change could break core workflow

- `src/app/components/route-shell/route-shell.component.ts` - No test (but component is empty, intentional)

**Incomplete Test Coverage in Complex Components:**
- `src/app/components/upload-modal/upload-modal.component.spec.ts` exists but is 481 lines for 978-line component (~49% coverage ratio by LOC)
- `src/app/components/attachment-preview/attachment-preview.component.spec.ts` is 416 lines for 856-line component (~49% coverage ratio)
- These ratios suggest core logic paths may not be fully exercised

**Integration Test Gaps:**
- No tests for share link import flow (route guard + state restoration)
- No tests for migration from LocalStorage to IndexedDB
- No end-to-end tests for upload → attachment definition → usage flow

## Performance Bottlenecks

**Multiple ResizeObserver Instances:**
- Problem: Each `image-display` instance creates its own ResizeObserver. On the compare modal with 2+ displays, multiple observers track similar resize events.
- Files: `src/app/components/image-display/image-display.component.ts` (lines 60-68)
- Current capacity: Handles 2-4 images fine; scale unclear beyond that
- Improvement path: Consolidate resize observation through a shared service, debounce updates

**Image Processing in Upload Modal:**
- Problem: Auto-crop and compression run synchronously on main thread without progress feedback
- Files: `src/app/components/upload-modal/upload-modal.component.ts` (lines 228-290)
- Cause: Canvas operations, base64 encoding, and image dimension calculations block UI
- Improvement path: Move to Web Worker, show progress bar during processing

**Large State Subscriptions:**
- Problem: `AppComponent` creates multiple subscriptions without explicit unsubscribe (lines 131-149):
  - `userModelService.userModels$`
  - `viewportService.viewport$`
  - `currentUnit$`
  - `canShare$`
- Files: `src/app/app.component.ts`
- Impact: Long-lived subscriptions accumulate if component is destroyed and recreated
- Improvement path: Use `takeUntil(destroy$)` pattern throughout

## Security Considerations

**File Upload Validation:**
- Risk: File size limit (10MB) is only checked client-side
- Files: `src/app/components/upload-modal/upload-modal.component.ts` (line 219)
- Current mitigation: Server-side validation not visible in scope
- Recommendations: 
  - Confirm backend enforces limits
  - Add client-side sanitization for image MIME types
  - Consider hash validation for deduplication

**Share Link Generation:**
- Risk: Share links contain serialized application state (models, scales, overlays) but no authentication
- Files: `src/app/services/state-export.service.ts` (lines 252-271)
- Current mitigation: API handles storage, but rate limiting unknown
- Recommendations:
  - Add request throttling to prevent share link DoS
  - Log share link generation for abuse detection
  - Consider time-based expiration strategy

**Adult Content Filtering:**
- Risk: Adult mode toggle is client-side only; content visibility can be circumvented by inspecting network requests
- Files: `src/app/utils/adult-content-filter.ts`, state management
- Current mitigation: Adult models are marked in metadata; no server-side enforcement
- Recommendations:
  - If used in controlled environments, add server-side age gate
  - Document that filtering is cosmetic, not restrictive

## Scaling Limits

**IndexedDB Storage Capacity:**
- Current capacity: ~500MB+ per browser context (varies by browser)
- Limit: Reached when users upload many high-resolution images or many custom attachment points
- Scaling path: Implement cleanup UI (delete old models), add cloud sync, or partition by date

**Metadata Loading Performance:**
- Problem: `loadAllMetadata` (image-metadata-service.ts line 57) loads all model JSON files in parallel via forkJoin
- Current capacity: Likely fine for <1000 models; manifest parsing, HTTP, and JSON parsing all run at once
- Limit: Browser request limits (6-10 per domain) and memory pressure from parallel JSON parsing
- Scaling path: Implement lazy loading per category, add pagination, cache at CDN level

**Share Link Infrastructure:**
- Problem: API must store state blobs for each share link; no visible cleanup strategy
- Files: State stored via `generateShareLink` (state-export-service.ts line 252)
- Limit: Unbounded growth of share link storage
- Scaling path: Add TTL to share links (7-30 days), implement garbage collection, rate limit by IP

## Dependencies at Risk

**No Critical Dependencies at Risk Identified:**
- Angular 20.x is stable and well-supported
- RxJS 7.8.x is stable
- MessagePack library (@msgpack/msgpack 3.1.2) is minimal and stable
- All dependencies are actively maintained

**Potential Concerns:**
- Codebase uses only Angular built-ins; no UI frameworks (Material, Bootstrap) means custom component styling is larger maintenance burden
- No form validation framework; custom validators across upload and edit modals could benefit from schema validation library

## Missing Critical Features

**No Conflict Resolution for Concurrent Edits:**
- Problem: If same model is edited in two browser tabs, last-write-wins with no merge
- Impact: User can lose changes silently
- Blocks: Multi-device sync

**No Undo/Redo System:**
- Problem: User actions (scale changes, overlay additions) cannot be reverted
- Impact: Accidental changes are permanent (until page reload)
- Blocks: User experience polish

**No Import/Export of Attachments:**
- Problem: Custom attachment points are not portable between models or versions
- Impact: User-created attachment libraries must be manually recreated
- Blocks: Community-driven content sharing

**No Search/Filter in Model Selection:**
- Problem: With many models, finding specific one requires scrolling category
- Impact: Poor UX at scale
- Blocks: Growth beyond ~50 models per category

## Known Issues

**setTimeout in ngOnChanges Anti-Pattern:**
- Location: `src/app/components/penetration-modal/penetration-modal.component.ts` line 73
- What happens: Component tries to fetch fresh state from service inside ngOnChanges using setTimeout
- Why it's wrong: ngOnChanges can fire multiple times per change detection cycle; setTimeout creates race condition with async pipe
- Workaround currently: Immediate unsubscribe (line 79) happens to work by accident
- Real fix: Refactor to use OnInit and rxjs `distinctUntilChanged()` with proper lifecycle

**Image Metadata Service Category Capitalization:**
- Location: `src/app/services/image-metadata.service.ts` line 72
- Issue: Categories are capitalized during load but may not match input consistently
- Risk: Category filtering could miss models if casing is inconsistent

---

*Concerns audit: 2026-07-01*
