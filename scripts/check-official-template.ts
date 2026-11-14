/**
 * CI drift guard.
 *
 * Reads the installed @deepseek-ai/dsh-tools package and asserts that the
 * rejection-text prefix still appears in the approval-denial path. Fails
 * (exit 1) if upstream drifted. A second assertion covers the structured
 * `ApprovalError` / `APPROVAL_REJECTED` identity that 0.2.2-rc.3+ records and
 * the plugin prefers — it is a persisted contract duplicated in the plugin, so
 * the guard is what keeps that duplication honest.
 *
 * Note: the published source uses template-literal interpolation
 * (`the user rejected tool "${exec.name}"`), not a `{name}` placeholder.
 * The plugin's runtime check substitutes `{name}` for the actual tool
 * name; both forms reduce to the same `error.message`. We assert on the
 * stable human-readable prefix, which is what upstream would change if
 * they ever rewrote the message.
 *
 * Location history (the literal moves between releases; the assertion only
 * depends on it existing somewhere in the shipped package):
 *   - <= 0.2.1-rc.*: `src/index.ts` in an unpacked tree, `lib/index.js` in
 *     the published bundle.
 *   - >= 0.2.2-rc.1: split into the execution pipeline — `src/pipeline.ts`,
 *     published as `lib/pipeline.js` (the `@deepseek-ai/dsh-tools/pipeline`
 *     sub-entry). `lib/index.js` no longer carries the string.
 *
 * Through 0.2.2-rc.1 the published tarball shipped no `src/` (`package.json#files`
 * listed only `lib/` and `locale/`, although `exports` still maps `./src/*`), so
 * the `src/` candidates fired only in a monorepo checkout. From 0.2.2-rc.3
 * `files` also ships `src`, so `src/pipeline.ts` now fires for a normal install
 * too — the layout-independent guard below still covers older tarballs.
 *
 * The fallback scan over every TOP-LEVEL `lib/*.js` chunk keeps the guard
 * working if a future release moves the literal to another entry. It is
 * deliberately not recursive: `lib/types/**` holds the unbundled `tsc` emit,
 * which can contain the literal in code the bundler no longer reaches, so
 * scanning it could mask a real drift. A guard failure is not proof of drift —
 * read the candidate list first.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const require = createRequire(import.meta.url)

const PREFIX = 'the user rejected tool "'

/**
 * The structured identity the plugin prefers on 0.2.2-rc.3+. It is a persisted
 * contract duplicated in `src/index.ts` because the entry does not re-export it;
 * this assertion is what keeps that duplication honest.
 */
const APPROVAL_CODE = 'APPROVAL_REJECTED'

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
  `${root}/src/pipeline.ts`, // 0.2.2-rc.1+ unpacked tree; tarballs from 0.2.2-rc.3
  `${root}/src/index.ts`,    // <= 0.2.1-rc.* unpacked tree
  `${root}/lib/pipeline.js`, // 0.2.2-rc.1+ published `./pipeline` sub-entry
  `${root}/lib/index.js`,    // <= 0.2.1-rc.* published bundle
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
  'rejection text',
  PREFIX,
  'upstream likely drifted; update OFFICIAL_REJECTION_TEMPLATE in src/index.ts',
)
requireNeedle(
  'structured approval identity',
  APPROVAL_CODE,
  'info-first detection would never fire; the literal match would be the only signal',
)
