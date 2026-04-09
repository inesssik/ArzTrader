import type { Config } from 'prettier'

const config: Config = {
    trailingComma: 'none',
    tabWidth: 2,
    semi: true,
    printWidth: 125,
    singleQuote: true,
    arrowParens: 'avoid',
    importOrderSeparation: false,
    importOrderSortSpecifiers: true,
    importOrderCaseInsensitive: false,
    importOrder: ['<THIRD_PARTY_MODULES>', '^@/(.*)$', '^../(.*)', '^./(.*)'],
    importOrderParserPlugins: [
        "classProperties",
        "decorators-legacy",
        "typescript"
    ],
    plugins: ['@trivago/prettier-plugin-sort-imports']
}

export default config
