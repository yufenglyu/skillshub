param(
  [string]$Version,
  [ValidateSet("auto", "windows", "macos", "linux")]
  [string]$Platform = "auto",
  [string]$OutputDir = "release-assets",
  [switch]$SkipTests,
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$VersionOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..")).Path
}

function Run {
  param([string]$Command, [string[]]$Arguments)
  Write-Host ">> $Command $($Arguments -join ' ')" -ForegroundColor Cyan
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $Command $($Arguments -join ' ')"
  }
}

function Local-Bin {
  param([string]$Root, [string]$Name)
  $suffix = if (Test-IsWindows) { ".cmd" } else { "" }
  return Join-Path $Root "node_modules/.bin/$Name$suffix"
}

function Read-JsonFile {
  param([string]$Path)
  return (Read-TextFile $Path) | ConvertFrom-Json
}

function Read-TextFile {
  param([string]$Path)
  return [System.IO.File]::ReadAllText((Resolve-Path $Path).Path, [System.Text.Encoding]::UTF8)
}

function Write-TextFile {
  param([string]$Path, [string]$Value)
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText((Resolve-Path $Path).Path, $Value, $utf8NoBom)
}

function Replace-Text {
  param([string]$Path, [string]$Pattern, [string]$Replacement)
  $content = Read-TextFile $Path
  if (-not [regex]::IsMatch($content, $Pattern)) {
    throw "Pattern not found in $Path`: $Pattern"
  }
  $updated = [regex]::Replace($content, $Pattern, $Replacement)
  if ($updated -ne $content) {
    Write-TextFile $Path $updated
  }
}

function Normalize-Version {
  param([string]$InputVersion)
  $normalized = $InputVersion.Trim() -replace '^v', ''
  if ($normalized -notmatch '^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$') {
    throw "Version must look like SemVer, for example 0.10.1 or v0.10.1. Got: $InputVersion"
  }
  return $normalized
}

function Detect-Platform {
  if ($Platform -ne "auto") {
    return $Platform
  }
  if (Test-IsWindows) { return "windows" }
  if (Test-IsMacOS) { return "macos" }
  if (Test-IsLinux) { return "linux" }
  throw "Unsupported OS. Pass -Platform windows|macos|linux explicitly."
}

function Test-IsWindows {
  $var = Get-Variable -Name IsWindows -ErrorAction SilentlyContinue
  if ($null -ne $var) { return [bool]$var.Value }
  return $env:OS -eq "Windows_NT"
}

function Test-IsMacOS {
  $var = Get-Variable -Name IsMacOS -ErrorAction SilentlyContinue
  if ($null -ne $var) { return [bool]$var.Value }
  return $false
}

function Test-IsLinux {
  $var = Get-Variable -Name IsLinux -ErrorAction SilentlyContinue
  if ($null -ne $var) { return [bool]$var.Value }
  return -not (Test-IsWindows)
}

function Assert-Compatible-AppIdentity {
  param([string]$Root)
  $tauriPath = Join-Path $Root "src-tauri/tauri.conf.json"
  $tauri = Read-JsonFile $tauriPath

  if ($tauri.identifier -ne "com.iamzhihuix.skillsmanage") {
    throw "Refusing to package: Tauri identifier changed. Keeping com.iamzhihuix.skillsmanage preserves existing app data."
  }
  if ($tauri.productName -ne "SkillsHub") {
    throw "Refusing to package: productName must remain SkillsHub. Keep the identifier and upgrade code stable for older installs."
  }
  if ($tauri.bundle.windows.wix.upgradeCode -ne "28d41c68-f4a4-5134-b959-34babea58f7f") {
    throw "Refusing to package: Windows Wix upgradeCode changed. Keeping it preserves MSI upgrades from older versions."
  }

  $pathUtils = Read-TextFile (Join-Path $Root "src-tauri/src/path_utils.rs")
  $lib = Read-TextFile (Join-Path $Root "src-tauri/src/lib.rs")
  if ($pathUtils -notmatch 'join\("\.skillsmanage"\)' -or $lib -notmatch 'db\.sqlite') {
    throw "Refusing to package: app data location changed. Keep ~/.skillsmanage/db.sqlite for old configuration compatibility."
  }
}

