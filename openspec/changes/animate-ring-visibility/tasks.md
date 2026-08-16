## 1. Transition lifecycle

- [x] 1.1 Add fixed-duration visual ring fade-in while retaining immediate strut creation.
- [x] 1.2 Add fade-out completion cleanup for visual rings and struts.
- [x] 1.3 Guard overlapping transitions and synchronously cancel/remove actors on disable.

## 2. Verify

- [x] 2.1 Run `node --check extension.js`.
- [ ] 2.2 Manually test camera on/off, Auto/Always/Off transitions, rapid off-on reversal, monitor add/remove while active, and disable during each fade after full Shell restart.
