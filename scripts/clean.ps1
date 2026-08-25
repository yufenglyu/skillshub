# SkillsHub build artifacts cleaner (Windows PowerShell version)
#
# Usage:
#   .\scripts\clean.ps1               # dry-run: show what would be deleted, delete nothing
#   .\scripts\clean.ps1 -Run          # actually delete default targets
#   .\scripts\clean.ps1 -Run -All     # also delete target/release and node_modules
#
# Default targets (regenerable, safe to delete):
#   - src-tauri/target/debug                     dev build artifacts (usually the biggest)
#   - src-tauri/target/x86_64-pc-windows-msvc    extra rust target artifacts
#   - src-tauri/target/flycheck0                 rust-analyzer check artifacts
#   - dist                                       frontend build output
#   - node_modules/.vite                         vite dev cache
#
# Extra targets (-All):
#   - src-tauri/target/release                   release build (also removes bundle/*.msi installers)
#   - node_modules                               needs `pnpm install` afterwards
#
# Notes:
#   - After cleaning rust target dirs, the next `cargo build` / `pnpm tauri dev`
#     will do a full rebuild (takes longer, but is harmless).

param(
    [switch]$Run,
    [switch]$All
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Safety: refuse to run outside the SkillsHub repo
if (-not ((Test-Path (Join-Path $Root 'package.json')) -and (Test-Path (Join-Path $Root 'src-tauri\Cargo.toml')))) {
    Write-Host "ERROR: package.json / src-tauri/Cargo.toml not found under $Root"
    Write-Host "       This script must run inside the SkillsHub repository."
    exit 1
}

$DefaultTargets = @(
    'src-tauri\target\debug'
    'src-tauri\target\x86_64-pc-windows-msvc'
    'src-tauri\target\flycheck0'
    'dist'
    'node_modules\.vite'
)

$ExtraTargets = @(
    'src-tauri\target\release'
    'node_modules'
)

$Targets = @($DefaultTargets)
if ($All) { $Targets += $ExtraTargets }

function Get-DirSize {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    # robocopy in list-only mode is much faster than Get-ChildItem -Recurse on huge trees
    $output = robocopy $Path NULL /L /S /NJH /BYTES /NP /NFL /NDL /NC 2>$null
    $bytesLine = $output | Where-Object { $_ -match '^\s*Bytes\s*:' } | Select-Object -Last 1
    if ($bytesLine -match '^\s*Bytes\s*:\s*(\d+)') {
        return [int64]$Matches[1]
    }
    # fallback: slow but reliable
    return (Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
}

function Format-Size {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    elseif ($Bytes -ge 1MB) { return ('{0:N2} MB' -f ($Bytes / 1MB)) }
    elseif ($Bytes -ge 1KB) { return ('{0:N2} KB' -f ($Bytes / 1KB)) }
    return "$Bytes B"
}

if ($All) {
    Write-Host 'Mode: FULL clean (includes release build and node_modules)'
} else {
    Write-Host 'Mode: default clean (keeps target/release and node_modules)'
}
if (-not $Run) {
    Write-Host 'Mode: DRY-RUN (nothing will be deleted; pass -Run to execute)'
}
Write-Host "Repo: $Root"
Write-Host ('-' * 59)

$totalBytes = [long]0
$existing = @()

foreach ($rel in $Targets) {
    $abs = Join-Path $Root $rel
    if (-not (Test-Path $abs)) {
        Write-Host ("  [skip] {0,-45} (not present)" -f $rel)
        continue
    }
    $bytes = Get-DirSize $abs
    $size = Format-Size $bytes
    Write-Host ("  [   OK] {0,-45} {1}" -f $rel, $size)
    $totalBytes += $bytes
    $existing += $abs
}

Write-Host ('-' * 59)
Write-Host ("Total reclaimable: {0} across {1} path(s)" -f (Format-Size $totalBytes), $existing.Count)

if (-not $Run) {
    Write-Host ''
    Write-Host 'Dry-run only. To actually delete, run:'
    Write-Host '  .\scripts\clean.ps1 -Run          (default targets)'
    Write-Host '  .\scripts\clean.ps1 -Run -All     (also release + node_modules)'
    exit 0
}

if ($existing.Count -eq 0) {
    Write-Host 'Nothing to delete.'
    exit 0
}

Write-Host ''
Write-Host 'Deleting...'
foreach ($abs in $existing) {
    Write-Host "  Remove-Item -Recurse -Force $abs"
    Remove-Item -Recurse -Force $abs
}

Write-Host ("Done. Reclaimed about {0}." -f (Format-Size $totalBytes))
if ($All) {
    Write-Host "Reminder: run 'pnpm install' before the next dev/build."
}
