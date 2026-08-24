import { describe, expect, it } from 'vitest'

import { WEALTH_TIERS, costFit, estimateDishCost, toKilograms } from '../src/engine/cost.js'

describe('单位换算', () => {
  it('克和公斤直接换算', () => {
    expect(toKilograms({ qty: 150, unit: 'g' })).toBeCloseTo(0.15)
    expect(toKilograms({ qty: 2, unit: 'kg' })).toBe(2)
  })

  it('食材名的单件重量优先于通用单位表', () => {
    // 鸡蛋在 ITEM_GRAM 里是 55g，通用表的「个」是 60g，应取 55
    expect(toKilograms({ name: '鸡蛋', qty: 2, unit: '个' })).toBeCloseTo(0.11)
  })

  it('克为单位时不套用单件重量', () => {
    // 这条是上一条的边界：写了「100g 鸡蛋」就该按 100g 算，不是 100 个鸡蛋
    expect(toKilograms({ name: '鸡蛋', qty: 100, unit: 'g' })).toBeCloseTo(0.1)
  })

  it('无效用量返回 0', () => {
    expect(toKilograms({ qty: 0, unit: 'g' })).toBe(0)
    expect(toKilograms({ qty: -5, unit: 'g' })).toBe(0)
    expect(toKilograms({})).toBe(0)
    expect(toKilograms()).toBe(0)
  })

  it('无法识别的单位返回 0 而不是 NaN', () => {
    expect(toKilograms({ name: '某物', qty: 3, unit: '坨' })).toBe(0)
  })
})

describe('菜品成本估算', () => {
  const priceTable = {
    猪肉: { price: 30, unit: '元/公斤', provenance: 'live', category: '畜产品' },
    莲藕: { price: 8, unit: '元/公斤', provenance: 'baseline', category: '蔬菜' },
  }

  it('按公斤单价累加并算出每份成本', () => {
    const dish = {
      servings: 2,
      ingredients: [
        { name: '猪肉', qty: 500, unit: 'g', priceKey: '猪肉' },
        { name: '莲藕', qty: 500, unit: 'g', priceKey: '莲藕' },
      ],
    }
    const cost = estimateDishCost(dish, priceTable)
    expect(cost.total).toBeCloseTo(19) // 15 + 4
    expect(cost.perServing).toBeCloseTo(9.5)
    expect(cost.matched).toBe(2)
  })

  it('provenance 取参与计算的最弱一档，不夸大数据质量', () => {
    // 一道菜里只要有一项是基线估算，整道菜就不能标成实时价
    const dish = {
      servings: 1,
      ingredients: [
        { name: '猪肉', qty: 100, unit: 'g', priceKey: '猪肉' },
        { name: '莲藕', qty: 100, unit: 'g', priceKey: '莲藕' },
      ],
    }
    expect(estimateDishCost(dish, priceTable).provenance).toBe('baseline')
  })

  it('priceKey 为 null 的调料不计入未匹配清单', () => {
    // 葱花、生抽这类没有对应菜价的配料是有意标 null 的，不该报缺失
    const dish = {
      servings: 2,
      ingredients: [
        { name: '猪肉', qty: 200, unit: 'g', priceKey: '猪肉' },
        { name: '葱花', qty: 10, unit: 'g', priceKey: null },
      ],
    }
    const cost = estimateDishCost(dish, priceTable)
    expect(cost.unmatched).toEqual([])
    expect(cost.matched).toBe(1)
  })

  it('价格表里找不到的配料记入未匹配', () => {
    const dish = {
      servings: 2,
      ingredients: [{ name: '穿山甲', qty: 200, unit: 'g', priceKey: '穿山甲' }],
    }
    expect(estimateDishCost(dish, priceTable).unmatched).toEqual(['穿山甲'])
  })

  it('空价格表不抛错，成本按 0 计', () => {
    // 菜价未加载时 UI 仍要能出推荐，成本项自然退出
    const dish = { servings: 2, ingredients: [{ name: '猪肉', qty: 200, unit: 'g', priceKey: '猪肉' }] }
    const cost = estimateDishCost(dish, {})
    expect(cost.total).toBe(0)
    expect(cost.provenance).toBe('unknown')
  })

  it('份数缺失或非法时按 2 人份兜底', () => {
    const dish = { ingredients: [{ name: '猪肉', qty: 1, unit: 'kg', priceKey: '猪肉' }] }
    expect(estimateDishCost(dish, priceTable).perServing).toBeCloseTo(15)
  })
})

describe('预算契合', () => {
  it('成本未知时不影响总分', () => {
    expect(costFit(0, 'mid').score).toBe(0)
    expect(costFit(-1, 'mid').score).toBe(0)
  })

  it('落在甜点价位拿满分', () => {
    expect(costFit(WEALTH_TIERS.mid.sweet, 'mid').score).toBeCloseTo(1.2)
  })

  it('低于下限算「很省」，不加分也不扣分', () => {
    const fit = costFit(2, 'mid')
    expect(fit.fit).toBe('under')
    expect(fit.score).toBe(0)
  })

  it('超出上限按超出比例扣分，且封顶 -3', () => {
    expect(costFit(22, 'mid').fit).toBe('in')
    expect(costFit(30, 'mid').fit).toBe('over')
    expect(costFit(30, 'mid').score).toBeLessThan(0)
    // 再贵也不能让单项扣分压死其他所有维度
    expect(costFit(9999, 'mid').score).toBe(-3)
  })

  it('高档没有上限，贵菜不扣分', () => {
    expect(costFit(1000, 'high').fit).toBe('in')
  })

  it('未知档位退回中档', () => {
    expect(costFit(WEALTH_TIERS.mid.sweet, '不存在的档位').score).toBeCloseTo(1.2)
  })
})
