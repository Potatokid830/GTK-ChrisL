// ASCII only in this file. All visible copy lives in content.js.
import { copy, experience, heinekenSens, skills, works } from './content.js'

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
// Hidden start states in the CSS are scoped to html.js, so nothing stays invisible without JS.
document.documentElement.classList.add('js')

function lsGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val) } catch { /* ignore quota / private mode */ }
}

const state = {
  lang: lsGet('jl-lang') === 'zh' ? 'zh' : 'en',
  theme: lsGet('jl-theme') === 'dark' ? 'dark' : 'light',
  work: 0,
  caseIdx: null,
  lenis: null,
  ready: false,
  previewToken: 0,
  markets: null,
  build: null,
  cmdkOpen: false,
  cmdkAi: false,
  cmdkIndex: 0,
  cmdkReturn: null,
  aiTurns: [],
  aiType: 0,
  heroIn: true,
}

const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const t = () => copy[state.lang]
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/* ---------- static copy ---------- */

function applyCopy() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-Hans' : 'en'
  document.title = t().docTitle
  $$('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n
    if (t()[key] != null) el.textContent = t()[key]
  })
  renderRail()
  renderTicker()
  renderFigures()
  renderWork()
  renderPractice()
  renderSkills()
  setPreview(state.work, true)
  if (state.caseIdx != null) renderCase()
  splitHeadings()
  observeReveals()
  updateChrome()
  applyThemeLabel()
  applyFooter()
  syncCmdkCopy()
  syncAskFab()
}

/* ---------- motion helpers ---------- */

const CJK_PUNCT = /[\u3001\u3002\uFF0C\uFF1A\uFF1B\uFF01\uFF1F\uFF09\u300B\u300D\u300F\u2026\u2014]/

// Wrap each word (or each CJK character, keeping trailing punctuation attached)
// in a masked span so the heading can rise out line by line.
function splitWords(el) {
  const text = el.textContent.trim()
  if (!text) return
  let parts
  if (/\s/.test(text)) {
    parts = text.split(/\s+/)
  } else {
    parts = []
    for (const ch of Array.from(text)) {
      if (CJK_PUNCT.test(ch) && parts.length) parts[parts.length - 1] += ch
      else parts.push(ch)
    }
  }
  const joiner = /\s/.test(text) ? ' ' : ''
  el.innerHTML = parts
    .map((w, i) => `<span class="w" style="--i:${Math.min(i, 14)}"><span>${esc(w)}</span></span>`)
    .join(joiner)
  el.setAttribute('aria-label', text) // screen readers get the unbroken heading
  el.classList.add('split')
}

function splitHeadings() {
  $$('[data-split]').forEach((el) => {
    const wasIn = el.classList.contains('is-in')
    splitWords(el)
    if (wasIn) el.classList.add('is-in')
  })
}

let revealIo = null
function observeReveals() {
  // Reduced motion: headings show at once; blocks still fade in on scroll (opacity only).
  if (reduced) $$('.split').forEach((el) => el.classList.add('is-in'))
  if (!revealIo) {
    revealIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return
          en.target.classList.add('is-in')
          revealIo.unobserve(en.target)
        })
      },
      { rootMargin: '0px 0px -3% 0px', threshold: 0.05 },
    )
  }
  $$('[data-reveal]:not(.is-in), .split:not(.is-in)').forEach((el) => {
    if (el.closest('.hero') || el.closest('.dossier')) return
    // After a language switch, things already on screen should just update, not re-enter.
    if (state.ready && el.getBoundingClientRect().top < innerHeight) {
      el.classList.add('is-in')
      return
    }
    revealIo.observe(el)
  })
}

function heroIn() {
  const hero = $('.hero')
  // Preview wipes should not wait on the entrance frame.
  state.ready = true
  syncAskFab()
  const go = () => {
    hero.classList.add('is-in')
    $$('.hero .split').forEach((el) => el.classList.add('is-in'))
  }
  if (reduced) { go(); return }
  requestAnimationFrame(() => requestAnimationFrame(go))
}

