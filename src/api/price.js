/**
 * 菜价数据层：农业农村部全国农产品批发市场价格信息系统（pfsc.agri.cn）。
 *
 * 实测结论（重要，直接决定了这里的设计）：
 *
 * 1. 唯一能给出"某市场某品种今天多少钱"的接口
 *    /api/priceQuotationController/pageList 被图形验证码锁死，绕不过去也不该绕。
 *    getTodayMarketByProvinceCode?provinceCode=420000 能返回湖北 7 个市场，
 *    但价格字段全是 null，只有市场名。
 * 2. 能稳定拿到的是每日价格指数（农产品200/粮油/菜篮子）和品种分类表。
 * 3. /api/FarmDaily/list 每日行情简报里含猪肉、牛肉、羊肉、鸡蛋等约 8 项真实价格，
 *    但该接口时好时坏（探测频繁时返回 code:500），必须当 best-effort 处理。
 *
 * 所以每个价格都带 provenance 标签，UI 上如实显示，绝不把估算值伪装成实时行情：
 *   manual         用户在本地手工填的真实价（最高优先）
 *   live           从每日简报正则提取的真实价
 *   index-adjusted 基线价 × (今日指数 / 基线日指数)
 *   baseline       静态兜底价
 */

import { getJson, postJson } from './http.js'
import baseline from '../data/priceBaseline.json'

/**
 * 接口前缀。浏览器不能直连 pfsc.agri.cn（CORS + WAF 校验 UA/Referer），
 * 必须有一层同源转发。
 *
 * 开发环境由 vite.config.js 的 server.proxy 提供，默认前缀 `/pfsc` 即可。
 * 生产环境这层代理不存在（静态产物里没有 dev server），得自己在托管前面放
 * 反向代理，再用 VITE_PFSC_BASE 指过去。配置样例见 deploy/README.md。
 *
 * 没配也不会坏：请求全失败 → loadPrices 降级到 baseline 兜底价。
 */
const BASE = import.meta.env?.VITE_PFSC_BASE || '/pfsc'

const INDEX_URL = `${BASE}/price_portal/pi-info-day/getPortalPiInfoDay`
const DAILY_URL = `${BASE}/api/FarmDaily/list?page=1&limit=1`

const ONE_HOUR = 60 * 60 * 1000

export const PROVENANCE = {
  manual: { key: 'manual', label: '手工填写', tone: 'good' },
  live: { key: 'live', label: '实时简报', tone: 'good' },
  'index-adjusted': { key: 'index-adjusted', label: '指数折算', tone: 'warn' },
  baseline: { key: 'baseline', label: '基线估算', tone: 'muted' },
}

/* ---------------------------------------------------------------- 指数 */

/**
 * 每日价格指数。实测返回 content 数组，最新一天在首位：
 * { publishDate: '2026-08-19', agriculture: 115.68, grainAndOil: 112.5, vegetableBasket: 116.21 }
 */
export async function fetchPriceIndex() {
  const raw = await postJson(INDEX_URL, { retries: 2, cacheTtl: 2 * ONE_HOUR })
  const list = raw?.content
  if (!Array.isArray(list) || !list.length) {
    throw new Error('价格指数返回为空')
  }
  const latest = list[0]
  return {
    date: latest.publishDate,
    agriculture: latest.agriculture,
    grainAndOil: latest.grainAndOil,
    vegetableBasket: latest.vegetableBasket,
    source: '农业农村部 · 农产品批发价格指数',
  }
}

/* ------------------------------------------------------- 每日简报真实价 */

/**
 * 从简报文本里提取"品名 + 价格元/公斤"。
 *
 * 简报原文形如：
 *   猪肉平均价格为15.99元/公斤，比昨天下降0.2%；牛肉68.25元/公斤，比昨天上升0.2%；
 *   羊肉65.89元/公斤…鸡蛋10.51元/公斤…白条鸡17.2元/公斤
 *
 * 导出以便单测（该接口不稳定，不能只靠线上验证）。
 */
