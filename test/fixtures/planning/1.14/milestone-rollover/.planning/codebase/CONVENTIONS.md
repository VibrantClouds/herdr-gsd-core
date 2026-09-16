# Coding Conventions

**Analysis Date:** 2026-07-01

## Naming Patterns

**Files:**
- Components: `{name}.component.ts`, `{name}.component.html`, `{name}.component.scss`, `{name}.component.spec.ts`
- Services: `{name}.service.ts`, `{name}.service.spec.ts`
- Interfaces/Models: `{name}.interface.ts`
- Guards: `{name}.guard.ts`
- Pipes: `{name}.pipe.ts`
- Utilities: `{name}.ts` in `src/app/utils/`
- All files use kebab-case (e.g., `attachment-selector.component.ts`)

**Functions/Methods:**
- Use camelCase (e.g., `togglePenetrationModal()`, `getMergedAttachmentPoints()`)
- Private methods explicitly marked with `private` keyword (e.g., `private hasPenetrationZone()`)
- Public methods have no prefix
- Method names should be action verbs for imperative operations: `get*`, `add*`, `update*`, `delete*`, `toggle*`, `set*`
- Boolean getters may use `is*` or `can*` prefix (e.g., `canOpenPenetration()`, `isAdultMode`)

**Variables/Properties:**
- Use camelCase (e.g., `selectedModel`, `overlayScales`, `imageTransform`)
- Private properties prefixed with `private` keyword
- Class members initialized in constructor or as field initializers
- Constants in UPPER_SNAKE_CASE (e.g., `STORAGE_UNAVAILABLE_MESSAGE`, `CURRENT_VERSION`)

**Observables/Streams:**
- Observable properties end with `$` suffix (e.g., `leftPanel$`, `canShare$`, `isAdultMode$`, `userModels$`)
- Indicates the property is a stream that components should subscribe to
- Used consistently across services and components

**Types/Interfaces:**
- PascalCase for interface names (e.g., `ImageModel`, `OverlayModel`, `AttachmentPoint`)
- Generic type parameters use single letters or descriptive PascalCase
- Interfaces describe the shape of objects, never create implementation classes
- Example: `interface ImageModel { ... }`

**Component Selectors:**
- Always prefixed with `app-` (e.g., `app-attachment-selector`, `app-image-display`)
- Kebab-case matching the component class name
- Declared in `@Component({ selector: 'app-...' })`

## Code Style

**Formatting:**
- Indentation: 2 spaces (configured in `.editorconfig`)
- Line endings: Unix (LF)
- Trailing whitespace: trimmed on all files
- Final newline: required on all files

**Quotes:**
- TypeScript/JavaScript: Single quotes (configured in `.editorconfig`)
- Example: `import { Component } from '@angular/core';`
- HTML attributes: Double quotes

**Linting:**
- TypeScript strict mode enabled in `tsconfig.json`
- Compiler options: `strict: true`, `noImplicitOverride: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`
- No ESLint or Prettier configured — rely on TypeScript strict mode for type checking
- Linting command: `pnpm run lint` (runs `tsc --noEmit`)
- Type checking: `pnpm run typecheck`

**Decorators and Imports:**
- Imports organized by group: Angular core, RxJS, local models/services/utilities
- Always use explicit imports, no wildcard imports
- Keep imports alphabetically sorted within groups

## Import Organization

**Order:**
1. Angular imports (`@angular/...`)
2. Third-party imports (`rxjs`, `@msgpack/msgpack`, etc.)
3. Relative imports from models (`../models/...`)
4. Relative imports from services (`../services/...`)
5. Relative imports from utilities (`../utils/...`)
6. Relative imports from components/pipes (`../components/...`)

**Path Aliases:**
- No path aliases configured — use relative paths throughout
- Example: `import { ImageModel } from '../../models/image-model.interface';`

**Example Import Block:**
```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { ImageModel } from '../../models/image-model.interface';
import { StateManagementService } from '../../services/state-management.service';
import { filterAdultAttachments } from '../../utils/adult-content-filter';
```

## Component Declaration

**Standalone Components:**
- All components are standalone (no NgModules)
- Declare dependencies in `imports: [...]` array
- Example:
```typescript
@Component({
  selector: 'app-attachment-selector',
  imports: [CommonModule, FormsModule],
  templateUrl: './attachment-selector.component.html',
  styleUrl: './attachment-selector.component.scss'
})
export class AttachmentSelectorComponent implements OnInit { ... }
```

**Input/Output Pattern:**
- Components currently use `@Input()` and `@Output()` decorators (pre-signals style)
- Note: CLAUDE.md prescribes modern signals `input()` and `input.required()` syntax, but codebase hasn't migrated yet
- Existing pattern:
```typescript
@Input() selectedModelId?: string | null;
@Input({ required: true }) panelSide!: 'left' | 'right';
@Output() attachmentSelected = new EventEmitter<ImageModel>();
```

## Template Syntax

**Control Flow:**
- Use modern Angular control flow syntax (not structural directives)
- `@if (condition) { ... } @else { ... }`
- `@for (item of items; track item.id) { ... } @empty { ... }`
- `@switch (value) { @case ('option') { ... } @default { ... } }`
- No `*ngIf`, `*ngFor`, `[ngSwitch]` patterns

