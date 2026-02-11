import { defineConfig, Plugin } from 'vite';
import { resolve } from 'path';
import { renameSync, mkdirSync, existsSync, rmSync } from 'fs';

/**
 * Vite plugin that moves HTML files from dist/src/X/ to dist/X/
 * after the build, so manifest.json paths work correctly.
 */
function moveHtmlPlugin(): Plugin {
    return {
        name: 'move-html-output',
        closeBundle() {
            const dist = resolve(__dirname, 'dist');
            const srcDir = resolve(dist, 'src');
            if (!existsSync(srcDir)) return;

            const entries = ['popup', 'options', 'reader'];
            for (const entry of entries) {
                const srcHtml = resolve(srcDir, entry, `${entry}.html`);
                const destDir = resolve(dist, entry);
                const destHtml = resolve(destDir, `${entry}.html`);
                if (existsSync(srcHtml)) {
                    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
                    renameSync(srcHtml, destHtml);
                    console.log(`  Moved ${entry}.html → dist/${entry}/`);
                }
            }

            // Clean up empty dist/src/ directory
            try { rmSync(srcDir, { recursive: true, force: true }); } catch { }
        },
    };
}

export default defineConfig({
    plugins: [moveHtmlPlugin()],
    resolve: {
        alias: {
            '@shared': resolve(__dirname, 'src/shared'),
            '@modules': resolve(__dirname, 'src/modules'),
            '@lib': resolve(__dirname, 'src/lib'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
        target: 'es2022',
        rollupOptions: {
            input: {
                background: resolve(__dirname, 'src/background/index.ts'),
                content: resolve(__dirname, 'src/content/index.ts'),
                popup: resolve(__dirname, 'src/popup/popup.html'),
                options: resolve(__dirname, 'src/options/options.html'),
                reader: resolve(__dirname, 'src/reader/reader.html'),
            },
            output: {
                entryFileNames: (chunkInfo) => {
                    if (chunkInfo.name === 'background') return 'background/index.js';
                    if (chunkInfo.name === 'content') return 'content/index.js';
                    if (chunkInfo.name === 'popup') return 'popup/popup.js';
                    if (chunkInfo.name === 'options') return 'options/options.js';
                    if (chunkInfo.name === 'reader') return 'reader/reader.js';
                    return '[name].js';
                },
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.names?.[0]?.endsWith('.css') || assetInfo.name?.endsWith('.css')) {
                        const name = assetInfo.names?.[0] || assetInfo.name || '';
                        if (name.includes('popup')) return 'popup/popup.css';
                        if (name.includes('options')) return 'options/options.css';
                        if (name.includes('reader')) return 'reader/reader.css';
                    }
                    return 'assets/[name][extname]';
                },
            },
        },
    },
    publicDir: 'public',
});
