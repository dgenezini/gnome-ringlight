## 1. Persist monitor selection

- [x] 1.1 Add default-empty excluded-monitor connector setting to GSettings schema and recompile `schemas/gschemas.compiled`.
- [x] 1.2 Resolve each layout monitor's stable connector name with safe fallback for unavailable identities.

## 2. Build selected monitors only

- [x] 2.1 Filter `_build()` monitor loop by persisted exclusions before creating visual rings or struts.
- [x] 2.2 Rebuild active ring when monitor selection changes and preserve existing monitor-layout rebuild behavior.

## 3. Configure and verify

- [x] 3.1 Add enabled monitor rows to preferences, backed by excluded connector names.
- [x] 3.2 Run `node --check extension.js prefs.js`.
- [x] 3.3 Manually test default all-monitor behavior, excluding/re-enabling one monitor while active, monitor reconnect, camera on/off, and disable while active after full Shell restart.
