## ADDED Requirements

### Requirement: Ring visibility transitions smoothly
The extension SHALL fade visual ring actors between transparent and configured opacity over a fixed short duration when global ring state changes. It SHALL use the configured brightness as final visual opacity and SHALL not animate ring geometry or appearance settings.

#### Scenario: Ring activates
- **WHEN** global ring state changes from inactive to active
- **THEN** each visual ring starts transparent and fades to configured brightness

#### Scenario: Ring deactivates
- **WHEN** global ring state changes from active to inactive
- **THEN** each visual ring fades to transparent before its actor is removed

#### Scenario: Appearance setting changes while active
- **WHEN** user changes width, color, brightness, softness, glow, radius, padding, or cursor settings while ring is active
- **THEN** extension applies existing rebuild behavior without introducing a separate visibility fade

### Requirement: Transitions preserve active-state correctness
The extension SHALL treat latest requested global ring state as authoritative during overlapping transitions. It SHALL remove all visual and strut actors synchronously when disabled.

#### Scenario: Camera restarts during fade-out
- **WHEN** global ring state returns to active before a fade-out completes
- **THEN** ring remains visible after transition and stale fade-out completion does not remove its actors

#### Scenario: Extension disabled during transition
- **WHEN** extension is disabled during a fade-in or fade-out
- **THEN** extension cancels transition, removes all ring visuals and struts, and restores work areas
