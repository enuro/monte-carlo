use std::collections::VecDeque;

/// Общий трейт для всех генераторов псевдослучайных чисел.
/// Bound `Send` позволяет передавать Box<dyn Rng> между потоками (нужно для web::block).
pub trait Rng: Send {
    fn next_u64(&mut self) -> u64;

    /// Равномерный float в [0, 1) через верхние 53 бита
    #[inline]
    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }
}

// ── 1. Линейный конгруэнтный генератор ────────────────────────────────────────
pub struct Lcg {
    state: u64,
}
impl Lcg {
    pub fn new(seed: u64) -> Self {
        Self { state: seed.wrapping_add(1) }
    }
}
impl Rng for Lcg {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        // Параметры из Numerical Recipes
        self.state = self.state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.state
    }
}

// ── 2. Мультипликативный конгруэнтный генератор (Парк-Миллер) ─────────────────
pub struct Mcg {
    state: u64,
}
impl Mcg {
    pub fn new(seed: u64) -> Self {
        let s = if seed == 0 { 1 } else { seed & 0x7FFF_FFFF };
        Self { state: s }
    }
}
impl Rng for Mcg {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        // m = 2^31 − 1, a = 16807
        self.state = self.state.wrapping_mul(16_807) % 2_147_483_647;
        // Расширяем 31-битный результат до 64 бит
        self.state << 33 | self.state
    }
}

// ── 3. Xorshift64 ─────────────────────────────────────────────────────────────
pub struct Xorshift64 {
    state: u64,
}
impl Xorshift64 {
    pub fn new(seed: u64) -> Self {
        Self { state: if seed == 0 { 0xDEAD_BEEF_CAFE_BABE } else { seed } }
    }
}
impl Rng for Xorshift64 {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }
}

// ── 4. Xoroshiro256** ─────────────────────────────────────────────────────────
pub struct Xoroshiro256 {
    s: [u64; 4],
}
impl Xoroshiro256 {
    pub fn new(seed: u64) -> Self {
        // Сеем через SplitMix64, чтобы избежать нулевого состояния
        let mut sm = SplitMix64::new(seed);
        Self { s: [sm.next_u64(), sm.next_u64(), sm.next_u64(), sm.next_u64()] }
    }
}
#[inline]
fn rotl(x: u64, k: u32) -> u64 {
    (x << k) | (x >> (64 - k))
}
impl Rng for Xoroshiro256 {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let result = rotl(self.s[1].wrapping_mul(5), 7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = rotl(self.s[3], 45);
        result
    }
}

// ── 5. Вихрь Мерсенна MT19937 ─────────────────────────────────────────────────
pub struct MersenneTwister {
    mt: Vec<u32>,
    index: usize,
}
impl MersenneTwister {
    pub fn new(seed: u64) -> Self {
        let mut mt = vec![0u32; 624];
        mt[0] = seed as u32;
        for i in 1..624 {
            mt[i] = 1_812_433_253u32
                .wrapping_mul(mt[i - 1] ^ (mt[i - 1] >> 30))
                .wrapping_add(i as u32);
        }
        Self { mt, index: 624 }
    }

    fn twist(&mut self) {
        for i in 0..624usize {
            let y = (self.mt[i] & 0x8000_0000) | (self.mt[(i + 1) % 624] & 0x7FFF_FFFF);
            self.mt[i] = self.mt[(i + 397) % 624] ^ (y >> 1);
            if y & 1 != 0 {
                self.mt[i] ^= 2_567_483_615;
            }
        }
        self.index = 0;
    }

    #[inline]
    fn temper(mut y: u32) -> u32 {
        y ^= y >> 11;
        y ^= (y << 7) & 2_636_928_640;
        y ^= (y << 15) & 4_022_730_752;
        y ^= y >> 18;
        y
    }
}
impl Rng for MersenneTwister {
    fn next_u64(&mut self) -> u64 {
        if self.index >= 624 {
            self.twist();
        }
        let hi = Self::temper(self.mt[self.index]) as u64;
        self.index += 1;
        if self.index >= 624 {
            self.twist();
        }
        let lo = Self::temper(self.mt[self.index]) as u64;
        self.index += 1;
        (hi << 32) | lo
    }
}

