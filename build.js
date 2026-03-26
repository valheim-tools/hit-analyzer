import { transform } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';
import { readFile, writeFile, mkdir, copyFile, readdir } from 'fs/promises';
import { join, extname } from 'path';

const SOURCE_DIR = '.';
const OUTPUT_DIR = 'dist';

// Path rewrites applied to file content before minification.
// Keys are literal strings found in source; values are their dist replacements.
const PATH_REWRITES = {
    './src/assets/styles/index.css?v=12':  './index.css',
    './src/assets/styles/mobile.css?v=12': './mobile.css',
    './src/index.js?v=12':                 './index.js',
    './damage-calculator.js?v=9':          './damage-calculator.js',
    './src/data/mob-attacks.json?v=9':     './mob-attacks.json',
    './src/data/shields.json?v=9':         './shields.json',
    'src/assets/images/animations/':       './animations/',
    'src/assets/images/presets/':          './presets/',
};

function applyPathRewrites(content) {
    let rewritten = content;
    for (const [originalPath, flatPath] of Object.entries(PATH_REWRITES)) {
        rewritten = rewritten.split(originalPath).join(flatPath);
    }
    return rewritten;
}

// Files to include in the deployment build (excludes test files).
// Each entry is { src, out } where src is relative to SOURCE_DIR (project root)
// and out is the filename written to OUTPUT_DIR (may include subdirectories).
const DEPLOY_FILES = [
    { src: 'index.html',                    out: 'index.html' },
    { src: 'src/assets/styles/index.css',   out: 'index.css' },
    { src: 'src/assets/styles/mobile.css',  out: 'mobile.css' },
    { src: 'src/index.js',                  out: 'index.js' },
    { src: 'src/mobile.js',                 out: 'mobile.js' },
    { src: 'src/damage-calculator.js',      out: 'damage-calculator.js' },
    { src: 'src/data/mob-attacks.json',     out: 'mob-attacks.json' },
    { src: 'src/data/shields.json',         out: 'shields.json' },
    { src: 'src/assets/images/animations/greydwarf.png',      out: 'animations/greydwarf.png' },
    { src: 'src/assets/images/animations/viking.png',         out: 'animations/viking.png' },
    { src: 'src/assets/images/animations/projectile.png',     out: 'animations/projectile.png' },
    { src: 'src/assets/images/animations/blue-shield.png',    out: 'animations/blue-shield.png' },
    { src: 'src/assets/images/animations/yellow-shield.png',  out: 'animations/yellow-shield.png' },
    { src: 'src/assets/images/animations/red-shield.png',     out: 'animations/red-shield.png' },
];

// Directories to bulk-copy (images that don't need minification).
const COPY_DIRECTORIES = [
    { src: 'src/assets/images/presets/shields', out: 'presets/shields' },
    { src: 'src/assets/images/presets/mobs',    out: 'presets/mobs' },
];

/** Recursively copy all files from a source directory to an output directory. */
async function copyDirectory(sourceDirectory, outputDirectory) {
    await mkdir(join(OUTPUT_DIR, outputDirectory), { recursive: true });
    const entries = await readdir(join(SOURCE_DIR, sourceDirectory));
    let count = 0;
    for (const entry of entries) {
        await copyFile(
            join(SOURCE_DIR, sourceDirectory, entry),
            join(OUTPUT_DIR, outputDirectory, entry),
        );
        count++;
    }
    console.log(`copied  ${outputDirectory}/ (${count} files)`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(join(OUTPUT_DIR, 'animations'), { recursive: true });

for (const { src, out } of DEPLOY_FILES) {
    const sourcePath = join(SOURCE_DIR, src);
    const outputPath = join(OUTPUT_DIR, out);
    const fileName   = out;
    const extension  = extname(out);
    const sourceContent = applyPathRewrites(await readFile(sourcePath, 'utf8'));

    let minifiedContent;

    if (extension === '.js') {
        const result = await transform(sourceContent, { minify: true });
        minifiedContent = result.code;
    } else if (extension === '.css') {
        const result = await transform(sourceContent, { loader: 'css', minify: true });
        minifiedContent = result.code;
    } else if (extension === '.html') {
        minifiedContent = await minifyHtml(sourceContent, {
            collapseWhitespace: true,
            removeComments: true,
            minifyCSS: true,
            minifyJS: true,
        });
    } else {
        await copyFile(sourcePath, outputPath);
        console.log(`copied  ${fileName}`);
        continue;
    }

    await writeFile(outputPath, minifiedContent);
    const sourceSize = Buffer.byteLength(sourceContent, 'utf8');
    const outputSize = Buffer.byteLength(minifiedContent, 'utf8');
    const savings = (((sourceSize - outputSize) / sourceSize) * 100).toFixed(1);
    console.log(`minified ${fileName}: ${sourceSize} → ${outputSize} bytes (${savings}% smaller)`);
}

// Bulk-copy preset image directories
for (const { src, out } of COPY_DIRECTORIES) {
    await copyDirectory(src, out);
}

console.log('\nBuild complete → dist/');
