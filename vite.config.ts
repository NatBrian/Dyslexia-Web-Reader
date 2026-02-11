import { defineConfig, BuildOptions } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
                    // Place each entry in its own folder matching the input structure
                    if (chunkInfo.name === 'background') return 'background/index.js';
                    if (chunkInfo.name === 'content') return 'content/index.js';
                    if (chunkInfo.name === 'popup') return 'popup/popup.js';
                    if (chunkInfo.name === 'options') return 'options/options.js';
                    if (chunkInfo.name === 'reader') return 'reader/reader.js';
                    return '[name].js';
                },
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name?.endsWith('.css')) {
                        // Match CSS to its parent entry
                        if (assetInfo.name.includes('popup')) return 'popup/popup.css';
                        if (assetInfo.name.includes('options')) return 'options/options.css';
                        if (assetInfo.name.includes('reader')) return 'reader/reader.css';
                    }
                    return 'assets/[name][extname]';
                },
            },
        },
    },
    publicDir: 'public',
});
