import { describe, expect, it } from 'vitest'
import dishesData from '../src/data/dishes.hubei.json'
import baseline from '../src/data/priceBaseline.json'
import { difficultyAllowed } from '../src/engine/score.js'

describe('菜谱数据', () => {
  const dishes = dishesData.dishes
  const priceNames = new Set(baseline.items.map((item) => item.name))

  it('包含 83 道唯一菜谱且所有价格键有效', () => {
    expect(dishes).toHaveLength(83)
    expect(new Set(dishes.map((dish) => dish.id)).size).toBe(dishes.length)
    for (const dish of dishes) {
      for (const ingredient of dish.ingredients) {
        if (ingredient.priceKey != null) expect(priceNames.has(ingredient.priceKey)).toBe(true)
      }
    }
  })

  it('关键菜谱的配料与做法保持一致', () => {
    const pumpkin = dishes.find((dish) => dish.id === 'nanguabing')
    const glutinous = dishes.find((dish) => dish.id === 'hongzao-nuomi')
    expect(pumpkin.ingredients.some((item) => item.name === '糯米粉')).toBe(true)
    expect(glutinous.ingredients.some((item) => item.name === '糯米粉')).toBe(true)
    expect(dishes.find((dish) => dish.id === 'niurou-fen').timeMin).toBe(80)
    expect(dishes.find((dish) => dish.id === 'youmai-tang').timeMin).toBe(45)
  })
})

describe('难度筛选', () => {
  it('低难度不包含 3 星菜，高难度仍允许简单菜', () => {
    expect(difficultyAllowed({ difficulty: 3 }, 'low')).toBe(false)
    expect(difficultyAllowed({ difficulty: 1 }, 'high')).toBe(true)
  })
})
