/**
 * 湖北地域口味与代表菜加权。
 * 城市是推荐上下文的一部分：天气决定“适不适合现在吃”，地域决定“是不是这里该吃的”。
 */
const CITY_SPECIALTIES = {
  wuhan: ['热干面', '三鲜豆皮', '糊汤粉', '面窝', '欢喜坨', '重油烧梅'],
  huangshi: ['黄石港饼'],
  shiyan: ['十堰懒豆腐', '山药排骨汤'],
  yichang: ['酸辣粉', '红烧鮰鱼'],
  xiangyang: ['牛肉粉', '襄阳牛油面'],
  ezhou: ['清蒸武昌鱼', '鄂州武昌鱼豆腐煲'],
  jingmen: ['钟祥蟠龙菜'],
  xiaogan: ['汽水包', '鳝鱼粉', '蛋酒', '米酒汤圆'],
  jingzhou: ['公安锅盔', '荆沙鱼糕', '酸菜财鱼', '皮条鳝鱼', '清炒藕带'],
  huanggang: ['黄州东坡饼', '东坡肉', '梅菜扣肉', '米粑'],
  xianning: ['板栗炖鸭'],
  suizhou: ['随州香菇炖鸡'],
  enshi: ['恩施合渣', '恩施炕洋芋'],
  xiantao: ['沔阳三蒸'],
  qianjiang: ['油焖大虾'],
  tianmen: ['珍珠圆子', '粉蒸排骨'],
  shennongjia: ['山药排骨汤', '腊肉']
}

const CITY_LABELS = {
  wuhan: '武汉特色',
  huangshi: '黄石特色',
  shiyan: '十堰特色',
  yichang: '宜昌特色',
  xiangyang: '襄阳特色',
  ezhou: '鄂州特色',
  jingmen: '荆门特色',
  xiaogan: '孝感特色',
  jingzhou: '荆州及公安特色',
  huanggang: '黄冈特色',
  xianning: '咸宁特色',
  suizhou: '随州特色',
  enshi: '恩施特色',
  xiantao: '仙桃特色',
  qianjiang: '潜江特色',
  tianmen: '天门特色',
  shennongjia: '神农架特色',
}

export function regionalFit(dish, { cityId = '', meal = '' } = {}) {
  const specialties = CITY_SPECIALTIES[cityId] ?? []
  if (!specialties.includes(dish.name)) return { score: 0, note: '' }

  // 早餐地方代表性最强；午餐仍明显加权；晚餐保留较温和的地方偏好。
  const score = meal === 'breakfast' ? 2.4 : meal === 'lunch' ? 1.8 : 0.8
  return { score, note: `${CITY_LABELS[cityId] ?? '本地'} · ${dish.name}` }
}

export { CITY_SPECIALTIES }