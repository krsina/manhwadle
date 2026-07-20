param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class AvatarStudyProcessor
{
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
                    var magenta = color.R > 140
                        && color.B > 125
                        && color.G < Math.Min(color.R, color.B) * 0.62;
                    keyed.SetPixel(
                        x,
                        y,
                        magenta ? Color.Transparent : Color.FromArgb(255, color.R, color.G, color.B)
                    );
                }
            }

            using (var output = new Bitmap(256, 256, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(output))
            {
                graphics.Clear(Color.Transparent);
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.CompositingQuality = CompositingQuality.HighSpeed;
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

    public static void MakeComparison(string outputDirectory, string outputPath)
    {
        var files = new[]
        {
            "elfbunny-study-a-classic.png",
            "elfbunny-study-b-expressive.png",
            "elfbunny-study-c-compact.png",
            "elfbunny-study-d-polished.png"
        };
        var labels = new[] { "A  CLASSIC", "B  EXPRESSIVE", "C  COMPACT", "D  POLISHED" };

        using (var sheet = new Bitmap(1120, 336, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        using (var labelFont = new Font("Segoe UI", 16, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var labelBrush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var cardBrush = new SolidBrush(Color.FromArgb(37, 37, 43)))
        using (var borderPen = new Pen(Color.FromArgb(73, 73, 82), 1))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;

            for (var i = 0; i < files.Length; i++)
            {
                var x = 16 + i * 276;
                graphics.FillRectangle(cardBrush, x, 16, 264, 304);
                graphics.DrawRectangle(borderPen, x, 16, 264, 304);
                using (var image = new Bitmap(Path.Combine(outputDirectory, files[i])))
                {
                    graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                    graphics.PixelOffsetMode = PixelOffsetMode.Half;
                    graphics.DrawImageUnscaled(image, x + 4, 20);
                }

                var labelSize = graphics.MeasureString(labels[i], labelFont);
                graphics.DrawString(
                    labels[i],
                    labelFont,
                    labelBrush,
                    x + (264 - labelSize.Width) / 2,
                    286
                );
            }

            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void MakeSizeCheck(string outputDirectory, string outputPath)
    {
        var files = new[]
        {
            "elfbunny-study-a-classic.png",
            "elfbunny-study-b-expressive.png",
            "elfbunny-study-c-compact.png",
            "elfbunny-study-d-polished.png"
        };
        var labels = new[] { "A", "B", "C", "D" };
        var sizes = new[] { 30, 76, 184 };

        using (var sheet = new Bitmap(896, 376, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        using (var labelFont = new Font("Segoe UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var labelBrush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var guideBrush = new SolidBrush(Color.FromArgb(160, 160, 170)))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
            graphics.DrawString("Actual-size readability: 30 px / 76 px / 184 px", labelFont, labelBrush, 16, 12);

            for (var i = 0; i < files.Length; i++)
            {
                var columnX = 16 + i * 220;
                graphics.DrawString(labels[i], labelFont, labelBrush, columnX, 42);
                using (var image = new Bitmap(Path.Combine(outputDirectory, files[i])))
                {
                    var y = 70;
                    foreach (var size in sizes)
                    {
                        graphics.DrawString(size + " px", labelFont, guideBrush, columnX, y + (size - 14) / 2);
                        graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        graphics.PixelOffsetMode = PixelOffsetMode.Half;
                        graphics.DrawImage(
                            image,
                            new Rectangle(columnX + 48, y, size, size),
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

$variants = @(
  @{ Source = 'elfbunny-study-a-classic-chroma.png'; Output = 'elfbunny-study-a-classic.png' },
  @{ Source = 'elfbunny-study-b-expressive-chroma.png'; Output = 'elfbunny-study-b-expressive.png' },
  @{ Source = 'elfbunny-study-c-compact-chroma.png'; Output = 'elfbunny-study-c-compact.png' },
  @{ Source = 'elfbunny-study-d-polished-chroma.png'; Output = 'elfbunny-study-d-polished.png' }
)

foreach ($variant in $variants) {
  [AvatarStudyProcessor]::Process(
    (Join-Path $SourceDirectory $variant.Source),
    (Join-Path $OutputDirectory $variant.Output)
  )
}

[AvatarStudyProcessor]::MakeComparison(
  $OutputDirectory,
  (Join-Path $OutputDirectory 'elfbunny-study-comparison.png')
)

[AvatarStudyProcessor]::MakeSizeCheck(
  $OutputDirectory,
  (Join-Path $OutputDirectory 'elfbunny-study-size-check.png')
)
