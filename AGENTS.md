# Repository Guidelines

## Project Structure & Module Organization

OBSREC (package `obsee`) is a web app for OBS configuration guidance, deployed on Vercel. The React/Vite frontend lives in `src/renderer/`, with UI components in `src/renderer/components/`, hooks in `src/renderer/hooks/`, browser-side services (OBS WebSocket manager, hardware detection, localStorage stores, AI client) in `src/renderer/lib/`, and Tailwind styles in `src/renderer/styles/`. Shared types, validation, and local recommendation logic live in `src/shared/`. Serverless API functions (Groq-backed AI, Tavily web search, rate limiting) live in `api/`. Tests are colocated as `*.test.ts` or `*.test.tsx`. Production build output goes to `dist/`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies from `pnpm-lock.yaml`.
- `pnpm run dev`: start the Vite dev server (proxies `/api` to production Vercel).
- `pnpm run build`: build the web app with Vite into `dist/`.
- `pnpm run lint`: run ESLint over `src/`.
- `pnpm run typecheck`: run TypeScript checks for the frontend.
- `pnpm run typecheck:api`: run TypeScript checks for the serverless functions.
- `pnpm test`: run the Vitest suite once.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the existing style: two-space indentation, single quotes, semicolons, and named exports for reusable helpers. React components use `PascalCase` file and symbol names, such as `OBSComparison.tsx`; hooks use `useSomething.ts`; utility modules use lower camel case, such as `localRecommendation.ts`. Validate data crossing to OBS or the API with `src/shared/validation.ts` (it also produces the Spanish UX error messages). ESLint is configured in `eslint.config.mjs`; unused variables are errors unless argument names start with `_`.

## Testing Guidelines

Use Vitest for unit and component tests. Place tests beside the code they cover with names like `validation.test.ts` or `OBSComparison.test.tsx`. Prefer focused tests for validation, OBS config normalization, fallback recommendations, and renderer behavior that affects user decisions. Run `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` before submitting changes.

## Commit & Pull Request Guidelines

Recent history uses short, direct commit messages, often Spanish and occasionally prefixed with a type, for example `add: primera etapa de configuración de audio`. Keep commits focused and imperative. Pull requests should include a brief summary, test results, linked issue or plan when applicable, and screenshots or recordings for UI changes. Note any OBS, WebSocket, or Groq API setup needed to verify the change.

## Security & Configuration Tips

Do not commit `.env` or secrets. Keep `GROQ_API_KEY`, `TAVILY_API_KEY`, and rate-limit secrets only in the Vercel backend environment — never in frontend code (`VITE_*` vars are public). The app talks to OBS over `ws://localhost:4455`; browsers only allow this from Chrome/Edge/Firefox (Safari blocks it). Treat OBS mutations carefully: validate inputs, preserve backup behavior (localStorage `obsrec-backup`), and document risky changes in the PR.
