/**
 * CI drift guard.
 *
 * Reads the installed @deepseek-ai/dsh-tools source and asserts that the
 * OFFICIAL_REJECTION_TEMPLATE prefix still appears in serviceAsk's
 * 'rejected' branch. Fails (exit 1) if upstream drifted.
 *
 * Note: the published source uses template-literal interpolation
 * (`the user rejected tool "${exec.name}"`), not a `{name}` placeholder.
 * The plugin's runtime check substitutes `{name}` for the actual tool
 * name; both forms reduce to the same `error.message`. We assert on the
 * stable human-readable prefix, which is what upstream would change if
 * they ever rewrote the message.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const PREFIX = 'the user rejected tool "'

let resolved: string
try {
  resolved = require.resolve('@deepseek-ai/dsh-tools')
} catch {
  console.error('FAIL  @deepseek-ai/dsh-tools not installed; run `pnpm install` first')
  process.exit(1)
}

const root = resolved.replace(/\/lib\/.*$/, '')
const candidates = [
  `${root}/src/index.ts`,
  `${root}/lib/index.js`,
]

let hit = false
for (const p of candidates) {
  if (!existsSync(p)) continue
  const src = readFileSync(p, 'utf8')
  if (src.includes(PREFIX)) {
    console.log(`PASS  found ${JSON.stringify(PREFIX)} in ${p}`)
    hit = true
    break
  }
}

if (!hit) {
  console.error(`FAIL  ${JSON.stringify(PREFIX)} not found in dsh-tools source — upstream likely drifted`)
  console.error(`       checked: ${candidates.join(', ')}`)
  process.exit(1)
}
