<#
.SYNOPSIS
  Split the last cell of a multi-cell action atlas into a standalone bridge PNG.

.DESCRIPTION
  Formalizes the Animation Creator bridge workflow: next sheet refs must be
  [production plate, last cell alone] - never the whole prior atlas.

.EXAMPLE
  .\scripts\split-action-sheet-bridge.ps1 `
    -Sheet "tmp\animation-jobs\...\oneshot-bridged\sheet-A.png" `
    -Cells 6 `
    -Out "tmp\animation-jobs\...\oneshot-bridged\bridge-after-A.png"
#>
param(
  [Parameter(Mandatory = $true)][string]$Sheet,
  [string]$Out = "",
  [int]$Cells = 6,
  [ValidateSet('horizontal', 'grid')][string]$Layout = 'horizontal',
  [int]$GridCols = 0,
  [int]$GridRows = 0
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Resolve-RepoPath([string]$p) {
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return (Join-Path $RepoRoot $p)
}

$Sheet = Resolve-RepoPath $Sheet
if (-not (Test-Path -LiteralPath $Sheet)) {
  Write-Error "Sheet not found: $Sheet"
}
if ($Cells -lt 2) { Write-Error '-Cells must be >= 2' }

if ([string]::IsNullOrWhiteSpace($Out)) {
  $dir = Split-Path -Parent $Sheet
  $base = [System.IO.Path]::GetFileNameWithoutExtension($Sheet)
  $Out = Join-Path $dir ("bridge-after-{0}.png" -f $base)
} else {
  $Out = Resolve-RepoPath $Out
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::new($Sheet)
try {
  if ($Layout -eq 'grid') {
    if ($GridCols -lt 1 -or $GridRows -lt 1) {
      $GridCols = [int][Math]::Ceiling([Math]::Sqrt($Cells))
      $GridRows = [int][Math]::Ceiling($Cells / [double]$GridCols)
    }
    $cellW = [int]($src.Width / $GridCols)
    $cellH = [int]($src.Height / $GridRows)
    $last = ($GridCols * $GridRows) - 1
    $col = $last % $GridCols
    $row = [int][Math]::Floor($last / $GridCols)
    $rect = [System.Drawing.Rectangle]::new($col * $cellW, $row * $cellH, $cellW, $cellH)
  } else {
    $cellW = [int]($src.Width / $Cells)
    $cellH = $src.Height
    if ($cellW -lt 8 -or $cellH -lt 8) {
      Write-Error 'Cell size too small - check -Cells vs sheet width.'
    }
    $rect = [System.Drawing.Rectangle]::new(($Cells - 1) * $cellW, 0, $cellW, $cellH)
  }

  $cell = $src.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $cell.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $cell.Dispose()
  }
} finally {
  $src.Dispose()
}

Write-Host ('Bridge cell written: {0}' -f $Out)
Write-Host ('Next sheet reference_image_paths = [production plate, {0}]' -f $Out)
