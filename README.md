# Monte Carlo Area Calculator

Веб-приложение для вычисления площади произвольных фигур методом Монте-Карло.

**Stack:** React + Vite (frontend) · Rust + Actix-web (backend)

---

## Запуск

### Backend (Rust)
```bash
cd backend
cargo run --release
# Слушает на http://localhost:8080
```

### Frontend (React)
```bash
cd frontend
npm install
npm run dev
# Открыть http://localhost:5173
```

---

## Возможности

### Способы задания фигуры
- **Formula** — математическое выражение (`x^2 + y^2 <= 1`), preview на Canvas
- **Draw** — рисование мышью на холсте
- **Preset** — Circle / Triangle / Hexagon с настройкой радиуса
- **Polygon** — кликами задать вершины полигона

### Генераторы псевдослучайных чисел (9 штук)
| ID | Алгоритм |
|----|---------|
| `lcg` | Linear Congruential Generator |
| `mcg` | Multiplicative CG (Park-Miller) |
| `xorshift` | Xorshift64 |
| `xoroshiro` | Xoroshiro256** |
| `mersenne` | Mersenne Twister MT19937 |
| `pcg` | PCG32 |
| `splitmix64` | SplitMix64 |
| `lagged_fibonacci` | Lagged Fibonacci (degree 521) |
| `blum_blum_shub` | Blum Blum Shub (crypto) |

### API
`POST http://localhost:8080/api/calculate`

```json
{
  "shape": {
    "type": "preset",
    "preset": { "kind": "circle", "params": { "radius": 1.0 } },
    "bounding_box": { "x_min": -1, "x_max": 1, "y_min": -1, "y_max": 1 }
  },
  "rng": { "type": "mersenne", "seed": 42 },
  "samples": 1000000
}
```

---

## Переменные окружения

```
BACKEND_PORT=8080          # Порт backend (по умолчанию 8080)
VITE_BACKEND_URL=          # URL backend для frontend (пусто = прокси через Vite)
```
