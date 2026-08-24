/**
 * ESLint 扁平配置。
 *
 * 规则只做两件事：
 *   1. 抓真实错误 —— 未定义变量、未使用变量、Vue 模板里的写错
 *   2. 固定 CONTRIBUTING.md 里写明的风格：两空格缩进、不带分号、单引号
 *
 * 第 2 点原本只写在文档里，没有任何东西执行它。文档管不住 PR，工具才行。
 *
 * 刻意没有开的：
 *   - 复杂度上限、行数上限之类的度量规则。引擎里 plan.js 的餐段规则表天生就长，
 *     为了迁就阈值把它拆散只会更难读。
 *   - Prettier。它会重排已经对齐得很整齐的常量表（cost.js 的 UNIT_TO_GRAM、
 *     region.js 的市州映射都是刻意手工对齐的），得不偿失。
 */

import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import stylistic from '@stylistic/eslint-plugin'

export default [
  {
    // 构建产物和依赖不参与检查
    ignores: ['dist/**', 'node_modules/**', 'scripts/_scratch-*.mjs'],
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      /* ---------------------------------------------- 风格（对齐文档） */
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      // 常量表是手工对齐的，不能强制每行一个属性
      '@stylistic/object-curly-spacing': ['error', 'always'],

      /* -------------------------------------------------------- 正确性 */
      // 未使用的变量报错，但允许 _ 前缀显式表示"我知道它没用"
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',

      /* ------------------------------------------------------ Vue 模板 */
      // 组件名用多词，避免和原生标签冲突
      'vue/multi-word-component-names': 'error',
      'vue/html-indent': ['error', 2],
      // 单行属性数量不限。模板里几个短属性挤一行比强制换行更好读
      'vue/max-attributes-per-line': 'off',
      // 下面三条是纯排版洁癖，和本项目刻意紧凑的模板风格冲突：
      // <h2>{{ city.name }}</h2> 被拆成三行并不会更好读，只会让 lint 输出全是噪音，
      // 真正的错误反而被淹掉。
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
    },
  },

  {
    // 脚本和测试跑在 Node 里，不是浏览器
    files: ['scripts/**/*.mjs', 'tests/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
