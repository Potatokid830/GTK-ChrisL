const { readFileSync } = require('fs')
const { join } = require('path')

const ALLOWED_HOSTS = new Set(['chrisljy.club', 'www.chrisljy.club'])
const HOUR_LIMIT = 10
const DAY_LIMIT = 30
const SITE_LIMIT = 300
const MAX_QUESTION = 300
const MAX_TURNS = 6

let knowledge = ''
try {
  knowledge = readFileSync(join(process.cwd(), 'ai', 'knowledge.md'), 'utf8')
} catch {
  try {
    knowledge = readFileSync(join(__dirname, '..', 'ai', 'knowledge.md'), 'utf8')
  } catch {
    knowledge = ''
  }
}

function hostOf(value) {
  if (!value) return ''
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return String(value).replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
  }
}

function vercelHosts() {
  const out = []
  for (const raw of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    const host = hostOf(raw ? (String(raw).includes('://') ? raw : `https://${raw}`) : '')
    if (host) out.push(host)
  }
  return out
}

function originAllowed(origin) {
  const host = hostOf(origin)
  if (!host) return false
  if (ALLOWED_HOSTS.has(host)) return true
  if (vercelHosts().includes(host)) return true
  if (host.endsWith('.vercel.app')) {
    const project = (process.env.VERCEL_URL || '').split('.')[0]
    if (project && host.startsWith(`${project}-`) && host.endsWith('.vercel.app')) return true
  }
  return false
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return fwd || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
}

function dayStamp(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

function hourStamp(d = new Date()) {
  return d.toISOString().slice(0, 13)
}

async function redis(cmds) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('redis')
  const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmds),
  })
  if (!res.ok) throw new Error('redis')
  return res.json()
}

function countOf(entry) {
  if (entry == null) return 0
  if (typeof entry === 'number') return entry
  if (typeof entry.result === 'number') return entry.result
  const n = Number(entry.result)
  return Number.isFinite(n) ? n : 0
}

async function rateLimit(ip) {
  const day = dayStamp()
  const hour = hourStamp()
  const hourKey = `chat:ip:${ip}:h:${hour}`
  const dayKey = `chat:ip:${ip}:d:${day}`
  const siteKey = `chat:site:d:${day}`
  const rows = await redis([
    ['INCR', hourKey],
    ['EXPIRE', hourKey, 3600],
    ['INCR', dayKey],
    ['EXPIRE', dayKey, 86400],
    ['INCR', siteKey],
    ['EXPIRE', siteKey, 86400],
  ])
  const hourCount = countOf(rows[0])
  const dayCount = countOf(rows[2])
  const siteCount = countOf(rows[4])
  if (hourCount > HOUR_LIMIT || dayCount > DAY_LIMIT || siteCount > SITE_LIMIT) {
    const err = new Error('limited')
    err.code = 'limited'
    throw err
  }
}

function lastTurns(messages) {
  const clean = []
  if (!Array.isArray(messages)) return clean
  for (const item of messages) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue
    const content = String(item.content || '').trim()
    if (!content) continue
    clean.push({ role: item.role, content })
  }
  return clean.slice(-MAX_TURNS * 2)
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return {}
}

function deny(res, status, origin) {
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.status(status).json({ error: 'unavailable' })
}

module.exports = async function handler(req, res) {
  const origin = String(req.headers.origin || '')
  if (origin && !originAllowed(origin)) {
    res.status(403).json({ error: 'unavailable' })
    return
  }
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'unavailable' })
    return
  }
  if (!process.env.ANTHROPIC_API_KEY || !knowledge) {
    deny(res, 503, origin)
    return
  }

  const body = readBody(req)
  const messages = lastTurns(body.messages)
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser || lastUser.content.length > MAX_QUESTION) {
    deny(res, 400, origin)
    return
  }

  try {
    await rateLimit(clientIp(req))
  } catch (err) {
    deny(res, err && err.code === 'limited' ? 429 : 503, origin)
    return
  }

  let upstream
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 400,
        temperature: 0.3,
        stream: true,
        system: knowledge,
        messages,
      }),
    })
  } catch {
    deny(res, 503, origin)
    return
  }

  if (!upstream.ok || !upstream.body) {
    deny(res, 503, origin)
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.status(200)

  const reader = upstream.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  } catch {
    /* client gone or upstream cut */
  }
  res.end()
}
