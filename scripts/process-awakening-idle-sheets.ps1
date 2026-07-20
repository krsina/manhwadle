param(
  [string]$AssetsDir = "$env:USERPROFILE\.cursor\projects\c-Users-Krisna-Desktop-manhwadle\assets",
  [string]$WorkDir = "tmp\avatar-awakening\plum-blossom-blade",
  [string]$BasePlate = "public\avatar-characters\style-a\plum-blossom-blade.png",
  [string]$OutDir = "public\avatar-characters\style-a\awakened"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class AwakeningFrameProcessor
{
    static bool IsMagenta(Color color)
    {
        return color.A > 8
            && color.R > 140
            && color.B > 125
            && color.G < Math.Min(color.R, color.B) * 0.62;
    }

    static bool IsSoftMagentaFringe(Color color)
    {
        if (color.A <= 8) return false;
        var minRB = Math.Min(color.R, color.B);
        return minRB > 90
            && color.G + 18 < minRB
            && (Math.Max(color.R, color.B) - color.G) >= 28
            && (color.R + color.B) > color.G * 2.15;
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

    public static void ProcessTo256(string sourcePath, string outputPath)
    {
        using (var source = new Bitmap(sourcePath))
        using (var keyed = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var color = source.GetPixel(x, y);
                    var magenta = IsMagenta(color) || IsSoftMagentaFringe(color);
                    keyed.SetPixel(x, y, magenta ? Color.Transparent : DespillMagenta(color));
                }
            }

            using (var output = new Bitmap(256, 256, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(output))
            {
                graphics.Clear(Color.Transparent);
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                graphics.PixelOffsetMode = PixelOffsetMode.Half;
                graphics.SmoothingMode = SmoothingMode.None;
                graphics.DrawImage(
                    keyed,
                    new Rectangle(0, 0, 256, 256),
                    new Rectangle(0, 0, keyed.Width, keyed.Height),
                    GraphicsUnit.Pixel
                );
                ClearFakeBackground(output);
                output.Save(outputPath, ImageFormat.Png);
            }
        }
    }

    // Generator sometimes bakes opaque light-gray / near-white "transparency" instead of alpha.
    // Flood-fill edge-connected low-chroma light pixels to real transparency.
    static bool IsFakeBackground(Color color)
    {
        if (color.A < 8) return true;
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        if (max - min > 22) return false; // chromatic (robe pink, etc.)
        // light gray / off-white / checkerboard remnant
        if (min >= 168) return true;
        // mid gray checker cells sometimes used for "transparent"
        if (min >= 120 && max <= 210) return true;
        return false;
    }

    public static void ClearFakeBackground(Bitmap bitmap)
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
            if (!IsFakeBackground(c)) return;
            visited[i] = true;
            queue.Enqueue(i);
        };

        for (var x = 0; x < w; x++)
        {
            enqueue(x, 0);
            enqueue(x, h - 1);
        }
        for (var y = 0; y < h; y++)
        {
            enqueue(0, y);
            enqueue(w - 1, y);
        }

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

    public static void ClearFakeBackgroundFile(string path)
    {
        var tempPath = path + ".tmp.png";
        using (var bitmap = new Bitmap(path))
        using (var clone = new Bitmap(bitmap.Width, bitmap.Height, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(clone))
        {
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.DrawImageUnscaled(bitmap, 0, 0);
            ClearFakeBackground(clone);
            clone.Save(tempPath, ImageFormat.Png);
        }
        File.Delete(path);
        File.Move(tempPath, path);
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

New-Item -ItemType Directory -Force -Path (Join-Path $WorkDir 'frames'), (Join-Path $WorkDir 'chroma'), $OutDir | Out-Null

# Frame 1 for both tiers = existing production plate
$f1 = Join-Path $WorkDir 'frames\f1.png'
Copy-Item -Force $BasePlate $f1

function Get-Asset([string]$name) {
  $p = Join-Path $AssetsDir $name
  if (-not (Test-Path $p)) { throw "Missing asset: $p" }
  return $p
}

# Process Awakening I frames 2-4
foreach ($n in 2, 3, 4) {
  $src = Get-Asset "plum-f$n-chroma.png"
  $chromaOut = Join-Path $WorkDir "chroma\i-f$n-chroma.png"
  $frameOut = Join-Path $WorkDir "frames\i-f$n.png"
  Copy-Item -Force $src $chromaOut
  [AwakeningFrameProcessor]::ProcessTo256($chromaOut, $frameOut)
  Write-Output "I frame $n -> $frameOut"
}

# Process Awakening II frames 2-6
foreach ($n in 2, 3, 4, 5, 6) {
  $src = Get-Asset "plum-ii-f$n-chroma.png"
  $chromaOut = Join-Path $WorkDir "chroma\ii-f$n-chroma.png"
  $frameOut = Join-Path $WorkDir "frames\ii-f$n.png"
  Copy-Item -Force $src $chromaOut
  [AwakeningFrameProcessor]::ProcessTo256($chromaOut, $frameOut)
  Write-Output "II frame $n -> $frameOut"
}

$sheet1 = Join-Path $OutDir 'plum-blossom-blade-idle-1.png'
$sheet2 = Join-Path $OutDir 'plum-blossom-blade-idle-2.png'

[AwakeningFrameProcessor]::StitchHorizontal(
  @(
    $f1,
    (Join-Path $WorkDir 'frames\i-f2.png'),
    (Join-Path $WorkDir 'frames\i-f3.png'),
    (Join-Path $WorkDir 'frames\i-f4.png')
  ),
  $sheet1
)

[AwakeningFrameProcessor]::StitchHorizontal(
  @(
    $f1,
    (Join-Path $WorkDir 'frames\ii-f2.png'),
    (Join-Path $WorkDir 'frames\ii-f3.png'),
    (Join-Path $WorkDir 'frames\ii-f4.png'),
    (Join-Path $WorkDir 'frames\ii-f5.png'),
    (Join-Path $WorkDir 'frames\ii-f6.png')
  ),
  $sheet2
)

Write-Output "Wrote $sheet1"
Write-Output "Wrote $sheet2"
foreach ($p in @($sheet1, $sheet2)) {
  $img = [System.Drawing.Image]::FromFile((Resolve-Path $p))
  Write-Output ("{0}: {1}x{2} ({3} bytes)" -f (Split-Path $p -Leaf), $img.Width, $img.Height, (Get-Item $p).Length)
  $img.Dispose()
}
