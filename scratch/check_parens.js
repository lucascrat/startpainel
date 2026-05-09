
import fs from 'fs';

const content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

let parenDepth = 0;
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let char of line) {
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
    }
    if (parenDepth < 0) {
        console.log(`Paren underflow at line ${i + 1}`);
        parenDepth = 0; // Reset to continue
    }
}

console.log('Final paren depth:', parenDepth);
