/**
 * CI drift guard.
 *
 * Reads the installed @deepseek-ai/dsh-tools package and asserts that the
 * rejection-text prefix still appears in the approval-denial path. Fails
 * (exit 1) if upstream drifted.
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
 * The fallback scan over every top-level `lib/*.js` chunk keeps the guard
 * working if a future release moves the literal again inside the same
 * package.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
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
  `${root}/src/pipeline.ts`, // 0.2.2-rc.1+ unpacked source tree
  `${root}/src/index.ts`,    // <= 0.2.1-rc.* unpacked source tree
  `${root}/lib/pipeline.js`, // 0.2.2-rc.1+ published `./pipeline` sub-entry
  `${root}/lib/index.js`,    // <= 0.2.1-rc.* published bundle
]

const checked: string[] = []

/** Scan one file for the prefix, reporting a hit. */
const scan = (file: string): boolean => {
  if (checked.includes(file) || !existsSync(file)) return false
  checked.push(file)
  if (!readFileSync(file, 'utf8').includes(PREFIX)) return false
  console.log(`PASS  found ${JSON.stringify(PREFIX)} in ${file}`)
  return true
}

let hit = candidates.some(scan)

if (!hit) {
  // Fallback: any top-level published chunk, whatever its name.
  const libDir = `${root}/lib`
  if (existsSync(libDir)) {
    for (const name of readdirSync(libDir)) {
      if (!name.endsWith('.js')) continue
      if (scan(`${libDir}/${name}`)) { hit = true; break }
    }
  }
}

if (!hit) {
  console.error(`FAIL  ${JSON.stringify(PREFIX)} not found in dsh-tools source — upstream likely drifted`)
  console.error(`       checked: ${checked.length > 0 ? checked.join(', ') : '(no candidate file exists)'}`)
  process.exit(1)
}
