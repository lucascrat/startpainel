
import fs from 'fs';

const content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

let lines = content.split('\n');
let ternaryDepth = 0;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Remove strings and comments to avoid false positives
    let cleanLine = line.replace(/\/\/.*$/g, '').replace(/\/\*.*?\*\//g, '').replace(/'[^']*'/g, '""').replace(/"[^"]*"/g, '""');
    
    // Check for ? (ternary, not optional chaining or types)
    // A ternary ? usually has spaces around it or is followed by (
    let qMatches = cleanLine.match(/(^|\s)\?(\s|\()/g) || [];
    ternaryDepth += qMatches.length;
    
    // Check for : (ternary else)
    // A ternary : usually has spaces around it or is preceded by )
    let cMatches = cleanLine.match(/(\s|\))\:(\s|\()/g) || [];
    ternaryDepth -= cMatches.length;
    
    if (ternaryDepth < 0) {
        console.log(`Ternary underflow at line ${i + 1}: ${line.trim()}`);
        ternaryDepth = 0;
    }
}

console.log('Final ternary depth:', ternaryDepth);
