import { transform } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join, extname } from 'path';

const SOURCE_DIR = 'ui';
const OUTPUT_DIR = 'dist';

// Files to include in the deployment build (excludes test files)
const DEPLOY_FILES = [
    'index.html',
    'index.css',
    'mobile.css',
    'index.js',
    'mobile.js',
    'damage-calculator.js',
    'mob-presets.json',
];

await mkdir(OUTPUT_DIR, { recursive: true });

for (const fileName of DEPLOY_FILES) {
    const sourcePath = join(SOURCE_DIR, fileName);
    const outputPath = join(OUTPUT_DIR, fileName);
    const extension = extname(fileName);
    const sourceContent = await readFile(sourcePath, 'utf8');

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
