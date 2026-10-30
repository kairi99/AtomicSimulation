// Explore mode shows the physics (expected angles, λ, sliders, dragging the crystal). Lab mode shows
// only what the real bench shows: the panel, the arms and the raw counts.
export type AppMode = 'explore' | 'lab'

// Every page load starts in Lab (the stored mode is ignored): Explore is earned by finishing the lab tasks.
let mode: AppMode = 'lab'

export function getMode(): AppMode {
  return mode
}
export function setMode(m: AppMode): void {
  mode = m
  document.documentElement.dataset.mode = m
}

// A guided task hides the expected-angle overlays until its act step is done, so they can't give the
// answer away; the sliders and crystal drag stay.
let hints = true
export function setHints(on: boolean): void {
  hints = on
}
/** Draw the Explore overlays (expected angles, the λ < λmin band, nλ in the readout). */
export function showHints(): boolean {
  return mode === 'explore' && hints
}
