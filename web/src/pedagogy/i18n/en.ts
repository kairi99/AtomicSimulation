// Guided-task strings, English. Keys match es.ts (the Spanish is the original).
import type { PedagogyDict } from './es'

export const en: PedagogyDict = {
  learn: 'Learn',
  tasks: 'Guided tasks',
  // — Explore lock —
  exploreLocked: 'Explore unlocks when you finish this experiment’s lab tasks',
  exploreUnlocked: 'Experiment complete! Explore mode unlocked',
  // — end —
  otherPractices: 'Other practices (need a different setup)',
  back: 'All tasks',
  levels: ['', 'Intro', 'Core', 'Challenge'],
  steps: ['Predict', 'Act', 'Observe', 'Explain'],
  predictNumber: 'Your value',
  commit: 'Lock in my prediction',
  loading: 'Preparing the setup…',
  loadFailed: 'Could not load the crystal data. Check your connection and open the task again.',
  busyConfirm: 'A measurement is running. Stop it and prepare the task?',
  earlierExposures: (n: number) => `${n} earlier ${n === 1 ? 'exposure is' : 'exposures are'} logged; the task counts only new ones (the CSV includes them all).`,
  earlierRuns: (n: number) => `${n} earlier MCA ${n === 1 ? 'run is' : 'runs are'} logged; the task needs at least one new one (the CSV includes them all).`,
  waiting: 'The task completes by itself once you get there.',
  done: 'Done',
  explainNext: 'Show the explanation',
  yourPrediction: 'Your prediction',
  expected: 'Answer',
  restart: 'Start over',
  teacher: 'Note for teachers',
  modeNote: { explore: 'Explore mode', lab: 'Lab mode' },
  progressLabels: { open: 'open', polystyrene: 'polystyrene', xrfCu: 'Cu', xrfZn: 'Zn', xrfPb: 'Pb', xrfBrass: 'brass', xrfCal: 'calibration' },
  task: {
    background: {
      title: 'The counter with the tube off',
      concept: 'Counting statistics',
      predict: 'With the tube off (U = 0 kV), you leave the Geiger–Müller counter counting for 100 s. What rate do you expect it to show?',
      options: ['Exactly 0 counts per second', 'Something above zero, but very little', 'The same as with the tube on'],
      act: 'With U = 0 kV (or I = 0 mA), Δβ = 0 and Δt = 100 s or more, press SCAN and wait for it to finish (SCAN switches HV on, but with no voltage or no current the tube emits nothing). Do not change U or I while it counts. Then press REPLAY to see the mean rate.',
      observe: 'Read the mean rate on REPLAY and work out how many counts that is in total (rate × Δt). Compare it with the direct beam, with the tube on and no plate.',
      explain:
        'The counter cannot tell where a photon or particle comes from: cosmic rays and natural radioactivity in the surroundings also trigger it, always, at a low but non-zero rate: the background. These are random events: with N counts the uncertainty is ≈ √N, large compared with N when N is small; that is why you measure for ≥ 100 s. Any X-ray measurement has to subtract this background, especially when the sample’s rate is small.',
      teacher:
        'Expected result: ≈ 0.2 counts/s (≈ 20 counts in 100 s, ±4.5 Poisson), never exactly 0, and about 5000 times less than the open direct beam at 21 kV, 0.05 mA (≈ 10³/s). Typical mistakes: “no X-rays, zero counts” and “it is radiation left over in the tube”. Source: cosmic rays and natural radioactivity, not the tube; with U > 0 but I = 0 there is no emission either. The task is met by one finished exposure with U = 0 or I = 0, steady, of ≥ 100 s (EPN guide, Práctica 1); the value the student writes down is not checked. To discuss: when does subtracting the background matter?',
    },
    'attenuation-thickness': {
      title: 'Attenuation in aluminium',
      concept: 'Lambert’s law with a real beam',
      predict: 'As the aluminium thickness d grows, you plot ln T against d, with T = rate with plate / rate without. Lambert’s law says ln T = −μ d for a single wavelength. With the tube beam at 21 kV, what does the plot look like?',
      options: ['A straight line', 'A curve that flattens: it falls more slowly as d grows', 'A curve that steepens: it falls faster as d grows'],
      act: 'At 21 kV, 0.05 mA, Δβ = 0 and Δt = 30 s, open the doors, check that absorber set I (Al) is on the target holder (if not, drag it from the table onto the holder) and close them. With TARGET move the wheel to each slot (0°, 10°, … 60°; 0° is the open slot) and on each one press SCAN and wait for it to finish. Do not change U or I between slots. REPLAY shows each mean value; to note them all, download the exposure log on the Monitor.',
      actHelp: 'If a slot gets no ✓ or loses it, U or I changed while it counted or differ from the other slots. If you have all seven ✓ and the task does not advance, Δt was too short: repeat them with a longer Δt.',
      observe: 'Compute T for each plate (subtract the background first) and plot ln T against d. Also compute μ_eff = −ln T / d for the thinnest and the thickest plate: do they come out equal? To go further (about 25 min), repeat everything with the Zr filter on the collimator (21 kV, 0.15 mA, Δt = 200 s) and compare the shape.',
      explain:
        'Lambert’s law holds for a single wavelength. The tube beam is polychromatic: a bremsstrahlung continuum with the Mo K lines on top, and at 21 kV, just above the Mo K threshold, the lines are barely excited, so the continuum dominates. Soft photons (low energy, long λ) are absorbed first; with more thickness the remaining beam is harder (more energetic), penetrates better, and μ_eff = −ln T / d decreases: ln T against d bends and flattens. That is why a measured μ depends on the thickness range, not only on the material. The Zr filter does not turn the beam into Mo Kα: at 21 kV it removes the hard end (λ < 69 pm, above its K edge) and leaves a narrow 69–92 pm band; the line is only somewhat less curved and μ_eff comes out higher, farther from the Kα value.',
      teacher:
        'Answer: the second option (a curve that flattens). Al at 21 kV, 0.05 mA, as the apparatus reads it (τ = 100 µs, uncorrected): μ_eff/ρ = −ln T/(ρd) ≈ 6.4 cm²/g at 0.5 mm and ≈ 5.3 at 3 mm; the fit through the origin gives ≈ 5.7, with χ²/dof ≫ 1 (not a line). Without dead time they would be 6.9 → 5.4: dead time hides part of the curvature. For Mo Kα alone (xraylib) it would be 5.11. With the Zr filter (0.15 mA) the curve is somewhat less curved (≈ 6.5 → 5.8) and the fit rises to ≈ 6.1, farther from 5.11: at 21 kV the K lines are barely excited, and Zr removes the hard end of the continuum (59–69 pm, above its 18.0 keV K edge) and leaves a band of energies just below the edge (λ ≈ 69–92 pm). Local slopes between neighbouring plates fall further (down to ≈ 4.5 without Zr); ask for μ_eff = −ln T/d. Typical mistakes: “Lambert always gives a straight line”, “μ depends only on the material”, “Zr leaves pure Kα”, and using d in mm with μ/ρ in cm²/g without converting to ρd in g/cm². The task is met by exposures on all seven slots with the same U, I and filters, steady, unsaturated, and with a Δt such that the fall of μ_eff between 0.5 and 3.0 mm stands 5 Poisson σ above zero in the model (Δt ≳ 6 s is enough); the student’s μ is not checked. To discuss: which thickness range, U and filter should be quoted next to a μ?',
    },
    'attenuation-material': {
      title: 'Attenuation by material',
      concept: 'Absorption coefficient and atomic number',
      predict: 'With the tube at 30 kV, which lets more radiation through: a 0.5 mm plate of iron (Z = 26) or a 0.5 mm plate of zirconium (Z = 40)?',
      options: ['Iron', 'Zirconium', 'The same'],
      act: 'At 30 kV, Δβ = 0 and Δt = 30 s, open the doors, swap absorber set I for set II on the target holder (drag set I to the table, then drag set II onto the holder) and close them. With TARGET move the wheel to each slot (0°, 10°, … 60°) and take one exposure on each: the open slot at 0° (no plate), then polystyrene, Al, Fe, Cu, Zr and Ag. Do not mount filters. You may change I between slots, but not while it counts: if the saturation warning appears, lower I and repeat that slot; if a plate gives very few counts, raise I or lengthen Δt.',
      actHelp: 'Note the I of each slot. If a slot gets no ✓, the counter saturated, the rate was too close to the background, or U or I changed while it counted.',
      observe: 'Compute T = (rate with plate − background) / (rate without plate − background) for each plate, with the background you measured with the tube off. If you used a different I, first scale the rate without a plate by the ratio of currents. Rank the materials by T: does the order match that of Z?',
      explain:
        'At a given energy, μ/ρ usually grows with Z, but not always. As the photon energy rises, absorption jumps at the K edge: from that energy the photon can eject a K-shell electron. The Zr K edge is at 18.0 keV, just above the Mo Kα line (17.5 keV): Kα, intense at 30 kV, falls in Zr’s low-absorption window and goes through (Kβ, 19.6 keV, lies above the edge and is absorbed). Fe and Cu, lower in Z, have their K edges far below (7.1 and 9.0 keV), so their K shell absorbs Kα strongly; likewise Ag (Z = 47, edge at 25.5 keV) lets more through than Cu. What matters is the photon energy relative to the edge, not Z alone.',
      teacher:
        'Answer: zirconium. At 30 kV, 0.5 mm (no dead time or background): T ≈ 0.97 polystyrene, 0.56 Al, 1.3 × 10⁻³ Fe, 1.3 × 10⁻⁴ Cu, 1.6 × 10⁻³ Zr, 3.9 × 10⁻⁴ Ag; ranked by T: PS > Al > Zr > Fe > Ag > Cu. Zr transmits more than Fe and Cu because Mo Kα (17.5 keV) lies in its low-absorption window, just below its K edge (18.0 keV): ≈ 70 % of what passes through the Zr plate is Kα; Kβ (19.6 keV) is above the edge and is absorbed. Fe and Cu only pass the hard end of the continuum (≈ 23–29 keV); Ag beats Cu because Kα lies below its K edge (25.5 keV). Current: the EPN guide uses 0.02 mA on the first three slots and 1 mA on the rest, but at 0.02 mA polystyrene and the open beam already exceed the app’s saturation threshold (Rτ ≈ 0.31, ≈ 2400/s observed), and at 1 mA the open beam exceeds it by far: read them at 0.01 mA (≈ 1400/s). At 0.01 mA and 30 s Cu (≈ 0.4/s) and Ag (≈ 0.8/s) stay below 5 σ above the background: Ag needs 0.02 mA or more, and Cu even 0.05 mA is not enough, so use 1 mA as the guide does, or a longer Δt. If currents are mixed, correct for dead time (R = m/(1 − mτ), τ = 100 µs) before scaling the open beam by I; uncorrected, T of the heavy plates comes out 8–16 % high. Typical mistakes: “μ always grows with Z”, mixing up the tube’s 30 kV with the photon energy, not scaling by I, and “fixing” the Zr point in μ/ρ against Z. The task is met by all seven slots at 30 kV, with the same filters, steady, unsaturated and 5 σ above the background; the student’s μ is not checked. To discuss: the Ag K edge is also above Mo Kα; why does it transmit less than Zr? (Kα is far from its edge and, on the same side of an edge, μ/ρ grows with Z: 26.6 against 16.3 cm²/g; Ag is also denser, 10.5 against 6.5 g/cm³.)',
    },
    'kalpha-third-order': {
      title: 'Kα in third order',
      concept: 'Diffraction orders',
      predict: 'In first order, Kα shows up at θ = 7.24°. At which angle θ do you expect third-order Kα?',
      options: [],
      act: 'Switch HV on and turn the crystal: drag it in Goniometer or use ADJUST in ⚙︎ Settings. Try your angle, then find where the counter receives third-order Kα.',
      observe: 'At 3 × 7.24° only the weak continuum arrives; Kα shows up a little further on, with the counter at 2θ. In “Path difference” (λ button), 2d sin θ = 3λ.',
      explain:
        'Bragg’s law, nλ = 2d sin θ, fixes sin θ, not θ: for n = 3, sin θ triples and θ = 22.21°, not 21.72°. Same λ; only the order changes. The “reflection” is interference: waves scattered by neighbouring planes add up only at these angles.',
      teacher:
        'Answer: θ = 22.21° (leaflet Table 2); the task is met on the nearest 0.1° step, 22.2°. Typical mistake: 21.72°, from tripling θ; only continuum arrives there. Another: thinking the third order is a different λ. To discuss: up to which order does the geometry allow Kα? (nλ ≤ 2d, n ≤ 7).',
    },
    'lif-kalpha-angle': {
      title: 'Kα with another crystal',
      concept: 'Bragg’s law and the crystal',
      predict: 'With NaCl (d = 282.01 pm), the Mo Kα line shows up in first order at θ = 7.24°. In this task the crystal is LiF, with d = 201.35 pm. At which angle θ do you expect first-order Kα?',
      options: [],
      act: 'In COUPLED mode (β = θ), scan from 1.5° below your angle to 1° above it, with Δβ = 0.1° or smaller, and press SCAN. That way both Kα and Kβ fit in. If the Kα peak does not show up, correct the window and repeat.',
      observe: 'The Kα peak sits to the right of NaCl’s 7.24°, and Kβ, on its left, has moved too: the two peaks are further apart. In “Path difference” (λ button), 2d sin θ = λ with the LiF d.',
      explain:
        'The Kα wavelength is the same, 71.1 pm: the tube emits it, and the crystal only picks the angle at which it reaches the counter. In first order, Bragg’s law gives sin θ = λ / (2d): with a smaller d, sin θ and θ grow. With LiF, θ = 10.17°; with NaCl, 7.24°. That is why Kα and Kβ are further apart with LiF (1.15° against 0.82°): a crystal with a smaller d spreads the wavelengths further.',
      teacher:
        'Answer: θ = arcsin(71.08 / (2 × 201.35)) = arcsin(0.1765) = 10.17° (NaCl: arcsin(71.08 / 564.02) = 7.24°). With LiF, Kβ falls at 9.01°. Typical mistake: “the angle depends only on the tube” (7.24°). Another: scaling θ, not sin θ, by the ratio of d; that gives 10.14°, nearly right at small angles, but in 3rd order it would give 31.1° instead of 32.0°. Another still: using a₀ = 402.7 pm instead of d = a₀/2 (gives 5.06°). The model includes secondary extinction with an assumed mosaic spread: in it, LiF reads ≈ 1.1 times NaCl’s height; a real piece may differ (its mosaic spread is unknown), so the ≈ 10 % difference between LiF and NaCl means nothing; the ≈ 25× gap to Si or calcite (perfect versus mosaic crystal) is real physics. The task is met by a COUPLED scan on LiF that covers the line ±0.7°, with Δβ ≤ 0.23° and 5 σ above the background according to the model; the student’s number is not checked. To discuss: up to which order does the geometry allow Kα with LiF? (nλ ≤ 2d, n ≤ 5).',
    },
    'line-threshold': {
      title: 'Line threshold',
      concept: 'Characteristic lines',
      predict: 'If you lower the voltage U, below which value does the Kα line disappear?',
      options: ['17.4 kV', '20.0 kV', 'Never: the crystal always reflects Kα at that angle'],
      act: 'Run a scan (SCAN) from 5° to 9°. Lower U (slider in Goniometer, or U and ADJUST in ⚙︎ Settings) and repeat until Kα is gone but X-rays still reach its angle. Tip: speed up time.',
      observe: 'Kα and Kβ vanished together, but bremsstrahlung (the continuum) still reaches their angle.',
      explain:
        'Kα takes two steps: a beam electron knocks a K-shell electron out of Mo (eU > 20.0 keV), then an L electron fills the hole and emits a photon of only 17.4 keV. The continuum at that angle only needs λmin < λ(Kα), i.e. U > 17.4 kV. Just above 20 kV the line is still very weak.',
      teacher:
        'Answer: 20.0 kV, where eU equals the Mo K binding energy (20.0 keV). The distractor 17.4 kV is hc/λ(Kα), where λmin = λ(Kα). Kβ (19.65 keV) also vanishes at 20.0 kV, not 19.65: the threshold is the K shell. The line grows as (U/U_K − 1)^1.67 and is hardly visible below about 22 kV: to measure the threshold, extrapolate the peak area at several U to zero, at low current (0.1 mA) to avoid dead time. See docs/teacher-key.md.',
    },
    'lambda-three-orders': {
      title: 'λ from three orders',
      concept: 'Measuring wavelengths',
      predict: 'From each order n you will compute λ = 2d sin θ / n for Kα. What do you expect?',
      options: ['The same λ in all three orders', 'A shorter λ in each higher order', 'A longer λ in each higher order'],
      act: 'Set up a COUPLED scan that covers the first three orders of Kβ and Kα, with a fine step Δβ and a long Δt, as in the leaflet. When it ends, download the data with CSV on the Monitor. If it doesn’t complete, check that the scan starts before the first peak and ends after the last one, that the weakest peak stands out from the noise, and that the CSV is from the finished scan. Before measuring, calibrate the zero (leaflet P7.1.2.1): with the crystal in, in COUPLED go to the first-order Kα maximum, optimise the target in TARGET and the sensor in SENSOR for maximum rate, then press TARGET, COUPLED and β LIMITS together (within 3 s; keyboard Shift+Z) to store it. An uncalibrated scan shifts every peak and will not count.',
      observe: 'You have three Kβ–Kα pairs: in each higher order the pair is further apart and weaker.',
      explain:
        'Find the centre of each peak, compute λ = 2d sin θ / n with d = a₀/2 = 282.01 pm, and average the orders. If all give the same λ, you have confirmed Bragg’s law: the order changes the angle, not the wavelength.',
      teacher:
        'Analysis outside the app (~20 min). Expected values in docs/teacher-key.md (Tables 3–5, simulated data). Typical mistakes: using a₀ = 564.02 pm instead of d = a₀/2 (λ comes out doubled), taking the sensor angle (2θ) as θ, assigning a peak to the wrong order. To discuss: why does the Kβ–Kα pair spread apart in higher orders?',
    },
    'moseley-k-edges': {
      title: 'Moseley’s law',
      concept: 'K absorption edges',
      predict: 'A Zr foil (Z = 40) and an Ag foil (Z = 47) absorb strongly for photon energies above their K-edge energy (the energy needed to remove a K-shell electron). Scanning β, where do you expect the Ag edge relative to the Zr edge?',
      options: ['At a smaller β than Zr’s', 'At the same β', 'At a larger β than Zr’s'],
      act: 'At 35 kV and 1 mA, in COUPLED, scan from 3.7° to 7.5° with Δβ = 0.1° and Δt = 5 s. Make one scan without a foil and one with each foil (Zr, Mo, Ag, In). To change foils, switch HV off, open the doors, put the foil in the sensor slot from Setup and close them. After each scan, download the CSV on the Monitor. All scans must share the same U and I. Variant: repeat all the scans on the LiF crystal (d = 201.35 pm), chosen in Setup. First, translate NaCl’s 3.7°–7.5° window to LiF with Bragg’s law. Before measuring, calibrate the zero (leaflet P7.1.2.1): with the crystal in, in COUPLED go to the first-order Kα maximum, optimise the target in TARGET and the sensor in SENSOR for maximum rate, then press TARGET, COUPLED and β LIMITS together (within 3 s; keyboard Shift+Z) to store it. An uncalibrated scan shifts every peak and will not count.',
      actHelp: 'If a foil gets no ✓, check the limits, Δβ, and that U and I match the scan without a foil.',
      observe: 'As β increases, the transmission T = rate with foil / rate without jumps up at a different angle for each foil. The Kα and Kβ peaks come from the tube: they appear without a foil too and nearly cancel in T.',
      explain:
        'Below θ_K (λ < λ_K) a photon has the energy to eject a K electron and is absorbed; above θ_K it does not, so the transmission rises. Compute λ_K = 2d sin θ_K with your crystal’s d (NaCl: 282.01 pm; LiF: 201.35 pm). The higher Z is, the more strongly the nucleus pulls on the K electrons: the binding energy rises, λ_K gets shorter and, by Bragg’s law, the Ag edge lies at a smaller θ than the Zr edge. Moseley’s law holds for the edges too: √(1/λ_K) = √R (Z − σ_K), with R the Rydberg constant (the squared slope) and σ_K the screening constant, how much the other electrons reduce the charge the K electron feels (−intercept / slope). With NaCl your R will come out a few % below R∞ = 1.097 × 10⁷ m⁻¹, from physics and from the counter’s finite angular resolution; with LiF, which spreads the angles further, the gap is smaller.',
      teacher:
        'Answer: the first option; the Ag edge falls at θ ≈ 4.94° and the Zr edge at ≈ 7.02° (higher Z → shorter λ_K → smaller θ). Typical mistakes: “more Z or more energy, larger angle”; keeping the ¾ factor of the Kα line (an edge has none: R would come out 33 % high); taking the tube’s Kα/Kβ peaks for edges. The fit should give R ≈ 1.06 × 10⁷ m⁻¹ and σ_K ≈ 2.9, R ≈ 3.5 % below R∞ (±1 % noise): ≈ 1.3 % is physics (relativity and screening that grows with Z) and ≈ 2.3 % is the counter’s resolution bias. LiF variant (d = 201.35 pm): the edges fall at ≈ 6.3° (In), 6.9° (Ag), 8.9° (Mo) and 9.8° (Zr), so the window becomes ≈ 6.0°–10.2° (worked out from the crystal’s d; all scans of a group must be on the same crystal, and NaCl and LiF are not mixed). NaCl’s window translated to LiF is 5.2°–10.5°. On LiF the noise-free model gives R ≈ 1.09 × 10⁷ m⁻¹ (≈ 1 % below R∞) and σ_K ≈ 3.4–3.6, depending on the window: with a larger dispersion dθ/dλ, the same angular resolution shifts λ_K less. The Zr edge sits 0.3° from Kα, so its value depends on how far the scan goes. To discuss: why does LiF give an R closer to R∞? To discuss: why does the transmission rise with λ at the edge instead of falling? See docs/teacher-key.md (Moseley).',
    },
    'xrf-calibration': {
      title: 'First fluorescence spectrum',
      concept: 'Energy calibration of the MCA',
      predict: 'With channels and gain fixed, every channel covers the same energy interval. Suppose channel 0 is 0 keV and the Cu Kα (8.04 keV) falls in channel 100. In which channel would the Pb Lα (10.56 keV) fall?',
      options: [] as string[],
      act: 'Follow the guide’s order: SENSOR mode, ADJUST the sensor arm to 90°; open the door and, in Setup, mount the energy detector and the XRF sample Cu; TARGET mode, target to 45.0°; close the door and switch HV on. In the MCA: 512 channels, gain −2.5, 180 s, Start. When it ends, mark the Cu Kα with the cursor and press “Use cursor” in Point 1 (8.04 keV). Swap to Pb (HV off, door, Setup), Clear and Start; mark the Pb Lα in Point 2 (10.56 keV) and press Calibrate.',
      actHelp: 'The MCA holds one spectrum at a time; Clear keeps the calibration and the points already entered. If it gets no ✓: target at 45.0°, HV on, the full 180 s and nothing changed while it counted. Changing channels or gain wipes the spectrum and the calibration.',
      observe: 'Each element leaves its peaks in channels of its own, and the Pb one sits to the right of Cu. After calibrating, the axis changes to keV and the lines fall at their reference energies. Near 17 keV every spectrum shows the tube’s Mo Kα and Kβ, scattered by the sample.',
      explain:
        'The MCA only counts pulses per channel; the gain and the number of channels set the keV per channel (here ≈ 0.078 keV). A real MCA also has an offset b, so it is calibrated with two known lines, E = m · N + b, and redone after changing channels or gain. In this simulator b = 0 (a simplification).',
      teacher:
        'Answer: ≈ 131 (10.56 / 8.04 · 100). In the model’s spectrum Cu Kα falls near channel 103 and Pb Lα near 135 (channel width 0.0781 keV at 512 channels, gain −2.5; the model’s Pb Lα centroid is 10.54 keV). Typical mistakes: taking Pb Lβ (12.6 keV) for Lα (the check fails); taking the Mo peaks near 17 keV (tube, scattered) for sample lines; reading a channel number as an energy. The task is met by a Cu and a Pb spectrum measured after the act step opened, at 45.0°, HV on, unchanged while counting and at the current channels and gain, where Cu Kα and Pb Lα stand out by at least 5 σ in the app’s fit (at 35 kV, 1 mA and 180 s: ≳ 49 σ in the model; the absolute scale is uncertain), and by a calibration that sends those two channels to their reference energies within at most one channel width (the guide’s, 8.04 and 10.56 keV, does). The 45° target is checked only by the task: the model fixes ψ₁ = ψ₂ = 45°. To discuss: why does the guide use two lines and not one?',
    },
    'xrf-brass': {
      title: 'Composition of brass',
      concept: 'Overlapping lines',
      predict: 'In the spectrum of brass (Cu, Zn and a little Pb), what do you expect between 7.5 and 10 keV?',
      options: ['One isolated peak per element', 'Four separate peaks: Kα and Kβ of Cu and Zn', 'Peaks that overlap and cannot be told apart by eye'],
      act: 'Set the target (β) to 45.0° (the task reset it). Measure Cu, Zn, Pb and the CuZn39Pb3 brass, all at 35 kV, 1 mA, 512 channels, gain −2.5 and 180 s. With the calibrated MCA, fit the lines in the Line fit panel or download the CSV. Divide each area by its live time and compute w = A / A_pure, normalised to 100 %.',
      actHelp: 'To swap samples: HV off, open the door, Setup, close, HV on, Clear and Start. If the energy detector is not mounted, set it up as in “First fluorescence spectrum”. You can speed up time. If it gets no ✓: target at 45.0°, the full 180 s and the same U, I, filters, channels and gain for every sample. Standards from before this task count; the brass must be measured now.',
      observe: 'Zn Kα (8.63 keV) and Cu Kβ (8.91 keV) merge into one broad peak, and Pb barely shows. The fixed-centre fit gives each line its area.',
      explain:
        'Each element emits several lines and the detector has a finite resolution (FWHM ≈ 0.4 keV near 8 keV): Zn Kα and Cu Kβ are only 0.27 keV apart, less than one FWHM, so they must be fitted together. A line area is proportional to the amount of the element: compared with the pure standard (per live time) it gives the fraction. The result is first-order; matrix absorption and secondary fluorescence shift it by a few percentage points.',
      teacher:
        'Analysis outside the app (~20 min; 4 × 180 s of counting: use time acceleration). The task’s recipe: divide each area by the live time and compute w = A / A_pure, normalised. The fixed-centre fit on noiseless spectra gives Cu 56.4 / Zn 41.0 / Pb 2.7 %; nominal 58 / 39 / 3 %. LD also weights by density (61.1 / 35.2 / 3.7 % in the model; LD publishes 61.6 / 35.6 / 2.9 %); in a thick sample the density cancels to first order (I ∝ w / χ), so that weighting has no first-order basis. The bias is the method’s (matrix absorption and secondary fluorescence), not the data’s. Answer: the third (Cu Kβ 8.91 keV on Zn Kα 8.63 keV: 0.27 keV, less than one FWHM ≈ 0.41 keV at 8 keV). Typical mistake: one element, one isolated peak. The task is met by the three standards (they may predate the act step) and a brass measured after it, all on one beam (same U, I, filters, channels and gain), at 45.0° with HV on and unchanged, where each standard’s main line and Cu Kα, Zn Kα and Pb Lα of the brass stand out by at least 5 σ; the student’s composition is not checked. At 35 kV, 1 mA, 180 s: Cu Kα ≈ 73 σ, Zn Kα ≈ 58 σ, Pb Lα ≈ 7.4 σ (with 60 s only 4.1 σ: not met); all in the model, whose absolute scale is uncertain.',
    },
    'xrf-coin': {
      title: 'The one-centavo coin',
      concept: 'Which part of the sample is measured?',
      predict: 'The 1 centavo coin (2003) is copper-coloured, but a magnet attracts it. What will its spectrum show?',
      options: ['Strong Fe lines and weak Cu lines', 'Strong Cu lines and weak Fe lines', 'Fe and Cu about equal', 'Only Cu lines'],
      act: 'The task reset the target to 0°: TARGET mode and ADJUST to 45.0°. With HV off and the door open, in Setup put the 1 centavo (2003) coin on the holder; close the door, switch HV on and, in the MCA, Clear and Start (35 kV, 1 mA, 512 channels, gain −2.5, 180 s). With the calibrated MCA, identify the lines.',
      actHelp: 'If the energy detector is not mounted, set it up as in “First fluorescence spectrum”. If it gets no ✓: target at 45.0°, HV on, the full 180 s and nothing changed while it counted. A weak line needs time.',
      observe: 'Cu dominates, but Fe clearly shows: the copper is a thin layer on steel.',
      explain:
        'The fluorescence that reaches the detector comes from the top tens of µm: deeper, it is absorbed before it escapes. The attenuation length of Cu Kα in Cu is ≈ 21 µm, so the plating gives a Cu signal almost like bulk Cu. Fe Kα crosses the plating with ≈ 12 µm attenuation length and the incident beam is attenuated too, so the Fe of the core looks weak. A first-order calculation would say “almost pure copper”, yet the coin is only a few % Cu by mass: fluorescence sees the surface, not the bulk.',
      teacher:
        'Answer: the second. Ecuador 1 centavo 2003, copper-plated steel (magnetic); Cu plating ≈ 18 µm (an estimate, no mint publishes it), comparable to the attenuation length of Cu Kα in Cu (≈ 21 µm). The model gives Cu Kα ≈ 30 × Fe Kα; at 35 kV, 1 mA and 180 s: Cu Kα ≈ 100 σ, Fe Kα ≈ 16 σ (in the model; the absolute scale is uncertain). The real 559 938’s housing can show Fe, Cu, Zn and Au lines (instruction sheet): compare with the pure-Cu spectrum, where Fe is absent. Typical mistake: “XRF measures the bulk composition”. The task is met by a coin spectrum measured after the act step opened, at 45.0°, with HV and unchanged, where Cu Kα and Fe Kα stand out by at least 5 σ. To discuss: what would you expect with a 2 µm plating? And with a 100 µm one?',
    },
    'forge-kalpha-10deg': {
      title: 'Design a crystal for Kα at 10°',
      concept: 'Bragg’s law and the spacing d',
      predict: 'In the Forge you can design a crystal. You want the Mo Kα line (λ = 71.08 pm) to show up in first order at θ = 10°. What spacing d (in pm) does the crystal need?',
      options: [] as string[],
      act: 'In the Forge design a crystal with that d: for example, a “Rock-salt type” lattice with cut (2 0 0), where d = a/2, and the right edge a. Open the doors, press “Use on the bench” and close them. Run a COUPLED scan from 9° to 11° with Δβ = 0.1°.',
      actHelp: 'If it does not complete, check that the crystal comes from the Forge, that its d is within 1 % of your value and that the peak stands out from the noise (lengthen Δt).',
      observe: 'The Kα peak falls at 10°, not at NaCl’s 7.24°: the Forge’s “Reflection orders” table gave you that θ before you measured. The crystal sets the angle; the tube only sets λ.',
      explain:
        'Bragg’s law, sin θ = λ / (2d), solved for d: d = λ / (2 sin θ) = 71.08 / (2 sin 10°) ≈ 205 pm. That is almost LiF’s d (201 pm): a rock-salt cell with a ≈ 409 pm and cut (2 0 0) will do. A “hypothetical” crystal follows the same angle rules; only its heights are an estimate.',
      teacher:
        'Answer: d = 71.08 / (2 sin 10°) = 204.7 pm (task tolerance: 1 %). In rock salt with cut (2 0 0), d = a/2, so a ≈ 409.4 pm (LiF: 402.7 pm). Typical mistake: taking a for d and setting a = 204.7 pm: d comes out 102.3 pm and Kα falls at θ ≈ 20.3° (the Forge table shows it before measuring). Scaling θ instead of sin θ from NaCl gives 204.2 pm, within 1 %: at 10° sin θ ≈ θ; the difference shows at large angles. The task is met by a stored, finished, unchanged COUPLED scan of a Forge crystal with d within 1 %, covering θ ± 0.7° with Δβ ≤ 0.23° and Kα 5 σ above the background according to the model; the student’s number is not checked. At 35 kV, 1 mA and Δt = 1 s the line is ≈ 47 σ.',
    },
    'forge-si-222': {
      title: 'Silicon: the second order of (111)',
      concept: 'Interference inside the cell',
      predict: 'On silicon’s (111) face, Bragg’s law gives an angle for each Kα order: θ₁ for (111), θ₂ for (222) and θ₃ for (333). Will a Kα peak show up at θ₂?',
      options: ['Yes, weaker than the first', 'No: the second order is forbidden and only continuum arrives', 'Yes, stronger than the first'],
      act: 'In the Forge, under “Start from…”, pick Si (diamond type, cut (1 1 1)). Open the doors, press “Use on the bench” and close them. Run a COUPLED scan from 5° to 21° (Kα orders 1 to 3) with Δβ = 0.2° and Δt = 5 s, at 35 kV and 1 mA, the apparatus maxima: Si is a perfect crystal and reflects little. It is almost 7 min of counting: speed up time. If the peaks look small, press “Zoom” on the Spectrum.',
      observe: 'There is a peak at θ₁ ≈ 6.5° and at θ₃ ≈ 19.9°, but at θ₂ ≈ 13.1° only continuum. The Forge’s “Reflection orders” table marks 2 as forbidden.',
      explain:
        'In diamond, each atom has a partner shifted by ¼ of the cube diagonal. In (222), that partner’s wave arrives half a λ late and cancels the first: the structure factor F, the sum of the waves of the whole cell, is 0. In (111) and (333) the delay is ¾ and 2¼ λ, and they do not cancel. Bragg’s law gives the angle θ₂; it is the cell’s structure that switches that peak off (a real Si crystal leaves a very faint trace). Extension: switch to zinc-blende with Ga and As: (222) comes back, weakly, because f_Ga ≠ f_As.',
      teacher:
        'Answer: the second option. Si (111): d = 313.6 pm, θ₁ = 6.51°, θ₂ = 13.1° (absent), θ₃ = 19.88° (Kα). At 35 kV, 1 mA, Δt = 5 s the expected prominences are ≈ 20 σ (n = 1) and ≈ 7.7 σ (n = 3); with Δt = 1 s n = 3 is only 3.5 σ. The task needs a crystal with cut (1 1 1) and no order 2 (from its |F|² table; the Forge Si or the Setup Si both work), a COUPLED scan covering θ₁ − 0.7° to θ₃ + 0.7° with Δβ ≤ 0.23° and the order 1 and 3 lines at ≥ 5 σ; the student’s number is not checked. Typical mistake: thinking a missing peak means a broken setup or that Bragg’s law fails. In zinc-blende GaAs, (222) exists but is weak (f_Ga ≠ f_As). In the model (222) is exactly 0; real Si has a weak (222) from bonding charge, and it can appear through multiple diffraction (Renninger effect) depending on the crystal’s azimuth.',
    },
    'forge-kcl-111': {
      title: 'KCl cut along (111)',
      concept: 'Structure factor',
      predict: 'In NaCl cut along the (111) face, the Kα line shows up in first order. If you cut KCl the same way, what do you expect in first order?',
      options: ['A Kα peak like NaCl’s', 'Next to nothing: the peak does not stand out from the background', 'A peak stronger than the second-order one'],
      act: 'In the Forge, under “Start from…”, pick KCl and change the cut to (1 1 1). Open the doors, press “Use on the bench” and close them. Run a COUPLED scan from 4.8° to 18° with Δβ = 0.2° and Δt = 2 s, at 30 kV. To compare, repeat with NaCl cut the same way.',
      observe: 'The clear peak is at θ₂ ≈ 11.3° (with Kβ at 10°). At θ₁ ≈ 5.6° and θ₃ ≈ 17.1° little or nothing stands out at this Δt. In the Forge’s “Reflection orders” table, order 1’s |F|² is not 0, but it is under 1 % of order 2’s.',
      explain:
        'Each atom scatters according to its scattering factor f, which grows with its number of electrons. In rock salt, in the odd orders of (111) the K and Cl waves subtract (|F|² ∝ (f_K − f_Cl)²) and in the even ones they add (∝ (f_K + f_Cl)²). K and Cl have almost the same f at every angle (at θ₁ they differ by ≈ 1.5 electrons), so the difference is small: the peak exists, weak, but not zero; with a much longer Δt it emerges at θ₁. In NaCl, with very different Na and Cl, it shows clearly.',
      teacher:
        'Answer: the second option. In the Forge |F|²(1)/|F|²(2) ≈ 0.007 for KCl (111), against ≈ 0.09 for NaCl (111); the task uses a 0.02 threshold. θ₁ = 5.61°, θ₂ = 11.28°, θ₃ = 17.06°. At 30 kV and 1 mA, order 2 comes out at ≈ 23 σ with Δt = 2 s, and order 1 at ≈ 2.2 σ (≈ 4.9 σ at Δt = 10 s). 30 kV is used because at 35 kV the second-order continuum switches on at 5.60°, right under θ₁, leaving order 1 on a ramp the student may misread: a good extension question. Neutral-atom approximation versus ions changes the ratio by only ≈ 20 % (f_K − f_Cl at θ₁: 1.61 e neutral, 1.44 e ions), so real KCl’s odd orders are weak to the same degree. Typical mistake: confusing “weak” with “forbidden” (diamond (222) cancels by symmetry). The task needs a Forge crystal with cut (1 1 1) whose order 1 is < 2 % of the strongest, a COUPLED scan covering θ₁ − 0.7° to θ₃ + 0.7° with Δβ ≤ 0.23° and order-2 Kα at ≥ 5 σ; the student’s number is not checked.',
    },
    'forge-doublet': {
      title: 'Resolve the Kα₁/Kα₂ doublet',
      concept: 'Dispersion and resolution',
      predict: 'Kα is really a doublet: Kα₁ (70.93 pm) and Kα₂ (71.36 pm), half as intense. With LiF in first order they show up as a single peak. How could you see them as two peaks?',
      options: ['Counting longer in first order', 'Measuring in a high order', 'No way: 0.43 pm is too little for this apparatus'],
      act: 'Mount LiF (from Setup or the Forge) and pick a high order: the Forge’s “Reflection orders” table gives its θ. Run a COUPLED scan from θ − 0.7° to θ + 0.9° with Δβ = 0.1° and Δt = 15 s. If you do not see two peaks, try a higher order. Tip: speed up time.',
      observe: 'In first order there is a single peak. At n = 4 a shoulder shows on the right (Kα₂); at n = 5 there are two peaks with a valley between them.',
      explain:
        'Work out θ for 70.93 and 71.36 pm with Bragg’s law and subtract: with LiF, 0.06° in first order and 0.65° at n = 5. As n grows, sin θ = nλ/(2d) approaches 1 and θ changes much more per pm of λ. Each of the apparatus’ peaks is ≈ 0.29° wide at half height: counting longer lowers the noise but does not narrow the peaks. Order n on the (2 0 0) planes equals first order on the (2n 0 0) planes, with d/n: high orders are the way to use very closely spaced planes.',
      teacher:
        'Answer: the second. Δθ ≈ (Δλ/λ) tan θ in any order (dθ/dλ = n/(2d cos θ) = tan θ/λ). LiF: 0.062° (n = 1), 0.13° (2), 0.22° (3), 0.34° (4, θ ≈ 44.9°), 0.65° (5, θ ≈ 62.0°). With σ = 0.123° (FWHM 0.29°) and Kα₂ ≈ ½ Kα₁, n = 4 gives only a shoulder (3 % valley) and n = 5 two clear peaks. The task asks for a separation ≥ 4σ (0.49°), Δβ = 0.1° and Δt ≥ 10 s. Typical mistake: “longer time, more resolution”. Separating them in first order needs d ≈ 43 pm (θ ≈ 55.6°): usual faces have 200–400 pm, but a high-index cut such as LiF (8 0 0), d = 50 pm, is order 4 of (2 0 0) under another name (0.35°, 2.8 σ: only a shoulder, the task does not accept it); for 4σ you need (10 0 0), d = 40 pm, order 5. The Forge accepts it and so does the task. The student’s answer is not checked.',
    },
  },
}
