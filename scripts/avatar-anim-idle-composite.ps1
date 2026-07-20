<#
.SYNOPSIS
  Plate-locked idle/return composites for GenerateImage-only Awakenings.

.DESCRIPTION
  Builds f01-f06 (idle) and optional f25/f26 (return) without AI body redraws.
  Starts from the production plate every cell; only sparse petal/aura chips move.
  Opaque plate pixels are never modified (Method 1 identity lock).

.EXAMPLE
  .\scripts\avatar-anim-idle-composite.ps1 `
    -Plate "public\avatar-characters\style-a\plum-blossom-blade.png" `
    -OutDir "tmp\animation-jobs\...\gi-pilot\seq" `
    -IdleCount 6 -ReturnCount 2 -TotalFrames 26
#>
param(
  [string]$Plate = "public\avatar-characters\style-a\plum-blossom-blade.png",
  [string]$OutDir = "tmp\animation-jobs\anim_avatar_plum_blossom_blade_26f\gi-pilot\seq",
  [int]$IdleCount = 6,
  [int]$ReturnCount = 2,
  [int]$TotalFrames = 26,
  [int]$PetalCount = 5,
  [switch]$SkipReturn
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Resolve-RepoPath([string]$p) {
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return (Join-Path $RepoRoot $p)
}

$Plate = Resolve-RepoPath $Plate
$OutDir = Resolve-RepoPath $OutDir
if (-not (Test-Path -LiteralPath $Plate)) { Write-Error "Plate not found: $Plate" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class IdleCompositeBuilder
{
    static readonly Color[] PetalPalette = new Color[] {
        Color.FromArgb(255, 255, 140, 180),
        Color.FromArgb(255, 240, 120, 170),
        Color.FromArgb(255, 255, 170, 200),
        Color.FromArgb(255, 230, 100, 150),
        Color.FromArgb(255, 250, 150, 190)
    };

    static void RestoreOpaquePlate(Bitmap composite, Bitmap plate)
    {
        for (var y = 0; y < 256; y++)
        {
            for (var x = 0; x < 256; x++)
            {
                var pc = plate.GetPixel(x, y);
                if (pc.A >= 200)
                    composite.SetPixel(x, y, pc);
            }
        }
    }

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
                // Soft edge
                var d = Math.Sqrt(nx * nx + ny * ny);
                var a = d > 0.75 ? (int)(color.A * (1.0 - (d - 0.75) / 0.25)) : color.A;
                if (a < 8) continue;
                var existing = bmp.GetPixel(x, y);
                if (existing.A >= 200) continue; // never paint over plate body
                bmp.SetPixel(x, y, Color.FromArgb(Math.Min(255, a), color.R, color.G, color.B));
            }
        }
    }

    /// phase 0..1 within idle loop. Seed offsets petals deterministically.
    public static void WriteIdleFrame(string platePath, string outPath, int frameIndex, int idleCount, int petalCount)
    {
        using (var plate = new Bitmap(platePath))
        using (var composite = new Bitmap(plate))
        {
            var phase = idleCount <= 1 ? 0.0 : (frameIndex - 1) / (double)(idleCount);
            var twopi = Math.PI * 2.0;
            for (var i = 0; i < petalCount; i++)
            {
                var baseAngle = twopi * i / petalCount;
                var orbit = baseAngle + phase * twopi * 0.35;
                var radius = 78 + (i % 3) * 10;
                var cx = 128f + (float)(Math.Cos(orbit) * radius * 0.55);
                var cy = 110f + (float)(Math.Sin(orbit) * radius * 0.35) + (float)(Math.Sin(phase * twopi + i) * 2.0);
                // Keep petals around figure, not over core torso when possible
                if (cx > 95 && cx < 160 && cy > 70 && cy < 200)
                {
                    cx += cx < 128 ? -18 : 18;
                }
                var rx = 3.2f + (i % 2);
                var ry = 2.0f + (i % 3) * 0.4f;
                var ang = (float)(orbit * 180.0 / Math.PI + phase * 40);
                DrawPetal(composite, cx, cy, rx, ry, PetalPalette[i % PetalPalette.Length], ang);
            }
            RestoreOpaquePlate(composite, plate);
            composite.Save(outPath, ImageFormat.Png);
        }
    }

    public static void WriteExactPlate(string platePath, string outPath)
    {
        using (var plate = new Bitmap(platePath))
            plate.Save(outPath, ImageFormat.Png);
    }

    /// Return ease: fewer/closer petals than mid-idle, then exact plate for last.
    public static void WriteReturnFrame(string platePath, string outPath, int returnLocal, int returnCount, int petalCount)
    {
        if (returnLocal >= returnCount)
        {
            WriteExactPlate(platePath, outPath);
            return;
        }
        // First return frame: calmed petals (phase near 0, fewer petals)
        var calmed = Math.Max(2, petalCount - 2);
        WriteIdleFrame(platePath, outPath, 1, Math.Max(2, returnCount), calmed);
    }
}
'@

Write-Host "Plate: $Plate"
Write-Host "Out:   $OutDir"

# Idle f01..fIdleCount
for ($i = 1; $i -le $IdleCount; $i++) {
  $name = 'f{0:D2}' -f $i
  $out = Join-Path $OutDir "$name.png"
  if ($i -eq 1) {
    [IdleCompositeBuilder]::WriteExactPlate($Plate, $out)
  } else {
    [IdleCompositeBuilder]::WriteIdleFrame($Plate, $out, $i, $IdleCount, $PetalCount)
  }
  Write-Host "Wrote idle $name"
}

if (-not $SkipReturn) {
  $returnStart = $TotalFrames - $ReturnCount + 1
  for ($i = 0; $i -lt $ReturnCount; $i++) {
    $frameNum = $returnStart + $i
    $name = 'f{0:D2}' -f $frameNum
    $out = Join-Path $OutDir "$name.png"
    $local = $i + 1
    if ($local -eq $ReturnCount) {
      [IdleCompositeBuilder]::WriteExactPlate($Plate, $out)
    } else {
      [IdleCompositeBuilder]::WriteReturnFrame($Plate, $out, $local, $ReturnCount, $PetalCount)
    }
    Write-Host "Wrote return $name"
  }
}

Write-Host "Idle/return composites done. Action frames still need GenerateImage + accept-frame."
