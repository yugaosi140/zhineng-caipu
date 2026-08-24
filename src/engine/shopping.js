/**
 * 采购清单与当日营养汇总。
 *
 * 单道菜的成本 cost.js 已经算了，但实际做饭是按天买菜的：
 * 五道菜里三道要葱、两道要姜，分开列就得在菜场来回找。
 * 这里把当天要做的菜合并成一张按区域分组的清单。
 *
 * 纯函数，不依赖浏览器 API。
 */

import { toKilograms } from './cost.js'

/**
 * priceBaseline.json 里带 category，但有 34 味配料不在价格表内
 * （多为调味料和少数时鲜），这里补齐分类，否则清单会出现一个巨大的「其他」组。
 */
const EXTRA_CATEGORY = {
  // 调味料：家里常备，单列一组便于跳过
  生抽: '调料',
  醋: '调料',
  白醋: '调料',
  蒸鱼豉油: '调料',
  豆瓣酱: '调料',
  胡椒粉: '调料',
  花椒: '调料',
  白糖: '调料',
  红糖: '调料',
  冰糖: '调料',
  淀粉: '调料',
  黄酒: '调料',
  牛油: '调料',
  芝麻: '调料',
  葱花: '蔬菜',
  紫苏: '蔬菜',
  红菜薹: '蔬菜',
  豆芽: '蔬菜',
  冬笋: '蔬菜',
  板栗: '蔬菜',
  // 干货
  银耳: '干货',
  红枣: '干货',
  薏米: '干货',
  梅干菜: '干货',
  虾皮: '干货',
  榨菜: '干货',
  // 荤鲜
  小龙虾: '水产品',
  鮰鱼: '水产品',
  鳊鱼: '水产品',
  牛骨: '畜产品',
  // 主食半成品
  小汤圆: '粮食',
  米饭: '粮食',
  米浆: '粮食',
  啤酒: '其他',
}

/** 清单分组顺序。按菜场动线排：先荤后素，调料最后。 */
const GROUP_ORDER = ['畜产品', '水产品', '蔬菜', '粮食', '油料', '干货', '地方食材', '调料', '其他']

/**
 * 配料 → 分组名。
 * priceTable 的条目带 category（来自 priceBaseline.json），优先用它。
 */
export function categoryOf(ingredient, priceTable = {}) {
  const key = ingredient.priceKey || ingredient.name
  return priceTable[key]?.category ?? EXTRA_CATEGORY[ingredient.name] ?? '其他'
}

/** 同名同单位的用量相加，输出人能看懂的字符串。 */
function formatQty(qty, unit) {
  if (unit === 'g' && qty >= 1000) {
    const kg = Math.round((qty / 1000) * 100) / 100
    return `${kg} kg`
  }
  const rounded = Math.round(qty * 10) / 10
  return `${rounded} ${unit}`
}

/**
 * 采购清单。
 *
 * 按「配料名 + 单位」合并 —— 鸡蛋按个数、其余按克，两者不能相加。
 * 每条记录哪几道菜用到，方便临时去掉某道菜时知道能少买什么。
 *
 * @param {Array<object>} dishes 当天要做的菜
 * @param {object} priceTable    价格表（api/price.js 的 table）
 * @returns {{groups:Array, totalCost:number, lineCount:number, unpriced:string[]}}
 */
export function buildShoppingList(dishes = [], priceTable = {}) {
  /** @type {Map<string, object>} */
  const merged = new Map()
  let totalCost = 0

  for (const dish of dishes) {
    if (!dish) continue
    for (const ingredient of dish.ingredients ?? []) {
      const unit = ingredient.unit ?? 'g'
      const mapKey = `${ingredient.name}\u0000${unit}`
      const priceKey = ingredient.priceKey || ingredient.name
      const entry = priceTable[priceKey]

      let line = merged.get(mapKey)
      if (!line) {
        line = {
          name: ingredient.name,
          unit,
          qty: 0,
          cost: 0,
          price: entry?.price ?? null,
          provenance: entry?.provenance ?? null,
          category: categoryOf(ingredient, priceTable),
          dishes: [],
        }
        merged.set(mapKey, line)
      }

      line.qty += Number(ingredient.qty) || 0
      if (!line.dishes.includes(dish.name)) line.dishes.push(dish.name)

      if (entry) {
        const kg = toKilograms(ingredient)
        const cost = entry.price * kg
        line.cost += cost
        totalCost += cost
      }
    }
  }

  const lines = [...merged.values()].map((line) => ({
    ...line,
    cost: Math.round(line.cost * 100) / 100,
    qtyText: formatQty(line.qty, line.unit),
  }))

  const byGroup = new Map()
  for (const line of lines) {
    if (!byGroup.has(line.category)) byGroup.set(line.category, [])
    byGroup.get(line.category).push(line)
  }

  const groups = [...byGroup.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name, 'zh')),
      cost: Math.round(items.reduce((sum, i) => sum + i.cost, 0) * 100) / 100,
    }))
    .sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.category)
      const bi = GROUP_ORDER.indexOf(b.category)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })

  return {
    groups,
    totalCost: Math.round(totalCost * 100) / 100,
    lineCount: lines.length,
    unpriced: lines.filter((l) => l.price == null).map((l) => l.name),
  }
}

/**
 * 当日营养汇总。
 *
 * dish.nutrition 是「每份」估算值（和菜谱抽屉里显示的一致），
 * 所以一人吃每道菜各一份时，直接相加就是一天的摄入。
 *
 * @param {Array<object>} dishes
 * @returns {{kcal:number, protein:number, fat:number, carbs:number, dishCount:number, macroSplit:object}}
 */
export function summarizeNutrition(dishes = []) {
  const total = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  let dishCount = 0

  for (const dish of dishes) {
    if (!dish?.nutrition) continue
    dishCount += 1
    for (const key of Object.keys(total)) {
      total[key] += Number(dish.nutrition[key]) || 0
    }
  }

  for (const key of Object.keys(total)) {
    total[key] = Math.round(total[key] * 10) / 10
  }

  // 三大宏量的供能占比，用宏量反算而非直接用 kcal —— 两者本就是各自估算的。
  const macroKcal = total.protein * 4 + total.fat * 9 + total.carbs * 4
  const pct = (v) => (macroKcal > 0 ? Math.round((v / macroKcal) * 100) : 0)

  return {
    ...total,
    dishCount,
    macroSplit: {
      protein: pct(total.protein * 4),
      fat: pct(total.fat * 9),
      carbs: pct(total.carbs * 4),
    },
  }
}

/**
 * 成人日均参考值（中国居民膳食营养素参考摄入量，轻体力活动成年人的中间取值）。
 * 只用于给出「偏少 / 合适 / 偏多」的方向性提示，不做健康建议。
 */
const DAILY_REFERENCE = { kcal: 2100, protein: 60, fat: 65, carbs: 290 }

/** 相对参考值的方向性评价。 */
export function assessNutrition(summary, reference = DAILY_REFERENCE) {
  const out = {}
  for (const key of Object.keys(reference)) {
    const ratio = summary[key] / reference[key]
    out[key] = {
      value: summary[key],
      reference: reference[key],
      ratio: Math.round(ratio * 100) / 100,
      level: ratio < 0.75 ? 'low' : ratio > 1.25 ? 'high' : 'ok',
    }
  }
  return out
}

export { DAILY_REFERENCE, GROUP_ORDER, EXTRA_CATEGORY }
