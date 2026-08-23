/**
 * 环境画像：把 Open-Meteo 的原始读数翻译成"想吃什么"这个层面的可读维度。
 *
 * 纯函数，无副作用，方便单测。
 */

/** WMO weather_code 归类。https://open-meteo.com 文档中的 weather code 表。 */
const WMO = {
  clear: [0, 1],
  cloudy: [2, 3],
  fog: [45, 48],
  drizzle: [51, 53, 55, 56, 57],
  rain: [61, 63, 65, 66, 67, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  thunder: [95, 96, 99],
}

function wmoGroup(code) {
  for (const [name, codes] of Object.entries(WMO)) {
    if (codes.includes(code)) return name
  }
  return 'unknown'
}

/**
 * 体感带。用体感温度而非气温 —— 40°C 体感和 34°C 气温对食欲的影响完全不同。
 */
export function feelBand(apparent) {
  if (apparent == null) return { key: 'mild', label: '温和' }
  if (apparent >= 35) return { key: 'scorching', label: '酷热' }
  if (apparent >= 28) return { key: 'hot', label: '热' }
  if (apparent >= 18) return { key: 'mild', label: '温和' }
  if (apparent >= 10) return { key: 'cool', label: '凉' }
  return { key: 'cold', label: '冷' }
}

export function humidityBand(rh) {
  if (rh == null) return { key: 'normal', label: '适中' }
  if (rh > 75) return { key: 'humid', label: '潮湿' }
  if (rh < 40) return { key: 'dry', label: '干燥' }
  return { key: 'normal', label: '适中' }
}

/** 风速单位为 km/h（Open-Meteo 默认）。 */
export function windBand(kmh) {
  if (kmh == null) return { key: 'calm', label: '微风' }
  if (kmh >= 25) return { key: 'strong', label: '大风' }
  if (kmh >= 12) return { key: 'breezy', label: '有风' }
  return { key: 'calm', label: '微风' }
}

export function precipBand(mm, code) {
  const group = wmoGroup(code)
  if (group === 'thunder') return { key: 'storm', label: '雷雨' }
  if (group === 'snow') return { key: 'snow', label: '雪' }
  if (mm >= 2.5 || group === 'rain') return { key: 'rain', label: '有雨' }
  if (mm > 0 || group === 'drizzle') return { key: 'drizzle', label: '小雨' }
  return { key: 'none', label: '无降水' }
}

/**
 * 海拔带。在湖北这一维是真有意义的：武汉 25m…511 tokens truncated…像。
 *
 * @param {object} weather Open-Meteo current 块 + elevation
 * @param {Date} [now]
 */
export function buildContext(weather = {}, now = new Date()) {
  const {
    temperature = null,
    apparentTemperature = null,
    humidity = null,
    windSpeed = null,
    precipitation = 0,
    weatherCode = 0,
    elevation = null,
  } = weather

  // 体感缺失时退回气温，保证画像不因单字段缺失而失真。
  const feelSource = apparentTemperature ?? temperature

  return {
    raw: { temperature, apparentTemperature, humidity, windSpeed, precipitation, weatherCode, elevation },
    feel: feelBand(feelSource),
    humidity: humidityBand(humidity),
    wind: windBand(windSpeed),
    precip: precipBand(precipitation, weatherCode),
    altitude: altitudeBand(elevation),
    boilingPoint: boilingPoint(elevation),
    sky: wmoGroup(weatherCode),
    season: season(now),
    solarTerm: solarTerm(now),
    plumRain: isPlumRain(now),
    dogDays: isDogDays(now),
    date: now,
  }
}

/** 一句话人话描述，用于推荐理由的开头。 */
export function describeContext(ctx) {
  const parts = []
  const t = ctx.raw.apparentTemperature ?? ctx.raw.temperature
  if (t != null) parts.push(`体感 ${Math.round(t)}°C`)
  if (ctx.raw.humidity != null) parts.push(`湿度 ${Math.round(ctx.raw.humidity)}%`)
  if (ctx.wind.key !== 'calm') parts.push(ctx.wind.label)
  if (ctx.precip.key !== 'none') parts.push(ctx.precip.label)
  if (ctx.altitude.key !== 'low') parts.push(`${ctx.altitude.label} ${Math.round(ctx.raw.elevation)}m`)
  if (ctx.plumRain) parts.push('梅雨季')
  else if (ctx.dogDays) parts.push('三伏')
  return parts.join('、')
}
