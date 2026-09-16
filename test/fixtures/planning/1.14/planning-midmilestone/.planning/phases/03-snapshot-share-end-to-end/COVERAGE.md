# API Coverage — AWS S3 (`@aws-sdk/client-s3`)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Phase 3 integrates S3 through the `ObjectStore` interface (`get` / `putIfAbsent` / `head` / `delete`, D-17). Railway and Cloudflare are configured by hand (D-14) and are not called from code.

| capability | decision | reason |
|---|---|---|
| GetObject (share objects) | INTEGRATE | |
| PutObject with `If-None-Match: *` (create share object) | INTEGRATE | |
| HeadObject (image existence, blocked sentinel, size budget) | INTEGRATE | |
| DeleteObject | INTEGRATE | |
| Missing-key 403 handling without list permission | INTEGRATE | |
| Custom endpoint + path-style addressing (MinIO) | INTEGRATE | |
| ListObjectsV2 / ListBucket | OPT-OUT | SEC-04 forbids listing for the API credential; the admin sweep/takedown credential is Phase 7 |
| PutObject with `If-Match` / plain overwrite (living republish) | OPT-OUT | living links and PUT /shares ship in Phase 5 |
| PutObject for `images/*` | OPT-OUT | image upload endpoints ship in Phase 4 |
| PutObjectTagging | OPT-OUT | nothing tags objects until the Phase 7 takedown flow |
| GetObjectAttributes | OPT-OUT | HeadObject already returns the size and metadata needed |
| Multipart upload | OPT-OUT | share objects are at most 512 KiB and images at most 1.5 MiB; single PUTs suffice |
| Presigned URLs | OPT-OUT | shares are read through the API; images are served via CloudFront in Phase 4 |
| CopyObject | OPT-OUT | no copy flow exists; import copies locally in IndexedDB |
| Versioning / Object Lock | OPT-OUT | SPEC-storage-s3 section 1 turns both off |
| Per-request SSE parameters | OPT-OUT | bucket default SSE-S3 applies to every write |
| Bucket management (create, policy, lifecycle, public access block) | OPT-OUT | one-time console setup by the human in 03-07 (D-14) |
| S3 Select / Batch Operations / Inventory | OPT-OUT | no query or bulk workload in v1 |
