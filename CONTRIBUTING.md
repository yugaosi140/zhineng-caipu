# 参与贡献

先说最需要人手的地方：**菜谱数据**。做法、用量、地域归属这些事情，写代码的人未必比在本地吃了二十年的人清楚。如果你发现某道菜的步骤不对、用量离谱、或者归到了不该归的市州，哪怕只留一条 issue 也很有用。

## 提交之前

搜一下已有 issue 和 PR，确认没人做过。只是想问怎么用、或者不确定算不算问题，先去 [Discussions](https://github.com/yugaosi140/zhineng-caipu/discussions)。

安全问题走 [SECURITY.md](SECURITY.md) 里的私密渠道，别开公开 issue。

## 本地环境

需要 Node.js >= 20。

```bash
npm install
npm run dev
```

提 PR 前这三条都要过：

```bash
npm run validate:data
npm test
npm run build
```

## 改菜谱数据

菜谱在 `src/data/dishes.hubei.json`，市州代表菜在 `src/engine/region.js`，菜价基准在 `src/data/priceBaseline.json`。

`npm run validate:data` 会卡这些规则：

- `id` 和 `name` 全库唯一
- `meals` 非空，取值只能是 `breakfast` / `lunch` / `dinner`
- `difficulty` 是 1–5 的整数
- `timeMin`、`servings` 为正数
- `ingredients` 每项要有 `name`、正数 `qty`、`unit`；`priceKey` 要么是 `null`，要么能在 `priceBaseline.json` 的 `items` 里找到同名项
- `properties` 七个维度（`heavy` `digestibility` `spicy` `warming` `soupy` `oily` `hydrating`）都必须存在且在 0–1 之间
- `nutrition` 的 `kcal` `protein` `fat` `carbs` 齐全且非负；宏量折算热量和 `kcal` 差得太远会报 warning
- `recipe.steps` 非空

一道菜的完整形状可以直接看 `dishes.hubei.json` 里的 `reganmian`。

关于口味七维怎么填：这七个值是推荐引擎的输入，不是营养标签。`warming` 低表示清凉、高表示温补；`digestibility` 高表示晚上吃了不压肠胃。填的时候想的是「这道菜什么天气下让人想吃」，而不是「它客观上有多辣」。拿不准就参考同类菜已有的值。

**写清出处比写得多有用。** 地方志、餐馆做法、家里的做法、视频链接都算。已有的公开检索记录在 `src/data/foodSources.hubei.json`。

## 改代码

`src/engine/` 下面全是纯函数，不碰浏览器 API，改动请连带补测试。评分逻辑的改动尤其需要说明校准依据 —— 这部分调一个系数会影响所有推荐结果，光说「感觉更合理」不够。`plan.js` 里 `ROLE_ENV_FLOOR` 上方那段注释是个例子：它记录了「严寒场景下素菜位选中干煸藕丝」这个具体的实测问题，改动请照这个粒度留痕。

风格上跟着现有代码走：两空格缩进、不带分号、单引号。注释写「为什么」，不写「是什么」。

## 提 PR

- 一个 PR 做一件事。菜谱数据修正和引擎改动请分开提。
- 标题短一点，细节写在描述里。
- 描述里写清改了什么、为什么、怎么验证的。如果是数据修正，把出处贴上。
- CI 会跑数据校验、测试和构建，红了的 PR 不会被合。

## 行为准则

参与本项目即表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)。

## 许可

提交的贡献按 [MIT](LICENSE) 授权。
