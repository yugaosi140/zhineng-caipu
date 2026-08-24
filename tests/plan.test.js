import { describe, expect, it } from 'vitest'

import dishesData from '../src/data/dishes.hubei.json'
import { MEAL_RULES, buildCandidates, composeLunch, planDay, rankDishes, recommendMeal } from '../src/engine/plan.js'
import { buildContext } from '../src/engine/context.js'
import { buildDemand } from '../src/engine/demand.js'

const dishes = dishesData.dishes

/** 夏日武汉：体感 33°C、湿度 80%、平原。 */
const summerCtx = buildContext(
  { temperature: 30, apparentTemperature: 33, humidity: 80, windSpeed: 8, precipitation: 0, weatherCode: 2, elevation: 70 },
  new Date('2026-08-24T08:00:00+08:00'),
)

/** 严寒：composeLunch 的环境分下限就是在这个场景下校准出来的。 */
const freezingCtx = buildContext(
  { temperature: -3, apparentTemperature: -6, humidity: 60, windSpeed: 30, precipitation: 0, weatherCode: 71, elevation: 70 },
  new Date('2026-01-10T12:00:00+08:00'),
)

function rankedFor(ctx, meal, opts = {}) {
  const demand = buildDemand(ctx)
  const { pool } = buildCandidates(dishes, { meal, difficulty: 'high', minCount: 3 })
  return rankDishes(pool, { ctx, demand, priceTable: {}, wealth: 'mid', meal, seedSalt: 'test', ...opts })
}

describe('候选池筛选', () => {
  it('只保留该餐段的菜，并受难度上限约束', () => {
    const low = buildCandidates(dishes, { meal: 'breakfast', difficulty: 'low' })
    const high = buildCandidates(dishes, { meal: 'breakfast', difficulty: 'high' })
    expect(low.pool.every((d) => d.meals.includes('breakfast'))).toBe(true)
    expect(low.pool.every((d) => d.difficulty <= 2)).toBe(true)
    expect(low.pool.length).toBeLessThan(high.pool.length)
    expect(low.relaxed).toBe(false)
  })

  it('候选不足时自动放宽难度，不给空页面', () => {
    const onlyHard = [
      { id: 'h1', name: '难菜', meals: ['lunch'], difficulty: 5, properties: {}, ingredients: [] },
    ]
    const result = buildCandidates(onlyHard, { meal: 'lunch', difficulty: 'low', minCount: 3 })
    expect(result.relaxed).toBe(true)
    expect(result.effectiveDifficulty).toBe('high')
    expect(result.pool).toHaveLength(1)
  })

  it('未知难度档位按中档处理', () => {
    expect(buildCandidates(dishes, { meal: 'lunch', difficulty: 'bogus' }).effectiveDifficulty).toBe('mid')
  })

  it('该餐段一道菜都没有时返回空池而不报错', () => {
    const result = buildCandidates(dishes, { meal: 'brunch', minCount: 3 })
    expect(result.pool).toEqual([])
    expect(result.mealPoolSize).toBe(0)
  })
})

describe('餐段规则', () => {
  it('早餐偏快手，久做的菜扣分', () => {
    const quick = { timeMin: 10, difficulty: 1, properties: { heavy: 0.3 }, tags: ['早点'] }
    const slow = { timeMin: 90, difficulty: 1, properties: { heavy: 0.3 }, tags: [] }
    expect(MEAL_RULES.breakfast.score(quick)).toBeGreaterThan(MEAL_RULES.breakfast.score(slow))
  })

  it('中餐偏丰盛', () => {
    const rich = { timeMin: 40, properties: { heavy: 0.9 }, nutrition: { protein: 30 }, tags: [] }
    const light = { timeMin: 40, properties: { heavy: 0.2 }, nutrition: { protein: 8 }, tags: [] }
    expect(MEAL_RULES.lunch.score(rich)).toBeGreaterThan(MEAL_RULES.lunch.score(light))
  })

  it('晚餐偏清淡好消化', () => {
    const light = { properties: { digestibility: 0.9, oily: 0.1, spicy: 0 }, nutrition: { kcal: 300 }, tags: ['蒸'] }
    const heavy = { properties: { digestibility: 0.2, oily: 0.9, spicy: 0.8 }, nutrition: { kcal: 900 }, tags: [] }
    expect(MEAL_RULES.dinner.score(light)).toBeGreaterThan(MEAL_RULES.dinner.score(heavy))
  })

  it('三个餐段都有中文标签', () => {
    expect([MEAL_RULES.breakfast.label, MEAL_RULES.lunch.label, MEAL_RULES.dinner.label]).toEqual(['早餐', '中餐', '晚餐'])
  })
})

