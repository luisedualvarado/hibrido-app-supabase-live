import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initialEmployees } from '../src/data/initialEmployees.js'
import { initialHolidays, initialAbsences, defaultParameters } from '../src/data/initialHolidays.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const targetPath = path.join(repoRoot, 'src', 'data', 'publishedSnapshot.json')

function defaultSnapshot() {
  return {
    version: 2,
    employees: initialEmployees,
    holidays: initialHolidays,
    absences: initialAbsences,
    manualOverrides: [],
    params: defaultParameters,
    month: 5,
    year: 2026,
    manualParking: [],
    manualOffice93ByPeriod: {},
    manualLockersByPeriod: {},
    manualDeskAssignmentsByPeriod: {},
    savedWeeksByPeriod: {},
  }
}

async function loadSnapshotFromArg(arg) {
  if (!arg) return defaultSnapshot()

  const sourcePath = path.resolve(process.cwd(), arg)
  const raw = await readFile(sourcePath, 'utf8')
  return JSON.parse(raw)
}

async function main() {
  const snapshot = await loadSnapshotFromArg(process.argv[2])
  await writeFile(targetPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Published snapshot written to ${targetPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})