// The portrait drifts a little against the pointer and lags the scroll.
function bindPortrait() {
  const fig = $('[data-portrait]')
  if (!fig || reduced) return
  const target = { x: 0, y: 0 }
  const cur = { x: 0, y: 0 }
  let scrollY = 0
  let raf = 0
  // On phones the portrait sits above the name, so it must not drift into it.
  const lagOn = window.matchMedia('(min-width: 761px)').matches
  const tick = () => {
    cur.x += (target.x - cur.x) * 0.06
    cur.y += (target.y - cur.y) * 0.06
    const lag = lagOn ? Math.min(scrollY, innerHeight) * 0.08 : 0
    fig.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${(cur.y + lag).toFixed(2)}px, 0)`
    raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.05 ? requestAnimationFrame(tick) : 0
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick) }
  if (finePointer) {
    window.addEventListener('mousemove', (e) => {
      target.x = (e.clientX / innerWidth - 0.5) * -18
      target.y = (e.clientY / innerHeight - 0.5) * -12
      kick()
    }, { passive: true })
  }
  const onScroll = () => {
    scrollY = window.scrollY
    kick()
  }
  if (state.lenis) state.lenis.on('scroll', onScroll)
  else window.addEventListener('scroll', onScroll, { passive: true })
}

// NYE still drifts a little against the scroll — transform only, no blend.
function bindOffhours() {
  const sec = $('.offhours')
  const img = $('[data-offhours-bg]')
  if (!sec || !img) return
  if (reduced) {
    sec.classList.add('is-in')
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) sec.classList.add('is-in')
      })
    },
    { threshold: 0.15 },
  )
  io.observe(sec)
  const tick = () => {
    const r = sec.getBoundingClientRect()
    const p = (innerHeight - r.top) / (innerHeight + r.height)
    const t = Math.min(1, Math.max(0, p))
    img.style.transform = `translate3d(0, ${((t - 0.5) * 7).toFixed(2)}%, 0) scale(1.08)`
  }
  if (state.lenis) state.lenis.on('scroll', tick)
  else window.addEventListener('scroll', tick, { passive: true })
  tick()
}

function renderRail() {
  $('[data-rail]').innerHTML = t()
    .rail.map(
      ([no, label, href], i) =>
        `<li><a href="${href}" data-rail-link="${href.slice(1)}" class="${i === 0 ? 'is-active' : ''}"><span>${no}</span><span>${esc(label)}</span></a></li>`,
    )
    .join('')
}

const TICKER_KEYS = { spx: 'tickerSpx', nvda: 'tickerNvda', usdsgd: 'tickerFx', sti: 'tickerSti' }

function renderTicker() {
  const track = $('[data-ticker]')
  if (!track) return
  if (state.markets && state.markets.length) {
    const bits = state.markets.map((item) => {
      const name = t()[TICKER_KEYS[item.id]] || (state.lang === 'zh' ? item.zh : item.en)
      const price = Number(item.price).toLocaleString('en-US', {
        minimumFractionDigits: item.digits,
        maximumFractionDigits: item.digits,
      })
      const up = item.change >= 0
      const ch = `${up ? '\u25B2' : '\u25BC'}${Math.abs(item.change).toFixed(1)}%`
      return `<span class="ticker__q">${esc(name)} ${esc(price)} <em class="${up ? 'is-up' : 'is-down'}">${ch}</em></span>`
    })
    bits.push(`<span class="ticker__note">${esc(t().tickerNote)}</span>`)
    const html = bits.join('')
    track.innerHTML = html + html
    track.classList.add('is-quotes')
    return
  }
  const items = t().ticker.map((s) => `<span>${esc(s)}</span>`).join('')
  track.classList.remove('is-quotes')
  track.innerHTML = items + items
}

function renderFigures() {
  $('[data-figures]').innerHTML = t()
    .figures.map(([k, v], i) => `<li data-reveal style="--i:${i}"><small>${esc(k)}</small><strong>${esc(v)}</strong></li>`)
    .join('')
}

function renderWork() {
  $('[data-work-list]').innerHTML = works
    .map((w, i) => {
      const c = w[state.lang]
      return `<li data-reveal style="--i:${i + 2}">
        <button class="work-item ${i === state.work ? 'is-on' : ''}" type="button" data-work="${i}" data-cursor="Open">
          <span class="no">${w.no}</span>
          <span class="title">${esc(c.title)}</span>
          <span class="kind">${esc(c.kind)}</span>
          <span class="work-item__rule" aria-hidden="true"></span>
        </button>
      </li>`
    })
    .join('')
}

// Digits roll from the previous glyph; everything else just swaps.
function setFigure(el, next) {
  const prev = el.dataset.figure || ''
  el.dataset.figure = next
  el.setAttribute('aria-label', next)
  if (reduced || !state.ready || prev === next || !/\d/.test(next)) {
    el.textContent = next
    return
  }
  el.innerHTML = [...next].map((ch, i) => {
    if (!/\d/.test(ch)) return `<span class="fig-ch">${esc(ch)}</span>`
    const from = /\d/.test(prev[i] || '') ? prev[i] : '0'
    const col = [...Array(10)].map((_, d) => `<span>${d}</span>`).join('')
    return `<span class="reel" aria-hidden="true"><span class="reel__col" style="transform:translateY(calc(${from} * -1em))">${col}</span></span>`
  }).join('')
  const cols = [...el.querySelectorAll('.reel__col')]
  let n = 0
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ;[...next].forEach((ch) => {
      if (!/\d/.test(ch)) return
      const col = cols[n++]
      if (col) col.style.transform = `translateY(calc(${ch} * -1em))`
    })
  }))
}

function setPreview(i, force = false) {
  const same = i === state.work && !force
  state.work = i
  const w = works[i]
  const c = w[state.lang]
  const card = $('[data-work-preview]')
  $$('[data-work]').forEach((btn) => btn.classList.toggle('is-on', Number(btn.dataset.work) === i))
  if (same && state.ready) return

  const apply = () => {
    $('[data-preview-no]').textContent = w.no
    const stamp = $('[data-preview-stamp]')
    stamp.textContent = c.stamp
    stamp.classList.toggle('is-buy', w.id === 'heineken')
    setFigure($('[data-preview-figure]'), c.figure)
    $('[data-preview-label]').textContent = c.figureLabel
    $('[data-preview-dek]').textContent = c.preview
    const img = $('[data-preview-img]')
    img.src = w.slides[0].src
    img.alt = c.title
  }

  // First paint, language swaps and reduced motion: no wipe.
  if (reduced || !state.ready || force) { apply(); return }
  const token = ++state.previewToken
  const wipe = $('[data-preview-wipe]')
  wipe.style.transition = ''
  wipe.style.transform = ''
  card.classList.add('is-out', 'is-switching')
  window.setTimeout(() => {
    if (token !== state.previewToken) return
    apply()
    wipe.style.transition = 'none'
    wipe.style.transform = 'translate3d(101%,0,0)'
    card.classList.remove('is-out', 'is-switching')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (token !== state.previewToken) return
      wipe.style.transition = ''
      wipe.style.transform = ''
    }))
  }, 460)
}

function renderPractice() {
  $('[data-practice]').innerHTML = experience
    .map((job, i) => {
      const c = job[state.lang]
      return `<article class="practice-card" data-reveal style="--i:${i}">
        <p class="meta">${esc(c.dates)}<br>${esc(c.place)}</p>
        <div>
          <h3>${esc(c.role)}</h3>
          <p class="org">${esc(c.org)} &middot; ${esc(c.unit)}</p>
          <p class="lead">${esc(c.lead)}</p>
          <ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          ${c.more ? `<button class="practice-more" type="button" data-open-slug="${esc(c.moreSlug)}">${esc(c.more)}</button>` : ''}
        </div>
      </article>`
    })
    .join('')
}

function renderSkills() {
  $('[data-skills]').innerHTML = skills
    .map((s, i) => {
      const c = s[state.lang]
      return `<article class="skill" data-reveal style="--i:${i + 1}"><h3>${esc(c.group)}</h3><ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></article>`
    })
    .join('')
}

/* ---------- widgets inside a project ---------- */

function widgetScenarios(c) {
  const base = c.scenarios[1]
  return `<div class="widget" data-widget="scenarios">
    <h3>${esc(c.widgetTitle)}</h3>
    <div class="widget-readout">
      <span class="big" data-h-value>${esc(base.value)}</span>
      <span class="delta" data-h-up>${esc(base.delta)}</span>
    </div>
    <div class="scenarios">
      ${c.scenarios
        .map(
          (r, i) =>
            `<button type="button" class="${i === 1 ? 'is-on' : ''}" data-h data-v="${esc(r.value)}" data-u="${esc(r.delta)}">
              <small>${esc(r.label)}</small><strong>${esc(r.value)}</strong>
            </button>`,
        )
        .join('')}
    </div>
  </div>`
}

function widgetCompare(c) {
  const k = c.compare
  const col = (idx) => k.rows.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[idx])}</dd></div>`).join('')
  return `<div class="widget">
    <h3>${esc(c.widgetTitle)}</h3>
    <div class="compare">
      <article><h4>${esc(k.left)}</h4><dl>${col(1)}</dl></article>
      <article><h4>${esc(k.right)}</h4><dl>${col(2)}</dl></article>
    </div>
  </div>`
}

function widgetLevers(c) {
  return `<div class="widget" data-widget="levers">
    <h3>${esc(c.widgetTitle)}</h3>
    <div class="bars">
      ${c.levers
        .map(
          (f, i) =>
            `<button class="bar-row ${i === 0 ? 'is-on' : ''}" type="button" data-j="${esc(f[2])}">
              <span>${esc(f[0])}</span>
              <span class="bar-track"><span class="bar-fill" data-fill="${f[1]}"></span></span>
              <span>${f[1].toFixed(2)}</span>
            </button>`,
        )
        .join('')}
    </div>
    <p class="widget-note" data-j-note>${esc(c.levers[0][2])}</p>
  </div>`
}

function widgetMix(c) {
  return `<div class="widget">
    <h3>${esc(c.widgetTitle)}</h3>
    <div class="fourp">
      ${c.mix
        .map(
          (it, i) =>
            `<div class="fourp__item">
              <small>0${i + 1}</small>
              <strong>${esc(it[0])}</strong>
              <p>${esc(it[1])}</p>
            </div>`,
        )
        .join('')}
    </div>
  </div>`
}

