# AI Media Factory - Engineering Backlog

**Document Version:** 1.0  
**Created:** 2026-07-15  
**Based on Analysis:** Full codebase review, architecture docs, existing roadmap, and quality pipeline documentation

This backlog identifies **50 highest-impact improvements** for AI Media Factory, prioritized for autonomous development guidance. Each item includes user impact, technical complexity, estimated time, risk level, dependencies, and priority classification.

---

## Milestone 1: Core Pipeline Reliability 🔴

*Focus: Fix fundamental issues that block production readiness*

### 1. Implement Job Failure Recovery with Idempotency Keys

- **Description:** Enhance job processing with proper idempotency key handling to prevent duplicate processing on retries and worker restarts.
- **Expected User Impact:** Prevents data duplication and ensures consistent job state after infrastructure disruptions.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-6 hours
- **Risk Level:** Medium
- **Dependencies:** None
- **Priority:** Critical

### 2. Add Comprehensive Error Classification and User Messaging

- **Description:** Implement granular error classification (transient vs permanent) with user-friendly safe messages for all failure points.
- **Expected User Impact:** Users receive actionable feedback instead of cryptic errors.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 2-3 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** Critical

### 3. Implement Lease Expiration Handling with Graceful Degradation

- **Description:** When a worker lease expires mid-job, ensure another worker can resume without corrupting state.
- **Expected User Impact:** Jobs don't get stuck in limbo when workers crash.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** High
- **Dependencies:** Task #1
- **Priority:** Critical

### 4. Add Database Migration Strategy with Backup Verification

- **Description:** Implement schema versioning and automated backup verification before any structural changes.
- **Expected User Impact:** Protects against data loss during upgrades.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** High
- **Dependencies:** None
- **Priority:** Critical

### 5. Implement Comprehensive Health Monitoring and Alerting

- **Description:** Add system health endpoints with disk space, memory, worker status, and queue depth monitoring.
- **Expected User Impact:** Operations team can detect issues before they become outages.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** Critical

---

## Milestone 2: Subtitle Engine Excellence 🟠

*Focus: Achieve professional-grade subtitle quality*

### 6. Implement Turkish Morphological Segmentation Rules

- **Description:** Add Turkish-specific rules for handling clitics (da, de, nın, ni, lar, ler) to prevent awkward line breaks.
- **Expected User Impact:** Subtitles look professional and respect Turkish grammar.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 6-8 hours
- **Risk Level:** Medium
- **Dependencies:** None
- **Priority:** High

### 7. Add Collision Detection with Face/Lower-Third Regions

- **Description:** Implement optional face detection and lower-third region awareness for subtitle placement.
- **Expected User Impact:** Subtitles don't cover important on-screen text or faces.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 12-16 hours
- **Risk Level:** Medium
- **Dependencies:** Vision model integration
- **Priority:** High

### 8. Implement Adaptive Reading Speed Profiles

- **Description:** Allow configurable max CPS based on content type (documentary, news, entertainment) and target audience.
- **Expected User Impact:** Better readability for different content styles.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** High

### 9. Add Multi-Line Cue Optimization

- **Description:** Improve balancing algorithm for two-line cues to minimize visual asymmetry.
- **Expected User Impact:** Two-line subtitles look more balanced and professional.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** Medium

### 10. Implement Font Metric Caching

- **Description:** Cache computed font metrics to avoid repeated expensive calculations across large videos.
- **Expected User Impact:** Faster subtitle generation for long videos.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 2-3 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** Medium

### 11. Add Vertical Video Profile Optimization

- **Description:** Currently basic support exists; improve Turkish-specific layout for 9:16 content.
- **Expected User Impact:** Better subtitle quality for TikTok/Shorts/Reels content.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 5-6 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** Medium

### 12. Implement Subtitle Preview with Timeline Scrubbing

- **Description:** Add visual preview component showing subtitle timing with frame-accurate scrubbing.
- **Expected User Impact:** Reviewers can verify timing without downloading renders.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 6-8 hours
- **Risk Level:** Low
- **Dependencies:** Frontend integration
- **Priority:** High

### 13. Add Color Customization and Style Presets

- **Description:** Allow custom subtitle colors, outline, shadow, and position presets per project.
- **Expected User Impact:** Brand consistency for enterprise clients.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** Low
- **Dependencies:** Render pipeline
- **Priority:** Low

### 14. Implement Bilingual Subtitle Support

- **Description:** Allow source and target language subtitles to display simultaneously.
- **Expected User Impact:** Educational content and language learning use cases.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 10-12 hours
- **Risk Level:** Medium
- **Dependencies:** Layout engine enhancement
- **Priority:** Medium

### 15. Add Burned Caption Detection and Handling

