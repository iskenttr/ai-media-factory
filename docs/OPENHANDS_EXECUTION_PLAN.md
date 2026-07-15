# AI Media Factory - Autonomous Execution Plan

**Document Version:** 1.0  
**Created:** 2026-07-15  
**Based on:** PRODUCT_AUDIT.md and ENGINEERING_BACKLOG.md

This document provides a structured execution plan for autonomous engineering work, following the workflow defined in `AUTONOMOUS_ENGINEERING.md`.

---

## Execution Principles

1. **Safety First:** Never compromise production stability
2. **Bounded Work:** Each task is discrete and reviewable
3. **Human Approval:** All changes require explicit human approval before merge
4. **Evidence-Based:** Every decision backed by test results
5. **Minimal Scope:** Prefer small, safe changes over large refactors

---

## Phase 1: Foundation Stabilization

### Sprint 1: Reliability Core (Week 1-2)

#### Task 1.1: Job Failure Recovery with Idempotency
```
Branch: codex/feature/job-failure-recovery

Changes:
- lib/server/store.ts: Add idempotency key handling
- lib/server/analysis-worker.ts: Check idempotency before processing
- lib/server/video-render-worker.ts: Idempotent render operations

Tests:
- npm test (all passing)
- Integration test for crash recovery
- Verify no duplicate processing

Acceptance Criteria:
- [ ] Job can resume after worker crash
- [ ] No duplicate state written on retry
- [ ] All tests pass
```

#### Task 1.2: Error Classification System
```
Branch: codex/feature/error-classification

Changes:
- lib/providers/provider-errors.ts: Expand error taxonomy
- lib/server/*: Use safe messages for all error paths
- Add error code documentation

Tests:
- npm test
- Manual test all error paths

Acceptance Criteria:
- [ ] All user-facing errors are safe messages
- [ ] Error codes are documented
- [ ] Logs don't expose internals
```

#### Task 1.3: Health Monitoring Endpoints
```
Branch: codex/feature/health-monitoring

Changes:
- app/api/health/extended/route.ts: Extended health check
- lib/server/store.ts: Add health metrics queries
- deploy/healthcheck.sh: Enhanced checks

Tests:
- npm test
- Manual endpoint testing

Acceptance Criteria:
- [ ] /api/health/extended returns disk/memory/queue metrics
- [ ] Health check passes in Docker healthcheck
- [ ] Documentation updated
```

#### Task 1.4: Comprehensive Test Fixtures
```
Branch: codex/feature/test-fixtures

Changes:
- Create storage/fixtures/ directory
- Add 10 diverse test videos (samples)
- Update test files to use fixtures
- Document fixture corpus requirements

Tests:
- npm test
- Visual inspection of fixture renders

Acceptance Criteria:
- [ ] Vertical and horizontal video tested
- [ ] Multiple speakers tested
- [ ] Turkish edge cases covered
- [ ] All tests pass with new fixtures
```

---

### Sprint 2: Security Hardening (Week 2-3)

#### Task 2.1: Content Hash Verification
```
Branch: codex/feature/content-hash

Changes:
- lib/server/upload-verification.ts: SHA-256 on upload
- lib/server/media.ts: Verify hash throughout pipeline
- Store hash in job record

Tests:
- npm test
- Manual upload with hash verification

Acceptance Criteria:
- [ ] Upload generates hash
- [ ] Hash verified before analysis
- [ ] Hash stored in database
```

#### Task 2.2: Audit Logging
```
Branch: codex/feature/audit-logging

Changes:
- lib/server/audit.ts: New audit module
- Add audit events for all state changes
- Implement log rotation

Tests:
- npm test
- Manual trigger all audit events

Acceptance Criteria:
- [ ] All job state changes logged
- [ ] User actions logged
- [ ] Logs are append-only
```

#### Task 2.3: Security Headers
```
Branch: codex/feature/security-headers

Changes:
- next.config.ts: Add security headers
- CSP configuration

Tests:
- npm test
- Security header scan

Acceptance Criteria:
- [ ] CSP header present
- [ ] X-Frame-Options set
- [ ] No console warnings
```

