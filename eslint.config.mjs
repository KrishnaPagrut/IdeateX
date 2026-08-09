import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees / local session files.
    ".claude/**",
    ".pglite/**",
    // Generated dot-matrix loader files (shadcn registry) — consumed as-is.
    "src/lib/dotmatrix-core.tsx",
    "src/lib/dotmatrix-hooks.ts",
    "src/components/ui/dotm-square-*.tsx",
  ]),
]);

export default eslintConfig;
