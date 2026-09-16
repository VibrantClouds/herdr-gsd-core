# Codebase Structure

**Analysis Date:** 2026-07-01

## Directory Layout

```
src/
├── app/
│   ├── components/                    # Standalone Angular components
│   │   ├── app-header/               # [DEPRECATED - header logic in CompareModalComponent]
│   │   ├── attachment-edit-modal/    # Edit custom attachment points
│   │   ├── attachment-preview/       # Canvas-based preview renderer for attachments
│   │   ├── attachment-selector/      # Dropdown for choosing attachment models
│   │   ├── attachment-sidebar/       # Main attachment management UI
│   │   ├── category-dropdown/        # Category filter for model selection
│   │   ├── category-manager-modal/   # Manage custom categories
│   │   ├── compare-modal/            # Main application viewport (dual panels + controls)
│   │   ├── comparison-panel/         # Single comparison panel (left or right)
│   │   ├── image-display/            # Core DOM-based image renderer with overlay positioning
│   │   ├── info-modal/               # Application info/help modal
│   │   ├── manage-modal/             # Manage user models and custom points
│   │   ├── model-selector/           # Model/attachment dropdown selection
│   │   ├── overlay-controls/         # Per-overlay scale/rotation controls
│   │   ├── overlay-toggle/           # Button to show/hide all overlays
│   │   ├── penetration-modal/        # Adult mode: penetration zone visualization
│   │   ├── route-shell/              # Wrapper for routed views (empty)
│   │   ├── size-slider/              # Scale slider user input
│   │   ├── snackbar/                 # Global notification display
│   │   └── upload-modal/             # Upload custom models/attachments
│   │
│   ├── guards/                        # Route guards
│   │   ├── adult-mode.guard.ts        # Enforce /adult route context
│   │   └── share-link.guard.ts        # Load state from share link ID
│   │
│   ├── models/                        # TypeScript interfaces and types
│   │   └── image-model.interface.ts   # Core data structures (ImageModel, OverlayModel, etc.)
│   │
│   ├── pipes/                         # Angular pipes
│   │   └── capitalize-first.pipe.ts   # String capitalization
│   │
│   ├── services/                      # Business logic services
│   │   ├── category.service.ts        # Custom category management
│   │   ├── custom-attachment-point.service.ts  # Custom point storage/retrieval
│   │   ├── image-metadata.service.ts  # Model metadata loading
│   │   ├── image-processing.service.ts # Image manipulation utilities
│   │   ├── indexeddb-config.ts        # IndexedDB schema
│   │   ├── indexeddb-user-model.service.ts  # IndexedDB persistence for models
│   │   ├── model-attachment-defaults.service.ts # Default overlay per model
│   │   ├── native-indexeddb.service.ts # Raw IndexedDB operations
│   │   ├── scaling.service.ts         # Size calculations (CRITICAL)
│   │   ├── seo.service.ts             # Dynamic title management
│   │   ├── site-mode.service.ts       # Adult mode URL sync
│   │   ├── snackbar.service.ts        # Notification system
│   │   ├── state-export.service.ts    # State serialization/import (CRITICAL)
│   │   ├── state-management.service.ts # Centralized state (CRITICAL)
│   │   ├── user-model-migration.service.ts # localStorage → IndexedDB migration
│   │   ├── user-model.service.ts      # [DEPRECATED - use indexeddb-user-model.service.ts]
│   │   └── viewport.service.ts        # Viewport dimensions tracking
│   │
│   ├── utils/                         # Utility functions
│   │   ├── adult-content-filter.ts    # Adult content helper functions
│   │   ├── measurement-utils.ts       # Measurement unit conversions
│   │   ├── penetration-alignment.ts   # Penetration zone calculations
│   │   ├── safe-local-storage.ts      # Storage access wrapper
│   │   ├── storage-errors.ts          # Storage error definitions
│   │   └── types.ts                   # Type definitions (MeasurementUnit, SiteMode)
│   │
│   ├── app.component.ts               # Root application component (CRITICAL)
│   ├── app.component.html             # Root template (modals, snackbar)
│   ├── app.component.scss             # Root styles (global overrides)
│   ├── app.component.spec.ts          # Root component tests
│   ├── app.config.ts                  # Angular configuration (providers, imports)
│   ├── app.routes.ts                  # Route definitions with guards (CRITICAL)
│   └── main.ts                        # Application bootstrap entry point
│
├── assets/
│   ├── images/                        # Model and attachment images
│   │   └── adult/                     # Adult content images
│   │       └── attachments/           # Dick attachments
│   └── metadata/                      # Model metadata JSON files
│       └── manifest.json              # List of all available models
│
├── environments/
│   ├── environment.ts                 # Development configuration
│   └── environment.prod.ts            # Production configuration
│
├── styles/
│   └── *.scss                         # Global styles
│
└── index.html                         # HTML entry point
```

