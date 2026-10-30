// Lab mode: the stored scan points as CSV, for the student's own analysis (LD P6.3.3.1 Tables 3–5).
import { type Apparatus, type Mode, type ReplayPoint, type Setup, type ZeroOffset, wrapTarget } from '../apparatus/apparatus'
import { crystalLabel, isForgeKey } from '../i18n'
import { CRYSTALS, WHEELS_MG_CM2, WHEELS_MM } from '../physics/tables'

/** The crystal as a CSV file names it: a preset's key, or a Forge crystal's name marked hypothetical (English, as the headers). */
const crystalCsv = (key: string): string => (isForgeKey(key) ? crystalLabel(key, 'en') : key)
/** One RFC 4180 field. A leading = + - @ (or tab/CR) would be run as a formula by a spreadsheet: an apostrophe defuses it. */
export const csvField = (v: string | number): string => {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
/** The crystal part of the download's file name: the preset key, or "forged-" and the sanitised name of a Forge crystal. */
export const fileCrystal = (key: string): string => (isForgeKey(key) ? `forged-${fileSafe(CRYSTALS[key]?.name ?? '')}` : key)
/** A file-name part: only [A-Za-z0-9_-]. */
export const fileSafe = (v: string, fallback = 'forged'): string => v.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || fallback

/** Stored-value arrays already exported, with how many points they held then (a scan grows while it runs). */
const exported = new WeakMap<ReplayPoint[], number>()

/** One exported scan with the setup it was made with (the apparatus keeps only its last scan). */
export type ExportRecord = {
  setup: Setup
  mode: Mode
  first: number // 0.1° units: the first and last stored angles
  last: number
  step: number // 0.1° units; 0 for a single point
  u: number // 0.1 kV
  i: number // 0.01 mA
  dt: number // s
  changed: boolean // a setting changed during the scan
  zero?: ZeroOffset // the goniometer's hidden zero error when the scan started (missing: aligned)
}

const records = new WeakMap<Apparatus, ExportRecord[]>()

/** The scans exported so far, oldest first. */
export const exportedScans = (a: Apparatus): readonly ExportRecord[] => records.get(a) ?? []

export const clearExports = (a: Apparatus): void => void records.delete(a)

/** The foils in the beam, joined (e.g. "Zr"), or "open" with none. */
const foilLabel = ({ collimatorFilter, sensorFilter }: Setup) =>
  [collimatorFilter, sensorFilter].filter((f) => f !== null).join('-') || 'open'

/** The apparatus' stored values (REPLAY) of the last auto-scan as CSV text; null if there is none. */
export function replayCsv(a: Apparatus, date = new Date()): string | null {
  const scan = a.lastScan
  if (!scan || a.replay.length === 0) return null
  const angle = scan.mode === 'SENSOR' ? 'sensor_deg' : 'beta_deg'
  return [
    '# Bragg reflection, simulated LD X-ray apparatus 554 800 (not measured data)',
    `# ${date.toISOString()}`,
    `# setup: holder ${scan.setup.holder}${scan.setup.holder === 'crystal' ? ` (${crystalCsv(scan.setup.crystal).replace(/[\r\n]+/g, ' ')})` : ''}; collimator filter ${scan.setup.collimatorFilter ?? 'none'}; sensor filter ${scan.setup.sensorFilter ?? 'none'}`,
    `# mode ${scan.mode}; at the start: U = ${(scan.u / 10).toFixed(1)} kV, I = ${(scan.i / 100).toFixed(2)} mA, dt = ${scan.dt} s`,
    `${angle},rate_per_s`,
    ...a.replay.map((p) => `${(p.angle / 10).toFixed(1)},${p.rate}`),
  ].join('\n') + '\n'
}

/** The apparatus' exposure log (EPN P1: one exposure per absorber) as CSV text, one row per exposure;
 * null if the log is empty. The set (I = Al, II = materials), slot, absorber, thickness (mm, the table's catalog value) and areal
 * density (mg/cm²) are empty when no plate is mounted, and the absorber reads "frame" with the rest empty when the frame blocks the beam. */
export function exposureCsv(a: Apparatus, date = new Date()): string | null {
  if (a.exposureLog.length === 0) return null
  const rows = a.exposureLog.map((e) => {
    const { holder, collimatorFilter, sensorFilter } = e.setup
    const plate = holder === 'alWheel' ? 'al' : holder === 'materialWheel' ? 'material' : null
    const slot = plate && e.slot !== null ? WHEELS_MG_CM2[plate][e.slot] : null
    // Open slot: "none", 0; frame in the beam: no slot, "frame"; no plate mounted: all three empty.
    const mm = plate && e.slot !== null ? WHEELS_MM[plate][e.slot] : null
    const set = plate === 'al' ? 'I' : plate === 'material' ? 'II' : ''
    const absorber = plate === null ? ['', '', '', ''] : e.slot === null ? ['', 'frame', '', ''] : [e.slot, slot?.[0] ?? 'none', mm ? mm[1] : 0, slot?.[1] ?? 0]
    return [
      (e.target / 10).toFixed(1), (e.sensor / 10).toFixed(1), e.mode ?? '', holder, set, holder === 'crystal' ? csvField(crystalCsv(e.setup.crystal)) : '', ...absorber,
      collimatorFilter ?? '', sensorFilter ?? '', (e.u / 10).toFixed(1), (e.i / 100).toFixed(2), e.dt, e.changed ? 1 : 0,
      Math.round(e.rate * e.dt), e.rate,
    ].join(',')
  }) // prettier-ignore
  return [
    '# Exposure series, simulated LD X-ray apparatus 554 800 (not measured data)',
    `# ${date.toISOString()}`,
    '# U_kV and I_mA are the values when counting started; changed = 1 if either changed while counting',
    '# rate_per_s is the mean rate over dt, as REPLAY shows it (counts / dt); set is the absorber set on the holder (I = Al, II = materials); thickness_mm and areal_density_mg_cm2 are those of the absorber in the beam',
    'target_deg,sensor_deg,mode,holder,set,crystal,slot,absorber,thickness_mm,areal_density_mg_cm2,collimator_filter,sensor_filter,U_kV,I_mA,dt_s,changed,counts,rate_per_s',
    ...rows,
  ].join('\n') + '\n'
}

/** The MCA spectrum on show as CSV text; null if it holds no counts. energy_keV comes only from the student's own
 * calibration (empty while uncalibrated: the true channel map is never written). Sample, U, I and the target are those of the run. */
export function mcaCsv(a: Apparatus, date = new Date()): string | null {
  const { mca } = a
  if (!mca.counts.some((c) => c > 0)) return null
  const { nChannels, gain, presetS } = mca.settings
  const cal = mca.calibration
  const r = a.mcaRunInfo ?? { sample: a.setup.sample ?? '', collimatorFilter: a.setup.collimatorFilter, sensorFilter: a.setup.sensorFilter, u: a.u, i: a.i, target: wrapTarget(a.target), changed: false }
  return [
    '# XRF spectrum, simulated LD 559 938 energy detector + MCA on the 554 800 (not measured data)',
    `# ${date.toISOString()}`,
    `# sample ${r.sample.replace(/[\r\n]+/g, ' ')}; U = ${(r.u / 10).toFixed(1)} kV, I = ${(r.i / 100).toFixed(2)} mA, target ${(r.target / 10).toFixed(1)} deg; collimator filter ${r.collimatorFilter ?? 'none'}; sensor filter ${r.sensorFilter ?? 'none'}`,
    ...(r.changed ? ['# conditions changed during the run'] : []),
    ...(mca.realS < presetS ? ['# stopped before the preset'] : []),
    `# ${nChannels} channels, gain ${gain}, preset ${presetS} s, real time ${mca.realS.toFixed(1)} s, live time ${mca.liveS.toFixed(1)} s`,
    cal ? `# energy calibration (student's): ${cal.kevPerChannel} keV/channel, offset ${cal.offsetKeV} keV` : '# uncalibrated: energy_keV is empty',
    'channel,energy_keV,counts',
    ...Array.from(mca.counts, (n, ch) => `${ch},${cal ? (cal.kevPerChannel * ch + cal.offsetKeV).toFixed(4) : ''},${n}`),
  ].join('\n') + '\n'
}

/** Save the MCA spectrum as a file download. */
export function downloadMcaCsv(a: Apparatus): void {
  const csv = mcaCsv(a)
  if (csv === null) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `xrf-mca-${fileSafe(a.mcaRunInfo?.sample ?? a.setup.sample ?? '', 'sample')}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

/** Save the exposure series as a file download. */
export function downloadExposureCsv(a: Apparatus): void {
  const csv = exposureCsv(a)
  if (csv === null) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `xray-exposures-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

/** Save the CSV as a file download. */
export function downloadCsv(a: Apparatus): void {
  const csv = replayCsv(a)
  if (csv === null) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = `bragg-scan-${a.lastScan!.setup.holder === 'crystal' ? `${fileCrystal(a.lastScan!.setup.crystal)}-` : ''}${foilLabel(a.lastScan!.setup)}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
  markExported(a)
}

export function markExported(a: Apparatus): void {
  exported.set(a.replay, a.replay.length)
  const s = a.lastScan
  const r = a.replay
  if (!s || r.length === 0) return
  const { setup, mode, u, i, dt, changed, zero } = s
  // The angles actually stored, not the limits: a scan stopped early covers less than it was set to.
  const [first, last] = [r[0].angle, r.at(-1)!.angle]
  const step = r.length > 1 ? r[1].angle - r[0].angle : 0
  records.set(a, [...exportedScans(a), { setup, mode, first, last, step, u, i, dt, changed, zero }])
}

/** The stored values on show were exported whole (not while the scan was still adding points). */
export function wasExported(a: Apparatus): boolean {
  return a.replay.length > 0 && exported.get(a.replay) === a.replay.length
}
