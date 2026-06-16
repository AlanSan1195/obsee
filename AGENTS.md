# Repository Guidelines

## Project Structure & Module Organization

OBSREC is an Electron desktop app for OBS configuration guidance. Main-process code lives in `src/main/`, including OBS WebSocket integration, backups, preload APIs, and AI service code under `src/main/ai/`. The React/Vite renderer lives in `src/renderer/`, with UI components in `src/renderer/components/`, hooks in `src/renderer/hooks/`, and Tailwind styles in `src/renderer/styles/`. Shared types, validation, and local recommendation logic live in `src/shared/`. Tests are colocated as `*.test.ts` or `*.test.tsx`. Planning notes are kept in `plans/`; production outputs go to `dist/` and `release/`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies from `pnpm-lock.yaml`.
- `pnpm run dev`: start Vite and launch Electron in development mode.
- `pnpm run build:main`: compile Electron main-process TypeScript.
- `pnpm run build:renderer`: build the renderer with Vite.
- `pnpm run build`: compile both targets and package with `electron-builder`.
- `pnpm run lint`: run ESLint over `src/`.
- `pnpm run typecheck`: run TypeScript checks for main and renderer configs.
- `pnpm test`: run the Vitest suite once.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the existing style: two-space indentation, single quotes, semicolons, and named exports for reusable helpers. React components use `PascalCase` file and symbol names, such as `OBSComparison.tsx`; hooks use `useSomething.ts`; utility modules use lower camel case, such as `localRecommendation.ts`. Keep IPC-facing data validated in `src/shared/validation.ts` before crossing Electron boundaries. ESLint is configured in `eslint.config.mjs`; unused variables are errors unless argument names start with `_`.

## Testing Guidelines

Use Vitest for unit and component tests. Place tests beside the code they cover with names like `validation.test.ts` or `OBSComparison.test.tsx`. Prefer focused tests for validation, OBS config normalization, fallback recommendations, and renderer behavior that affects user decisions. Run `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` before submitting changes.

## Commit & Pull Request Guidelines

Recent history uses short, direct commit messages, often Spanish and occasionally prefixed with a type, for example `add: primera etapa de configuración de audio`. Keep commits focused and imperative. Pull requests should include a brief summary, test results, linked issue or plan when applicable, and screenshots or recordings for UI changes. Note any OBS, WebSocket, or Groq API setup needed to verify the change.

## Security & Configuration Tips

Do not commit `.env` or secrets. The desktop app should use `OBSREC_AI_API_URL`; keep `GROQ_API_KEY` and rate-limit secrets only in the Vercel backend environment. Treat OBS mutations carefully: validate inputs, preserve backup behavior, and document risky changes in the PR.