function widgetSensitivity(c) {
  const { ke, g, ke0, g0, matrix } = heinekenSens
  const lo = Math.min(...matrix.flat())
  const hi = Math.max(...matrix.flat())
  const shade = (v) => Math.round(10 + ((v - lo) / (hi - lo)) * 52)
  const cells = g
    .map((gv, gi) => {
      const row = matrix[gi]
        .map((v, ki) => {
          const on = gi === g0 && ki === ke0 ? ' is-on' : ''
          return `<button type="button" class="sens__cell${on}" data-sens-cell data-ke="${ki}" data-g="${gi}" style="background:color-mix(in srgb, var(--ink) ${shade(v)}%, var(--paper))" aria-label="${esc(`${fmtKe(ke[ki])} / ${fmtG(gv)}`)}"></button>`
        })
        .join('')
      return `<div class="sens__row" role="row"><span class="sens__glabel">${esc(fmtG(gv))}</span>${row}</div>`
    })
    .join('')
  return `<div class="widget widget--sens" data-widget="sens">
    <h3>${esc(c.sensTitle)}</h3>
    <div class="widget-readout">
      <span class="big" data-sens-price>\u20ac75.23</span>
      <span class="sens__meta">
        <span class="delta" data-sens-delta>+11%</span>
        <span class="sens__tag is-buy" data-sens-tag>${esc(c.sensBuy)}</span>
      </span>
    </div>
    <div class="sens__ctrl">
      <div class="sens__lab"><span>${esc(c.sensKe)}</span><span data-sens-ke-val>${esc(fmtKe(ke[ke0]))}</span></div>
      <input class="sens__range" type="range" min="0" max="${ke.length - 1}" step="1" value="${ke0}" data-sens-ke aria-label="${esc(c.sensKe)}" />
      <div class="sens__step">
        <button type="button" data-sens-ke-d="-1" aria-label="-">\u2212</button>
        <button type="button" data-sens-ke-d="1" aria-label="+">+</button>
      </div>
    </div>
    <div class="sens__ctrl">
      <div class="sens__lab"><span>${esc(c.sensG)}</span><span data-sens-g-val>${esc(fmtG(g[g0]))}</span></div>
      <input class="sens__range" type="range" min="0" max="${g.length - 1}" step="1" value="${g0}" data-sens-g aria-label="${esc(c.sensG)}" />
      <div class="sens__step">
        <button type="button" data-sens-g-d="-1" aria-label="-">\u2212</button>
        <button type="button" data-sens-g-d="1" aria-label="+">+</button>
      </div>
    </div>
    <div class="sens__heat-wrap">
      <div class="sens__heat" role="grid">${cells}</div>
    </div>
    <p class="sens__warn" data-sens-warn hidden>${esc(c.sensWarn)}</p>
    <p class="sens__rule">${esc(c.sensRule)}</p>
  </div>`
}

function widgetRewrite(c) {
  return `<div class="rewrite" data-rewrite>
    <h3>${esc(c.rewriteTitle)}</h3>
    <div class="rewrite__frame" data-rewrite-frame>
      <div class="rewrite__pane rewrite__pane--after">
        <div class="rewrite__inner">
          <small>${esc(c.rewriteAfter)}</small>
          <p>${esc(c.rewriteAfterBody)}</p>
        </div>
      </div>
      <div class="rewrite__pane rewrite__pane--before" data-rewrite-before>
        <div class="rewrite__inner">
          <small>${esc(c.rewriteBefore)}</small>
          <p>${esc(c.rewriteBeforeBody)}</p>
        </div>
      </div>
      <div class="rewrite__handle" data-rewrite-handle role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-label="${esc(c.rewriteTitle)}"></div>
    </div>
    <p class="rewrite__note">${esc(c.rewriteNote)}</p>
  </div>`
}

function widgetSteps(c) {
  const on = Number.isInteger(c.stepOn) ? c.stepOn : 0
  return `<div class="widget widget--steps" data-widget="steps" style="--steps:${c.steps.length}">
    <h3>${esc(c.widgetTitle)}</h3>
    <div class="steps">
      ${c.steps
        .map(
          (s, i) =>
            `<button type="button" class="${i === on ? 'is-on' : ''}" data-j="${esc(s[2])}">
              <small>${esc(s[0])}</small><span>${esc(s[1])}</span>
            </button>`,
        )
        .join('')}
    </div>
    <p class="widget-note" data-j-note>${esc(c.steps[on][2])}</p>
  </div>`
}

function widgetFor(w, c) {
  if (w.widget === 'scenarios') return widgetScenarios(c) + widgetSensitivity(c)
  if (w.widget === 'compare') return widgetCompare(c)
  if (w.widget === 'levers') return widgetLevers(c)
  if (w.widget === 'mix') return widgetMix(c)
  if (w.widget === 'steps') return widgetSteps(c)
  return ''
}

function fmtKe(v) {
  return v.toFixed(2) + '%'
}
function fmtG(v) {
  return v.toFixed(1) + '%'
}

function sensLookup(ki, gi) {
  const { ke, g, ke0, g0, market, matrix } = heinekenSens
  const raw = ki === ke0 && gi === g0 ? 75.23 : matrix[gi][ki]
  const price = ki === ke0 && gi === g0 ? '\u20ac75.23' : '\u20ac' + matrix[gi][ki].toFixed(1)
  const pct = Math.round(((raw - market) / market) * 100)
  const delta = (pct > 0 ? '+' : pct < 0 ? '\u2212' : '') + Math.abs(pct) + '%'
  const rating = pct > 10 ? 'buy' : pct >= -10 ? 'hold' : 'sell'
  const warn = ke[ki] - g[gi] < 2.5
  return { price, delta, rating, warn }
}

function bindWidgets(root) {
  $$('[data-h]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('[data-h]', root).forEach((b) => b.classList.remove('is-on'))
      btn.classList.add('is-on')
      $('[data-h-value]', root).textContent = btn.dataset.v
      $('[data-h-up]', root).textContent = btn.dataset.u
    })
  })
  $$('[data-j]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('[data-j]', root).forEach((b) => b.classList.remove('is-on'))
      btn.classList.add('is-on')
      $('[data-j-note]', root).textContent = btn.dataset.j
    })
  })
  $$('[data-fill]', root).forEach((el) => {
    requestAnimationFrame(() => {
      el.style.width = `${(Number(el.dataset.fill) / 0.7) * 100}%`
    })
  })
  bindSens(root)
  bindRewrite(root)
}

function bindSens(root) {
  const box = $('[data-widget="sens"]', root)
  if (!box) return
  const c = works.find((w) => w.id === 'heineken')[state.lang]
  const { ke, g } = heinekenSens
  let ki = heinekenSens.ke0
  let gi = heinekenSens.g0
  const keRange = $('[data-sens-ke]', box)
  const gRange = $('[data-sens-g]', box)
  const priceEl = $('[data-sens-price]', box)
  priceEl.dataset.figure = priceEl.textContent

  const paint = () => {
    const out = sensLookup(ki, gi)
    setFigure(priceEl, out.price)
    $('[data-sens-delta]', box).textContent = out.delta
    const tag = $('[data-sens-tag]', box)
    tag.textContent = c[{ buy: 'sensBuy', hold: 'sensHold', sell: 'sensSell' }[out.rating]]
    tag.className = `sens__tag is-${out.rating}`
    $('[data-sens-ke-val]', box).textContent = fmtKe(ke[ki])
    $('[data-sens-g-val]', box).textContent = fmtG(g[gi])
    keRange.value = String(ki)
    gRange.value = String(gi)
    $$('[data-sens-cell]', box).forEach((cell) => {
      cell.classList.toggle('is-on', Number(cell.dataset.ke) === ki && Number(cell.dataset.g) === gi)
    })
    $('[data-sens-warn]', box).hidden = !out.warn
  }

  keRange.addEventListener('input', () => {
    ki = Number(keRange.value)
    paint()
  })
  gRange.addEventListener('input', () => {
    gi = Number(gRange.value)
    paint()
  })
  $$('[data-sens-ke-d]', box).forEach((btn) => {
    btn.addEventListener('click', () => {
      ki = Math.min(ke.length - 1, Math.max(0, ki + Number(btn.dataset.sensKeD)))
      paint()
    })
  })
  $$('[data-sens-g-d]', box).forEach((btn) => {
    btn.addEventListener('click', () => {
      gi = Math.min(g.length - 1, Math.max(0, gi + Number(btn.dataset.sensGD)))
      paint()
    })
  })
  $$('[data-sens-cell]', box).forEach((cell) => {
    cell.addEventListener('click', () => {
      ki = Number(cell.dataset.ke)
      gi = Number(cell.dataset.g)
      paint()
    })
  })
}

