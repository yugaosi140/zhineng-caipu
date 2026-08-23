/**
 * 菜品配料乘价格表的家做食材成本估算。
 * 价格单位为元/公斤，配料支持常见的克、毫升和件数单位。
 */
const UNIT_TO_GRAM = {
  g: 1, kg: 1000, ml: 1, l: 1000, 个: 60, 枚: 55, 瓣: 5, 根: 15, 片: 3,
  张: 30, 只: 250, 条: 500, 把: 200, 勺: 15, 茶匙: 5, 适量: 5, 少许: 2,
}

const ITEM_GRAM = {
  鸡蛋: 55, 皮蛋: 65, 咸蛋: 60, 莲藕: 400, 土豆: 150, 番茄: 150, 黄瓜: 200,
  茄子: 200, 青椒: 40, 辣椒: 25, 洋葱: 180, 苦瓜: 250, 凉瓜: 250, 冬瓜: 800,
  丝瓜: 250, 南瓜: 900, 白萝卜: 500, 胡萝卜: 120, 香菇: 15, 金针菇: 100, 平菇: 100,
}

export function toKilograms({ name = '', qty = 0, unit = 'g' } = {}) {
  if (!Number.isFinite(qty) || qty <= 0) return 0
  const u = String(unit).trim()
  if (u === 'kg') return qty
  const grams = u === 'g' ? 1 : ITEM_GRAM[name] ?? UNIT_TO_GRAM[u]
  return Number.isFinite(grams) ? (qty * grams) / 1000 : 0
}

export function estimateDishCost(dish, priceTable = {}) {
  const lines = []
  const unmatched = []
  const seen = new Set()
  let total = 0
  for (const ingredient of dish.ingredients ?? []) {
    const key = ingredient.priceKey || ingredient.name
    const entry = priceTable[key]
    const kg = toKilograms(ingredient)
    if (!entry || kg <= 0) {
      if (!entry && ingredient.priceKey !== null) unmatched.push(ingredient.name)
      lines.push({ name: ingredient.name, kg, price: null, cost: 0, provenance: 'unknown' })
      continue
    }
    const cost = Math.round(entry.price * kg * 100) / 100
    total += cost
    seen.add(entry.provenance)
    lines.push({ name: ingredient.name, kg, price: entry.price, cost, provenance: entry.provenance })
  }
  const servings = dish.servings > 0 ? dish.servings : 2
  const order = ['baseline', 'index-adjusted', 'live', 'manual']
  return {
    total: Math.round(total * 100) / 100,
    perServing: Math.round((total / servings) * 100) / 100,
    lines,
    matched: lines.filter((line) => line.price != null).length,
    unmatched,
    provenance: order.find((item) => seen.has(item)) ?? 'unknown',
  }
}

export const WEALTH_TIERS = {
  low: { key: 'low', label: '低', min: 0, max: 8, sweet: 4 },
  mid: { key: 'mid', label: '中', min: 3, max: 22, sweet: 11 },
  high: { key: 'high', label: '高', min: 10, max: Infinity, sweet: 30 },
}

export function costFit(perServing, wealthKey = 'mid') {
  const tier = WEALTH_TIERS[wealthKey] ?? WEALTH_TIERS.mid
  if (perServing <= 0) return { score: 0, fit: 'in', note: '成本未知' }
  if (perServing > tier.max) {
    const over = (perServing - tier.max) / tier.max
    return { score: -Math.min(3, over * 2), fit: 'over', note: `约 ${perServing} 元/人，高于${tier.label}档预算` }
  }
  if (perServing < tier.min) return { score: 0, fit: 'under', note: `约 ${perServing} 元/人，很省` }
  const distance = Math.abs(perServing - tier.sweet) / Math.max(tier.sweet, 1)
  return { score: 1.2 * Math.max(0, 1 - distance), fit: 'in', note: `约 ${perServing} 元/人，合${tier.label}档预算` }
}
