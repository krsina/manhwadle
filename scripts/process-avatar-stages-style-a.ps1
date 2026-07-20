param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  [string[]]$StageFiles = @(),
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

public static class StageProcessor
{
    public const int Width = 512;
    public const int Height = 384;

    public static void Process(string sourcePath, string outputPath)
    {
        using (var source = new Bitmap(sourcePath))
        using (var output = new Bitmap(Width, Height, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(output))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
            graphics.PixelOffsetMode = PixelOffsetMode.Half;
            graphics.SmoothingMode = SmoothingMode.None;
            graphics.DrawImage(
                source,
                new Rectangle(0, 0, Width, Height),
                new Rectangle(0, 0, source.Width, source.Height),
                GraphicsUnit.Pixel
            );
            output.Save(outputPath, ImageFormat.Png);
        }
    }

    static List<string> ListStages(string outputDirectory)
    {
        var list = new List<string>();
        foreach (var path in Directory.GetFiles(outputDirectory, "*.png"))
        {
            list.Add(Path.GetFileName(path));
        }
        list.Sort(StringComparer.OrdinalIgnoreCase);
        return list;
    }

    public static void MakeComparison(string outputDirectory, string outputPath)
    {
        var files = ListStages(outputDirectory);
        if (files.Count == 0) return;

        const int cardW = 280;
        const int cardH = 230;
        const int gap = 16;
        const int pad = 16;
        var sheetW = pad * 2 + files.Count * cardW + (files.Count - 1) * gap;
        var sheetH = pad * 2 + cardH;

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
                var x = pad + i * (cardW + gap);
                graphics.FillRectangle(cardBrush, x, pad, cardW, cardH);
                graphics.DrawRectangle(borderPen, x, pad, cardW, cardH);
                var path = Path.Combine(outputDirectory, files[i]);
                if (File.Exists(path))
                {
                    using (var image = new Bitmap(path))
                    {
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        var dest = new Rectangle(x + 8, pad + 8, cardW - 16, 168);
                        graphics.DrawImage(image, dest, new Rectangle(0, 0, image.Width, image.Height), GraphicsUnit.Pixel);
                    }
                }
                var label = Path.GetFileNameWithoutExtension(files[i]).ToUpperInvariant().Replace('-', ' ');
                var labelSize = graphics.MeasureString(label, labelFont);
                graphics.DrawString(label, labelFont, labelBrush, x + (cardW - labelSize.Width) / 2, pad + cardH - 28);
            }

            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void MakeSizeCheck(string outputDirectory, string outputPath)
    {
        var files = ListStages(outputDirectory);
        if (files.Count == 0) return;

        var heights = new[] { 76, 112, 216 };
        const int colW = 300;
        const int pad = 16;
        var sheetW = pad * 2 + files.Count * colW;
        var sheetH = 420;

        using (var sheet = new Bitmap(sheetW, sheetH, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        using (var labelFont = new Font("Segoe UI", 12, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var labelBrush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var guideBrush = new SolidBrush(Color.FromArgb(160, 160, 170)))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
            graphics.DrawString("Style A stages - 76 / 112 / 216 px tall crops", labelFont, labelBrush, pad, 12);

            for (var i = 0; i < files.Count; i++)
            {
                var columnX = pad + i * colW;
                var label = Path.GetFileNameWithoutExtension(files[i]).ToUpperInvariant().Replace('-', ' ');
                graphics.DrawString(label, labelFont, labelBrush, columnX, 40);
                var path = Path.Combine(outputDirectory, files[i]);
                if (!File.Exists(path)) continue;
                using (var image = new Bitmap(path))
                {
                    var y = 68;
                    foreach (var h in heights)
                    {
                        var w = (int)Math.Round(h * (Width / (double)Height));
                        graphics.DrawString(h + " px", labelFont, guideBrush, columnX, y + Math.Max(0, (h - 14) / 2));
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImage(
                            image,
                            new Rectangle(columnX + 56, y, w, h),
                            new Rectangle(0, 0, image.Width, image.Height),
                            GraphicsUnit.Pixel
                        );
                        y += h + 16;
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
  if ($StageFiles.Count -eq 0) {
    $StageFiles = @(Get-ChildItem -Path $SourceDirectory -Filter '*.png' -File |
      Sort-Object Name |
      ForEach-Object { $_.Name })
  }

  if ($StageFiles.Count -eq 0) {
    Write-Error "No PNG stage sources found in $SourceDirectory"
    exit 1
  }

  foreach ($name in $StageFiles) {
    $sourcePath = Join-Path $SourceDirectory $name
    if (-not (Test-Path $sourcePath)) {
      Write-Warning "Missing stage source: $sourcePath"
      continue
    }
    [StageProcessor]::Process($sourcePath, (Join-Path $OutputDirectory $name))
    Write-Output "Processed $name -> 512x384"
  }
}

[StageProcessor]::MakeComparison(
  $OutputDirectory,
  (Join-Path $OutputDirectory 'review\comparison.png')
)

[StageProcessor]::MakeSizeCheck(
  $OutputDirectory,
  (Join-Path $OutputDirectory 'review\size-check.png')
)

Write-Output "Wrote Style A stage assets to $OutputDirectory"