function bindRewrite(root) {
  const frame = $('[data-rewrite-frame]', root)
  if (!frame) return
  const before = $('[data-rewrite-before]', root)
  const handle = $('[data-rewrite-handle]', root)
  let pct = 50
  const set = (p) => {
    pct = Math.min(100, Math.max(0, p))
    before.style.width = `${pct}%`
    handle.style.left = `${pct}%`
    handle.setAttribute('aria-valuenow', String(Math.round(pct)))
  }
  const fromX = (x) => {
    const r = frame.getBoundingClientRect()
    set(((x - r.left) / r.width) * 100)
  }
  const onMove = (e) => {
    if (handle.hasPointerCapture(e.pointerId)) fromX(e.clientX)
  }
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
  })
  handle.addEventListener('pointermove', onMove)
  frame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-rewrite-handle]')) return
    fromX(e.clientX)
    handle.setPointerCapture(e.pointerId)
  })
  frame.addEventListener('pointermove', onMove)
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); set(pct - 5) }
    if (e.key === 'ArrowRight') { e.preventDefault(); set(pct + 5) }
    if (e.key === 'Home') { e.preventDefault(); set(0) }
    if (e.key === 'End') { e.preventDefault(); set(100) }
  })
}

/* ---------- project dossier ---------- */

function projectHref(slug) {
  const url = new URL(location.href)
  if (slug) url.searchParams.set('project', slug)
  else url.searchParams.delete('project')
  return url.pathname + url.search + url.hash
}

function writeProjectUrl(slug, mode) {
  const next = projectHref(slug)
  if (mode === 'push') history.pushState({ project: slug || null }, '', next)
  else history.replaceState({ project: slug || null }, '', next)
}

// One history entry per open dossier, so Back closes it instead of walking projects.
let projectPushed = false

function syncProjectUrl(slug, firstOpen) {
  const current = new URLSearchParams(location.search).get('project')
  if (current === slug) {
    projectPushed = true
    return
  }
  if (!firstOpen && projectPushed) writeProjectUrl(slug, 'replace')
  else {
    writeProjectUrl(slug, 'push')
    projectPushed = true
  }
}

function openCase(idx, opts = {}) {
  pauseDj()
  const first = state.caseIdx == null
  state.caseIdx = idx
  renderCase()
  const root = $('[data-dossier]')
  root.hidden = false
  root.inert = false
  root.removeAttribute('aria-hidden')
  document.body.classList.add('is-case')
  $('[data-cursor-badge]')?.classList.remove('is-on')
  state.lenis?.stop()
  requestAnimationFrame(() => root.classList.add('is-open'))
  root.scrollTop = 0
  if (!first) root.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  syncAskFab()
  if (!opts.fromHistory) syncProjectUrl(works[idx].slug, first)
}

function openProjectFromUrl() {
  const slug = new URLSearchParams(location.search).get('project')
  if (!slug) return
  const idx = works.findIndex((w) => w.slug === slug)
  if (idx < 0) {
    writeProjectUrl(null, 'replace')
    return
  }
  // Land on the clean page, then push the project, so Back closes the dossier and stays here.
  writeProjectUrl(null, 'replace')
  writeProjectUrl(slug, 'push')
  projectPushed = true
  openCase(idx, { fromHistory: true })
}

function renderCase() {
  const w = works[state.caseIdx]
  const c = w[state.lang]
  const body = $('[data-case-body]')
  $('[data-case-count]').textContent = `${w.no} / 0${works.length}  \u00B7  ${c.kind}`
  $('[data-case-prev]').disabled = state.caseIdx === 0
  $('[data-case-next]').disabled = state.caseIdx === works.length - 1

  const hasStats = Array.isArray(c.stats) && c.stats.length > 0
  const stepsHtml = w.widget === 'steps' ? widgetSteps(c) : ''
  const widgetHtml = w.widget === 'steps' ? '' : widgetFor(w, c)
  const hasSide = hasStats || widgetHtml !== ''
  const playHtml = c.play
    ? `<p class="d-play"><a class="btn" href="${esc(c.play.href)}" target="_blank" rel="noreferrer">${esc(c.play.label)}</a><span>${esc(c.play.note)}</span></p>`
    : ''
  body.innerHTML = `
    <section class="d-head">
      <p class="eyebrow">${esc(c.eyebrow || `${c.kind} \u00B7 ${c.meta[0][1]}`)}</p>
      <h2 class="d-title">${esc(c.title)}</h2>
      ${c.subtitle ? `<p class="d-sub">${esc(c.subtitle)}</p>` : ''}
      <p class="d-dek">${esc(c.dek)}</p>
      <ul class="d-meta">
        ${c.meta.map(([k, v]) => `<li><small>${esc(k)}</small><strong>${esc(v)}</strong></li>`).join('')}
      </ul>
      ${playHtml}
    </section>

    <section class="d-viewer">
      ${w.slides
        .map(
          (s) => `<figure class="d-stage">
            <img src="${s.src}" alt="${esc((c.captions && c.captions[s.n]) || c.title)}" loading="${s.n === 1 ? 'eager' : 'lazy'}" />
          </figure>`,
        )
        .join('')}
    </section>

    ${stepsHtml}

    <section class="d-grid ${hasSide ? '' : 'd-grid--single'}">
      ${hasSide ? `<aside class="d-side">
        ${hasStats ? `<h3 class="d-side__h">${esc(t().keyNumbers)}</h3>
        <dl class="d-stats">
          ${c.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>` : ''}
        ${widgetHtml}
      </aside>` : ''}
      <div class="d-text">
        ${w.id === 'resumeai' ? widgetRewrite(c) : ''}
        ${c.sections.map((s) => `<div class="d-sec"><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`).join('')}
      </div>
    </section>
  `
  bindWidgets(body)
  const title = $('.d-title', body)
  splitWords(title)
  if (reduced) title.classList.add('is-in')
  else window.setTimeout(() => title.classList.add('is-in'), 250)
}

function closeCase(opts = {}) {
  const root = $('[data-dossier]')
  if (!root) return
  const wasOpen = state.caseIdx != null
  if (wasOpen) {
    root.classList.remove('is-open')
    root.inert = true
    root.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('is-case')
    state.caseIdx = null
    state.lenis?.start()
    syncAskFab()
    window.setTimeout(() => {
      if (state.caseIdx == null) {
        root.hidden = true
        $('[data-case-body]').innerHTML = ''
      }
    }, 420)
  }
  if (opts.fromHistory) return
  if (projectPushed) {
    projectPushed = false
    history.back()
    return
  }
  if (wasOpen && new URLSearchParams(location.search).get('project')) writeProjectUrl(null, 'replace')
}

/* ---------- chrome ---------- */

