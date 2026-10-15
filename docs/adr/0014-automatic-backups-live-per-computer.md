# Automatic Backups live per computer, outside every Project, and prune themselves

The app makes a Backup of the open Project on its own, at most once a calendar day and before Trash is emptied. It writes them to a folder on this computer, set in the app's Settings (`Documents/Scaffold Backups` by default), never inside a Project, with one subfolder per Project found by the Project's id. Each Project keeps its 7 newest automatic Backups plus the newest from each of the 4 weeks before them, and older ones are deleted. Backups the Author makes are never pruned. Decided in [Make Backups automatically](https://github.com/magnusblombergsson/scaffold/issues/237).

We chose this because sync is what a Backup must survive: a Backup inside the Project's folder is synced, fills the sync quota, is backed up again inside the next Backup, and goes wherever a bad sync or a deleted folder takes the Project. Manual Back Up already refuses a location inside the Project for the same reason.

## Considered Options

- **The Project's own `backups/` folder**: every computer would see the same Backups, but they would be lost with the Project and spread any damage that sync spreads.
- **Retention as a setting, or a size cap**: more control, but one more choice the Author must understand. A fixed scheme can grow a setting later.

## Consequences

- Each computer keeps its own history. A Project that is written on two computers gets a Backup on each, and neither sees the other's.
- The format-upgrade Backup (ADR 0004) goes to the same folder, kept for good and made even when automatic Backups are off, so no Backup is ever written inside a Project. Decided in [#260](https://github.com/magnusblombergsson/scaffold/issues/260).
- Turning automatic Backups off, or a folder that isn't available, leaves a Project with no automatic Backup. The app says so and never falls back silently to another location.
- Before Empty Trash and before adding a Book from a Backup, the app says so in one of two ways. If the Backup failed (its folder isn't available, or writing it failed), it asks whether to continue without one. If the Author turned automatic Backups off, it goes ahead and tells them afterwards. Back Up, Restore and the format-upgrade Backup are unaffected. Decided in the architecture review of 2026-10-14.