- **Description:** Detect hardcoded/burned captions in source video and warn users.
- **Expected User Impact:** Prevents quality issues from embedded subtitles.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 5-6 hours
- **Risk Level:** Low
- **Dependencies:** Vision analysis
- **Priority:** Medium

---

## Milestone 3: Provider Independence 🟡

*Focus: Reduce external service dependency and improve resilience*

### 16. Implement Local Whisper Model Auto-Update

- **Description:** Add automatic model version checking and update capability for whisper.cpp models.
- **Expected User Impact:** Always using best available transcription model.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Medium
- **Dependencies:** Model storage setup
- **Priority:** High

### 17. Add Translation Provider Fallback Chain

- **Description:** When primary translation service fails, automatically try fallback providers.
- **Expected User Impact:** Localization continues even when one provider has issues.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 5-6 hours
- **Risk Level:** Medium
- **Dependencies:** Multiple providers configured
- **Priority:** High

### 18. Implement Provider Cost Tracking and Budget Limits

- **Description:** Track API usage per job and enforce configurable spending limits.
- **Expected User Impact:** Prevents runaway costs from large projects.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** Medium

### 19. Add Local TTS/Dubbing Provider Adapter

- **Description:** Create adapter for local Coqui or XTTS models to reduce cloud TTS dependency.
- **Expected User Impact:** Lower latency and cost for dubbing.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 16-20 hours
- **Risk Level:** High
- **Dependencies:** Local TTS model deployment
- **Priority:** Medium

### 20. Implement Result Caching with Input Fingerprinting

- **Description:** Cache provider results keyed by input hash for identical re-processing.
- **Expected User Impact:** Faster reprocessing and reduced API costs.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** High

### 21. Add Provider Health Monitoring and Automatic Degradation

- **Description:** Track provider latency and error rates; automatically mark degraded providers.
- **Expected User Impact:** System gracefully handles provider outages.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** High

---

## Milestone 4: Quality Assurance 🔵

*Focus: Ensure consistent, measurable output quality*

### 22. Implement Comprehensive Test Fixtures

- **Description:** Build a diverse test corpus covering vertical/horizontal, multi-speaker, pauses, overlapping speech, Turkish edge cases.
- **Expected User Impact:** Regression prevention for subtitle quality changes.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 8-10 hours
- **Risk Level:** Low
- **Dependencies:** Sample media library
- **Priority:** Critical

### 23. Add Visual Diff Automation for Render Comparison

- **Description:** Automatically compare rendered subtitle frames against baseline with pixel-level diff.
- **Expected User Impact:** Detects subtle regressions in subtitle appearance.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 6-8 hours
- **Risk Level:** Low
- **Dependencies:** Test fixtures
- **Priority:** High

### 24. Implement A/B Testing Framework for Segmentation Strategies

- **Description:** Allow comparative evaluation of different segmentation algorithms.
- **Expected User Impact:** Data-driven improvement of subtitle timing.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 8-10 hours
- **Risk Level:** Low
- **Dependencies:** Test fixtures
- **Priority:** Medium

### 25. Add Real User Feedback Collection Loop

- **Description:** Implement mechanism for users to report subtitle quality issues with timestamps.
- **Expected User Impact:** Continuous improvement based on real usage.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Low
- **Dependencies:** Frontend integration
- **Priority:** Medium

### 26. Implement Deterministic Quality Score with Configurable Thresholds

- **Description:** Make quality score thresholds configurable per project type.
- **Expected User Impact:** Flexibility for different content quality requirements.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 2-3 hours
- **Risk Level:** Low
- **Dependencies:** Quality pipeline
- **Priority:** Medium

### 27. Add Cross-Platform Render Consistency Verification

- **Description:** Verify subtitle rendering is consistent across different FFmpeg/libass versions.
- **Expected User Impact:** Reliable output regardless of deployment environment.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 5-6 hours
- **Risk Level:** Medium
- **Dependencies:** Test fixtures
- **Priority:** Low

### 28. Implement Frame-Perfect Validation

- **Description:** Validate subtitle sync at specific critical frames (not just average metrics).
- **Expected User Impact:** Catches sync issues that statistical methods miss.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 5-6 hours
- **Risk Level:** Low
- **Dependencies:** Frame extraction
- **Priority:** High

---

## Milestone 5: User Experience Enhancement 🟢

*Focus: Improve workflow efficiency and reduce friction*

### 29. Implement Real-Time Progress Streaming with SSE

- **Description:** Enhance SSE implementation for granular progress updates during analysis/localization.
- **Expected User Impact:** Users see detailed progress instead of "processing..." spinners.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** Low
- **Dependencies:** Worker event system
- **Priority:** High

### 30. Add Batch Upload with Queue Management

