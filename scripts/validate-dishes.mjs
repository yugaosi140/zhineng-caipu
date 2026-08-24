import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { toKilograms } from '../src/engine/cost.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 第一个参数可指定待校验的菜谱文件，默认校验仓库里的正式数据。
// 留这个入口是为了能用故意写坏的样本验证校验器本身确实会报错。
const dishesPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(root, 'src/data/dishes.hubei.json')

const dishesData = JSON.parse(fs.readFileSync(dishesPath, 'utf8'))
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'src/data/priceBaseline.json'), 'utf8'))

const dimensions = ['heavy', 'digestibility', 'spicy', 'warming', 'soupy', 'oily', 'hydrating']
const meals = new Set(['breakfast', 'lunch', 'dinner'])
const priceNames = new Set(baseline.items.map((item) => item.name))

/**
 * 干货泡发后重量翻数倍，按干重判断"主料太少"会误报。
 * 银耳 15g 泡开接近 100g，是一道甜汤的正常用量。
 */
const REHYDRATES = new Set(['银耳', '干香菇', '干木耳', '莲子', '红枣', '薏米', '梅干菜', '绿豆', '大豆', '糯米', '籼米', '小米', '面粉', '糯米粉'])
const errors = []
const warnings = []

function error(message) {
  errors.push(message)
}

function warning(message) {
  warnings.push(message)
}

if (!Array.isArray(dishesData.dishes)) error('dishes.hubei.json: dishes must be an array')
if (!Array.isArray(baseline.items)) error('priceBaseline.json: items must be an array')

const dishes = dishesData.dishes ?? []
const ids = new Set()
const names = new Set()

for (const dish of dishes) {
  const label = dish.id || dish.name || '<unknown dish>'
  if (!dish.id || ids.has(dish.id)) error(`${label}: duplicate or missing id`)
  ids.add(dish.id)
  if (!dish.name || names.has(dish.name)) error(`${label}: duplicate or missing name`)
  names.add(dish.name)

  if (!Array.isArray(dish.meals) || !dish.meals.length) error(`${label}: meals is empty`)
  for (const meal of dish.meals ?? []) {
    if (!meals.has(meal)) error(`${label}: unknown meal ${meal}`)
  }
  if (!Number.isInteger(dish.difficulty) || dish.difficulty < 1 || dish.difficulty > 5) {
    error(`${label}: difficulty must be an integer from 1 to 5`)
  }
  if (!Number.isFinite(dish.timeMin) || dish.timeMin <= 0) error(`${label}: invalid timeMin`)
  if (!Number.isFinite(dish.servings) || dish.servings <= 0) error(`${label}: invalid servings`)

  if (!Array.isArray(dish.ingredients) || !dish.ingredients.length) error(`${label}: ingredients is empty`)
  for (const ingredient of dish.ingredients ?? []) {
    if (!ingredient.name || !Number.isFinite(ingredient.qty) || ingredient.qty <= 0 || !ingredient.unit) {
      error(`${label}: invalid ingredient ${JSON.stringify(ingredient)}`)
    }
    if (ingredient.priceKey != null && !priceNames.has(ingredient.priceKey)) {
      error(`${label}: unknown priceKey ${ingredient.priceKey}`)
    }
  }

  for (const dimension of dimensions) {
    const value = dish.properties?.[dimension]
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      error(`${label}: properties.${dimension} must be between 0 and 1`)
    }
  }

  const nutrition = dish.nutrition
  if (!nutrition || !['kcal', 'protein', 'fat', 'carbs'].every((key) => Number.isFinite(nutrition[key]))) {
    error(`${label}: incomplete nutrition`)
  } else {
    for (const key of ['kcal', 'protein', 'fat', 'carbs']) {
      if (nutrition[key] < 0) error(`${label}: nutrition.${key} cannot be negative`)
    }
    const macroKcal = nutrition.protein * 4 + nutrition.fat * 9 + nutrition.carbs * 4
    if (Math.abs(macroKcal - nutrition.kcal) > Math.max(120, nutrition.kcal * 0.4)) {
      warning(`${label}: macro calories differ from kcal estimate`)
    }
  }

  if (!Array.isArray(dish.recipe?.steps) || !dish.recipe.steps.length) error(`${label}: recipe.steps is empty`)
  if (!dish.recipe?.tips) warning(`${label}: recipe.tips is missing`)
  if (!Array.isArray(dish.recipe?.cookware) || !dish.recipe.cookware.length) {
    warning(`${label}: recipe.cookware is missing`)
  }

  /*
   * 以下是"看起来合法但明显没认真填"的检查。
   *
   * 上一版校验只看 qty > 0，所以 64 道菜的每一味配料都填 150g 也能通过；
   * 80 道菜共用同一句 tips 同样查不出来。数值范围合法不等于数据可信，
   * 这几条专门拦这类批量占位内容。
   */

  // 一道菜所有配料用量完全相同，基本可以断定是批量填充的占位值。
  // 单配料菜（清蒸南瓜、小米粥）天然只有一个值，不算问题。
  const quantities = (dish.ingredients ?? []).map((i) => `${i.qty}${i.unit}`)
  if (quantities.length > 2 && new Set(quantities).size === 1) {
    error(`${label}: every ingredient has the same quantity ${quantities[0]}, looks like placeholder data`)
  }

  // 主料用量。整道菜换算下来没有一味超过 40g 的，多半是量没填对。
  //
  // 换算必须走 toKilograms：只看 unit === 'g' 会把「3 个鸡蛋」算成 0g，
  // 水蒸蛋这类以蛋为主料的菜会被误报。干货泡发后体积涨好几倍，
  // 按干重判断同样会误报，所以单独放行。
  const maxGram = Math.max(
    0,
    ...(dish.ingredients ?? []).map((i) => toKilograms(i) * 1000),
  )
  const driedBulk = (dish.ingredients ?? []).some((i) => REHYDRATES.has(i.name))
  if (maxGram > 0 && maxGram < 40 && !driedBulk) {
    warning(`${label}: largest ingredient is only ${Math.round(maxGram)}g, main ingredient may be missing`)
  }

  // 蛋类按"个"计。2 人份写 1 个蛋、或超过 8 个，都不合常理。
  for (const ingredient of dish.ingredients ?? []) {
    if (ingredient.unit !== '个') continue
    if (ingredient.qty > 8) {
      warning(`${label}: ${ingredient.name} ${ingredient.qty} 个 seems too many for ${dish.servings} servings`)
    }
  }

  // 炊具要和做法标签对得上。汤菜标了只有炒锅，说明炊具是套模板填的。
  const cookware = dish.recipe?.cookware ?? []
  const tags = dish.tags ?? []
  if (cookware.length) {
    if (tags.includes('蒸') && !cookware.includes('蒸锅')) {
      warning(`${label}: tagged 蒸 but cookware has no 蒸锅`)
    }
    if (tags.includes('汤') && !cookware.some((c) => c === '汤锅' || c === '炒锅')) {
      warning(`${label}: tagged 汤 but cookware has no 汤锅`)
    }
    if (tags.includes('烤') && !cookware.includes('烤箱')) {
      warning(`${label}: tagged 烤 but cookware has no 烤箱`)
    }
  }
}