// The system cursor is never hidden. This is only a small "Open" badge that
// trails the pointer while hovering a project row or the preview cover.
function bindCursor() {
  if (!finePointer || reduced) return
  const cursor = $('[data-cursor-badge]')
  const label = $('[data-cursor-label]')
  const pos = { x: innerWidth / 2, y: innerHeight / 2 }
  const mouse = { x: pos.x, y: pos.y }
  let active = false
  let raf = 0
  const tick = () => {
    pos.x += (mouse.x - pos.x) * 0.25
    pos.y += (mouse.y - pos.y) * 0.25
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`
    raf = active || Math.hypot(mouse.x - pos.x, mouse.y - pos.y) > 0.5 ? requestAnimationFrame(tick) : 0
  }
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
    if (!raf) raf = requestAnimationFrame(tick)
  }, { passive: true })
  document.addEventListener('mouseover', (e) => {
    const hit = e.target.closest('[data-cursor]')
    active = Boolean(hit) && hit !== cursor
    if (active) {
      label.textContent = t().cursorOpen
      pos.x = mouse.x
      pos.y = mouse.y
    }
    cursor.classList.toggle('is-on', active)
    if (active && !raf) raf = requestAnimationFrame(tick)
  })
}

function bindMagnetic() {
  if (!finePointer || reduced) return
  $$('[data-magnetic]').forEach((el) => {
    el.addEventListener('mouseenter', () => { el.style.transition = 'transform 0.2s ease-out' })
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left - r.width / 2
      const y = e.clientY - r.top - r.height / 2
      el.style.transform = `translate(${x * 0.18}px, ${y * 0.22}px)`
    })
    // spring back instead of snapping
    el.addEventListener('mouseleave', () => {
      el.style.transition = 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)'
      el.style.transform = ''
    })
  })
}

function clock() {
  const el = $('#clock')
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false })
  const stamp = () => {
    const now = new Date()
    el.textContent = `${f.format(now)} SGT`
    el.dateTime = now.toISOString()
  }
  stamp()
  setInterval(stamp, 15000)
}

const railSections = ['intro', 'about', 'work', 'practice', 'index', 'contact']

function placeRailMark() {
  const rail = $('.rail')
  const mark = $('[data-rail-mark]')
  const active = $('.rail a.is-active')
  if (!rail || !mark || !active) return
  if (getComputedStyle(rail).display === 'none') return
  const link = active.getBoundingClientRect()
  const box = rail.getBoundingClientRect()
  const y = link.top - box.top + (link.height - mark.offsetHeight) / 2
  const next = `translate3d(0, ${y.toFixed(1)}px, 0)`
  if (!mark.dataset.ready) {
    mark.style.transition = 'none'
    mark.style.transform = next
    mark.dataset.ready = '1'
    requestAnimationFrame(() => { mark.style.transition = '' })
    return
  }
  mark.style.transform = next
}

// Ink chrome while Experience or DJ sits under the bar. Name eases back as the hero leaves.
function updateChrome() {
  const y = window.scrollY + window.innerHeight * 0.35
  let current = railSections[0]
  railSections.forEach((id) => {
    const sec = document.getElementById(id)
    if (sec && sec.offsetTop <= y) current = id
  })
  $$('[data-rail-link]').forEach((a) => a.classList.toggle('is-active', a.dataset.railLink === current))
  placeRailMark()

  const probe = ($('.topbar')?.offsetHeight || 68) - 1
  const dark = ['.practice', '.offhours'].some((sel) => {
    const el = $(sel)
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.top < probe && r.bottom > probe
  })
  document.body.classList.toggle('is-invert', dark && state.theme !== 'dark')

  const name = $('.hero__name')
  const hero = $('.hero')
  if (name && hero && !reduced) {
    const p = Math.min(1, Math.max(0, window.scrollY / (hero.offsetHeight * 0.9)))
    name.style.transform = p < 0.01
      ? ''
      : `translate3d(0, ${(-p * 28).toFixed(1)}px, 0) scale(${(1 - p * 0.08).toFixed(3)})`
  }
}

function bindScroll() {
  const progress = $('[data-progress]')
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    progress.style.width = `${max ? (window.scrollY / max) * 100 : 0}%`
    updateChrome()
  }
  // Lenis is tuned for a trackpad. Windows desktops send 120px mouse-wheel ticks,
  // which looks floaty and cheap. Native scrolling there; Lenis stays on Mac.
  const useLenis = window.Lenis && !reduced && !/Windows/i.test(navigator.userAgent)
  if (useLenis) {
    const lenis = new window.Lenis({ autoRaf: true, lerp: 0.1 })
    state.lenis = lenis
    lenis.on('scroll', onScroll)
  }
  // Native scroll as well: scrollbar drags and scrollTo do not always pass through Lenis.
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  window.addEventListener('load', onScroll)
  onScroll()
}

function finishLoader() {
  const root = $('[data-loader]')
  if (!root) return
  root.classList.add('is-out')
  heroIn()
  window.setTimeout(() => {
    root.remove()
    document.body.classList.remove('is-loading')
  }, reduced ? 0 : 500)
}

// Shown once per tab session, and kept under 300ms.
function loader() {
  const count = $('[data-loader-count]')
  const seen = sessionStorage.getItem('jl-seen')
  sessionStorage.setItem('jl-seen', '1')
  if (reduced || seen) {
    $('[data-loader]')?.remove()
    heroIn()
    return
  }
  document.body.classList.add('is-loading')
  let n = 0
  const timer = window.setInterval(() => {
    n += 10
    if (n >= 100) {
      window.clearInterval(timer)
      count.textContent = '100'
      window.setTimeout(finishLoader, 60)
      return
    }
    count.textContent = String(n).padStart(2, '0')
  }, 20)
}

// Plain-text values (e.g. a WeChat ID) that can be copied with one click.
async function copyText(btn) {
  const hint = $('[data-copy-hint]', btn)
  try {
    await navigator.clipboard.writeText(btn.dataset.copy)
  } catch {
    const range = document.createRange()
    range.selectNodeContents(btn.firstElementChild)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }
  btn.classList.add('is-copied')
  hint.textContent = t().copied
  window.clearTimeout(btn._t)
  btn._t = window.setTimeout(() => {
    btn.classList.remove('is-copied')
    hint.textContent = t().copy
  }, 1600)
}

function bindUi() {
  $('[data-lang-toggle]').addEventListener('click', () => toggleLang())
  $('[data-theme-toggle]')?.addEventListener('click', () => toggleTheme())
  $('[data-cmdk-open]')?.addEventListener('click', () => openCmdk($('[data-cmdk-open]')))

  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href^="#"]')
    if (anchor && state.lenis && state.caseIdx == null) {
      const target = document.querySelector(anchor.getAttribute('href'))
      if (target) {
        e.preventDefault()
        state.lenis.scrollTo(target, { offset: 0 })
      }
    }
    const workBtn = e.target.closest('[data-work]')
    if (workBtn) { setPreview(Number(workBtn.dataset.work)); openCase(Number(workBtn.dataset.work)); return }
    if (e.target.closest('[data-preview-open]')) { openCase(state.work); return }
    if (e.target.closest('[data-open-first]')) { openCase(0); return }
    const slugBtn = e.target.closest('[data-open-slug]')
    if (slugBtn) {
      const idx = works.findIndex((w) => w.slug === slugBtn.dataset.openSlug)
      if (idx >= 0) openCase(idx)
      return
    }
    const copyBtn = e.target.closest('[data-copy]')
    if (copyBtn) { copyText(copyBtn); return }
    if (e.target.closest('[data-case-close]')) { closeCase(); return }
    if (e.target.closest('[data-case-prev]') && state.caseIdx > 0) { openCase(state.caseIdx - 1); return }
    if (e.target.closest('[data-case-next]') && state.caseIdx < works.length - 1) { openCase(state.caseIdx + 1); return }
  })

  document.addEventListener('mouseover', (e) => {
    const workBtn = e.target.closest('[data-work]')
    if (workBtn) setPreview(Number(workBtn.dataset.work))
  })

  document.addEventListener('keydown', (e) => {
    if (state.cmdkOpen) return
    if (state.caseIdx == null) return
    if (e.key === 'Escape') closeCase()
  })
}

function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light'
  if (state.theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  const meta = $('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#1c1b18' : '#f1ece3')
  lsSet('jl-theme', state.theme)
  applyThemeLabel()
  updateChrome()
}

function applyThemeLabel() {
  const btn = $('[data-theme-toggle]')
  if (btn) btn.textContent = state.theme === 'dark' ? t().themeToLight : t().themeToDark
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark')
  if (state.cmdkOpen && !state.cmdkAi) renderCmdkList()
}

let langTimer = 0
function toggleLang() {
  const go = () => {
    state.lang = state.lang === 'en' ? 'zh' : 'en'
    lsSet('jl-lang', state.lang)
    applyCopy()
    document.querySelector('main')?.classList.remove('is-lang')
    if (state.cmdkOpen && !state.cmdkAi) renderCmdkList()
    if (state.cmdkAi) renderAiPresets()
  }
  if (reduced) { go(); return }
  document.querySelector('main')?.classList.add('is-lang')
  window.clearTimeout(langTimer)
  langTimer = window.setTimeout(go, 180)
}

function applyFooter() {
  const el = $('[data-i18n="footerNote"]')
  if (!el) return
  const sha = state.build && state.build.sha
  const time = state.build && state.build.time
  if (!sha || !time) {
    el.textContent = t().footerNote
    return
  }
  const d = new Date(time)
  if (Number.isNaN(+d)) {
    el.textContent = t().footerNote
    return
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const date = state.lang === 'zh'
    ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
    : `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
  el.textContent = `${t().footerLive} \u00B7 ${date} \u00B7 ${sha}`
}

async function loadMarkets() {
  try {
    const res = await fetch('/api/markets')
    if (!res.ok) return
    const data = await res.json()
    if (data && Array.isArray(data.items) && data.items.length) state.markets = data.items
  } catch { /* keep the skill ticker */ }
  renderTicker()
}

async function loadBuild() {
  try {
    const res = await fetch('/api/build')
    if (!res.ok) return
    const data = await res.json()
    if (data && data.sha && data.time) state.build = data
  } catch { /* keep the static date */ }
  applyFooter()
}

/* ---------- command palette + AI ---------- */

function cmdkCommands() {
  const c = t()
  return [
    { group: c.cmdkJump, id: 'go-intro', label: c.cmdkIntro, hint: '01', run: () => jumpTo('#intro') },
    { group: c.cmdkJump, id: 'go-about', label: c.cmdkAbout, hint: '02', run: () => jumpTo('#about') },
    { group: c.cmdkJump, id: 'go-work', label: c.cmdkWork, hint: '03', run: () => jumpTo('#work') },
    { group: c.cmdkJump, id: 'go-practice', label: c.cmdkPractice, hint: '04', run: () => jumpTo('#practice') },
    { group: c.cmdkJump, id: 'go-index', label: c.cmdkSkills, hint: '05', run: () => jumpTo('#index') },
    { group: c.cmdkJump, id: 'go-contact', label: c.cmdkContact, hint: '06', run: () => jumpTo('#contact') },
    { group: c.cmdkOpen, id: 'open-heineken', label: c.cmdkHeineken, hint: '01', run: () => openFromCmdk(0) },
    { group: c.cmdkOpen, id: 'open-credit', label: c.cmdkCredit, hint: '02', run: () => openFromCmdk(1) },
    { group: c.cmdkOpen, id: 'open-resumeai', label: c.cmdkResumeai, hint: '03', run: () => openFromCmdk(2) },
    { group: c.cmdkOpen, id: 'open-zzrs', label: c.cmdkZzrs, hint: '04', run: () => openFromCmdk(3) },
    { group: c.cmdkOpen, id: 'open-telco', label: c.cmdkTelco, hint: '05', run: () => openFromCmdk(4) },
    { group: c.cmdkOpen, id: 'open-zeroq', label: c.cmdkZeroq, hint: '06', run: () => openFromCmdk(5) },
    { group: c.cmdkOpen, id: 'open-jetstar', label: c.cmdkJetstar, hint: '07', run: () => openFromCmdk(6) },
    { group: c.cmdkAct, id: 'act-resume', label: c.cmdkResume, run: () => { closeCmdk(); $('[data-resume-link]')?.click() } },
    { group: c.cmdkAct, id: 'act-email', label: c.cmdkCopyEmail, run: () => copyFromCmdk('junyan.lin.2024@business.smu.edu.sg') },
    { group: c.cmdkAct, id: 'act-wechat', label: c.cmdkCopyWechat, run: () => copyFromCmdk('CHRIS_LJY_ATB') },
    { group: c.cmdkAct, id: 'act-lang', label: c.cmdkLang, run: () => toggleLang() },
    { group: c.cmdkAct, id: 'act-theme', label: c.cmdkTheme, run: () => toggleTheme() },
    { group: c.cmdkAsk, id: 'act-ai', label: c.cmdkAi, run: () => enterAi() },
  ]
}

function fuzzyScore(q, text) {
  const a = q.trim().toLowerCase()
  const b = String(text).toLowerCase()
  if (!a) return 1
  if (b === a) return 100
  if (b.startsWith(a)) return 80
  const safe = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`(?:^|\\s)${safe}(?:\\s|$)`).test(b)) return 70
  if (b.includes(a)) return 50
  let i = 0
  for (const ch of b) {
    if (ch === a[i]) i += 1
    if (i === a.length) return 10
  }
  return 0
}

