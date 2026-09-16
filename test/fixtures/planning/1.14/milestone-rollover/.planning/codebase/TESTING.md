# Testing Patterns

**Analysis Date:** 2026-07-01

## Test Framework

**Runner:**
- Karma 6.4.0 with @angular-devkit/build-angular
- Configuration: Defined in `angular.json` under `projects.size-comparison-tool.architect.test`
- Config file: No standalone karma.conf.js (uses Angular CLI defaults via angular.json)

**Assertion Library:**
- Jasmine 5.6.0
- Types: @types/jasmine 5.1.0

**Additional Tools:**
- karma-chrome-launcher 3.2.0 — Browser runner
- karma-jasmine 5.1.0 — Jasmine adapter
- karma-jasmine-html-reporter 2.1.0 — HTML reporting
- karma-coverage 2.2.0 — Code coverage tracking

**Run Commands:**
```bash
pnpm test                    # Run tests in watch mode
pnpm test --no-watch        # Run tests once and exit
pnpm test --code-coverage   # Run with coverage report
ng test                      # Angular CLI equivalent to pnpm test
```

**Coverage:**
- Tool: karma-coverage (enabled by default)
- View coverage: Check `coverage/` directory after running with `--code-coverage` flag
- No coverage thresholds configured (not enforced)

## Test File Organization

**Location:**
- Co-located with source files
- Same directory as the component/service being tested
- Example: `src/app/services/state-management.service.spec.ts` tests `src/app/services/state-management.service.ts`

**Naming:**
- `.spec.ts` suffix for all test files
- File name matches source file: `{name}.service.spec.ts`, `{name}.component.spec.ts`
- Example: `custom-attachment-point.service.spec.ts`

**Discovery:**
- Test configuration in `tsconfig.spec.json` includes all `**/*.spec.ts` files
- Polyfills: `zone.js`, `zone.js/testing`, `src/test-setup.ts`

## Test Structure

**Suite Organization:**
```typescript
describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(() => {
    TestBed.configureTestingModule({ /* config */ });
    service = TestBed.inject(ServiceName);
  });

  afterEach(() => {
    // Cleanup (e.g., localStorage, timers)
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('methodName', () => {
    it('should perform action X', () => {
      // Arrange
      const input = { /* ... */ };
      
      // Act
      const result = service.methodName(input);
      
      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

**Test Naming:**
- Describe blocks: PascalCase class/component name, then grouped by method
- Test cases: Start with "should" (e.g., `should be created`, `should save and retrieve user models`)
- Use nested `describe()` blocks to organize related tests

**Setup/Teardown:**
- `beforeEach()`: TestBed configuration, service injection, test data setup
- `afterEach()`: Cleanup (localStorage clear, timers, subscriptions)
- Example:
```typescript
beforeEach(() => {
  TestBed.configureTestingModule({});
  service = TestBed.inject(UserModelService);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});
