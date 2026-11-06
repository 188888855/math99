import { createWidget, widget, text_style, setProperty } from '@zos/ui'

// ==================== 核心引擎：一元一次方程解析 ====================
const nz = n => (Math.abs(n) < 1e-10 ? 0 : Math.round(n * 1e10) / 1e10)

function parseEquation(input) {
  const fmt = n => { n = nz(n); if (n === 0) return '0'; return Number.isInteger(n) ? String(n) : String(+n.toFixed(4)); }
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
  const fail = (reason, steps) => ({ ok: false, reason, steps: steps || [] })

  const src = String(input == null ? '' : input)
    .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[×·∗]/g, '*').replace(/[−–—]/g, '-').replace(/\s+/g, '')

  const sides = src.split('=')
  if (sides.length !== 2 || !sides[0] || !sides[1]) return fail('格式错误：需要形如 2x+5=15', [src])

  function parseSide(side) {
    let a = 0, b = 0
    const re = /([+-]?)([^+-]+)/g
    let m
    while ((m = re.exec(side))) {
      const sign = m[1] === '-' ? -1 : 1, body = m[2]
      if (!body || /[()^/]/.test(body)) return null
      if (/[xX]/.test(body)) {
        if ((body.match(/[xX]/g) || []).length > 1) return null
        const c = body.replace(/[xX*]/g, '')
        const v = c === '' ? 1 : parseFloat(c)
        if (!isFinite(v)) return null
        a += sign * v
      } else {
        const v = parseFloat(body)
        if (!isFinite(v)) return null
        b += sign * v
      }
    }
    return { a: nz(a), b: nz(b) }
  }

  const L = parseSide(sides[0]), R = parseSide(sides[1])
  if (!L || !R) return fail('含有不支持的项（仅支持一元一次方程）', [`${sides[0]} = ${sides[1]}`])

  const xStr = (v, first) => {
    if (v === 0) return ''
    const mag = Math.abs(v) === 1 ? 'x' : fmt(Math.abs(v)) + 'x'
    return first ? (v < 0 ? '-' : '') + mag : (v < 0 ? ' - ' : ' + ') + mag
  }
  const cStr = (v, first) => {
    if (v === 0) return ''
    const mag = fmt(Math.abs(v))
    return first ? (v < 0 ? '-' : '') + mag : (v < 0 ? ' - ' : ' + ') + mag
  }
  const expr = (a, b) => { const x = xStr(a, true); return (x + cStr(b, !x)) || '0' }
  const bodyOf = s => s.slice(s.indexOf('：') + 1)

  const A = nz(L.a - R.a), B = nz(R.b - L.b)
  const base = `${sides[0]} = ${sides[1]}`
  const steps = [`原式：${base}`]

  if (R.a !== 0 || L.b !== 0) {
    const xs = [L.a, -R.a].filter(v => v !== 0)
    const cs = [R.b, -L.b].filter(v => v !== 0)
    steps.push(`移项：${xs.length ? xs.map((v, i) => xStr(v, i === 0)).join('') : '0'}` +
               ` = ${cs.length ? cs.map((v, i) => cStr(v, i === 0)).join('') : '0'}`)
  }

  if (A === 0) {
    steps.push(`化简：0 = ${fmt(B)}`)
    return fail(B === 0 ? '恒等式：x 有无数个解' : '矛盾方程：无解', steps)
  }

  const simplified = `${expr(A, 0)} = ${fmt(B)}`
  if (simplified !== base && simplified !== bodyOf(steps[steps.length - 1])) steps.push(`化简：${simplified}`)

  const x = nz(B / A)
  if (A !== 1) steps.push(`系数化为1：x = ${fmt(B)} / ${fmt(A)}`)

  let exact = fmt(x)
  if (!Number.isInteger(x) && Number.isInteger(B) && Number.isInteger(A)) {
    const g = gcd(B, A)
    let p = nz(B / g), q = nz(A / g)
    if (q < 0) { p = -p; q = -q }
    exact = q === 1 ? String(p) : `${p}/${q}`
  }
  steps.push(`答案：x = ${exact}`)
  return { ok: true, x, answer: `x = ${exact}`, steps }
}

