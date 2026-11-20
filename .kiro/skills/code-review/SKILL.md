---
name: code-review
description: Review a React/TypeScript file (.tsx/.ts) for typed props, named exports, error handling on async calls, and accessibility (aria labels, semantic HTML), then report findings grouped as Critical, Warnings, Suggestions, and Passed. Use this skill whenever the user asks to review, audit, lint, check, or give feedback on a React component, hook, or TypeScript file, or asks "is this component okay?" or "what's wrong with this file?", even if they do not say "code review".
---

# Code Review (React/TypeScript)

Review one file against four checks and report the result in a fixed summary format. The format is fixed so reviews are comparable across files and a reader can scan for blockers first.

## Scope

- Review the file the user names. If none is named, use the active editor file.
- Read the whole file before judging. Many problems only show up in context, for example an async call whose error is handled by a caller.
- Review only what the four checks cover. Do not comment on style, naming, or performance unless it directly affects a check. Do not edit the file unless asked.

## The four checks

### 1. Typed props
Why: untyped props hide contract errors until runtime.
- Every component has an explicit props type (`interface` or `type`) applied to its parameter. Inline object types are acceptable for tiny components.
- No `any` in props. `React.FC` without a props generic counts as untyped.
- Callbacks have specific signatures, not `Function`.
- Optional props are marked `?` and match how they are used.

### 2. Named exports
Why: named exports keep import names consistent and make renames and refactors safer.
- Components, hooks, and utilities use `export function Foo` or `export const Foo`.
- A `export default` is a finding. Exception: files a framework requires to default-export (for example route or page files). Say so when you apply the exception.

### 3. Error handling on async calls
Why: unhandled rejections fail silently and leave the UI in a loading or broken state.
- Every `await` or `.then()` on `fetch`, API clients, or other fallible calls is inside `try/catch` or has `.catch()`.
- `fetch` responses check `response.ok`, since `fetch` does not reject on HTTP errors.
- Async work in `useEffect` is wrapped in an inner async function, not an async effect callback.
- Errors reach the user (error state, message) or are deliberately rethrown. An empty `catch {}` or a bare `console.log` is a finding.
- Loading state is reset in `finally` or on both paths.

### 4. Accessibility
Why: semantic HTML and labels are what assistive technology and keyboard users rely on.
- Use semantic elements (`button`, `nav`, `main`, `ul/li`, `h1`-`h6`, `label`) rather than `div`/`span` with click handlers.
- Clickable non-button elements need a role, `tabIndex`, and keyboard handlers. Prefer switching to `button`.
- Icon-only buttons and links have `aria-label` or visible text.
- Every form input has an associated `<label>` (via `htmlFor`/`id` or wrapping) or `aria-label`.
- Images have `alt` (empty `alt=""` for decorative ones).
- Heading levels do not skip. Dynamic status messages use `role="status"` or `aria-live`, errors use `role="alert"`.
- ARIA is not redundant or wrong (for example `role="button"` on a `button`).

## Severity rules

Place each finding in exactly one section.

- **Critical**: causes runtime failure, a broken or inaccessible interaction, or silent data loss. Examples: unhandled async call that can leave the UI stuck, clickable `div` with no keyboard access, props typed `any` on a public component, input with no label.
- **Warnings**: likely to cause problems or breaks a convention, but works today. Examples: default export, missing `response.ok` check, `console.log`-only error handling, skipped heading level.
- **Suggestions**: optional improvements. Examples: extract a props type, tighten a callback signature, prefer a semantic element where a role already works.
- **Passed**: each check or sub-check that was verified with no issue.

If a check does not apply (for example no async calls in the file), list it under Passed as "n/a: <reason>".

## Output format

Use exactly this structure. Keep every section, and write "None" for empty ones (except Passed, which lists what was verified).

```markdown
# Code Review: <file path>

**Result:** <N> critical, <N> warnings, <N> suggestions

## Critical
- `<file>:<line>` <check>: <what is wrong>. Fix: <specific change>.

## Warnings
- `<file>:<line>` <check>: <what is wrong>. Fix: <specific change>.

## Suggestions
- `<file>:<line>` <check>: <improvement>.

## Passed
- Typed props: <what was verified>
- Named exports: <what was verified>
- Async error handling: <what was verified>
- Accessibility: <what was verified>
```

Guidelines for entries:
- Cite a line number for every finding so the reader can jump to it.
- Name the exact element, prop, or call, and give a concrete fix, ideally a one-line code snippet.
- Split the Passed bullets by sub-check when a check partly fails, for example "Accessibility: images have alt text; headings in order".
- Do not pad. A clean file gets a short review.

## Example

```markdown
# Code Review: src/components/OrderList.tsx

**Result:** 2 critical, 1 warning, 1 suggestion

## Critical
- `OrderList.tsx:18` Async error handling: `await fetch('/api/orders')` has no try/catch, so a network failure leaves `loading` true forever. Fix: wrap in try/catch and set an error state; reset loading in `finally`.
- `OrderList.tsx:42` Accessibility: `<div onClick={...}>` is not keyboard accessible. Fix: use `<button type="button" onClick={...}>`.

## Warnings
- `OrderList.tsx:60` Named exports: `export default OrderList`. Fix: `export function OrderList(...)` and update imports.

## Suggestions
- `OrderList.tsx:9` Typed props: `onSelect: Function` could be `(id: string) => void`.

## Passed
- Typed props: `OrderListProps` is declared and applied; no `any`.
- Accessibility: all inputs have labels; images have alt text.
```
