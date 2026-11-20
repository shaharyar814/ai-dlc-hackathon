# Verify First

Do not guess. Check, then act.

- Read a file before editing it. Read `docs/brd-stalled-order.md` before changing behavior.
- Look for an existing helper, type, or pattern before writing a new one.
- Confirm a library or API exists in `package.json` and `node_modules` before importing it. For anything version-sensitive (React 19, Vite 8, TypeScript 6, ESLint 10), check the installed version or the docs.
- If the BRD is silent or contradicts itself, ask. Do not pick an answer. The BRD's "Decisions made in this brief" are fixed unless the user changes them.
- State any assumption in the reply.
- Before reporting work as done, run `npm run lint` and `npm run build`, and run the tests once they exist. Compare the result to each requirement the user gave. Report any check I could not run.
- A command exiting with code 0 does not prove the behavior is right. Check the output or the behavior itself.
- Ask before: installing or removing dependencies, editing `package.json`, `vite.config.ts` or a tsconfig, deleting files, or adding anything the BRD lists as out of scope.
- Do not change the Vite `base`, `allowedHosts`, or `hmr` settings. They are tied to the IDE proxy.
