<#
.SYNOPSIS
  Extract N evenly spaced frames from a plate-anchored action video for sprite processing.

.DESCRIPTION
  Part of the external AI sprite pipeline (video-first → extract → process-awakening-strip).
  Requires ffmpeg on PATH. Saves PNGs as fNN.png under -OutDir.

.EXAMPLE
  .\scripts\extract-video-sprite-frames.ps1 `
    -Video "tmp\animation-jobs\...\external-pilot\plum-action.mp4" `
    -OutDir "tmp\animation-jobs\...\external-pilot\seq" `
    -FrameCount 18
#>
param(
  [Parameter(Mandatory = $true)][string]$Video,
  [string]$OutDir = "",
  [int]$FrameCount = 18,
  [int]$StartFrameOffset = 0
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Resolve-RepoPath([string]$p) {
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return (Join-Path $RepoRoot $p)
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
  Write-Error "ffmpeg not found on PATH. Install ffmpeg, then re-run."
}

$Video = Resolve-RepoPath $Video
if (-not (Test-Path -LiteralPath $Video)) {
  Write-Error "Video not found: $Video"
}
if ($FrameCount -lt 1) { Write-Error "-FrameCount must be >= 1" }

if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path (Split-Path -Parent $Video) 'seq'
} else {
  $OutDir = Resolve-RepoPath $OutDir
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Probe duration (seconds).
$probe = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $Video 2>$null
if (-not $probe) {
  # Fallback: ffmpeg -i stderr parse is fragile; require ffprobe when available.
  $ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
  if (-not $ffprobe) {
    Write-Error "ffprobe not found. Install a full ffmpeg build that includes ffprobe."
  }
  Write-Error "Could not read video duration."
}
$duration = [double]$probe
if ($duration -le 0.05) { Write-Error "Video duration too short: $duration s" }

Write-Host ("Video: {0}" -f $Video)
Write-Host ("Duration: {0:N3}s → extracting {1} frames" -f $duration, $FrameCount)

for ($i = 0; $i -lt $FrameCount; $i++) {
  $t = if ($FrameCount -eq 1) { 0 } else { ($duration * $i) / ($FrameCount - 1) }
  $idx = $StartFrameOffset + $i + 1
  $out = Join-Path $OutDir ("f{0:D2}.png" -f $idx)
  & ffmpeg -y -ss $t -i $Video -frames:v 1 -q:v 2 $out 2>$null
  if (-not (Test-Path -LiteralPath $out)) {
    Write-Error "Failed to extract frame $idx at t=$t"
  }
  Write-Host ("  wrote {0} @ {1:N3}s" -f $out, $t)
}

Write-Host ""
Write-Host "Next: copy plate to f01 + final idle locks, then:"
Write-Host "  .\scripts\process-awakening-strip.ps1 -SeqDir `"$OutDir`" ..."
Write-Host "  .\scripts\avatar-anim-reject-gates.ps1 -CandidateDir `"$OutDir`" ..."
