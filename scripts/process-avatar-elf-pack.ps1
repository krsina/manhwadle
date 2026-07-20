param(
  [Parameter(Mandatory = $false)]
  [string]$SourceDirectory = "",
  [Parameter(Mandatory = $false)]
  [string]$BaseStudyDirectory = "",
  [Parameter(Mandatory = $false)]
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($SourceDirectory)) {
  $candidates = @(
    (Join-Path $env:USERPROFILE '.cursor\projects\c-Users-Krisna-Desktop-manhwadle\assets'),
    (Join-Path $repoRoot 'assets\elf-chroma')
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { $SourceDirectory = $c; break }
  }
  if ([string]::IsNullOrWhiteSpace($SourceDirectory)) {
    throw "SourceDirectory not found. Pass -SourceDirectory pointing at the 8 chroma PNGs."
  }
}

if ([string]::IsNullOrWhiteSpace($BaseStudyDirectory)) {
  $BaseStudyDirectory = Join-Path $repoRoot 'public\avatar-base-study'
}
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $repoRoot 'public\avatar\style-c'
}

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Text;

public static class AvatarElfPackProcessor
{
    public class PointI
    {
        public int X;
        public int Y;
        public PointI() {}
        public PointI(int x, int y) { X = x; Y = y; }
    }

