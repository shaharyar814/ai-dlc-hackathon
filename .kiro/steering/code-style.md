---
inclusion: fileMatch
fileMatchPattern: "**/*.{ts,tsx}"
---

# Code Style (TypeScript and TSX)

- Match the existing code and the ESLint config. Run `npm run lint` after changes.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).
- No enums, namespaces, or constructor parameter properties (`erasableSyntaxOnly`). Use string-literal unions or `as const` objects.
- No unused locals or parameters. Remove them instead of prefixing with `_`.
- No `any`. Use `unknown` and narrow it.
- Prefer `const`, named exports, and small functions. Use function components and hooks only.
- One component per `.tsx` file, and export only components from it (react-refresh).
- Keep rule logic in plain `.ts` modules with no React, DOM, or storage access.
- Parse and compare timestamps in UTC. Treat an unparsable date as an invalid record, not an exception.
- Wrap `localStorage` access in `try/catch` and tolerate missing or corrupt values.
- Files: components in `PascalCase.tsx`, other modules in `camelCase.ts`.
- No comments that restate the code. Comment the reason for a non-obvious choice.
