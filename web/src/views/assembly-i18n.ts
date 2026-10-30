// Strings of the experiment chooser and the assembly HUD (Spanish default + English). Our own wording, paraphrasing the
// facts of LD leaflets P7.1.2.1 and P6.3.2.1 and the 554 800 instruction sheet.
import { getLang } from '../i18n'
import type { Experiment, Part, PlaceResult, Zone } from '../apparatus/assembly'

type Reason = Extract<PlaceResult, { ok: false }>['reason']

const es = {
  experiment: 'Experimento',
  moreTools: 'Más herramientas',
  chooserTitle: 'Elige un experimento',
  chooserLead: 'Primero eliges qué medir; luego montas el equipo pieza por pieza, en el orden de la guía.',
  chooserKeep: 'Seguir con el montaje actual',
  chooserSwitchNote: 'Cambiar de experimento vacía la cámara y reinicia el equipo.',
  chosen: 'Elegido la última vez',
  inProgress: 'En curso',
  start: 'Empezar',
  cards: {
    bragg: {
      title: 'Reflexión de Bragg en NaCl',
      goal: 'Mide los ángulos de las líneas Kα y Kβ del Mo en un monocristal de NaCl y comprueba la ley de Bragg.',
      ref: 'Basado en la ficha LD P7.1.2.1',
      gear: ['Equipo de rayos X 554 800', 'Goniómetro 554 831', 'Contador de ventana final 559 01', 'Cristales de LiF y de NaCl'],
    },
    attenuation: {
      title: 'Atenuación de rayos X',
      goal: 'Mide cómo se debilita el haz con el espesor de Al y con el número atómico, con y sin filtro de Zr, y el fondo.',
      ref: 'Basado en la ficha LD P6.3.2.1',
      gear: ['Equipo de rayos X 554 800', 'Goniómetro 554 831', 'Contador de ventana final 559 01', 'Juegos de absorbentes 554 834 y filtro de Zr'],
    },
  },
  gearLabel: 'Material',
  hudTitle: (name: string) => `Montaje · ${name}`,
  progress: (i: number, n: number) => `Paso ${Math.min(i + 1, n)} de ${n}`,
  stepsLabel: 'Pasos del montaje',
  trayTitle: 'Piezas',
  trayHint: 'Elige una pieza y luego dónde colocarla.',
  dragHint: 'Arrastra cada pieza de la mesa a su sitio en el equipo.',
  dropHint: 'Suelta la pieza sobre una zona iluminada del equipo, o sobre la mesa para quitarla.',
  kbdTitle: 'Montar sin arrastrar',
  onDevice: 'en el equipo',
  inTray: 'sobre la mesa',
  placeIn: (part: string) => `Colocar «${part}» en:`,
  cancel: 'Cancelar',
  placedOk: (part: string, zone: string) => `${part}: colocado en ${zone}.`,
  stepDone: 'hecho',
  // Bragg measures to the target axis; attenuation (leaflet P6.3.2.1) to the empty window of the absorber set.
  distTitle: (which: string, exp: Experiment): string =>
    which === 's1' ? (exp === 'attenuation' ? 's₁: colimador a ventana vacía' : 's₁: colimador a eje del blanco') : exp === 'attenuation' ? 's₂: ventana vacía a ranura del sensor' : 's₂: eje del blanco a ranura del sensor',
  distUnit: 'cm',
  distLabel: (which: string, cm: number) => `${which === 's1' ? 's₁' : 's₂'} = ${cm.toFixed(1)} cm`,
  checklist: 'Lista de pasos',
  zoneHot: (zone: string) => `Soltar en: ${zone}`,
  distIn: 'En tolerancia',
  distOut: 'Fuera de tolerancia',
  distRange: (target: number, tol: number) => `objetivo ${target.toFixed(1)} ± ${tol.toFixed(1)} cm`,
  teacherAuto: 'Montaje automático (docente)',
  completeTitle: 'Montaje completo',
  completeText: 'El equipo está listo: empieza el experimento.',
  completeSwap: 'Con la puerta abierta puedes cambiar el filtro de Zr y el juego de absorbentes.',
  completeSwapBragg: 'Con la puerta abierta puedes cambiar el cristal (LiF o NaCl): saca uno a la mesa y pon el otro.',
  swapTitle: 'Cambiar accesorios',
  dismiss: 'Ocultar',
  resetView: 'Recentrar vista',
  resetViewHint: 'Arrastra el fondo para girar la cámara, rueda o pellizco para acercar. Este botón vuelve al encuadre inicial.',
  gateHint: 'Primero termina el montaje del equipo.',
  gateTasks: 'Termina el montaje para usar las tareas guiadas.',
  loadingParts: 'Cargando las tablas de absorbentes… vuelve a intentarlo en un momento.',
  loadFailed: 'No se pudieron cargar las tablas de absorbentes; revisa la conexión.',
  zeroNeedsPanel: 'Abre el panel (⚙︎ Ajustes) y pulsa ZERO.',
  switched: (name: string) => `Experimento: ${name}. Cámara vacía; empieza el montaje.`,
  parts: {
    collimator: 'Colimador',
    counter: 'Contador 559 01',
    counterCable: 'Cable del contador',
    targetStage: 'Platina del blanco',
    naclCrystal: 'Cristal de NaCl',
    lifCrystal: 'Cristal de LiF',
    absorbersI: 'Absorbentes, juego I (Al)',
    absorbersII: 'Absorbentes, juego II (materiales)',
    zrFilter: 'Filtro de Zr',
  } satisfies Record<Part, string>,
  partsShort: {
    collimator: 'Colimador',
    counter: 'Contador',
    counterCable: 'Cable del contador',
    targetStage: 'Platina',
    naclCrystal: 'Cristal NaCl',
    lifCrystal: 'Cristal LiF',
    absorbersI: 'Absorbentes I',
    absorbersII: 'Absorbentes II',
    zrFilter: 'Filtro de Zr',
  } satisfies Record<Part, string>,
  zones: {
    collimatorMount: 'Ranura del colimador',
    sensorSeat: 'Asiento del sensor',
    gmSocket: 'Toma «GM TUBE»',
    targetHolder: 'Soporte del blanco',
    tray: 'la mesa (fuera del equipo)',
    collimatorTip: 'Boquilla del colimador',
  } satisfies Record<Zone, string>,
  steps: {
    collimator: ['Coloca el colimador en su ranura', 'Estrecha el haz que sale del tubo.'],
    s1: ['Ajusta s₁ ≈ {cm} cm', 'Fija la mancha y la divergencia del haz en el blanco y deja sitio a los brazos. Suelta al llegar: el paso se confirma al soltar.'],
    counter: ['Coloca el contador en el asiento del sensor', 'Debe quedar alineado con la ranura del sensor.'],
    counterCable: ['Conecta su cable a la toma «GM TUBE»', 'Lleva los pulsos del tubo Geiger-Müller al equipo.'],
    s2: ['Ajusta s₂ ≈ {cm} cm', 'Un s₂ menor da más cuentas pero peor resolución angular: Kα y Kβ pueden dejar de separarse (nota de la ficha). Suelta al llegar.'],
    crystal: ['Pon un cristal (LiF o NaCl) sobre la platina', 'La ficha mide primero LiF y después NaCl; con la puerta abierta podrás cambiarlo. Colócalo plano sobre la platina, sube la platina hasta el tope y aprieta con suavidad el tornillo moleteado. Tómalo solo por las caras cortas: es frágil (el NaCl, además, higroscópico).'],
    targetStage: ['Retira la platina del blanco del soporte', 'El soporte debe quedar libre para los absorbentes. Arrastra la platina y suéltala sobre la mesa.'],
    absorbersI: ['Pon el juego I de absorbentes en el soporte', 'El borde guía entra en la ranura curva de 90°.'],
    door: ['Cierra la puerta', 'Desliza la puerta por su asa hasta cerrarla (o usa el botón). Solo con la puerta cerrada el equipo da alta tensión.'],
    zero: ['Pulsa ZERO en el panel', 'Lleva el blanco y el sensor a la posición cero guardada: planos reticulares y eje del contador paralelos al haz. El cero del simulador ya está calibrado: una pulsación de ZERO sustituye la búsqueda manual del máximo y su guardado de la ficha.'],
  } as Record<string, [string, string]>,
  /** Steps worded differently in the attenuation guide (leaflet P6.3.2.1). */
  stepsAtt: {
    s1: ['Ajusta s₁ ≈ {cm} cm', 'Del colimador a la ventana vacía del juego de absorbentes. Fija la mancha y la divergencia del haz en el blanco y deja sitio a los brazos. Suelta al llegar.'],
    s2: ['Ajusta s₂ ≈ {cm} cm', 'De la ventana vacía a la ranura del sensor. Mantén la geometría de la guía para que las tasas coincidan con los valores de referencia. Suelta al llegar.'],
    zero: ['Pulsa ZERO en el panel', 'Devuelve los brazos a 0° para que la ventana vacía quede en el haz. El cero del simulador ya está calibrado: una pulsación de ZERO sustituye la búsqueda manual del máximo y su guardado.'],
  } as Record<string, [string, string]>,
  // Why a distractor is refused, by experiment (physics reasons, not just "not now").
  wrongPartExtra: {
    bragg: {
      absorbersI: 'Atenuarían el haz; aquí se miden ángulos, no transmisión.',
      absorbersII: 'Atenuarían el haz; aquí se miden ángulos, no transmisión.',
      zrFilter: 'Suprime Kβ; la ficha mide sin filtro.',
    },
    attenuation: {
      naclCrystal: 'Un cristal desvía el haz por difracción; la atenuación necesita el haz directo a 0°.',
      lifCrystal: 'Un cristal desvía el haz por difracción; la atenuación necesita el haz directo a 0°.',
      absorbersII: 'Todavía no se usa: lo necesitarás en la segunda parte.',
      zrFilter: 'Todavía no se usa: lo necesitarás en la segunda parte.',
    },
  } as Record<Experiment, Partial<Record<Part, string>>>,
  removeFirst: { absorbersI: 'Quita primero el juego II.', absorbersII: 'Quita primero el juego I.', naclCrystal: 'Quita primero el cristal de LiF.', lifCrystal: 'Quita primero el cristal de NaCl.' } as Partial<Record<Part, string>>,
  reason: (r: Reason, part: string, zone: string, step: string): string => {
    switch (r) {
      case 'wrongPart': return `«${part}» no se usa en esta fase de este experimento.`
      case 'notYet': return `Todavía no: primero «${step}».`
      case 'alreadyPlaced': return `«${part}» ya está en su sitio.`
      case 'wrongZone': return `«${part}» no va en «${zone}».`
      case 'doorClosed': return 'Abre la puerta para manipular las piezas.'
      case 'setTaken': return 'Ya hay otra pieza del mismo tipo en el soporte.'
    }
  },
}

