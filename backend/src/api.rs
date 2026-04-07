use actix_multipart::Multipart;
use actix_web::{post, web, HttpResponse, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use crate::image_processing::ImageMask;
use crate::parser::{tokenize, eval_tokens, Token};
use crate::rng::make_rng;
use crate::shapes::{point_in_circle, point_in_hexagon, point_in_polygon, point_in_triangle};

const MAX_SAMPLES: usize       = 10_000_000;
const MAX_VISUAL_POINTS: usize = 5_000;
const MAX_FORMULA_LEN: usize   = 500;

// ── Типы запроса ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct BoundingBox {
    pub x_min: f64,
    pub x_max: f64,
    pub y_min: f64,
    pub y_max: f64,
}

/// Типизированные параметры шаблонной фигуры
#[derive(Deserialize, Clone)]
pub struct PresetInner {
    #[serde(default = "default_radius")]
    pub radius: f64,
    #[serde(default)]
    pub cx: f64,
    #[serde(default)]
    pub cy: f64,
}
fn default_radius() -> f64 { 1.0 }

#[derive(Deserialize)]
pub struct PresetParams {
    pub kind: String,
    pub params: PresetInner,
}

#[derive(Deserialize)]
pub struct Shape {
    #[serde(rename = "type")]
    pub shape_type: String,
    pub points:       Option<Vec<[f64; 2]>>,
    pub preset:       Option<PresetParams>,
    pub formula:      Option<String>,
    pub bounding_box: Option<BoundingBox>,
}

#[derive(Deserialize)]
pub struct RngConfig {
    #[serde(rename = "type")]
    pub rng_type: String,
    pub seed: u64,
}

#[derive(Deserialize)]
pub struct CalcRequest {
    pub shape:   Shape,
    pub rng:     RngConfig,
    pub samples: usize,
}

// ── Типы ответа ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CalcResponse {
    pub area:              f64,
    pub samples_inside:    usize,
    pub samples_total:     usize,
    pub bounding_box_area: f64,
    pub analytical_area:   Option<f64>,
    pub relative_error:    Option<f64>,
    pub points_sample:     Vec<(f64, f64, bool)>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

// ── Вспомогательные функции ───────────────────────────────────────────────────

fn get_bounding_box(shape: &Shape) -> (f64, f64, f64, f64) {
    if let Some(bb) = &shape.bounding_box {
        return (bb.x_min, bb.x_max, bb.y_min, bb.y_max);
    }
    if shape.shape_type == "preset" {
        if let Some(p) = &shape.preset {
            let r = p.params.radius;
            return (-r, r, -r, r);
        }
    }
    if let Some(pts) = &shape.points {
        if !pts.is_empty() {
            let x_min = pts.iter().map(|p| p[0]).fold(f64::INFINITY,    f64::min);
            let x_max = pts.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max);
            let y_min = pts.iter().map(|p| p[1]).fold(f64::INFINITY,    f64::min);
            let y_max = pts.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
            return (x_min, x_max, y_min, y_max);
        }
    }
    (-1.0, 1.0, -1.0, 1.0)
}

fn analytical_area(shape: &Shape) -> Option<f64> {
    if shape.shape_type != "preset" { return None; }
    let preset = shape.preset.as_ref()?;
    let r = preset.params.radius;
    match preset.kind.as_str() {
        "circle"   => Some(std::f64::consts::PI * r * r),
        "triangle" => {
            // Если переданы вершины, считаем через формулу Шулейса
            if let Some(pts) = &shape.points {
                if pts.len() >= 3 {
                    let (x1, y1) = (pts[0][0], pts[0][1]);
                    let (x2, y2) = (pts[1][0], pts[1][1]);
                    let (x3, y3) = (pts[2][0], pts[2][1]);
                    return Some(0.5 * ((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)).abs());
                }
            }
            // Правильный (вписанный в круг радиуса r) треугольник
            Some(3.0 * 3f64.sqrt() / 4.0 * r * r)
        }
        "hexagon"  => Some(3.0 * 3f64.sqrt() / 2.0 * r * r),
        _          => None,
    }
}