// ==================== UI 常量 ====================
const C_INPUT = 0xffffff
const C_HINT  = 0x6b7280
const C_OK    = 0x00e676
const C_WARN  = 0xffab40
const C_STEP  = 0xc8c8c8
const C_DIV   = 0x2a2a2a

const KEYS = [
  ['7', '8', '9', '⌫'],
  ['4', '5', '6', 'x'],
  ['1', '2', '3', '-'],
  ['C', '0', '=', '+'],
]
const KP_X = 14, KP_Y = 238, GAP = 6, BW = 105, BH = 48
const STEPS_TOP = 120, STEP_H = 22, MAX_STEPS = 5

const keyColor = k => {
  if (k === '=') return 0x0a84ff
  if (k === 'C' || k === '⌫') return 0x4a3535
  if (k === 'x' || k === '+' || k === '-') return 0x3a3a3a
  return 0x2e2e2e
}

Page({
  build() {
    let input = ''
    let answerText = ''
    let answerColor = C_OK
    let solved = false

    const inputWidget = createWidget(widget.TEXT, {
      x: 20, y: 16, w: 426, h: 48,
      text: '输入方程', text_size: 28, color: C_HINT,
      align_h: text_style.ALIGN_H_CENTER, align_v: text_style.ALIGN_V_CENTER,
    })

    const answerWidget = createWidget(widget.TEXT, {
      x: 20, y: 64, w: 426, h: 42,
      text: '', text_size: 34, color: C_OK,
      align_h: text_style.ALIGN_H_CENTER, align_v: text_style.ALIGN_V_CENTER,
    })

    createWidget(widget.FILL_RECT, { x: 70, y: 112, w: 326, h: 2, color: C_DIV })

    const stepWidgets = []
    for (let i = 0; i < MAX_STEPS; i++) {
      stepWidgets.push(createWidget(widget.TEXT, {
        x: 22, y: STEPS_TOP + i * STEP_H, w: 422, h: STEP_H,
        text: '', text_size: 20, color: C_STEP,
        align_h: text_style.ALIGN_H_LEFT, align_v: text_style.ALIGN_V_CENTER,
      }))
    }

    KEYS.forEach((row, r) => row.forEach((k, c) => {
      createWidget(widget.BUTTON, {
        x: KP_X + c * (BW + GAP), y: KP_Y + r * (BH + GAP),
        w: BW, h: BH, radius: 22,
        normal_color: keyColor(k), press_color: 0x555555,
        text: k, text_size: k === '⌫' ? 22 : 28,
        click_func: () => { onKey(k); return true },
      })
    }))

    const clearSteps  = () => stepWidgets.forEach(w => setProperty(w, { text: '' }))
    const renderSteps = steps => stepWidgets.forEach((w, i) => setProperty(w, { text: steps[i] || '' }))
    const refresh = () => {
      setProperty(inputWidget,  { text: input || '输入方程', color: input ? C_INPUT : C_HINT })
      setProperty(answerWidget, { text: answerText, color: answerColor })
    }
    const solve = () => {
      const r = parseEquation(input)
      if (r.ok) { answerText = r.answer; answerColor = C_OK }
      else      { answerText = r.reason; answerColor = C_WARN }
      renderSteps(r.steps)
    }
    const onKey = k => {
      if (k === 'C') {
        input = ''; answerText = ''; answerColor = C_OK; solved = false; clearSteps()
      } else if (k === '⌫') {
        input = input.slice(0, -1); answerText = ''; answerColor = C_OK; solved = false; clearSteps()
      } else if (k === '=') {
        if (!input) { answerText = '请先输入方程'; answerColor = C_WARN; clearSteps() }
        else if (input.includes('=') && !input.endsWith('=')) { solve(); solved = true }
        else if (!input.includes('=')) { input += '=' }
      } else {
        if (solved) { input = ''; solved = false }
        if (input.length < 24) input += k
        answerText = ''; answerColor = C_OK; clearSteps()
      }
      refresh()
    }

    refresh()
  },
})