function filteredCmdk() {
  const q = ($('[data-cmdk-input]')?.value || '')
  return cmdkCommands()
    .map((item) => ({
      item,
      score: Math.max(fuzzyScore(q, item.label), fuzzyScore(q, item.group) * 0.3, fuzzyScore(q, item.hint || '') * 0.2),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.item)
}

function renderCmdkList() {
  const list = $('[data-cmdk-list]')
  if (!list) return
  const items = filteredCmdk()
  if (state.cmdkIndex >= items.length) state.cmdkIndex = Math.max(0, items.length - 1)
  if (!items.length) {
    list.innerHTML = `<p class="cmdk__empty">${esc(t().cmdkEmpty)}</p>`
    return
  }
  let html = ''
  let last = ''
  items.forEach((item, i) => {
    if (item.group !== last) {
      html += `<p class="cmdk__group">${esc(item.group)}</p>`
      last = item.group
    }
    html += `<button class="cmdk__item${i === state.cmdkIndex ? ' is-on' : ''}" type="button" role="option" data-cmdk-item="${i}" id="cmdk-opt-${i}">
      <span>${esc(item.label)}</span>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}
    </button>`
  })
  list.innerHTML = html
  const on = $(`[data-cmdk-item="${state.cmdkIndex}"]`, list)
  on?.scrollIntoView({ block: 'nearest' })
}

function syncCmdkCopy() {
  const input = $('[data-cmdk-input]')
  if (input) input.placeholder = t().cmdkSearch
  const ai = $('[data-ai-input]')
  if (ai) ai.placeholder = t().aiPlaceholder
  if (state.cmdkOpen && !state.cmdkAi) renderCmdkList()
  if (state.cmdkAi) renderAiPresets()
  const tog = $('[data-dj-toggle]')
  if (tog) tog.setAttribute('aria-label', tog.getAttribute('aria-pressed') === 'true' ? t().djPause : t().djPlay)
  const fab = $('[data-ask-fab]')
  if (fab) fab.setAttribute('aria-label', t().askAi)
}

function cmdkFocusables() {
  const root = $('[data-cmdk-panel]')
  if (!root) return []
  return [...root.querySelectorAll('a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null)
}

function openCmdk(from) {
  const root = $('[data-cmdk]')
  if (!root) return
  state.cmdkReturn = from || document.activeElement
  state.cmdkOpen = true
  state.cmdkAi = false
  state.cmdkIndex = 0
  root.hidden = false
  $('[data-cmdk-home]').hidden = false
  $('[data-cmdk-ai]').hidden = true
  const input = $('[data-cmdk-input]')
  if (input) input.value = ''
  renderCmdkList()
  syncCmdkCopy()
  requestAnimationFrame(() => input?.focus())
  syncAskFab()
}

function closeCmdk() {
  const root = $('[data-cmdk]')
  if (!root || !state.cmdkOpen) return
  state.cmdkOpen = false
  state.cmdkAi = false
  root.hidden = true
  $('[data-cmdk-home]').hidden = false
  $('[data-cmdk-ai]').hidden = true
  const back = state.cmdkReturn
  state.cmdkReturn = null
  if (back && typeof back.focus === 'function') back.focus()
  syncAskFab()
}

function jumpTo(hash) {
  closeCmdk()
  const target = document.querySelector(hash)
  if (!target) return
  if (state.lenis && state.caseIdx == null) state.lenis.scrollTo(target, { offset: 0 })
  else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
}

function openFromCmdk(i) {
  closeCmdk()
  setPreview(i)
  openCase(i)
}

function copyFromCmdk(value) {
  const fake = document.createElement('button')
  fake.dataset.copy = value
  fake.innerHTML = `<span>${esc(value)}</span><small data-copy-hint></small>`
  copyText(fake).then(() => flashCmdk(t().copied))
}

function flashCmdk(msg) {
  let el = $('[data-cmdk-toast]')
  if (!el) {
    el = document.createElement('p')
    el.className = 'cmdk__hint'
    el.dataset.cmdkToast = ''
    $('[data-cmdk-panel]')?.appendChild(el)
  }
  el.hidden = false
  el.textContent = msg
  window.clearTimeout(el._t)
  el._t = window.setTimeout(() => { el.hidden = true }, 1400)
}

function enterAi() {
  state.cmdkAi = true
  $('[data-cmdk-home]').hidden = true
  $('[data-cmdk-ai]').hidden = false
  renderAiPresets()
  requestAnimationFrame(() => $('[data-ai-input]')?.focus())
}

function openCmdkAi(from) {
  openCmdk(from)
  enterAi()
}

function syncAskFab() {
  const fab = $('[data-ask-fab]')
  if (!fab) return
  fab.hidden = !state.ready || state.heroIn || state.caseIdx != null || state.cmdkOpen
}

function bindAskFab() {
  const fab = $('[data-ask-fab]')
  const hero = $('.hero')
  if (!fab) return
  fab.addEventListener('click', () => openCmdkAi(fab))
  if (!hero) {
    state.heroIn = false
    syncAskFab()
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      state.heroIn = entries.some((en) => en.isIntersecting)
      syncAskFab()
    },
    { threshold: 0 },
  )
  io.observe(hero)
}

function leaveAi() {
  state.cmdkAi = false
  $('[data-cmdk-ai]').hidden = true
  $('[data-cmdk-home]').hidden = false
  renderCmdkList()
  requestAnimationFrame(() => $('[data-cmdk-input]')?.focus())
}

function renderAiPresets() {
  const box = $('[data-ai-presets]')
  if (!box) return
  if (state.aiTurns.length) {
    box.innerHTML = ''
    return
  }
  box.innerHTML = t()
    .aiPresets.map((p, i) => `<button class="cmdk__preset" type="button" data-ai-preset="${i}">${esc(p.q)}</button>`)
    .join('')
}

function appendAiMsg(role, text) {
  const thread = $('[data-ai-thread]')
  const p = document.createElement('p')
  p.className = `cmdk__msg is-${role}`
  p.textContent = text
  thread.appendChild(p)
  thread.scrollTop = thread.scrollHeight
  return p
}

function typewrite(el, text) {
  const token = ++state.aiType
  return new Promise((resolve) => {
    if (reduced) {
      el.textContent = text
      resolve()
      return
    }
    let i = 0
    const tick = () => {
      if (token !== state.aiType) { resolve(); return }
      i += 1
      el.textContent = text.slice(0, i)
      $('[data-ai-thread]').scrollTop = $('[data-ai-thread]').scrollHeight
      if (i >= text.length) resolve()
      else window.setTimeout(tick, 14)
    }
    tick()
  })
}

async function runPreset(i) {
  const pack = t().aiPresets[i]
  if (!pack) return
  state.aiTurns.push({ role: 'user', content: pack.q })
  appendAiMsg('user', pack.q)
  renderAiPresets()
  const bubble = appendAiMsg('ai', '')
  await typewrite(bubble, pack.a)
  state.aiTurns.push({ role: 'assistant', content: pack.a })
}

function showAiDown() {
  const last = $('[data-ai-thread] .cmdk__msg.is-ai:last-child')
  if (last && !last.textContent) last.textContent = t().aiDown
  else appendAiMsg('ai', t().aiDown)
}

async function askFree(text) {
  const hint = $('[data-ai-hint]')
  if (text.length > 300) {
    if (hint) { hint.hidden = false; hint.textContent = t().aiTooLong }
    return
  }
  if (hint) hint.hidden = true
  state.aiTurns.push({ role: 'user', content: text })
  appendAiMsg('user', text)
  renderAiPresets()
  const bubble = appendAiMsg('ai', '')
  const payload = state.aiTurns.slice(-12)
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: payload, lang: state.lang }),
    })
    if (!res.ok || !res.body) { showAiDown(); return }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let out = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const raw = trimmed.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        try {
          const ev = JSON.parse(raw)
          const piece = ev.delta && ev.delta.text
          if (ev.type === 'content_block_delta' && piece) {
            out += piece
            bubble.textContent = out
            $('[data-ai-thread]').scrollTop = $('[data-ai-thread]').scrollHeight
          }
        } catch { /* keep reading */ }
      }
    }
    if (!out) showAiDown()
    else state.aiTurns.push({ role: 'assistant', content: out })
  } catch {
    showAiDown()
  }
}

