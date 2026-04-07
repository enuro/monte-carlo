import { useState, useRef, useEffect, useCallback } from 'react'
import * as math from 'mathjs'

const BACKEND = import.meta.env.VITE_BACKEND_URL || ''

// ─── Константы ────────────────────────────────────────────────────────────────

const RNGS = [
  { value: 'lcg',             label: 'ЛКГ (Линейный конгруэнтный)' },
  { value: 'mcg',             label: 'МКГ / Парк-Миллер' },
  { value: 'xorshift',        label: 'Xorshift64' },
  { value: 'xoroshiro',       label: 'Xoroshiro256**' },
  { value: 'mersenne',        label: 'Вихрь Мерсенна (MT19937)' },
  { value: 'pcg',             label: 'PCG32' },
  { value: 'splitmix64',      label: 'SplitMix64' },
  { value: 'lagged_fibonacci', label: 'Запаздывающий Фибоначчи (ст. 521)' },
  { value: 'blum_blum_shub',  label: 'Блюм-Блюм-Шуб (крипто)' },
]

const PRESETS = [
  { value: 'circle',   label: 'Круг' },
  { value: 'triangle', label: 'Треугольник' },
  { value: 'hexagon',  label: 'Шестиугольник' },
]

const SHAPE_LABELS = { formula: 'Формула', canvas: 'Рисование', preset: 'Шаблон', polygon: 'Полигон', photo: 'Фотография' }

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/** Дебаунс: обновляет значение через `ms` мс после последнего изменения */
function useDebounce(value, ms) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

// ─── Превью формулы ──────────────────────────────────────────────────────────
function FormulaPreview({ formula, width = 200, height = 200 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f8faff'
    ctx.fillRect(0, 0, width, height)

    const step = 4
    for (let px = 0; px < width; px += step) {
      for (let py = 0; py < height; py += step) {
        const x = (px / width) * 4 - 2
        const y = -((py / height) * 4 - 2)
        let inside = false
        try {
          inside = Boolean(math.evaluate(formula, { x, y }))
        } catch {}
        ctx.fillStyle = inside ? 'rgba(51,102,153,0.3)' : 'rgba(200,220,240,0.4)'
        ctx.fillRect(px, py, step, step)
      }
    }
    // Оси координат
    ctx.strokeStyle = '#b0c8e0'
    ctx.beginPath()
    ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height)
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2)
    ctx.stroke()
  }, [formula, width, height])

  return <canvas ref={canvasRef} width={width} height={height} style={{ marginTop: 8 }} />
}

