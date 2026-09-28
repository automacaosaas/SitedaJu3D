const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../dist');
for (const file of fs.readdirSync(root).filter(name => name.endsWith('.html') && name !== 'email-preview.html')) {
  let html = fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  if (!html.includes('src="journey.js"')) html = html.replace('<head>', '<head>\n  <script src="journey.js"></script>');
  if (!html.includes('href="journey.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="journey.css">\n</head>');
  fs.writeFileSync(path.join(root,file),html);
}
