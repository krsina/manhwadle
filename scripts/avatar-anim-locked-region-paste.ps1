param(
  [string]$PlatePath = "public\avatar-characters\style-a\plum-blossom-blade.png",
  [string]$SeqDir = "tmp\animation-jobs\anim_avatar_plum_blossom_blade_26f\seq",
  [string]$OutDir = "tmp\animation-jobs\anim_avatar_plum_blossom_blade_26f\drift-compare\method2-region-paste",
  [string[]]$Frames = @("f02", "f07", "f08")
)

# Method 2: plate-register an AI mid-frame, then paste locked wardrobe/identity
# pixels from the production plate (belt, face, shoes, lower-robe embroidery).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class LockedRegionPaste
{
    static bool IsMagenta(Color color)
    {
        // Near-pure #FF00FF only — do not treat pink embroidery / petals as matte.
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

    public static bool TryCoreBounds(Bitmap bitmap, out int minX, out int minY, out int maxX, out int maxY)
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

    /// Plate-register keyed AI into a new 256 bitmap (same transform as process-awakening-strip).
    public static Bitmap RegisterToPlate(Bitmap keyed, Bitmap plate)
    {
        int pMinX, pMinY, pMaxX, pMaxY;
        int aMinX, aMinY, aMaxX, aMaxY;
        var output = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(output))
        {
            g.Clear(Color.Transparent);
            g.CompositingMode = CompositingMode.SourceOver;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.SmoothingMode = SmoothingMode.None;

            if (!TryCoreBounds(plate, out pMinX, out pMinY, out pMaxX, out pMaxY)
                || !TryCoreBounds(keyed, out aMinX, out aMinY, out aMaxX, out aMaxY))
            {
                // Fallback: fit content centered
                FitCenteredInto(g, keyed);
                ClearFakeBackground(output, 8);
                return output;
            }

            var plateCoreH = pMaxY - pMinY + 1;
            var aiCoreH = aMaxY - aMinY + 1;
            if (plateCoreH < 8 || aiCoreH < 8)
            {
                FitCenteredInto(g, keyed);
                ClearFakeBackground(output, 8);
                return output;
            }

            var scale = (float)plateCoreH / aiCoreH;
            var plateCX = (pMinX + pMaxX) / 2f;
            var plateFoot = pMaxY + 0.5f;
            var aiCX = (aMinX + aMaxX) / 2f;
            var aiFoot = aMaxY + 0.5f;

            g.TranslateTransform(plateCX, plateFoot);
            g.ScaleTransform(scale, scale);
            g.TranslateTransform(-aiCX, -aiFoot);
            g.DrawImage(keyed, 0, 0);
        }
        ClearFakeBackground(output, 8);
        return output;
    }

    static void FitCenteredInto(Graphics g, Bitmap keyed)
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
        if (maxX < minX) return;
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
            g.DrawImage(square, new Rectangle(0, 0, 256, 256), new Rectangle(0, 0, side, side), GraphicsUnit.Pixel);
        }
    }

    /// Build a soft boolean mask of locked regions from plate core bounds.
    /// Heuristics (fractions of core height / width):
    ///   face:        upper-center oval  ~12–42% H, 28–72% W
    ///   belt/sash:   horizontal waist   ~46–62% H, 18–86% W (+ right tassel pad)
    ///   embroidery:  lower robe         ~62–88% H, 22–78% W (skip near-black sword)
    ///   shoes:       bottom band        ~90–100% H, 30–70% W
    public static Bitmap BuildLockedMask(Bitmap plate)
    {
        int minX, minY, maxX, maxY;
        var mask = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(mask))
        {
            g.Clear(Color.Transparent);
        }
        if (!TryCoreBounds(plate, out minX, out minY, out maxX, out maxY))
        {
            // Hardcoded fallback for 256 plate if core fails
            minX = 70; minY = 20; maxX = 185; maxY = 245;
        }

        var coreW = maxX - minX + 1;
        var coreH = maxY - minY + 1;

        Action<int, int, int, int, float> fillRectSoft = (x0, y0, x1, y1, feather) =>
        {
            for (var y = Math.Max(0, y0); y <= Math.Min(255, y1); y++)
            {
                for (var x = Math.Max(0, x0); x <= Math.Min(255, x1); x++)
                {
                    var existing = mask.GetPixel(x, y).A;
                    var edge = Math.Min(Math.Min(x - x0, x1 - x), Math.Min(y - y0, y1 - y));
                    var a = edge < feather ? (byte)(255 * (edge + 1) / (feather + 1)) : (byte)255;
                    if (a > existing) mask.SetPixel(x, y, Color.FromArgb(a, 255, 0, 0));
                }
            }
        };

        Action<float, float, float, float, float> fillOvalSoft = (cx, cy, rx, ry, feather) =>
        {
            var x0 = (int)Math.Floor(cx - rx - feather);
            var x1 = (int)Math.Ceiling(cx + rx + feather);
            var y0 = (int)Math.Floor(cy - ry - feather);
            var y1 = (int)Math.Ceiling(cy + ry + feather);
            for (var y = Math.Max(0, y0); y <= Math.Min(255, y1); y++)
            {
                for (var x = Math.Max(0, x0); x <= Math.Min(255, x1); x++)
                {
                    var nx = (x - cx) / rx;
                    var ny = (y - cy) / ry;
                    var d = Math.Sqrt(nx * nx + ny * ny);
                    if (d > 1.0 + feather / Math.Max(rx, ry)) continue;
                    byte a;
                    if (d <= 1.0) a = 255;
                    else
                    {
                        var t = (d - 1.0) / (feather / Math.Max(rx, 1));
                        a = (byte)Math.Max(0, 255 * (1.0 - t));
                    }
                    var existing = mask.GetPixel(x, y).A;
                    if (a > existing) mask.SetPixel(x, y, Color.FromArgb(a, 255, 0, 0));
                }
            }
        };

        // Face + hair mass — upper center (expanded so head paste wins over AI redraws)
        {
            var cx = minX + coreW * 0.50f;
            var cy = minY + coreH * 0.24f;
            var rx = coreW * 0.28f;
            var ry = coreH * 0.20f;
            fillOvalSoft(cx, cy, rx, ry, 2.5f);
        }

        // Extra head crown / hair silhouette band above face
        {
            var y0 = minY;
            var y1 = minY + (int)(coreH * 0.22);
            var x0 = minX + (int)(coreW * 0.22);
            var x1 = minX + (int)(coreW * 0.78);
            fillRectSoft(x0, y0, x1, y1, 2f);
        }

        // Belt / sash — horizontal waist band (+ slight right pad for tassels) — slightly taller
        {
            var y0 = minY + (int)(coreH * 0.44);
            var y1 = minY + (int)(coreH * 0.64);
            var x0 = minX + (int)(coreW * 0.16);
            var x1 = minX + (int)(coreW * 0.88);
            fillRectSoft(x0, y0, x1, y1, 1.5f);
        }

        // Lower-robe embroidery zone (below belt, above shoes)
        {
            var y0 = minY + (int)(coreH * 0.62);
            var y1 = minY + (int)(coreH * 0.88);
            var x0 = minX + (int)(coreW * 0.22);
            var x1 = minX + (int)(coreW * 0.78);
            // Only mark plate pixels that look like robe/embroidery (not dark sword)
            for (var y = Math.Max(0, y0); y <= Math.Min(255, y1); y++)
            {
                for (var x = Math.Max(0, x0); x <= Math.Min(255, x1); x++)
                {
                    var pc = plate.GetPixel(x, y);
                    if (pc.A < 200) continue;
                    // Skip near-black / dark gray sword & hair strands
                    var max = Math.Max(pc.R, Math.Max(pc.G, pc.B));
                    if (max < 55) continue;
                    // Prefer pale robe + pink floral accents
                    var isPaleRobe = pc.R >= 180 && pc.G >= 170 && pc.B >= 170;
                    var isPinkAccent = pc.R > pc.G + 15 && pc.R > pc.B + 10 && pc.R >= 140;
                    if (!isPaleRobe && !isPinkAccent) continue;
                    var existing = mask.GetPixel(x, y).A;
                    if (existing < 220) mask.SetPixel(x, y, Color.FromArgb(220, 255, 0, 0));
                }
            }
        }

        // Shoes — bottom band
        {
            var y0 = minY + (int)(coreH * 0.90);
            var y1 = maxY;
            var x0 = minX + (int)(coreW * 0.30);
            var x1 = minX + (int)(coreW * 0.70);
            fillRectSoft(x0, y0, x1, y1, 1f);
        }

        return mask;
    }

    /// Paste plate pixels into registered frame wherever mask is active and plate is opaque.
    public static Bitmap PasteLockedRegions(Bitmap registered, Bitmap plate, Bitmap mask)
    {
        var result = new Bitmap(registered);
        for (var y = 0; y < 256; y++)
        {
            for (var x = 0; x < 256; x++)
            {
                var m = mask.GetPixel(x, y).A;
                if (m < 16) continue;
                var pc = plate.GetPixel(x, y);
                if (pc.A < 200) continue;
                if (m >= 250)
                {
                    result.SetPixel(x, y, pc);
                }
                else
                {
                    // Soft edge: blend toward plate
                    var fc = result.GetPixel(x, y);
                    if (fc.A < 8)
                    {
                        result.SetPixel(x, y, Color.FromArgb(m, pc.R, pc.G, pc.B));
                        continue;
                    }
                    var t = m / 255f;
                    var r = (int)(fc.R * (1 - t) + pc.R * t);
                    var g = (int)(fc.G * (1 - t) + pc.G * t);
                    var b = (int)(fc.B * (1 - t) + pc.B * t);
                    var a = Math.Max(fc.A, pc.A);
                    result.SetPixel(x, y, Color.FromArgb(a, r, g, b));
                }
            }
        }
        // Hard foot lock: entire plate foot band wins (opaque + transparent).
        for (var y = 210; y < 256; y++)
        {
            for (var x = 0; x < 256; x++)
            {
                result.SetPixel(x, y, plate.GetPixel(x, y));
            }
        }
        return result;
    }

    /// Debug viz: registered frame with mask overlay (semi-transparent red).
    public static void SaveMaskOverlay(Bitmap registered, Bitmap mask, string path)
    {
        using (var viz = new Bitmap(registered))
        {
            for (var y = 0; y < 256; y++)
            {
                for (var x = 0; x < 256; x++)
                {
                    var m = mask.GetPixel(x, y).A;
                    if (m < 16) continue;
                    var c = viz.GetPixel(x, y);
                    var t = Math.Min(1f, m / 255f * 0.45f);
                    var r = (int)(c.R * (1 - t) + 255 * t);
                    var g = (int)(c.G * (1 - t) + 40 * t);
                    var b = (int)(c.B * (1 - t) + 40 * t);
                    var a = Math.Max(c.A, (int)(m * 0.7));
                    viz.SetPixel(x, y, Color.FromArgb(a, r, g, b));
                }
            }
            viz.Save(path, ImageFormat.Png);
        }
    }

    /// Side-by-side before | after comparison strip.
    public static void SaveBeforeAfter(Bitmap before, Bitmap after, string path)
    {
        using (var strip = new Bitmap(512, 256, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(strip))
        {
            g.Clear(Color.Transparent);
            g.CompositingMode = CompositingMode.SourceCopy;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.DrawImage(before, 0, 0, 256, 256);
            g.DrawImage(after, 256, 0, 256, 256);
            strip.Save(path, ImageFormat.Png);
        }
    }

    public static void ProcessFrame(string aiPath, string platePath, string outPasted, string outRegistered, string outPair, string outMaskOverlay)
    {
        using (var plate = new Bitmap(platePath))
        using (var sourceRaw = new Bitmap(aiPath))
        using (var source = LetterboxToSquare(sourceRaw))
        using (var keyed = KeyAndClear(source))
        using (var registered = RegisterToPlate(keyed, plate))
        using (var mask = BuildLockedMask(plate))
        using (var pasted = PasteLockedRegions(registered, plate, mask))
        {
            registered.Save(outRegistered, ImageFormat.Png);
            pasted.Save(outPasted, ImageFormat.Png);
            SaveBeforeAfter(registered, pasted, outPair);
            if (!string.IsNullOrEmpty(outMaskOverlay))
                SaveMaskOverlay(registered, mask, outMaskOverlay);
        }
    }

    public static void SaveMaskAlone(string platePath, string outPath)
    {
        using (var plate = new Bitmap(platePath))
        using (var mask = BuildLockedMask(plate))
        {
            // Composite mask over plate for readability
            using (var viz = new Bitmap(plate))
            {
                for (var y = 0; y < 256; y++)
                {
                    for (var x = 0; x < 256; x++)
                    {
                        var m = mask.GetPixel(x, y).A;
                        if (m < 16) continue;
                        var c = viz.GetPixel(x, y);
                        var t = 0.5f;
                        viz.SetPixel(x, y, Color.FromArgb(
                            Math.Max(c.A, m),
                            (int)(c.R * (1 - t) + 255 * t),
                            (int)(c.G * (1 - t) + 40 * t),
                            (int)(c.B * (1 - t) + 40 * t)));
                    }
                }
                viz.Save(outPath, ImageFormat.Png);
            }
        }
    }
}
'@

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$plateFull = if ([IO.Path]::IsPathRooted($PlatePath)) { $PlatePath } else { Join-Path $repoRoot $PlatePath }
$seqFull = if ([IO.Path]::IsPathRooted($SeqDir)) { $SeqDir } else { Join-Path $repoRoot $SeqDir }
$outFull = if ([IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $repoRoot $OutDir }

if (-not (Test-Path $plateFull)) { throw "Plate not found: $plateFull" }
if (-not (Test-Path $seqFull)) { throw "Seq dir not found: $seqFull" }

New-Item -ItemType Directory -Force -Path $outFull | Out-Null

# Save locked-region mask visualization once
$maskViz = Join-Path $outFull 'locked-mask-on-plate.png'
[LockedRegionPaste]::SaveMaskAlone($plateFull, $maskViz)
Write-Output "Wrote mask viz: $maskViz"

foreach ($frame in $Frames) {
  $name = $frame
  if ($name -notmatch '^f\d+') { $name = 'f{0:D2}' -f [int]$frame }
  $raw = Join-Path $seqFull "$name.png"
  if (-not (Test-Path $raw)) {
    Write-Warning "Skipping missing frame: $raw"
    continue
  }
  $outPasted = Join-Path $outFull "$name-pasted.png"
  $outReg = Join-Path $outFull "$name-registered.png"
  $outPair = Join-Path $outFull "$name-before-after.png"
  $outOverlay = Join-Path $outFull "$name-mask-overlay.png"
  [LockedRegionPaste]::ProcessFrame(
    (Resolve-Path $raw).Path,
    (Resolve-Path $plateFull).Path,
    $outPasted,
    $outReg,
    $outPair,
    $outOverlay
  )
  Write-Output "Processed $name -> $outPasted"
}

Write-Output "Done. Outputs in $outFull"
