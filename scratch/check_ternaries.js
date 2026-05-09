
import fs from 'fs';

const content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

let ternaryDepth = 0;
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Simple check for ? and : outside of strings/comments
    // This is very rough but might help
    let qCount = (line.match(/\?/g) || []).length;
    let cCount = (line.match(/\:/g) || []).length;
    
    // Ignore optional chaining ?.
    let optChainCount = (line.match(/\?\./g) || []).length;
    qCount -= optChainCount;
    
    // Ignore objects and types (very rough)
    // Actually, let's just look for "? (" and ") : " patterns which I used
    if (line.includes('? (')) ternaryDepth++;
    if (line.includes(') :')) ternaryDepth--;
}

console.log('Final ternary depth:', ternaryDepth);