/*
 * 跨菜检查。
 */

/*
 * 模板 tips 检查。
 *
 * 不能只比整句是否相同。历史数据里那 80 句模板是「<菜名>按家常口味调味，食材
 * 新鲜时风味更好。」—— 每句都因菜名不同而唯一，比整句永远查不出来。
 * 所以把菜名去掉再比：剩下的骨架一样，就是同一个模板套出来的。
 */
function tipSkeleton(tip, dishName) {
  return tip.split(dishName).join('').trim()
}

const tipCounts = new Map()
for (const dish of dishes) {
  const tip = dish.recipe?.tips
  if (!tip) continue
  const skeleton = tipSkeleton(tip, dish.name)
  if (!skeleton) continue
  if (!tipCounts.has(skeleton)) tipCounts.set(skeleton, [])
  tipCounts.get(skeleton).push(dish.name)
}
for (const [skeleton, users] of tipCounts) {
  if (users.length > 1) {
    error(
      `templated recipe.tips across ${users.length} dishes (${users.slice(0, 3).join('/')}…): ${skeleton.slice(0, 30)}`,
    )
  }
}

// 工具输出被误写进数据文件时留下的截断标记。
const rawText = fs.readFileSync(dishesPath, 'utf8')
if (/tokens truncated|…\d+ tokens/.test(rawText)) {
  error('dishes.hubei.json contains a truncation marker — a tool output was written into the data')
}

for (const message of warnings) console.warn(`WARN ${message}`)
for (const message of errors) console.error(`ERROR ${message}`)

console.log(`Validated ${dishes.length} dishes and ${priceNames.size} baseline prices`)
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`)
if (errors.length) process.exitCode = 1
