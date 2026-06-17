import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    resolve: {
        alias: {
            // Proxy imports (protocol.ts uses .js extension for Node16 module resolution)
            [resolve(__dirname, "proxy/src/protocol.js")]: resolve(__dirname, "proxy/src/protocol.ts"),
            // Vencord stubs — these don't exist outside Discord, so mock them
            "@utils/Logger": resolve(__dirname, "tests/__mocks__/vencord.ts"),
            "@utils/types": resolve(__dirname, "tests/__mocks__/vencord.ts"),
            "@api/Settings": resolve(__dirname, "tests/__mocks__/vencord.ts"),
            "@webpack": resolve(__dirname, "tests/__mocks__/webpack.ts"),
            // _libAnimationKit CSS — vitest can't load CSS, stub it
            "../_libAnimationKit/animations.css": resolve(__dirname, "tests/__mocks__/empty.ts"),
        },
    },
    test: {
        include: ["tests/**/*.test.ts"],
        globals: true,
    },
});
