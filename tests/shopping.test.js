import { describe, expect, it } from 'vitest'

import dishesData from '../src/data/dishes.hubei.json'
import baseline from '../src/data/priceBaseline.json'
import { estimateDishCost } from '../src/engine/cost.js'
import {
  DAILY_REFERENCE,
  GROUP_ORDER,
  assessNutrition,
  buildShoppingList,
  categoryOf,
  summarizeNutrition,
} from '../src/engine/shopping.js'

const dishes = dishesData.dishes

/** 用基线价搭一张和 api/price.js 输出同形状的价格表。 */
const priceTable = Object.fromEntries(
  baseline.items.map((item) => [
    item.name,
    { price: item.price, category: item.category, provenance: 'baseline' },
  ]),
)

const byName = (name) => dishes.find((d) => d.name === name)

describe('采购清单归并', () => {
  it('同名同单位的配料跨菜相加，并记下用到它的菜', () => {
    // 排骨藕汤和番茄炒蛋都要葱
    const list = buildShoppingList([byName('排骨藕汤'), byName('番茄炒蛋')], priceTable)
    const scallion = list.groups.flatMap((g) => g.items).find((i) => i.name === '葱')

    expect(scallion.dishes).toEqual(['排骨藕汤', '番茄炒蛋'])
    expect(scallion.qty).toBe(20)
  })

  it('单位不同的同名配料不相加（鸡蛋按个，其余按克）', () => {
    const list = buildShoppingList([byName('番茄炒蛋'), byName('水蒸蛋')], priceTable)
    const eggLines = list.groups.flatMap((g) => g.items).filter((i) => i.name === '鸡蛋')

    expect(eggLines).toHaveLength(1)
    expect(eggLines[0].unit).toBe('个')
    expect(eggLines[0].qty).toBe(6)
  })

  it('清单总价和逐菜成本求和一致（容许分位舍入）', () => {
    const picks = ['热干面', '排骨藕汤', '清炒藕带', '番茄炒蛋', '银耳莲子羹'].map(byName)
    const list = buildShoppingList(picks, priceTable)
    const perDish = picks.reduce((sum, d) => sum + estimateDishCost(d, priceTable).total, 0)

    expect(Math.abs(list.totalCost - perDish)).toBeLessThan(0.05)
  })

  it('分组按菜场动线排序，荤在素前、调料最后', () => {
    const list = buildShoppingList([byName('排骨藕汤'), byName('热干面')], priceTable)
    const order = list.groups.map((g) => g.category)
    const ranks = order.map((c) => GROUP_ORDER.indexOf(c))

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    if (order.includes('调料')) {
      expect(order.at(-1)).toBe('调料')
    }
  })

  it('价格表缺项时记入 unpriced，不计成本也不抛错', () => {
    const list = buildShoppingList([byName('热干面')], {})

    expect(list.totalCost).toBe(0)
    expect(list.unpriced.length).toBe(list.lineCount)
    expect(list.groups.length).toBeGreaterThan(0)
  })

  it('空输入和脏输入返回空清单', () => {
    expect(buildShoppingList([], priceTable).groups).toEqual([])
    expect(buildShoppingList([null, undefined], priceTable).lineCount).toBe(0)
  })

  it('大用量换算成 kg 显示', () => {
    const dish = {
      name: '测试',
      servings: 2,
      ingredients: [{ name: '莲藕', qty: 1200, unit: 'g', priceKey: '莲藕' }],
    }
    const list = buildShoppingList([dish], priceTable)

    expect(list.groups[0].items[0].qtyText).toBe('1.2 kg')
  })
})

describe('配料分类', () => {
  it('优先用价格表里的 category', () => {
    expect(categoryOf({ name: '莲藕', priceKey: '莲藕' }, priceTable)).toBe(
      priceTable['莲藕'].category,
    )
  })

  it('价格表没有的调味料落到「调料」而非「其他」', () => {
    expect(categoryOf({ name: '生抽' }, priceTable)).toBe('调料')
    expect(categoryOf({ name: '胡椒粉' }, priceTable)).toBe('调料')
  })

  it('全库配料都能归类，不留大片「其他」', () => {
    const all = dishes.flatMap((d) => d.ingredients)
    const other = [...new Set(all.filter((i) => categoryOf(i, priceTable) === '其他').map((i) => i.name))]

    // 啤酒是刻意归到「其他」的唯一一项
    expect(other).toEqual(['啤酒'])
  })
})

describe('当日营养汇总', () => {
  it('每份营养直接相加', () => {
    const picks = [byName('热干面'), byName('番茄炒蛋')]
    const total = summarizeNutrition(picks)

    expect(total.kcal).toBe(
      picks.reduce((sum, d) => sum + d.nutrition.kcal, 0),
    )
    expect(total.dishCount).toBe(2)
  })

  it('宏量供能占比合计约 100%', () => {
    const total = summarizeNutrition([byName('排骨藕汤'), byName('热干面'), byName('清蒸武昌鱼')])
    const sum = total.macroSplit.protein + total.macroSplit.fat + total.macroSplit.carbs

    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1)
  })

  it('空输入返回全零且不产生 NaN', () => {
    const total = summarizeNutrition([])

    expect(total).toMatchObject({ kcal: 0, protein: 0, fat: 0, carbs: 0, dishCount: 0 })
    expect(Number.isNaN(total.macroSplit.protein)).toBe(false)
  })

  it('缺 nutrition 的菜跳过而不计入 dishCount', () => {
    const total = summarizeNutrition([byName('热干面'), { name: '无营养数据' }])

    expect(total.dishCount).toBe(1)
  })
})

describe('营养参考值对照', () => {
  it('落在参考值 ±25% 内判为合适', () => {
    const at = assessNutrition(DAILY_REFERENCE)

    for (const key of Object.keys(DAILY_REFERENCE)) {
      expect(at[key].level).toBe('ok')
      expect(at[key].ratio).toBe(1)
    }
  })

  it('明显偏少和明显偏多分别判为 low / high', () => {
    const low = assessNutrition({ kcal: 500, protein: 10, fat: 10, carbs: 50 })
    const high = assessNutrition({ kcal: 4000, protein: 200, fat: 200, carbs: 800 })

    expect(low.kcal.level).toBe('low')
    expect(high.kcal.level).toBe('high')
  })
})
