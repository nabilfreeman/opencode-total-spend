import { transformFileAsync } from '@babel/core'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
const result = await transformFileAsync('src/tui.jsx', {
  presets: [['babel-preset-solid', { moduleName: '@opentui/solid', generate: 'universal' }]],
  comments: true,
})
await mkdir('dist', { recursive: true })
await writeFile('dist/tui.js', result.code + '\n')
await copyFile('src/spend.js', 'dist/spend.js')
