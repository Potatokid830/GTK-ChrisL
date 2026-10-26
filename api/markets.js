const SYMBOLS = [
  { id: 'spx', symbol: '^spx', en: 'S&P 500', zh: 'S&P 500', digits: 1 },
  { id: 'nvda', symbol: 'nvda.us', en: 'NVDA', zh: 'NVDA', digits: 2 },
  { id: 'usdsgd', symbol: 'usdsgd', en: 'USD/SGD', zh: 'USD/SGD', digits: 4 },
  { id: 'sti', symbol: '^sti', en: 'Straits Times', zh: '\u6d77\u5ce1\u65f6\u62a5\u6307\u6570', digits: 1 },
]

function yyyymmdd(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function dailyUrl(symbol) {
  const to = new Date()
  const from = new Date(to.getTime() - 21 * 86400000)
  const s = encodeURIComponent(symbol)
  return `https://stooq.com/q/d/l/?s=${s}&d1=${yyyymmdd(from)}&d2=${yyyymmdd(to)}&i=d`
}

function parseCloses(csv) {
  const lines = String(csv || '')
    .trim()
    .split(/\r?\n/)
    .filter((line) => line && !/^date/i.test(line) && !/no data/i.test(line))
  const closes = []
  for (const line of lines) {
    const parts = line.split(',')
    const close = Number(parts[4])
    if (Number.isFinite(close) && close > 0) closes.push(close)
  }
  return closes
}

async function quote(item) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(dailyUrl(item.symbol), {
      signal: ctrl.signal,
      headers: { 'user-agent': 'chrisljy-club/1.0' },
    })
    if (!res.ok) return null
    const closes = parseCloses(await res.text())
    if (closes.length < 2) return null
    const price = closes[closes.length - 1]
    const prev = closes[closes.length - 2]
    if (!prev) return null
    return {
      id: item.id,
      en: item.en,
      zh: item.zh,
      price,
      digits: item.digits,
      change: ((price - prev) / prev) * 100,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET') {
    res.status(405).json({ items: [] })
    return
  }
  const items = (await Promise.all(SYMBOLS.map(quote))).filter(Boolean)
  res.status(200).json({ items })
}