/// Проверка принадлежности точки фигуре.
/// Принимает предтокенизированные токены для формульного режима —
/// это устраняет аллокации в горячем цикле.
#[inline]
fn point_inside(
    shape_type:     &str,
    points:         Option<&Vec<[f64; 2]>>,
    preset:         Option<&PresetParams>,
    formula_tokens: Option<&[Token]>,
    px: f64,
    py: f64,
) -> bool {
    match shape_type {
        "polygon" | "canvas" => {
            points.map_or(false, |pts| point_in_polygon(px, py, pts))
        }
        "preset" => {
            let Some(p) = preset else { return false };
            let r  = p.params.radius;
            let cx = p.params.cx;
            let cy = p.params.cy;
            match p.kind.as_str() {
                "circle"   => point_in_circle(px, py, cx, cy, r),
                "hexagon"  => point_in_hexagon(px, py, cx, cy, r),
                "triangle" => {
                    if let Some(pts) = points {
                        if pts.len() >= 3 {
                            return point_in_triangle(px, py, &pts[..3]);
                        }
                    }
                    // Правильный треугольник по умолчанию
                    let eq = [
                        [ 0.0,                       r ],
                        [-r * 3f64.sqrt() * 0.5, -r * 0.5],
                        [ r * 3f64.sqrt() * 0.5, -r * 0.5],
                    ];
                    point_in_triangle(px, py, &eq)
                }
                _ => false,
            }
        }
        "formula" => {
            formula_tokens.map_or(false, |toks| eval_tokens(toks, px, py))
        }
        _ => false,
    }
}

// ── Симуляция Монте-Карло (синхронная, запускается в пуле блокирующих потоков) ─

fn run_simulation(
    shape:          Shape,
    rng_cfg:        RngConfig,
    n:              usize,
    formula_tokens: Option<Vec<Token>>,
) -> CalcResponse {
    let (x_min, x_max, y_min, y_max) = get_bounding_box(&shape);
    let bb_area   = (x_max - x_min) * (y_max - y_min);
    let analytical = analytical_area(&shape);

    let mut rng    = make_rng(&rng_cfg.rng_type, rng_cfg.seed);
    let mut inside = 0usize;

    let sample_every = (n / MAX_VISUAL_POINTS).max(1);
    let mut vis: Vec<(f64, f64, bool)> = Vec::with_capacity(MAX_VISUAL_POINTS);

    // Однократно получаем ссылки на поля shape — устраняем разыменование в цикле
    let shape_type = shape.shape_type.as_str();
    let points     = shape.points.as_ref();
    let preset     = shape.preset.as_ref();
    let toks_ref   = formula_tokens.as_deref();

    for i in 0..n {
        let px = x_min + rng.next_f64() * (x_max - x_min);
        let py = y_min + rng.next_f64() * (y_max - y_min);
        let hit = point_inside(shape_type, points, preset, toks_ref, px, py);
        if hit { inside += 1; }
        if i % sample_every == 0 && vis.len() < MAX_VISUAL_POINTS {
            vis.push((px, py, hit));
        }
    }

    let area = (inside as f64 / n as f64) * bb_area;
    let relative_error = analytical.map(|a| {
        if a.abs() > 1e-12 { ((area - a) / a).abs() } else { 0.0 }
    });

    CalcResponse {
        area,
        samples_inside: inside,
        samples_total:  n,
        bounding_box_area: bb_area,
        analytical_area: analytical,
        relative_error,
        points_sample: vis,
    }
}

// ── Ответ для режима изображения ──────────────────────────────────────────────

#[derive(Serialize)]
pub struct ImageCalcResponse {
    pub area_fraction:    f64,   // доля площади изображения
    pub area_pixels:      u64,   // оценка МК в пикселях
    pub true_pixel_count: usize, // точный подсчёт (для сравнения)
    pub image_width:      u32,
    pub image_height:     u32,
    pub samples_inside:   usize,
    pub samples_total:    usize,
    pub relative_error:   f64,
    /// Нормализованные координаты [0,1] для визуализации на изображении
    pub points_sample:    Vec<(f64, f64, bool)>,
}

// ── Симуляция МК для изображения ─────────────────────────────────────────────

fn run_image_simulation(
    mask:    ImageMask,
    rng_cfg: RngConfig,
    n:       usize,
) -> ImageCalcResponse {
    let true_count = mask.true_pixel_count();
    let total_px   = mask.total_pixels();

    let mut rng    = make_rng(&rng_cfg.rng_type, rng_cfg.seed);
    let mut inside = 0usize;

    let sample_every = (n / MAX_VISUAL_POINTS).max(1);
    let mut vis: Vec<(f64, f64, bool)> = Vec::with_capacity(MAX_VISUAL_POINTS);

    for i in 0..n {
        let px = (rng.next_f64() * mask.width  as f64) as u32;
        let py = (rng.next_f64() * mask.height as f64) as u32;
        let hit = mask.is_inside(px, py);
        if hit { inside += 1; }
        if i % sample_every == 0 && vis.len() < MAX_VISUAL_POINTS {
            let nx = px as f64 / mask.width  as f64;
            let ny = py as f64 / mask.height as f64;
            vis.push((nx, ny, hit));
        }
    }

    let area_fraction = inside as f64 / n as f64;
    let area_pixels   = (area_fraction * total_px as f64) as u64;
    let relative_error = if true_count > 0 {
        ((area_pixels as f64 - true_count as f64) / true_count as f64).abs()
    } else {
        0.0
    };

    ImageCalcResponse {
        area_fraction,
        area_pixels,
        true_pixel_count: true_count,
        image_width:  mask.width,
        image_height: mask.height,
        samples_inside: inside,
        samples_total:  n,
        relative_error,
        points_sample: vis,
    }
}