// ─── Канвас рисования ────────────────────────────────────────────────────────
function DrawCanvas({ onPointsChange }) {
  const canvasRef  = useRef(null)
  const drawingRef = useRef(false)   // ref вместо state — нет лишних ре-рендеров
  const pathRef    = useRef([])

  const getPos = (e, canvas) => {
    const rect  = canvas.getBoundingClientRect()
    const touch = e.touches?.[0] || e.changedTouches?.[0]
    if (touch) return [touch.clientX - rect.left, touch.clientY - rect.top]
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f8faff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#d0dce8'
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
    }
    if (pathRef.current.length > 1) {
      ctx.beginPath()
      ctx.moveTo(pathRef.current[0][0], pathRef.current[0][1])
      pathRef.current.forEach(([x, y]) => ctx.lineTo(x, y))
      ctx.closePath()
      ctx.fillStyle   = 'rgba(51,102,153,0.18)'
      ctx.strokeStyle = '#336699'
      ctx.lineWidth   = 2
      ctx.fill()
      ctx.stroke()
    }
  }, [])

  const handleStart = useCallback((e) => {
    pathRef.current   = []
    drawingRef.current = true
    const [x, y] = getPos(e, canvasRef.current)
    pathRef.current.push([x, y])
    redraw()
  }, [redraw])

  const handleMove = useCallback((e) => {
    if (!drawingRef.current) return
    const [x, y] = getPos(e, canvasRef.current)
    pathRef.current.push([x, y])
    redraw()
  }, [redraw])

  const handleEnd = useCallback(() => {
    drawingRef.current = false
    redraw()
    const canvas = canvasRef.current
    const normalized = pathRef.current.map(([x, y]) => [
      (x / canvas.width) * 4 - 2,
      -((y / canvas.height) * 4 - 2),
    ])
    onPointsChange(normalized)
  }, [redraw, onPointsChange])

  // Touch-события с { passive: false } — иначе нельзя вызвать preventDefault
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const opts = { passive: false }
    const ts = (e) => { e.preventDefault(); handleStart(e) }
    const tm = (e) => { e.preventDefault(); handleMove(e) }
    const te = (e) => { e.preventDefault(); handleEnd() }
    canvas.addEventListener('touchstart', ts, opts)
    canvas.addEventListener('touchmove',  tm, opts)
    canvas.addEventListener('touchend',   te, opts)
    return () => {
      canvas.removeEventListener('touchstart', ts)
      canvas.removeEventListener('touchmove',  tm)
      canvas.removeEventListener('touchend',   te)
    }
  }, [handleStart, handleMove, handleEnd])

  useEffect(() => { redraw() }, [redraw])

  return (
    <div>
      <label>Нарисуйте фигуру мышью:</label>
      <canvas
        ref={canvasRef}
        width={280} height={280}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        style={{ cursor: 'crosshair', marginTop: 6, touchAction: 'none' }}
      />
      <p className="canvas-hint">Удерживайте кнопку мыши и рисуйте</p>
    </div>
  )
}

// ─── Канвас полигона ─────────────────────────────────────────────────────────
function PolygonCanvas({ points, onAdd }) {
  const canvasRef = useRef(null)
  const W = 280, H = 280

  const toScreen = ([x, y]) => [((x + 2) / 4) * W, ((-y + 2) / 4) * H]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f8faff'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#d0dce8'
    for (let x = 0; x < W; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
    ctx.strokeStyle = '#b0c8e0'
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()

    if (points.length > 1) {
      ctx.beginPath()
      const [sx, sy] = toScreen(points[0])
      ctx.moveTo(sx, sy)
      points.forEach(p => { const [x, y] = toScreen(p); ctx.lineTo(x, y) })
      ctx.closePath()
      ctx.fillStyle   = 'rgba(51,102,153,0.15)'
      ctx.strokeStyle = '#336699'
      ctx.lineWidth   = 2
      ctx.fill()
      ctx.stroke()
    }
    points.forEach(([px, py], i) => {
      const [sx, sy] = toScreen([px, py])
      ctx.fillStyle = '#cc3300'
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#224488'
      ctx.font = 'bold 10px Arial'
      ctx.fillText(i + 1, sx + 6, sy - 3)
    })
  }, [points])

  const handleClick = (e) => {
    const rect   = canvasRef.current.getBoundingClientRect()
    const touch  = e.touches?.[0]
    const cx     = (touch?.clientX ?? e.clientX) - rect.left
    const cy     = (touch?.clientY ?? e.clientY) - rect.top
    onAdd([parseFloat(((cx / W) * 4 - 2).toFixed(3)), parseFloat((-((cy / H) * 4 - 2)).toFixed(3))])
  }

  return (
    <div>
      <label>Нажимайте для добавления вершин:</label>
      <canvas
        ref={canvasRef}
        width={W} height={H}
        onClick={handleClick}
        style={{ marginTop: 6 }}
      />
    </div>
  )
}

