import fs from 'fs'
const s = fs.readFileSync('server/index.js', 'utf8')
let braces = 0,
  parens = 0,
  brackets = 0
for (let i = 0; i < s.length; i++) {
  const c = s[i]
  if (c == '{') braces++
  if (c == '}') braces--
  if (c == '(') parens++
  if (c == ')') parens--
  if (c == '[') brackets++
  if (c == ']') brackets--
}
console.log('braces', braces, 'parens', parens, 'brackets', brackets)
console.log('length', s.split('\n').length)
const lines = s.split('\n')
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('TODO:') || lines[i].includes('Unexpected')) {
  }
}
