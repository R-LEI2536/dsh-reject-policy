/**
 * CI drift guard.
 *
 * Reads the installed @deepseek-ai/dsh-tools package and asserts that the two
 * structured identity strings the plugin's detection depends on are still
 * there: the error name `ApprovalError` and the code `APPROVAL_REJECTED`
 * (`packages/core/tools/src/error-codes.ts` on 0.2.2-rc.3+). The plugin
 * duplicates these persisted-contract values locally because the upstream
 * entry does not re-export them; this guard is what keeps that duplication
 * honest. Fails (exit 1) if either has drifted.
 *
 * Detection matches the recorded identity only — the human-readable denial
 * text is no longer a runtime signal (the literal-text fallback was removed
 * when old-host support was dropped), so the guard no longer asserts on the
 * message text either.
 *
 * The identity values live in `src/error-codes.ts` in an unpacked tree and are
 * inlined into some published `lib/*.js` chunk after bundling. Candidates in
 * order: `src/error-codes.ts` (0.2.2-rc.3+ unpacked tree, and every published
 * tarball from 0.2.2-rc.3 — its `package.json#files` now ships `src`),
 * `src/pipeline.ts` (0.2.2-rc.1+ unpacked tree; rc.3 mentions the name in a
 * doc comment), `src/index.ts` (older unpacked tree), `lib/pipeline.js`
 * (0.2.2-rc.1+ published `./pipeline` sub-entry), `lib/index.js` (older
 * published bundle); then a fallback scan over every top-level `lib/*.js`
 * chunk.
 *
 * Through 0.2.2-rc.1 the published tarball shipped no `src/` (`package.json#files`
 * listed only `lib/` and `locale/`, although `exports` still maps `./src/*`), so
 * the `src/` candidates fired only in a monorepo checkout; the lib candidates
 * and the fallback scan covered tarballs. A guard failure is not proof of
 * drift — read the candidate list first.
 *
 * The fallback scan over every TOP-LEVEL `lib/*.js` chunk keeps the guard
 * working if a future release moves the constants to another entry. It is
 * deliberately not recursive: `lib/types/**` holds the unbundled `tsc` emit,
 * which can contain the strings in code the bundler no longer reaches, so
 * scanning it could mask a real drift.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const require = createRequire(import.meta.url)

/** Error name the registry records on approval denials — persisted contract, duplicated in `src/index.ts`. */
const APPROVAL_ERROR_NAME = 'ApprovalError'

/** Approval code for a call the user rejected — persisted contract, duplicated in `src/index.ts`. */
const APPROVAL_REJECTED_CODE = 'APPROVAL_REJECTED'

/**
 * Package root of the installed `@deepseek-ai/dsh-tools`. Resolve
 * `package.json` rather than the entry point: the entry's location (`lib/`,
 * or some future layout) is exactly what the guard must not assume.
 */
let root: string
try {
  root = dirname(require.resolve('@deepseek-ai/dsh-tools/package.json'))
} catch {
  console.error('FAIL  @deepseek-ai/dsh-tools not installed; run `pnpm install` first')
  process.exit(1)
}
const candidates = [
  `${root}/src/error-codes.ts`, // 0.2.2-rc.3+ unpacked tree; tarballs from 0.2.2-rc.3
  `${root}/src/pipeline.ts`,    // 0.2.2-rc.1+ unpacked tree (name in a doc comment on rc.3)
  `${root}/src/index.ts`,       // <= 0.2.1-rc.* unpacked tree
  `${root}/lib/pipeline.js`,    // 0.2.2-rc.1+ published `./pipeline` sub-entry
  `${root}/lib/index.js`,       // <= 0.2.1-rc.* published bundle
]
const libDir = `${root}/lib`

/** Read one candidate if it exists, recording that it was checked. */
const read = (file: string, checked: string[]): string | undefined => {
  if (checked.includes(file) || !existsSync(file)) return undefined
  checked.push(file)
  return readFileSync(file, 'utf8')
}

/** Find a needle in the candidates, then in every top-level published chunk. */
const findNeedle = (needle: string): { file: string | undefined; checked: string[] } => {
  const checked: string[] = []
  for (const file of candidates) {
    if (read(file, checked)?.includes(needle) === true) return { file, checked }
  }
  if (existsSync(libDir)) {
    for (const name of readdirSync(libDir)) {
      if (!name.endsWith('.js')) continue
      const file = `${libDir}/${name}`
      if (read(file, checked)?.includes(needle) === true) return { file, checked }
    }
  }
  return { file: undefined, checked }
}

/** Assert one upstream contract; a miss lists what was checked and exits 1. */
const requireNeedle = (label: string, needle: string, detail: string): void => {
  const { file, checked } = findNeedle(needle)
  if (file !== undefined) {
    console.log(`PASS  ${label}: found ${JSON.stringify(needle)} in ${file}`)
    return
  }
  console.error(`FAIL  ${label}: ${JSON.stringify(needle)} not found in dsh-tools`)
  console.error(`       ${detail}`)
  console.error(`       checked: ${checked.length > 0 ? checked.join(', ') : '(no candidate file exists)'}`)
  process.exit(1)
}

requireNeedle(
  'approval error name',
  APPROVAL_ERROR_NAME,
  'info-only detection would never fire; sync APPROVAL_ERROR_NAME in src/index.ts',
)
requireNeedle(
  'approval rejection code',
  APPROVAL_REJECTED_CODE,
  'info-only detection would never fire; sync APPROVAL_REJECTED in src/index.ts',
)