```

## Component Testing

**Basic Component Test:**
```typescript
describe('AttachmentSelectorComponent', () => {
  let component: AttachmentSelectorComponent;
  let fixture: ComponentFixture<AttachmentSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttachmentSelectorComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AttachmentSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

**Key Patterns:**
- `TestBed.configureTestingModule()`: Declare component and dependencies
- `fixture.componentInstance`: Access component instance
- `fixture.detectChanges()`: Trigger change detection and ngOnInit
- `compileComponents()`: Compile external templates/styles (necessary for standalone components)

**Input/Output Testing:**
```typescript
it('should use custom slider settings from model when available', () => {
  const mockModel: ImageModel = {
    id: 'test-model',
    name: 'Test Model',
    /* ... */
    sliderSettings: { min: 0.5, max: 2, step: 0.005 }
  };
  
  component.selectedModel = mockModel;
  
  expect(component.minScale).toBe(0.5);
  expect(component.maxScale).toBe(2);
  expect(component.step).toBe(0.005);
});
```

## Service Testing

**Basic Service Test:**
```typescript
describe('CustomAttachmentPointService', () => {
  let service: CustomAttachmentPointService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CustomAttachmentPointService);
    service.clearAllCustomPoints();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should merge custom and default points', () => {
    service.addCustomPoint('test-model', { name: 'Custom Point', x: 75, y: 150 });
    const merged = service.getMergedAttachmentPoints(mockModel);
    
    expect(merged.length).toBe(2);
    expect(merged[1].type).toBe('custom');
  });
});
```

**Testing Observable Returns:**
```typescript
it('should return empty result when no defaults exist', (done) => {
  service.getOverlaysForModel('nonexistent-model', false).subscribe(result => {
    expect(result.overlays.length).toBe(0);
    done();  // Signal test completion
  });
});
```

## Mocking

**Framework:** Jasmine's `jasmine.createSpyObj()` for mocking dependencies

**Creating Mocks:**
```typescript
const mockStateManagementService = jasmine.createSpyObj('StateManagementService', 
  ['resetState', 'updateLeftPanelModel', 'updateRightPanelModel'],
  { state: of(mockAppState) }  // Mock properties with default values
);
```

**Mock Return Values:**
```typescript
mockUserModelService.getAllUserModels.and.returnValue([]);
mockCustomAttachmentPointService.getAllCustomPoints.and.returnValue({});
```

**Mock Implementation (callFake):**
```typescript
const metadataSpy = jasmine.createSpyObj('ImageMetadataService', ['getModelById']);
metadataSpy.getModelById.and.callFake((id: string) => {
  if (id === 'test-attachment') return of(mockAttachment);
  if (id === 'nsfw-attachment') return of(mockNsfwAttachment);
  return of(undefined);
});
```

**What to Mock:**
- External services (database, HTTP, storage)
- Observable streams from other services
- Window APIs (ResizeObserver, localStorage, etc.)

**What NOT to Mock:**
- The service/component being tested
- Pure utility functions
- TypeScript/JavaScript language features

## Fixtures and Factories

**Test Data Objects:**
```typescript
const mockImageModel: ImageModel = {
  id: 'test-model',
  name: 'Test Model',
  imagePath: '/assets/images/test.png',
  defaultSizeInches: { height: 72 },
  originalDimensions: { width: 100, height: 200 },
  attachmentPoints: [
    { id: 'default-1', name: 'Default Point', x: 50, y: 100 }
  ]
};

const mockAppState = {
  leftPanel: { /* ... */ },
  rightPanel: { /* ... */ },
  globalSettings: { /* ... */ },
  attachmentEditState: { /* ... */ }
};
```

**Location:**
- Defined at top of describe block or in shared test setup files
- Named with `mock` prefix (e.g., `mockModel`, `mockAppState`)
- Reused across multiple test cases in the same describe block

**Factories:**
- No dedicated factory functions in codebase
- Use object spreading to create variants:
```typescript
const mockNsfwAttachment: ImageModel = {
  ...mockAttachment,
  id: 'nsfw-attachment',
  adultClassification: 'dick'
};
```

## Async Testing

**With Observable Subscriptions (done callback):**
```typescript
it('should emit updated models through observable', (done) => {
  service.userModels$.subscribe(models => {
    if (models.length > 0) {
      expect(models.length).toBe(1);
      expect(models[0]).toEqual(mockModel);
      done();  // Complete test when assertion passes
    }
  });
  
  service.saveUserModel(mockModel);
});
```

**With fakeAsync and tick:**
```typescript
import { fakeAsync, tick } from '@angular/core/testing';

it('should complete async operation', fakeAsync(() => {
  service.performAsync();
  tick();  // Advance fake time
  
  expect(service.isComplete()).toBe(true);
}));
```

**With Promises (async/await):**
```typescript
it('should handle promise-based operations', async () => {
  const result = await service.asyncMethod();
  expect(result).toEqual(expectedValue);
});
```

**Testing Observable Errors:**
```typescript
it('should reject invalid state versions', async () => {
  const invalidState = { version: '999.0.0', /* ... */ };

  await expectAsync(service.importCompleteStateFromJSON(JSON.stringify(invalidState)))
    .toBeRejectedWithError(/Unsupported state version/);
});
```

## Error Testing

**Testing Exception Handling:**
```typescript
it('should validate state structure correctly', async () => {
  const validState = { /* valid data */ };

  await expectAsync(service.importCompleteStateFromJSON(JSON.stringify(validState)))
    .not.toBeRejected();
});

it('should reject invalid state data', async () => {
  const invalidJson = '{"invalid": "data"}';

  await expectAsync(service.importCompleteStateFromJSON(invalidJson))
    .toBeRejectedWithError(/Unsupported state version/);
});
```

**Synchronous Error Testing:**
```typescript
it('should throw for invalid input', () => {
  expect(() => service.validateModel(null)).toThrowError();
  expect(() => service.validateModel(null)).toThrowError('Invalid model');
});
```

## Global Test Setup

**File:** `src/test-setup.ts`

**Purpose:** Global mocks and configuration for all tests

**Current Mocks:**
```typescript
// Prevent dialog popups during tests
(window as any).confirm = () => true;
(window as any).alert = () => true;

// Mock ResizeObserver (used by image-display component)
(window as any).ResizeObserver = class ResizeObserver {
  constructor(callback: any) { this.callback = callback; }
  observe() {}
  disconnect() {}
  unobserve() {}
  private callback: any;
};
```

**Usage Pattern:**
- Global setup runs before any tests
- HTTP testing and providers configured per-test via TestBed
- Storage (localStorage) mocked individually in beforeEach/afterEach

## Testing localStorage

**Pattern:**
```typescript
beforeEach(() => {
  localStorage.clear();  // Clean before each test
});

afterEach(() => {
  localStorage.clear();  // Clean after each test
});

it('should save model data to localStorage', () => {
  service.saveUserModel(mockModel);
  
  const savedData = localStorage.getItem('user_model_user_model_123');
  expect(savedData).toBeTruthy();
  expect(JSON.parse(savedData!)).toEqual(mockModel);
});
```

## HTTP Testing

**Pattern with provideHttpClientTesting:**
```typescript
beforeEach(async () => {
  await TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting()
    ]
  }).compileComponents();
});
```

**Mocking HTTP Requests:**
- Not commonly used in service tests (services mocked instead)
- Would use `HttpTestingController` if needed
- Example pattern:
```typescript
let httpMock: HttpTestingController;

beforeEach(() => {
  httpMock = TestBed.inject(HttpTestingController);
});

afterEach(() => {
  httpMock.verify();  // Verify no outstanding HTTP requests
});
```

## Test Types

**Unit Tests:**
- Scope: Single service or component method
- Approach: Test inputs/outputs with mocked dependencies
- Coverage: Test happy path, edge cases, error conditions
- Example: `CustomAttachmentPointService.getMergedAttachmentPoints()`

**Integration Tests:**
- Scope: Multiple services or components interacting
- Approach: Wire together real services, mock only external APIs
- Coverage: State flow, observable chains, data persistence
- Example: Testing state export/import with all services

**E2E Tests:**
- Framework: Not configured
- Status: Not used in current project
- Would require: Protractor, Cypress, or Playwright setup

**Smoke Tests:**
- Scope: Component/service instantiation
- Approach: Basic "should create" tests
- Coverage: Ensures setup doesn't break (catches import/injection errors)
- Example:
```typescript
it('should create', () => {
  expect(service).toBeTruthy();
});
it('should create', () => {
  expect(component).toBeTruthy();
});
```

## Test Organization Patterns

**Service with Multiple Features:**
```typescript
describe('ModelAttachmentDefaultsService', () => {
  let service: ModelAttachmentDefaultsService;
  let mockServices: { /* ... */ };

  beforeEach(() => { /* setup */ });
  afterEach(() => { /* cleanup */ });

  describe('saveOverlaysForModel', () => {
    it('should save overlays to localStorage', () => { /* ... */ });
    it('should remove model entry when saving empty overlays', () => { /* ... */ });
  });

  describe('getOverlaysForModel', () => {
    it('should return empty result when no defaults exist', (done) => { /* ... */ });
    it('should reconstruct overlays from stored defaults', (done) => { /* ... */ });
    it('should filter NSFW overlays when adult mode is off', (done) => { /* ... */ });
  });

  describe('loadDefaults', () => {
    it('should load defaults from external source', () => { /* ... */ });
  });
});
```

## Common Assertions

**Equality:**
```typescript
expect(value).toBe(expectedValue);          // Strict equality (===)
expect(value).toEqual(expectedValue);       // Deep equality for objects
expect(array).toContain(item);              // Array membership
```

**Type/Truthiness:**
```typescript
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();
```

**Collections:**
```typescript
expect(array.length).toBe(3);
expect(array).toEqual([1, 2, 3]);
expect(Object.keys(obj)).toEqual(['key1', 'key2']);
```

**Exceptions:**
```typescript
expect(() => service.throwError()).toThrowError();
expect(() => service.throwError()).toThrowError('message');
```

**Spy/Mock Assertions:**
```typescript
expect(spyObj.method).toHaveBeenCalled();
expect(spyObj.method).toHaveBeenCalledWith(arg1, arg2);
expect(spyObj.method).toHaveBeenCalledTimes(1);
```

## Coverage and Quality

**Coverage Tools:**
- karma-coverage generates coverage reports
- Run: `pnpm test --code-coverage`
- Output: `coverage/` directory with HTML reports

**Coverage Targets:**
- No explicit coverage threshold configured
- Aim for: Core services >80%, components >60%, utilities 100%
- Focus on: Logic branches, error paths, state transitions

**Quality Metrics:**
- All services have corresponding `.spec.ts` files
- Most components have basic smoke tests
- Complex services have comprehensive test suites (e.g., ModelAttachmentDefaultsService, StateExportService)

## Test Execution Tips

**Run Specific Test:**
```bash
# Run tests matching a pattern
ng test --include='**/state-export.service.spec.ts'
ng test --include='**/custom-attachment-point.service.spec.ts'
```

**Watch Mode:**
```bash
pnpm test           # Watches for file changes, reruns affected tests
```

**Debug in Browser:**
```bash
pnpm test           # Opens Karma browser window
# Click "DEBUG" button to open DevTools
# Tests run in browser console with full debugger access
```

**Check Coverage:**
```bash
pnpm test --code-coverage
# Open coverage/index.html in browser to see detailed coverage report
```

---

*Testing analysis: 2026-07-01*
