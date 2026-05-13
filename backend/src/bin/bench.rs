mod rng {
    include!("../rng.rs");
}

use std::time::Instant;
use rng::make_rng;

const N: usize = 1_000_000;
const SEED: u64 = 42;
const R: f64 = 1.0;
const ANALYTICAL: f64 = std::f64::consts::PI;

fn monte_carlo_circle(rng_type: &str) -> (f64, f64, f64) {
    let mut rng = make_rng(rng_type, SEED);
    let t0 = Instant::now();
    let mut inside = 0usize;
    for _ in 0..N {
        let x = rng.next_f64() * 2.0 - 1.0;
        let y = rng.next_f64() * 2.0 - 1.0;
        if x * x + y * y <= R * R {
            inside += 1;
        }
    }
    let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let area = (inside as f64 / N as f64) * 4.0;
    let error = ((area - ANALYTICAL) / ANALYTICAL).abs() * 100.0;
    (elapsed_ms, area, error)
}

fn main() {
    let rngs = [
        "lcg", "mcg", "xorshift", "xoroshiro",
        "mersenne", "pcg", "splitmix64", "lagged_fibonacci", "blum_blum_shub",
    ];

    for id in &rngs {
        let (ms, area, err) = monte_carlo_circle(id);
        println!("{}\t{:.1}\t{:.8}\t{:.4}", id, ms, area, err);
    }
}
