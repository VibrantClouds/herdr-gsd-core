<!-- refreshed: 2026-07-01 -->
# Architecture

**Analysis Date:** 2026-07-01

## System Overview

This is an Angular 20 SPA (Single Page Application) using standalone components for size comparison with a sophisticated dual-panel interface. The system manages scaling, overlays, and attachment positioning with reactive state management and dual-renderer architecture (Canvas preview + DOM display).

```text
┌──────────────────────────────────────────────────────────────────────┐
│                     APP SHELL (AppComponent)                         │
│  - Modal management (upload, manage, info, etc.)                     │
│  - Share link generation                                             │
│  - Global settings (adult mode, units, grid)                         │
└──────────┬───────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     ROUTING LAYER                                    │
│  `src/app/app.routes.ts`                                             │
│  - Route guards: shareLinkGuard, adultModeGuard                      │
│  - RouteShellComponent (`src/app/components/route-shell/`)           │
│  - Routes: /:shareId, /adult, /adult/:shareId                        │
└──────────┬───────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    MAIN COMPARE MODAL                                │
│  `src/app/components/compare-modal/`                                 │
│  - Houses both left/right comparison panels                          │
│  - Integrates overlay controls                                       │
│  - Handles drag-and-drop layout                                      │
└──────┬───────────────┬────────────────────────────────────────────────┘
       │               │
       ▼               ▼
  ┌─────────────┐  ┌─────────────┐
  │  LEFT SIDE  │  │ RIGHT SIDE  │
  │  COMPARISON │  │ COMPARISON  │
  │   PANEL     │  │   PANEL     │
  └──────┬──────┘  └──────┬──────┘
         │                │
         ▼                ▼
  ┌─────────────────────────────────────┐
  │  ComparisonPanelComponent           │
  │  `src/app/components/comparison-panel/`
  │  - Panel state management (1:1)     │
  │  - Default overlay loading          │
  │  - ResizeObserver for layout        │
  └─────────┬──────────────────────────┘
            │
    ┌───────┼───────┬──────────────┐
    │       │       │              │
    ▼       ▼       ▼              ▼
┌────────┐┌──────┐┌───────────┐┌────────────┐
│ Image  ││Model ││Size       ││Attachment │
│Display ││Sel.  ││Slider     ││Sidebar    │
└────────┘└──────┘└───────────┘└────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **AppComponent** | Root app shell, modals, share links, adult mode | `src/app/app.component.ts` |
| **CompareModalComponent** | Main viewport, floating controls, dual panels | `src/app/components/compare-modal/` |
| **ComparisonPanelComponent** | Single panel state, default overlays, layout | `src/app/components/comparison-panel/` |
| **ImageDisplayComponent** | Core image rendering, overlay positioning, transforms | `src/app/components/image-display/` |
| **AttachmentSidebarComponent** | Attachment UI, pending attachment state | `src/app/components/attachment-sidebar/` |
| **AttachmentPreviewComponent** | Canvas preview, attachment point selection | `src/app/components/attachment-preview/` |
| **ModelSelectorComponent** | Model/attachment dropdown selection | `src/app/components/model-selector/` |
| **SizeSliderComponent** | User-controlled scale input | `src/app/components/size-slider/` |
| **OverlayControlsComponent** | Per-overlay scale/rotation controls | `src/app/components/overlay-controls/` |
| **UploadModalComponent** | Model/attachment upload, attachment point definition | `src/app/components/upload-modal/` |
| **ManageModalComponent** | List/delete user models, edit custom points | `src/app/components/manage-modal/` |
| **PenetrationModalComponent** | Adult mode: penetration alignment visualization | `src/app/components/penetration-modal/` |
| **SnackbarComponent** | Global notification system | `src/app/components/snackbar/` |

## Pattern Overview

**Overall:** Reactive state management with dual-layer rendering architecture

**Key Characteristics:**
- **Reactive**: RxJS BehaviorSubjects drive all state changes
- **Dual-panel**: Left/right synchronized state with independent scales
- **Dual-render**: Canvas preview (attachment-preview) + DOM display (image-display) use identical math
- **Attachment-driven**: All overlays positioned via source→target point alignment
- **Measurement-agnostic**: "Inches" are arbitrary comparison units, not physical measurements
- **Serializable**: Full application state can export/import via MessagePack or JSON

## Layers

**UI/Component Layer:**
- Purpose: User interaction, visual rendering, modal management
- Location: `src/app/components/`
- Contains: Standalone Angular components with signals input syntax
- Depends on: State service, domain services
- Used by: Angular router, user interactions

**State Management Layer:**
- Purpose: Centralized reactive state using BehaviorSubjects
- Location: `src/app/services/state-management.service.ts`
- Contains: AppState, PanelState, GlobalSettings, AttachmentEditState
- Depends on: RxJS
- Used by: All components and services

**Domain Service Layer:**
- Purpose: Business logic for scaling, attachments, models, serialization
- Location: `src/app/services/`
- Contains:
  - `ScalingService`: Size calculations (height, width, aspect ratio)
  - `CustomAttachmentPointService`: User-defined attachment points
  - `ImageMetadataService`: Model metadata loading and caching
  - `StateExportService`: State serialization/deserialization
  - `IndexedDBUserModelService`: User model persistence
  - `ModelAttachmentDefaultsService`: Default overlay configuration per model
  - `SiteModeService`: Adult mode URL sync
  - `SeoService`: Dynamic title management
- Depends on: State service, utilities
- Used by: Components and other services

**Data Model Layer:**
- Purpose: Type definitions and interfaces
- Location: `src/app/models/image-model.interface.ts`
- Contains: ImageModel, OverlayModel, AttachmentPoint, PanelState, AppState
- Depends on: None (pure TypeScript)
- Used by: All layers

**Utility Layer:**
- Purpose: Helper functions, error handling, storage utilities
- Location: `src/app/utils/`
- Contains: measurement-utils, adult-content-filter, storage-errors, etc.
- Depends on: Models
- Used by: Services and components

**Routing Layer:**
- Purpose: Route matching, guard enforcement, navigation
- Location: `src/app/app.routes.ts`, `src/app/guards/`
- Contains: Route guards (shareLinkGuard, adultModeGuard)
- Depends on: State service, state export service
- Used by: Angular router

## Data Flow

### Primary Request Path: User Selects Model

1. User clicks model in dropdown → `ModelSelectorComponent.onModelSelected()` emits event
2. `ComparisonPanelComponent` receives emission → calls `stateService.updateLeftPanelModel(model)`
3. `StateManagementService` updates `leftPanel$.next()` → `AppState.leftPanel.selectedModel` changes
4. `ComparisonPanelComponent.ngOnInit()` subscribes to `leftPanel$` → re-renders
5. `ImageDisplayComponent` receives model via `@Input()` → calls `updateImageTransform()`
6. Image renders at calculated dimensions based on scale + relativeScale
7. **Simultaneously**: Default overlays auto-load via `attachmentDefaultsService.getOverlaysForModel(modelId)`
8. Default overlays apply via `stateService.addOverlayToLeftPanel(overlay)`
9. `ImageDisplayComponent.updateOverlayTransforms()` calculates overlay positions

### Secondary Flow: User Attaches Overlay

1. User opens attachment sidebar → `AttachmentSidebarComponent.toggleEditMode()`
2. Canvas shows pending attachment semi-transparently
3. User clicks attachment point on preview → emits `attachmentSelected` event
4. `ComparisonPanelComponent` receives event → creates `OverlayModel` with hardcoded `sourceAttachmentPointId: 'attachment-point'`
5. `stateService.addOverlayToLeftPanel(overlay)` adds to state
6. `ImageDisplayComponent` calculates overlay position:
   - Transform source point (attachment's `'attachment-point'`) from original→scaled
   - Transform target point (base model's selected point) from original→scaled
   - Position = containerPadding + baseImageOffset + targetPoint - sourcePoint
7. Overlay renders at position with scale and rotation applied via CSS transform

### Scaling Data Flow

1. User moves slider → `SizeSliderComponent.onScaleChange()`
2. `stateService.updateLeftPanelScale(newScale)` updates state
3. `ComparisonPanelComponent` recalculates `relativeScale` to fit both images
4. `ImageDisplayComponent` receives `scale` and `relativeScale` as `@Input()`
5. `ScalingService.calculateImageDimensions()` computes rendered dimensions:
   - If `measurementLine` exists: effectiveHeight = originalHeight × (userHeight / rulerPixelLength)
   - heightPixels = effectiveHeight × basePixelsPerUnit × scale × relativeScale
   - width = height × (originalWidth / originalHeight)
6. CSS transform applies scale, images render at new size
7. Overlays recalculate positions using same scaling math

**State Management:**
- All state lives in `StateManagementService.state$` (BehaviorSubject)
- Components subscribe to relevant selectors (`leftPanel$`, `rightPanel$`, `globalSettings$`)
- No direct state mutation — all changes go through service methods
- URL sync: `SiteModeService` listens to state changes and updates browser URL with shareId

## Key Abstractions

**PanelState:**
- Purpose: Represents one comparison panel (left or right)
- Examples: `appState.leftPanel`, `appState.rightPanel`
- Pattern: Immutable updates via state service methods
- Properties: selectedModel, overlays, overlayScales, overlayRotations, scale, position, showOverlays, horizontalFlip

**ImageModel:**
- Purpose: Unified model/attachment representation
- Examples: Person (model), Hat (default_attachment), Custom upload (custom_model)
- Pattern: type determines UI placement ('model', 'custom_model', 'default_attachment', 'custom_attachment')
- Key invariant: originalDimensions and defaultSizeInches define sizing, attachmentPoints are in original pixel space

**OverlayModel:**
- Purpose: Instance of an attachment on a specific base model
- Examples: Hat attached to person's head, anatomy attached to body
- Pattern: sourceAttachmentPointId always 'attachment-point', targetAttachmentPointId is user-selected
- Key invariant: Attachment metadata stores full ImageModel for rendering

**AttachmentPoint:**
- Purpose: Named position on image for attachment connections
- Examples: "top of head", "left hand", penetration zones
- Pattern: Coordinates always in original image pixel space (never scaled)
- Key invariant: Custom points stored in localStorage via CustomAttachmentPointService

**AppState:**
- Purpose: Complete application state for serialization
- Pattern: Version-controlled (currently v1.0.11)
- Serializable to: MessagePack (binary) or JSON
- Contains: leftPanel, rightPanel, globalSettings, attachmentEditState

## Entry Points

**Application Bootstrap:**
- Location: `src/main.ts`
- Triggers: Browser loads app
- Responsibilities: Bootstraps Angular app with appConfig

**Root Component:**
- Location: `src/app/app.component.ts`
- Triggers: Bootstrap completion
- Responsibilities: Modal management, share link generation, unit/adult mode toggles, initialization

**Routing Entry:**
- Location: `src/app/app.routes.ts` with guards
- Triggers: Browser navigation (URL change)
- Responsibilities: shareLinkGuard loads state from share link ID, adultModeGuard enforces adult mode context

**Compare Modal (Main Viewport):**
- Location: `src/app/components/compare-modal/compare-modal.component.ts`
- Triggers: AppComponent renders it
- Responsibilities: Houses both comparison panels, integrates floating controls

**Comparison Panels:**
- Location: `src/app/components/comparison-panel/comparison-panel.component.ts`
- Triggers: CompareModalComponent renders with panelSide input
- Responsibilities: Load default overlays, manage panel-specific layout, subscribe to panel state

## Architectural Constraints

- **Threading:** Single-threaded event loop (browser JavaScript)
- **Global state:** All state centralized in StateManagementService. No module-level singletons except injected services.
- **Circular imports:** None detected (Angular's dependency injection prevents this)
- **Scaling limits:** basePixelsPerUnit is hardcoded to 10 (affects all comparisons — don't modify without migration)
- **Attachment invariants:**
  - sourceAttachmentPointId ALWAYS 'attachment-point' (hardcoded in comparison-panel.ts:232)
  - Attachment points ALWAYS in original image pixel coordinates
  - Overlays scale relative to parent by default (scaleRelativeToParent: true)
  - Transform-origin used ONLY for rotation (scaling is uniform/center-based)
- **Measurement units:** "Inches" are arbitrary units for relative sizing, not physical measurements
- **Adult content:** Controlled by `adultMode` flag in GlobalSettings; affects model filtering and URL path (/adult prefix)
- **Storage:** IndexedDB for user models (fallback to localStorage for backward compatibility); localStorage for custom points and categories

## Anti-Patterns

### Circular State Updates

**What happens:** Component updates state → state change triggers re-render → component updates state again (infinite loop)

**Why it's wrong:** Creates runaway re-renders, memory spikes, poor performance

**Do this instead:** Use `.pipe(distinctUntilChanged())` on observables to skip redundant updates. In `state-management.service.ts` line 92-100, all selectors use `distinctUntilChanged()` to prevent this.

### Scaling Non-Uniform Transformations

**What happens:** Developer adds custom scaling that doesn't maintain aspect ratio or changes basePixelsPerUnit

**Why it's wrong:** All existing comparisons become invalid; users' saved states break

**Do this instead:** Always use `ScalingService.calculateImageDimensions()` which respects basePixelsPerUnit (10) and maintains aspect ratio from originalDimensions.

### Modifying AttachmentPoint Coordinates After Scaling

**What happens:** Developer tries to use scaled attachment point coordinates for positioning

**Why it's wrong:** Scaling is dynamic; coordinates change on every scale. They won't persist correctly.

**Do this instead:** Store ALL attachment points in original image pixel space. Transform to scaled space ONLY when rendering. See `ScalingService.transformAttachmentPoint()` (lines ~110+).

### Forgetting State Serialization Version Bump

**What happens:** Adding new field to AppState, GlobalSettings, or ImageModel without incrementing version in `state-export.service.ts`

**Why it's wrong:** Old saved states can't deserialize new fields; share links from old versions fail

**Do this instead:** When modifying any state structure, increment `CURRENT_VERSION` and add to `SUPPORTED_VERSIONS` array. See `.claude/rules/state-serialization.md`.

## Error Handling

**Strategy:** Try-catch with user-friendly snackbar notifications

**Patterns:**
- Share link failures: Show error message, navigate to root, offer retry
- Storage unavailable (Private Browsing): Show specific error message, disable upload
- Model import failures: Show which models failed, log details to console
- API failures (state export/import): Show user message with error details

Implementation: `SnackbarService` provides `showError()`, `showSuccess()`, `showInfo()` methods. Services catch errors and call these.

## Cross-Cutting Concerns

**Logging:** Console.log/error/warn for development. No structured logging to server (can be added via monitoring service).

**Validation:** 
- ImageModel validation: Check originalDimensions and attachmentPoints exist
- OverlayModel validation: Ensure sourceAttachmentPointId is 'attachment-point'
- AttachmentPoint validation: Coordinates must be non-negative and within image bounds

**Authentication:** None (public application)

**Adult Mode:**
- Flag in GlobalSettings (adultMode: boolean)
- Affects model filtering via ImageMetadataService
- Controls URL path (siteMode: 'sfw' | 'adult')
- Serialized in state exports

---

*Architecture analysis: 2026-07-01*