## Directory Purposes

**components/**
- Purpose: Reusable Angular standalone components following reactive patterns
- Contains: Component files (.ts, .html, .scss) + spec files
- Key files:
  - `compare-modal/` - Main UI container
  - `comparison-panel/` - Dual-panel logic
  - `image-display/` - Core rendering
  - `attachment-sidebar/` - Attachment UI
  - `attachment-preview/` - Canvas preview renderer

**guards/**
- Purpose: Route activation guards
- Contains: Function-based guards (CanActivateFn)
- Key files:
  - `share-link.guard.ts` - Loads state from share ID
  - `adult-mode.guard.ts` - Validates adult mode context

**models/**
- Purpose: TypeScript interfaces and type definitions
- Contains: Pure TypeScript interfaces, no implementation
- Key files:
  - `image-model.interface.ts` - All core data types

**services/**
- Purpose: Business logic, state management, data access
- Contains: Injectable services with root providedIn
- Critical files:
  - `state-management.service.ts` - Central state (AppState, BehaviorSubjects)
  - `state-export.service.ts` - Serialization, share links, versions
  - `scaling.service.ts` - Size calculations (basePixelsPerUnit=10)
  - `custom-attachment-point.service.ts` - User attachment points
  - `image-metadata.service.ts` - Model loading and caching
  - `indexeddb-user-model.service.ts` - User model persistence

**utils/**
- Purpose: Helper functions and constants
- Contains: Utility functions, not class-based
- Key files:
  - `measurement-utils.ts` - Unit conversions (imperial/metric)
  - `adult-content-filter.ts` - Adult mode helpers
  - `storage-errors.ts` - Error definitions
  - `types.ts` - Type definitions (MeasurementUnit, SiteMode)

**assets/images/**
- Purpose: Store model and attachment images
- Contains: PNG/JPEG files organized by type
- Structure: `images/[model-id].png`, `images/adult/attachments/[attachment-id].png`

**assets/metadata/**
- Purpose: JSON metadata for models
- Contains: Model definition files (one per model)
- Key files:
  - `manifest.json` - Registry of all models
  - `[model-id].json` - Metadata for individual models

**environments/**
- Purpose: Environment-specific configuration
- Contains: TypeScript files with configuration constants
- Used by: `environment.prod` for production API URLs

## Key File Locations

**Entry Points:**
- `src/main.ts`: Bootstrap entry point
- `src/app/app.component.ts`: Root component
- `src/app/app.routes.ts`: Route definitions

**Critical State Files:**
- `src/app/services/state-management.service.ts`: Central AppState
- `src/app/services/state-export.service.ts`: Serialization, versions (MUST update for state changes)
- `src/app/models/image-model.interface.ts`: Data type definitions

**Core Rendering:**
- `src/app/components/compare-modal/compare-modal.component.ts`: Main viewport
- `src/app/components/comparison-panel/comparison-panel.component.ts`: Single panel
- `src/app/components/image-display/image-display.component.ts`: Image + overlay rendering

**Domain Logic:**
- `src/app/services/scaling.service.ts`: Size calculations
- `src/app/services/custom-attachment-point.service.ts`: Attachment point management
- `src/app/services/model-attachment-defaults.service.ts`: Default overlays per model

**Attachment System:**
- `src/app/components/attachment-sidebar/attachment-sidebar.component.ts`: Main UI
- `src/app/components/attachment-preview/attachment-preview.component.ts`: Canvas preview
- `src/app/components/attachment-selector/attachment-selector.component.ts`: Dropdown

**Adult Mode:**
- `src/app/components/penetration-modal/penetration-modal.component.ts`: Visualization
- `src/app/utils/adult-content-filter.ts`: Helpers
- `src/app/services/site-mode.service.ts`: URL sync

## Naming Conventions

**Files:**
- Component: `[feature].component.ts` (e.g., `image-display.component.ts`)
- Service: `[domain].service.ts` (e.g., `scaling.service.ts`)
- Guard: `[purpose].guard.ts` (e.g., `share-link.guard.ts`)
- Interface: `[name].interface.ts` (e.g., `image-model.interface.ts`)
- Utility: `[purpose]-[nature].ts` (e.g., `adult-content-filter.ts`, `safe-local-storage.ts`)
- Test: `[file].spec.ts` (parallel to implementation file)

**Directories:**
- Feature directories use kebab-case: `attachment-sidebar`, `compare-modal`
- Grouped directories plural: `components/`, `services/`, `utils/`, `guards/`
- Model directory singular: `models/` (contains types, not instances)

**Classes & Interfaces:**
- PascalCase: `AppComponent`, `StateManagementService`, `ImageModel`
- Component suffix: All components end with `Component`
- Service suffix: All services end with `Service`
- Interface suffix: Types/interfaces end with `Interface` (or use no suffix if clear from context)

**Variables & Functions:**
- camelCase: `panelState`, `updateImageTransform()`, `calculateImageDimensions()`
- Observables suffix: `$` (e.g., `state$`, `leftPanel$`)
- Private prefix: `private` keyword (not underscore convention)

## Where to Add New Code

**New Standalone Component:**
1. Create directory: `src/app/components/[feature-name]/`
2. Files:
   - `[feature-name].component.ts` - Import CommonModule, use standalone: true
   - `[feature-name].component.html` - Use new control flow syntax (@if, @for)
   - `[feature-name].component.scss` - Component-scoped styles
   - `[feature-name].component.spec.ts` - Unit tests
3. Follow pattern from `src/app/components/size-slider/size-slider.component.ts`

**New Service:**
1. File: `src/app/services/[domain].service.ts`
2. Decorate with `@Injectable({ providedIn: 'root' })`
3. Inject StateManagementService if accessing state
4. Add spec file: `[domain].service.spec.ts`
5. Use RxJS observables for reactive patterns

**New Utility Function:**
1. File: `src/app/utils/[purpose].ts`
2. Export functions directly (not in classes)
3. Keep functions pure (no side effects)
4. Add JSDoc comments

**New Route:**
1. Edit: `src/app/app.routes.ts`
2. Add route definition with path and component
3. Apply guards if needed (e.g., shareLinkGuard)
4. Create `RouteShellComponent` wrapper if needed

**Extending State:**
1. Modify: `src/app/services/state-management.service.ts`
   - Update interface (AppState, GlobalSettings, PanelState, etc.)
   - Update initialState
   - Add update method
2. Modify: `src/app/models/image-model.interface.ts` if adding model properties
3. **CRITICAL**: Update `src/app/services/state-export.service.ts`
   - Increment `CURRENT_VERSION` string
   - Add new version to `SUPPORTED_VERSIONS` array
   - Update `ExportedState` interface if needed
4. Write migration logic if needed for backward compatibility

**New Modal:**
1. Create: `src/app/components/[feature]-modal/[feature]-modal.component.ts`
2. Pattern: Standalone component with `selector: 'app-[feature]-modal'`
3. Add input: `@Input() show = false` to control visibility
4. Add output: `@Output() close = new EventEmitter()` for close events
5. Register in `AppComponent` with `ngIf="show[Feature]Modal"`

**New Metadata Field:**
1. If affecting serialized state:
   - Add to `ImageModel` interface in `image-model.interface.ts`
   - Update `state-export.service.ts` version (CRITICAL)
   - Add to metadata JSON files in `assets/metadata/`
   - Handle backward compatibility (provide default if missing)
2. If display-only:
   - Add to `ImageModel` interface
   - No version bump needed
   - Handle missing field gracefully

## Special Directories

**assets/metadata/**
- Purpose: Model definition JSON files
- Generated: Via `./scripts/generate-image-metadata.sh`
- Committed: Yes (source of truth for models)
- Format: One JSON file per model, references in manifest.json

**assets/images/**
- Purpose: Binary image files for models
- Generated: No (user uploads or pre-created)
- Committed: Yes (for built-in models)
- Format: PNG/JPEG, dimensions stored in metadata

**environments/**
- Purpose: Configuration per environment
- Generated: No (manually maintained)
- Committed: Yes
- Content: API URLs, feature flags, environment constants

---

*Structure analysis: 2026-07-01*
