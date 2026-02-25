const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const htmlFiles = [
    path.join(__dirname, '..', 'public', 'index.html'),
    path.join(__dirname, '..', 'public', 'docs.html'),
    path.join(__dirname, '..', 'public', 'grid.html'),
    path.join(__dirname, '..', 'public', 'mobile.html'),
    path.join(__dirname, '..', 'public', 'legal.html'),
];

// 1. Get current version from package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// 2. Determine new version
const today = new Date();
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const datePrefix = `${year}.${month}.${day}`;

let newVersion;
if (currentVersion.startsWith(datePrefix)) {
    const parts = currentVersion.split('.');
    const n = parseInt(parts[parts.length - 1], 10);
    newVersion = `${datePrefix}.${n + 1}`;
} else {
    newVersion = `${datePrefix}.1`;
}

console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);

// 3. Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// 4. Update HTML files
htmlFiles.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');

    // Update ?v=...
    content = content.replace(/\?v=[0-9.]+/g, `?v=${newVersion}`);

    // Update version labels
    if (filePath.endsWith('index.html')) {
        // <span class="hero-version ...">v...</span>
        content = content.replace(/<span class="hero-version[^>]*>v[0-9.]+<\/span>/, `<span class="hero-version label-link" id="releaseNotesTrigger" tabindex="0">v${newVersion}</span>`);
        // Info panel version label
        content = content.replace(/(<span[^>]*id="memoNewsTrigger"[^>]*>)Version [0-9.]+(<\/span>)/, `$1Version ${newVersion}$2`);
    } else if (filePath.endsWith('docs.html')) {
        // Main docs info panel label
        content = content.replace(/(<span[^>]*id="memoNewsTrigger"[^>]*>)Version [0-9.]+(<\/span>)/, `$1Version ${newVersion}$2`);
        // Fallback for any generic docs version label
        content = content.replace(/<span>Version [0-9.]+<\/span>/, `<span>Version ${newVersion}</span>`);
    } else if (filePath.endsWith('grid.html')) {
        // <span>Version ...</span>
        content = content.replace(/<span>Version [0-9.]+<\/span>/, `<span>Version ${newVersion}</span>`);
    } else if (filePath.endsWith('mobile.html')) {
        // <span class="hero-version ...">v...</span>
        content = content.replace(/<span class="hero-version[^>]*>v[0-9.]+<\/span>/, `<span class="hero-version" style="font-size: 10px; opacity: 0.5;">v${newVersion}</span>`);
    }

    fs.writeFileSync(filePath, content);
});

console.log('Version bump complete.');