// ─── Канвас результата ───────────────────────────────────────────────────────
function ResultCanvas({ result, bbRange }) {
  const canvasRef = useRef(null)
  const W = 360, H = 360

  useEffect(() => {
    if (!result?.points_sample) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f8faff'
    ctx.fillRect(0, 0, W, H)

    const [xMin, xMax, yMin, yMax] = bbRange
    const toSX = (x) => ((x - xMin) / (xMax - xMin)) * W
    const toSY = (y) => H - ((y - yMin) / (yMax - yMin)) * H

    ctx.strokeStyle = '#d0dce8'
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * W, y = (i / 10) * H
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    result.points_sample.forEach(([x, y, inside]) => {
      ctx.fillStyle = inside ? 'rgba(0,140,0,0.65)' : 'rgba(200,0,0,0.45)'
      ctx.fillRect(toSX(x) - 1, toSY(y) - 1, 2, 2)
    })
  }, [result, bbRange])

  if (!result) return null
  return (
    <div>
      <div className="vis-legend">
        <span><span className="dot-green" /> Внутри</span>
        <span><span className="dot-red" /> Снаружи</span>
        <span style={{ color: '#999' }}>({result.points_sample.length} точек)</span>
      </div>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', height: 'auto' }} />
    </div>
  )
}

