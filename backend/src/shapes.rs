/// Проверка принадлежности точки полигону (алгоритм бросания луча).
pub fn point_in_polygon(px: f64, py: f64, poly: &[[f64; 2]]) -> bool {
    let n = poly.len();
    if n < 3 { return false; }
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = (poly[i][0], poly[i][1]);
        let (xj, yj) = (poly[j][0], poly[j][1]);
        if ((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Принадлежность точки кругу.
#[inline]
pub fn point_in_circle(px: f64, py: f64, cx: f64, cy: f64, r: f64) -> bool {
    (px - cx).powi(2) + (py - cy).powi(2) <= r * r
}

/// Принадлежность точки треугольнику (барицентрические координаты).
pub fn point_in_triangle(px: f64, py: f64, pts: &[[f64; 2]]) -> bool {
    let (x1, y1) = (pts[0][0], pts[0][1]);
    let (x2, y2) = (pts[1][0], pts[1][1]);
    let (x3, y3) = (pts[2][0], pts[2][1]);
    let d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if d.abs() < 1e-12 { return false; } // вырожденный треугольник
    let a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / d;
    let b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / d;
    let c = 1.0 - a - b;
    a >= 0.0 && b >= 0.0 && c >= 0.0
}

/// Принадлежность точки правильному шестиугольнику (плоская вершина сверху).
pub fn point_in_hexagon(px: f64, py: f64, cx: f64, cy: f64, r: f64) -> bool {
    let dx = (px - cx).abs();
    let dy = (py - cy).abs();
    let h = r * (3f64.sqrt() * 0.5); // высота = r * √3/2
    if dx > r || dy > h { return false; }
    // Срезаем углы
    dx * (3f64.sqrt() * 0.5) + dy * 0.5 <= h
}
