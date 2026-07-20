# Clean residual magenta chroma fringe from already-keyed Style A whole-character PNGs.
# Edge-focused: removes dark magenta/pink halo pixels left after chroma key.
# Avoids interior despilling so intentional purple auras (Shadow Hunter) stay intact.

param(
  [string]$Directory = (Join-Path $PSScriptRoot '..\public\avatar-characters\style-a')
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class MagentaFringeCleaner
{
    static bool IsOpaque(Color c)
    {
        return c.A > 16;
    }

    // Classic hot magenta + soft/dark magenta fringe (low green, both R and B present).
    static bool IsMagentaFringe(Color c)
    {
        if (c.A <= 8) return false;
        var minRB = Math.Min(c.R, c.B);
        var maxRB = Math.Max(c.R, c.B);
        if (minRB < 10) return false;
        // Green must sit clearly below both red and blue (magenta axis).
        if (c.G + 5 >= minRB) return false;
        // Reject pure red or pure blue accents (lips, cyan glow): channels should both contribute.
        if (maxRB > minRB * 2.8 + 20) return false;
        // Reject warm browns / skin (R dominates, B stays relatively low vs R-G structure).
        if (c.R > c.B + 35 && c.G > c.B) return false;
        return true;
    }

    static bool HasTransparentNeighbor(Color[,] px, int x, int y, int w, int h)
    {
        for (var dy = -1; dy <= 1; dy++)
        {
            for (var dx = -1; dx <= 1; dx++)
            {
                if (dx == 0 && dy == 0) continue;
                var nx = x + dx;
                var ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
                if (!IsOpaque(px[nx, ny])) return true;
            }
        }
        return false;
    }

    static int CountTransparentNeighbors(Color[,] px, int x, int y, int w, int h)
    {
        var n = 0;
        for (var dy = -1; dy <= 1; dy++)
        {
            for (var dx = -1; dx <= 1; dx++)
            {
                if (dx == 0 && dy == 0) continue;
                var nx = x + dx;
                var ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h || !IsOpaque(px[nx, ny])) n++;
            }
        }
        return n;
    }

    public static int CleanFile(string path)
    {
        Color[,] pixels;
        int w;
        int h;
        using (var source = new Bitmap(path))
        {
            w = source.Width;
            h = source.Height;
            pixels = new Color[w, h];
            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    pixels[x, y] = source.GetPixel(x, y);
                }
            }
        }

        var changed = 0;
        var outPx = new Color[w, h];
        for (var y = 0; y < h; y++)
        {
            for (var x = 0; x < w; x++)
            {
                var c = pixels[x, y];
                if (c.A == 0)
                {
                    outPx[x, y] = Color.Transparent;
                    continue;
                }

                var edge = HasTransparentNeighbor(pixels, x, y, w, h);
                if (edge && IsMagentaFringe(c))
                {
                    outPx[x, y] = Color.Transparent;
                    changed++;
                    continue;
                }

                outPx[x, y] = c;
            }
        }

        // Second pass: drop remaining fringe islands that became newly edged.
        for (var pass = 0; pass < 2; pass++)
        {
            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    var c = outPx[x, y];
                    if (!IsOpaque(c) || !IsMagentaFringe(c)) continue;
                    if (CountTransparentNeighbors(outPx, x, y, w, h) >= 3)
                    {
                        outPx[x, y] = Color.Transparent;
                        changed++;
                    }
                }
            }
        }

        using (var output = new Bitmap(w, h, PixelFormat.Format32bppArgb))
        {
            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    output.SetPixel(x, y, outPx[x, y]);
                }
            }
            var temp = path + ".tmp.png";
            output.Save(temp, ImageFormat.Png);
            File.Delete(path);
            File.Move(temp, path);
        }

        return changed;
    }
}
'@

$resolved = Resolve-Path $Directory
$files = @(Get-ChildItem -Path $resolved -Filter '*.png' -File |
  Where-Object { $_.Name -ne 'elfbunny-style-a-ref.png' } |
  Sort-Object Name)

if ($files.Count -eq 0) {
  Write-Warning "No production PNGs found in $resolved"
  exit 0
}

foreach ($file in $files) {
  $changed = [MagentaFringeCleaner]::CleanFile($file.FullName)
  Write-Output "$($file.Name) : cleaned $changed fringe pixels"
}

Write-Output "Done. Hard-refresh the shop to bypass image cache."
