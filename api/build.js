const STARTED = new Date().toISOString()

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
  res.status(200).json({ sha, time: sha ? STARTED : '' })
}
