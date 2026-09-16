// ASCII only in this file. All visible copy lives in content.js.
import { copy, experience, skills, works } from './content.js'

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
// Hidden start states in the CSS are scoped to html.js, so nothing stays invisible without JS.
document.documentElement.classList.add('js')

const state = {
  lang: localStorage.getItem('jl-lang') === 'zh' ? 'zh' : 'en',
  work: 0,
  caseIdx: null,
  lenis: null,
  ready: false,
  previewToken: 0,
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
  // The resume download follows the site language.
  const resume = $('[data-resume-link]')
  if (resume) resume.href = state.lang === 'zh' ? './Junyan_Lin_Resume_CN.pdf' : './Junyan_Lin_Resume.pdf'
  renderRail()
  renderTicker()
  renderFigures()
  renderWork()
  renderPractice()
  renderSkills()
  setPreview(state.work)
  if (state.caseIdx != null) renderCase()
  splitHeadings()
  observeReveals()
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
  if (reduced) {
    $$('[data-reveal], .split').forEach((el) => el.classList.add('is-in'))
    return
  }
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
  requestAnimationFrame(() => requestAnimationFrame(() => {
    hero.classList.add('is-in')
    $$('.hero .split').forEach((el) => el.classList.add('is-in'))
    state.ready = true
  }))
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

function renderRail() {
  $('[data-rail]').innerHTML = t()
    .rail.map(
      ([no, label, href], i) =>
        `<li><a href="${href}" data-rail-link="${href.slice(1)}" class="${i === 0 ? 'is-active' : ''}"><span>${no}</span><span>${esc(label)}</span></a></li>`,
    )
    .join('')
}

function renderTicker() {
  const items = t().ticker.map((s) => `<span>${esc(s)}</span>`).join('')
  $('[data-ticker]').innerHTML = items + items
}

function renderFigures() {
  $('[data-figures]').innerHTML = t()
    .figures.map(
      ([k, v, logo], i) =>
        `<li data-reveal style="--i:${i}"><small>${esc(k)}</small><strong>${esc(v)}</strong>${
          logo ? `<img class="figures__logo" src="${logo}" alt="Singapore Management University" width="300" height="130" />` : ''
        }</li>`,
    )
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
        </button>
      </li>`
    })
    .join('')
}

function setPreview(i) {
  state.work = i
  const w = works[i]
  const c = w[state.lang]
  const card = $('[data-work-preview]')
  $$('[data-work]').forEach((btn) => btn.classList.toggle('is-on', Number(btn.dataset.work) === i))

  const apply = () => {
    $('[data-preview-no]').textContent = w.no
    const stamp = $('[data-preview-stamp]')
    stamp.textContent = c.stamp
    stamp.classList.toggle('is-buy', w.id === 'heineken')
    $('[data-preview-figure]').textContent = c.figure
    $('[data-preview-label]').textContent = c.figureLabel
    $('[data-preview-dek]').textContent = c.preview
    const img = $('[data-preview-img]')
    img.src = w.slides[0].src
    img.alt = c.title
  }

  // First paint and reduced motion: swap in place. Otherwise fade out, swap, fade back.
  if (reduced || !state.ready) { apply(); return }
  const token = ++state.previewToken
  card.classList.add('is-switching')
  window.setTimeout(() => {
    if (token !== state.previewToken) return
    apply()
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('is-switching')))
  }, 180)
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

function widgetFor(w, c) {
  if (w.widget === 'scenarios') return widgetScenarios(c)
  if (w.widget === 'compare') return widgetCompare(c)
  if (w.widget === 'levers') return widgetLevers(c)
  if (w.widget === 'mix') return widgetMix(c)
  return ''
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
}

/* ---------- project dossier ---------- */

function openCase(idx) {
  const first = state.caseIdx == null
  state.caseIdx = idx
  renderCase()
  const root = $('[data-dossier]')
  root.hidden = false
  document.body.classList.add('is-case')
  $('[data-cursor-badge]')?.classList.remove('is-on')
  state.lenis?.stop()
  requestAnimationFrame(() => root.classList.add('is-open'))
  root.scrollTop = 0
  if (!first) root.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
}

function renderCase() {
  const w = works[state.caseIdx]
  const c = w[state.lang]
  const body = $('[data-case-body]')
  $('[data-case-count]').textContent = `${w.no} / 0${works.length}  \u00B7  ${c.kind}`
  $('[data-case-prev]').disabled = state.caseIdx === 0
  $('[data-case-next]').disabled = state.caseIdx === works.length - 1

  const hasStats = Array.isArray(c.stats) && c.stats.length > 0
  const widgetHtml = widgetFor(w, c)
  const hasSide = hasStats || widgetHtml !== ''
  body.innerHTML = `
    <section class="d-head">
      <p class="eyebrow">${esc(c.eyebrow || `${c.kind} \u00B7 ${c.meta[0][1]}`)}</p>
      <h2 class="d-title">${esc(c.title)}</h2>
      <p class="d-dek">${esc(c.dek)}</p>
      <ul class="d-meta">
        ${c.meta.map(([k, v]) => `<li><small>${esc(k)}</small><strong>${esc(v)}</strong></li>`).join('')}
      </ul>
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

    <section class="d-grid ${hasSide ? '' : 'd-grid--single'}">
      ${hasSide ? `<aside class="d-side">
        ${hasStats ? `<h3 class="d-side__h">${esc(t().keyNumbers)}</h3>
        <dl class="d-stats">
          ${c.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>` : ''}
        ${widgetHtml}
      </aside>` : ''}
      <div class="d-text">
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

function closeCase() {
  const root = $('[data-dossier]')
  root.classList.remove('is-open')
  document.body.classList.remove('is-case')
  state.caseIdx = null
  state.lenis?.start()
  window.setTimeout(() => {
    if (state.caseIdx == null) {
      root.hidden = true
      $('[data-case-body]').innerHTML = ''
    }
  }, 420)
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

function bindScroll() {
  const sections = ['intro', 'work', 'practice', 'index', 'contact'].map((id) => document.getElementById(id)).filter(Boolean)
  const spy = () => {
    const y = window.scrollY + window.innerHeight * 0.35
    let current = sections[0]?.id
    sections.forEach((sec) => { if (sec.offsetTop <= y) current = sec.id })
    $$('[data-rail-link]').forEach((a) => a.classList.toggle('is-active', a.dataset.railLink === current))
  }
  const progress = $('[data-progress]')
  if (window.Lenis) {
    const lenis = new window.Lenis({ autoRaf: true, lerp: reduced ? 1 : 0.1 })
    state.lenis = lenis
    lenis.on('scroll', ({ progress: p }) => { progress.style.width = `${p * 100}%` })
    lenis.on('scroll', spy)
  } else {
    window.addEventListener('scroll', () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      progress.style.width = `${max ? (window.scrollY / max) * 100 : 0}%`
      spy()
    }, { passive: true })
  }
  spy()
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
  $('[data-lang-toggle]').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'zh' : 'en'
    localStorage.setItem('jl-lang', state.lang)
    applyCopy()
  })

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
    if (state.caseIdx == null) return
    if (e.key === 'Escape') closeCase()
  })
}

applyCopy()
clock()
bindUi()
bindCursor()
bindMagnetic()
bindScroll()
bindPortrait()
works.forEach((w) => { const im = new Image(); im.src = w.slides[0].src })
loader()
