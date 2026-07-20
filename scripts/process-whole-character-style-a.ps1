param(
  [string]$SourceDirectory = '',
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  # When set, only process these chroma basenames (e.g. plum-blossom-blade-style-a-chroma.png).
  # Default: discover every *-style-a-chroma.png in SourceDirectory.
  [string[]]$ChromaFiles = @(),
  # Skip chroma keying; only rebuild comparison/size-check from existing production PNGs.
  [switch]$ReviewOnly
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class WholeCharacterProcessor
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

    public static void Process(string sourcePath, string outputPath)
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
                    keyed.SetPixel(
                        x,
                        y,
                        magenta ? Color.Transparent : DespillMagenta(color)
                    );
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
                output.Save(outputPath, ImageFormat.Png);
            }
        }
    }

    static List<string> ListProductionPngs(string outputDirectory)
    {
        var list = new List<string>();
        foreach (var path in Directory.GetFiles(outputDirectory, "*.png"))
        {
            var name = Path.GetFileName(path);
            if (string.Equals(name, "elfbunny-style-a-ref.png", StringComparison.OrdinalIgnoreCase))
                continue;
            list.Add(name);
        }
        list.Sort(StringComparer.OrdinalIgnoreCase);
        return list;
    }

    static string ShortLabel(string fileName)
    {
        var slug = Path.GetFileNameWithoutExtension(fileName);
        return slug.ToUpperInvariant().Replace('-', ' ');
    }

    public static void MakeComparison(string outputDirectory, string outputPath)
    {
        var files = ListProductionPngs(outputDirectory);
        if (files.Count == 0) return;

        const int cols = 4;
        const int cardW = 264;
        const int cardH = 304;
        const int gap = 24;
        const int pad = 16;
        var rows = (files.Count + cols - 1) / cols;
        var sheetW = pad * 2 + cols * cardW + (cols - 1) * gap;
        var sheetH = pad * 2 + rows * cardH + (rows - 1) * gap;

        using (var sheet = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        using (var labelFont = new Font("Segoe UI", 12, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var labelBrush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var cardBrush = new SolidBrush(Color.FromArgb(37, 37, 43)))
        using (var borderPen = new Pen(Color.FromArgb(73, 73, 82), 1))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;

            for (var i = 0; i < files.Count; i++)
            {
                var col = i % cols;
                var row = i / cols;
                var x = pad + col * (cardW + gap);
                var y = pad + row * (cardH + gap);
                graphics.FillRectangle(cardBrush, x, y, cardW, cardH);
                graphics.DrawRectangle(borderPen, x, y, cardW, cardH);
                var path = Path.Combine(outputDirectory, files[i]);
                if (File.Exists(path))
                {
                    using (var image = new Bitmap(path))
                    {
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImageUnscaled(image, x + 4, y + 4);
                    }
                }
                var label = ShortLabel(files[i]);
                if (label.Length > 22) label = label.Substring(0, 22);
                var labelSize = graphics.MeasureString(label, labelFont);
                graphics.DrawString(
                    label,
                    labelFont,
                    labelBrush,
                    x + (cardW - labelSize.Width) / 2,
                    y + cardH - 22
                );
            }

            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void MakeSizeCheck(string outputDirectory, string outputPath)
    {
        var files = ListProductionPngs(outputDirectory);
        if (files.Count == 0) return;

        var sizes = new[] { 30, 76, 184 };
        const int cols = 4;
        const int colW = 270;
        const int rowH = 340;
        const int pad = 16;
        var rows = (files.Count + cols - 1) / cols;
        var sheetW = pad * 2 + cols * colW;
        var sheetH = 48 + rows * rowH + pad;

        using (var sheet = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        using (var labelFont = new Font("Segoe UI", 12, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var labelBrush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var guideBrush = new SolidBrush(Color.FromArgb(160, 160, 170)))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
            graphics.DrawString("Style A whole characters - 30 / 76 / 184 px", labelFont, labelBrush, pad, 12);

            for (var i = 0; i < files.Count; i++)
            {
                var col = i % cols;
                var row = i / cols;
                var columnX = pad + col * colW;
                var baseY = 48 + row * rowH;
                var label = ShortLabel(files[i]);
                if (label.Length > 18) label = label.Substring(0, 18);
                graphics.DrawString(label, labelFont, labelBrush, columnX, baseY);
                var path = Path.Combine(outputDirectory, files[i]);
                if (!File.Exists(path)) continue;
                using (var image = new Bitmap(path))
                {
                    var y = baseY + 24;
                    foreach (var size in sizes)
                    {
                        graphics.DrawString(size + " px", labelFont, guideBrush, columnX, y + Math.Max(0, (size - 14) / 2));
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImage(
                            image,
                            new Rectangle(columnX + 56, y, size, size),
                            new Rectangle(0, 0, image.Width, image.Height),
                            GraphicsUnit.Pixel
                        );
                        y += size + 12;
                    }
                }
            }

            sheet.Save(outputPath, ImageFormat.Png);
        }
    }
}
'@

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $OutputDirectory 'review') | Out-Null

if (-not $ReviewOnly) {
  if ($ChromaFiles.Count -eq 0) {
    $ChromaFiles = @(Get-ChildItem -Path $SourceDirectory -Filter '*-style-a-chroma.png' |
      Sort-Object Name |
      ForEach-Object { $_.Name })
  }

  if ($ChromaFiles.Count -eq 0) {
    Write-Error "No *-style-a-chroma.png files found in $SourceDirectory"
    exit 1
  }

  foreach ($sourceName in $ChromaFiles) {
    $sourcePath = Join-Path $SourceDirectory $sourceName
    if (-not (Test-Path $sourcePath)) {
      Write-Warning "Missing chroma source: $sourcePath"
      continue
    }
    if ($sourceName -notmatch '^(?<slug>.+)-style-a-chroma\.png$') {
      Write-Warning "Unexpected chroma name (expected <slug>-style-a-chroma.png): $sourceName"
      continue
    }
    $slug = $Matches['slug']
    $outputName = "$slug.png"
    [WholeCharacterProcessor]::Process(
      $sourcePath,
      (Join-Path $OutputDirectory $outputName)
    )
    Write-Output "Processed $sourceName -> $outputName"
  }

  # Copy Style A reference into the folder for comparison (already 256 RGBA)
  $publicRoot = Split-Path (Split-Path $OutputDirectory -Parent) -Parent
  $refSrc = Join-Path $publicRoot 'avatar-style-study\elfbunny-study-a-classic.png'
  if (Test-Path $refSrc) {
    Copy-Item -Force $refSrc (Join-Path $OutputDirectory 'elfbunny-style-a-ref.png')
  }
}

[WholeCharacterProcessor]::MakeComparison(
  $OutputDirectory,
  (Join-Path $OutputDirectory 'review\comparison.png')
)

[WholeCharacterProcessor]::MakeSizeCheck(
  $OutputDirectory,
  (Join-Path $OutputDirectory 'review\size-check.png')
)

Write-Output "Wrote whole-character Style A assets to $OutputDirectory"