**Example:**
```html
@if (imagePath) {
  <div class="preview-container">
    <!-- content -->
  </div>
}

@for (attachment of attachments$ | async; track attachment.id) {
  <option [value]="attachment.id">{{ attachment.name }}</option>
} @empty {
  <option disabled>No attachments available</option>
}
```

## Error Handling

**Patterns:**
- Services throw custom error classes for specific failure modes
- Example: `StorageUnavailableError` in `src/app/utils/storage-errors.ts` for persistent storage failures
- Components catch errors and display via `SnackbarService`
- Log level: `console.error()` for failures, `console.log()` for informational messages

**User Feedback:**
- Use `SnackbarService` for user-facing error messages
- Methods: `show()`, `showError()`, `showSuccess()`, `showInfo()`
- Example:
```typescript
try {
  await this.userModelService.saveUserModel(model);
  this.snackbarService.show('Model saved!', 'success', 3000);
} catch (error) {
  console.error('Save failed:', error);
  this.snackbarService.showError('Failed to save model');
}
```

**Error-Specific Handling:**
- `StorageUnavailableError`: Checked explicitly in share-link guard and state-export service
- Rethrow or propagate specialized errors without wrapping in generic message
- Example in `state-export.service.ts`:
```typescript
if (error instanceof StorageUnavailableError) { 
  throw error; 
}
throw new Error(`Failed to import state: ${error}`);
```

## Logging

**Framework:** Console API (no logging library configured)

**Patterns:**
- `console.log()`: Informational, state transitions, lifecycle events
- `console.warn()`: Non-critical issues (e.g., clipboard API failures)
- `console.error()`: Exceptions, failed operations, error conditions

**Example:**
```typescript
console.log('Migrating user models from LocalStorage to IndexedDB...');
console.warn('Clipboard copy failed:', clipboardError);
console.error('Migration failed:', error);
```

## Comments

**When to Comment:**
- Explain *why*, not *what* — code should be self-documenting
- Document non-obvious business logic (e.g., penetration zone angle calculations)
- Document algorithm decisions or mathematical formulas
- Comment complex selector compositions and RxJS chains
- Add TODO/FIXME markers for known issues (searchable)

**Example:**
```typescript
// Use merged attachment points to include custom points
const mergedPoints = this.customAttachmentPointService.getMergedAttachmentPoints(panelState.selectedModel);
return mergedPoints.some(point => point.isPenetrationZone === true);
```

## JSDoc/Documentation

**For Public Methods:**
- Use JSDoc blocks for component methods that affect UI or emit events
- Document parameters, return types, and side effects
- Example:
```typescript
/**
 * Check if penetration view can be opened.
 * Requires one panel to have a dick attachment and the other to have a penetration zone.
 */
canOpenPenetration(): boolean { ... }

/**
 * Get display name for attachment, adding emoji badge for dick attachments
 * when adult mode is enabled.
 */
getAttachmentDisplayName(attachment: ImageModel, isAdultMode: boolean): string { ... }
```

**For Service Methods:**
- Document public APIs and their side effects
- Include examples for complex operations
- Document Observable return types and completion behavior

## Function Design

**Size Guidelines:**
- Aim for 20–50 lines per function
- Extract complex conditionals into named functions
- Use single responsibility principle — one function, one job

**Parameters:**
- Prefer objects/interfaces for 3+ parameters
- Use boolean parameters sparingly; prefer options object or separate methods
- Example of parameter limit: `updateOverlayScale(panel: 'left' | 'right', overlayId: string, scale: number)`

**Return Values:**
- Return `void` only if function solely performs side effects
- Return `Observable` for async operations (services)
- Return typed objects/primitives; avoid `any`
- Example: `getMergedAttachmentPoints(model: ImageModel): AttachmentPoint[]`

## State Management

**Observable Pattern:**
- Services expose state as Observables via properties ending with `$`
- Components subscribe using `| async` pipe or manual subscriptions
- Example in `StateManagementService`:
```typescript
private state$ = new BehaviorSubject<AppState>(this.initialState);
state: Observable<AppState> = this.state$.asObservable();
leftPanel$ = this.state$.pipe(map(state => state.leftPanel), distinctUntilChanged());
```

**Immutable Updates:**
- State changes create new state objects, never mutate existing state
- Use object spread (`{ ...obj, prop: newValue }`) for shallow updates
- Services expose update methods that internally manage immutability

**Subscription Pattern:**
- Use `takeUntil` operator with `destroy$` subject for component cleanup
- Example:
```typescript
private destroy$ = new Subject<void>();
this.service.data$.pipe(takeUntil(this.destroy$)).subscribe(data => { ... });
ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
```

## Type Safety

**Strict Typing:**
- All properties must have explicit types (no implicit `any`)
- Use union types for known alternatives (e.g., `'left' | 'right'`)
- Use type guards before narrow access
- Example:
```typescript
if (!panelState.selectedModel) { return false; }
const model: ImageModel = panelState.selectedModel; // Now safely typed
```

**Null/Undefined Handling:**
- Always check for null/undefined before access
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Example: `this.currentUnit ?? 'imperial'`

## Module Organization

**Barrel Files:**
- Not commonly used; imports reference files directly
- Example: `import { ImageModel } from '../../models/image-model.interface'` (not from a barrel)

**Lazy Loading:**
- No lazy-loaded modules (standalone components, no routing strategy for lazy loading)
- All components loaded eagerly at app start

---

*Convention analysis: 2026-07-01*
