
import fs from 'fs';

const content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

let braceDepth = 0;
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
    }
    if (braceDepth < 0) {
        console.log(`Brace underflow at line ${i + 1}`);
        braceDepth = 0; // Reset to continue
    }
}

console.log('Final brace depth:', braceDepth);
