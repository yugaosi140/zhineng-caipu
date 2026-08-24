/**
 * 三餐组配：餐段规则 + 候选过滤 + 组合生成。
 *
 * 对应需求第 6 点：早餐尽量简单、中午丰盛、晚上消食为主。
 */

import { scoreDish, difficultyAllowed, buildReason } from './score.js'

/**
 * 餐段规则。每条给出加分函数和人话备注。
 *
 * 分值和 environmentScore 同尺度（单维贡献约 ±1），
 * 所以餐段契合能和环境契合抗衡，但不会完全压过它。
 */
export const MEAL_RULES = {
  breakfast: {
    key: 'breakfast',
    label: '早餐',
    score(dish) {
      let s = 0

      // 早餐要快，超过 25 分钟明显扣分
      const t = dish.timeMin ?? 30
      if (t <= 15) s += 1.0
      else if (t <= 25) s += 0.5
      else s -= (t - 25) / 20

      // 湖北早点是这个 app 的特色，明确加权
      if ((dish.tags || []).includes('早点')) s += 1.5

      // 早餐不宜太丰盛
      s -= (dish.properties?.heavy ?? 0.5) * 0.8

      // 难度高的菜早上没人做
      s -= Math.max(0, (dish.difficulty ?? 3) - 3) * 0.6

      return s
    },
    notes(dish) {
      const out = []
      if ((dish.tags || []).includes('早点')) out.push('湖北经典早点')
      if ((dish.timeMin ?? 99) <= 15) out.push(`${dish.timeMin} 分钟就能上桌`)
      return out
    },
  },

  lunch: {
    key: 'lunch',
    label: '中餐',
    score(dish) {
      let s = 0

      // 中午要丰盛
      s += (dish.properties?.heavy ?? 0.5) * 1.0

      // 中午有时间做，允许高难度，但极耗时的仍轻微扣分
      const t = dish.timeMin ?? 30
      if (t > 90) s -= (t - 90) / 60

      // 蛋白质足的加分
      const p = dish.nutrition?.protein ?? 0
      if (p >= 25) s += 0.4

      return s
    },
    notes(dish) {
      const out = []
      if ((dish.properties?.heavy ?? 0) >= 0.7) out.push('够丰盛，适合正餐')
      if ((dish.nutrition?.protein ?? 0) >= 30) out.push('蛋白质充足')
      return out
    },
  },

  dinner: {
    key: 'dinner',
    label: '晚餐',
    score(dish) {
      let s = 0

      // 晚上以消食为主
      s += (dish.properties?.digestibility ?? 0.5) * 1.2
      s -= (dish.properties?.oily ?? 0.5) * 0.8

      // 热量超过 600 递减
      const kcal = dish.nutrition?.kcal ?? 400
      if (kcal > 600) s -= (kcal - 600) / 250

      // 蒸、清炒、汤、凉拌加分
      const tags = dish.tags || []
      if (tags.some((t) => ['蒸', '清炒', '汤', '凉拌'].includes(t))) s += 0.5

      // 晚上少吃辣。湿度高时 demand 会把辣加回来，这里只做温和抑制
      s -= (dish.properties?.spicy ?? 0) * 0.3

      return s
    },
    notes(dish) {
      const out = []
      if ((dish.properties?.digestibility ?? 0) >= 0.7) out.push('清淡好消化，不压肠胃')
      const kcal = dish.nutrition?.kcal ?? 0
      if (kcal > 0 && kcal <= 400) out.push(`约 ${kcal} kcal，晚间负担小`)
      return out
    },
  },
}

/** 中餐组合的角色配额：1 主菜 + 1 素菜 + 1 汤。 */
const LUNCH_COMPOSITION = [
  {
    role: 'main',
    label: '主菜',
    match: (d) => (d.properties?.heavy ?? 0) >= 0.6,
  },
  {
    role: 'veg',
    label: '素菜',
    match: (d) => (d.tags || []).includes('素菜') || (d.properties?.heavy ?? 1) < 0.5,
  },
  {
    role: 'soup',
    label: '汤',
    match: (d) => (d.properties?.soupy ?? 0) >= 0.6,
  },
]

const DIFFICULTY_LADDER = ['low', 'mid', 'high']

/**
 * 候选池：按餐段 + 难度过滤。
 * 结果不足 minCount 时自动放宽难度一档，并标记 relaxed（对应需求第 5 点，不给空页面）。
 */
