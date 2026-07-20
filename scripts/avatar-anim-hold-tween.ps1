<#
.SYNOPSIS
  Hold-tween: copy an accepted action body and overlay procedural petals only.

.DESCRIPTION
  Fills in-between action frames without AI body redraw (GenerateImage-only pipeline).
  Opaque pixels from -From stay locked; only sparse petals animate.
#>
param(
  [Parameter(Mandatory = $true)][string]$From,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string[]]$Frames = @(),
  [int]$PetalCount = 6
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Resolve-RepoPath([string]$p) {
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return (Join-Path $RepoRoot $p)
}

$From = Resolve-RepoPath $From
$OutDir = Resolve-RepoPath $OutDir
if (-not (Test-Path -LiteralPath $From)) { Write-Error "From not found: $From" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Normalize -Frames: accept "10,11,12" or separate ints
$frameNums = @()
foreach ($f in $Frames) {
  foreach ($part in ("$f" -split '[, ]+')) {
    if ($part -match '^\d+$') { $frameNums += [int]$part }
  }
}
if ($frameNums.Count -eq 0) { Write-Error 'No frame numbers in -Frames' }

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class HoldTween
{
    static readonly Color[] PetalPalette = new Color[] {
        Color.FromArgb(255, 255, 140, 180),
        Color.FromArgb(255, 240, 120, 170),
        Color.FromArgb(255, 255, 170, 200),
        Color.FromArgb(255, 230, 100, 150)
    };

    static void DrawPetal(Bitmap bmp, float cx, float cy, float rx, float ry, Color color, float angleDeg)
    {
        var rad = angleDeg * Math.PI / 180.0;
        var cos = Math.Cos(rad);
        var sin = Math.Sin(rad);
        var x0 = (int)Math.Floor(cx - rx - 1);
        var x1 = (int)Math.Ceiling(cx + rx + 1);
        var y0 = (int)Math.Floor(cy - ry - 1);
        var y1 = (int)Math.Ceiling(cy + ry + 1);
        for (var y = Math.Max(0, y0); y <= Math.Min(255, y1); y++)
        {
            for (var x = Math.Max(0, x0); x <= Math.Min(255, x1); x++)
            {
                var dx = x - cx;
                var dy = y - cy;
                var lx = dx * cos + dy * sin;
                var ly = -dx * sin + dy * cos;
                var nx = lx / Math.Max(0.5, rx);
                var ny = ly / Math.Max(0.5, ry);
                if (nx * nx + ny * ny > 1.0) continue;
                var d = Math.Sqrt(nx * nx + ny * ny);
                var a = d > 0.75 ? (int)(color.A * (1.0 - (d - 0.75) / 0.25)) : color.A;
                if (a < 8) continue;
                var existing = bmp.GetPixel(x, y);
                if (existing.A >= 200) continue;
                bmp.SetPixel(x, y, Color.FromArgb(Math.Min(255, a), color.R, color.G, color.B));
            }
        }
    }

    public static void Write(string fromPath, string outPath, int frameIndex, int petalCount)
    {
        using (var src = new Bitmap(fromPath))
        using (var composite = new Bitmap(src))
        {
            var phase = (frameIndex % 12) / 12.0;
            var twopi = Math.PI * 2.0;
            for (var i = 0; i < petalCount; i++)
            {
                var baseAngle = twopi * i / petalCount;
                var orbit = baseAngle + phase * twopi * 0.5;
                var radius = 82 + (i % 3) * 8;
                var cx = 128f + (float)(Math.Cos(orbit) * radius * 0.55);
                var cy = 108f + (float)(Math.Sin(orbit) * radius * 0.32);
                if (cx > 95 && cx < 160 && cy > 70 && cy < 200)
                    cx += cx < 128 ? -20 : 20;
                DrawPetal(composite, cx, cy, 3.2f + (i % 2), 2.0f, PetalPalette[i % PetalPalette.Length], (float)(orbit * 180 / Math.PI));
            }
            // Restore opaque body from source so petals never eat wardrobe
            for (var y = 0; y < 256; y++)
            {
                for (var x = 0; x < 256; x++)
                {
                    var sc = src.GetPixel(x, y);
                    if (sc.A >= 200) composite.SetPixel(x, y, sc);
                }
            }
            composite.Save(outPath, ImageFormat.Png);
        }
    }
}
'@

foreach ($n in $frameNums) {
  $name = 'f{0:D2}' -f $n
  $out = Join-Path $OutDir "$name.png"
  [HoldTween]::Write($From, $out, $n, $PetalCount)
  Write-Host "Hold-tween wrote $name from $(Split-Path -Leaf $From)"
}
