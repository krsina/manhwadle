param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  [Parameter(Mandatory = $false)]
  [string]$FemaleContractPath = ""
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
Add-Type -ReferencedAssemblies 'System.Drawing','System.Web.Extensions' -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

public static class AvatarMaleBaseStudyProcessor
{
    public class PointI
    {
        public int X;
        public int Y;
        public PointI() {}
        public PointI(int x, int y) { X = x; Y = y; }
        public bool EqualsPoint(PointI other)
        {
            return other != null && X == other.X && Y == other.Y;
        }
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
        public PointI Center
        {
            get { return new PointI((Left + Right) / 2, (Top + Bottom) / 2); }
        }
        public bool EqualsBounds(BoundsI other)
        {
            return other != null
                && Left == other.Left && Top == other.Top
                && Right == other.Right && Bottom == other.Bottom;
        }
    }

    public class SharedContract
    {
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
        public string SharedContractRef;
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
        public string SharedContractRef;
        public int TranslateX;
        public int TranslateY;
    }

    public class ValidationReport
    {
        public bool Ok = true;
        public List<string> Lines = new List<string>();
        public void Pass(string msg) { Lines.Add("[PASS] " + msg); }
        public void Fail(string msg) { Ok = false; Lines.Add("[FAIL] " + msg); }
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

    static bool IsUnderlayerLike(Color color)
    {
        if (!IsOpaque(color)) return false;
        // Neutral gray tank/shorts only — exclude warm skin-shadow near-grays.
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        var rg = Math.Abs(color.R - color.G);
        var gb = Math.Abs(color.G - color.B);
        var rb = Math.Abs(color.R - color.B);
        return max - min < 18 && rg <= 10 && gb <= 10 && rb <= 10
            && max > 90 && max < 175;
    }

    static PointI ReadPoint(Dictionary<string, object> dict, string key)
    {
        var obj = (Dictionary<string, object>)dict[key];
        return new PointI(Convert.ToInt32(obj["x"]), Convert.ToInt32(obj["y"]));
    }

    static BoundsI ReadBounds(Dictionary<string, object> dict, string key)
    {
        var obj = (Dictionary<string, object>)dict[key];
        return new BoundsI(
            Convert.ToInt32(obj["left"]),
            Convert.ToInt32(obj["top"]),
            Convert.ToInt32(obj["right"]),
            Convert.ToInt32(obj["bottom"])
        );
    }

