const fs = require('fs');
const path = require('path');

const wwwDir = path.join(__dirname, 'www');

if (!fs.existsSync(wwwDir)) {
    fs.mkdirSync(wwwDir, { recursive: true });
}

const filesToCopy = [
    'config.js',
    'index.html',
    'style.css',
    'weather.js',
    'app.js',
    'router.js',
    'parking.js',
    'auth.js',
    'native.js',
    'manifest.json',
    'sw.js',
    'icon-192.png',
    'icon-512.png',
    'app-debug.apk'
];

filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(wwwDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file} -> www/${file}`);
    }
});

console.log('Build complete: www/ is ready for Capacitor.');
