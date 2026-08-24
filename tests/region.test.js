import { describe, expect, it } from 'vitest'

import dishesData from '../src/data/dishes.hubei.json'
import citiesData from '../src/data/cities.hubei.json'
import {
  CITY_LABELS,
  CITY_SPECIALTIES,
  REGION_TO_CITY,
  cityOfDish,
  regionalFit,
} from '../src/engine/region.js'

const dishes = dishesData.dishes

describe('菜谱归属市州', () => {
  it('区县级归属能落到所属市（黄陂属武汉，公安属荆州）', () => {
    expect(cityOfDish({ region: '黄陂' })).toBe('wuhan')
    expect(cityOfDish({ region: '公安' })).toBe('jingzhou')
    expect(cityOfDish({ region: '洪湖' })).toBe('jingzhou')
  })

  it('无法归类时返回 null 而不抛错', () => {
    expect(cityOfDish({ region: '火星' })).toBeNull()
    expect(cityOfDish({})).toBeNull()
    expect(cityOfDish(null)).toBeNull()
  })

  it('数据里出现的每个 region 都能映射到市州', () => {
    const unmapped = [...new Set(dishes.map((d) => d.region))].filter((r) => !REGION_TO_CITY[r])
    expect(unmapped).toEqual([])
  })
})

describe('地域契合分', () => {
  it('代表菜在对应市州加分，换城市则不加', () => {
    const reganmian = dishes.find((d) => d.name === '热干面')
    expect(regionalFit(reganmian, { cityId: 'wuhan', meal: 'breakfast' }).kind).toBe('specialty')
    expect(regionalFit(reganmian, { cityId: 'enshi', meal: 'breakfast' }).score).toBe(0)
  })

  it('同地归属加分低于代表菜', () => {
    const specialty = regionalFit({ name: '热干面', region: '武汉' }, { cityId: 'wuhan', meal: 'breakfast' })
    const sameRegion = regionalFit({ name: '炒豆丝', region: '黄陂' }, { cityId: 'wuhan', meal: 'breakfast' })
    expect(specialty.kind).toBe('specialty')
    expect(sameRegion.kind).toBe('same-region')
    expect(sameRegion.score).toBeLessThan(specialty.score)
    expect(sameRegion.score).toBeGreaterThan(0)
  })

  it('早餐的地域加权最强，晚餐最弱', () => {
    const dish = dishes.find((d) => d.name === '热干面')
    const breakfast = regionalFit(dish, { cityId: 'wuhan', meal: 'breakfast' }).score
    const lunch = regionalFit(dish, { cityId: 'wuhan', meal: 'lunch' }).score
    const dinner = regionalFit(dish, { cityId: 'wuhan', meal: 'dinner' }).score
    expect(breakfast).toBeGreaterThan(lunch)
    expect(lunch).toBeGreaterThan(dinner)
  })

  it('未选市州或市州无效时不加分', () => {
    const dish = dishes.find((d) => d.name === '热干面')
    expect(regionalFit(dish, { cityId: '', meal: 'breakfast' }).score).toBe(0)
    expect(regionalFit(dish, { cityId: 'paris', meal: 'breakfast' }).score).toBe(0)
    expect(regionalFit(dish).score).toBe(0)
  })

  it('地域分压在 1 以内，不能盖过天气引擎', () => {
    // 注释里写明的设计约束：地域是"同分时优先本地"，不是"本地一票通过"
    for (const cityId of Object.keys(CITY_LABELS)) {
      for (const meal of ['breakfast', 'lunch', 'dinner']) {
        for (const dish of dishes) {
          expect(regionalFit(dish, { cityId, meal }).score).toBeLessThan(1)
        }
      }
    }
  })

  it('命中时给出非空说明，未命中时说明为空', () => {
    const hit = regionalFit(dishes.find((d) => d.name === '热干面'), { cityId: 'wuhan', meal: 'breakfast' })
    expect(hit.note).toContain('武汉')
    expect(regionalFit(dishes[0], { cityId: '' }).note).toBe('')
  })
})

describe('地域数据自洽', () => {
  it('代表菜名必须能在菜谱库里找到', () => {
    const names = new Set(dishes.map((d) => d.name))
    const missing = []
    for (const [cityId, list] of Object.entries(CITY_SPECIALTIES)) {
      for (const name of list) {
        if (!names.has(name)) missing.push(`${cityId}: ${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('每个市州都有中文名标签', () => {
    for (const cityId of Object.keys(CITY_SPECIALTIES)) {
      expect(CITY_LABELS[cityId]).toBeTruthy()
    }
  })

  it('城市列表与地域标签一一对应', () => {
    const cityIds = citiesData.cities.map((c) => c.id).sort()
    expect(Object.keys(CITY_LABELS).sort()).toEqual(cityIds)
  })
})