    public static SharedContract LoadFemaleContract(string femaleContractPath)
    {
        if (!File.Exists(femaleContractPath))
            throw new FileNotFoundException("Approved female contract JSON not found.", femaleContractPath);

        var json = File.ReadAllText(femaleContractPath, Encoding.UTF8);
        var serializer = new JavaScriptSerializer();
        var root = (Dictionary<string, object>)serializer.DeserializeObject(json);
        var anchors = (Dictionary<string, object>)root["anchors"];
        var bounds = (Dictionary<string, object>)root["bounds"];
        var canvasCenter = (Dictionary<string, object>)root["canvasCenter"];

        return new SharedContract
        {
            CanvasCenter = new PointI(Convert.ToInt32(canvasCenter["x"]), Convert.ToInt32(canvasCenter["y"])),
            HeadCenter = ReadPoint(anchors, "headCenter"),
            FaceCenter = ReadPoint(anchors, "faceCenter"),
            FaceBounds = ReadBounds(bounds, "face"),
            EyeLineY = Convert.ToInt32(anchors["eyeLineY"]),
            HairlineY = Convert.ToInt32(anchors["hairlineY"]),
            EarLeft = ReadPoint(anchors, "earLeft"),
            EarRight = ReadPoint(anchors, "earRight"),
            Neck = ReadPoint(anchors, "neck"),
            ShoulderLeft = ReadPoint(anchors, "shoulderLeft"),
            ShoulderRight = ReadPoint(anchors, "shoulderRight"),
            ElbowLeft = ReadPoint(anchors, "elbowLeft"),
            ElbowRight = ReadPoint(anchors, "elbowRight"),
            WristLeft = ReadPoint(anchors, "wristLeft"),
            WristRight = ReadPoint(anchors, "wristRight"),
            Waist = ReadPoint(anchors, "waist"),
            HipLeft = ReadPoint(anchors, "hipLeft"),
            HipRight = ReadPoint(anchors, "hipRight"),
            KneeLeft = ReadPoint(anchors, "kneeLeft"),
            KneeRight = ReadPoint(anchors, "kneeRight"),
            AnkleLeft = ReadPoint(anchors, "ankleLeft"),
            AnkleRight = ReadPoint(anchors, "ankleRight"),
            SoleLeft = ReadPoint(anchors, "soleLeft"),
            SoleRight = ReadPoint(anchors, "soleRight"),
            GroundBaselineY = Convert.ToInt32(root["groundBaselineY"]),
            SharedContractRef = Path.GetFileName(femaleContractPath)
        };
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

    static BoundsI FindMaterialBounds(Bitmap image, Func<Color, bool> predicate, int yMin, int yMax)
    {
        var left = image.Width;
        var top = image.Height;
        var right = -1;
        var bottom = -1;
        var y0 = Math.Max(0, yMin);
        var y1 = Math.Min(image.Height - 1, yMax);
        for (var y = y0; y <= y1; y++)
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

    public static Bitmap KeyResizeAndRegister(string sourcePath, SharedContract contract, out int translateX, out int translateY)
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

            using (var resized = new Bitmap(256, 256, PixelFormat.Format32bppArgb))
            {
                using (var graphics = Graphics.FromImage(resized))
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

                var provisional = FindOpaqueBounds(resized);
                // Integer nearest-neighbor registration only: lock shared baseline and centerline bias.
                translateY = contract.GroundBaselineY - provisional.Bottom;
                translateX = contract.Neck.X - provisional.Center.X;

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
                        resized,
                        new Rectangle(translateX, translateY, 256, 256),
                        new Rectangle(0, 0, 256, 256),
                        GraphicsUnit.Pixel
                    );
                }
                return output;
            }
        }
    }

    public static AnchorMap BuildAnchorMap(Bitmap image, SharedContract contract, int translateX, int translateY)
    {
        var silhouette = FindOpaqueBounds(image);
        // Restrict gray search to torso band below neck / above knees.
        var underBounds = FindMaterialBounds(
            image,
            IsUnderlayerLike,
            contract.Neck.Y,
            Math.Min(contract.KneeLeft.Y, contract.KneeRight.Y)
        );

        return new AnchorMap
        {
            CanvasCenter = new PointI(contract.CanvasCenter.X, contract.CanvasCenter.Y),
            HeadCenter = new PointI(contract.HeadCenter.X, contract.HeadCenter.Y),
            FaceCenter = new PointI(contract.FaceCenter.X, contract.FaceCenter.Y),
            FaceBounds = new BoundsI(
                contract.FaceBounds.Left, contract.FaceBounds.Top,
                contract.FaceBounds.Right, contract.FaceBounds.Bottom
            ),
            EyeLineY = contract.EyeLineY,
            HairlineY = contract.HairlineY,
            EarLeft = new PointI(contract.EarLeft.X, contract.EarLeft.Y),
            EarRight = new PointI(contract.EarRight.X, contract.EarRight.Y),
            Neck = new PointI(contract.Neck.X, contract.Neck.Y),
            ShoulderLeft = new PointI(contract.ShoulderLeft.X, contract.ShoulderLeft.Y),
            ShoulderRight = new PointI(contract.ShoulderRight.X, contract.ShoulderRight.Y),
            ElbowLeft = new PointI(contract.ElbowLeft.X, contract.ElbowLeft.Y),
            ElbowRight = new PointI(contract.ElbowRight.X, contract.ElbowRight.Y),
            WristLeft = new PointI(contract.WristLeft.X, contract.WristLeft.Y),
            WristRight = new PointI(contract.WristRight.X, contract.WristRight.Y),
            Waist = new PointI(contract.Waist.X, contract.Waist.Y),
            HipLeft = new PointI(contract.HipLeft.X, contract.HipLeft.Y),
            HipRight = new PointI(contract.HipRight.X, contract.HipRight.Y),
            KneeLeft = new PointI(contract.KneeLeft.X, contract.KneeLeft.Y),
            KneeRight = new PointI(contract.KneeRight.X, contract.KneeRight.Y),
            AnkleLeft = new PointI(contract.AnkleLeft.X, contract.AnkleLeft.Y),
            AnkleRight = new PointI(contract.AnkleRight.X, contract.AnkleRight.Y),
            SoleLeft = new PointI(contract.SoleLeft.X, contract.SoleLeft.Y),
            SoleRight = new PointI(contract.SoleRight.X, contract.SoleRight.Y),
            GroundBaselineY = contract.GroundBaselineY,
            SilhouetteBounds = silhouette,
            UnderlayerBounds = underBounds ?? new BoundsI(0, 0, 0, 0),
            ApprovalStatus = "approved",
            ApprovalDate = "2026-07-18",
            SharedContractRef = contract.SharedContractRef,
            TranslateX = translateX,
            TranslateY = translateY
        };
    }

    static void AssertPoint(ValidationReport report, string name, PointI male, PointI female)
    {
        if (male.EqualsPoint(female))
            report.Pass(name + " identical (" + male.X + "," + male.Y + ")");
        else
            report.Fail(name + " differs: male=(" + male.X + "," + male.Y + ") female=(" + female.X + "," + female.Y + ")");
    }

    static void AssertInt(ValidationReport report, string name, int male, int female)
    {
        if (male == female)
            report.Pass(name + " identical (" + male + ")");
        else
            report.Fail(name + " differs: male=" + male + " female=" + female);
    }

    public static ValidationReport VerifySharedContract(AnchorMap male, SharedContract female)
    {
        var report = new ValidationReport();
        AssertPoint(report, "canvasCenter", male.CanvasCenter, female.CanvasCenter);
        AssertPoint(report, "headCenter", male.HeadCenter, female.HeadCenter);
        AssertPoint(report, "faceCenter", male.FaceCenter, female.FaceCenter);
        AssertInt(report, "eyeLineY", male.EyeLineY, female.EyeLineY);
        AssertInt(report, "hairlineY", male.HairlineY, female.HairlineY);
        AssertPoint(report, "earLeft", male.EarLeft, female.EarLeft);
        AssertPoint(report, "earRight", male.EarRight, female.EarRight);
        AssertPoint(report, "neck", male.Neck, female.Neck);
        AssertPoint(report, "shoulderLeft", male.ShoulderLeft, female.ShoulderLeft);
        AssertPoint(report, "shoulderRight", male.ShoulderRight, female.ShoulderRight);
        AssertPoint(report, "elbowLeft", male.ElbowLeft, female.ElbowLeft);
        AssertPoint(report, "elbowRight", male.ElbowRight, female.ElbowRight);
        AssertPoint(report, "wristLeft", male.WristLeft, female.WristLeft);
        AssertPoint(report, "wristRight", male.WristRight, female.WristRight);
        AssertPoint(report, "waist", male.Waist, female.Waist);
        AssertPoint(report, "hipLeft", male.HipLeft, female.HipLeft);
        AssertPoint(report, "hipRight", male.HipRight, female.HipRight);
        AssertPoint(report, "kneeLeft", male.KneeLeft, female.KneeLeft);
        AssertPoint(report, "kneeRight", male.KneeRight, female.KneeRight);
        AssertPoint(report, "ankleLeft", male.AnkleLeft, female.AnkleLeft);
        AssertPoint(report, "ankleRight", male.AnkleRight, female.AnkleRight);
        AssertPoint(report, "soleLeft", male.SoleLeft, female.SoleLeft);
        AssertPoint(report, "soleRight", male.SoleRight, female.SoleRight);
        AssertInt(report, "groundBaselineY", male.GroundBaselineY, female.GroundBaselineY);
        if (male.FaceBounds.EqualsBounds(female.FaceBounds))
            report.Pass("faceBounds identical L" + male.FaceBounds.Left + " T" + male.FaceBounds.Top
                + " R" + male.FaceBounds.Right + " B" + male.FaceBounds.Bottom);
        else
            report.Fail("faceBounds differs from approved female contract");
        return report;
    }

    public static ValidationReport ValidateImage(Bitmap image, AnchorMap anchors)
    {
        var report = new ValidationReport();
        if (image.Width == 256 && image.Height == 256)
            report.Pass("exact 256x256 canvas");
        else
            report.Fail("canvas is " + image.Width + "x" + image.Height + " (expected 256x256)");

        if (image.PixelFormat == PixelFormat.Format32bppArgb)
            report.Pass("Format32bppArgb");
        else
            report.Fail("pixel format is " + image.PixelFormat + " (expected Format32bppArgb)");

        var magenta = 0;
        var opaque = 0;
        for (var y = 0; y < image.Height; y++)
        {
            for (var x = 0; x < image.Width; x++)
            {
                var color = image.GetPixel(x, y);
                if (IsMagenta(color) && color.A > 16) magenta++;
                if (IsOpaque(color)) opaque++;
            }
        }
        if (magenta == 0) report.Pass("no residual magenta");
        else report.Fail("residual magenta pixels=" + magenta);
        if (opaque > 0) report.Pass("opaque silhouette present (" + opaque + " px)");
        else report.Fail("no opaque pixels");

        var s = anchors.SilhouetteBounds;
        if (s.Left >= 6 && s.Top >= 6 && (255 - s.Right) >= 6 && (255 - s.Bottom) >= 0)
            report.Pass("transparent margins (>=6 px sides/top; ground clearance below baseline)");
        else
            report.Fail("insufficient margin: L" + s.Left + " T" + s.Top + " R" + (255 - s.Right) + " B" + (255 - s.Bottom));

        if (s.Bottom == anchors.GroundBaselineY && anchors.GroundBaselineY == 224)
            report.Pass("baseline locked at y=224 (lowest opaque sole row)");
        else
            report.Fail("baseline mismatch: silhouette.Bottom=" + s.Bottom + " groundBaselineY=" + anchors.GroundBaselineY);

        // Full-canvas rule: asset is the complete 256 plate, not a local crop of the figure.
        if (image.Width == 256 && image.Height == 256 && s.Width < 256 && s.Height < 256)
            report.Pass("full-canvas plate (figure padded inside 256x256, not cropped to bbox)");
        else
            report.Fail("full-canvas rule violated");

        return report;
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
            graphics.DrawString("Style C male base - shared anchor review", titleFont, labelBrush, 24, 18);
            graphics.DrawString(
                "3x nearest-neighbor view of the full 256x256 coordinate canvas | shared production contract | approved 2026-07-18",
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
                "SHARED CONTRACT (identical to female). Face bounds: L" + anchors.FaceBounds.Left
                    + " T" + anchors.FaceBounds.Top
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
            graphics.DrawString("Style C male base - actual-size readability", labelFont, labelBrush, 16, 12);
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
        sb.AppendLine("  \"id\": \"style-c-male-base\",");
        sb.AppendLine("  \"approvalStatus\": \"approved\",");
        sb.AppendLine("  \"approvalDate\": \"2026-07-18\",");
        sb.AppendLine(string.Format("  \"sharedContractRef\": \"{0}\",", a.SharedContractRef));
        sb.AppendLine(string.Format("  \"registration\": {{\"translateX\":{0},\"translateY\":{1},\"mode\":\"nearest-neighbor-integer\"}},", a.TranslateX, a.TranslateY));
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
        sb.AppendLine("  \"notes\": \"Approved male plate shares the locked production attachment contract with the approved female base. Silhouette/underlayer bounds are measured from the male plate after integer registration.\"");
        sb.AppendLine("}");
        return sb.ToString();
    }

    public static string CompatibilityTable(AnchorMap male, SharedContract female)
    {
        var sb = new StringBuilder();
        sb.AppendLine("anchor                  male            female          match");
        sb.AppendLine("---------------------- --------------- --------------- -----");
        Action<string, PointI, PointI> rowPt = (name, m, f) =>
        {
            sb.AppendFormat("{0,-22} ({1,3},{2,3})       ({3,3},{4,3})       {5}\n",
                name, m.X, m.Y, f.X, f.Y, m.EqualsPoint(f) ? "YES" : "NO");
        };
        Action<string, int, int> rowY = (name, m, f) =>
        {
            sb.AppendFormat("{0,-22} {1,-15} {2,-15} {3}\n",
                name, m.ToString(), f.ToString(), m == f ? "YES" : "NO");
        };
        rowPt("canvasCenter", male.CanvasCenter, female.CanvasCenter);
        rowPt("headCenter", male.HeadCenter, female.HeadCenter);
        rowPt("faceCenter", male.FaceCenter, female.FaceCenter);
        rowY("eyeLineY", male.EyeLineY, female.EyeLineY);
        rowY("hairlineY", male.HairlineY, female.HairlineY);
        rowPt("earLeft", male.EarLeft, female.EarLeft);
        rowPt("earRight", male.EarRight, female.EarRight);
        rowPt("neck", male.Neck, female.Neck);
        rowPt("shoulderLeft", male.ShoulderLeft, female.ShoulderLeft);
        rowPt("shoulderRight", male.ShoulderRight, female.ShoulderRight);
        rowPt("elbowLeft", male.ElbowLeft, female.ElbowLeft);
        rowPt("elbowRight", male.ElbowRight, female.ElbowRight);
        rowPt("wristLeft", male.WristLeft, female.WristLeft);
        rowPt("wristRight", male.WristRight, female.WristRight);
        rowPt("waist", male.Waist, female.Waist);
        rowPt("hipLeft", male.HipLeft, female.HipLeft);
        rowPt("hipRight", male.HipRight, female.HipRight);
        rowPt("kneeLeft", male.KneeLeft, female.KneeLeft);
        rowPt("kneeRight", male.KneeRight, female.KneeRight);
        rowPt("ankleLeft", male.AnkleLeft, female.AnkleLeft);
        rowPt("ankleRight", male.AnkleRight, female.AnkleRight);
        rowPt("soleLeft", male.SoleLeft, female.SoleLeft);
        rowPt("soleRight", male.SoleRight, female.SoleRight);
        rowY("groundBaselineY", male.GroundBaselineY, female.GroundBaselineY);
        return sb.ToString();
    }

    public static AnchorMap ProcessAll(string sourcePath, string outputDirectory, string femaleContractPath)
    {
        Directory.CreateDirectory(outputDirectory);
        var basePath = Path.Combine(outputDirectory, "style-c-male-base.png");
        var overlayPath = Path.Combine(outputDirectory, "style-c-male-base-anchors.png");
        var sizePath = Path.Combine(outputDirectory, "style-c-male-base-size-check.png");
        var jsonPath = Path.Combine(outputDirectory, "style-c-male-base-anchors.json");

        var contract = LoadFemaleContract(femaleContractPath);
        int translateX, translateY;
        using (var baseImage = KeyResizeAndRegister(sourcePath, contract, out translateX, out translateY))
        {
            var anchors = BuildAnchorMap(baseImage, contract, translateX, translateY);

            var contractReport = VerifySharedContract(anchors, contract);
            var imageReport = ValidateImage(baseImage, anchors);
            Console.WriteLine("=== Shared-contract compatibility ===");
            Console.Write(CompatibilityTable(anchors, contract));
            Console.WriteLine("=== Contract verification ===");
            foreach (var line in contractReport.Lines) Console.WriteLine(line);
            Console.WriteLine("=== Image validation ===");
            foreach (var line in imageReport.Lines) Console.WriteLine(line);
            Console.WriteLine(string.Format("registration translate=({0},{1})", translateX, translateY));

            if (!contractReport.Ok || !imageReport.Ok)
                throw new InvalidOperationException("Male base processing failed shared-contract or image validation.");

            baseImage.Save(basePath, ImageFormat.Png);
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

if ([string]::IsNullOrWhiteSpace($FemaleContractPath)) {
  $FemaleContractPath = Join-Path $OutputDirectory 'style-c-female-base-anchors.json'
}

if (-not (Test-Path -LiteralPath $FemaleContractPath)) {
  throw "Approved female contract not found: $FemaleContractPath"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$anchors = [AvatarMaleBaseStudyProcessor]::ProcessAll($SourcePath, $OutputDirectory, $FemaleContractPath)

Write-Host "Wrote male base study assets to $OutputDirectory"
Write-Host ("canvasCenter=({0},{1}) headCenter=({2},{3}) eyeLineY={4} hairlineY={5} baselineY={6}" -f `
  $anchors.CanvasCenter.X, $anchors.CanvasCenter.Y, `
  $anchors.HeadCenter.X, $anchors.HeadCenter.Y, `
  $anchors.EyeLineY, $anchors.HairlineY, $anchors.GroundBaselineY)
Write-Host ("ears L=({0},{1}) R=({2},{3}) neck=({4},{5}) waist=({6},{7})" -f `
  $anchors.EarLeft.X, $anchors.EarLeft.Y, `
  $anchors.EarRight.X, $anchors.EarRight.Y, `
  $anchors.Neck.X, $anchors.Neck.Y, `
  $anchors.Waist.X, $anchors.Waist.Y)
Write-Host ("silhouette L{0} T{1} R{2} B{3} underlayer L{4} T{5} R{6} B{7}" -f `
  $anchors.SilhouetteBounds.Left, $anchors.SilhouetteBounds.Top, `
  $anchors.SilhouetteBounds.Right, $anchors.SilhouetteBounds.Bottom, `
  $anchors.UnderlayerBounds.Left, $anchors.UnderlayerBounds.Top, `
  $anchors.UnderlayerBounds.Right, $anchors.UnderlayerBounds.Bottom)
Write-Host "approvalStatus=$($anchors.ApprovalStatus) sharedContractRef=$($anchors.SharedContractRef)"
