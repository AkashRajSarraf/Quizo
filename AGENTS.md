# Repository Guidelines

## Project Structure & Module Organization

Quizo is a dependency-free, static browser app. Keep the main files at the repository root:

- `index.html` defines the screens, controls, and element IDs used by the app.
- `styles.css` contains all responsive layout, theme, state, and animation styles.
- `app.js` owns quiz flow, scoring, timers, DOM updates, and `localStorage` persistence.
- `questions.js` provides the `QUESTIONS` data consumed by `app.js`; preserve its existing question-object shape and unique IDs.
- `REVAMP_PLAN.md` is planning documentation only, not an implementation requirement.

## Build, Test, and Development Commands

No package manager, build step, or automated test suite is configured. Open `index.html` directly in a modern browser for normal development. For a local URL, run:

```bash
python -m http.server 5500
```

Then visit `http://localhost:5500`. Use a hard refresh (`Ctrl+F5`) after changing JavaScript or CSS. Check browser DevTools for runtime errors.

## Coding Style & Naming Conventions

Use two-space indentation and retain the existing vanilla JavaScript style: semicolons, `const`/`let`, double-quoted strings, and small focused functions. Use camelCase for JavaScript variables and functions (`getWrongIds`), UPPER_SNAKE_CASE for fixed configuration (`STORAGE_KEYS`), kebab-case for CSS classes and HTML IDs (`topic-grid`), and descriptive `btn-*` IDs for controls.

Avoid adding frameworks or build tooling unless the change explicitly calls for them. When adding persisted state, define a stable key in `STORAGE_KEYS` and handle missing or malformed stored data safely.

## Testing Guidelines

Manually verify affected flows in Chrome, Edge, or Firefox. At minimum, start a quiz, submit correct and incorrect answers, test timed mode, finish the quiz, and confirm point, streak, and mistake-review persistence after a reload. Test a narrow viewport when editing layout. Add reproducible manual test notes to a pull request when behavior changes.

## Commit & Pull Request Guidelines

Existing history uses short, imperative subjects such as `add readme` and `add plan`. Follow that convention: `fix timer reset` or `add concurrency questions`. Keep commits focused. Pull requests should describe the user-visible change, list validation performed, link relevant issues when available, and include screenshots for visual HTML/CSS changes.