// ─── Загрузка фото + превью маски ────────────────────────────────────────────
function PhotoUpload({ imageFile, onImageChange, threshold, onThresholdChange, invert, onInvertChange }) {
  const canvasRef   = useRef(null)
  const origDataRef = useRef(null)

  // Загружаем изображение один раз при смене файла
  useEffect(() => {
    if (!imageFile) return
    origDataRef.current = null
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const MAX   = 280
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const W     = Math.round(img.width  * scale)
      const H     = Math.round(img.height * scale)
      canvas.width  = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, W, H)
      origDataRef.current = ctx.getImageData(0, 0, W, H)
      applyMask(ctx, W, H, threshold, invert)
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [imageFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Перерисовываем маску при изменении порога или инверсии
  useEffect(() => {
    if (!origDataRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    applyMask(canvas.getContext('2d'), canvas.width, canvas.height, threshold, invert)
  }, [threshold, invert])

  function applyMask(ctx, W, H, thr, inv) {
    if (!origDataRef.current) return
    const copy = new ImageData(new Uint8ClampedArray(origDataRef.current.data), W, H)
    const d = copy.data
    for (let i = 0; i < d.length; i += 4) {
      const brightness = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
      const inside = inv ? brightness > thr : brightness < thr
      if (inside) {
        // Синяя подсветка = фигура
        d[i]     = Math.round(d[i]     * 0.2 + 10)
        d[i + 1] = Math.round(d[i + 1] * 0.2 + 80)
        d[i + 2] = Math.round(d[i + 2] * 0.2 + 190)
      }
    }
    ctx.putImageData(copy, 0, 0)
  }

  return (
    <div>
      <div className="field-group">
        <label>Выберите фотографию:</label>
        <input
          type="file"
          accept="image/*"
          onChange={e => { origDataRef.current = null; onImageChange(e.target.files[0] || null) }}
        />
      </div>
      {imageFile ? (
        <>
          <canvas ref={canvasRef} style={{ marginTop: 8, maxWidth: '100%', display: 'block' }} />
          <p className="hint">Синие пиксели — фигура. Подберите порог ниже.</p>
          <div className="field-group">
            <label>Порог яркости: <strong>{threshold}</strong></label>
            <input
              type="range" min={0} max={255} value={threshold}
              onChange={e => onThresholdChange(+e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="field-group">
            <label className="radio-label">
              <input
                type="checkbox"
                checked={invert}
                onChange={e => onInvertChange(e.target.checked)}
              />
              &nbsp;Инвертировать (светлые пиксели = фигура)
            </label>
          </div>
        </>
      ) : (
        <p className="hint">
          Загрузите фото лужи, плана парка или любой фигуры.<br />
          Бэкенд обработает изображение и вычислит площадь методом Монте-Карло.
        </p>
      )}
    </div>
  )
}

// ─── Канвас результата для режима фото ───────────────────────────────────────
function ImageResultCanvas({ result, imageFile }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!result || !imageFile) return
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const W = 360
      const H = Math.round(360 * img.height / img.width)
      canvas.width  = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, W, H)
      result.points_sample.forEach(([nx, ny, inside]) => {
        ctx.fillStyle = inside ? 'rgba(0,210,0,0.75)' : 'rgba(220,30,30,0.55)'
        ctx.fillRect(nx * W - 1.5, ny * H - 1.5, 3, 3)
      })
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [result, imageFile])

  if (!result) return null
  return (
    <div>
      <div className="vis-legend">
        <span><span className="dot-green" /> Внутри фигуры</span>
        <span><span className="dot-red" /> Снаружи</span>
        <span style={{ color: '#999' }}>({result.points_sample.length} точек)</span>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto' }} />
    </div>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────
export default function App() {
  const [shapeTab,     setShapeTab]     = useState('formula')
  const [formula,      setFormula]      = useState('x^2 + y^2 <= 1')
  const [drawPoints,   setDrawPoints]   = useState([])
  const [polyPoints,   setPolyPoints]   = useState([])
  const [presetKind,   setPresetKind]   = useState('circle')
  const [presetRadius, setPresetRadius] = useState(1.0)
  const [imageFile,    setImageFile]    = useState(null)
  const [imgThreshold, setImgThreshold] = useState(128)
  const [imgInvert,    setImgInvert]    = useState(false)
  const [rngType,      setRngType]      = useState('mersenne')
  const [seed,         setSeed]         = useState(42)
  const [samples,      setSamples]      = useState(500000)
  const [loading,      setLoading]      = useState(false)
  const [progress,     setProgress]     = useState(0)
  const [result,       setResult]       = useState(null)
  const [error,        setError]        = useState(null)
  const [bbRange,      setBbRange]      = useState([-1, 1, -1, 1])
  const [now,          setNow]          = useState(new Date().toLocaleTimeString('ru-RU'))

  // AbortController для отмены предыдущего запроса при повторном нажатии
  const abortRef = useRef(null)

  // Часы
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toLocaleTimeString('ru-RU')), 1000)
    return () => clearInterval(t)
  }, [])

  // Дебаунс для превью формулы — рендер идёт только спустя 300 мс после остановки ввода
  const debouncedFormula = useDebounce(formula, 300)

  // ── Валидация ──────────────────────────────────────────────────────────────
  const validate = () => {
    if (shapeTab === 'formula') {
      if (!formula.trim()) return 'Введите формулу'
      if (formula.length > 500) return 'Формула слишком длинная (максимум 500 символов)'
    }
    if (shapeTab === 'canvas' && drawPoints.length < 3)
      return 'Нарисуйте фигуру (минимум 3 точки)'
    if (shapeTab === 'polygon' && polyPoints.length < 3)
      return 'Добавьте минимум 3 вершины полигона'
    if (shapeTab === 'photo' && !imageFile)
      return 'Загрузите фотографию'
    const n = parseInt(samples)
    if (!n || n < 1000)       return 'Количество выборок: минимум 1 000'
    if (n > 10_000_000)       return 'Количество выборок: максимум 10 000 000'
    return null
  }

  // ── Построение запроса (без side-effects) ──────────────────────────────────
  const buildShapeRequest = () => {
    const shape = { type: shapeTab }
    let xMin = -2, xMax = 2, yMin = -2, yMax = 2

    if (shapeTab === 'formula') {
      shape.formula      = formula
      shape.bounding_box = { x_min: -2, x_max: 2, y_min: -2, y_max: 2 }
    } else if (shapeTab === 'canvas') {
      shape.points = drawPoints
      if (drawPoints.length > 0) {
        xMin = Math.min(...drawPoints.map(p => p[0])) - 0.1
        xMax = Math.max(...drawPoints.map(p => p[0])) + 0.1
        yMin = Math.min(...drawPoints.map(p => p[1])) - 0.1
        yMax = Math.max(...drawPoints.map(p => p[1])) + 0.1
      }
      shape.bounding_box = { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax }
    } else if (shapeTab === 'preset') {
      const r = parseFloat(presetRadius) || 1
      xMin = -r; xMax = r; yMin = -r; yMax = r
      shape.preset       = { kind: presetKind, params: { radius: r, cx: 0, cy: 0 } }
      shape.bounding_box = { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax }
    } else if (shapeTab === 'polygon') {
      shape.points = polyPoints
      if (polyPoints.length > 0) {
        xMin = Math.min(...polyPoints.map(p => p[0])) - 0.2
        xMax = Math.max(...polyPoints.map(p => p[0])) + 0.2
        yMin = Math.min(...polyPoints.map(p => p[1])) - 0.2
        yMax = Math.max(...polyPoints.map(p => p[1])) + 0.2
      }
      shape.bounding_box = { x_min: xMin, x_max: xMax, y_min: yMin, y_max: yMax }
    }

    return { shape, xMin, xMax, yMin, yMax }
  }

  // ── Запуск симуляции ───────────────────────────────────────────────────────
  const handleCalculate = async () => {
    const validErr = validate()
    if (validErr) { setError(validErr); return }

    // Отменяем предыдущий запрос, если он ещё идёт
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setResult(null)
    setLoading(true)
    setProgress(0)

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 15, 90))
    }, 200)

    try {
      let res

      if (shapeTab === 'photo') {
        const formData = new FormData()
        formData.append('image',     imageFile)
        formData.append('rng_type',  rngType)
        formData.append('seed',      String(parseInt(seed) || 42))
        formData.append('samples',   String(parseInt(samples) || 100000))
        formData.append('threshold', String(imgThreshold))
        formData.append('invert',    String(imgInvert))

        res = await fetch(`${BACKEND}/api/calculate-image`, {
          method: 'POST',
          body:   formData,
          signal: controller.signal,
        })
      } else {
      const { shape, xMin, xMax, yMin, yMax } = buildShapeRequest()
      setBbRange([xMin, xMax, yMin, yMax])

      const req = {
        shape,
        rng:     { type: rngType, seed: parseInt(seed) || 42 },
        samples: parseInt(samples) || 100000,
      }

      res = await fetch(`${BACKEND}/api/calculate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(req),
        signal:  controller.signal,
      })
      }

      clearInterval(interval)

      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try { msg = (await res.json()).error || msg } catch {}
        throw new Error(msg)
      }

      const data = await res.json()
      setProgress(100)
      setResult(data)
    } catch (e) {
      clearInterval(interval)
      if (e.name !== 'AbortError') {
        setError(e.message || 'Ошибка подключения. Запущен ли бэкенд?')
      }
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n, d = 6) => (typeof n === 'number' ? n.toFixed(d) : '—')

  return (
    <div className="app-container">

      {/* ШАПКА */}
      <div className="forum-header">
        <div className="forum-header-logo">Σ</div>
        <div className="forum-header-text">
          <h1>Калькулятор площади методом Монте-Карло</h1>
          <p>Численное интегрирование · 9 алгоритмов ГСЧ · Визуализация выборки</p>
        </div>
      </div>

      {/* НАВИГАЦИЯ */}
      <div className="breadcrumb-bar">
        <span>
          <a href="#">Главная</a>
          {' › '}
          <a href="#">Симуляция</a>
          {' › '}
          Метод Монте-Карло
        </span>
        <span className="breadcrumb-right">
          {now} &nbsp;|&nbsp; ГСЧ: <strong>{rngType.toUpperCase()}</strong>
          &nbsp;|&nbsp; Зерно: <strong>{seed}</strong>
        </span>
      </div>

      <div className="two-col">

        {/* ЛЕВАЯ КОЛОНКА */}
        <div>

          {/* ФИГУРА */}
          <div className="forum-panel">
            <div className="forum-panel-head">
              <span className="icon">◈</span> [1] Определение фигуры
            </div>
            <div className="forum-panel-body">
              <div className="tab-bar">
                {[
                  { key: 'formula', label: '⚡ Формула' },
                  { key: 'canvas',  label: '✏ Рисование' },
                  { key: 'preset',  label: '◈ Шаблон' },
                  { key: 'polygon', label: '⬡ Полигон' },
                  { key: 'photo',   label: '📷 Фото' },
                ].map(t => (
                  <button
                    key={t.key}
                    className={`tab-btn ${shapeTab === t.key ? 'active' : ''}`}
                    onClick={() => setShapeTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {shapeTab === 'formula' && (
                <div>
                  <div className="field-group">
                    <label>Формула (переменные x, y):</label>
                    <input
                      type="text"
                      value={formula}
                      onChange={e => setFormula(e.target.value)}
                      placeholder="x^2 + y^2 <= 1"
                    />
                  </div>
                  <p className="hint">
                    Примеры: x^2 + y^2 &lt;= 1 &nbsp;|&nbsp;
                    abs(x) + abs(y) &lt;= 1 &nbsp;|&nbsp;
                    x^2/4 + y^2 &lt;= 1
                  </p>
                  <FormulaPreview formula={debouncedFormula} width={200} height={200} />
                </div>
              )}

              {shapeTab === 'canvas' && (
                <DrawCanvas onPointsChange={setDrawPoints} />
              )}

              {shapeTab === 'preset' && (
                <div>
                  <div className="field-group">
                    <label>Форма:</label>
                    <div className="radio-group">
                      {PRESETS.map(p => (
                        <label key={p.value} className="radio-label">
                          <input
                            type="radio" name="preset" value={p.value}
                            checked={presetKind === p.value}
                            onChange={() => setPresetKind(p.value)}
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Радиус / Размер:</label>
                    <input
                      type="number" value={presetRadius}
                      onChange={e => setPresetRadius(e.target.value)}
                      min="0.1" max="10" step="0.1"
                    />
                  </div>
                </div>
              )}

              {shapeTab === 'polygon' && (
                <div>
                  <PolygonCanvas
                    points={polyPoints}
                    onAdd={pt => setPolyPoints(prev => [...prev, pt])}
                  />
                  <div className="btn-row">
                    <button className="forum-btn danger" onClick={() => setPolyPoints([])}>
                      Очистить
                    </button>
                    <button className="forum-btn" onClick={() => setPolyPoints(p => p.slice(0, -1))}>
                      Отменить
                    </button>
                  </div>
                  {polyPoints.length > 0 && (
                    <div className="point-list" style={{ marginTop: 8 }}>
                      {polyPoints.map((p, i) => (
                        <div key={i}>#{i + 1}: ({p[0].toFixed(3)}, {p[1].toFixed(3)})</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {shapeTab === 'photo' && (
                <PhotoUpload
                  imageFile={imageFile}
                  onImageChange={setImageFile}
                  threshold={imgThreshold}
                  onThresholdChange={setImgThreshold}
                  invert={imgInvert}
                  onInvertChange={setImgInvert}
                />
              )}
            </div>
          </div>

          {/* ГСЧ */}
          <div className="forum-panel">
            <div className="forum-panel-head">
              <span className="icon">⚙</span> [2] Алгоритм ГСЧ
            </div>
            <div className="forum-panel-body">
              <div className="field-group">
                <label>Тип генератора:</label>
                <select value={rngType} onChange={e => setRngType(e.target.value)}>
                  {RNGS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label>Начальное значение (зерно):</label>
                <input
                  type="number" value={seed}
                  onChange={e => setSeed(e.target.value)}
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* ПАРАМЕТРЫ */}
          <div className="forum-panel">
            <div className="forum-panel-head">
              <span className="icon">📊</span> [3] Параметры симуляции
            </div>
            <div className="forum-panel-body">
              <div className="field-group">
                <label>Количество выборок (1 000 – 10 000 000):</label>
                <input
                  type="number" value={samples}
                  onChange={e => setSamples(e.target.value)}
                  min="1000" max="10000000" step="1000"
                />
              </div>
              <div className="quick-btns">
                {[10000, 100000, 500000, 1000000].map(n => (
                  <button key={n} className="forum-btn" onClick={() => setSamples(n)}>
                    {n >= 1000000 ? `${n / 1000000}М` : `${n / 1000}К`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* КНОПКА ЗАПУСКА */}
          <div className="forum-panel">
            <div className="forum-panel-body" style={{ textAlign: 'center' }}>
              <button
                className="forum-btn primary"
                onClick={handleCalculate}
                disabled={loading}
              >
                {loading ? '⏳ Вычисление...' : '▶ Запустить симуляцию'}
              </button>

              {loading && (
                <div style={{ marginTop: 10 }}>
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                    <div className="progress-label">{Math.round(progress)}%</div>
                  </div>
                  <p style={{ fontSize: 11, color: '#778899', marginTop: 4 }}>
                    Генерирую {parseInt(samples).toLocaleString('ru-RU')} точек
                    через {rngType.toUpperCase()}...
                  </p>
                </div>
              )}

              {error && (
                <div className="error-box" style={{ marginTop: 10 }}>
                  ⚠ {error}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ПРАВАЯ КОЛОНКА */}
        <div>

          {/* РЕЗУЛЬТАТЫ — обычный режим */}
          {result && result.area_fraction === undefined && (
            <>
              <div className="forum-panel">
                <div className="forum-panel-head">
                  <span className="icon">📋</span> [4] Результаты
                </div>
                <div className="forum-panel-body">
                  <div className="area-display">
                    Площадь ≈ {fmt(result.area, 8)}
                  </div>
                  <table className="forum-table">
                    <tbody>
                      <tr>
                        <th>Всего выборок</th>
                        <td>{result.samples_total.toLocaleString('ru-RU')}</td>
                      </tr>
                      <tr>
                        <th>Попало внутрь</th>
                        <td style={{ color: '#007700', fontWeight: 'bold' }}>
                          {result.samples_inside.toLocaleString('ru-RU')}
                        </td>
                      </tr>
                      <tr>
                        <th>Снаружи</th>
                        <td style={{ color: '#cc0000', fontWeight: 'bold' }}>
                          {(result.samples_total - result.samples_inside).toLocaleString('ru-RU')}
                        </td>
                      </tr>
                      <tr>
                        <th>Коэффициент попадания</th>
                        <td>{(result.samples_inside / result.samples_total * 100).toFixed(4)}%</td>
                      </tr>
                      <tr>
                        <th>Площадь прямоугольника</th>
                        <td>{fmt(result.bounding_box_area, 4)}</td>
                      </tr>
                      {result.analytical_area != null && (
                        <>
                          <tr>
                            <th>Аналитическая площадь</th>
                            <td style={{ color: '#224488', fontWeight: 'bold' }}>
                              {fmt(result.analytical_area, 8)}
                            </td>
                          </tr>
                          <tr>
                            <th>Относительная погрешность</th>
                            <td style={{
                              color: result.relative_error < 0.01 ? '#007700' : '#cc5500',
                              fontWeight: 'bold',
                            }}>
                              {(result.relative_error * 100).toFixed(4)}%
                            </td>
                          </tr>
                          <tr>
                            <th>Абсолютная погрешность</th>
                            <td>{fmt(Math.abs(result.area - result.analytical_area), 8)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="forum-panel">
                <div className="forum-panel-head">
                  <span className="icon">🗺</span> Визуализация Монте-Карло
                </div>
                <div className="forum-panel-body">
                  <ResultCanvas result={result} bbRange={bbRange} />
                </div>
              </div>
            </>
          )}

          {/* РЕЗУЛЬТАТЫ — режим фото */}
          {result && result.area_fraction !== undefined && (
            <>
              <div className="forum-panel">
                <div className="forum-panel-head">
                  <span className="icon">📋</span> [4] Результаты (фото)
                </div>
                <div className="forum-panel-body">
                  <div className="area-display">
                    {(result.area_fraction * 100).toFixed(4)}% изображения
                  </div>
                  <table className="forum-table">
                    <tbody>
                      <tr>
                        <th>Оценка МК (пиксели)</th>
                        <td style={{ fontWeight: 'bold' }}>
                          {result.area_pixels.toLocaleString('ru-RU')}
                        </td>
                      </tr>
                      <tr>
                        <th>Точный подсчёт (пиксели)</th>
                        <td style={{ color: '#224488', fontWeight: 'bold' }}>
                          {result.true_pixel_count.toLocaleString('ru-RU')}
                        </td>
                      </tr>
                      <tr>
                        <th>Погрешность МК</th>
                        <td style={{
                          color: result.relative_error < 0.01 ? '#007700' : '#cc5500',
                          fontWeight: 'bold',
                        }}>
                          {(result.relative_error * 100).toFixed(4)}%
                        </td>
                      </tr>
                      <tr>
                        <th>Размер изображения</th>
                        <td>{result.image_width} × {result.image_height} пкс</td>
                      </tr>
                      <tr>
                        <th>Всего выборок</th>
                        <td>{result.samples_total.toLocaleString('ru-RU')}</td>
                      </tr>
                      <tr>
                        <th>Попало внутрь</th>
                        <td style={{ color: '#007700', fontWeight: 'bold' }}>
                          {result.samples_inside.toLocaleString('ru-RU')}
                        </td>
                      </tr>
                      <tr>
                        <th>Коэффициент попадания</th>
                        <td>{(result.samples_inside / result.samples_total * 100).toFixed(4)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="forum-panel">
                <div className="forum-panel-head">
                  <span className="icon">🗺</span> Визуализация Монте-Карло
                </div>
                <div className="forum-panel-body">
                  <ImageResultCanvas result={result} imageFile={imageFile} />
                </div>
              </div>
            </>
          )}

          {!result && !loading && (
            <div className="forum-panel">
              <div className="forum-panel-body empty-state">
                <span className="icon">◈</span>
                <p>
                  Ожидание запуска...<br />
                  Настройте фигуру и алгоритм ГСЧ,<br />
                  затем нажмите «Запустить симуляцию».
                </p>
              </div>
            </div>
          )}

          {/* ТЕКУЩИЕ ПАРАМЕТРЫ */}
          <div className="forum-panel">
            <div className="forum-panel-head">
              <span className="icon">ℹ</span> Текущие параметры
            </div>
            <div className="forum-panel-body">
              <table className="forum-table">
                <tbody>
                  <tr><th>Тип фигуры</th><td>{SHAPE_LABELS[shapeTab]}</td></tr>
                  <tr><th>Алгоритм ГСЧ</th><td>{rngType.toUpperCase()}</td></tr>
                  <tr><th>Зерно</th><td>{seed}</td></tr>
                  <tr><th>Выборок</th><td>{parseInt(samples).toLocaleString('ru-RU')}</td></tr>
                  {shapeTab === 'formula' && (
                    <tr><th>Формула</th><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{formula}</td></tr>
                  )}
                  {shapeTab === 'preset' && (
                    <tr><th>Шаблон</th><td>{PRESETS.find(p => p.value === presetKind)?.label}, r={presetRadius}</td></tr>
                  )}
                  {shapeTab === 'polygon' && <tr><th>Вершин</th><td>{polyPoints.length}</td></tr>}
                  {shapeTab === 'canvas'  && <tr><th>Точек пути</th><td>{drawPoints.length}</td></tr>}
                  {shapeTab === 'photo'   && <tr><th>Файл</th><td>{imageFile ? imageFile.name : '—'}</td></tr>}
                  {shapeTab === 'photo'   && <tr><th>Порог яркости</th><td>{imgThreshold}{imgInvert ? ' (инверт.)' : ''}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* ФУТЕР */}
      <div className="forum-footer">
        Метод Монте-Карло · React + Vite + Rust + Actix-Web<br />
        © 2026 — Калькулятор площади методом случайных выборок
      </div>

    </div>
  )
}
