# Grade System Pro — Engineering Baseline

## Quality gate

    npm ci
    npm run check

The project remains offline-first and preserves the existing runtime contract in this step.

## Refactoring policy

Refactoring is incremental: behavior must remain compatible after each step, and every step ships as a runnable archive.
