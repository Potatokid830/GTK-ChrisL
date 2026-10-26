// Stooq used to be the source (CSV at stooq.com/q/d/l/). From serverless IPs it
// now returns a JS proof-of-work challenge, even with a browser User-Agent, so
// the function got an empty list and the site fell back to the skill ticker.
//
// Current sources (no API key):
//   1. CNBC public quote API — S&P 500 (.SPX), NVDA, Straits Times (.STI)
//      https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol
//   2. Frankfurter ECB reference rates — USD/SGD
//      https://api.frankfurter.dev/v1/{from}..{to}?from=USD&to=SGD

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const CNBC =
  'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol' +
  '?symbols=.SPX%7CNVDA%7C.STI&requestMethod=itv&noform=1&partnerId=2&fund=1&output=json'

const META = {
  '.SPX': { id: 'spx', en: 'S&P 500', zh: 'S&P 500', digits: 1 },
  NVDA: { id: 'nvda', en: 'NVDA', zh: 'NVDA', digits: 2 },
  '.STI': { id: 'sti', en: 'Straits Times', zh: '\u6d77\u5ce1\u65f6\u62a5\u6307\u6570', digits: 1 },
}

function num(value) {
  if (value == null) return NaN
  return Number(String(value).replace(/,/g, '').replace(/%/g, '').trim())
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

async function getText(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        accept: 'application/json,text/plain,*/*',
      },
    })
    if (!res.ok) return ''
    return res.text()
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

function fromCnbc(quote) {
  if (!quote || quote.code === 1) return null
  const meta = META[quote.symbol]
  if (!meta) return null
  const price = num(quote.last)
  if (!Number.isFinite(price) || price <= 0) return null
  let change = num(quote.change_pct)
  if (!Number.isFinite(change)) {
    const prev = num(quote.previous_day_closing)
    if (prev > 0) change = ((price - prev) / prev) * 100
  }
  if (!Number.isFinite(change)) return null
  return { ...meta, price, change }
}

async function quotesCnbc() {
  const raw = await getText(CNBC)
  if (!raw || raw[0] === '<') return []
  try {
    const data = JSON.parse(raw)
    const block = data && data.FormattedQuoteResult && data.FormattedQuoteResult.FormattedQuote
    const list = Array.isArray(block) ? block : block ? [block] : []
    return list.map(fromCnbc).filter(Boolean)
  } catch {
    return []
  }
}

async function quoteUsdSgd() {
  const to = new Date()
  const from = new Date(to.getTime() - 21 * 86400000)
  const raw = await getText(`https://api.frankfurter.dev/v1/${ymd(from)}..${ymd(to)}?from=USD&to=SGD`)
  if (!raw || raw[0] === '<') return null
  try {
    const data = JSON.parse(raw)
    const dates = Object.keys(data.rates || {}).sort()
    if (dates.length < 2) return null
    const price = Number(data.rates[dates[dates.length - 1]].SGD)
    const prev = Number(data.rates[dates[dates.length - 2]].SGD)
    if (!price || !prev) return null
    return {
      id: 'usdsgd',
      en: 'USD/SGD',
      zh: 'USD/SGD',
      digits: 4,
      price,
      change: ((price - prev) / prev) * 100,
    }
  } catch {
    return null
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET') {
    res.status(405).json({ source: 'cnbc+frankfurter', items: [] })
    return
  }
  const [cnbc, fx] = await Promise.all([quotesCnbc(), quoteUsdSgd()])
  const items = [...cnbc]
  if (fx) items.push(fx)
  const order = { spx: 0, nvda: 1, usdsgd: 2, sti: 3 }
  items.sort((a, b) => (order[a.id] ?? 9) - (order[b.id] ?? 9))
  res.status(200).json({ source: 'cnbc+frankfurter', items })
}
