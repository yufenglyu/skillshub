# Managed Platform Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Platform pages, counts, installation state, uninstall, and backup only treat skills explicitly installed or imported through SkillsHub as manageable.

**Architecture:** Add an `is_managed` ownership marker to `skill_installations`. Application install paths set it to true, filesystem scans insert external observations as false while preserving existing ownership, and all management queries filter to true. Existing rows are migrated conservatively using central/resource-library evidence without touching platform files.

**Tech Stack:** Rust, SQLx, SQLite, Tauri v2, existing Rust unit/integration tests.

## Global Constraints

- Never delete or modify skills installed independently by Codex or another platform.
- Keep Codex global skills at `~/.codex/skills` and Central Skills at `~/.agents/skills`.
- Existing Central and Resource Library installations must remain manageable.
- Follow TDD: each production change follows a regression test that fails for the expected reason.

---

### Task 1: Persist installation ownership

**Files:**
- Modify: `src-tauri/src/db.rs`
- Test: `src-tauri/src/db.rs`

**Interfaces:**
- Produces: `upsert_scanned_skill_installation(pool, installation)` for scanner-only unmanaged observations.
- Produces: `count_managed_skill_installations(pool, agent_id)` for sidebar scan counts.
- Changes: `upsert_skill_installation` always writes `is_managed = 1`.

- [ ] **Step 1: Write migration and ownership tests**

Add tests proving a scanned installation is excluded from managed queries, an application upsert upgrades the same row to managed, and re-scanning preserves managed ownership.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml managed_installation -- --nocapture`

Expected: FAIL because `is_managed` and `upsert_scanned_skill_installation` do not exist.

- [ ] **Step 3: Add schema and migration**

Add `is_managed BOOLEAN NOT NULL DEFAULT 0` to new tables and an idempotent `ensure_column` migration. After adding the column, conservatively mark old rows managed only when their skill is central or has a canonical resource path:

```sql
UPDATE skill_installations
SET is_managed = 1
WHERE EXISTS (
  SELECT 1 FROM skills s
  WHERE s.id = skill_installations.skill_id
    AND (s.is_central = 1 OR s.canonical_path IS NOT NULL)
)
```

- [ ] **Step 4: Split application and scanner upserts**

`upsert_skill_installation` inserts/updates `is_managed = 1`. `upsert_scanned_skill_installation` inserts `is_managed = 0` and omits ownership from its conflict update so an existing managed row remains managed.

- [ ] **Step 5: Filter management queries**

Add `is_managed = 1` to `get_skill_installations`, `get_skills_by_agent`, and `get_skills_for_agent`; add a scalar count query for managed rows by agent.

- [ ] **Step 6: Run focused DB tests and verify GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml managed_installation -- --nocapture`

Expected: all matching tests pass.

### Task 2: Keep scanner observations unmanaged

**Files:**
- Modify: `src-tauri/src/commands/scanner.rs`
- Test: `src-tauri/src/commands/scanner.rs`

**Interfaces:**
- Consumes: `db::upsert_scanned_skill_installation`.
- Consumes: `db::count_managed_skill_installations`.

- [ ] **Step 1: Write Codex external-skill regression test**

Create a temporary Codex directory containing an ordinary real skill directory, scan it, and assert `db::get_skills_for_agent(..., "codex")` is empty and the reported Codex count is zero.

- [ ] **Step 2: Run the scanner test and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml codex_external_skill_is_not_manageable -- --nocapture`

Expected: FAIL because the scanner currently creates a normal installation row and reports count one.

- [ ] **Step 3: Use scanner-only upsert and managed counts**

Replace the scanner call to `upsert_skill_installation` with `upsert_scanned_skill_installation`. After reconciliation, populate `skills_by_agent` from `count_managed_skill_installations` instead of raw directory scan length; retain raw `total_skills` only as scan diagnostics.

- [ ] **Step 4: Verify scanner behavior GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml codex_external_skill_is_not_manageable -- --nocapture`

Expected: PASS, with external files still present on disk.

### Task 3: Verify all install paths and regressions

**Files:**
- Modify if required: `src-tauri/src/commands/linker.rs`
- Modify if required: `src-tauri/src/commands/discover.rs`
- Modify if required: `src-tauri/src/commands/backup.rs`
- Test: corresponding Rust test modules.

**Interfaces:**
- Consumes: application `db::upsert_skill_installation`, which marks records managed.

- [ ] **Step 1: Add an install-then-rescan test**

Install a Resource Library skill to Codex through `install_skill_to_agent_impl`, run the scanner, and assert the skill remains returned by `get_skills_for_agent` and remains counted once.

- [ ] **Step 2: Run the test and verify RED or existing coverage**

Run the exact new test filter and confirm it fails before any necessary production adjustment; if it already passes solely from Tasks 1-2, retain it as regression coverage and make no extra production change.

- [ ] **Step 3: Audit all application installation writers**

Confirm linker, Discover import, collection install, and backup replay call `upsert_skill_installation` rather than the scanner-only function. Change only incorrect scanner-like callers.

- [ ] **Step 4: Run complete verification**

Run serially:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
$env:CI='true'; pnpm build
git diff --check
```

Expected: zero test failures, zero Clippy warnings, successful frontend build, and no whitespace errors.
