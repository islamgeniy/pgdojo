# PG Dojo

A local-first PostgreSQL practice studio with 50 original exercises, a real in-browser PostgreSQL engine, result-based grading, schema browser, hints, and browser-local progress.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. The PostgreSQL database runs in WebAssembly and persists in IndexedDB; no server, Docker, account, or cloud database is required.

## Keyboard

- `Ctrl+Enter` / `Cmd+Enter`: run the current query

## Test

```bash
npm test
npm run build
```

The suite runs all 50 reference queries against an in-memory PostgreSQL database and simulates key practice flows in the UI.

## Notes

- Practice mode intentionally accepts one read-only query.
- “Check answer” compares result columns, values, and duplicate rows. Ordering matters when the task requests it.
- “Reset data” restores the seeded dataset.
