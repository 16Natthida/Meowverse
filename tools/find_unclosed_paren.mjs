import { readFileSync } from 'fs'
const s = readFileSync('server/index.js', 'utf8')
const stack = []
const lines = s.split('\n')
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  for (let j = 0; j < line.length; j++) {
    const c = line[j]
    if (c == '(') stack.push({ line: i + 1, col: j + 1, char: c })
    if (c == ')') stack.pop()
  }
}
console.log('unclosed parens:', stack.length)
if (stack.length > 0) console.log('last unclosed paren at', stack[stack.length - 1])
else console.log('none')
