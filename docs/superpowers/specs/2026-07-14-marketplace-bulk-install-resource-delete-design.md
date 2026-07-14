# Marketplace Bulk Install And Resource Delete Design

Date: 2026-07-14

## Scope

This change adds two focused workflows:

- Install every skill shown in an expanded Marketplace official repository preview into the Skill Resource Library.
- Delete skills from the Skill Resource Library, including skills that are already installed on managed platforms.

The Marketplace bulk action keeps the current single-install meaning: it imports skills into the Skill Resource Library only. It does not directly install skills into platform directories.

## Marketplace Bulk Install

In `MarketplaceView`, the expanded official repository preview action bar will add an "Install all" button beside refresh. The button is enabled when preview loading is complete and at least one preview skill is available.

Clicking it will install the currently loaded `previewSkills` list. Each item will reuse the same backend path as single install:

- Cached marketplace skills with `id` containing `::` call `install_marketplace_skill`.
- Raw preview-only skills call `install_remote_skill_from_url`.

The UI will track a repository-level bulk installing state and add all skill names to the existing per-skill installing set while the operation runs. Individual failures will not stop the remaining installs. After completion, the page refreshes platform counts and the Skill Resource Library, then shows a summary toast with success and failure counts.

## Resource Library Delete

`ResourceLibraryView` will show a delete action on each resource skill card. If the skill has linked or read-only agent visibility, the view opens a confirmation dialog describing the affected platforms. Confirming deletion will request cascade uninstall for managed installations before removing the resource skill.

The frontend store will expose `deleteResourceSkill(skillId, { cascadeUninstall })`. Browser fixtures will remove the item locally. Desktop runtime will call a new Tauri command.

The backend will add a resource-library-specific delete command. It will:

- Load the skill and refuse central-only deletion through this command.
- Resolve the configured Skill Resource Library directory.
- Resolve the skill directory from `canonical_path` or the parent of `file_path`.
- Refuse deletion unless the resolved skill directory is inside the configured resource library.
- Refuse linked skills unless `cascadeUninstall` is true.
- For cascade deletes, uninstall managed platform installations first.
- Remove the local skill directory or symlink.
- Delete database rows for the skill, its installations, source metadata, editable metadata, and collection memberships.

Read-only agent visibility is reported to the user but is not directly removed as a platform installation.

## Data And Safety

The resource delete command will not reuse the Central Skills delete command because central deletion validates against the Central Skills root. Resource deletion must validate against the configured resource library root instead.

Path validation must canonicalize existing roots and reject paths outside the resource library. This prevents deleting arbitrary user files even if a database row has an unexpected path.

## Testing

Frontend tests will cover:

- Marketplace expanded repo preview renders the bulk install button.
- Clicking "Install all" installs every preview skill and refreshes the resource library.
- Resource Library cards expose delete.
- Deleting an installed resource skill opens a confirmation dialog and calls the store with cascade uninstall.

Backend tests will cover:

- Deleting an unlinked resource skill removes files and database rows.
- Deleting a linked resource skill without cascade is refused.
- Deleting a linked resource skill with cascade uninstalls managed platforms and removes the resource skill.
- Deletion is refused when the resolved skill path is outside the configured resource library.
