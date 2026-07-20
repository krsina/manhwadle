<#
.SYNOPSIS
  Method 4 — hard reject gates: score locked wardrobe/identity regions vs production plate.

.DESCRIPTION
  Loads a production plate + candidate frames (any size). Letterboxes to square, chroma-keys
  magenta/green, plate-registers to 256x256, then compares mean RGB distance in documented locked
  boxes (belt, face, shoes, lower-robe embroidery) plus head-size / proportion vs plate.
  Writes scores.json + scores.md. Exit code 1 if any frame FAILs (unless -WarnOnly).

.EXAMPLE
  .\scripts\avatar-anim-reject-gates.ps1 `
    -Plate "public\avatar-characters\style-a\plum-blossom-blade.png" `
    -Candidates "tmp\animation-jobs\...\seq\f07.png" `
    -OutDir "tmp\animation-jobs\...\drift-compare\method4-reject-gates"
#>
param(
  [string]$Plate = "public\avatar-characters\style-a\plum-blossom-blade.png",
  [string[]]$Candidates = @(),
  [string]$CandidateDir = "",
  [string[]]$CandidateDirs = @(),
  [string]$CandidateListFile = "",
  [string]$OutDir = "tmp\animation-jobs\anim_avatar_plum_blossom_blade_26f\drift-compare\method4-reject-gates",
  [string]$CompareRoot = "tmp\animation-jobs\anim_avatar_plum_blossom_blade_26f\drift-compare",
  [switch]$BuildComparison,
  [switch]$WarnOnly,
  [switch]$SkipNormalize,
  [int]$CellSize = 256,
  # Head height may differ from plate by at most this relative fraction (0.12 = ±12%).
  [double]$MaxHeadHeightRelErr = 0.12,
  # Head/body ratio may differ from plate by at most this absolute delta.
  [double]$MaxHeadRatioAbsErr = 0.08
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Resolve-RepoPath([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $p }
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return (Join-Path $RepoRoot $p)
}

$Plate = Resolve-RepoPath $Plate
$OutDir = Resolve-RepoPath $OutDir
$CompareRoot = Resolve-RepoPath $CompareRoot
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---------------------------------------------------------------------------
# Locked regions on 256x256 plate canvas (Plum Blossom Blade Style A).
# Boxes chosen from plate pixel probe (black sash peak, face skin, shoe soles,
# lower-robe pink embroidery chips). Documented for gen-loop reject gates.
# ---------------------------------------------------------------------------
$script:LockedRegions = @(
  @{
    id = 'waist_belt'
    label = 'Waist belt band'
    # Horizontal black sash — catches pink-belt wardrobe drift.
    x = 104; y = 98; w = 64; h = 10
    # Mean RGB Euclidean distance vs plate (0–441 scale).
    maxMeanDist = 42.0
    # Extra: mean luminance must stay dark (pink belt fails this hard).
    maxMeanLuma = 110.0
  }
  @{
    id = 'face'
    label = 'Face / head patch'
    # Expanded so head-size drift is caught + paste targets match.
    x = 100; y = 40; w = 56; h = 52
    maxMeanDist = 38.0
    maxMeanLuma = $null
  }
  @{
    id = 'shoes'
    label = 'Shoe band'
    x = 100; y = 218; w = 60; h = 16
    # Softer: registration + paste can leave small sole deltas; feet still plate-registered.
    maxMeanDist = 100.0
    maxMeanLuma = $null
  }
  @{
    id = 'embroidery'
    label = 'Lower-robe embroidery'
    x = 105; y = 175; w = 50; h = 32
    maxMeanDist = 50.0
    maxMeanLuma = $null
  }
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class RejectGateProcessor
{
    static bool IsMagenta(Color color)
    {
        // Near-pure #FF00FF only — keep plum-pink embroidery / petals.
        if (color.A <= 8) return false;
        if (color.R < 200 || color.B < 200) return false;
        if (color.G >= 48) return false;
        return Math.Abs(color.R - color.B) <= 36;
    }

    static bool IsSoftMagentaFringe(Color color)
    {
        if (color.A <= 8) return false;
        if (color.R < 170 || color.B < 170) return false;
        if (color.G >= 70) return false;
        var minRB = Math.Min(color.R, color.B);
        return color.G + 28 < minRB
            && (Math.Max(color.R, color.B) - color.G) >= 40
            && Math.Abs(color.R - color.B) <= 48;
    }

    static bool IsGreen(Color color)
    {
        if (color.A <= 8) return false;
        if (color.G < 200) return false;
        if (color.R >= 70 || color.B >= 70) return false;
        return true;
    }

    static bool IsSoftGreenFringe(Color color)
    {
        if (color.A <= 8) return false;
        if (color.G < 150) return false;
        if (color.R >= 100 || color.B >= 100) return false;
        return color.G > Math.Max(color.R, color.B) + 48;
    }

    static Color DespillMagenta(Color color)
    {
        var pull = Math.Max(0, Math.Min(color.R, color.B) - color.G);
        if (pull < 12) return Color.FromArgb(255, color.R, color.G, color.B);
        var amount = Math.Min(pull, (int)(pull * 0.85));
        var r = Math.Max(color.G, color.R - amount);
        var b = Math.Max(color.G, color.B - amount);
        return Color.FromArgb(255, r, color.G, b);
    }

    static Color DespillGreen(Color color)
    {
        var pull = Math.Max(0, color.G - Math.Max(color.R, color.B));
        if (pull < 12) return color;
        var amount = Math.Min(pull, (int)(pull * 0.85));
        var g = Math.Max(Math.Max(color.R, color.B), color.G - amount);
        return Color.FromArgb(255, color.R, g, color.B);
    }

    static Color DespillChroma(Color color)
    {
        return DespillGreen(DespillMagenta(color));
    }

    static bool IsCheckerMat(Color color)
    {
        if (color.A < 8) return true;
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        if (max - min > 18) return false;
        if (min >= 200) return false;
        return min >= 110 && max <= 185;
    }

    static bool IsPaperWhite(Color color)
    {
        if (color.A < 8) return false;
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        return min >= 242 && (max - min) <= 12;
    }

    static int EdgeDepth(int x, int y, int w, int h)
    {
        return Math.Min(Math.Min(x, w - 1 - x), Math.Min(y, h - 1 - y));
    }

    public static void ClearFakeBackground(Bitmap bitmap, int maxPaperDepth)
    {
        var w = bitmap.Width;
        var h = bitmap.Height;
        var visited = new bool[w * h];
        var queue = new Queue<int>();

        Action<int, int> enqueue = (x, y) =>
        {
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            var i = y * w + x;
            if (visited[i]) return;
            var c = bitmap.GetPixel(x, y);
            if (c.A < 8 || IsCheckerMat(c))
            {
                visited[i] = true;
                queue.Enqueue(i);
                return;
            }
            if (IsPaperWhite(c) && EdgeDepth(x, y, w, h) <= maxPaperDepth)
            {
                visited[i] = true;
                queue.Enqueue(i);
            }
        };

        for (var x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
        for (var y = 0; y < h; y++) { enqueue(0, y); enqueue(w - 1, y); }

        while (queue.Count > 0)
        {
            var i = queue.Dequeue();
            var x = i % w;
            var y = i / w;
            bitmap.SetPixel(x, y, Color.Transparent);
            enqueue(x + 1, y);
            enqueue(x - 1, y);
            enqueue(x, y + 1);
            enqueue(x, y - 1);
        }
    }

    static bool IsOpaqueContent(Color c)
    {
        return c.A >= 200 && !IsPaperWhite(c);
    }

    static bool TryCoreBounds(Bitmap bitmap, out int minX, out int minY, out int maxX, out int maxY)
    {
        var w = bitmap.Width;
        var h = bitmap.Height;
        var colCounts = new int[w];
        var maxCol = 0;
        for (var x = 0; x < w; x++)
        {
            var n = 0;
            for (var y = 0; y < h; y++)
            {
                if (IsOpaqueContent(bitmap.GetPixel(x, y))) n++;
            }
            colCounts[x] = n;
            if (n > maxCol) maxCol = n;
        }
        if (maxCol < 8)
        {
            minX = minY = maxX = maxY = 0;
            return false;
        }
        var colThresh = Math.Max(6, maxCol / 5);
        var activeCols = new List<int>();
        for (var x = 0; x < w; x++)
        {
            if (colCounts[x] >= colThresh) activeCols.Add(x);
        }
        if (activeCols.Count == 0)
        {
            minX = minY = maxX = maxY = 0;
            return false;
        }

        var rowCounts = new int[h];
        var maxRow = 0;
        for (var y = 0; y < h; y++)
        {
            var n = 0;
            foreach (var x in activeCols)
            {
                if (IsOpaqueContent(bitmap.GetPixel(x, y))) n++;
            }
            rowCounts[y] = n;
            if (n > maxRow) maxRow = n;
        }
        var rowThresh = Math.Max(4, maxRow / 5);
        minX = activeCols[0];
        maxX = activeCols[activeCols.Count - 1];
        minY = -1;
        maxY = -1;
        for (var y = 0; y < h; y++)
        {
            if (rowCounts[y] < rowThresh) continue;
            if (minY < 0) minY = y;
            maxY = y;
        }
        if (minY < 0)
        {
            minX = minY = maxX = maxY = 0;
            return false;
        }
        return true;
    }

    static Bitmap KeyAndClear(Bitmap source)
    {
        var keyed = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        for (var y = 0; y < source.Height; y++)
        {
            for (var x = 0; x < source.Width; x++)
            {
                var color = source.GetPixel(x, y);
                var chroma = IsMagenta(color) || IsSoftMagentaFringe(color)
                    || IsGreen(color) || IsSoftGreenFringe(color);
                keyed.SetPixel(x, y, chroma ? Color.Transparent : DespillChroma(color));
            }
        }
        var paperDepth = Math.Max(24, Math.Min(keyed.Width, keyed.Height) / 12);
        ClearFakeBackground(keyed, paperDepth);
        return keyed;
    }

    static Bitmap LetterboxToSquare(Bitmap source)
    {
        if (source.Width == source.Height) return new Bitmap(source);
        var side = Math.Max(source.Width, source.Height);
        var square = new Bitmap(side, side, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(square))
        {
            g.Clear(Color.FromArgb(255, 0, 255, 0));
            g.CompositingMode = CompositingMode.SourceCopy;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            var x = (side - source.Width) / 2;
            var y = (side - source.Height) / 2;
            g.DrawImage(source, x, y, source.Width, source.Height);
        }
        return square;
    }

    static void FitCentered(Bitmap keyed, string outputPath, int cellSize)
    {
        int minX = keyed.Width, minY = keyed.Height, maxX = -1, maxY = -1;
        for (var y = 0; y < keyed.Height; y++)
        {
            for (var x = 0; x < keyed.Width; x++)
            {
                var c = keyed.GetPixel(x, y);
                if (!IsOpaqueContent(c)) continue;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < minX)
        {
            using (var blank = new Bitmap(cellSize, cellSize, PixelFormat.Format32bppArgb))
                blank.Save(outputPath, ImageFormat.Png);
            return;
        }

        var contentW = maxX - minX + 1;
        var contentH = maxY - minY + 1;
        var side = Math.Max(contentW, contentH);
        var pad = Math.Max(8, side / 20);
        side += pad * 2;
        var destX = (side - contentW) / 2;
        var destY = (side - contentH) / 2;

        using (var square = new Bitmap(side, side, PixelFormat.Format32bppArgb))
        using (var sg = Graphics.FromImage(square))
        {
            sg.Clear(Color.Transparent);
            sg.CompositingMode = CompositingMode.SourceCopy;
            sg.DrawImage(
                keyed,
                new Rectangle(destX, destY, contentW, contentH),
                new Rectangle(minX, minY, contentW, contentH),
                GraphicsUnit.Pixel
            );

            using (var output = new Bitmap(cellSize, cellSize, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(output))
            {
                graphics.Clear(Color.Transparent);
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                graphics.PixelOffsetMode = PixelOffsetMode.Half;
                graphics.SmoothingMode = SmoothingMode.None;
                graphics.DrawImage(
                    square,
                    new Rectangle(0, 0, cellSize, cellSize),
                    new Rectangle(0, 0, side, side),
                    GraphicsUnit.Pixel
                );
                ClearFakeBackground(output, 8);
                output.Save(outputPath, ImageFormat.Png);
            }
        }
    }

    static void FitRegistered(Bitmap keyed, Bitmap plate, string outputPath, int cellSize)
    {
        int pMinX, pMinY, pMaxX, pMaxY;
        int aMinX, aMinY, aMaxX, aMaxY;
        if (!TryCoreBounds(plate, out pMinX, out pMinY, out pMaxX, out pMaxY)
            || !TryCoreBounds(keyed, out aMinX, out aMinY, out aMaxX, out aMaxY))
        {
            FitCentered(keyed, outputPath, cellSize);
            return;
        }

        var plateCoreH = pMaxY - pMinY + 1;
        var aiCoreH = aMaxY - aMinY + 1;
        if (plateCoreH < 8 || aiCoreH < 8)
        {
            FitCentered(keyed, outputPath, cellSize);
            return;
        }

        var scale = (float)plateCoreH / aiCoreH;
        var plateCX = (pMinX + pMaxX) / 2f;
        var plateFoot = pMaxY + 0.5f;
        var aiCX = (aMinX + aMaxX) / 2f;
        var aiFoot = aMaxY + 0.5f;

        using (var output = new Bitmap(cellSize, cellSize, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(output))
        {
            g.Clear(Color.Transparent);
            g.CompositingMode = CompositingMode.SourceOver;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.SmoothingMode = SmoothingMode.None;
            g.TranslateTransform(plateCX, plateFoot);
            g.ScaleTransform(scale, scale);
            g.TranslateTransform(-aiCX, -aiFoot);
            g.DrawImage(keyed, 0, 0);
            ClearFakeBackground(output, 8);
            output.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void NormalizeTo256(string sourcePath, string platePath, string outputPath, int cellSize)
    {
        using (var sourceRaw = new Bitmap(sourcePath))
        using (var source = LetterboxToSquare(sourceRaw))
        using (var keyed = KeyAndClear(source))
        using (var plate = new Bitmap(platePath))
        {
            FitRegistered(keyed, plate, outputPath, cellSize);
        }
    }

    public static double[] RegionMeanRgb(string imagePath, int x, int y, int w, int h)
    {
        using (var bmp = new Bitmap(imagePath))
        {
            double sr = 0, sg = 0, sb = 0;
            var n = 0;
            var x1 = Math.Max(0, x);
            var y1 = Math.Max(0, y);
            var x2 = Math.Min(bmp.Width, x + w);
            var y2 = Math.Min(bmp.Height, y + h);
            for (var py = y1; py < y2; py++)
            {
                for (var px = x1; px < x2; px++)
                {
                    var c = bmp.GetPixel(px, py);
                    if (c.A < 160) continue;
                    sr += c.R; sg += c.G; sb += c.B;
                    n++;
                }
            }
            if (n == 0) return new double[] { 0, 0, 0, 0 };
            return new double[] { sr / n, sg / n, sb / n, n };
        }
    }

    /// headH, bodyH, headRatio, coreMinY, chinY — chin approximated as face-box bottom.
    /// Returns empty (len 0) if core bounds fail.
    public static double[] MeasureHeadProportions(string imagePath, int faceBottomY)
    {
        using (var bmp = new Bitmap(imagePath))
        {
            int minX, minY, maxX, maxY;
            if (!TryCoreBounds(bmp, out minX, out minY, out maxX, out maxY))
                return new double[0];
            var bodyH = maxY - minY + 1;
            if (bodyH < 8) return new double[0];
            var chinY = Math.Max(minY + 1, Math.Min(maxY, faceBottomY));
            var headH = chinY - minY + 1;
            if (headH < 4) return new double[0];
            var ratio = (double)headH / bodyH;
            return new double[] { headH, bodyH, ratio, minY, chinY };
        }
    }

    public static void DrawLockedOverlay(string platePath, string outputPath, int[] boxes)
    {
        // boxes: flat [x,y,w,h] * N
        using (var plate = new Bitmap(platePath))
        using (var outBmp = new Bitmap(plate.Width, plate.Height, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(outBmp))
        {
            g.Clear(Color.FromArgb(255, 40, 40, 48));
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.DrawImage(plate, 0, 0, plate.Width, plate.Height);
            var colors = new Color[] {
                Color.FromArgb(220, 255, 64, 64),
                Color.FromArgb(220, 64, 200, 255),
                Color.FromArgb(220, 80, 255, 120),
                Color.FromArgb(220, 255, 200, 64)
            };
            using (var pen = new Pen(Color.Red, 1))
            {
                for (var i = 0; i + 3 < boxes.Length; i += 4)
                {
                    pen.Color = colors[(i / 4) % colors.Length];
                    g.DrawRectangle(pen, boxes[i], boxes[i + 1], boxes[i + 2] - 1, boxes[i + 3] - 1);
                }
            }
            outBmp.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void BuildComparisonBoard(
        string outputPath,
        string[] labels,
        string[] imagePaths,
        string[] scoreLines,
        int cellSize,
        int pad,
        int labelH)
    {
        var n = labels.Length;
        var boardW = pad + n * (cellSize + pad);
        var boardH = pad + labelH + cellSize + pad + 48;
        using (var board = new Bitmap(boardW, boardH, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(board))
        using (var titleFont = new Font("Segoe UI", 11, FontStyle.Bold))
        using (var scoreFont = new Font("Consolas", 8, FontStyle.Regular))
        using (var brush = new SolidBrush(Color.FromArgb(255, 235, 235, 240)))
        using (var muted = new SolidBrush(Color.FromArgb(255, 170, 170, 180)))
        using (var failBrush = new SolidBrush(Color.FromArgb(255, 255, 110, 110)))
        using (var passBrush = new SolidBrush(Color.FromArgb(255, 120, 220, 140)))
        {
            g.Clear(Color.FromArgb(255, 28, 28, 34));
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            for (var i = 0; i < n; i++)
            {
                var x = pad + i * (cellSize + pad);
                var y = pad + labelH;
                g.DrawString(labels[i], titleFont, brush, x, pad);

                if (!string.IsNullOrEmpty(imagePaths[i]) && File.Exists(imagePaths[i]))
                {
                    using (var img = new Bitmap(imagePaths[i]))
                    {
                        // Magenta checker behind transparent pixels for review.
                        using (var bg = new SolidBrush(Color.FromArgb(255, 255, 0, 255)))
                            g.FillRectangle(bg, x, y, cellSize, cellSize);
                        g.DrawImage(img, new Rectangle(x, y, cellSize, cellSize));
                    }
                }
                else
                {
                    using (var ph = new SolidBrush(Color.FromArgb(255, 50, 50, 58)))
                    using (var border = new Pen(Color.FromArgb(255, 90, 90, 100)))
                    {
                        g.FillRectangle(ph, x, y, cellSize, cellSize);
                        g.DrawRectangle(border, x, y, cellSize - 1, cellSize - 1);
                        g.DrawString("(pending)", scoreFont, muted, x + 8, y + cellSize / 2 - 6);
                    }
                }

                if (!string.IsNullOrEmpty(scoreLines[i]))
                {
                    var line = scoreLines[i];
                    var b = line.IndexOf("FAIL", StringComparison.OrdinalIgnoreCase) >= 0 ? failBrush : passBrush;
                    if (line.IndexOf("n/a", StringComparison.OrdinalIgnoreCase) >= 0) b = muted;
                    g.DrawString(line, scoreFont, b, x, y + cellSize + 6);
                }
            }

            board.Save(outputPath, ImageFormat.Png);
        }
    }
}
'@

function Get-CandidateList {
  $list = New-Object System.Collections.Generic.List[string]
  $seen = @{}
  function Add-Cand([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) { return }
    $rp = Resolve-RepoPath $path
    if (-not (Test-Path -LiteralPath $rp)) { return }
    $key = $rp.ToLowerInvariant()
    if ($seen.ContainsKey($key)) { return }
    $seen[$key] = $true
    [void]$list.Add($rp)
  }

  foreach ($c in $Candidates) { Add-Cand $c }

  if ($CandidateListFile) {
    $lf = Resolve-RepoPath $CandidateListFile
    if (Test-Path -LiteralPath $lf) {
      Get-Content -LiteralPath $lf -Encoding UTF8 |
        ForEach-Object {
          $line = $_.Trim().TrimStart([char]0xFEFF)
          if ($line -and -not $line.StartsWith('#')) { Add-Cand $line }
        }
    }
  }

  $dirs = @()
  if ($CandidateDir) { $dirs += $CandidateDir }
  if ($CandidateDirs) { $dirs += $CandidateDirs }
  foreach ($d in $dirs) {
    $dir = Resolve-RepoPath $d
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    Get-ChildItem -LiteralPath $dir -Filter '*.png' -File |
      Sort-Object Name |
      ForEach-Object { Add-Cand $_.FullName }
  }
  return [string[]]@($list.ToArray())
}

function Get-NormalizedPath([string]$sourcePath, [string]$normDir) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($sourcePath)
  # Avoid collisions when scoring seq + method folders with same filenames.
  $parent = Split-Path -Leaf (Split-Path -Parent $sourcePath)
  $safeParent = ($parent -replace '[^\w\-]+', '_')
  return (Join-Path $normDir ("{0}__{1}.png" -f $safeParent, $base))
}

function Score-Frame([string]$normPath, [string]$plateNormPath, [string]$sourceLabel) {
  $regionResults = @()
  $frameFail = $false
  foreach ($reg in $script:LockedRegions) {
    $plateMean = [RejectGateProcessor]::RegionMeanRgb($plateNormPath, [int]$reg.x, [int]$reg.y, [int]$reg.w, [int]$reg.h)
    $candMean = [RejectGateProcessor]::RegionMeanRgb($normPath, [int]$reg.x, [int]$reg.y, [int]$reg.w, [int]$reg.h)
    $dr = $candMean[0] - $plateMean[0]
    $dg = $candMean[1] - $plateMean[1]
    $db = $candMean[2] - $plateMean[2]
    $dist = [Math]::Sqrt($dr * $dr + $dg * $dg + $db * $db)
    $luma = (0.2126 * $candMean[0]) + (0.7152 * $candMean[1]) + (0.0722 * $candMean[2])
    $failReasons = @()
    if ($candMean[3] -lt 8) { $failReasons += 'empty_region' }
    if ($plateMean[3] -lt 8) {
      # Plate has no opaque samples in this box (e.g. shoe band on some plates) — skip color gates.
      $pass = ($failReasons.Count -eq 0)
    } else {
      if ($dist -gt [double]$reg.maxMeanDist) { $failReasons += ("meanDist>{0}" -f $reg.maxMeanDist) }
      if ($null -ne $reg.maxMeanLuma -and $luma -gt [double]$reg.maxMeanLuma) {
        $failReasons += ("luma>{0}" -f $reg.maxMeanLuma)
      }
      $pass = ($failReasons.Count -eq 0)
    }
    if (-not $pass) { $frameFail = $true }
    $regionResults += [ordered]@{
      id = $reg.id
      label = $reg.label
      box = @{ x = $reg.x; y = $reg.y; w = $reg.w; h = $reg.h }
      plateMeanRgb = @([math]::Round($plateMean[0], 1), [math]::Round($plateMean[1], 1), [math]::Round($plateMean[2], 1))
      candidateMeanRgb = @([math]::Round($candMean[0], 1), [math]::Round($candMean[1], 1), [math]::Round($candMean[2], 1))
      sampleCount = [int]$candMean[3]
      meanDist = [math]::Round($dist, 2)
      meanLuma = [math]::Round($luma, 1)
      maxMeanDist = $reg.maxMeanDist
      maxMeanLuma = $reg.maxMeanLuma
      pass = $pass
      failReasons = $failReasons
    }
  }

  # Head-size / proportion vs plate (face box bottom ≈ chin).
  $face = $script:LockedRegions | Where-Object { $_.id -eq 'face' } | Select-Object -First 1
  $faceBottom = if ($face) { [int]$face.y + [int]$face.h } else { 94 }
  $plateHead = [RejectGateProcessor]::MeasureHeadProportions($plateNormPath, $faceBottom)
  $candHead = [RejectGateProcessor]::MeasureHeadProportions($normPath, $faceBottom)
  $headFailReasons = @()
  $headPass = $true
  $headPayload = $null
  if ($plateHead.Length -ge 3 -and $candHead.Length -ge 3) {
    $pHeadH = [double]$plateHead[0]
    $pRatio = [double]$plateHead[2]
    $cHeadH = [double]$candHead[0]
    $cRatio = [double]$candHead[2]
    $relErr = if ($pHeadH -gt 0) { [Math]::Abs($cHeadH - $pHeadH) / $pHeadH } else { 1.0 }
    $ratioErr = [Math]::Abs($cRatio - $pRatio)
    if ($relErr -gt $MaxHeadHeightRelErr) {
      $headFailReasons += ("headHeightRelErr>{0:N2}" -f $MaxHeadHeightRelErr)
    }
    if ($ratioErr -gt $MaxHeadRatioAbsErr) {
      $headFailReasons += ("headRatioAbsErr>{0:N2}" -f $MaxHeadRatioAbsErr)
    }
    $headPass = ($headFailReasons.Count -eq 0)
    if (-not $headPass) { $frameFail = $true }
    $headPayload = [ordered]@{
      id = 'head_proportion'
      label = 'Head size vs plate'
      plateHeadH = [math]::Round($pHeadH, 1)
      candidateHeadH = [math]::Round($cHeadH, 1)
      plateBodyH = [math]::Round([double]$plateHead[1], 1)
      candidateBodyH = [math]::Round([double]$candHead[1], 1)
      plateHeadRatio = [math]::Round($pRatio, 3)
      candidateHeadRatio = [math]::Round($cRatio, 3)
      headHeightRelErr = [math]::Round($relErr, 3)
      headRatioAbsErr = [math]::Round($ratioErr, 3)
      maxHeadHeightRelErr = $MaxHeadHeightRelErr
      maxHeadRatioAbsErr = $MaxHeadRatioAbsErr
      pass = $headPass
      failReasons = $headFailReasons
    }
    $regionResults += $headPayload
  } else {
    $headFailReasons += 'head_measure_failed'
    $frameFail = $true
    $regionResults += [ordered]@{
      id = 'head_proportion'
      label = 'Head size vs plate'
      pass = $false
      failReasons = $headFailReasons
    }
  }

  return [ordered]@{
    source = $sourceLabel
    normalized = $normPath
    pass = -not $frameFail
    verdict = $(if ($frameFail) { 'FAIL' } else { 'PASS' })
    regions = $regionResults
  }
}

# ---- Collect candidates ----
$files = [string[]]@(Get-CandidateList)
if ($null -eq $files) { $files = @() }
# Flatten accidental nested arrays from PowerShell return unwrapping.
if ($files.Count -eq 1 -and $files[0] -is [System.Array]) {
  $files = [string[]]@($files[0])
}
Write-Host ("Candidate count: {0}" -f $files.Count)
if ($files.Count -eq 0) {
  Write-Error "No candidate PNGs found. Pass -Candidates, -CandidateDir, or -CandidateListFile."
}

if (-not (Test-Path -LiteralPath $Plate)) {
  Write-Error "Plate not found: $Plate"
}

$normDir = Join-Path $OutDir 'normalized'
New-Item -ItemType Directory -Force -Path $normDir | Out-Null

# Normalize plate once (already 256 transparent — copy/ensure path).
$plateNorm = Join-Path $normDir 'plate.png'
if ($SkipNormalize) {
  Copy-Item -LiteralPath $Plate -Destination $plateNorm -Force
} else {
  # Plate is already 256 keyed; still run through register against itself for consistency.
  [RejectGateProcessor]::NormalizeTo256($Plate, $Plate, $plateNorm, $CellSize)
}

# Locked region overlay for docs/review
$boxFlat = New-Object System.Collections.Generic.List[int]
foreach ($reg in $script:LockedRegions) {
  $boxFlat.Add([int]$reg.x); $boxFlat.Add([int]$reg.y)
  $boxFlat.Add([int]$reg.w); $boxFlat.Add([int]$reg.h)
}
$overlayPath = Join-Path $OutDir 'locked-regions-overlay.png'
[RejectGateProcessor]::DrawLockedOverlay($plateNorm, $overlayPath, $boxFlat.ToArray())

$frameScores = @()
$anyFail = $false

Write-Host ""
Write-Host "=== Method 4 reject gates ==="
Write-Host "Plate: $Plate"
Write-Host ("Regions: " + (($script:LockedRegions | ForEach-Object { $_.id }) -join ', '))
Write-Host ""

foreach ($src in $files) {
  $label = $src.Substring($RepoRoot.Length).TrimStart('\', '/')
  $normPath = Get-NormalizedPath $src $normDir
  if ($SkipNormalize -and ((New-Object System.Drawing.Bitmap $src).Width -eq $CellSize)) {
    $tmp = New-Object System.Drawing.Bitmap $src
    $tmp.Dispose()
    Copy-Item -LiteralPath $src -Destination $normPath -Force
  } else {
    [RejectGateProcessor]::NormalizeTo256($src, $Plate, $normPath, $CellSize)
  }

  $score = Score-Frame $normPath $plateNorm $label
  $frameScores += $score
  if (-not $score.pass) { $anyFail = $true }

  $color = if ($score.pass) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1}" -f $score.verdict, $label) -ForegroundColor $color
  foreach ($r in $score.regions) {
    $mark = if ($r.pass) { 'PASS' } else { 'FAIL' }
    $extra = if ($r.failReasons.Count) { " ($($r.failReasons -join ', '))" } else { '' }
    if ($r.id -eq 'head_proportion') {
      Write-Host ("  {0,-12} headH={1}/{2} ratio={3:N3}/{4:N3}  {5}{6}" -f `
        $r.id, $r.candidateHeadH, $r.plateHeadH, $r.candidateHeadRatio, $r.plateHeadRatio, $mark, $extra)
    } else {
      Write-Host ("  {0,-12} dist={1,6:N2} luma={2,6:N1}  {3}{4}" -f $r.id, $r.meanDist, $r.meanLuma, $mark, $extra)
    }
  }
}

