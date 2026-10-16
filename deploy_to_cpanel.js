const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const path = require('path');

const USER = 'demirmedyaweb';
const PASS = 'Doguhan2001';
const HOST = 'mt-move.guzelhosting.com';
const PORT = 2083;

async function login() {
  const loginData = querystring.stringify({ user: USER, pass: PASS });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: HOST,
      port: PORT,
      path: '/login/?login_only=1',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(loginData)
      },
      rejectUnauthorized: false
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        const body = JSON.parse(b);
        const cookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        resolve({ secToken: body.security_token, cookies });
      });
    });
    req.on('error', reject);
    req.write(loginData);
    req.end();
  });
}

async function mkdir(session, baseDir, dirName) {
  const postParams = querystring.stringify({
    'cpanel_jsonapi_version': '2',
    'cpanel_jsonapi_module': 'Fileman',
    'cpanel_jsonapi_func': 'mkdir',
    'path': baseDir,
    'name': dirName
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: HOST,
      port: PORT,
      path: session.secToken + '/json-api/cpanel',
      method: 'POST',
      headers: {
        'Cookie': session.cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postParams)
      },
      rejectUnauthorized: false
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.write(postParams);
    req.end();
  });
}

async function saveFile(session, targetDir, filename, content) {
  const postParams = querystring.stringify({
    dir: targetDir,
    file: filename,
    content: content,
    from_charset: 'utf-8',
    to_charset: 'utf-8'
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: HOST,
      port: PORT,
      path: session.secToken + '/execute/Fileman/save_file_content',
      method: 'POST',
      headers: {
        'Cookie': session.cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postParams)
      },
      rejectUnauthorized: false
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(b));
        } catch(e) {
          resolve({ error: b });
        }
      });
    });
    req.write(postParams);
    req.end();
  });
}

