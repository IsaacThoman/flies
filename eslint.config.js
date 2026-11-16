import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist", "**/build", "**/node_modules", "**/generated", "apps/tvos/www", "apps/ios/www", "packages/brain/data"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/src/**/*.ts", "packages/{fly,world,body,ui,contracts}/src/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["packages/brain/**/*.ts", "scripts/**/*.ts", "**/tests/**/*.ts", "**/*.test.ts", "**/vite.config.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
