const fs = require('fs');

let content = fs.readFileSync('public/surucu.html', 'utf8');
content = content.replaceAll('href="/css/', 'href="css/');
content = content.replaceAll('src="/js/', 'src="js/');
content = content.replaceAll('src="/images/', 'src="images/');
content = content.replaceAll('href="/images/', 'href="images/');

fs.writeFileSync('android/app/src/main/assets/surucu.html', content, 'utf8');
console.log('android/app/src/main/assets/surucu.html successfully updated from public/surucu.html!');