describe('中餐组合', () => {
  it('按主菜、素菜、汤各取一道，不重复', () => {
    const picked = composeLunch(rankedFor(summerCtx, 'lunch'), { limit: 3 })
    expect(picked).toHaveLength(3)
    expect(new Set(picked.map((p) => p.dish.id)).size).toBe(3)
    expect(picked.every((p) => p.roleLabel)).toBe(true)
  })

  it('环境分为负的菜不占角色位', () => {
    // 校准实测：严寒场景下素菜位曾选中干煸藕丝（环境分 -1.76）——
    // 按角色找"第一个匹配的"不看分数，会把反季菜摆上桌
    const ranked = rankedFor(freezingCtx, 'lunch')
    const ganbian = ranked.find((r) => r.dish.name === '干煸藕丝')
    expect(ganbian.breakdown.environment).toBeLessThan(-0.3)

    const picked = composeLunch(ranked, { limit: 3 })
    expect(picked.every((p) => p.breakdown.environment >= -0.3)).toBe(true)
    expect(picked.some((p) => p.dish.name === '干煸藕丝')).toBe(false)
  })

  it('全库都不合格时放开下限，避免整餐空白', () => {
    const bad = [
      { dish: { id: 'x', name: '反季菜' }, breakdown: { environment: -5 }, total: -5 },
      { dish: { id: 'y', name: '也反季' }, breakdown: { environment: -4 }, total: -4 },
    ]
    const picked = composeLunch(bad, { limit: 3 })
    expect(picked.length).toBeGreaterThan(0)
    expect(picked[0].roleLabel).toBe('勉强可选')
  })

  it('候选为空时返回空数组', () => {
    expect(composeLunch([], { limit: 3 })).toEqual([])
  })
})

describe('单餐推荐', () => {
  it('结果按总分降序，且都属于该餐段', () => {
    const result = recommendMeal(dishes, {
      ctx: summerCtx,
      demand: buildDemand(summerCtx),
      priceTable: {},
      meal: 'breakfast',
      difficulty: 'mid',
      limit: 3,
      seedSalt: 'test',
    })
    expect(result.items).toHaveLength(3)
    expect(result.label).toBe('早餐')
    expect(result.items.every((i) => i.dish.meals.includes('breakfast'))).toBe(true)
    const totals = result.items.map((i) => i.total)
    expect([...totals].sort((a, b) => b - a)).toEqual(totals)
  })
})

describe('一天三餐', () => {
  const plan = planDay(dishes, {
    ctx: summerCtx,
    demand: buildDemand(summerCtx),
    priceTable: {},
    wealth: 'mid',
    difficulty: 'mid',
    cityId: 'wuhan',
    seedSalt: 'wuhan:2026-08-24',
  })

  it('三餐齐全，中餐走组合', () => {
    expect(Object.keys(plan)).toEqual(['breakfast', 'lunch', 'dinner'])
    expect(plan.lunch.composed).toBe(true)
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      expect(plan[meal].items.length).toBeGreaterThan(0)
    }
  })

  it('每道菜都带一句推荐理由', () => {
    for (const meal of ['breakfast', 'lunch', 'dinner']) {
      expect(plan[meal].items.every((i) => typeof i.reason === 'string')).toBe(true)
    }
  })

  it('同城同日结果可复现', () => {
    const again = planDay(dishes, {
      ctx: summerCtx,
      demand: buildDemand(summerCtx),
      priceTable: {},
      wealth: 'mid',
      difficulty: 'mid',
      cityId: 'wuhan',
      seedSalt: 'wuhan:2026-08-24',
    })
    expect(again.breakfast.items.map((i) => i.dish.id)).toEqual(plan.breakfast.items.map((i) => i.dish.id))
  })

  it('选武汉时早餐能选进武汉代表菜', () => {
    const wuhanSpecialties = ['热干面', '三鲜豆皮', '糊汤粉', '面窝', '欢喜坨', '重油烧梅']
    expect(plan.breakfast.items.some((i) => wuhanSpecialties.includes(i.dish.name))).toBe(true)
  })

  it('地域加权不至于压过天气引擎', () => {
    // 地域分刻意压在 ±1 以内：若给到 2 以上，武汉早餐会永远是那六样
    for (const item of plan.breakfast.items) {
      expect(Math.abs(item.breakdown.region)).toBeLessThan(1)
    }
  })
})
