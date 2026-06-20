/**
 * 生成语文词汇拼音脚本
 * 运行: node scripts/generate-pinyin.mjs
 */
import { pinyin } from 'pinyin-pro'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const inputPath = join(__dirname, '..', 'public', 'words-g6-chinese.json')
const outputPath = join(__dirname, '..', 'public', 'words-g6-chinese.json')

// 读取原词库
const raw = JSON.parse(readFileSync(inputPath, 'utf-8'))

// 遍历每个词库，为每条记录生成拼音
const result = {}
for (const [bankName, words] of Object.entries(raw)) {
  result[bankName] = words.map(w => {
    const py = pinyin(w.word, { toneType: 'none' })
    return { word: w.word, pinyin: py }
  })
  console.log(`${bankName}: ${words.length} 词 ✓`)
}

// 写回文件
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf-8')
console.log('\n✅ 拼音生成完成，已更新 words-g6-chinese.json')
