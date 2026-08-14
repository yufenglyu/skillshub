# Main Browser Layout Design

## Scope

This design covers the main skill browsing experience in SkillsHub:

- resizable left sidebar
- shared skill browser controls
- card and list display modes
- folder organization in both card and list modes
- configurable list columns

It applies to these skill browsing surfaces:

- Skill Resource Library
- Central Skills
- Software Platforms
- Project Directories

Collections and settings are out of scope for this design unless they reuse the shared browser components later.

## Goals

1. Make the sidebar usable in English without truncating common navigation labels at the default width.
2. Preserve the existing card browsing experience.
3. Add a compact list view for dense comparison, sorting, and management.
4. Keep folder browsing as an organization mode, not a separate visual layout.
5. Use one shared implementation path for all skill browser views.

## Sidebar

The expanded sidebar becomes manually resizable.

- Default expanded width: about 280 px.
- Collapsed width remains about 56 px.
- Expanded width clamp: about 240-420 px.
- A subtle drag handle sits on the right edge of the sidebar.
- The chosen width is stored in localStorage and restored on restart.
- Double-clicking the drag handle resets to the default width.
- Existing collapse behavior remains separate from resizing.
- Navigation labels keep title tooltips for narrow custom widths.

The implementation should avoid making the resize handle visually heavy. It should feel like a standard split-pane edge.

## Browser Controls

The current toolbar is split into two concepts:

### Sorting

Sorting remains in the top browser toolbar.

Fields:

- Name
- Created time
- Updated time

Clicking the active field toggles ascending and descending order. Selecting another field starts from ascending order.

### Organization

The current "All / Folders" control is renamed conceptually to organization.

Modes:

- All
- By folder

This control also stays in the top browser toolbar.

The label should read like a grouping control, not a layout control. Chinese copy can use "组织"; English copy can use "Organize".

## Display Mode

The visual display mode moves to the bottom-right status bar, similar to Windows Explorer.

Modes:

- List
- Card

The control is an icon pair in the status bar. The selected mode uses the same primary blue treatment as the sidebar selected item and other segmented controls.

Display mode is independent from organization mode:

| Organization | Display | Result |
| --- | --- | --- |
| All | Card | Existing skill cards |
| All | List | Compact skill table |
| By folder | Card | Existing folder cards |
| By folder | List | Compact folder table |

When the user opens a folder, the folder contents should use the current display mode:

- Card mode shows skill cards.
- List mode shows the skill table.

The selected display mode should persist in localStorage and apply consistently across Skill Resource Library, Central Skills, Software Platforms, and Project Directories.

## List View

List view is a compact table. It is optimized for scanning and comparison rather than rich descriptions.

Default skill columns:

- Name
- Repository / source
- Created time
- Updated time
- Installation status
- Notes
- Actions

Optional columns:

- Tags
- Rating

Rules:

- Name and Actions are always visible and cannot be hidden.
- Repository / source, time fields, installation status, tags, notes, and rating are configurable.
- The column configuration is stored in localStorage.
- Header sorting is supported for Name, Repository / source, Created time, Updated time, and Rating when available.
- Header sorting should stay synchronized with the top sorting control where the field overlaps.
- Actions reuse the existing icon actions from the current skill cards.
- Long text is truncated with a tooltip or accessible title.
- The table uses horizontal overflow only when narrow widths cannot fit the selected columns.

The first implementation should not add a rating data model unless the product already has one. Rating can remain a hidden future column.

## Folder List View

When organization is "By folder" and display is "List", folders are shown as table rows.

Default folder columns:

- Folder name
- Path
- Skill count
- Installation summary
- Updated time
- Notes summary
- Actions

Folder actions mirror the current folder card actions:

- add folder to Central Skills when applicable
- install folder to software platforms or project directories
- uninstall folder from software platforms or project directories
- delete folder where that action is available

Opening a folder changes the content area to that folder's skills, using the active display mode.

## Column Settings

Column settings are exposed as a small button near the bottom-right display mode control.

- The button is visible only in List mode.
- It opens a compact popover with checkboxes.
- Name and Actions are checked and disabled.
- Other columns can be toggled.
- The settings apply to the current browser table type. Skill columns and folder columns can be stored separately if needed.

## Shared Components

The implementation should avoid page-specific table copies.

Proposed component boundaries:

- `SkillBrowserToolbar`: top sorting and organization controls.
- `SkillDisplayModeToggle`: bottom-right List / Card control.
- `SkillColumnSettings`: list column popover.
- `SkillTableView`: compact skill table.
- `SkillFolderTableView`: compact folder table.

Existing card rendering should continue through `UnifiedSkillCard`.

## Data Flow

Each browser page already computes filtered and sorted skills or folders. The new display layer should consume those same arrays.

The page-level flow should become:

1. Load skills for the current browser surface.
2. Apply search and tag filters.
3. Apply organization mode.
4. Apply sorting.
5. Render with the selected display mode.

This keeps behavior consistent across Skill Resource Library, Central Skills, Software Platforms, and Project Directories.

## Persistence

Use localStorage for UI preferences:

- sidebar expanded width
- display mode
- organization mode, if not already persisted
- list column selection

These preferences are local UI state and should not be written to the SQLite database.

## Error Handling

If a selected column cannot be populated for a skill, show an empty muted value rather than failing the whole table.

If localStorage is unavailable, fall back to defaults without surfacing an error.

If the sidebar width value is invalid, clamp it to the supported range.

## Testing

Recommended coverage:

- Sidebar default width, persisted width, min/max clamp, and reset behavior.
- Display mode persistence and switching.
- Organization plus display combinations.
- Skill table sorting by name, repository, created time, and updated time.
- Folder table sorting and row actions.
- Column visibility persistence.
- i18n labels for Chinese and English.

Manual visual checks should include:

- English sidebar at default width.
- Narrow window with list table horizontal overflow.
- Light and dark themes.
- Skill Resource Library, Central Skills, Software Platform, and Project Directory pages.