function Update-VersionFiles {
  param([string]$Root, [string]$NextVersion)

  Replace-Text `
    -Path (Join-Path $Root "package.json") `
    -Pattern '("version"\s*:\s*)"[^"]+"' `
    -Replacement "`${1}`"$NextVersion`""

  Replace-Text `
    -Path (Join-Path $Root "src-tauri/tauri.conf.json") `
    -Pattern '("version"\s*:\s*)"[^"]+"' `
    -Replacement "`${1}`"$NextVersion`""

  Replace-Text `
    -Path (Join-Path $Root "src-tauri/Cargo.toml") `
    -Pattern '(?ms)(\[package\]\s+name = "skillshub"\s+)version = "[^"]+"' `
    -Replacement "`${1}version = `"$NextVersion`""

  Replace-Text `
    -Path (Join-Path $Root "src/pages/SettingsView.tsx") `
    -Pattern 'const APP_VERSION = "[^"]+";' `
    -Replacement "const APP_VERSION = `"$NextVersion`";"

  $metainfoPath = Join-Path $Root "src-tauri/bundle/linux/com.iamzhihuix.skillsmanage.metainfo.xml"
  $metainfo = Read-TextFile $metainfoPath
  if ($metainfo -notmatch "<release version=`"$([regex]::Escape($NextVersion))`"") {
    $today = Get-Date -Format "yyyy-MM-dd"
    $releaseLine = "    <release version=`"$NextVersion`" date=`"$today`"/>"
    $metainfo = $metainfo -replace "(\s*<releases>\s*)", "`$1$releaseLine`n"
    Write-TextFile $metainfoPath $metainfo
  }

  $notesDir = Join-Path $Root "release-notes"
  New-Item -ItemType Directory -Force -Path $notesDir | Out-Null
  $notesPath = Join-Path $notesDir "$NextVersion.md"
  if (-not (Test-Path $notesPath)) {
    $today = Get-Date -Format "yyyy-MM-dd"
    $notesLines = @(
      "## $NextVersion - $today",
      "",
      "Maintenance release focused on local packaging, version consistency, and preserving existing user configuration.",
      "",
      "### Improvements",
      "",
      "- Add a local release packaging script that produces assets matching the upstream GitHub Release naming pattern.",
      "- Keep application identity, Windows MSI upgrade code, and local database location stable for upgrades from older versions.",
      "",
      "### Fixes",
      "",
      '- Preserve compatibility with existing `~/.skillsmanage/db.sqlite` data and existing MSI upgrade paths.',
      "",
      "---",
      "",
      "## $NextVersion - $today (Chinese notes)",
      "",
      "Fill in localized release notes before publishing the GitHub Release."
    )
    $notes = $notesLines -join [Environment]::NewLine
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($notesPath, $notes, $utf8NoBom)
  }
}

function Ensure-Dependencies {
  param([string]$Root)
  if ($SkipInstall) { return }
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Run "pnpm" @("install", "--frozen-lockfile")
  }
}

function Run-Checks {
  param([string]$Root)
  if ($SkipTests) { return }

  $tscCmd = Local-Bin $Root "tsc"
  if (Test-Path $tscCmd) {
    Run $tscCmd @("--noEmit")
  } else {
    Run "pnpm" @("typecheck")
  }
  Run "cargo" @("test", "--manifest-path", (Join-Path $Root "src-tauri/Cargo.toml"), "--no-run", "--message-format", "short", "-q")
}

function Build-Frontend {
  param([string]$Root)
  $viteCmd = Local-Bin $Root "vite"
  if (-not (Test-Path $viteCmd)) {
    throw "Vite executable not found at $viteCmd. Run pnpm install first."
  }
  Run $viteCmd @("build")
}

function Build-App {
  param([string]$Root, [string]$TargetPlatform)
  if ($SkipBuild) { return }

  Build-Frontend -Root $Root

  $tauriCmd = Local-Bin $Root "tauri"
  if (-not (Test-Path $tauriCmd)) {
    throw "Tauri CLI executable not found at $tauriCmd. Run pnpm install first."
  }

  $skipBeforeBuildPath = Join-Path ([System.IO.Path]::GetTempPath()) "skillshub-tauri-build-$PID.json"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($skipBeforeBuildPath, '{"build":{"beforeBuildCommand":""}}', $utf8NoBom)
  try {
    switch ($TargetPlatform) {
      "windows" {
        Run $tauriCmd @("build", "--target", "x86_64-pc-windows-msvc", "--bundles", "msi", "--no-sign", "--ci", "--config", $skipBeforeBuildPath)
      }
      "macos" {
        Run $tauriCmd @("build", "--target", "universal-apple-darwin", "--bundles", "app,dmg", "--no-sign", "--ci", "--config", $skipBeforeBuildPath)
      }
      "linux" {
        Run $tauriCmd @("build", "--bundles", "deb,rpm,appimage", "--no-sign", "--ci", "--config", $skipBeforeBuildPath)
      }
    }
  } finally {
    Remove-Item -LiteralPath $skipBeforeBuildPath -Force -ErrorAction SilentlyContinue
  }
}

