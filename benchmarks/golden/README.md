# Human-approved golden benchmarks

Golden data is accepted only after a human reviewer approves the fixture, transcript/localization provenance, expected deterministic metrics, and representative render frames. Store the approval record and checksums with the manifest; keep large media outside Git.

This directory is intentionally empty of golden results. Until approval exists, benchmark reports must use `goldenApproval: "pending"`, set baseline and quality delta to `null`, and report `no_approved_golden`. Never manufacture expected scores or copy candidate output into the golden set.