---

## Phase 2: Quality Excellence

### Sprint 3: Subtitle Engine (Week 3-5)

#### Task 3.1: Turkish Morphological Rules
```
Branch: codex/feature/turkish-morphology

Changes:
- lib/subtitle-quality/alignment.ts: Add Turkish rules
- lib/subtitle-quality/engine.ts: Apply rules in segmentation
- Add test cases for Turkish edge cases

Tests:
- npm test
- Visual inspection of Turkish renders
- Compare before/after on fixture corpus

Acceptance Criteria:
- [ ] Clitics not split incorrectly
- [ ] No orphaned suffixes
- [ ] All existing tests pass
```

#### Task 3.2: Visual Diff Automation
```
Branch: codex/feature/visual-diff

Changes:
- lib/subtitle-quality/visual-diff.ts: Enhance automation
- Add CI integration
- Store baseline images

Tests:
- npm test
- Run visual diff on all fixtures

Acceptance Criteria:
- [ ] Can detect pixel-level differences
- [ ] CI can run visual tests
- [ ] Baseline images stored
```

#### Task 3.3: Adaptive Reading Speed
```
Branch: codex/feature/adaptive-reading-speed

Changes:
- lib/subtitle-quality/engine.ts: Configurable CPS
- lib/analysis/contracts.ts: Add content profile
- Use content profile for CPS limits

Tests:
- npm test
- Test with documentary vs news content

Acceptance Criteria:
- [ ] CPS configurable per content type
- [ ] Dense content allows higher CPS
- [ ] All validators pass
```

#### Task 3.4: Subtitle Preview Component
```
Branch: codex/feature/subtitle-preview

Changes:
- components/studio/SubtitlePreview.tsx
- lib/server/video-renderer.ts: Generate preview frames
- API endpoint for preview data

Tests:
- npm test
- Manual preview verification

Acceptance Criteria:
- [ ] Preview shows frame-accurate subtitles
- [ ] User can scrub through timeline
- [ ] Performance < 2s for 1-minute preview
```

---

### Sprint 4: Performance (Week 5-7)

#### Task 4.1: Result Caching
```
Branch: codex/feature/result-caching

Changes:
- lib/server/cache.ts: New cache module
- Provider adapters: Check cache before API calls
- Cache invalidation strategy

Tests:
- npm test
- Measure cache hit rate
- Verify cache invalidation

Acceptance Criteria:
- [ ] Identical inputs return cached results
- [ ] Cache size bounded
- [ ] LRU eviction works
```

#### Task 4.2: Real-Time Progress Streaming
```
Branch: codex/feature/realtime-progress

Changes:
- lib/server/sse.ts: Granular events
- Workers: Emit progress events
- components: Display detailed progress

Tests:
- npm test
- Manual SSE testing

Acceptance Criteria:
- [ ] Progress updates every 5% or 5 seconds
- [ ] ETA displayed
- [ ] No connection drops
```

#### Task 4.3: GPU Acceleration Support
```
Branch: codex/feature/gpu-acceleration

Changes:
- Dockerfile: Add CUDA support
- lib/providers/adapters/whisper.ts: GPU path
- Config: Auto-detect GPU availability

Tests:
- npm test
- Benchmark GPU vs CPU transcription

Acceptance Criteria:
- [ ] GPU transcription works
- [ ] 5-10x speedup measured
- [ ] Graceful fallback to CPU
```

---

## Phase 3: User Experience

### Sprint 5: Studio Enhancements (Week 7-9)

#### Task 5.1: Undo/Redo System
```
Branch: codex/feature/undo-redo

Changes:
- lib/server/store.ts: Version tracking
- components/studio/Studio.tsx: Undo/redo UI
- Keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)

Tests:
- npm test
- Manual studio testing

Acceptance Criteria:
- [ ] 50+ undo levels
- [ ] Works across page refresh
- [ ] Keyboard shortcuts work
```

