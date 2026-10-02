import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["eslint.config.js"] }, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      eqeqeq: ["error", "always"],
      // Typed lookups like $<HTMLCanvasElement>("#id") are deliberate.
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
    },
  },
  { files: ["src/server/**", "test/**", "*.js"], languageOptions: { globals: globals.node } },
  { files: ["src/client/**"], languageOptions: { globals: globals.browser } },
  // describe() and it() return promises that node:test tracks itself.
  { files: ["test/**"], rules: { "@typescript-eslint/no-floating-promises": "off" } },
  { files: ["eslint.config.js"], ...tseslint.configs.disableTypeChecked },
);