// ── 6. PCG32 ──────────────────────────────────────────────────────────────────
pub struct Pcg32 {
    state: u64,
    inc: u64,
}
impl Pcg32 {
    pub fn new(seed: u64) -> Self {
        let mut rng = Self { state: 0, inc: (seed << 1) | 1 };
        rng.state = rng.state.wrapping_add(rng.inc);
        rng.advance(); // прогрев
        rng
    }

    #[inline]
    fn advance(&mut self) -> u32 {
        let old = self.state;
        self.state = old.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }
}
impl Rng for Pcg32 {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let hi = self.advance() as u64;
        let lo = self.advance() as u64;
        (hi << 32) | lo
    }
}

// ── 7. SplitMix64 ─────────────────────────────────────────────────────────────
pub struct SplitMix64 {
    state: u64,
}
impl SplitMix64 {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }
}
impl Rng for SplitMix64 {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }
}

// ── 8. Запаздывающий Фибоначчи (степень 521, смещение 32) ────────────────────
pub struct LaggedFibonacci {
    buf: VecDeque<u64>,
    j: usize,
}
impl LaggedFibonacci {
    pub fn new(seed: u64) -> Self {
        let mut sm = SplitMix64::new(seed);
        let buf: VecDeque<u64> = (0..521).map(|_| sm.next_u64()).collect();
        Self { buf, j: 32 }
    }
}
impl Rng for LaggedFibonacci {
    #[inline]
    fn next_u64(&mut self) -> u64 {
        let k = self.buf.len();
        let result = self.buf[k - self.j].wrapping_add(self.buf[0]);
        self.buf.pop_front();
        self.buf.push_back(result);
        result
    }
}

// ── 9. Блюм-Блюм-Шуб (упрощённый, криптографический) ─────────────────────────
pub struct BlumBlumShub {
    state: u128,
    m: u128,
}
impl BlumBlumShub {
    pub fn new(seed: u64) -> Self {
        // p, q ≡ 3 (mod 4) — безопасные простые для демонстрации
        let p: u128 = 1_073_748_523;
        let q: u128 = 1_073_750_899;
        let m = p * q;
        let mut s = (seed as u128 | 1) % m;
        if s < 2 { s = 2; }
        Self { state: (s * s) % m, m }
    }
}
impl Rng for BlumBlumShub {
    fn next_u64(&mut self) -> u64 {
        // Извлекаем по 1 биту — медленно, но криптографически корректно
        let mut result = 0u64;
        for i in 0..64u64 {
            self.state = (self.state * self.state) % self.m;
            result |= ((self.state & 1) as u64) << i;
        }
        result
    }
}

// ── Фабрика ───────────────────────────────────────────────────────────────────
pub fn make_rng(rng_type: &str, seed: u64) -> Box<dyn Rng> {
    match rng_type {
        "lcg"              => Box::new(Lcg::new(seed)),
        "mcg"              => Box::new(Mcg::new(seed)),
        "xorshift"         => Box::new(Xorshift64::new(seed)),
        "xoroshiro"        => Box::new(Xoroshiro256::new(seed)),
        "mersenne"         => Box::new(MersenneTwister::new(seed)),
        "pcg"              => Box::new(Pcg32::new(seed)),
        "splitmix64"       => Box::new(SplitMix64::new(seed)),
        "lagged_fibonacci" => Box::new(LaggedFibonacci::new(seed)),
        "blum_blum_shub"   => Box::new(BlumBlumShub::new(seed)),
        _                  => Box::new(SplitMix64::new(seed)), // fallback
    }
}