// ── Эндпоинт /api/calculate-image ────────────────────────────────────────────

#[post("/api/calculate-image")]
pub async fn calculate_image(mut payload: Multipart) -> Result<HttpResponse> {
    let mut image_bytes: Option<Vec<u8>> = None;
    let mut rng_type  = String::from("mersenne");
    let mut seed: u64 = 42;
    let mut samples   = 100_000usize;
    let mut threshold = 128u8;
    let mut invert    = false;

    // Читаем multipart-поля
    while let Some(item) = payload.next().await {
        let mut field = match item {
            Ok(f)  => f,
            Err(e) => return Ok(HttpResponse::BadRequest().json(ErrorResponse { error: e.to_string() })),
        };

        let name = field
            .content_disposition()
            .and_then(|cd| cd.get_name())
            .unwrap_or("")
            .to_string();

        let mut data: Vec<u8> = Vec::new();
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(bytes) => data.extend_from_slice(&bytes),
                Err(e)    => return Ok(HttpResponse::BadRequest().json(ErrorResponse { error: e.to_string() })),
            }
        }

        match name.as_str() {
            "image"     => image_bytes = Some(data),
            "rng_type"  => rng_type = String::from_utf8_lossy(&data).trim().to_string(),
            "seed"      => seed      = String::from_utf8_lossy(&data).trim().parse().unwrap_or(42),
            "samples"   => samples   = String::from_utf8_lossy(&data).trim().parse().unwrap_or(100_000),
            "threshold" => threshold = String::from_utf8_lossy(&data).trim().parse().unwrap_or(128),
            "invert"    => invert    = String::from_utf8_lossy(&data).trim() == "true",
            _           => {}
        }
    }

    let bytes = match image_bytes {
        Some(b) => b,
        None    => return Ok(HttpResponse::BadRequest().json(ErrorResponse {
            error: "Изображение не передано".to_string(),
        })),
    };

    let mask = match ImageMask::from_bytes(&bytes, threshold, invert) {
        Ok(m)  => m,
        Err(e) => return Ok(HttpResponse::BadRequest().json(ErrorResponse { error: e })),
    };

    let n       = samples.clamp(1, MAX_SAMPLES);
    let rng_cfg = RngConfig { rng_type, seed };

    let resp = web::block(move || run_image_simulation(mask, rng_cfg, n))
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    Ok(HttpResponse::Ok().json(resp))
}

// ── Эндпоинт API ──────────────────────────────────────────────────────────────

#[post("/api/calculate")]
pub async fn calculate(body: web::Json<CalcRequest>) -> Result<HttpResponse> {
    let CalcRequest { shape, rng, samples } = body.into_inner();

    // Валидация длины формулы
    if let Some(f) = &shape.formula {
        if f.len() > MAX_FORMULA_LEN {
            return Ok(HttpResponse::BadRequest().json(ErrorResponse {
                error: format!(
                    "Формула слишком длинная (максимум {} символов)",
                    MAX_FORMULA_LEN
                ),
            }));
        }
    }

    let n = samples.clamp(1, MAX_SAMPLES);

    // Токенизируем формулу один раз здесь, до переноса в поток —
    // это устраняет миллионы аллокаций в горячем цикле симуляции.
    let formula_tokens: Option<Vec<Token>> = if shape.shape_type == "formula" {
        shape.formula.as_deref().map(tokenize)
    } else {
        None
    };

    // Переносим тяжёлую CPU-bound работу в пул блокирующих потоков Tokio,
    // чтобы не блокировать асинхронный рантайм actix-web.
    let resp = web::block(move || {
        run_simulation(shape, rng, n, formula_tokens)
    })
    .await
    .map_err(actix_web::error::ErrorInternalServerError)?;

    Ok(HttpResponse::Ok().json(resp))
}
