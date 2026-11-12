Add-Type -AssemblyName System.Drawing
foreach ($size in @(16, 32, 48, 128)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 128.0), ($size / 128.0))
    $outline = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#6B490B'), 3)
    $yellow = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FFD43B'))
    $gold = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#F2AF16'))
    $cream = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FFF1A5'))
    $ink = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#332812'))
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    for ($i = 0; $i -lt 12; $i++) {
        $angle = ($i * 30) * [Math]::PI / 180
        $points = @(
            [System.Drawing.PointF]::new([float](62 + 43 * [Math]::Cos($angle - 0.13)), [float](66 + 40 * [Math]::Sin($angle - 0.13))),
            [System.Drawing.PointF]::new([float](62 + 54 * [Math]::Cos($angle)), [float](66 + 51 * [Math]::Sin($angle))),
            [System.Drawing.PointF]::new([float](62 + 43 * [Math]::Cos($angle + 0.13)), [float](66 + 40 * [Math]::Sin($angle + 0.13)))
        )
        $graphics.FillPolygon($gold, $points)
        $graphics.DrawPolygon($outline, $points)
    }
    $tail = @([System.Drawing.PointF]::new(97, 65), [System.Drawing.PointF]::new(121, 48), [System.Drawing.PointF]::new(121, 83))
    $graphics.FillPolygon($gold, $tail)
    $graphics.DrawPolygon($outline, $tail)
    $graphics.FillEllipse($yellow, 17, 23, 90, 86)
    $graphics.DrawEllipse($outline, 17, 23, 90, 86)
    $graphics.FillEllipse($cream, 29, 68, 67, 32)
    $graphics.FillEllipse($gold, 78, 65, 23, 14)
    foreach ($x in @(39, 69)) {
        $graphics.FillEllipse($white, $x, 40, 18, 23)
        $graphics.FillEllipse($ink, ($x + 5), 46, 9, 13)
        $graphics.FillEllipse($white, ($x + 6), 47, 3, 4)
    }
    $graphics.DrawArc($outline, 47, 66, 21, 15, 5, 170)
    foreach ($spot in @(@(30, 66), @(39, 87), @(72, 88), @(90, 58))) {
        $graphics.FillEllipse($gold, $spot[0], $spot[1], 5, 5)
    }
    $bitmap.Save((Join-Path $PSScriptRoot "extension/icons/puffer-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    foreach ($resource in @($outline, $yellow, $gold, $cream, $ink, $white)) { $resource.Dispose() }
}
