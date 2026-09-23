# Progress

## 2026-09-23
- ZBLL preset search separates leading/trailing U-face AUF from the algorithm core. The requested HTM limit, result metrics, sorting, move-pattern filtering, and copy use the core only; the worker allows at most two additional boundary moves while exploring exact preset states.
- Each ZBLL result shows a small cube after its computed preAUF. Stickers fixed by the core remain bright; the others are dimmed. Other search modes keep their existing behavior.
- Removed the AUF-present filter from result controls. Kept AUF detection in solution analysis for now.
- Verified lint, build, 42 Playwright tests, and desktop/390px screenshots. The generated-cube test confirms the displayed core solves with AUF and preview colors match the prepared state.
- The user approved production publication after verification. Local preview: http://127.0.0.1:4175/.
