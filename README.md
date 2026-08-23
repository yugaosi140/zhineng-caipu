# 楚膳

湖北地域化智能三餐推荐应用，根据天气、时令、菜价、预算和菜谱难度生成早餐、午餐与晚餐建议。

## 本地运行

```bash
npm install
npm run dev
```

## 校验

```bash
npm run validate:data
npm test -- --run
npm run build
```

天气使用 Open-Meteo；菜价使用公开指数和本地手工价格覆盖。菜谱数据为恢复后的项目数据。
