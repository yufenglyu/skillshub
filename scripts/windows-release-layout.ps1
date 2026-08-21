Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-PreparePackagedConfig {
  param([string]$Root)
  $dest = Join-Path $Root "src-tauri/resources/packaged-config"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $manifest = Join-Path $Root "src-tauri/Cargo.toml"
  Write-Host ">> cargo run --manifest-path $manifest --bin prepare-config-dir --release -- $dest" -ForegroundColor Cyan
  & cargo run --manifest-path $manifest --bin prepare-config-dir --release -- $dest
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to prepare default .skillshub config directory"
  }
}

function New-SkillshubPortableZip {
  param(
    [string]$ExePath,
    [string]$ConfigDir,
    [string]$ZipPath
  )
  if (-not (Test-Path $ExePath)) {
    throw "Windows executable not found at $ExePath"
  }
  if (-not (Test-Path (Join-Path $ConfigDir "platform"))) {
    throw "Packaged config directory not found at $ConfigDir. Run prepare-config-dir first."
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("skillshub-portable-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  try {
    Copy-Item $ExePath (Join-Path $stage "skillshub.exe") -Force
    Copy-Item $ConfigDir (Join-Path $stage ".skillshub") -Recurse -Force
    $keep = Join-Path $stage ".skillshub/.gitkeep"
    if (Test-Path $keep) {
      Remove-Item $keep -Force
    }
    if (Test-Path $ZipPath) {
      Remove-Item $ZipPath -Force
    }
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
      $stage,
      $ZipPath,
      [System.IO.Compression.CompressionLevel]::Optimal,
      $false
    )
  } finally {
    Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
}