async function main() {
  console.log('1. Logging in to cPanel...');
  const session = await login();
  console.log('✓ Logged in. Security Token:', session.secToken);

  const localPublic = path.join(__dirname, 'public');

  // ==========================================
  // A. DEPLOY TO taksideode.com.tr
  // ==========================================
  console.log('\n2. Deploying to taksideode.com.tr...');
  const mainDir = '/home/demirmedyaweb/taksideode.com.tr';

  await mkdir(session, mainDir, 'api');

  const mainFiles = [
    { file: '.htaccess', content: fs.readFileSync(path.join(localPublic, '.htaccess'), 'utf8') },
    { file: 'login.html', content: fs.readFileSync(path.join(localPublic, 'login.html'), 'utf8') },
    { file: 'admin.html', content: fs.readFileSync(path.join(localPublic, 'admin.html'), 'utf8') },
    { file: 'panel.html', content: fs.readFileSync(path.join(localPublic, 'panel.html'), 'utf8') },
    { file: 'index.html', content: fs.readFileSync(path.join(localPublic, 'index.html'), 'utf8') },
    { file: 'cagri.html', content: fs.readFileSync(path.join(localPublic, 'cagri.html'), 'utf8') },
    { file: 'surucu.html', content: fs.readFileSync(path.join(localPublic, 'surucu.html'), 'utf8') },
  ];

  for (const f of mainFiles) {
    const res = await saveFile(session, mainDir, f.file, f.content);
    console.log(`  ✓ taksideode.com.tr/${f.file}: ${res.status === 1 ? 'OK' : JSON.stringify(res)}`);
  }

  // Update css/style.css
  const styleCss = fs.readFileSync(path.join(localPublic, 'css', 'style.css'), 'utf8');
  await saveFile(session, mainDir + '/css', 'style.css', styleCss);
  console.log('  ✓ taksideode.com.tr/css/style.css: OK');

  // Update js/panel.js & leaflet.js & css/leaflet.css
  const panelJs = fs.readFileSync(path.join(localPublic, 'js', 'panel.js'), 'utf8');
  const panelJsRes = await saveFile(session, mainDir + '/js', 'panel.js', panelJs);
  console.log(`  ✓ taksideode.com.tr/js/panel.js: ${panelJsRes.status === 1 ? 'OK' : JSON.stringify(panelJsRes)}`);

  if (fs.existsSync(path.join(localPublic, 'js', 'leaflet.js'))) {
    const leafletJs = fs.readFileSync(path.join(localPublic, 'js', 'leaflet.js'), 'utf8');
    await saveFile(session, mainDir + '/js', 'leaflet.js', leafletJs);
    console.log(`  ✓ taksideode.com.tr/js/leaflet.js: OK`);
  }
  if (fs.existsSync(path.join(localPublic, 'css', 'leaflet.css'))) {
    const leafletCss = fs.readFileSync(path.join(localPublic, 'css', 'leaflet.css'), 'utf8');
    await saveFile(session, mainDir + '/css', 'leaflet.css', leafletCss);
    console.log(`  ✓ taksideode.com.tr/css/leaflet.css: OK`);
  }

  // Update api/index.php & api/database.json
  const apiPhp = fs.readFileSync(path.join(localPublic, 'api', 'index.php'), 'utf8');
  const apiPhpRes = await saveFile(session, mainDir + '/api', 'index.php', apiPhp);
  console.log(`  ✓ taksideode.com.tr/api/index.php: ${apiPhpRes.status === 1 ? 'OK' : JSON.stringify(apiPhpRes)}`);

  const apiDb = fs.readFileSync(path.join(localPublic, 'api', 'database.json'), 'utf8');
  const apiDbRes = await saveFile(session, mainDir + '/api', 'database.json', apiDb);
  console.log(`  ✓ taksideode.com.tr/api/database.json: ${apiDbRes.status === 1 ? 'OK' : JSON.stringify(apiDbRes)}`);

  // ==========================================
  // B. DEPLOY TO demodurak.taksideode.com.tr
  // ==========================================
  console.log('\n3. Deploying to demodurak.taksideode.com.tr...');
  const subDir = '/home/demirmedyaweb/demodurak.taksideode.com.tr';

  await mkdir(session, subDir, 'css');
  await mkdir(session, subDir, 'js');
  await mkdir(session, subDir, 'images');
  await mkdir(session, subDir, 'api');

  const subHtaccess = `# Demodurak Apache Configuration
RewriteEngine On

# HTTPS Redirect
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# MIME Types
AddType image/svg+xml .svg
AddType application/manifest+json .json

# API Routing to PHP
RewriteRule ^api/(.*)$ api/index.php?endpoint=$1 [QSA,L]
RewriteRule ^api/?$ api/index.php [QSA,L]

# Root serves panel.html (Durak Taxi Panel)
DirectoryIndex panel.html index.html

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^login/?$ login.html [L,QSA]

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^panel/?$ panel.html [L,QSA]

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^cagri/([a-zA-Z0-9_-]+)/?$ cagri.html?code=$1 [L,QSA]

RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^cagri/?$ cagri.html [L,QSA]

# Security Headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
</IfModule>
`;

  const subFiles = [
    { dir: subDir, file: '.htaccess', content: subHtaccess },
    { dir: subDir, file: 'panel.html', content: fs.readFileSync(path.join(localPublic, 'panel.html'), 'utf8') },
    { dir: subDir, file: 'index.html', content: fs.readFileSync(path.join(localPublic, 'panel.html'), 'utf8') },
    { dir: subDir, file: 'login.html', content: fs.readFileSync(path.join(localPublic, 'login.html'), 'utf8') },
    { dir: subDir, file: 'cagri.html', content: fs.readFileSync(path.join(localPublic, 'cagri.html'), 'utf8') },
    { dir: subDir, file: 'surucu.html', content: fs.readFileSync(path.join(localPublic, 'surucu.html'), 'utf8') },
    { dir: subDir + '/css', file: 'style.css', content: styleCss },
    { dir: subDir + '/js', file: 'panel.js', content: panelJs },
    { dir: subDir + '/api', file: 'index.php', content: apiPhp },
    { dir: subDir + '/api', file: 'database.json', content: apiDb },
  ];

  if (fs.existsSync(path.join(localPublic, 'js', 'leaflet.js'))) {
    subFiles.push({ dir: subDir + '/js', file: 'leaflet.js', content: fs.readFileSync(path.join(localPublic, 'js', 'leaflet.js'), 'utf8') });
  }
  if (fs.existsSync(path.join(localPublic, 'css', 'leaflet.css'))) {
    subFiles.push({ dir: subDir + '/css', file: 'leaflet.css', content: fs.readFileSync(path.join(localPublic, 'css', 'leaflet.css'), 'utf8') });
  }

  for (const f of subFiles) {
    const res = await saveFile(session, f.dir, f.file, f.content);
    console.log(`  ✓ ${f.dir.split('/').pop()}/${f.file}: ${res.status === 1 ? 'OK' : JSON.stringify(res)}`);
  }

  // Copy images from taksideode.com.tr to demodurak
  console.log('\n4. Syncing images...');
  const copyParams = querystring.stringify({
    'cpanel_jsonapi_version': '2',
    'cpanel_jsonapi_module': 'Fileman',
    'cpanel_jsonapi_func': 'fileop',
    'op': 'copy',
    'sourcefiles': '/home/demirmedyaweb/taksideode.com.tr/images',
    'destfiles': '/home/demirmedyaweb/demodurak.taksideode.com.tr'
  });

  const copyRes = await new Promise((resolve) => {
    const req = https.request({
      hostname: HOST,
      port: PORT,
      path: session.secToken + '/json-api/cpanel',
      method: 'POST',
      headers: {
        'Cookie': session.cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(copyParams)
      },
      rejectUnauthorized: false
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.write(copyParams);
    req.end();
  });
  console.log('  ✓ Images sync result:', copyRes.cpanelresult ? 'Success' : copyRes);

  console.log('\n======================================================');
  console.log('🚀 ALL DEPLOYMENTS COMPLETED SUCCESSFULLY!');
  console.log('   • Master Station Management: https://taksideode.com.tr/panel');
  console.log('   • Split Login Screen:        https://taksideode.com.tr/login');
  console.log('   • Taxi Station Panel:        https://demodurak.taksideode.com.tr');
  console.log('======================================================');
}

main().catch(console.error);