function Copy-WindowsAssets {
  param([string]$Root, [string]$NextVersion, [string]$OutDir)
  $targetRoot = Join-Path $Root "src-tauri/target/x86_64-pc-windows-msvc/release"
  if (-not (Test-Path $targetRoot)) {
    $targetRoot = Join-Path $Root "src-tauri/target/release"
  }
  $msi = Get-ChildItem -Path (Join-Path $targetRoot "bundle/msi") -Recurse -Filter *.msi -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $msi) { throw "Windows MSI bundle not found under $targetRoot." }
  Copy-Item $msi.FullName (Join-Path $OutDir "skillshub_${NextVersion}_windows_x64.msi") -Force

  $exe = Join-Path $targetRoot "skillshub.exe"
  if (-not (Test-Path $exe)) { throw "Windows executable not found at $exe." }
  Compress-Archive -Path $exe -DestinationPath (Join-Path $OutDir "skillshub_${NextVersion}_windows_x64.zip") -Force
}

function Copy-MacosAssets {
  param([string]$Root, [string]$NextVersion, [string]$OutDir)
  $bundleRoot = Join-Path $Root "src-tauri/target/universal-apple-darwin/release/bundle"
  $app = Get-ChildItem -Path (Join-Path $bundleRoot "macos") -Directory -Filter *.app -ErrorAction SilentlyContinue | Select-Object -First 1
  $dmg = Get-ChildItem -Path (Join-Path $bundleRoot "dmg") -File -Filter *.dmg -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $app) { throw "macOS .app bundle not found under $bundleRoot." }
  if ($null -eq $dmg) { throw "macOS .dmg bundle not found under $bundleRoot." }

  Copy-Item $dmg.FullName (Join-Path $OutDir "skillshub_${NextVersion}_macos_universal.dmg") -Force
  Run "ditto" @("-c", "-k", "--keepParent", $app.FullName, (Join-Path $OutDir "skillshub_${NextVersion}_macos_universal.zip"))
  Run "tar" @("-C", $app.Parent.FullName, "-czf", (Join-Path $OutDir "skillshub_${NextVersion}_macos_universal.tar.gz"), $app.Name)
}

function Copy-LinuxAssets {
  param([string]$Root, [string]$NextVersion, [string]$OutDir)
  $bundleRoot = Join-Path $Root "src-tauri/target/release/bundle"
  $arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq [System.Runtime.InteropServices.Architecture]::Arm64) { "arm64" } else { "x86_64" }
  $deb = Get-ChildItem -Path (Join-Path $bundleRoot "deb") -File -Filter *.deb -ErrorAction SilentlyContinue | Select-Object -First 1
  $rpm = Get-ChildItem -Path (Join-Path $bundleRoot "rpm") -File -Filter *.rpm -ErrorAction SilentlyContinue | Select-Object -First 1
  $appImage = Get-ChildItem -Path (Join-Path $bundleRoot "appimage") -File -Filter *.AppImage -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $deb) { throw "Linux .deb bundle not found under $bundleRoot." }
  if ($null -eq $rpm) { throw "Linux .rpm bundle not found under $bundleRoot." }
  if ($null -eq $appImage) { throw "Linux .AppImage bundle not found under $bundleRoot." }

  Copy-Item $deb.FullName (Join-Path $OutDir "skillshub-v${NextVersion}-Linux-${arch}.deb") -Force
  Copy-Item $rpm.FullName (Join-Path $OutDir "skillshub-v${NextVersion}-Linux-${arch}.rpm") -Force
  Copy-Item $appImage.FullName (Join-Path $OutDir "skillshub-v${NextVersion}-Linux-${arch}.AppImage") -Force
}

$root = RepoRoot
Set-Location $root

$package = Read-JsonFile (Join-Path $root "package.json")
$nextVersion = if ($Version) { Normalize-Version $Version } else { Normalize-Version $package.version }

Update-VersionFiles -Root $root -NextVersion $nextVersion
Assert-Compatible-AppIdentity -Root $root

if ($VersionOnly) {
  Write-Host "Version files updated to $nextVersion. Packaging skipped because -VersionOnly was set." -ForegroundColor Green
  exit 0
}

$targetPlatform = Detect-Platform
$outPath = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

Ensure-Dependencies -Root $root
Run-Checks -Root $root
Build-App -Root $root -TargetPlatform $targetPlatform

switch ($targetPlatform) {
  "windows" { Copy-WindowsAssets -Root $root -NextVersion $nextVersion -OutDir $outPath }
  "macos" { Copy-MacosAssets -Root $root -NextVersion $nextVersion -OutDir $outPath }
  "linux" { Copy-LinuxAssets -Root $root -NextVersion $nextVersion -OutDir $outPath }
}

Write-Host "Packaged $targetPlatform assets in $outPath" -ForegroundColor Green
