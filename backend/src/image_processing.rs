use image::DynamicImage;

const MAX_IMAGE_DIM: u32    = 800;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024; // 10 МБ

/// Бинарная маска изображения: для каждого пикселя хранит,
/// принадлежит ли он «фигуре» (true) или «фону» (false).
pub struct ImageMask {
    pub width:  u32,
    pub height: u32,
    pixels: Vec<bool>,
}

impl ImageMask {
    /// Загружает изображение из байтов, масштабирует до MAX_IMAGE_DIM
    /// и строит маску по порогу яркости.
    ///
    /// * `threshold` — значение яркости (0–255)
    /// * `invert`    — если true, светлые пиксели (> threshold) = фигура;
    ///                 если false, тёмные пиксели (< threshold) = фигура
    pub fn from_bytes(bytes: &[u8], threshold: u8, invert: bool) -> Result<Self, String> {
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err("Изображение слишком большое (максимум 10 МБ)".to_string());
        }

        let img = image::load_from_memory(bytes)
            .map_err(|e| format!("Не удалось загрузить изображение: {}", e))?;

        // Уменьшаем, если нужно, сохраняя пропорции
        let img: DynamicImage = if img.width() > MAX_IMAGE_DIM || img.height() > MAX_IMAGE_DIM {
            img.thumbnail(MAX_IMAGE_DIM, MAX_IMAGE_DIM)
        } else {
            img
        };

        let (width, height) = (img.width(), img.height());

        // Переводим в grayscale и строим булеву маску
        let gray = img.to_luma8();
        let pixels: Vec<bool> = gray
            .pixels()
            .map(|p| {
                let b = p.0[0];
                if invert { b > threshold } else { b < threshold }
            })
            .collect();

        Ok(ImageMask { width, height, pixels })
    }

    /// Принадлежит ли пиксель (x, y) фигуре?
    #[inline]
    pub fn is_inside(&self, x: u32, y: u32) -> bool {
        if x >= self.width || y >= self.height {
            return false;
        }
        self.pixels[(y * self.width + x) as usize]
    }

    /// Точное количество пикселей фигуры (используется для сравнения с МК-оценкой).
    pub fn true_pixel_count(&self) -> usize {
        self.pixels.iter().filter(|&&b| b).count()
    }

    pub fn total_pixels(&self) -> usize {
        (self.width * self.height) as usize
    }
}
