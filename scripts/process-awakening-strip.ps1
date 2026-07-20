param(
  [string]$WorkDir = "tmp\avatar-awakening\plum-blossom-blade",
  [string]$SeqDir = "tmp\avatar-awakening\plum-blossom-blade\seq",
  [string]$BasePlate = "public\avatar-characters\style-a\plum-blossom-blade.png",
  [string]$OutDir = "public\avatar-characters\style-a\awakened",
  [int]$FrameCount = 26
)

# Process sequential Awakening strip: chroma-key (magenta + green) + stitch cells -> awakened/{slug}.png
# Prefer #00FF00 green backgrounds for pink/plum FX characters so petal glow is not keyed away.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class AwakeningStripProcessor
{
    /// True chroma key only: near-pure #FF00FF. Do NOT treat pink slash/petal glow as matte
    /// (those have higher G and would vanish / leave black holes on dark stages).
    static bool IsMagenta(Color color)
    {
        if (color.A <= 8) return false;
        if (color.R < 200 || color.B < 200) return false;
        if (color.G >= 48) return false;
        return Math.Abs(color.R - color.B) <= 36;
    }

    static bool IsSoftMagentaFringe(Color color)
    {
        if (color.A <= 8) return false;
        // Only fringes of hot magenta — keep plum-pink VFX (higher G) intact.
        if (color.R < 170 || color.B < 170) return false;
        if (color.G >= 70) return false;
        var minRB = Math.Min(color.R, color.B);
        return color.G + 28 < minRB
            && (Math.Max(color.R, color.B) - color.G) >= 40
            && Math.Abs(color.R - color.B) <= 48;
    }

    /// Prefer #00FF00 for pink/plum FX avatars — green does not collide with petal glow.
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

    /// Mid-gray checker mats only. Never near-white — white robes must stay opaque.
    static bool IsCheckerMat(Color color)
    {
        if (color.A < 8) return true;
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        if (max - min > 18) return false;
        if (min >= 200) return false;
        return min >= 110 && max <= 185;
    }

    /// Pure/off-white AI canvas paper (not shaded robe fills).
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

    /// Unlimited edge flood for checker mats + already-transparent.
    /// Paper-white only within maxPaperDepth of the canvas edge so white robes never get eaten.
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

    /// Core body bounds: ignore sparse aura petals by requiring dense columns/rows.
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

    /// Fit to 256 centered on content (no plate). Used only as fallback.
    static void FitCentered(Bitmap keyed, string outputPath)
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
            using (var blank = new Bitmap(256, 256, PixelFormat.Format32bppArgb))
            {
                blank.Save(outputPath, ImageFormat.Png);
            }
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

            using (var output = new Bitmap(256, 256, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(output))
            {
                graphics.Clear(Color.Transparent);
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                graphics.PixelOffsetMode = PixelOffsetMode.Half;
                graphics.SmoothingMode = SmoothingMode.None;
                graphics.DrawImage(
                    square,
                    new Rectangle(0, 0, 256, 256),
                    new Rectangle(0, 0, side, side),
                    GraphicsUnit.Pixel
                );
                ClearFakeBackground(output, 8);
                output.Save(outputPath, ImageFormat.Png);
            }
        }
    }

    /// Plate-register: match plate core body height + foot baseline + center X so feet don't teleport when petals change the bbox.
    static void FitRegistered(Bitmap keyed, Bitmap plate, string outputPath)
    {
        int pMinX, pMinY, pMaxX, pMaxY;
        int aMinX, aMinY, aMaxX, aMaxY;
        if (!TryCoreBounds(plate, out pMinX, out pMinY, out pMaxX, out pMaxY)
            || !TryCoreBounds(keyed, out aMinX, out aMinY, out aMaxX, out aMaxY))
        {
            FitCentered(keyed, outputPath);
            return;
        }

        var plateCoreH = pMaxY - pMinY + 1;
        var aiCoreH = aMaxY - aMinY + 1;
        if (plateCoreH < 8 || aiCoreH < 8)
        {
            FitCentered(keyed, outputPath);
            return;
        }

        var scale = (float)plateCoreH / aiCoreH;
        var plateCX = (pMinX + pMaxX) / 2f;
        var plateFoot = pMaxY + 0.5f;
        var aiCX = (aMinX + aMaxX) / 2f;
        var aiFoot = aMaxY + 0.5f;

        using (var output = new Bitmap(256, 256, PixelFormat.Format32bppArgb))
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

    public static void ProcessTo256(string sourcePath, string outputPath)
    {
        ProcessTo256(sourcePath, outputPath, null);
    }

    public static void ProcessTo256(string sourcePath, string outputPath, string registerPlatePath)
    {
        using (var sourceRaw = new Bitmap(sourcePath))
        using (var source = LetterboxToSquare(sourceRaw))
        using (var keyed = KeyAndClear(source))
        {
            if (!string.IsNullOrEmpty(registerPlatePath) && File.Exists(registerPlatePath))
            {
                using (var plate = new Bitmap(registerPlatePath))
                {
                    FitRegistered(keyed, plate, outputPath);
                    return;
                }
            }
            FitCentered(keyed, outputPath);
        }
    }

    /// AI often returns landscape (e.g. 1536×1024). Pad to square with green so pink FX stay safe.
    /// Magenta mats are still keyed; green is the preferred pad for pink/plum characters.
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

    /// Report foot / core-center deltas between consecutive 256 cells. Large jumps = regenerate that frame.
    public static void AuditContinuity(string[] framePaths, int warnFootPx, int warnCenterPx)
    {
        int prevFoot = -1, prevCx = -1;
        for (var i = 0; i < framePaths.Length; i++)
        {
            using (var frame = new Bitmap(framePaths[i]))
            {
                int minX, minY, maxX, maxY;
                int foot = -1;
                int cx = 128;
                if (TryCoreBounds(frame, out minX, out minY, out maxX, out maxY))
                {
                    foot = maxY;
                    cx = (minX + maxX) / 2;
                }
                else
                {
                    for (var y = frame.Height - 1; y >= 0; y--)
                    {
                        for (var x = 0; x < frame.Width; x++)
                        {
                            if (IsOpaqueContent(frame.GetPixel(x, y))) { foot = y; break; }
                        }
                        if (foot >= 0) break;
                    }
                }

                if (i == 0)
                {
                    Console.WriteLine(string.Format("Continuity f{0:D2}: foot={1} cx={2} (anchor)", i + 1, foot, cx));
                }
                else
                {
                    var dFoot = foot - prevFoot;
                    var dCx = cx - prevCx;
                    var flag = "";
                    if (Math.Abs(dFoot) > warnFootPx || Math.Abs(dCx) > warnCenterPx)
                        flag = "  << WARN: exceeds motion budget — regenerate";
                    Console.WriteLine(string.Format(
                        "Continuity f{0:D2}: foot={1} dFoot={2} cx={3} dCx={4}{5}",
                        i + 1, foot, dFoot, cx, dCx, flag));
                }
                prevFoot = foot;
                prevCx = cx;
            }
        }
    }

    public static void StitchHorizontal(string[] framePaths, string outputPath)
    {
        const int cell = 256;
        using (var sheet = new Bitmap(cell * framePaths.Length, cell, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        {
            graphics.Clear(Color.Transparent);
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
            graphics.PixelOffsetMode = PixelOffsetMode.Half;
            graphics.SmoothingMode = SmoothingMode.None;
            for (var i = 0; i < framePaths.Length; i++)
            {
                using (var frame = new Bitmap(framePaths[i]))
                {
                    graphics.DrawImage(
                        frame,
                        new Rectangle(i * cell, 0, cell, cell),
                        new Rectangle(0, 0, frame.Width, frame.Height),
                        GraphicsUnit.Pixel
                    );
                }
            }
            sheet.Save(outputPath, ImageFormat.Png);
        }
    }
}
'@

New-Item -ItemType Directory -Force -Path (Join-Path $WorkDir 'frames'), $SeqDir, $OutDir | Out-Null

# Frame 1 + last frame = production plate (never AI) for seamless loop wrap
$f1Out = Join-Path $WorkDir 'frames\f01.png'
$lastName = 'f{0:D2}' -f $FrameCount
Copy-Item -Force $BasePlate $f1Out
Copy-Item -Force $BasePlate (Join-Path $SeqDir 'f01.png')
Copy-Item -Force $BasePlate (Join-Path $WorkDir "frames\$lastName.png")

$framePaths = New-Object System.Collections.Generic.List[string]
$framePaths.Add((Resolve-Path $f1Out).Path)
$platePath = (Resolve-Path $BasePlate).Path

for ($n = 2; $n -le ($FrameCount - 1); $n++) {
  $name = 'f{0:D2}' -f $n
  $raw = Join-Path $SeqDir "$name.png"
  if (-not (Test-Path $raw)) { throw "Missing sequential frame: $raw" }
  $out = Join-Path $WorkDir "frames\$name.png"
  [AwakeningStripProcessor]::ProcessTo256((Resolve-Path $raw).Path, $out, $platePath)
  $framePaths.Add((Resolve-Path $out).Path)
  Write-Output "Processed $name (plate-registered)"
}

$framePaths.Add((Resolve-Path (Join-Path $WorkDir "frames\$lastName.png")).Path)
Write-Output "Locked $lastName to production plate"

$slug = [IO.Path]::GetFileNameWithoutExtension($BasePlate)
$sheet = Join-Path $OutDir "$slug.png"
[AwakeningStripProcessor]::StitchHorizontal($framePaths.ToArray(), $sheet)
[AwakeningStripProcessor]::AuditContinuity($framePaths.ToArray(), 3, 3)
$img = [System.Drawing.Image]::FromFile((Resolve-Path $sheet))
Write-Output ("Wrote {0}: {1}x{2} ({3} bytes)" -f (Split-Path $sheet -Leaf), $img.Width, $img.Height, (Get-Item $sheet).Length)
$img.Dispose()