- **Description:** Allow uploading multiple videos with drag-drop and bulk progress tracking.
- **Expected User Impact:** Efficient workflow for processing multiple videos.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 8-10 hours
- **Risk Level:** Low
- **Dependencies:** Upload verification
- **Priority:** High

### 31. Implement Keyboard Shortcuts for Studio

- **Description:** Add vim-style and common editor shortcuts for transcript editing.
- **Expected User Impact:** Power users can edit transcripts much faster.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Low
- **Dependencies:** Studio component
- **Priority:** Medium

### 32. Add Undo/Redo to Transcript Editor

- **Description:** Implement full undo/redo stack for all studio edits.
- **Expected User Impact:** Safe editing with easy error recovery.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Low
- **Dependencies:** Store versioning
- **Priority:** High

### 33. Implement Project Templates

- **Description:** Allow saving and reusing subtitle styles, translation preferences, and approval workflows.
- **Expected User Impact:** Faster setup for recurring project types.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 5-6 hours
- **Risk Level:** Low
- **Dependencies:** Project storage
- **Priority:** Medium

### 34. Add Dark Mode and Accessibility Improvements

- **Description:** Implement dark mode and ensure WCAG 2.1 AA compliance for studio.
- **Expected User Impact:** Better usability for reviewers working long hours.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 6-8 hours
- **Risk Level:** Low
- **Dependencies:** Design system
- **Priority:** Low

### 35. Implement Export Format Selection UI

- **Description:** Allow users to select SRT, VTT, ASS, burned-in video, or segmented audio.
- **Expected User Impact:** Flexible export options for different delivery requirements.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 6-8 hours
- **Risk Level:** Low
- **Dependencies:** Export pipeline
- **Priority:** High

### 36. Add Project Dashboard with Analytics

- **Description:** Show processing history, average quality scores, failure patterns.
- **Expected User Impact:** Better visibility into localization operations.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 8-10 hours
- **Risk Level:** Low
- **Dependencies:** Store analytics
- **Priority:** Medium

### 37. Implement Collaborative Review Mode

- **Description:** Allow multiple reviewers to work on same project with conflict resolution.
- **Expected User Impact:** Teams can collaborate efficiently.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 20-24 hours
- **Risk Level:** High
- **Dependencies:** User authentication
- **Priority:** Low

---

## Milestone 6: Performance Optimization 🟣

*Focus: Faster processing and lower resource usage*

### 38. Implement Parallel Analysis Stages

- **Description:** Run speech recognition and speaker diarization concurrently where possible.
- **Expected User Impact:** Faster video analysis completion.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 12-16 hours
- **Risk Level:** High
- **Dependencies:** Worker concurrency
- **Priority:** High

### 39. Add GPU Acceleration for Whisper

- **Description:** Support CUDA and Metal acceleration for whisper.cpp.
- **Expected User Impact:** 5-10x faster transcription on GPU-equipped systems.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 10-12 hours
- **Risk Level:** Medium
- **Dependencies:** CUDA/Metal runtime
- **Priority:** High

### 40. Implement Incremental Render Processing

- **Description:** Only re-render changed segments instead of full video.
- **Expected User Impact:** Faster iteration during subtitle review.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 16-20 hours
- **Risk Level:** High
- **Dependencies:** Segment tracking
- **Priority:** Medium

### 41. Add Memory-Optimized Processing for Large Videos

- **Description:** Implement streaming/chunked processing for videos over 2 hours.
- **Expected User Impact:** Handle long-form content without OOM errors.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 12-16 hours
- **Risk Level:** High
- **Dependencies:** FFmpeg streaming
- **Priority:** High

### 42. Implement CDN-Ready Static Asset Delivery

- **Description:** Optimize subtitle file delivery with caching headers and compression.
- **Expected User Impact:** Faster subtitle downloads for end users.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 2-3 hours
- **Risk Level:** Low
- **Dependencies:** Web server config
- **Priority:** Low

### 43. Add WebAssembly-Based Font Rendering

- **Description:** Use WASM font metric library for consistent cross-platform measurement.
- **Expected User Impact:** Consistent subtitle layout across environments.
- **Technical Complexity:** High
- **Estimated Implementation Time:** 12-14 hours
- **Risk Level:** Medium
- **Dependencies:** WASM build pipeline
- **Priority:** Low

---

## Milestone 7: Security and Compliance 🔴

*Focus: Production-grade security and auditability*

### 44. Implement Content Hash Verification

- **Description:** Verify SHA-256 hashes of uploaded media throughout processing pipeline.
- **Expected User Impact:** Guarantees media integrity and prevents tampering.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** Medium
- **Dependencies:** None
- **Priority:** Critical

### 45. Add Audit Log for All State Changes

