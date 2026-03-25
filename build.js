import { transform } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join, extname } from 'path';

const SOURCE_DIR = '.';
const OUTPUT_DIR = 'dist';

// Path rewrites applied to file content before minification.
// Keys are literal strings found in source; values are their flat-dist replacements.
// This is needed because the build flattens src/ into dist/ root, so all
// deep paths (e.g. ./src/assets/styles/index.css) must become flat (./index.css).
const PATH_REWRITES = {
    './src/assets/styles/index.css?v=12':  './index.css',
    './src/assets/styles/mobile.css?v=12': './mobile.css',
    './src/index.js?v=12':                 './index.js',
    './damage-calculator.js?v=9':          './damage-calculator.js',
    './src/data/mob-presets.json?v=9':     './mob-presets.json',
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
// and out is the flat filename written to OUTPUT_DIR.
const DEPLOY_FILES = [
    { src: 'index.html',                    out: 'index.html' },
    { src: 'src/assets/styles/index.css',   out: 'index.css' },
    { src: 'src/assets/styles/mobile.css',  out: 'mobile.css' },
    { src: 'src/index.js',                  out: 'index.js' },
    { src: 'src/mobile.js',                 out: 'mobile.js' },
    { src: 'src/damage-calculator.js',      out: 'damage-calculator.js' },
    { src: 'src/data/mob-presets.json',     out: 'mob-presets.json' },
];

await mkdir(OUTPUT_DIR, { recursive: true });

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

console.log('\nBuild complete → dist/');
