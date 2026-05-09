
import fs from 'fs';

const content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

let divDepth = 0;
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let opens = (line.match(/<div\b/g) || []).length;
    let closes = (line.match(/<\/div\b/g) || []).length;
    divDepth += opens;
    divDepth -= closes;
    if (divDepth < 0) {
        console.log(`Div underflow at line ${i + 1}: ${line.trim()}`);
        divDepth = 0;
    }
}

console.log('Final div depth:', divDepth);