#### Task 5.2: Batch Upload
```
Branch: codex/feature/batch-upload

Changes:
- components/upload/BatchUpload.tsx
- lib/server/uploads.ts: Queue management
- API: Bulk status endpoint

Tests:
- npm test
- Upload 5+ videos

Acceptance Criteria:
- [ ] Drag-drop multiple files
- [ ] Individual and batch progress
- [ ] Can cancel pending uploads
```

#### Task 5.3: Export Format Selection
```
Branch: codex/feature/export-formats

Changes:
- app/api/video-renders/[jobId]/formats/route.ts
- components/studio/ExportPanel.tsx
- Support SRT, VTT, ASS, burned video

Tests:
- npm test
- Generate all formats

Acceptance Criteria:
- [ ] User selects format
- [ ] All formats generate correctly
- [ ] File sizes reasonable
```

---

## Phase 4: Production Readiness

### Sprint 6: Operational Excellence (Week 9-11)

#### Task 6.1: Secret Rotation
```
Branch: codex/feature/secret-rotation

Changes:
- lib/server/config.ts: Hot-reload secrets
- Deploy: Rotation mechanism
- Documentation: Runbook

Tests:
- npm test
- Manual rotation test

Acceptance Criteria:
- [ ] Secrets reload without restart
- [ ] Old secrets work during rotation
- [ ] Audit log shows rotation
```

#### Task 6.2: Provider Fallback Chain
```
Branch: codex/feature/provider-fallback

Changes:
- lib/providers/provider-registry.ts: Fallback logic
- Add secondary translation provider
- Implement circuit breaker

Tests:
- npm test
- Simulate provider failure

Acceptance Criteria:
- [ ] Fallback triggers on primary failure
- [ ] User notified of fallback
- [ ] Quality maintained with fallback
```

#### Task 6.3: Backup Verification
```
Branch: codex/feature/backup-verification

Changes:
- deploy/backup.sh: Verification step
- Test restore procedure
- Add backup to health check

Tests:
- Manual backup/restore test

Acceptance Criteria:
- [ ] Backups complete successfully
- [ ] Verification passes
- [ ] Restore tested and documented
```

---

## Sprint 7: Advanced Features (Week 11-13)

#### Task 7.1: Parallel Analysis Stages
```
Branch: codex/feature/parallel-analysis

Changes:
- lib/server/analysis-worker.ts: Concurrent stages
- lib/providers/: Parallel provider calls
- Resource limiting

Tests:
- npm test
- Performance measurement

Acceptance Criteria:
- [ ] Independent stages run in parallel
- [ ] Resource limits respected
- [ ] 30%+ faster analysis
```

#### Task 7.2: Incremental Rendering
```
Branch: codex/feature/incremental-render

Changes:
- lib/server/video-renderer.ts: Segment tracking
- Only re-render changed segments
- Cache rendered segments

Tests:
- npm test
- Modify single cue, verify fast render

Acceptance Criteria:
- [ ] Unchanged segments not re-rendered
- [ ] Changes reflect immediately
- [ ] Cache hit rate > 80%
```

#### Task 7.3: Collaborative Review (Foundation)
```
Branch: codex/feature/collab-foundation

Changes:
- lib/server/store.ts: Add user tracking
- Session management
- Conflict detection foundation

Tests:
- npm test
- Manual multi-user testing

Acceptance Criteria:
- [ ] Users can have sessions
- [ ] Conflicts detected
- [ ] Data integrity maintained
```

---

## Execution Workflow

### For Each Task

```
1. PLAN (1-2 hours)
   ├── Read relevant documentation
   ├── Define scope and acceptance criteria
   ├── Identify dependencies
   └── Check for regressions

2. BUILD (variable)
   ├── Create feature branch
   ├── Implement changes
   ├── Add tests
   └── Run npm run check

3. REVIEW (1 hour)
   ├── Self-review diff
   ├── Check for security issues
   ├── Verify test coverage
   └── Document decisions

4. TEST (1-2 hours)
   ├── Run npm test
   ├── Manual testing if required
   ├── Visual QA if applicable
   └── Performance measurement

5. VIDEO QA (if subtitle/render changes)
   ├── Run on fixture corpus
   ├── Inspect transitions
   ├── Compare with baseline
   └── Document findings

6. ARCHITECTURE REVIEW (30 min)
   ├── Check module boundaries
   ├── Verify bounded loops
   ├── Ensure no production mutations
   └── Review provider isolation

7. HANDS-OFF
   ├── Prepare PR description
   ├── Include test evidence
   ├── Document known limitations
   └── Request human approval
```