function bindCmdk() {
  const root = $('[data-cmdk]')
  if (!root) return
  $('[data-cmdk-mask]')?.addEventListener('click', () => closeCmdk())
  $('[data-cmdk-back]')?.addEventListener('click', () => leaveAi())
  $('[data-cmdk-input]')?.addEventListener('input', () => {
    state.cmdkIndex = 0
    renderCmdkList()
  })
  $('[data-cmdk-list]')?.addEventListener('mousemove', (e) => {
    const btn = e.target.closest('[data-cmdk-item]')
    if (!btn) return
    const i = Number(btn.dataset.cmdkItem)
    if (i !== state.cmdkIndex) {
      state.cmdkIndex = i
      $$('[data-cmdk-item]', $('[data-cmdk-list]')).forEach((el) => el.classList.toggle('is-on', Number(el.dataset.cmdkItem) === i))
    }
  })
  $('[data-cmdk-list]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cmdk-item]')
    if (!btn) return
    const items = filteredCmdk()
    items[Number(btn.dataset.cmdkItem)]?.run()
  })
  $('[data-ai-presets]')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ai-preset]')
    if (btn) runPreset(Number(btn.dataset.aiPreset))
  })
  $('[data-ai-form]')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const input = $('[data-ai-input]')
    const text = (input?.value || '').trim()
    if (!text) return
    input.value = ''
    askFree(text)
  })
  document.addEventListener('keydown', (e) => {
    const inField = e.target.closest('input, textarea, select, [contenteditable="true"]')
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (state.cmdkOpen) closeCmdk()
      else openCmdk($('[data-cmdk-open]'))
      return
    }
    if (e.key === '/' && !state.cmdkOpen && !inField) {
      e.preventDefault()
      openCmdk($('[data-cmdk-open]'))
      return
    }
    if (!state.cmdkOpen) return
    if (e.key === 'Escape') {
      e.preventDefault()
      if (state.cmdkAi) leaveAi()
      else closeCmdk()
      return
    }
    if (e.key === 'Tab') {
      const els = cmdkFocusables()
      if (!els.length) return
      const i = els.indexOf(document.activeElement)
      const next = e.shiftKey
        ? (i <= 0 ? els[els.length - 1] : els[i - 1])
        : (i === -1 || i === els.length - 1 ? els[0] : els[i + 1])
      e.preventDefault()
      next.focus()
      return
    }
    if (state.cmdkAi) return
    const items = filteredCmdk()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      state.cmdkIndex = Math.min(items.length - 1, state.cmdkIndex + 1)
      renderCmdkList()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      state.cmdkIndex = Math.max(0, state.cmdkIndex - 1)
      renderCmdkList()
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      items[state.cmdkIndex]?.run()
    }
  })
}

