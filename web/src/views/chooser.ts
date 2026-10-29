// Experiment chooser: a full-screen calm dialog over the bench with one large card per experiment.
// Shown at every page open (the remembered choice is pre-highlighted) and from the topbar button.
import { EXPERIMENTS, type Experiment } from '../apparatus/assembly'
import { at } from './assembly-i18n'

type Opts = {
  onChoose: (e: Experiment) => void
  /** The experiment being assembled now, or null at page open (the dialog can then not be dismissed). */
  active: () => Experiment | null
  remembered: () => Experiment | null
}

export function mountChooser(root: HTMLElement, { onChoose, active, remembered }: Opts) {
  let opener: HTMLElement | null = null
  const behind: HTMLElement[] = [] // what was live before: inert while the dialog is modal
  const cards = () => [...root.querySelectorAll<HTMLButtonElement>('[data-exp]')]
  const focusables = () => [...root.querySelectorAll<HTMLElement>('button')]

  function build() {
    const s = at()
    const mark = active() ?? remembered()
    root.innerHTML = `
      <div class="chooser-inner">
        <h2 id="chooser-title">${s.chooserTitle}</h2>
        <p class="chooser-lead" id="chooser-lead">${s.chooserLead}</p>
        <div class="chooser-cards">
          ${EXPERIMENTS.map((e) => {
            const c = s.cards[e]
            const badge = mark === e ? `<span class="exp-badge">${active() === e ? s.inProgress : s.chosen}</span>` : ''
            return `<button class="exp-card" data-exp="${e}"${mark === e ? ' aria-current="true"' : ''} aria-describedby="exp-${e}-goal exp-${e}-gear">
              <span class="exp-ref">${c.ref}</span>${badge}
              <strong class="exp-title">${c.title}</strong>
              <span class="exp-goal" id="exp-${e}-goal">${c.goal}</span>
              <span class="exp-gear-label">${s.gearLabel}</span>
              <ul class="exp-gear" id="exp-${e}-gear">${c.gear.map((g) => `<li>${g}</li>`).join('')}</ul>
              <span class="exp-go" aria-hidden="true">${s.start} ›</span>
            </button>`
          }).join('')}
        </div>
        <p class="hint">${active() ? s.chooserSwitchNote : ''}</p>
        ${active() ? `<button class="tool exp-keep" data-keep>${s.chooserKeep}</button>` : ''}
      </div>`
  }
  function open() {
    opener = document.activeElement as HTMLElement | null
    build()
    for (const el of root.parentElement!.children as Iterable<HTMLElement>) if (el !== root && !el.inert) ((el.inert = true), behind.push(el))
    root.hidden = false
    root.inert = false
    root.dataset.open = 'true'
    const mark = active() ?? remembered()
    ;(cards().find((c) => c.dataset.exp === mark) ?? cards()[0]).focus()
  }
  function close() {
    for (const el of behind.splice(0)) el.inert = false
    root.dataset.open = 'false'
    root.inert = true
    root.hidden = true
    opener?.focus?.()
  }
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'chooser-title')
  root.setAttribute('aria-describedby', 'chooser-lead')
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    if (b.dataset.exp) {
      close()
      if (b.dataset.exp === active()) return // the experiment already in progress: keep its assembly
      onChoose(b.dataset.exp as Experiment)
    } else if (b.dataset.keep !== undefined) close()
  })
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active()) {
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      const f = focusables()
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) ((e.preventDefault(), last.focus()))
      else if (!e.shiftKey && document.activeElement === last) ((e.preventDefault(), first.focus()))
    }
  })
  return { open, close, build, isOpen: () => root.dataset.open === 'true' }
}