# ---- Write scores ----
$payload = [ordered]@{
  generatedAt = (Get-Date).ToString('o')
  plate = $Plate.Substring($RepoRoot.Length).TrimStart('\', '/')
  cellSize = $CellSize
  thresholds = @($script:LockedRegions | ForEach-Object {
    [ordered]@{
      id = $_.id
      box = "($($_.x),$($_.y)) $($_.w)x$($_.h)"
      maxMeanDist = $_.maxMeanDist
      maxMeanLuma = $_.maxMeanLuma
    }
  })
  summary = [ordered]@{
    total = $frameScores.Count
    passed = @($frameScores | Where-Object { $_.pass }).Count
    failed = @($frameScores | Where-Object { -not $_.pass }).Count
  }
  frames = $frameScores
}

$jsonPath = Join-Path $OutDir 'scores.json'
$mdPath = Join-Path $OutDir 'scores.md'
($payload | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$md = @()
$md += '# Method 4 — Reject gate scores'
$md += ''
$md += "- Plate: ``$($payload.plate)``"
$md += "- Generated: $($payload.generatedAt)"
$md += "- Summary: **$($payload.summary.passed)/$($payload.summary.total) PASS**, $($payload.summary.failed) FAIL"
$md += ''
$md += '## Locked regions (256 canvas)'
$md += ''
$md += '| Region | Box (x,y,w,h) | max meanDist | max luma |'
$md += '| --- | --- | --- | --- |'
foreach ($reg in $script:LockedRegions) {
  $luma = if ($null -eq $reg.maxMeanLuma) { '—' } else { $reg.maxMeanLuma }
  $md += "| $($reg.label) ($($reg.id)) | $($reg.x),$($reg.y),$($reg.w),$($reg.h) | $($reg.maxMeanDist) | $luma |"
}
$md += ''
$md += "- Head proportion gate: head height vs plate ≤ ±$MaxHeadHeightRelErr relative; head/body ratio abs err ≤ $MaxHeadRatioAbsErr"
$md += ''
$md += '## Frames'
$md += ''
foreach ($f in $frameScores) {
  $md += "### [$($f.verdict)] ``$($f.source)``"
  $md += ''
  $md += '| Region | meanDist / head metrics | luma | plate RGB | cand RGB | result |'
  $md += '| --- | --- | --- | --- | --- | --- |'
  foreach ($r in $f.regions) {
    $res = if ($r.pass) { 'PASS' } else { "FAIL: $($r.failReasons -join '; ')" }
    if ($r.id -eq 'head_proportion') {
      $metrics = "headH $($r.candidateHeadH)/$($r.plateHeadH); ratio $($r.candidateHeadRatio)/$($r.plateHeadRatio)"
      $md += "| $($r.id) | $metrics | - | - | - | $res |"
    } else {
      $pr = ($r.plateMeanRgb -join ',')
      $cr = ($r.candidateMeanRgb -join ',')
      $md += "| $($r.id) | $($r.meanDist) | $($r.meanLuma) | $pr | $cr | $res |"
    }
  }
  $md += ''
}
$md -join "`n" | Set-Content -LiteralPath $mdPath -Encoding UTF8

Write-Host ""
Write-Host "Wrote $jsonPath"
Write-Host "Wrote $mdPath"
Write-Host "Wrote $overlayPath"

# ---- Comparison board ----
if ($BuildComparison) {
  $boardPath = Join-Path $CompareRoot 'COMPARISON.png'
  $boardMd = Join-Path $CompareRoot 'COMPARISON.md'
  New-Item -ItemType Directory -Force -Path $CompareRoot | Out-Null

  function Find-FirstPng([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir)) { return $null }
    $prefs = @(
      '*f07*pasted*', '*pasted*f07*', 'f07-pasted.png',
      'demo-action.png', 'demo-idle.png',
      'edit-from-f06*', 'edit-from-plate*',
      '*f07*', '*pasted*', '*.png'
    )
    foreach ($pat in $prefs) {
      $hit = Get-ChildItem -LiteralPath $dir -Filter ($pat -replace '\*','*') -File -ErrorAction SilentlyContinue |
        Where-Object {
          $_.Name -notmatch 'overlay|before-after|mask|README|locked-mask|registered|fx-|raw|procedural'
        } |
        Sort-Object Name |
        Select-Object -First 1
      # Fallback: allow procedural/fx if nothing else
      if (-not $hit) {
        $hit = Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Extension -eq '.png' -and $_.Name -like $pat -and $_.Name -notmatch 'overlay|before-after|mask|README|locked-mask' } |
          Sort-Object Name |
          Select-Object -First 1
      }
      if ($hit) { return $hit.FullName }
    }
    $any = Get-ChildItem -LiteralPath $dir -Filter '*.png' -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch 'overlay|before-after|mask|README|locked-mask|raw' } |
      Sort-Object { if ($_.Name -match 'pasted|demo-action|edit-from') { 0 } else { 1 } }, Name |
      Select-Object -First 1
    if ($any) { return $any.FullName }
    return $null
  }

  function Score-LineForPath([string]$path) {
    if (-not $path) { return 'n/a (pending)' }
    $match = $frameScores | Where-Object {
      $_.source -replace '\\', '/' -eq ($path.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/')) `
        -or $_.normalized -eq $path
    } | Select-Object -First 1
    # Also match by basename against scored normalized files
    if (-not $match) {
      $base = [System.IO.Path]::GetFileNameWithoutExtension($path)
      $match = $frameScores | Where-Object {
        $_.source -match [regex]::Escape($base) -or $_.normalized -match [regex]::Escape($base)
      } | Select-Object -First 1
    }
    if (-not $match) {
      # Score on the fly for board annotation
      $tmpNorm = Join-Path $normDir ("board__{0}.png" -f ([guid]::NewGuid().ToString('N').Substring(0, 8)))
      try {
        [RejectGateProcessor]::NormalizeTo256($path, $Plate, $tmpNorm, $CellSize)
        $s = Score-Frame $tmpNorm $plateNorm ($path.Substring($RepoRoot.Length).TrimStart('\', '/'))
        $belt = $s.regions | Where-Object { $_.id -eq 'waist_belt' } | Select-Object -First 1
        return ("{0} belt={1:N1}" -f $s.verdict, $belt.meanDist)
      } catch {
        return 'n/a'
      }
    }
    $belt = $match.regions | Where-Object { $_.id -eq 'waist_belt' } | Select-Object -First 1
    return ("{0} belt={1:N1}" -f $match.verdict, $belt.meanDist)
  }

  $seqF07 = Join-Path (Resolve-RepoPath 'tmp\animation-jobs\anim_avatar_plum_blossom_blade_26f\seq') 'f07.png'
  $m1 = Find-FirstPng (Join-Path $CompareRoot 'method1-composite')
  $m2 = Find-FirstPng (Join-Path $CompareRoot 'method2-region-paste')
  $m3 = Find-FirstPng (Join-Path $CompareRoot 'method3-edit-only')

  # Prefer normalized board cells for fair visual compare
  $plateCell = $plateNorm
  $rawCell = $null
  if (Test-Path -LiteralPath $seqF07) {
    $rawCell = Get-NormalizedPath $seqF07 $normDir
    if (-not (Test-Path -LiteralPath $rawCell)) {
      [RejectGateProcessor]::NormalizeTo256($seqF07, $Plate, $rawCell, $CellSize)
    }
  }

  $labels = @('Plate', 'Raw AI f07', 'Method1 composite', 'Method2 region-paste', 'Method3 edit-only')
  $paths = @(
    $plateCell,
    $rawCell,
    $(if ($m1) { $m1 } else { '' }),
    $(if ($m2) { $m2 } else { '' }),
    $(if ($m3) { $m3 } else { '' })
  )
  $scoreLines = @(
    'reference',
    (Score-LineForPath $seqF07),
    (Score-LineForPath $m1),
    (Score-LineForPath $m2),
    (Score-LineForPath $m3)
  )

  [RejectGateProcessor]::BuildComparisonBoard($boardPath, $labels, $paths, $scoreLines, $CellSize, 16, 28)

  $mdc = @()
  $mdc += '# Drift method comparison - Plum Blossom Blade'
  $mdc += ''
  $mdc += 'Side-by-side review board (256 cells, magenta matte):'
  $mdc += ''
  $mdc += '![COMPARISON](./COMPARISON.png)'
  $mdc += ''
  $mdc += '| Column | Source | Gate note |'
  $mdc += '| --- | --- | --- |'
  for ($i = 0; $i -lt $labels.Count; $i++) {
    $src = if ($paths[$i]) { $paths[$i].Substring($RepoRoot.Length).TrimStart('\', '/') } else { '(pending)' }
    $mdc += "| $($labels[$i]) | ``$src`` | $($scoreLines[$i]) |"
  }
  $mdc += ''
  $mdc += 'Method 4 scores: [method4-reject-gates/scores.md](./method4-reject-gates/scores.md)'
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($boardMd, ($mdc -join "`n") + "`n", $utf8NoBom)

  Write-Host "Wrote $boardPath"
  Write-Host "Wrote $boardMd"
}

if ($anyFail -and -not $WarnOnly) {
  Write-Host ""
  Write-Host "REJECT: one or more frames failed locked-region gates." -ForegroundColor Red
  exit 1
}

if ($anyFail) {
  Write-Host ""
  Write-Host "WARN: failures present (-WarnOnly, exit 0)." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "All frames PASS." -ForegroundColor Green
exit 0
