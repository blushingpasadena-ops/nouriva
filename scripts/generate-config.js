import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [key, ...rest] = line.split('=')
      return [key.trim(), rest.join('=').trim().replace(/^["']|["']$/g, '')]
    })
)

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
const missing = required.filter(k => !env[k] || env[k].includes('your-'))
if (missing.length) {
  console.error(`\nMissing values in .env: ${missing.join(', ')}`)
  console.error('Fill in your real Supabase credentials and run npm run setup again.\n')
  process.exit(1)
}

writeFileSync('config.js', `// Auto-generated from .env by \`npm run setup\` — DO NOT COMMIT
const SUPABASE_URL = '${env.SUPABASE_URL}'
const SUPABASE_ANON_KEY = '${env.SUPABASE_ANON_KEY}'
`)

console.log('✓ config.js generated from .env')
