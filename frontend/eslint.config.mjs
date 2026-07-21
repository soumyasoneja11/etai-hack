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
  ]),
  {
    // This project predates the strict React Compiler / eslint-plugin-react-hooks v6
    // ruleset shipped with Next 16, plus `no-explicit-any` from the TS preset.
    // These fire on legitimate, intentional patterns (mount-effect data loading,
    // vendored shadcn/ui components, chart-library `any` boundaries) and on known
    // false positives (e.g. passing a state value as a function argument being
    // reported as "immutability"). Downgrade them to warnings so they stay visible
    // and can be paid down incrementally without blocking CI.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