/* ---------- DJ player ---------- */

const dj = {
  audio: null,
  peaks: [],
  ready: false,
  ctx: null,
  analyser: null,
  src: null,
  bins: null,
  raf: 0,
}

function fmtClock(s) {
  const n = Math.max(0, Math.floor(s || 0))
  return `0:${String(n).padStart(2, '0')}`
}

function paintDj(progress, bounce) {
  const bars = $$('[data-dj-wave] i')
  bars.forEach((bar, i) => {
    bar.classList.toggle('is-on', bars.length ? i / bars.length <= progress : false)
    if (reduced) return
    const base = (dj.peaks[i] || 0.18) * 36
    const h = bounce == null ? base : Math.max(6, base * (0.7 + bounce * 0.5))
    bar.style.height = `${h.toFixed(1)}px`
  })
}

function djEnergy() {
  if (!dj.analyser || !dj.bins || reduced) return null
  dj.analyser.getByteFrequencyData(dj.bins)
  let sum = 0
  for (let i = 0; i < dj.bins.length; i += 1) sum += dj.bins[i]
  return sum / (dj.bins.length * 255)
}

function tickDj() {
  const audio = dj.audio
  if (!audio) return
  const dur = audio.duration || 30
  const progress = dur ? audio.currentTime / dur : 0
  paintDj(progress, audio.paused ? null : djEnergy())
  $('[data-dj-cur]').textContent = fmtClock(audio.currentTime)
  $('[data-dj-dur]').textContent = fmtClock(dur)
  const wave = $('[data-dj-wave]')
  if (wave) wave.setAttribute('aria-valuenow', String(Math.round(audio.currentTime)))
  if (!audio.paused) dj.raf = requestAnimationFrame(tickDj)
  else dj.raf = 0
}

function ensureDjGraph() {
  if (dj.ctx) {
    if (dj.ctx.state === 'suspended') dj.ctx.resume()
    return
  }
  if (reduced) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  try {
    dj.ctx = new AC()
    dj.analyser = dj.ctx.createAnalyser()
    dj.analyser.fftSize = 64
    dj.src = dj.ctx.createMediaElementSource(dj.audio)
    dj.src.connect(dj.analyser)
    dj.analyser.connect(dj.ctx.destination)
    dj.bins = new Uint8Array(dj.analyser.frequencyBinCount)
  } catch { /* play without bounce */ }
}

function pauseDj() {
  if (!dj.audio || dj.audio.paused) return
  dj.audio.pause()
  const btn = $('[data-dj-toggle]')
  if (btn) {
    btn.setAttribute('aria-pressed', 'false')
    btn.setAttribute('aria-label', t().djPlay)
  }
  if (dj.raf) cancelAnimationFrame(dj.raf)
  dj.raf = 0
  tickDj()
}

async function paintDjPeaks() {
  if (dj.peaks.length) return
  try {
    const res = await fetch('./work/dj-peaks.json')
    const data = await res.json()
    if (data && Array.isArray(data.peaks)) dj.peaks = data.peaks
  } catch { dj.peaks = Array(64).fill(0.3) }
  const wave = $('[data-dj-wave]')
  if (wave && !wave.children.length) {
    wave.innerHTML = dj.peaks
      .map((v) => `<i style="height:${Math.max(6, v * 36).toFixed(1)}px"></i>`)
      .join('')
  }
}

function armDjAudio() {
  if (dj.ready || !dj.audio) return
  dj.ready = true
  dj.audio.src = './work/dj-clip.m4a'
}

function bindDj() {
  const root = $('[data-dj-player]')
  const audio = $('[data-dj-audio]')
  const wave = $('[data-dj-wave]')
  const btn = $('[data-dj-toggle]')
  if (!root || !audio || !wave || !btn) return
  dj.audio = audio
  audio.preload = 'none'
  btn.setAttribute('aria-label', t().djPlay)
  paintDjPeaks()
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) {
      armDjAudio()
      io.disconnect()
    }
  }, { threshold: 0.15 })
  io.observe(root.closest('.offhours') || root)
  btn.addEventListener('click', async () => {
    armDjAudio()
    await paintDjPeaks()
    if (audio.paused) {
      ensureDjGraph()
      try { await audio.play() } catch { return }
      btn.setAttribute('aria-pressed', 'true')
      btn.setAttribute('aria-label', t().djPause)
      tickDj()
    } else {
      pauseDj()
    }
  })
  const seek = (clientX) => {
    armDjAudio()
    if (!audio.src) return
    const r = wave.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const dur = audio.duration || 30
    audio.currentTime = p * dur
    tickDj()
  }
  wave.addEventListener('click', (e) => seek(e.clientX))
  wave.addEventListener('keydown', (e) => {
    const dur = audio.duration || 30
    if (e.key === 'ArrowRight') { e.preventDefault(); audio.currentTime = Math.min(dur, audio.currentTime + 2); tickDj() }
    if (e.key === 'ArrowLeft') { e.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 2); tickDj() }
  })
  audio.addEventListener('ended', () => pauseDj())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseDj()
  })
}

applyTheme(state.theme)
applyCopy()
clock()
bindUi()
bindCmdk()
bindAskFab()
bindDj()
bindCursor()
bindMagnetic()
bindScroll()
bindPortrait()
bindOffhours()
loadMarkets()
loadBuild()
works.forEach((w) => { const im = new Image(); im.src = w.slides[0].src })
window.addEventListener('popstate', () => {
  const slug = new URLSearchParams(location.search).get('project')
  if (!slug) {
    projectPushed = false
    if (state.caseIdx != null) closeCase({ fromHistory: true })
    return
  }
  const idx = works.findIndex((w) => w.slug === slug)
  if (idx < 0) return
  projectPushed = true
  openCase(idx, { fromHistory: true })
})
openProjectFromUrl()
loader()
console.info(
  `[site] motion: ${reduced ? 'REDUCED (Windows animation effects may be off)' : 'full'} | pointer: ${finePointer ? 'fine' : 'coarse'} | scroll: ${state.lenis ? 'lenis' : 'native'}`,
)
