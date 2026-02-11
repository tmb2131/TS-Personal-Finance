#!/usr/bin/env node

import { classifyQueryIntent } from '../lib/ai/intent-routing.ts'
import { findRelevantAppKnowledgeEntries } from '../lib/ai/app-knowledge.ts'
import { APP_INSTRUCTIONS_EVAL_CASES } from '../lib/ai/evals/app-instructions-cases.ts'

function intentToToolUsage(intent) {
  if (intent === 'app_instructions') return 'app_help_first'
  if (intent === 'finance') return 'finance_first'
  if (intent === 'mixed') return 'mixed'
  return 'finance_first'
}

function formatResultLine(caseItem, result) {
  const status = result.pass ? 'PASS' : 'FAIL'
  const routeNote = `${result.actualPrimaryRoute} (expected ${caseItem.expectedPrimaryRoute})`
  const toolNote = `${result.actualToolUsage} (expected ${caseItem.expectedToolUsage})`
  return `${status} ${caseItem.id} | tool=${toolNote} | route=${routeNote} | prompt="${caseItem.prompt}"`
}

function evaluateCase(caseItem) {
  const intent = classifyQueryIntent(caseItem.prompt)
  const actualToolUsage = intentToToolUsage(intent.intent)
  const entries = findRelevantAppKnowledgeEntries({
    query: caseItem.prompt,
    routeHint: caseItem.routeHint,
    maxResults: 3,
  })
  const actualPrimaryRoute = entries[0]?.route || 'none'

  const toolPass = actualToolUsage === caseItem.expectedToolUsage
  const routePass = actualPrimaryRoute === caseItem.expectedPrimaryRoute

  return {
    id: caseItem.id,
    toolPass,
    routePass,
    pass: toolPass && routePass,
    actualToolUsage,
    actualPrimaryRoute,
    intent,
  }
}

function run() {
  const startedAt = new Date()
  const results = APP_INSTRUCTIONS_EVAL_CASES.map((caseItem) => ({
    caseItem,
    result: evaluateCase(caseItem),
  }))

  const total = results.length
  const passed = results.filter((item) => item.result.pass).length
  const failed = total - passed
  const toolPassed = results.filter((item) => item.result.toolPass).length
  const routePassed = results.filter((item) => item.result.routePass).length

  console.log('App Instructions Prompt Eval')
  console.log(`Started: ${startedAt.toISOString()}`)
  console.log(`Cases: ${total}`)
  console.log(`Tool usage accuracy: ${toolPassed}/${total}`)
  console.log(`Route match accuracy: ${routePassed}/${total}`)
  console.log(`Overall pass: ${passed}/${total}`)
  console.log('')

  results.forEach(({ caseItem, result }) => {
    console.log(formatResultLine(caseItem, result))
  })

  if (failed > 0) {
    console.log('')
    console.log(`FAILED ${failed} case(s).`)
    process.exit(1)
  }

  console.log('')
  console.log('All app-instruction eval cases passed.')
}

run()