---

## Risk Mitigation

### Before Starting Any Work

1. **Verify clean working tree**
   ```bash
   git status
   ```

2. **Check for blocking issues**
   - Production access required?
   - Data loss possible?
   - Secret exposure risk?
   - 5+ repair attempts failed?

3. **Confirm branch name**
   ```bash
   git checkout -b codex/feature/[name]
   ```

### During Implementation

1. **Run checks frequently**
   ```bash
   npm run check
   ```

2. **Commit incrementally**
   - One logical change per commit
   - Descriptive messages
   - Test in each commit

3. **Document decisions**
   - Why this approach?
   - Alternatives considered?
   - Future work identified?

### Before Handoff

1. **Verify nothing to main**
   ```bash
   git diff main
   ```

2. **Prepare handoff package**
   - PR description template
   - Test evidence
   - Visual comparisons
   - Migration notes

---

## Progress Tracking

### Weekly Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Tasks completed | 2-3 | |
| Test coverage | +2% | |
| Critical issues remaining | -2 | |
| PRs awaiting review | <5 | |

### Milestone Checkpoints

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Phase 1: Foundation | Week 3 | |
| Phase 2: Quality | Week 7 | |
| Phase 3: UX | Week 9 | |
| Phase 4: Production | Week 13 | |

---

## Stop Conditions

**Stop immediately and report if:**

- Production access required
- Data loss possible
- Credentials exposed or at risk
- 5 repair attempts failed for same issue
- Unresolved regression introduced
- Human approval required for decision

**Do not:**

- Merge to main without approval
- Deploy without explicit request
- Push credentials anywhere
- Delete production data
- Make irreversible changes

---

## Communication Template

### Status Update

```
## Status: [Week X - Task Name]

### Completed
- [ ] Task 1.1
- [ ] Task 1.2

### In Progress
- [ ] Task 1.3 (80%)

### Blockers
- None / [Description]

### Next Steps
- Complete 1.3
- Start 2.1

### Evidence
[Test results, screenshots, metrics]
```

### Handoff Request

```
## Handoff: [Task Name]

### Summary
[1 paragraph]

### Changes
- Files modified
- Lines added/removed

### Evidence
- npm test: [PASS/FAIL]
- npm run check: [PASS/FAIL]
- Visual QA: [Link/Evidence]

### Known Limitations
[Any incomplete work or caveats]

### Dependencies for Next Task
[Any prerequisite work]

### Questions for Reviewer
[Any decisions needed]
```

---

## Appendix: Task Dependency Map

```
Phase 1: Foundation
├── 1.1 Job Recovery ──┬──► 1.3 Health Monitoring
│                     └──► 1.4 Test Fixtures
├── 1.2 Error Class ───┘
└── 1.4 Test Fixtures ──► 3.2 Visual Diff

Phase 2: Quality
├── 3.1 Turkish Rules ──► 3.3 Adaptive CPS
├── 3.2 Visual Diff ────► Regression Prevention
└── 3.3 Adaptive CPS ────► 3.4 Preview

Phase 3: UX
├── 5.1 Undo/Redo ──────► 5.2 Batch Upload
├── 5.2 Batch ──────────► 5.3 Export
└── 5.3 Export ──────────► 7.2 Incremental

Phase 4: Production
├── 6.1 Secrets ─────────► 6.3 Backup
├── 6.2 Fallback ────────► Reliability
└── 6.3 Backup ──────────► Compliance

Parallel Tracks
├── 4.1 Caching ─────────► 4.2 Progress ──► 4.3 GPU
├── 4.3 GPU ─────────────► 7.1 Parallel ──► 7.2 Incremental
└── 7.3 Collab ──────────► Future Features
```

---

*This execution plan provides structured guidance for autonomous engineering. Adjust based on human feedback and emerging priorities.*
