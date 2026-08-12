## ADDED Requirements

### Requirement: User selects ring-enabled monitors
The extension SHALL expose every currently connected monitor in preferences with an enabled control identified by its connector name. A selected monitor SHALL receive both ring visuals and work-area struts whenever the global ring state is active; an unselected monitor SHALL receive neither. A connector without a stored selection SHALL default to selected.

#### Scenario: Default applies to every monitor
- **WHEN** no monitor selections are stored and global ring state becomes active
- **THEN** every connected monitor receives its ring and work-area struts

#### Scenario: Monitor excluded in preferences
- **WHEN** user disables a connected monitor in preferences while global ring state is active
- **THEN** ring visuals and struts are removed from that monitor and remain on selected monitors

#### Scenario: Monitor re-enabled in preferences
- **WHEN** user enables an excluded connected monitor while global ring state is active
- **THEN** that monitor receives ring visuals and struts immediately

### Requirement: Monitor selection persists by connector
The extension SHALL persist disabled monitor selections by connector name. It SHALL apply a stored selection after a Shell restart or when a monitor with that connector reconnects. Disconnected monitor selections SHALL remain stored and SHALL not create ring actors.

#### Scenario: Selection survives restart
- **WHEN** user disables connector `DP-1` and restarts GNOME Shell
- **THEN** `DP-1` remains excluded when it is connected and ring state becomes active

#### Scenario: Excluded monitor disconnects and reconnects
- **WHEN** an excluded monitor disconnects and later reconnects with same connector name
- **THEN** it remains excluded after monitor layout updates

#### Scenario: New connector has no stored selection
- **WHEN** a monitor with connector name absent from stored selections is connected
- **THEN** it is selected and receives a ring when global ring state is active
