
import fs from 'fs';

const content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

let lines = content.split('\n');
let tStack = [];

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let cleanLine = line.replace(/\/\/.*$/g, '').replace(/\/\*.*?\*\//g, '').replace(/'[^']*'/g, '""').replace(/"[^"]*"/g, '""');
    
    // Look for ? (ignoring ?. and ?:)
    let qMatches = cleanLine.match(/(^|[^\.\?])\?([^\:])/g) || [];
    for (let m of qMatches) {
        tStack.push(i + 1);
    }
    
    // Look for :
    let cMatches = cleanLine.match(/(^|[^\?])\:(?=[^/])/g) || [];
    // This is hard because : is used in many places.
    // Let's assume a ternary : is preceded by ) or } or whitespace and followed by ( or { or whitespace.
    let ternaryCMatches = cleanLine.match(/(\s|\)|\})\:(\s|\(|\{)/g) || [];
    for (let m of ternaryCMatches) {
        if (tStack.length > 0) tStack.pop();
    }
}

console.log('Unclosed ternaries at lines:', tStack);