    public class BoundsI
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
        public BoundsI() {}
        public BoundsI(int left, int top, int right, int bottom)
        {
            Left = left; Top = top; Right = right; Bottom = bottom;
        }
        public int Width { get { return Right - Left + 1; } }
        public int Height { get { return Bottom - Top + 1; } }
        public string Label
        {
            get { return "L" + Left + " T" + Top + " R" + Right + " B" + Bottom; }
        }
    }

    public class ValidationReport
    {
        public bool Ok = true;
        public List<string> Passes = new List<string>();
        public List<string> Fails = new List<string>();
        public List<string> Warns = new List<string>();
        public void Pass(string msg) { Passes.Add(msg); }
        public void Fail(string msg) { Ok = false; Fails.Add(msg); }
        public void Warn(string msg) { Warns.Add(msg); }
        public List<string> AllLines()
        {
            var lines = new List<string>();
            foreach (var p in Passes) lines.Add("[PASS] " + p);
            foreach (var w in Warns) lines.Add("[WARN] " + w);
            foreach (var f in Fails) lines.Add("[FAIL] " + f);
            return lines;
        }
    }

    static readonly BoundsI TargetFace = new BoundsI(83, 75, 171, 124);
    static readonly BoundsI TargetEars = new BoundsI(55, 76, 199, 108);
    static readonly BoundsI TargetHairBack = new BoundsI(40, 29, 216, 219);
    static readonly BoundsI TargetHairFront = new BoundsI(78, 34, 177, 130);
    static readonly BoundsI TargetTop = new BoundsI(98, 132, 157, 164);
    static readonly BoundsI TargetBottom = new BoundsI(102, 162, 153, 192);
    static readonly BoundsI TargetHoodBack = new BoundsI(78, 35, 178, 139);
    static readonly BoundsI TargetHoodFront = new BoundsI(52, 7, 204, 143);
    const int EyeLineY = 93;
    static readonly PointI EarLeftAnchor = new PointI(77, 93);
    static readonly PointI EarRightAnchor = new PointI(177, 93);

    static bool IsMagenta(Color color)
    {
        return color.A > 16
            && color.R > 140
            && color.B > 125
            && color.G < Math.Min(color.R, color.B) * 0.62;
    }

    static bool IsOpaque(Color color)
    {
        return color.A > 16;
    }

    static bool IsSkinLike(Color color)
    {
        if (!IsOpaque(color)) return false;
        return color.R > 175 && color.G > 115 && color.B > 85
            && color.R > color.G && color.G >= color.B - 8
            && (color.R - color.B) > 18
            && (color.R - color.G) >= 8;
    }

    static bool IsUnderlayerGray(Color color)
    {
        if (!IsOpaque(color)) return false;
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        var rg = Math.Abs(color.R - color.G);
        var gb = Math.Abs(color.G - color.B);
        var rb = Math.Abs(color.R - color.B);
        return max - min < 18 && rg <= 10 && gb <= 10 && rb <= 10
            && max > 90 && max < 175;
    }

    static bool IsOutlineLike(Color color)
    {
        if (!IsOpaque(color)) return false;
        return color.R < 100 && color.G < 95 && color.B < 105
            && Math.Max(color.R, Math.Max(color.G, color.B)) < 110;
    }

    static bool IsMintHair(Color color)
    {
        if (!IsOpaque(color) || IsSkinLike(color) || IsUnderlayerGray(color)) return false;
        if (color.G > color.R + 5 && color.G > color.B) return true;
        if (color.G >= 180 && color.G >= color.R - 10 && (color.G - color.B) > 12
            && color.B < color.G - 8 && color.R > 180)
            return true;
        if (color.G > 90 && color.G >= color.R && color.G > color.B
            && (color.G - Math.Max(color.R, color.B)) >= 6)
            return true;
        return false;
    }

    static bool IsGreenIris(Color color)
    {
        if (!IsOpaque(color)) return false;
        return color.G > color.R + 10 && color.G > color.B + 5 && color.G > 60 && color.G < 220;
    }

    static bool IsRedIris(Color color)
    {
        if (!IsOpaque(color)) return false;
        return color.R > color.G + 15 && color.R > color.B && color.R > 120
            && color.G > 40 && color.G < 180;
    }

    public static Bitmap ChromaKey(Bitmap source)
    {
        var keyed = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        for (var y = 0; y < source.Height; y++)
        {
            for (var x = 0; x < source.Width; x++)
            {
                var color = source.GetPixel(x, y);
                keyed.SetPixel(
                    x, y,
                    IsMagenta(color)
                        ? Color.Transparent
                        : Color.FromArgb(255, color.R, color.G, color.B)
                );
            }
        }
        return keyed;
    }

    public static BoundsI FindOpaqueBounds(Bitmap image)
    {
        var left = image.Width;
        var top = image.Height;
        var right = -1;
        var bottom = -1;
        for (var y = 0; y < image.Height; y++)
        {
            for (var x = 0; x < image.Width; x++)
            {
                if (!IsOpaque(image.GetPixel(x, y))) continue;
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            }
        }
        if (right < 0) throw new InvalidOperationException("No opaque pixels found.");
        return new BoundsI(left, top, right, bottom);
    }

    static void SetNearestNeighbor(Graphics g)
    {
        g.CompositingMode = CompositingMode.SourceCopy;
        g.CompositingQuality = CompositingQuality.HighSpeed;
        g.InterpolationMode = InterpolationMode.NearestNeighbor;
        g.PixelOffsetMode = PixelOffsetMode.Half;
        g.SmoothingMode = SmoothingMode.None;
    }

    public static Bitmap PlaceCropIntoTarget(Bitmap keyed, BoundsI sourceBounds, BoundsI target)
    {
        var plate = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(plate))
        {
            g.Clear(Color.Transparent);
            SetNearestNeighbor(g);
            g.DrawImage(
                keyed,
                new Rectangle(target.Left, target.Top, target.Width, target.Height),
                new Rectangle(sourceBounds.Left, sourceBounds.Top, sourceBounds.Width, sourceBounds.Height),
                GraphicsUnit.Pixel
            );
        }
        return plate;
    }

    public static int ScrubForbiddenBodyColors(Bitmap plate)
    {
        var removed = 0;
        for (var y = 0; y < plate.Height; y++)
        {
            for (var x = 0; x < plate.Width; x++)
            {
                var c = plate.GetPixel(x, y);
                if (!IsOpaque(c)) continue;
                if (IsSkinLike(c) || IsUnderlayerGray(c))
                {
                    plate.SetPixel(x, y, Color.Transparent);
                    removed++;
                }
            }
        }
        return removed;
    }

    public static Bitmap ProcessSimplePlate(string sourcePath, BoundsI target, out BoundsI sourceBounds, bool scrubBodyLeaks)
    {
        using (var source = new Bitmap(sourcePath))
        using (var keyed = ChromaKey(source))
        {
            sourceBounds = FindOpaqueBounds(keyed);
            var plate = PlaceCropIntoTarget(keyed, sourceBounds, target);
            if (scrubBodyLeaks) ScrubForbiddenBodyColors(plate);
            return plate;
        }
    }

    public static Bitmap ExtractFrontHairPlate(string sourcePath, BoundsI target, out BoundsI sourceBounds, out string extractNote)
    {
        using (var source = new Bitmap(sourcePath))
        using (var keyed = ChromaKey(source))
        {
            var w = keyed.Width;
            var h = keyed.Height;
            var mint = new bool[h, w];
            var mintCount = 0;
            var silhouette = FindOpaqueBounds(keyed);
            var headCutY = silhouette.Top + (int)(silhouette.Height * 0.58);

            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    var c = keyed.GetPixel(x, y);
                    if (y <= headCutY && IsMintHair(c))
                    {
                        mint[y, x] = true;
                        mintCount++;
                    }
                }
            }
            if (mintCount < 50)
                throw new InvalidOperationException("Front-hair mint seed detection failed (mintCount=" + mintCount + ").");

            var keep = new bool[h, w];
            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    if (mint[y, x]) { keep[y, x] = true; continue; }
                    var c = keyed.GetPixel(x, y);
                    if (!IsOpaque(c)) continue;
                    if (IsSkinLike(c) || IsUnderlayerGray(c)) continue;
                    if (!(IsOutlineLike(c) || IsMintHair(c))) continue;

                    var nearMint = false;
                    for (var dy = -2; dy <= 2 && !nearMint; dy++)
                    {
                        for (var dx = -2; dx <= 2; dx++)
                        {
                            var nx = x + dx; var ny = y + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            if (mint[ny, nx]) { nearMint = true; break; }
                        }
                    }
                    if (nearMint) keep[y, x] = true;
                }
            }

            var visited = new bool[h, w];
            var best = new List<Point>();
            int[] qx = new int[w * h];
            int[] qy = new int[w * h];
            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    if (!keep[y, x] || visited[y, x]) continue;
                    var component = new List<Point>();
                    var qs = 0; var qe = 0;
                    qx[qe] = x; qy[qe] = y; qe++;
                    visited[y, x] = true;
                    long sumY = 0;
                    while (qs < qe)
                    {
                        var cx = qx[qs]; var cy = qy[qs]; qs++;
                        component.Add(new Point(cx, cy));
                        sumY += cy;
                        for (var dy = -1; dy <= 1; dy++)
                        {
                            for (var dx = -1; dx <= 1; dx++)
                            {
                                if (dx == 0 && dy == 0) continue;
                                var nx = cx + dx; var ny = cy + dy;
                                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                                if (visited[ny, nx] || !keep[ny, nx]) continue;
                                visited[ny, nx] = true;
                                qx[qe] = nx; qy[qe] = ny; qe++;
                            }
                        }
                    }
                    var meanY = sumY / component.Count;
                    if (meanY > headCutY) continue;
                    if (component.Count > best.Count) best = component;
                }
            }
            if (best.Count < 50)
                throw new InvalidOperationException("Front-hair connected component extraction failed.");

            var finalMask = new bool[h, w];
            foreach (var p in best) finalMask[p.Y, p.X] = true;

            using (var extracted = new Bitmap(w, h, PixelFormat.Format32bppArgb))
            {
                for (var y = 0; y < h; y++)
                {
                    for (var x = 0; x < w; x++)
                    {
                        if (!finalMask[y, x])
                        {
                            extracted.SetPixel(x, y, Color.Transparent);
                            continue;
                        }
                        var c = keyed.GetPixel(x, y);
                        if (IsSkinLike(c) || IsUnderlayerGray(c))
                            extracted.SetPixel(x, y, Color.Transparent);
                        else
                            extracted.SetPixel(x, y, Color.FromArgb(255, c.R, c.G, c.B));
                    }
                }
                sourceBounds = FindOpaqueBounds(extracted);
                extractNote = "mintSeeds=" + mintCount + " kept=" + best.Count
                    + " srcBounds=" + sourceBounds.Label + " headCutY=" + headCutY;
                var plate = PlaceCropIntoTarget(extracted, sourceBounds, target);
                var scrubbed = ScrubForbiddenBodyColors(plate);
                extractNote += " scrubbed=" + scrubbed;
                return plate;
            }
        }
    }

    public static Bitmap MakeTransparentPlate()
    {
        return new Bitmap(256, 256, PixelFormat.Format32bppArgb);
    }

    public static Bitmap LoadOrCopyBase(string path)
    {
        using (var src = new Bitmap(path))
        {
            var plate = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(plate))
            {
                g.Clear(Color.Transparent);
                SetNearestNeighbor(g);
                g.DrawImage(src, new Rectangle(0, 0, 256, 256),
                    new Rectangle(0, 0, src.Width, src.Height), GraphicsUnit.Pixel);
            }
            for (var y = 0; y < 256; y++)
            {
                for (var x = 0; x < 256; x++)
                {
                    var c = plate.GetPixel(x, y);
                    if (IsMagenta(c)) plate.SetPixel(x, y, Color.Transparent);
                }
            }
            return plate;
        }
    }

    static void ValidatePlateBasics(Bitmap plate, string name, ValidationReport report, bool allowFullyTransparent)
    {
        if (plate.Width == 256 && plate.Height == 256) report.Pass(name + ": 256x256");
        else report.Fail(name + ": size " + plate.Width + "x" + plate.Height);

        if (plate.PixelFormat == PixelFormat.Format32bppArgb) report.Pass(name + ": Format32bppArgb");
        else report.Fail(name + ": format " + plate.PixelFormat);

        var corners = new[] {
            plate.GetPixel(0, 0), plate.GetPixel(255, 0),
            plate.GetPixel(0, 255), plate.GetPixel(255, 255)
        };
        var cornerOk = true;
        foreach (var c in corners)
        {
            if (c.A != 0) { cornerOk = false; break; }
        }
        if (cornerOk) report.Pass(name + ": transparent corners");
        else report.Fail(name + ": non-transparent corner pixels");

        var magenta = 0;
        var opaque = 0;
        for (var y = 0; y < 256; y++)
        {
            for (var x = 0; x < 256; x++)
            {
                var c = plate.GetPixel(x, y);
                if (IsMagenta(c)) magenta++;
                if (IsOpaque(c)) opaque++;
            }
        }
        if (magenta == 0) report.Pass(name + ": no residual magenta");
        else report.Fail(name + ": residual magenta=" + magenta);

        if (allowFullyTransparent)
        {
            if (opaque == 0) report.Pass(name + ": fully transparent no-op plate accepted");
            else report.Fail(name + ": expected fully transparent but opaque=" + opaque);
        }
        else if (opaque > 0) report.Pass(name + ": opaque pixels=" + opaque);
        else report.Fail(name + ": no opaque pixels");
    }

    static void ValidateBoundsNear(Bitmap plate, string name, BoundsI expected, int tol, ValidationReport report)
    {
        try
        {
            var b = FindOpaqueBounds(plate);
            var ok =
                Math.Abs(b.Left - expected.Left) <= tol
                && Math.Abs(b.Top - expected.Top) <= tol
                && Math.Abs(b.Right - expected.Right) <= tol
                && Math.Abs(b.Bottom - expected.Bottom) <= tol;
            if (ok)
                report.Pass(name + ": bounds " + b.Label + " within +/-" + tol + " of " + expected.Label);
            else
                report.Fail(name + ": bounds " + b.Label + " outside +/-" + tol + " of " + expected.Label);
        }
        catch (Exception ex)
        {
            report.Fail(name + ": bounds check failed: " + ex.Message);
        }
    }

    static void ValidateNoForbiddenSkinGray(Bitmap plate, string name, ValidationReport report)
    {
        var skin = 0; var gray = 0;
        for (var y = 0; y < 256; y++)
        {
            for (var x = 0; x < 256; x++)
            {
                var c = plate.GetPixel(x, y);
                if (!IsOpaque(c)) continue;
                if (IsSkinLike(c)) skin++;
                else if (IsUnderlayerGray(c)) gray++;
            }
        }
        if (skin == 0) report.Pass(name + ": no forbidden skin pixels");
        else report.Fail(name + ": forbidden skin pixels=" + skin);
        if (gray == 0) report.Pass(name + ": no forbidden gray underlayer pixels");
        else report.Fail(name + ": forbidden gray pixels=" + gray);
    }

    static void ValidateFace(Bitmap plate, ValidationReport report)
    {
        ValidateBoundsNear(plate, "face", TargetFace, 4, report);

        var eyeBand = 0;
        for (var x = TargetFace.Left; x <= TargetFace.Right; x++)
        {
            for (var dy = -4; dy <= 4; dy++)
            {
                var y = EyeLineY + dy;
                if (y < 0 || y > 255) continue;
                if (IsOpaque(plate.GetPixel(x, y))) eyeBand++;
            }
        }
        if (eyeBand > 20) report.Pass("face: features present near eye line y=93 (bandOpaque=" + eyeBand + ")");
        else report.Fail("face: insufficient features near eye line y=93 (bandOpaque=" + eyeBand + ")");

        var mid = 128;
        var greenLeft = 0; var redRight = 0; var greenRight = 0; var redLeft = 0;
        for (var y = TargetFace.Top; y <= TargetFace.Bottom; y++)
        {
            for (var x = TargetFace.Left; x <= TargetFace.Right; x++)
            {
                var c = plate.GetPixel(x, y);
                if (IsGreenIris(c))
                {
                    if (x < mid) greenLeft++; else greenRight++;
                }
                if (IsRedIris(c))
                {
                    if (x < mid) redLeft++; else redRight++;
                }
            }
        }
        if (greenLeft > 5 && greenLeft > greenRight)
            report.Pass("face: green iris dominant on viewer-left (L=" + greenLeft + " R=" + greenRight + ")");
        else
            report.Fail("face: expected green-left iris (L=" + greenLeft + " R=" + greenRight + ")");

        if (redRight > 5 && redRight > redLeft)
            report.Pass("face: red/orange iris dominant on viewer-right (L=" + redLeft + " R=" + redRight + ")");
        else
            report.Fail("face: expected red-right iris (L=" + redLeft + " R=" + redRight + ")");
    }

    static void ValidateEarCoverage(Bitmap plate, ValidationReport report)
    {
        ValidateBoundsNear(plate, "ears", TargetEars, 6, report);
        Func<PointI, bool> probe = p =>
        {
            for (var dy = -3; dy <= 3; dy++)
            {
                for (var dx = -3; dx <= 3; dx++)
                {
                    var x = p.X + dx; var y = p.Y + dy;
                    if (x < 0 || y < 0 || x > 255 || y > 255) continue;
                    if (IsOpaque(plate.GetPixel(x, y))) return true;
                }
            }
            return false;
        };
        if (probe(EarLeftAnchor))
            report.Pass("ears: covers human ear L (77,93)");
        else
            report.Fail("ears: missing coverage at human ear L (77,93)");
        if (probe(EarRightAnchor))
            report.Pass("ears: covers human ear R (177,93)");
        else
            report.Fail("ears: missing coverage at human ear R (177,93)");
    }

    static Bitmap CompositeLayers(params Bitmap[] layers)
    {
        var sheet = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(sheet))
        {
            g.Clear(Color.Transparent);
            g.CompositingMode = CompositingMode.SourceOver;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.SmoothingMode = SmoothingMode.None;
            foreach (var layer in layers)
            {
                if (layer != null) g.DrawImageUnscaled(layer, 0, 0);
            }
        }
        return sheet;
    }

    static void DrawReviewComposite(Bitmap composite, string title, string outputPath)
    {
        const int scale = 3;
        var scaled = 256 * scale;
        using (var sheet = new Bitmap(scaled + 48, scaled + 100, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(sheet))
        using (var titleFont = new Font("Segoe UI", 18, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var brush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var dim = new SolidBrush(Color.FromArgb(170, 170, 180)))
        using (var sub = new Font("Segoe UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
        {
            g.Clear(Color.FromArgb(26, 26, 30));
            g.DrawString(title, titleFont, brush, 16, 14);
            g.DrawString("256 master @ 3x nearest-neighbor | Style C elf pack", sub, dim, 16, 40);
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.SmoothingMode = SmoothingMode.None;
            g.DrawImage(composite, new Rectangle(24, 64, scaled, scaled),
                new Rectangle(0, 0, 256, 256), GraphicsUnit.Pixel);
            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    static void DrawLayerStack(Dictionary<string, Bitmap> plates, string outputPath)
    {
        var order = new[] {
            "hair_back", "body", "ears", "shoes", "bottom", "top",
            "face", "hair_front", "hood_back", "hood_front"
        };
        var labels = new[] {
            "hair back", "body", "ears", "shoes", "bottom", "top",
            "face", "hair front", "hood back", "hood front"
        };
        var cell = 140;
        var cols = 5;
        var rows = 2;
        using (var sheet = new Bitmap(cols * cell + 40, rows * cell + 80, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(sheet))
        using (var titleFont = new Font("Segoe UI", 16, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var labelFont = new Font("Segoe UI", 11, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var brush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var dim = new SolidBrush(Color.FromArgb(170, 170, 180)))
        using (var panel = new SolidBrush(Color.FromArgb(34, 34, 40)))
        {
            g.Clear(Color.FromArgb(26, 26, 30));
            g.DrawString("Style C elf pack - layer stack", titleFont, brush, 16, 12);
            g.DrawString("Individual plates at ~112px nearest-neighbor", labelFont, dim, 16, 36);
            for (var i = 0; i < order.Length; i++)
            {
                var col = i % cols;
                var row = i / cols;
                var x = 20 + col * cell;
                var y = 60 + row * cell;
                Bitmap plate = null;
                plates.TryGetValue(order[i], out plate);
                g.FillRectangle(panel, x, y, 112, 112);
                if (plate != null)
                {
                    g.InterpolationMode = InterpolationMode.NearestNeighbor;
                    g.PixelOffsetMode = PixelOffsetMode.Half;
                    g.SmoothingMode = SmoothingMode.None;
                    g.DrawImage(plate, new Rectangle(x, y, 112, 112),
                        new Rectangle(0, 0, 256, 256), GraphicsUnit.Pixel);
                }
                g.DrawString(labels[i], labelFont, brush, x, y + 114);
            }
            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    static void DrawAnchorOverlay(Bitmap composite, string outputPath)
    {
        const int scale = 3;
        const int canvasX = 40;
        const int canvasY = 70;
        var scaled = 256 * scale;
        using (var sheet = new Bitmap(scaled + 80, scaled + 120, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(sheet))
        using (var titleFont = new Font("Segoe UI", 18, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var sub = new Font("Segoe UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var brush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var dim = new SolidBrush(Color.FromArgb(170, 170, 180)))
        using (var cyan = new Pen(Color.FromArgb(80, 220, 255), 2))
        using (var amber = new Pen(Color.FromArgb(255, 200, 80), 2))
        using (var lime = new Pen(Color.FromArgb(140, 255, 120), 2))
        using (var pink = new Pen(Color.FromArgb(255, 120, 180), 2))
        {
            g.Clear(Color.FromArgb(26, 26, 30));
            g.DrawString("Style C elf pack - shared anchor overlay", titleFont, brush, 16, 14);
            g.DrawString("eye line y=93 | human ears (77,93)/(177,93) | face target L83 T75 R171 B124", sub, dim, 16, 40);
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.SmoothingMode = SmoothingMode.None;
            g.DrawImage(composite, new Rectangle(canvasX, canvasY, scaled, scaled),
                new Rectangle(0, 0, 256, 256), GraphicsUnit.Pixel);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Func<int, int> mx = x => canvasX + x * scale + scale / 2;
            Func<int, int> my = y => canvasY + y * scale + scale / 2;
            g.DrawLine(cyan, canvasX, my(93), canvasX + scaled, my(93));
            g.DrawRectangle(lime,
                canvasX + TargetFace.Left * scale, canvasY + TargetFace.Top * scale,
                TargetFace.Width * scale, TargetFace.Height * scale);
            g.DrawEllipse(amber, mx(77) - 6, my(93) - 6, 12, 12);
            g.DrawEllipse(amber, mx(177) - 6, my(93) - 6, 12, 12);
            g.DrawRectangle(pink,
                canvasX + TargetEars.Left * scale, canvasY + TargetEars.Top * scale,
                TargetEars.Width * scale, TargetEars.Height * scale);
            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    static void MakeSizeCheck(Bitmap composite, string outputPath)
    {
        var sizes = new[] { 30, 76, 184 };
        using (var sheet = new Bitmap(420, 430, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(sheet))
        using (var labelFont = new Font("Segoe UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var guideFont = new Font("Segoe UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var brush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var dim = new SolidBrush(Color.FromArgb(160, 160, 170)))
        {
            g.Clear(Color.FromArgb(26, 26, 30));
            g.DrawString("Style C elf pack - size check", labelFont, brush, 16, 12);
            g.DrawString("30 / 76 / 184 px (nearest-neighbor)", guideFont, dim, 16, 34);
            var y = 64;
            foreach (var size in sizes)
            {
                g.DrawString(size + " px", labelFont, dim, 16, y + Math.Max(0, (size - 14) / 2));
                g.InterpolationMode = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.SmoothingMode = SmoothingMode.None;
                g.DrawImage(composite, new Rectangle(96, y, size, size),
                    new Rectangle(0, 0, 256, 256), GraphicsUnit.Pixel);
                y += size + 18;
            }
            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    static string Escape(string s)
    {
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    public static string BuildManifest(Dictionary<string, string> relPaths)
    {
        var sb = new StringBuilder();
        sb.AppendLine("{");
        sb.AppendLine("  \"id\": \"style-c-elf-pack\",");
        sb.AppendLine("  \"style\": \"style-c\",");
        sb.AppendLine("  \"approvalDate\": \"2026-07-18\",");
        sb.AppendLine("  \"canvas\": {\"width\":256,\"height\":256,\"format\":\"Format32bppArgb\",\"origin\":\"top-left\"},");
        sb.AppendLine("  \"sharedContractRef\": \"style-c-female-base-anchors.json\",");
        sb.AppendLine("  \"anchors\": {");
        sb.AppendLine("    \"canvasCenter\": {\"x\":128,\"y\":128},");
        sb.AppendLine("    \"headCenter\": {\"x\":127,\"y\":84},");
        sb.AppendLine("    \"faceCenter\": {\"x\":127,\"y\":88},");
        sb.AppendLine("    \"eyeLineY\": 93,");
        sb.AppendLine("    \"hairlineY\": 47,");
        sb.AppendLine("    \"earLeft\": {\"x\":77,\"y\":93},");
        sb.AppendLine("    \"earRight\": {\"x\":177,\"y\":93},");
        sb.AppendLine("    \"neck\": {\"x\":127,\"y\":131},");
        sb.AppendLine("    \"waist\": {\"x\":127,\"y\":162},");
        sb.AppendLine("    \"groundBaselineY\": 224");
        sb.AppendLine("  },");
        sb.AppendLine("  \"baseline\": {\"groundY\":224,\"centerlineX\":128,\"figureBiasX\":127},");
        sb.AppendLine("  \"zOrder\": [");
        sb.AppendLine("    \"weapon.back\",");
        sb.AppendLine("    \"accessory.back\",");
        sb.AppendLine("    \"headwear.back\",");
        sb.AppendLine("    \"hair.back\",");
        sb.AppendLine("    \"body\",");
        sb.AppendLine("    \"skin\",");
        sb.AppendLine("    \"ears\",");
        sb.AppendLine("    \"shoes\",");
        sb.AppendLine("    \"bottom\",");
        sb.AppendLine("    \"top\",");
        sb.AppendLine("    \"face\",");
        sb.AppendLine("    \"hair.front\",");
        sb.AppendLine("    \"headwear.front\",");
        sb.AppendLine("    \"accessory.front\",");
        sb.AppendLine("    \"weapon.front\"");
        sb.AppendLine("  ],");
        sb.AppendLine("  \"slots\": {");
        sb.AppendLine("    \"body\": {");
        sb.AppendLine("      \"variants\": {");
        sb.AppendLine("        \"body_female_peach\": {\"path\":\"" + Escape(relPaths["body_female"]) + "\",\"gender\":\"female\",\"skin\":\"peach\"},");
        sb.AppendLine("        \"body_male_peach\": {\"path\":\"" + Escape(relPaths["body_male"]) + "\",\"gender\":\"male\",\"skin\":\"peach\"}");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"skin\": {");
        sb.AppendLine("      \"variants\": {");
        sb.AppendLine("        \"skin_peach\": {\"id\":\"skin_peach\",\"tone\":\"peach\",\"bodyVariants\":[\"body_female_peach\",\"body_male_peach\"]}");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"face\": {");
        sb.AppendLine("      \"items\": {");
        sb.AppendLine("        \"face_elf_heterochromia\": {\"path\":\"" + Escape(relPaths["face"]) + "\",\"full\":\"" + Escape(relPaths["face"]) + "\"}");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"ears\": {");
        sb.AppendLine("      \"items\": {");
        sb.AppendLine("        \"ears_elf_pointed\": {\"path\":\"" + Escape(relPaths["ears"]) + "\",\"full\":\"" + Escape(relPaths["ears"]) + "\"}");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"hair\": {");
        sb.AppendLine("      \"items\": {");
        sb.AppendLine("        \"hair_mint_long\": {");
        sb.AppendLine("          \"back\":\"" + Escape(relPaths["hair_back"]) + "\",");
        sb.AppendLine("          \"front\":\"" + Escape(relPaths["hair_front"]) + "\"");
        sb.AppendLine("        }");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"top\": {");
        sb.AppendLine("      \"items\": {");
        sb.AppendLine("        \"top_sky_wrap\": {\"path\":\"" + Escape(relPaths["top"]) + "\",\"full\":\"" + Escape(relPaths["top"]) + "\"}");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"bottom\": {");
        sb.AppendLine("      \"items\": {");
        sb.AppendLine("        \"bottom_sky_shorts\": {\"path\":\"" + Escape(relPaths["bottom"]) + "\",\"full\":\"" + Escape(relPaths["bottom"]) + "\"}");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"shoes\": {");
        sb.AppendLine("      \"items\": {");
        sb.AppendLine("        \"shoes_bare\": {\"path\":\"" + Escape(relPaths["shoes"]) + "\",\"full\":\"" + Escape(relPaths["shoes"]) + "\",\"transparent\":true}");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"headwear\": {");
        sb.AppendLine("      \"items\": {");
        sb.AppendLine("        \"headwear_bunny_hood\": {");
        sb.AppendLine("          \"back\":\"" + Escape(relPaths["hood_back"]) + "\",");
        sb.AppendLine("          \"front\":\"" + Escape(relPaths["hood_front"]) + "\"");
        sb.AppendLine("        }");
        sb.AppendLine("      }");
        sb.AppendLine("    },");
        sb.AppendLine("    \"accessory\": {\"items\": {}},");
        sb.AppendLine("    \"weapon\": {\"items\": {}}");
        sb.AppendLine("  },");
        sb.AppendLine("  \"defaultLoadout\": {");
        sb.AppendLine("    \"bodyId\": \"body_female_peach\",");
        sb.AppendLine("    \"skinId\": \"skin_peach\",");
        sb.AppendLine("    \"faceId\": \"face_elf_heterochromia\",");
        sb.AppendLine("    \"earsId\": \"ears_elf_pointed\",");
        sb.AppendLine("    \"hairId\": \"hair_mint_long\",");
        sb.AppendLine("    \"topId\": \"top_sky_wrap\",");
        sb.AppendLine("    \"bottomId\": \"bottom_sky_shorts\",");
        sb.AppendLine("    \"shoesId\": \"shoes_bare\",");
        sb.AppendLine("    \"headwearId\": \"headwear_bunny_hood\",");
        sb.AppendLine("    \"accessoryId\": null,");
        sb.AppendLine("    \"weaponId\": null");
        sb.AppendLine("  },");
        sb.AppendLine("  \"targetBounds\": {");
        sb.AppendLine("    \"face\": {\"left\":83,\"top\":75,\"right\":171,\"bottom\":124},");
        sb.AppendLine("    \"ears\": {\"left\":55,\"top\":76,\"right\":199,\"bottom\":108},");
        sb.AppendLine("    \"hairBack\": {\"left\":40,\"top\":29,\"right\":216,\"bottom\":219},");
        sb.AppendLine("    \"hairFront\": {\"left\":78,\"top\":34,\"right\":177,\"bottom\":130},");
        sb.AppendLine("    \"top\": {\"left\":98,\"top\":132,\"right\":157,\"bottom\":164},");
        sb.AppendLine("    \"bottom\": {\"left\":102,\"top\":162,\"right\":153,\"bottom\":192},");
        sb.AppendLine("    \"hoodBack\": {\"left\":78,\"top\":35,\"right\":178,\"bottom\":139},");
        sb.AppendLine("    \"hoodFront\": {\"left\":52,\"top\":7,\"right\":204,\"bottom\":143}");
        sb.AppendLine("  },");
        sb.AppendLine("  \"notes\": \"Production Style C elf pack. Generators did not preserve scale/registration; plates were chroma-keyed, opaque-bbox detected, and nearest-neighbor registered into explicit 256 contract targets. Front hair extracted from mannequin-contaminated source.\"");
        sb.AppendLine("}");
        return sb.ToString();
    }

    static string ResolveSource(string dir, params string[] names)
    {
        foreach (var name in names)
        {
            var path = Path.Combine(dir, name);
            if (File.Exists(path)) return path;
        }
        foreach (var name in names)
        {
            var token = Path.GetFileNameWithoutExtension(name).Replace("elf-", "").Replace("-chroma", "");
            foreach (var file in Directory.GetFiles(dir, "*.png"))
            {
                var fn = Path.GetFileName(file).ToLowerInvariant();
                var t1 = token.ToLowerInvariant().Replace("_", "-");
                var t2 = token.ToLowerInvariant().Replace("-", "_");
                if (fn.Contains(t1) || fn.Contains(t2))
                    return file;
            }
        }
        throw new FileNotFoundException("Could not resolve source among: " + string.Join(", ", names) + " in " + dir);
    }

    public static ValidationReport ProcessAll(string sourceDirectory, string baseStudyDirectory, string outputDirectory)
    {
        var report = new ValidationReport();
        Directory.CreateDirectory(outputDirectory);
        var dirs = new[] { "bodies", "face", "ears", "hair", "top", "bottom", "shoes", "headwear", "review" };
        foreach (var d in dirs) Directory.CreateDirectory(Path.Combine(outputDirectory, d));

        var femaleBaseSrc = Path.Combine(baseStudyDirectory, "style-c-female-base.png");
        var maleBaseSrc = Path.Combine(baseStudyDirectory, "style-c-male-base.png");
        if (!File.Exists(femaleBaseSrc)) throw new FileNotFoundException("Approved female base missing", femaleBaseSrc);
        if (!File.Exists(maleBaseSrc)) throw new FileNotFoundException("Approved male base missing", maleBaseSrc);

        var faceSrc = ResolveSource(sourceDirectory,
            "elf-face-heterochromia-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-face-heterochromia-chroma.png");
        var earsSrc = ResolveSource(sourceDirectory,
            "elf-ears-pointed-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-ears-pointed-chroma.png");
        var hairBackSrc = ResolveSource(sourceDirectory,
            "elf-hair-mint-back-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-hair-mint-back-chroma.png");
        var hairFrontSrc = ResolveSource(sourceDirectory,
            "elf-hair-mint-front-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-hair-mint-front-chroma.png");
        var topSrc = ResolveSource(sourceDirectory,
            "elf-top-sky-wrap-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-top-sky-wrap-chroma.png");
        var bottomSrc = ResolveSource(sourceDirectory,
            "elf-bottom-sky-shorts-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-bottom-sky-shorts-chroma.png");
        var hoodBackSrc = ResolveSource(sourceDirectory,
            "elf-bunny-hood-back-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-bunny-hood-back-chroma.png");
        var hoodFrontSrc = ResolveSource(sourceDirectory,
            "elf-bunny-hood-front-chroma.png",
            "C__Users_Krisna_.cursor_projects_c-Users-Krisna-Desktop-manhwadle_assets_elf-bunny-hood-front-chroma.png");

        Console.WriteLine("Sources:");
        Console.WriteLine("  face=" + faceSrc);
        Console.WriteLine("  ears=" + earsSrc);
        Console.WriteLine("  hairBack=" + hairBackSrc);
        Console.WriteLine("  hairFront=" + hairFrontSrc);
        Console.WriteLine("  top=" + topSrc);
        Console.WriteLine("  bottom=" + bottomSrc);
        Console.WriteLine("  hoodBack=" + hoodBackSrc);
        Console.WriteLine("  hoodFront=" + hoodFrontSrc);

        var paths = new Dictionary<string, string>();
        paths["body_female"] = "bodies/body_female_peach.png";
        paths["body_male"] = "bodies/body_male_peach.png";
        paths["face"] = "face/face_elf_heterochromia.png";
        paths["ears"] = "ears/ears_elf_pointed.png";
        paths["hair_back"] = "hair/hair_mint_long_back.png";
        paths["hair_front"] = "hair/hair_mint_long_front.png";
        paths["top"] = "top/top_sky_wrap.png";
        paths["bottom"] = "bottom/bottom_sky_shorts.png";
        paths["shoes"] = "shoes/shoes_bare.png";
        paths["hood_back"] = "headwear/headwear_bunny_hood_back.png";
        paths["hood_front"] = "headwear/headwear_bunny_hood_front.png";

        BoundsI sb;
        string extractNote;

        using (var bodyFemale = LoadOrCopyBase(femaleBaseSrc))
        using (var bodyMale = LoadOrCopyBase(maleBaseSrc))
        using (var face = ProcessSimplePlate(faceSrc, TargetFace, out sb, false))
        using (var ears = ProcessSimplePlate(earsSrc, TargetEars, out sb, false))
        using (var hairBack = ProcessSimplePlate(hairBackSrc, TargetHairBack, out sb, true))
        using (var hairFront = ExtractFrontHairPlate(hairFrontSrc, TargetHairFront, out sb, out extractNote))
        using (var top = ProcessSimplePlate(topSrc, TargetTop, out sb, true))
        using (var bottom = ProcessSimplePlate(bottomSrc, TargetBottom, out sb, true))
        using (var shoes = MakeTransparentPlate())
        using (var hoodBack = ProcessSimplePlate(hoodBackSrc, TargetHoodBack, out sb, true))
        using (var hoodFront = ProcessSimplePlate(hoodFrontSrc, TargetHoodFront, out sb, true))
        {
            Console.WriteLine("Front-hair extract: " + extractNote);
            report.Pass("front-hair extraction: " + extractNote);

            bodyFemale.Save(Path.Combine(outputDirectory, paths["body_female"]), ImageFormat.Png);
            bodyMale.Save(Path.Combine(outputDirectory, paths["body_male"]), ImageFormat.Png);
            face.Save(Path.Combine(outputDirectory, paths["face"]), ImageFormat.Png);
            ears.Save(Path.Combine(outputDirectory, paths["ears"]), ImageFormat.Png);
            hairBack.Save(Path.Combine(outputDirectory, paths["hair_back"]), ImageFormat.Png);
            hairFront.Save(Path.Combine(outputDirectory, paths["hair_front"]), ImageFormat.Png);
            top.Save(Path.Combine(outputDirectory, paths["top"]), ImageFormat.Png);
            bottom.Save(Path.Combine(outputDirectory, paths["bottom"]), ImageFormat.Png);
            shoes.Save(Path.Combine(outputDirectory, paths["shoes"]), ImageFormat.Png);
            hoodBack.Save(Path.Combine(outputDirectory, paths["hood_back"]), ImageFormat.Png);
            hoodFront.Save(Path.Combine(outputDirectory, paths["hood_front"]), ImageFormat.Png);

            ValidatePlateBasics(bodyFemale, "body_female", report, false);
            ValidatePlateBasics(bodyMale, "body_male", report, false);
            ValidatePlateBasics(face, "face", report, false);
            ValidatePlateBasics(ears, "ears", report, false);
            ValidatePlateBasics(hairBack, "hair_back", report, false);
            ValidatePlateBasics(hairFront, "hair_front", report, false);
            ValidatePlateBasics(top, "top", report, false);
            ValidatePlateBasics(bottom, "bottom", report, false);
            ValidatePlateBasics(shoes, "shoes_bare", report, true);
            ValidatePlateBasics(hoodBack, "hood_back", report, false);
            ValidatePlateBasics(hoodFront, "hood_front", report, false);

            ValidateFace(face, report);
            ValidateEarCoverage(ears, report);

            ValidateBoundsNear(hairBack, "hair_back", TargetHairBack, 4, report);
            ValidateBoundsNear(hairFront, "hair_front", TargetHairFront, 6, report);
            ValidateBoundsNear(top, "top", TargetTop, 4, report);
            ValidateBoundsNear(bottom, "bottom", TargetBottom, 4, report);
            ValidateBoundsNear(hoodBack, "hood_back", TargetHoodBack, 4, report);
            ValidateBoundsNear(hoodFront, "hood_front", TargetHoodFront, 4, report);

            ValidateNoForbiddenSkinGray(hairBack, "hair_back", report);
            ValidateNoForbiddenSkinGray(hairFront, "hair_front", report);
            ValidateNoForbiddenSkinGray(top, "top", report);
            ValidateNoForbiddenSkinGray(bottom, "bottom", report);
            ValidateNoForbiddenSkinGray(hoodBack, "hood_back", report);
            ValidateNoForbiddenSkinGray(hoodFront, "hood_front", report);

            using (var femaleComposite = CompositeLayers(
                hoodBack, hairBack, bodyFemale, ears, shoes, bottom, top, face, hairFront, hoodFront))
            using (var maleComposite = CompositeLayers(
                hoodBack, hairBack, bodyMale, ears, shoes, bottom, top, face, hairFront, hoodFront))
            {
                var fBounds = FindOpaqueBounds(femaleComposite);
                var mBounds = FindOpaqueBounds(maleComposite);
                report.Pass("composite female silhouette " + fBounds.Label);
                report.Pass("composite male silhouette " + mBounds.Label);
                if (fBounds.Bottom >= 200) report.Pass("composite female reaches near baseline");
                else report.Warn("composite female bottom=" + fBounds.Bottom + " (expected near 224)");
                if (mBounds.Bottom >= 200) report.Pass("composite male reaches near baseline");
                else report.Warn("composite male bottom=" + mBounds.Bottom + " (expected near 224)");

                DrawReviewComposite(femaleComposite, "Style C elf pack - composite on female",
                    Path.Combine(outputDirectory, "review", "composite-female.png"));
                DrawReviewComposite(maleComposite, "Style C elf pack - composite on male",
                    Path.Combine(outputDirectory, "review", "composite-male.png"));
                DrawAnchorOverlay(femaleComposite,
                    Path.Combine(outputDirectory, "review", "shared-anchor-overlay.png"));
                MakeSizeCheck(femaleComposite,
                    Path.Combine(outputDirectory, "review", "size-check.png"));
            }

            var plateMap = new Dictionary<string, Bitmap>();
            plateMap["hair_back"] = hairBack;
            plateMap["body"] = bodyFemale;
            plateMap["ears"] = ears;
            plateMap["shoes"] = shoes;
            plateMap["bottom"] = bottom;
            plateMap["top"] = top;
            plateMap["face"] = face;
            plateMap["hair_front"] = hairFront;
            plateMap["hood_back"] = hoodBack;
            plateMap["hood_front"] = hoodFront;
            DrawLayerStack(plateMap, Path.Combine(outputDirectory, "review", "layer-stack.png"));

            File.WriteAllText(
                Path.Combine(outputDirectory, "manifest.json"),
                BuildManifest(paths),
                Encoding.UTF8
            );
            report.Pass("manifest.json written with 11 slots");
        }

        return report;
    }
}
'@

Write-Host "SourceDirectory=$SourceDirectory"
Write-Host "BaseStudyDirectory=$BaseStudyDirectory"
Write-Host "OutputDirectory=$OutputDirectory"

$report = [AvatarElfPackProcessor]::ProcessAll($SourceDirectory, $BaseStudyDirectory, $OutputDirectory)

Write-Host ""
Write-Host "=== Validation report ==="
foreach ($line in $report.AllLines()) {
  Write-Host $line
}
Write-Host ""
if ($report.Ok) {
  Write-Host "VALIDATION OK - pack written to $OutputDirectory"
  exit 0
} else {
  Write-Host "VALIDATION FAILED - see [FAIL] lines above. Pack files were still written for inspection."
  exit 1
}
