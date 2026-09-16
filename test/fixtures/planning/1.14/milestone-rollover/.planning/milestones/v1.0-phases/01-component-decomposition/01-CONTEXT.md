# Phase 1: Component Decomposition - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the three oversized modal/preview components — `upload-modal` (978 lines), `attachment-edit-modal` (909 lines), and `attachment-preview` (856 lines) — into focused, independently-testable sub-components/services with **unchanged observable behavior**. This is a pure refactor: no new capabilities, no UX changes. Later phases (race-condition fixes, perf hardening, test coverage) build on the smaller surfaces this phase produces.

**Requirements:** DECOMP-01, DECOMP-02, DECOMP-03 (see `.planning/REQUIREMENTS.md`)

</domain>

<decisions>
## Implementation Decisions

### Shared Logic Between upload-modal and attachment-edit-modal

- **D-01:** `upload-modal` and `attachment-edit-modal` contain near-duplicate ruler/measurement-dragging logic (`onRulerPointMouseDown`, `onRulerPointTouchStart`, `onRulerPointMove`, `onRulerPointEnd`, `updateRulerPixelLength`, `setRulerPreset`, `getScaledRulerX`/`getScaledRulerY`, `isDefaultVerticalRuler`) and similar attachment-point-definition logic (`startDefiningAttachmentPoint`, `onImageClick` for point placement). **Extract these into ONE shared, reusable service/component set used by both modals** — do not duplicate the extraction per-component. This matches CONCERNS.md's fix approach ("dedicated service" / "dedicated UI component").
- **Known asymmetry:** `attachment-edit-modal` additionally has angle-dial rotation-dragging logic (`onDialMouseDown`, `onDialMove`, `onDialEnd`, `updateAngleFromEvent`, `calculateAndSetAngle`) that `upload-modal` does not have — this is edit-modal-only and should NOT be forced into the shared ruler extraction. Treat it as its own dedicated component/service, separate from the shared ruler/measurement piece.
- **Consequence to design for:** the shared ruler/attachment-point service will be consumed by two different parent modals with two different save/submit flows (`upload-modal.onSubmit` vs `attachment-edit-modal.onSave`'s multi-branch switch over `editType`). The shared piece must expose its state/output in a way that's agnostic to which parent consumes it (e.g., emit `measurementLine`/`attachmentPoint` data, don't reach back into a specific parent's form).

### Extraction Style (Components vs. Services)

- **D-02:** Use **presentational sub-components** (own template, `@Input()`/`@Output()`) for UI-heavy, template-owning concerns — e.g., the shared ruler/measurement UI, the shared attachment-point picker, and (for `attachment-edit-modal`) the angle-dial UI.
- **D-03:** Use **injectable services** (no template) for pure-logic concerns — e.g., image cropping/compression (`upload-modal`'s `onFileSelected`/`createPreviewFromFile` pipeline), form validators (`uniqueNameValidator`, `sliderRangeValidator`, `heightValidator`), and unit-conversion helpers.
- **Rationale:** matches the DECOMP requirement wording ("sub-components/services") and keeps each new file's template in sync with the logic that owns it, rather than leaving all three modal `.html` files monolithic while only `.ts` logic moves out.

### attachment-preview: Rendering/Interaction vs. Selection State

- **D-04:** Keep **Canvas rendering (`render*` methods) and coordinate-based hit-testing (`onCanvasClick`, `onCanvasMouseMove`, distance calculations against `attachmentPointPositions`) together** in one extracted rendering/interaction concern — both need the same pixel-space math (attachment points are in ORIGINAL image pixel coordinates per the project's critical invariants), so splitting them apart would duplicate that math.
- **D-05:** Selected/hovered point IDs (`selectedAttachmentPointId`, `hoveredAttachmentId`) remain `@Input()`s driven by the parent (`attachment-sidebar`) — `attachment-preview` does not own selection state itself, it renders based on inputs and emits click events (`attachmentPointClicked`, `customPointAdded`, `pointDeleted`). Do not introduce new internal state for what's already parent-owned.

### Risk Mitigation for attachment-edit-modal (No Existing Tests)

- **D-06:** `attachment-edit-modal.component.ts` has **no spec file today** (confirmed — only `.ts`, `.html`, `.scss` exist in that directory, no `.spec.ts`). TEST-01 (adding its spec) is explicitly scheduled for Phase 5, not this phase.
- **D-07:** Decompose it now anyway, relying on **careful behavior-preserving extraction plus manual verification** of the edit/save/delete flows (all three `editType` branches: `server_custom_point`, `custom_attachment`, `custom_model`) — do not add new automated test coverage in this phase as a substitute; that's Phase 5's job and adding it here would blur phase boundaries and scope.
- **Planner/executor note:** because there's no regression safety net, plan this component's decomposition with extra manual-verification checkpoints (e.g., verify each `editType` branch's save path manually after extraction) before considering the phase's Success Criterion #5 ("existing specs still pass... no behavior change") satisfied for this file.

### Claude's Discretion

- Exact file/directory naming for new sub-components and services (research/planning should follow the existing kebab-case component/service naming conventions in CONVENTIONS.md).
- Whether the shared ruler/measurement and attachment-point-definition pieces live under a new shared directory (e.g., `src/app/components/shared/` or similar) vs. co-located near one of the two consuming modals — planner should pick based on existing project structure conventions.
- Precise ~400-line target is a guideline per DECOMP-01/02/03, not something requiring line-count enforcement tooling — planner should aim for it but use judgment on natural extraction boundaries over hitting an exact number.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Concerns & Scope (source of truth for this milestone)
- `.planning/codebase/CONCERNS.md` — "Large Components Approaching Complexity Ceiling" section documents the fix approach (separate image processing from forms, extract ruler/measurement UI, extract attachment-point definition into a dedicated service, create a dedicated attachment-point UI component) and the "Document-Level Event Listeners" / "Upload/Edit Modal Complex State Management" fragile-area notes relevant to what's being extracted.
- `.planning/PROJECT.md` — Core value, constraints (behavior-preserving, mobile-first, no new UI frameworks), and critical invariants that must not regress during decomposition.
- `.planning/REQUIREMENTS.md` — DECOMP-01, DECOMP-02, DECOMP-03 full requirement text and acceptance criteria.
- `.planning/ROADMAP.md` — Phase 1 goal and Success Criteria (5 items, including the ~400-line ceiling and "existing specs still pass" requirement).

### Project Conventions & Architecture
- `.claude/CLAUDE.md` — Component/service naming patterns, standalone-component conventions, state management patterns (services with BehaviorSubjects), function design guidelines (20–50 lines/function, single responsibility).
- `.planning/codebase/CONVENTIONS.md` — Naming patterns, code style, component declaration conventions to follow for new files.
- `.planning/codebase/ARCHITECTURE.md` — Component responsibility table, layering, and how `upload-modal`/`attachment-edit-modal`/`attachment-preview` fit into the broader app architecture.

### Domain Skills (auto-activating, but explicitly relevant here)
- `.claude/skills/attachment-system/SKILL.md` — Attachment points, attachment-point definition flow, `sourceAttachmentPointId` invariant — directly relevant to the shared attachment-point-definition extraction (D-01).
- `.claude/skills/scaling-system/SKILL.md` — Pixel-coordinate math and uniform/center-based scaling invariants — directly relevant to the ruler/measurement extraction (D-01) and attachment-preview's rendering/hit-testing (D-04), since both operate in original-image pixel coordinates.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None of the three target components currently have extractable shared building blocks in the codebase — the ruler/measurement and attachment-point-definition duplication (D-01) exists only within `upload-modal` and `attachment-edit-modal` themselves; there's no existing shared component to reuse, one needs to be created.

### Established Patterns
- Document-level event listeners for drag operations (`boundOnRulerMove`/`boundOnRulerEnd` in upload-modal; `boundOnDialMove`/`boundOnDialEnd` in attachment-edit-modal) with defensive cleanup in `ngOnDestroy` — this pattern should be preserved as-is during decomposition (PointerCapture rework is explicitly Phase 3's job, RACE-03, not this phase's).
- `ResizeObserver` pattern already established in `image-display` and used in `attachment-preview` (`setupResizeObserver`) — the established pattern for observing canvas/container size.
- Services with BehaviorSubjects for state (`StateManagementService`, `CategoryService`, etc.) — new extracted services should follow this pattern where they hold state, or be stateless utility services where they don't.

### Integration Points
- `attachment-preview` is a Canvas renderer consumed by `attachment-sidebar` (via `@Input()`s including `selectedAttachmentPointId`, `hoveredAttachmentId`, `pendingAttachment`) — any extraction must preserve this input/output contract exactly (D-05).
- `upload-modal` emits `upload: EventEmitter<ImageModel>` and `attachment-edit-modal` emits `saved`/`deleted`/`closeModal` — these public contracts must remain unchanged for parent components (`app.component.ts`, `manage-modal`) to keep working.
- Both modals interact with `StateManagementService.globalSettings$` (adult mode) and category/unit services — extracted services need access to these same injected dependencies.

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX examples given — this is an internal refactor with no observable output for end users. The "specific idea" that emerged from discussion is architectural: prioritize eliminating the ruler/measurement and attachment-point-definition duplication as a single shared extraction (D-01), since that duplication was the most concrete, verifiable problem found during codebase scouting (near-line-for-line duplicate methods across two files).

</specifics>

<deferred>
## Deferred Ideas

- Adding automated test coverage for `attachment-edit-modal` — explicitly deferred to Phase 5 (TEST-01), not added as a stopgap in this phase (D-06/D-07).
- PointerCapture-based rework of the document-level drag listeners — explicitly deferred to Phase 3 (RACE-03); this phase preserves the existing listener pattern as-is while relocating the code that uses it.
- Web Worker offload of image cropping/compression — explicitly deferred to Phase 4 (PERF-03); this phase only relocates the existing synchronous logic into a service, it does not change its execution model.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 1-Component Decomposition*
*Context gathered: 2026-07-01*
