import { readFileSync } from 'fs'
const s = readFileSync('server/index.js', 'utf8')
const lines = s.split('\n')
let b = 0,
  p = 0,
  br = 0,
  last = -1
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  for (let j = 0; j < line.length; j++) {
    const c = line[j]
    if (c == '{') b++
    if (c == '}') b--
    if (c == '(') p++
    if (c == ')') p--
    if (c == '[') br++
    if (c == ']') br--
  }
  if (b != 0 || p != 0 || br != 0) last = i + 1
}
console.log('lastUnbalancedLine', last, 'braces', b, 'parens', p, 'brackets', br)