- **Description:** Log every job state transition, user action, and system decision.
- **Expected User Impact:** Full traceability for compliance and debugging.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 6-8 hours
- **Risk Level:** Low
- **Dependencies:** None
- **Priority:** High

### 46. Implement Secret Rotation Mechanism

- **Description:** Support rotating API keys and credentials without service restart.
- **Expected User Impact:** Better security practices without downtime.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 4-5 hours
- **Risk Level:** Medium
- **Dependencies:** Config management
- **Priority:** High

### 47. Add Rate Limiting and Quota Enforcement

- **Description:** Implement per-user/per-project rate limits and processing quotas.
- **Expected User Impact:** Fair resource allocation and cost control.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 5-6 hours
- **Risk Level:** Low
- **Dependencies:** User system
- **Priority:** Medium

### 48. Implement GDPR-Compliant Data Handling

- **Description:** Add data retention policies and right-to-deletion for uploaded media.
- **Expected User Impact:** Legal compliance for European users.
- **Technical Complexity:** Medium
- **Estimated Implementation Time:** 8-10 hours
- **Risk Level:** High
- **Dependencies:** Storage management
- **Priority:** High

### 49. Add CSP and Security Headers

- **Description:** Implement Content Security Policy and other security headers.
- **Expected User Impact:** Protection against XSS and injection attacks.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 2-3 hours
- **Risk Level:** Low
- **Dependencies:** Web server
- **Priority:** Medium

### 50. Implement Video Watermarking for Preview

- **Description:** Add visible watermarking to preview renders to prevent unauthorized use.
- **Expected User Impact:** Protects content before final delivery.
- **Technical Complexity:** Low
- **Estimated Implementation Time:** 3-4 hours
- **Risk Level:** Low
- **Dependencies:** Render pipeline
- **Priority:** Low

---

## Implementation Roadmap

### Phase 1 (Immediate - Next Sprint)
| # | Task | Reason |
|---|------|--------|
| 1 | Job Failure Recovery | Prevents data corruption |
| 2 | Error Classification | Improves user experience |
| 3 | Test Fixtures | Enables safe development |
| 5 | Health Monitoring | Operations readiness |
| 22 | Quality Score Config | Quick win |
| 44 | Content Hash Verification | Security requirement |
| 45 | Audit Logging | Compliance requirement |

### Phase 2 (Short-term - 2-4 Weeks)
| # | Task | Reason |
|---|------|--------|
| 6 | Turkish Morphological Rules | Core quality |
| 12 | Subtitle Preview | User efficiency |
| 20 | Result Caching | Performance |
| 29 | Real-time Progress | User experience |
| 32 | Undo/Redo | User efficiency |
| 46 | Secret Rotation | Security |

### Phase 3 (Medium-term - 1-2 Months)
| # | Task | Reason |
|---|------|--------|
| 9 | Multi-line Optimization | Quality |
| 16 | Whisper Auto-update | Maintainability |
| 17 | Provider Fallback | Reliability |
| 23 | Visual Diff | Quality |
| 30 | Batch Upload | User efficiency |
| 38 | Parallel Stages | Performance |
| 39 | GPU Acceleration | Performance |

### Phase 4 (Long-term - 3+ Months)
| # | Task | Reason |
|---|------|--------|
| 7 | Collision Detection | Advanced quality |
| 14 | Bilingual Subtitles | Feature expansion |
| 19 | Local TTS | Independence |
| 37 | Collaborative Review | Team feature |
| 40 | Incremental Render | Performance |
| 48 | GDPR Compliance | Legal compliance |

---

## Summary Statistics

| Priority | Count |
|----------|-------|
| **Critical** | 8 |
| **High** | 17 |
| **Medium** | 18 |
| **Low** | 7 |
| **Total** | **50** |

| Complexity | Count |
|------------|-------|
| Low | 19 |
| Medium | 22 |
| High | 9 |

| Estimated Total Implementation Time |
|--------------------------------------|
| ~400-500 hours |

---

## Appendix: Dependencies Graph

```
Task 1 (Idempotency) ──► Task 3 (Lease Handling)
Task 6 (Turkish Rules) ──► Task 9 (Multi-line)
Task 1 ──► Task 20 (Caching)
Task 22 (Fixtures) ──► Task 23 (Visual Diff)
Task 22 ──► Task 24 (A/B Testing)
Task 22 ──► Task 27 (Cross-platform)
Task 28 (Frame Validation) ──► Task 12 (Preview)
Task 38 (Parallel) ──► Task 39 (GPU)
Task 39 ──► Task 41 (Memory Opt)
Task 44 (Hash) ──► Task 45 (Audit)
Task 46 (Secrets) ──► Task 48 (GDPR)
```

---

*This backlog is intended as a living document for autonomous engineering guidance. Items should be re-prioritized based on user feedback and changing business requirements.*
