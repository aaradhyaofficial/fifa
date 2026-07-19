const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app.js');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/\bvar\s+/g, 'let ');

fs.writeFileSync(filePath, content);
console.log('Replaced var with let in app.js');