export function parseDailyBulletin(text) {
  if (!text || typeof text !== 'string') return {}

  // 简报里的名字 → 品种表里的标准名
  const NAME_MAP = {
    猪肉: '猪肉（白条猪）',
    牛肉: '牛肉',
    羊肉: '羊肉',
    鸡蛋: '鸡蛋',
    白条鸡: '白条鸡',
    活鸡: '活鸡',
    重点监测的28种蔬菜: null,
    重点监测的7种水果: null,
  }

  const out = {}
  // 「名字 + 可选的'平均价格为' + 数字 + 元/公斤」
  const re = /([一-龥]{2,10}?)(?:平均价格)?(?:为)?\s*(\d+(?:\.\d+)?)\s*元\/公斤/g
  let m
  while ((m = re.exec(text)) !== null) {
    const rawName = m[1]
    const price = Number(m[2])
    if (!Number.isFinite(price) || price <= 0) continue
    const mapped = Object.prototype.hasOwnProperty.call(NAME_MAP, rawName)
      ? NAME_MAP[rawName]
      : rawName
    if (!mapped) continue
    out[mapped] = price
  }
  return out
}

/**
 * 每日行情简报。该接口不稳定（时常 code:500），失败返回空对象而非抛错，
 * 让调用方降级到指数折算。
 */
export async function fetchDailyPrices() {
  try {
    const raw = await getJson(DAILY_URL, { retries: 1, cacheTtl: 2 * ONE_HOUR })
    const row = raw?.content?.list?.[0]
    if (!row) return { prices: {}, date: null, ok: false }
    const text = [row.counclesion, row.animalConclusion, row.vegetableConclusion, row.fruitConclusion]
      .filter(Boolean)
      .join('；')
    return {
      prices: parseDailyBulletin(text),
      date: row.createDate?.slice(0, 10) ?? null,
      ok: true,
    }
  } catch {
    return { prices: {}, date: null, ok: false }
  }
}

/* ------------------------------------------------------------ 价格表合成 */

/** 品种归类 → 用哪个指数折算。 */
function indexFieldFor(category) {
  if (category === '蔬菜' || category === '水果' || category === '水产品') return 'vegetableBasket'
  if (category === '粮食' || category === '油料') return 'grainAndOil'
  return 'agriculture'
}

/**
 * 合成完整价格表：基线 → 指数折算 → 简报真实价 → 手工覆盖。
 *
 * @param {object} [opts]
 * @param {object} [opts.index]   fetchPriceIndex 结果，缺省则全部落 baseline
 * @param {object} [opts.live]    fetchDailyPrices().prices
 * @param {object} [opts.manual]  用户手工价 { 品名: 元/公斤 }
 * @returns {Record<string, {price:number, unit:string, provenance:string, category:string}>}
 */
export function buildPriceTable({ index = null, live = {}, manual = {} } = {}) {
  const table = {}

  for (const item of baseline.items) {
    const { name, category, price: basePrice } = item
    let price = basePrice
    let provenance = 'baseline'

    if (index) {
      const field = indexFieldFor(category)
      const today = index[field]
      const base = baseline.baseIndex[field]
      if (Number.isFinite(today) && Number.isFinite(base) && base > 0) {
        price = Math.round((basePrice * (today / base)) * 100) / 100
        provenance = 'index-adjusted'
      }
    }

    if (Number.isFinite(live[name]) && live[name] > 0) {
      price = live[name]
      provenance = 'live'
    }

    if (Number.isFinite(manual[name]) && manual[name] > 0) {
      price = manual[name]
      provenance = 'manual'
    }

    table[name] = { price, unit: '元/公斤', provenance, category }
  }

  return table
}

/**
 * 一键获取：并发拉指数 + 简报，任一失败都降级而不白屏。
 *
 * @param {object} manual 手工价覆盖
 */
export async function loadPrices(manual = {}) {
  const [indexRes, dailyRes] = await Promise.allSettled([fetchPriceIndex(), fetchDailyPrices()])

  const index = indexRes.status === 'fulfilled' ? indexRes.value : null
  const daily = dailyRes.status === 'fulfilled' ? dailyRes.value : { prices: {}, ok: false }

  const table = buildPriceTable({ index, live: daily.prices, manual })

  const counts = { manual: 0, live: 0, 'index-adjusted': 0, baseline: 0 }
  for (const v of Object.values(table)) counts[v.provenance]++

  return {
    table,
    index,
    liveCount: Object.keys(daily.prices).length,
    bulletinOk: daily.ok,
    indexOk: index != null,
    counts,
    // 这句会原样显示在 UI 上，避免让人误以为拿到了湖北本地批发价
    disclaimer:
      '价格为全国指数折算的估算值，非湖北本地批发价。分市场分品种接口被图形验证码限制，可用下方手工改价填入你在菜场看到的真实价。',
    loadedAt: new Date().toISOString(),
  }
}

/* -------------------------------------------------------------- 手工改价 */

const MANUAL_KEY = 'chushan:manualPrices'

export function loadManualPrices() {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveManualPrices(map) {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(map))
    return true
  } catch {
    return false
  }
}

