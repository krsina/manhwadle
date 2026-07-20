param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Text;

public static class AvatarBaseStudyProcessor
{
    public class PointI
    {
        public int X;
        public int Y;
        public PointI(int x, int y) { X = x; Y = y; }
    }

    public class BoundsI
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
        public BoundsI(int left, int top, int right, int bottom)
        {
            Left = left; Top = top; Right = right; Bottom = bottom;
        }
        public int Width { get { return Right - Left + 1; } }
        public int Height { get { return Bottom - Top + 1; } }
        public PointI Center
        {
            get { return new PointI((Left + Right) / 2, (Top + Bottom) / 2); }
        }
    }

    public class AnchorMap
    {
        public int CanvasSize = 256;
        public PointI CanvasCenter;
        public PointI HeadCenter;
        public PointI FaceCenter;
        public BoundsI FaceBounds;
        public int EyeLineY;
        public int HairlineY;
        public PointI EarLeft;
        public PointI EarRight;
        public PointI Neck;
        public PointI ShoulderLeft;
        public PointI ShoulderRight;
        public PointI ElbowLeft;
        public PointI ElbowRight;
        public PointI WristLeft;
        public PointI WristRight;
        public PointI Waist;
        public PointI HipLeft;
        public PointI HipRight;
        public PointI KneeLeft;
        public PointI KneeRight;
        public PointI AnkleLeft;
        public PointI AnkleRight;
        public PointI SoleLeft;
        public PointI SoleRight;
        public int GroundBaselineY;
        public BoundsI SilhouetteBounds;
        public BoundsI UnderlayerBounds;
        public string ApprovalStatus = "approved";
        public string ApprovalDate = "2026-07-18";
    }

    static bool IsMagenta(Color color)
    {
        return color.R > 140
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
        // Peach skin family; exclude dark outline and gray underlayer.
        return color.R > 180 && color.G > 120 && color.B > 90
            && color.R > color.G && color.G >= color.B
            && (color.R - color.B) > 20;
    }

    static bool IsUnderlayerLike(Color color)
    {
        if (!IsOpaque(color)) return false;
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        return max - min < 28 && max > 70 && max < 170;
    }

    static bool IsOutlineLike(Color color)
    {
        if (!IsOpaque(color)) return false;
        return color.R < 90 && color.G < 70 && color.B < 90;
    }

    public static Bitmap KeyAndResize(string sourcePath)
    {
        using (var source = new Bitmap(sourcePath))
        using (var keyed = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var color = source.GetPixel(x, y);
                    keyed.SetPixel(
                        x,
                        y,
                        IsMagenta(color)
                            ? Color.Transparent
                            : Color.FromArgb(255, color.R, color.G, color.B)
                    );
                }
            }

            var output = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
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
            }
            return output;
        }
    }

    static BoundsI FindOpaqueBounds(Bitmap image)
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
        if (right < 0) throw new InvalidOperationException("No opaque pixels found after chroma key.");
        return new BoundsI(left, top, right, bottom);
    }

    static int[] RowLeft(Bitmap image)
    {
        var left = new int[image.Height];
        for (var y = 0; y < image.Height; y++)
        {
            left[y] = -1;
            for (var x = 0; x < image.Width; x++)
            {
                if (IsOpaque(image.GetPixel(x, y)))
                {
                    left[y] = x;
                    break;
                }
            }
        }
        return left;
    }

    static int[] RowRight(Bitmap image)
    {
        var right = new int[image.Height];
        for (var y = 0; y < image.Height; y++)
        {
            right[y] = -1;
            for (var x = image.Width - 1; x >= 0; x--)
            {
                if (IsOpaque(image.GetPixel(x, y)))
                {
                    right[y] = x;
                    break;
                }
            }
        }
        return right;
    }

    static int[] RowWidth(int[] left, int[] right)
    {
        var width = new int[left.Length];
        for (var y = 0; y < left.Length; y++)
        {
            width[y] = (left[y] >= 0 && right[y] >= 0) ? (right[y] - left[y] + 1) : 0;
        }
        return width;
    }

    static int FindMaxWidthY(int[] width, int y0, int y1)
    {
        var bestY = y0;
        var bestW = -1;
        for (var y = y0; y <= y1; y++)
        {
            if (width[y] > bestW)
            {
                bestW = width[y];
                bestY = y;
            }
        }
        return bestY;
    }

    static int FindMinWidthY(int[] width, int y0, int y1)
    {
        var bestY = y0;
        var bestW = int.MaxValue;
        for (var y = y0; y <= y1; y++)
        {
            if (width[y] > 0 && width[y] < bestW)
            {
                bestW = width[y];
                bestY = y;
            }
        }
        return bestY;
    }

    static BoundsI FindMaterialBounds(Bitmap image, Func<Color, bool> predicate)
    {
        var left = image.Width;
        var top = image.Height;
        var right = -1;
        var bottom = -1;
        for (var y = 0; y < image.Height; y++)
        {
            for (var x = 0; x < image.Width; x++)
            {
                if (!predicate(image.GetPixel(x, y))) continue;
                if (x < left) left = x;
                if (x > right) right = x;
                if (y < top) top = y;
                if (y > bottom) bottom = y;
            }
        }
        if (right < 0) return null;
        return new BoundsI(left, top, right, bottom);
    }

    static List<int[]> OpaqueRunsAtY(Bitmap image, int y)
    {
        var runs = new List<int[]>();
        var runStart = -1;
        for (var x = 0; x < image.Width; x++)
        {
            var on = IsOpaque(image.GetPixel(x, y));
            if (on && runStart < 0) runStart = x;
            if (!on && runStart >= 0)
            {
                runs.Add(new[] { runStart, x - 1 });
                runStart = -1;
            }
        }
        if (runStart >= 0) runs.Add(new[] { runStart, image.Width - 1 });
        return runs;
    }

    static int[] GraySpanAtY(Bitmap image, int y)
    {
        var gl = -1;
        var gr = -1;
        for (var x = 0; x < image.Width; x++)
        {
            if (!IsUnderlayerLike(image.GetPixel(x, y))) continue;
            if (gl < 0) gl = x;
            gr = x;
        }
        return new[] { gl, gr };
    }

    static void FindUnderlayerBands(Bitmap image, int bodyTop, int bodyBottom, out int topStart, out int topEnd, out int bottomStart, out int bottomEnd)
    {
        topStart = -1; topEnd = -1; bottomStart = -1; bottomEnd = -1;
        for (var y = bodyTop; y <= bodyBottom; y++)
        {
            var span = GraySpanAtY(image, y);
            if (span[0] < 0) continue;
            if (topStart < 0) topStart = y;
            if (topEnd >= 0 && bottomStart < 0 && y > topEnd + 3)
            {
                bottomStart = y;
            }
            if (bottomStart < 0) topEnd = y;
            else bottomEnd = y;
        }
        if (bottomStart < 0 && topStart >= 0)
        {
            // Single contiguous gray mass — split by midpoint.
            var mid = (topStart + topEnd) / 2;
            bottomStart = mid + 1;
            bottomEnd = topEnd;
            topEnd = mid;
        }
    }

    public static AnchorMap MeasureAnchors(Bitmap image)
    {
        var silhouette = FindOpaqueBounds(image);
        var left = RowLeft(image);
        var right = RowRight(image);
        var width = RowWidth(left, right);
        var centerX = 128;

        var groundY = silhouette.Bottom;
        var topY = silhouette.Top;
        var figureHeight = groundY - topY + 1;

        // Head widest row (includes human ear tips).
        var headSearchEnd = topY + (int)(figureHeight * 0.52);
        var headWidestY = FindMaxWidthY(width, topY, headSearchEnd);

        // Neck: local minimum width just below the head mass.
        var headHalfW = Math.Max(8, width[headWidestY] / 2);
        var neckSearchStart = headWidestY + (int)(headHalfW * 0.55);
        var neckSearchEnd = Math.Min(groundY - 20, headWidestY + headHalfW + 18);
        if (neckSearchStart >= neckSearchEnd) neckSearchStart = headWidestY + 8;
        var neckY = FindMinWidthY(width, neckSearchStart, neckSearchEnd);
        var neckX = (left[neckY] + right[neckY]) / 2;

        var headTop = topY;
        var headBottom = neckY - 1;
        var headLeft = int.MaxValue;
        var headRight = int.MinValue;
        for (var y = headTop; y <= headBottom; y++)
        {
            if (left[y] < 0) continue;
            if (left[y] < headLeft) headLeft = left[y];
            if (right[y] > headRight) headRight = right[y];
        }
        var headCenter = new PointI((headLeft + headRight) / 2, (headTop + headBottom) / 2);

        // Human ears: outermost opaque tips on the mid-head band, then inset into ear mass.
        var earBandTop = headTop + (headBottom - headTop) / 3;
        var earBandBottom = headTop + 2 * (headBottom - headTop) / 3;
        var earLeftX = int.MaxValue;
        var earLeftY = headCenter.Y;
        var earRightX = int.MinValue;
        var earRightY = headCenter.Y;
        for (var y = earBandTop; y <= earBandBottom; y++)
        {
            if (left[y] < 0) continue;
            if (left[y] < earLeftX) { earLeftX = left[y]; earLeftY = y; }
            if (right[y] > earRightX) { earRightX = right[y]; earRightY = y; }
        }
        var earLeft = new PointI(earLeftX + 4, earLeftY);
        var earRight = new PointI(earRightX - 4, earRightY);
        var eyeLineY = (earLeft.Y + earRight.Y) / 2;

        // Hairline: upper forehead curve just inside the top outline.
        var hairlineY = headTop + Math.Max(4, (headBottom - headTop) / 10);

        // Face bounds: interior of head below hairline, between ears, above chin.
        var faceLeft = earLeft.X + 6;
        var faceRight = earRight.X - 6;
        var faceTop = hairlineY + 2;
        var faceBottom = headBottom - 2;
        if (faceLeft >= faceRight)
        {
            faceLeft = headLeft + 10;
            faceRight = headRight - 10;
        }
        var faceBounds = new BoundsI(faceLeft, faceTop, faceRight, faceBottom);
        var faceCenter = faceBounds.Center;

        var bodyTop = neckY + 1;
        var bodyBottom = groundY;

        // Fitted neutral-gray underlayer: bandeau (top) + shorts (bottom).
        int bandeauStart, bandeauEnd, shortsStart, shortsEnd;
        FindUnderlayerBands(image, bodyTop, bodyBottom, out bandeauStart, out bandeauEnd, out shortsStart, out shortsEnd);
        var underBounds = FindMaterialBounds(image, IsUnderlayerLike);

        // Shoulders: outer torso just below neck, before arm hang dominates.
        var shoulderY = FindMaxWidthY(width, neckY + 2, Math.Min(neckY + 24, bandeauStart > 0 ? bandeauStart - 1 : neckY + 24));
        var shoulderLeft = new PointI(left[shoulderY] + 2, shoulderY);
        var shoulderRight = new PointI(right[shoulderY] - 2, shoulderY);

        // Waist: mid exposed midriff between bandeau and shorts (not full silhouette min).
        int waistY;
        if (bandeauEnd > 0 && shortsStart > bandeauEnd)
            waistY = (bandeauEnd + shortsStart) / 2;
        else
            waistY = FindMinWidthY(width, neckY + 18, neckY + (int)((groundY - neckY) * 0.55));
        var waist = new PointI(centerX - 1, waistY); // figure is 1px left-biased (127)

        // Hips: outer edges of shorts gray span at mid-shorts (ignore arms).
        var hipY = waistY + 12;
        if (shortsStart > 0 && shortsEnd >= shortsStart)
            hipY = (shortsStart + shortsEnd) / 2;
        var hipSpan = GraySpanAtY(image, hipY);
        PointI hipLeft;
        PointI hipRight;
        if (hipSpan[0] >= 0)
        {
            hipLeft = new PointI(hipSpan[0], hipY);
            hipRight = new PointI(hipSpan[1], hipY);
        }
        else
        {
            hipLeft = new PointI(left[hipY], hipY);
            hipRight = new PointI(right[hipY], hipY);
        }

        // Soles / ground baseline from foot runs.
        var soleY = groundY;
        var footRuns = OpaqueRunsAtY(image, soleY);
        PointI soleLeft;
        PointI soleRight;
        if (footRuns.Count >= 2)
        {
            var l = footRuns[0];
            var r = footRuns[footRuns.Count - 1];
            soleLeft = new PointI((l[0] + l[1]) / 2, soleY);
            soleRight = new PointI((r[0] + r[1]) / 2, soleY);
        }
        else
        {
            soleLeft = new PointI((left[soleY] + centerX) / 2, soleY);
            soleRight = new PointI((centerX + right[soleY]) / 2, soleY);
        }

        // Ankles: narrowest separated-leg row above the foot pads / flare (not the sole itself).
        var ankleY = soleY - 12;
        var ankleLeft = new PointI(soleLeft.X, ankleY);
        var ankleRight = new PointI(soleRight.X, ankleY);
        var bestAnkleScore = int.MaxValue;
        var ankleSearchLo = Math.Max(hipY + 6, (shortsEnd > 0 ? shortsEnd : hipY) + 4);
        var ankleSearchHi = soleY - 6; // stay above sole pads
        for (var y = ankleSearchHi; y >= ankleSearchLo; y--)
        {
            var runs = OpaqueRunsAtY(image, y);
            if (runs.Count < 2) continue;
            var lw = runs[0][1] - runs[0][0] + 1;
            var rw = runs[runs.Count - 1][1] - runs[runs.Count - 1][0] + 1;
            var score = lw + rw;
            // Compact pre-flare columns score best; slight preference for lower rows.
            score = score * 10 - (y - ankleSearchLo);
            if (score < bestAnkleScore)
            {
                bestAnkleScore = score;
                ankleY = y;
                ankleLeft = new PointI((runs[0][0] + runs[0][1]) / 2, y);
                ankleRight = new PointI((runs[runs.Count - 1][0] + runs[runs.Count - 1][1]) / 2, y);
            }
        }

        // Knees: mid separated-leg segment between shorts hem and ankles.
        var kneeY = (Math.Max(hipY, shortsEnd > 0 ? shortsEnd : hipY) + ankleY) / 2;
        var kneeLeft = new PointI(ankleLeft.X, kneeY);
        var kneeRight = new PointI(ankleRight.X, kneeY);
        {
            var runs = OpaqueRunsAtY(image, kneeY);
            if (runs.Count >= 2)
            {
                kneeLeft = new PointI((runs[0][0] + runs[0][1]) / 2, kneeY);
                kneeRight = new PointI((runs[runs.Count - 1][0] + runs[runs.Count - 1][1]) / 2, kneeY);
            }
        }

        // Wrists/hands: lowest outer arm tips outside torso core.
        var torsoHalf = Math.Max(18, (hipRight.X - hipLeft.X) / 2 + 2);
        var wristLeft = new PointI(shoulderLeft.X, shoulderY + 20);
        var wristRight = new PointI(shoulderRight.X, shoulderY + 20);
        var bestLeftY = -1;
        var bestRightY = -1;
        var bestLeftX = wristLeft.X;
        var bestRightX = wristRight.X;
        var handSearchEnd = shortsEnd > 0 ? shortsEnd + 2 : hipY + 16;
        for (var y = shoulderY; y <= Math.Min(groundY, handSearchEnd); y++)
        {
            if (left[y] < 0) continue;
            if (left[y] <= centerX - torsoHalf)
            {
                bestLeftY = y;
                bestLeftX = left[y] + 2;
            }
            if (right[y] >= centerX + torsoHalf)
            {
                bestRightY = y;
                bestRightX = right[y] - 2;
            }
            // Prefer isolated hand blobs when present.
            var runs = OpaqueRunsAtY(image, y);
            if (runs.Count >= 3)
            {
                bestLeftY = y;
                bestLeftX = (runs[0][0] + runs[0][1]) / 2;
                bestRightY = y;
                bestRightX = (runs[runs.Count - 1][0] + runs[runs.Count - 1][1]) / 2;
            }
        }
        if (bestLeftY >= 0) wristLeft = new PointI(bestLeftX, bestLeftY);
        if (bestRightY >= 0) wristRight = new PointI(bestRightX, bestRightY);

        // Elbows: midpoint shoulder→wrist, snapped to outer silhouette.
        var elbowLeft = new PointI(
            (shoulderLeft.X + wristLeft.X) / 2,
            (shoulderY + wristLeft.Y) / 2
        );
        var elbowRight = new PointI(
            (shoulderRight.X + wristRight.X) / 2,
            (shoulderY + wristRight.Y) / 2
        );
        if (left[elbowLeft.Y] >= 0)
            elbowLeft = new PointI(left[elbowLeft.Y] + 2, elbowLeft.Y);
        if (right[elbowRight.Y] >= 0)
            elbowRight = new PointI(right[elbowRight.Y] - 2, elbowRight.Y);

        // Keep waist x on measured centerline bias of the figure.
        waist = new PointI(neckX, waistY);

        return new AnchorMap
        {
            CanvasCenter = new PointI(128, 128),
            HeadCenter = headCenter,
            FaceCenter = faceCenter,
            FaceBounds = faceBounds,
            EyeLineY = eyeLineY,
            HairlineY = hairlineY,
            EarLeft = earLeft,
            EarRight = earRight,
            Neck = new PointI(neckX, neckY),
            ShoulderLeft = shoulderLeft,
            ShoulderRight = shoulderRight,
            ElbowLeft = elbowLeft,
            ElbowRight = elbowRight,
            WristLeft = wristLeft,
            WristRight = wristRight,
            Waist = waist,
            HipLeft = hipLeft,
            HipRight = hipRight,
            KneeLeft = kneeLeft,
            KneeRight = kneeRight,
            AnkleLeft = ankleLeft,
            AnkleRight = ankleRight,
            SoleLeft = soleLeft,
            SoleRight = soleRight,
            GroundBaselineY = groundY,
            SilhouetteBounds = silhouette,
            UnderlayerBounds = underBounds ?? new BoundsI(0, 0, 0, 0),
            ApprovalStatus = "approved",
            ApprovalDate = "2026-07-18"
        };
    }

    public static void DrawAnchorOverlay(Bitmap baseImage, AnchorMap anchors, string outputPath)
    {
        const int scale = 3;
        const int canvasX = 256;
        const int canvasY = 92;
        const int scaledCanvas = 256 * scale;

        using (var sheet = new Bitmap(1280, 940, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        using (var titleFont = new Font("Segoe UI", 22, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var subtitleFont = new Font("Segoe UI", 13, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var labelFont = new Font("Segoe UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var smallFont = new Font("Segoe UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var labelBrush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var dimBrush = new SolidBrush(Color.FromArgb(180, 180, 190)))
        using (var cyanPen = new Pen(Color.FromArgb(80, 220, 255), 2))
        using (var limePen = new Pen(Color.FromArgb(140, 255, 120), 2))
        using (var amberPen = new Pen(Color.FromArgb(255, 200, 80), 2))
        using (var pinkPen = new Pen(Color.FromArgb(255, 120, 180), 2))
        using (var whitePen = new Pen(Color.FromArgb(240, 240, 245), 2))
        using (var borderPen = new Pen(Color.FromArgb(90, 90, 102), 2))
        using (var panelBrush = new SolidBrush(Color.FromArgb(34, 34, 40)))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            graphics.DrawString("Style C female base - anchor review", titleFont, labelBrush, 24, 18);
            graphics.DrawString(
                "3x nearest-neighbor view of the full 256x256 coordinate canvas | human ears | approved 2026-07-18",
                subtitleFont,
                dimBrush,
                26,
                50
            );

            graphics.FillRectangle(panelBrush, canvasX - 2, canvasY - 2, scaledCanvas + 4, scaledCanvas + 4);
            graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
            graphics.PixelOffsetMode = PixelOffsetMode.Half;
            graphics.SmoothingMode = SmoothingMode.None;
            graphics.DrawImage(
                baseImage,
                new Rectangle(canvasX, canvasY, scaledCanvas, scaledCanvas),
                new Rectangle(0, 0, 256, 256),
                GraphicsUnit.Pixel
            );
            graphics.DrawRectangle(borderPen, canvasX - 1, canvasY - 1, scaledCanvas + 1, scaledCanvas + 1);

            Func<PointI, PointI> map = p => new PointI(
                canvasX + p.X * scale + scale / 2,
                canvasY + p.Y * scale + scale / 2
            );
            Func<int, int> mapY = y => canvasY + y * scale + scale / 2;

            graphics.SmoothingMode = SmoothingMode.AntiAlias;

            // Preserve and display the 256x256 coordinate system.
            var centerX = canvasX + anchors.CanvasCenter.X * scale + scale / 2;
            graphics.DrawLine(whitePen, centerX, canvasY, centerX, canvasY + scaledCanvas);
            graphics.DrawRectangle(
                limePen,
                canvasX + anchors.FaceBounds.Left * scale,
                canvasY + anchors.FaceBounds.Top * scale,
                anchors.FaceBounds.Width * scale,
                anchors.FaceBounds.Height * scale
            );
            graphics.DrawLine(cyanPen, canvasX, mapY(anchors.EyeLineY), canvasX + scaledCanvas, mapY(anchors.EyeLineY));
            graphics.DrawLine(amberPen, canvasX, mapY(anchors.HairlineY), canvasX + scaledCanvas, mapY(anchors.HairlineY));
            graphics.DrawLine(pinkPen, canvasX, mapY(anchors.GroundBaselineY), canvasX + scaledCanvas, mapY(anchors.GroundBaselineY));

            Action<PointI, Pen> mark = (pt, pen) =>
            {
                var mapped = map(pt);
                graphics.FillEllipse(Brushes.White, mapped.X - 4, mapped.Y - 4, 8, 8);
                graphics.DrawEllipse(pen, mapped.X - 7, mapped.Y - 7, 14, 14);
            };
            mark(anchors.CanvasCenter, whitePen);
            mark(anchors.HeadCenter, cyanPen);
            mark(anchors.FaceCenter, limePen);
            mark(anchors.EarLeft, amberPen);
            mark(anchors.EarRight, amberPen);
            mark(anchors.Neck, cyanPen);
            mark(anchors.ShoulderLeft, pinkPen);
            mark(anchors.ShoulderRight, pinkPen);
            mark(anchors.ElbowLeft, pinkPen);
            mark(anchors.ElbowRight, pinkPen);
            mark(anchors.WristLeft, pinkPen);
            mark(anchors.WristRight, pinkPen);
            mark(anchors.Waist, limePen);
            mark(anchors.HipLeft, limePen);
            mark(anchors.HipRight, limePen);
            mark(anchors.KneeLeft, amberPen);
            mark(anchors.KneeRight, amberPen);
            mark(anchors.AnkleLeft, cyanPen);
            mark(anchors.AnkleRight, cyanPen);
            mark(anchors.SoleLeft, pinkPen);
            mark(anchors.SoleRight, pinkPen);

            Action<string, PointI, int, int, bool, Pen> leaderLabel = (name, pt, x, y, isLeft, pen) =>
            {
                var mapped = map(pt);
                var label = string.Format("{0}  ({1}, {2})", name, pt.X, pt.Y);
                var elbowX = isLeft ? canvasX - 16 : canvasX + scaledCanvas + 16;
                var lineEndX = isLeft ? x + 212 : x - 12;
                graphics.DrawLine(pen, mapped.X, mapped.Y, elbowX, y + 9);
                graphics.DrawLine(pen, elbowX, y + 9, lineEndX, y + 9);
                graphics.FillRectangle(panelBrush, x - 4, y - 3, 220, 25);
                graphics.DrawString(label, labelFont, labelBrush, x, y);
            };

            var leftX = 20;
            leaderLabel("human ear L", anchors.EarLeft, leftX, 132, true, amberPen);
            leaderLabel("shoulder L", anchors.ShoulderLeft, leftX, 204, true, pinkPen);
            leaderLabel("elbow L", anchors.ElbowLeft, leftX, 276, true, pinkPen);
            leaderLabel("wrist/hand L", anchors.WristLeft, leftX, 348, true, pinkPen);
            leaderLabel("hip L", anchors.HipLeft, leftX, 420, true, limePen);
            leaderLabel("knee L", anchors.KneeLeft, leftX, 492, true, amberPen);
            leaderLabel("ankle L", anchors.AnkleLeft, leftX, 564, true, cyanPen);
            leaderLabel("sole L", anchors.SoleLeft, leftX, 636, true, pinkPen);

            var rightX = 1044;
            leaderLabel("head center", anchors.HeadCenter, rightX, 104, false, cyanPen);
            leaderLabel("face center", anchors.FaceCenter, rightX, 162, false, limePen);
            leaderLabel("human ear R", anchors.EarRight, rightX, 220, false, amberPen);
            leaderLabel("neck", anchors.Neck, rightX, 278, false, cyanPen);
            leaderLabel("shoulder R", anchors.ShoulderRight, rightX, 336, false, pinkPen);
            leaderLabel("elbow R", anchors.ElbowRight, rightX, 394, false, pinkPen);
            leaderLabel("wrist/hand R", anchors.WristRight, rightX, 452, false, pinkPen);
            leaderLabel("waist", anchors.Waist, rightX, 510, false, limePen);
            leaderLabel("hip R", anchors.HipRight, rightX, 568, false, limePen);
            leaderLabel("knee R", anchors.KneeRight, rightX, 626, false, amberPen);
            leaderLabel("ankle R", anchors.AnkleRight, rightX, 684, false, cyanPen);
            leaderLabel("sole R", anchors.SoleRight, rightX, 742, false, pinkPen);

            graphics.FillRectangle(panelBrush, 20, 732, 220, 132);
            graphics.DrawString("GUIDES", labelFont, labelBrush, 32, 742);
            graphics.DrawString("centerline  x = 128", smallFont, labelBrush, 32, 770);
            graphics.DrawString("hairline    y = " + anchors.HairlineY, smallFont, labelBrush, 32, 792);
            graphics.DrawString("eye line    y = " + anchors.EyeLineY, smallFont, labelBrush, 32, 814);
            graphics.DrawString("baseline    y = " + anchors.GroundBaselineY, smallFont, labelBrush, 32, 836);

            graphics.DrawString("(0, 0)", smallFont, dimBrush, canvasX + 6, canvasY + 6);
            var endLabel = "(255, 255)";
            var endSize = graphics.MeasureString(endLabel, smallFont);
            graphics.DrawString(
                endLabel,
                smallFont,
                dimBrush,
                canvasX + scaledCanvas - endSize.Width - 6,
                canvasY + scaledCanvas - endSize.Height - 6
            );

            graphics.DrawString(
                "Face bounds: L" + anchors.FaceBounds.Left + " T" + anchors.FaceBounds.Top
                    + " R" + anchors.FaceBounds.Right + " B" + anchors.FaceBounds.Bottom
                    + " | White dots are exact 256x256 anchor coordinates.",
                smallFont,
                dimBrush,
                canvasX,
                880
            );

            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    public static void MakeSizeCheck(Bitmap baseImage, string outputPath)
    {
        var sizes = new[] { 30, 76, 184 };
        using (var sheet = new Bitmap(420, 430, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(sheet))
        using (var labelFont = new Font("Segoe UI", 14, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var guideFont = new Font("Segoe UI", 12, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var labelBrush = new SolidBrush(Color.FromArgb(245, 245, 247)))
        using (var guideBrush = new SolidBrush(Color.FromArgb(160, 160, 170)))
        {
            graphics.Clear(Color.FromArgb(26, 26, 30));
            graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
            graphics.DrawString("Style C female base - actual-size readability", labelFont, labelBrush, 16, 12);
            graphics.DrawString("30 / 76 / 184 px (nearest-neighbor)", guideFont, guideBrush, 16, 34);

            var y = 64;
            foreach (var size in sizes)
            {
                graphics.DrawString(size + " px", labelFont, guideBrush, 16, y + Math.Max(0, (size - 14) / 2));
                graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                graphics.PixelOffsetMode = PixelOffsetMode.Half;
                graphics.SmoothingMode = SmoothingMode.None;
                graphics.DrawImage(
                    baseImage,
                    new Rectangle(96, y, size, size),
                    new Rectangle(0, 0, baseImage.Width, baseImage.Height),
                    GraphicsUnit.Pixel
                );
                y += size + 18;
            }

            sheet.Save(outputPath, ImageFormat.Png);
        }
    }

    public static string ToJson(AnchorMap a)
    {
        Func<PointI, string> pt = p => string.Format("{{\"x\":{0},\"y\":{1}}}", p.X, p.Y);
        Func<BoundsI, string> bb = b => string.Format(
            "{{\"left\":{0},\"top\":{1},\"right\":{2},\"bottom\":{3},\"width\":{4},\"height\":{5}}}",
            b.Left, b.Top, b.Right, b.Bottom, b.Width, b.Height
        );

        var sb = new StringBuilder();
        sb.AppendLine("{");
        sb.AppendLine("  \"id\": \"style-c-female-base\",");
        sb.AppendLine("  \"approvalStatus\": \"approved\",");
        sb.AppendLine("  \"approvalDate\": \"2026-07-18\",");
        sb.AppendLine(string.Format("  \"canvas\": {{\"width\":{0},\"height\":{0},\"format\":\"Format32bppArgb\",\"origin\":\"top-left\"}},", a.CanvasSize));
        sb.AppendLine(string.Format("  \"canvasCenter\": {0},", pt(a.CanvasCenter)));
        sb.AppendLine("  \"anchors\": {");
        sb.AppendLine(string.Format("    \"headCenter\": {0},", pt(a.HeadCenter)));
        sb.AppendLine(string.Format("    \"faceCenter\": {0},", pt(a.FaceCenter)));
        sb.AppendLine(string.Format("    \"eyeLineY\": {0},", a.EyeLineY));
        sb.AppendLine(string.Format("    \"hairlineY\": {0},", a.HairlineY));
        sb.AppendLine(string.Format("    \"earLeft\": {0},", pt(a.EarLeft)));
        sb.AppendLine(string.Format("    \"earRight\": {0},", pt(a.EarRight)));
        sb.AppendLine(string.Format("    \"neck\": {0},", pt(a.Neck)));
        sb.AppendLine(string.Format("    \"shoulderLeft\": {0},", pt(a.ShoulderLeft)));
        sb.AppendLine(string.Format("    \"shoulderRight\": {0},", pt(a.ShoulderRight)));
        sb.AppendLine(string.Format("    \"elbowLeft\": {0},", pt(a.ElbowLeft)));
        sb.AppendLine(string.Format("    \"elbowRight\": {0},", pt(a.ElbowRight)));
        sb.AppendLine(string.Format("    \"wristLeft\": {0},", pt(a.WristLeft)));
        sb.AppendLine(string.Format("    \"wristRight\": {0},", pt(a.WristRight)));
        sb.AppendLine(string.Format("    \"waist\": {0},", pt(a.Waist)));
        sb.AppendLine(string.Format("    \"hipLeft\": {0},", pt(a.HipLeft)));
        sb.AppendLine(string.Format("    \"hipRight\": {0},", pt(a.HipRight)));
        sb.AppendLine(string.Format("    \"kneeLeft\": {0},", pt(a.KneeLeft)));
        sb.AppendLine(string.Format("    \"kneeRight\": {0},", pt(a.KneeRight)));
        sb.AppendLine(string.Format("    \"ankleLeft\": {0},", pt(a.AnkleLeft)));
        sb.AppendLine(string.Format("    \"ankleRight\": {0},", pt(a.AnkleRight)));
        sb.AppendLine(string.Format("    \"soleLeft\": {0},", pt(a.SoleLeft)));
        sb.AppendLine(string.Format("    \"soleRight\": {0}", pt(a.SoleRight)));
        sb.AppendLine("  },");
        sb.AppendLine("  \"bounds\": {");
        sb.AppendLine(string.Format("    \"face\": {0},", bb(a.FaceBounds)));
        sb.AppendLine(string.Format("    \"silhouette\": {0},", bb(a.SilhouetteBounds)));
        sb.AppendLine(string.Format("    \"underlayer\": {0}", bb(a.UnderlayerBounds)));
        sb.AppendLine("  },");
        sb.AppendLine(string.Format("  \"groundBaselineY\": {0},", a.GroundBaselineY));
        sb.AppendLine("  \"ears\": \"human\",");
        sb.AppendLine("  \"notes\": \"Coordinates are the approved production anchor contract on the 256x256 master canvas. Origin top-left.\"");
        sb.AppendLine("}");
        return sb.ToString();
    }

    public static AnchorMap ProcessAll(string sourcePath, string outputDirectory)
    {
        Directory.CreateDirectory(outputDirectory);
        var basePath = Path.Combine(outputDirectory, "style-c-female-base.png");
        var overlayPath = Path.Combine(outputDirectory, "style-c-female-base-anchors.png");
        var sizePath = Path.Combine(outputDirectory, "style-c-female-base-size-check.png");
        var jsonPath = Path.Combine(outputDirectory, "style-c-female-base-anchors.json");

        using (var baseImage = KeyAndResize(sourcePath))
        {
            if (!File.Exists(basePath))
                baseImage.Save(basePath, ImageFormat.Png);
            var anchors = MeasureAnchors(baseImage);
            DrawAnchorOverlay(baseImage, anchors, overlayPath);
            MakeSizeCheck(baseImage, sizePath);
            File.WriteAllText(jsonPath, ToJson(anchors), Encoding.UTF8);
            return anchors;
        }
    }
}
'@

if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "Source image not found: $SourcePath"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$anchors = [AvatarBaseStudyProcessor]::ProcessAll($SourcePath, $OutputDirectory)

Write-Host "Wrote base study assets to $OutputDirectory"
Write-Host ("canvasCenter=({0},{1}) headCenter=({2},{3}) eyeLineY={4} hairlineY={5} baselineY={6}" -f `
  $anchors.CanvasCenter.X, $anchors.CanvasCenter.Y, `
  $anchors.HeadCenter.X, $anchors.HeadCenter.Y, `
  $anchors.EyeLineY, $anchors.HairlineY, $anchors.GroundBaselineY)
Write-Host ("ears L=({0},{1}) R=({2},{3}) neck=({4},{5}) waist=({6},{7})" -f `
  $anchors.EarLeft.X, $anchors.EarLeft.Y, `
  $anchors.EarRight.X, $anchors.EarRight.Y, `
  $anchors.Neck.X, $anchors.Neck.Y, `
  $anchors.Waist.X, $anchors.Waist.Y)
Write-Host ("silhouette L{0} T{1} R{2} B{3}" -f `
  $anchors.SilhouetteBounds.Left, $anchors.SilhouetteBounds.Top, `
  $anchors.SilhouetteBounds.Right, $anchors.SilhouetteBounds.Bottom)