const en: typeof es = {
  experiment: 'Experiment',
  moreTools: 'More tools',
  chooserTitle: 'Choose an experiment',
  chooserLead: 'First pick what to measure; then assemble the apparatus part by part, in the guide’s order.',
  chooserKeep: 'Keep the current assembly',
  chooserSwitchNote: 'Switching experiment empties the chamber and resets the apparatus.',
  chosen: 'Chosen last time',
  inProgress: 'In progress',
  start: 'Start',
  cards: {
    bragg: {
      title: 'Bragg reflection at NaCl',
      goal: 'Measure the angles of the Mo Kα and Kβ lines at an NaCl single crystal and check Bragg’s law.',
      ref: 'Based on LD leaflet P7.1.2.1',
      gear: ['X-ray apparatus 554 800', 'Goniometer 554 831', 'End-window counter 559 01', 'LiF and NaCl crystals'],
    },
    attenuation: {
      title: 'Attenuation of X-rays',
      goal: 'Measure how the beam weakens with Al thickness and with atomic number, with and without a Zr filter, plus the background.',
      ref: 'Based on LD leaflet P6.3.2.1',
      gear: ['X-ray apparatus 554 800', 'Goniometer 554 831', 'End-window counter 559 01', 'Absorber sets 554 834 and Zr filter'],
    },
  },
  gearLabel: 'Equipment',
  hudTitle: (name) => `Assembly · ${name}`,
  progress: (i, n) => `Step ${Math.min(i + 1, n)} of ${n}`,
  stepsLabel: 'Assembly steps',
  trayTitle: 'Parts',
  trayHint: 'Pick a part, then choose where to put it.',
  dragHint: 'Drag each part from the table to its place on the apparatus.',
  dropHint: 'Drop the part on a lit zone of the apparatus, or on the table to take it off.',
  kbdTitle: 'Assemble without dragging',
  onDevice: 'on the apparatus',
  inTray: 'on the table',
  placeIn: (part) => `Place “${part}” in:`,
  cancel: 'Cancel',
  placedOk: (part, zone) => `${part}: placed in ${zone}.`,
  stepDone: 'done',
  distTitle: (which, exp) =>
    which === 's1' ? (exp === 'attenuation' ? 's₁: collimator to empty window' : 's₁: collimator to target axis') : exp === 'attenuation' ? 's₂: empty window to sensor slit' : 's₂: target axis to sensor slit',
  distUnit: 'cm',
  distLabel: (which, cm) => `${which === 's1' ? 's₁' : 's₂'} = ${cm.toFixed(1)} cm`,
  checklist: 'Checklist',
  zoneHot: (zone) => `Drop on: ${zone}`,
  distIn: 'Within tolerance',
  distOut: 'Out of tolerance',
  distRange: (target, tol) => `target ${target.toFixed(1)} ± ${tol.toFixed(1)} cm`,
  teacherAuto: 'Automatic assembly (teacher)',
  completeTitle: 'Assembly complete',
  completeText: 'The apparatus is ready: begin the experiment.',
  completeSwap: 'With the door open you can swap the Zr filter and the absorber set.',
  completeSwapBragg: 'With the door open you can swap the crystal (LiF or NaCl): put one on the table and mount the other.',
  swapTitle: 'Change accessories',
  dismiss: 'Hide',
  resetView: 'Reset view',
  resetViewHint: 'Drag the background to orbit the camera, wheel or pinch to zoom. This button returns to the default framing.',
  gateHint: 'Finish assembling the apparatus first.',
  gateTasks: 'Finish the assembly to use the guided tasks.',
  loadingParts: 'Loading the absorber tables… try again in a moment.',
  loadFailed: 'The absorber tables could not be loaded; check the connection.',
  zeroNeedsPanel: 'Open the panel (⚙︎ Settings) and press ZERO.',
  switched: (name) => `Experiment: ${name}. Chamber empty; start assembling.`,
  parts: {
    collimator: 'Collimator',
    counter: 'Counter 559 01',
    counterCable: 'Counter cable',
    targetStage: 'Target stage',
    naclCrystal: 'NaCl crystal',
    lifCrystal: 'LiF crystal',
    absorbersI: 'Absorbers, set I (Al)',
    absorbersII: 'Absorbers, set II (materials)',
    zrFilter: 'Zr filter',
  },
  partsShort: {
    collimator: 'Collimator',
    counter: 'Counter',
    counterCable: 'Counter cable',
    targetStage: 'Target stage',
    naclCrystal: 'NaCl crystal',
    lifCrystal: 'LiF crystal',
    absorbersI: 'Absorbers I',
    absorbersII: 'Absorbers II',
    zrFilter: 'Zr filter',
  },
  zones: {
    collimatorMount: 'Collimator groove',
    sensorSeat: 'Sensor seat',
    gmSocket: '“GM TUBE” socket',
    targetHolder: 'Target holder',
    tray: 'the table (off the apparatus)',
    collimatorTip: 'Collimator tip',
  },
  steps: {
    collimator: ['Put the collimator in its groove', 'It narrows the beam leaving the tube.'],
    s1: ['Set s₁ ≈ {cm} cm', 'It sets the beam spot and divergence at the target and leaves room for the arms. Let go when you get there: the step is confirmed on release.'],
    counter: ['Put the counter on the sensor seat', 'It must line up with the sensor slit.'],
    counterCable: ['Plug its cable into the “GM TUBE” socket', 'It carries the Geiger-Müller pulses to the apparatus.'],
    s2: ['Set s₂ ≈ {cm} cm', 'A smaller s₂ gives more counts but poorer angular resolution: Kα and Kβ may stop separating (leaflet note). Let go when you get there.'],
    crystal: ['Put a crystal (LiF or NaCl) on the target stage', 'The leaflet measures LiF first, then NaCl; with the door open you can swap it later. Lay it flat on the stage, raise the stage to the stop and tighten the knurled screw gently. Hold it by the short faces only: it is fragile (NaCl is also hygroscopic).'],
    targetStage: ['Take the target stage off the holder', 'The holder must be free for the absorbers. Drag the stage and drop it on the table.'],
    absorbersI: ['Put absorber set I on the holder', 'The guide edge goes into the 90° curved groove.'],
    door: ['Close the door', 'Slide the door shut by its handle (or use the button). The apparatus gives high voltage only with the door closed.'],
    zero: ['Press ZERO on the panel', 'It returns the target and the sensor to the stored zero: lattice planes and counter axis parallel to the beam. The simulator’s zero is already calibrated: one ZERO press replaces the leaflet’s manual maximum search and save.'],
  },
  stepsAtt: {
    s1: ['Set s₁ ≈ {cm} cm', 'From the collimator to the empty window of the absorber set. It sets the beam spot and divergence at the target and leaves room for the arms. Let go when you get there.'],
    s2: ['Set s₂ ≈ {cm} cm', 'From the empty window to the sensor slit. Keep the guide’s geometry so the rates match the reference values. Let go when you get there.'],
    zero: ['Press ZERO on the panel', 'It returns the arms to 0° so the empty window sits in the beam. The simulator’s zero is already calibrated: one ZERO press replaces the manual maximum search and save.'],
  },
  wrongPartExtra: {
    bragg: {
      absorbersI: 'They would attenuate the beam; here you measure angles, not transmission.',
      absorbersII: 'They would attenuate the beam; here you measure angles, not transmission.',
      zrFilter: 'It suppresses Kβ; the leaflet measures without it.',
    },
    attenuation: {
      naclCrystal: 'A crystal diffracts the beam away; attenuation needs the straight beam at 0°.',
      lifCrystal: 'A crystal diffracts the beam away; attenuation needs the straight beam at 0°.',
      absorbersII: 'Not used yet: you will need it in the second part.',
      zrFilter: 'Not used yet: you will need it in the second part.',
    },
  },
  removeFirst: { absorbersI: 'Remove set II first.', absorbersII: 'Remove set I first.', naclCrystal: 'Remove the LiF crystal first.', lifCrystal: 'Remove the NaCl crystal first.' },
  reason: (r, part, zone, step) => {
    switch (r) {
      case 'wrongPart': return `“${part}” is not used at this stage of this experiment.`
      case 'notYet': return `Not yet: first “${step}”.`
      case 'alreadyPlaced': return `“${part}” is already in place.`
      case 'wrongZone': return `“${part}” does not go in “${zone}”.`
      case 'doorClosed': return 'Open the door to handle the parts.'
      case 'setTaken': return 'Another part of the same kind is already on the holder.'
    }
  },
}

/** The step's [title, why] for an experiment: the attenuation guide words some of them differently. */
export const stepText = (exp: Experiment, id: string): [string, string] => (exp === 'attenuation' ? at().stepsAtt[id] : undefined) ?? at().steps[id]

export const ASSEMBLY_I18N = { es, en }
export const at = (): typeof es => ASSEMBLY_I18N[getLang()]
