import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'index.js',
        'api.js',
        'utils/jwt.js',
        'react/AuthProvider.jsx',
        'react/useAuth.js',
        'react/useSessionMonitor.js'
    ],
    format: ['cjs', 'esm'],
    dts: false, // Javascript project, no d.ts needed unless we add typescript
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    external: ['react', 'react-dom', '@tanstack/react-query', 'axios', 'jwt-decode']
});
