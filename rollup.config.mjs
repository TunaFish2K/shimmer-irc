import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

/**
 * @type { import("rollup").RollupOptions }
 */
export default {
    input: "./src/index.ts",
    output: [
        {
            "file": "./dist/index.js",
            "format": "esm",
        },
        {
            "file": "./dist/index.min.js",
            "format": "esm",
            "plugins": [terser()]
        },
        {
            "file": "./dist/index.cjs",
            "format": "commonjs"
        }
    ],
    plugins: [
        typescript({
            "target": "ESNext",
            "module": "ESNext",
            compilerOptions: {
                declaration: true,
                declarationDir: "./dist"
            }
        }),
        json(),
        commonjs()
    ]
};