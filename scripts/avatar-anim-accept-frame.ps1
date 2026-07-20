<#
.SYNOPSIS
  Mandatory GenerateImage accept loop: register + locked-region paste + reject gates.

.DESCRIPTION
  After each Cursor GenerateImage action frame:
    1. Letterbox / chroma-key / plate-register
    2. Paste plate head/sash/shoes/embroidery over the AI frame
    3. Score reject gates (exit 1 on FAIL unless -WarnOnly)
  On PASS, copies the pasted frame to -AcceptedPath for use as the next soft-ref.

.EXAMPLE
  .\scripts\avatar-anim-accept-frame.ps1 `
    -Raw "tmp\...\gi-pilot\raw\f07.png" `
    -Plate "public\avatar-characters\style-a\plum-blossom-blade.png" `
    -AcceptedPath "tmp\...\gi-pilot\seq\f07.png" `
    -WorkDir "tmp\...\gi-pilot\accept\f07"
#>
param(
  [Parameter(Mandatory = $true)][string]$Raw,
  [string]$Plate = "public\avatar-characters\style-a\plum-blossom-blade.png",
  [Parameter(Mandatory = $true)][string]$AcceptedPath,
  [string]$WorkDir = "",
  [switch]$WarnOnly,
  [switch]$SkipGates
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Resolve-RepoPath([string]$p) {
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return (Join-Path $RepoRoot $p)
}

$Raw = Resolve-RepoPath $Raw
$Plate = Resolve-RepoPath $Plate
$AcceptedPath = Resolve-RepoPath $AcceptedPath
if (-not (Test-Path -LiteralPath $Raw)) { Write-Error "Raw frame not found: $Raw" }
if (-not (Test-Path -LiteralPath $Plate)) { Write-Error "Plate not found: $Plate" }

if ([string]::IsNullOrWhiteSpace($WorkDir)) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($AcceptedPath)
  $WorkDir = Join-Path (Split-Path -Parent $AcceptedPath) ("..\accept\{0}" -f $base)
}
$WorkDir = Resolve-RepoPath $WorkDir
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $AcceptedPath) | Out-Null

$pasteOut = Join-Path $WorkDir 'pasted'
New-Item -ItemType Directory -Force -Path $pasteOut | Out-Null

$frameLabel = [System.IO.Path]::GetFileNameWithoutExtension($AcceptedPath)
$pasteSeq = Join-Path $WorkDir 'raw-seq'
New-Item -ItemType Directory -Force -Path $pasteSeq | Out-Null
$rawCopy = Join-Path $pasteSeq ("{0}.png" -f $frameLabel)
Copy-Item -LiteralPath $Raw -Destination $rawCopy -Force

Write-Host '=== accept-frame: register + paste ==='
& (Join-Path $PSScriptRoot 'avatar-anim-locked-region-paste.ps1') `
  -PlatePath $Plate `
  -SeqDir $pasteSeq `
  -OutDir $pasteOut `
  -Frames @($frameLabel)

$pasted = Join-Path $pasteOut ("{0}-pasted.png" -f $frameLabel)
if (-not (Test-Path -LiteralPath $pasted)) {
  Write-Error "Paste step did not produce: $pasted"
}

$gatesOut = Join-Path $WorkDir 'gates'
if (-not $SkipGates) {
  Write-Host '=== accept-frame: reject gates ==='
  if ($WarnOnly) {
    & (Join-Path $PSScriptRoot 'avatar-anim-reject-gates.ps1') `
      -Plate $Plate `
      -Candidates @($pasted) `
      -OutDir $gatesOut `
      -SkipNormalize `
      -WarnOnly
  } else {
    & (Join-Path $PSScriptRoot 'avatar-anim-reject-gates.ps1') `
      -Plate $Plate `
      -Candidates @($pasted) `
      -OutDir $gatesOut `
      -SkipNormalize
    if ($LASTEXITCODE -ne 0) {
      Write-Host ('REJECT: gates failed for {0} - regenerate GenerateImage before continuing.' -f $frameLabel) -ForegroundColor Red
      exit 1
    }
  }
}

Copy-Item -LiteralPath $pasted -Destination $AcceptedPath -Force
Write-Host ('ACCEPTED -> {0}' -f $AcceptedPath) -ForegroundColor Green
Write-Host 'Next GenerateImage reference_image_paths = [plate, accepted frame]'
exit 0
