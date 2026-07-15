# Benchmark fixtures

Fixture manifests are tracked; media and transcript payloads are not. The runner must resolve payloads through `AMF_BENCHMARK_MEDIA_ROOT`, verify every declared SHA-256 checksum, and stop on mismatch.

`failed-vertical-v1` records the sanitized development fixture already used for Subtitle Engine V2 acceptance. It remains `goldenApproval: pending`; this migration does not claim a human-approved visual golden.

This directory is reserved for sanitized, development-only benchmark manifests and the minimum media needed to reproduce subtitle quality results.

Every fixture must record its source provenance, sanitization method, video/audio metadata, transcript origin, speaker/timestamp origin, SHA-256 checksums, and approval status. Never copy a production database, credentials, unrelated user media, or reconstructed transcript text here. Large media must remain outside Git and be referenced through an approved development artifact location.

No human-approved fixture is included by this migration commit. The synthetic orchestrator smoke render is a runtime validation artifact, not a product-quality golden fixture.
