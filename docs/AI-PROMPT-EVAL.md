# AI Prompt Eval

Purpose: lightweight regression checks for app-instruction query handling.

## App instructions suite

- Command: `npm run eval:app-instructions`
- Cases: `lib/ai/evals/app-instructions-cases.ts`
- Evaluates:
  - intent/tool usage expectation (`app_help_first`, `finance_first`, `mixed`)
  - top matched route from app knowledge retrieval

The suite currently contains 15 prompts focused on navigation/how-to flows, plus mixed app+finance prompts.
