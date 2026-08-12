import { readFileSync } from 'fs'
const s = readFileSync('server/index.js', 'utf8')
const lines = s.split('\n')
let b = 0,
  p = 0,
  br = 0
let maxB = { v: 0, line: 0 },
  maxP = { v: 0, line: 0 }
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  for (const c of line) {
    if (c == '{') b++
    if (c == '}') b--
    if (c == '(') p++
    if (c == ')') p--
    if (c == '[') br++
    if (c == ']') br--
  }
  if (b > maxB.v) {
    maxB.v = b
    maxB.line = i + 1
  }
  if (p > maxP.v) {
    maxP.v = p
    maxP.line = i + 1
  }
}
console.log('max braces', maxB, 'max parens', maxP)
console.log('final', { b, p, br })
console.log('snippet around maxB:')
for (let i = Math.max(0, maxB.line - 6); i < Math.min(lines.length, maxB.line + 4); i++)
  console.log(i + 1 + ':', lines[i])
console.log('snippet around maxP:')
for (let i = Math.max(0, maxP.line - 6); i < Math.min(lines.length, maxP.line + 4); i++)
  console.log(i + 1 + ':', lines[i])
console.log('lines with positive paren count (last 10):')
let pcount = 0
for (let i = 0; i < lines.length; i++) {
  for (const c of lines[i]) {
    if (c == '(') pcount++
    if (c == ')') pcount--
  }
  if (pcount > 0) console.log(i + 1, 'pcount=', pcount, lines[i].trim())
}
