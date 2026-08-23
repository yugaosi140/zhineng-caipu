/**
 * 极简 fetch 封装：超时、有限重试、内存缓存。
 *
 * 只做 GET/POST 只读请求。缓存放内存 + sessionStorage，避免反复打同一个接口
 * （pfsc 那边探测频繁时会返回 500，缓存能显著降低触发概率）。
 */

const DEFAULT_TIMEOUT = 12000
const memCache = new Map()

class HttpError extends Error {
  constructor(message, { status = 0, url = '' } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

export { HttpError }

function cacheKey(url, init) {
  return `${init?.method || 'GET'} ${url} ${init?.body || ''}`
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(`http:${key}`)
    if (!raw) return null
    const { at, ttl, value } = JSON.parse(raw)
    if (Date.now() - at > ttl) return null
    return value
  } catch {
    return null
  }
}

function writeSession(key, value, ttl) {
  try {
    sessionStorage.setItem(`http:${key}`, JSON.stringify({ at: Date.now(), ttl, value }))
  } catch {
    /* 隐私模式或配额满时忽略，缓存只是优化 */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeout]
 * @param {number} [opts.retries]  失败重试次数（不含首次）
 * @param {number} [opts.cacheTtl] 缓存毫秒数，0 表示不缓存
 */
export async function request(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, retries = 1, cacheTtl = 0, ...init } = opts
  const key = cacheKey(url, init)

  if (cacheTtl > 0) {
    if (memCache.has(key)) {
      const hit = memCache.get(key)
      if (Date.now() - hit.at <= cacheTtl) return hit.value
      memCache.delete(key)
    }
    const fromSession = readSession(key)
    if (fromSession != null) {
      memCache.set(key, { at: Date.now(), value: fromSession })
      return fromSession
    }
  }

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) throw new HttpError(`HTTP ${res.status}`, { status: res.status, url })
      const data = await res.json()
      if (cacheTtl > 0) {
        memCache.set(key, { at: Date.now(), value: data })
        writeSession(key, data, cacheTtl)
      }
      return data
    } catch (err) {
      clearTimeout(timer)
      lastErr =
        err.name === 'AbortError'
          ? new HttpError(`请求超时（${timeout}ms）`, { url })
          : err
      // 指数退避，末次失败不再等待
      if (attempt < retries) await sleep(400 * 2 ** attempt)
    }
  }
  throw lastErr
}

export function getJson(url, opts = {}) {
  return request(url, { ...opts, method: 'GET' })
}

export function postJson(url, opts = {}) {
  return request(url, {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
}

/** 测试用：清空缓存。 */
export function clearHttpCache() {
  memCache.clear()
}
