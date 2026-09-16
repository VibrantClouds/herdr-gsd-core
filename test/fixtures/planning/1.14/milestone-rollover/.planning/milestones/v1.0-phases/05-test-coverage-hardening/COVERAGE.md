# API Coverage — Phase 05: Test Coverage Hardening

No external API integration: this phase only adds tests over existing code; the pre-existing share-link endpoint is stubbed at `window.fetch`, not integrated.

## Why the detector fired

The `api-coverage` detector matched a `(surface)`/`api` signal on prose in the phase plans. Re-reading the phase scope confirms both matches are non-integration references:

- `05-10-PLAN.md` — "the official Angular **API**": the Angular `RouterTestingHarness`/`provideRouter` testing API, a framework API used to write a spec, not an external service.
- `05-10-PLAN.md` — "the real network round trip against the deployed share-link **API**": named explicitly as **out of scope**. The plan's acceptance criteria mandate `spyOn(window, 'fetch')` as the only stub point and forbid `HttpTestingController`/`provideHttpClientTesting` precisely so no request reaches the deployed endpoint (threat `T-05-10-03`).

The share-link endpoint itself is pre-existing (`StateExportService.generateShareLink` / `loadFromShareLink`, shipped before this milestone). Phase 05 neither adds nor widens its integration surface; per the milestone constraint, there are no backend/API changes available in this repo.