export function buildCandidates(dishes, { meal, difficulty = 'mid', minCount = 3 }) {
  const byMeal = dishes.filter((d) => (d.meals || []).includes(meal))

  let level = DIFFICULTY_LADDER.includes(difficulty) ? difficulty : 'mid'
  let pool = byMeal.filter((d) => difficultyAllowed(d, level))
  let relaxed = false

  let idx = DIFFICULTY_LADDER.indexOf(level)
  while (pool.length < minCount && idx < DIFFICULTY_LADDER.length - 1) {
    idx += 1
    level = DIFFICULTY_LADDER[idx]
    pool = byMeal.filter((d) => difficultyAllowed(d, level))
    relaxed = true
  }

  return { pool, effectiveDifficulty: level, relaxed, mealPoolSize: byMeal.length }
}

/** 打分并排序。 */
export function rankDishes(
  pool,
  { ctx, demand, priceTable, wealth = 'mid', meal, cityId = '', seedSalt = '' },
) {
  const mealRule = MEAL_RULES[meal] ?? null
  return pool
    .map((dish) => {
      const scored = scoreDish(dish, { ctx, demand, priceTable, wealth, mealRule, cityId, seedSalt })
      return { ...scored, reason: buildReason(scored) }
    })
    .sort((a, b) => b.total - a.total)
}

/**
 * 角色位的环境分下限。
 *
 * 校准实测：严寒场景下素菜位选中了干煸藕丝（环境分 -1.76），
 * 因为按角色找"第一个匹配的"不看分数。环境分为负说明这道菜和当下天气相冲，
 * 宁可让该角色空缺，也不该把反季菜摆上桌。
 */
const ROLE_ENV_FLOOR = -0.3

/**
 * 中餐组合：按主菜/素菜/汤各取一道最高分。
 *
 * 角色位只接受环境分不低于 ROLE_ENV_FLOOR 的菜；某角色无合格候选时留空，
 * 再用剩余高分菜补位到 limit（补位同样要过下限），保证既不摆反季菜也不空页面。
 */
export function composeLunch(ranked, { limit = 3 } = {}) {
  const picked = []
  const used = new Set()

  const qualified = (r) => r.breakdown.environment >= ROLE_ENV_FLOOR

  for (const slot of LUNCH_COMPOSITION) {
    const hit = ranked.find((r) => !used.has(r.dish.id) && slot.match(r.dish) && qualified(r))
    if (!hit) continue
    used.add(hit.dish.id)
    picked.push({ ...hit, role: slot.role, roleLabel: slot.label })
  }

  // 补位：优先补合格的高分菜
  for (const r of ranked) {
    if (picked.length >= limit) break
    if (used.has(r.dish.id) || !qualified(r)) continue
    used.add(r.dish.id)
    picked.push({ ...r, role: 'extra', roleLabel: '加菜' })
  }

  // 全库都不合格时（极端天气 + 菜品少）才放开下限，避免整餐空白
  if (!picked.length) {
    for (const r of ranked.slice(0, limit)) {
      used.add(r.dish.id)
      picked.push({ ...r, role: 'extra', roleLabel: '勉强可选' })
    }
  }

  return picked
}

/** 单餐推荐。 */
export function recommendMeal(dishes, opts) {
  const { meal, difficulty = 'mid', limit = 3 } = opts
  const { pool, effectiveDifficulty, relaxed, mealPoolSize } = buildCandidates(dishes, {
    meal,
    difficulty,
    minCount: limit,
  })
  const ranked = rankDishes(pool, { ...opts, meal })

  return {
    meal,
    label: MEAL_RULES[meal]?.label ?? meal,
    items: ranked.slice(0, limit),
    ranked,
    poolSize: pool.length,
    mealPoolSize,
    effectiveDifficulty,
    relaxed,
  }
}

/** 一天三餐。中餐输出组合，早晚餐输出候选列表。 */
export function planDay(
  dishes,
  { ctx, demand, priceTable, wealth = 'mid', difficulty = 'mid', cityId = '', seedSalt = '' },
) {
  const base = { ctx, demand, priceTable, wealth, difficulty, cityId, seedSalt }

  const breakfast = recommendMeal(dishes, { ...base, meal: 'breakfast', limit: 3 })
  const lunch = recommendMeal(dishes, { ...base, meal: 'lunch', limit: 3 })
  const dinner = recommendMeal(dishes, { ...base, meal: 'dinner', limit: 3 })

  return {
    breakfast,
    lunch: { ...lunch, items: composeLunch(lunch.ranked, { limit: 3 }), composed: true },
    dinner,
  }
}

