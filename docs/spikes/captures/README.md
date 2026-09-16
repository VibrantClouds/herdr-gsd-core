# M0 captures

Raw request/response/event captures taken from the live tools during the M0 spikes
(Herdr 0.9.0 protocol 22, GSD-Core 1.14.0). They are the **source of truth for
`test/fake-herdr`**: every result shape, error code and event envelope the fake
emits is copied from these files, and `packages/herdr-client/src/types.ts` is
derived from them (schema-only fields are marked `unverified`).

If a capture and `spec.md` disagree, the capture wins (spec §12.2). Re-record a
capture before changing the fake, never the other way round.
