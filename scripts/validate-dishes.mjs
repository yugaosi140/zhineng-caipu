import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dishesData = JSON.parse(fs.readFileSync(path.join(root, 'src/data/dishes.hubei.json'), 'utf8'))
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'src/data/priceBaseline.json'), 'utf8'))

const dimensions = ['heavy', 'digestibility', 'spicy', 'warming', 'soupy', 'oily', 'hydrating']
const meals = new Set(['breakfast', 'lunch', 'dinner'])
const priceNames = new Set(baseline.items.map((item) => item.name))
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
}

for (const message of warnings) console.warn(`WARN ${message}`)
for (const message of errors) console.error(`ERROR ${message}`)

console.log(`Validated ${dishes.length} dishes and ${priceNames.size} baseline prices`)
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`)
if (errors.length) process.exitCode = 1