// Guided-task strings, Spanish (written first). Keys match en.ts; lab-mode tasks never state the
// expected angles or wavelengths (the teacher notes, shown only with ?teacher, may).
export const es = {
  learn: 'Aprender',
  tasks: 'Tareas guiadas',
  // — Explore lock —
  exploreLocked: 'Explorar se desbloquea al terminar las tareas de laboratorio de este experimento',
  exploreUnlocked: '¡Experimento completado! Modo Explorar desbloqueado',
  // — end —
  otherPractices: 'Otras prácticas (requieren otro montaje)',
  back: 'Todas las tareas',
  levels: ['', 'Introducción', 'Básica', 'Reto'],
  steps: ['Predice', 'Actúa', 'Observa', 'Explica'],
  predictNumber: 'Tu valor',
  commit: 'Fijar mi predicción',
  loading: 'Preparando el montaje…',
  loadFailed: 'No se pudieron cargar los datos del cristal. Revisa la conexión y vuelve a abrir la tarea.',
  busyConfirm: 'Hay una medición en curso. ¿Detenerla y preparar la tarea?',
  earlierExposures: (n: number) => `Hay ${n} ${n === 1 ? 'exposición anterior' : 'exposiciones anteriores'}; la tarea cuenta solo las nuevas (el CSV las incluye todas).`,
  earlierRuns: (n: number) => `Hay ${n} ${n === 1 ? 'medición anterior' : 'mediciones anteriores'} del MCA; la tarea exige al menos una nueva (el CSV las incluye todas).`,
  waiting: 'La tarea se completa sola cuando lo logres.',
  done: 'Logrado',
  explainNext: 'Ver la explicación',
  yourPrediction: 'Tu predicción',
  expected: 'Respuesta',
  restart: 'Empezar de nuevo',
  teacher: 'Nota para docentes',
  modeNote: { explore: 'Modo Explorar', lab: 'Modo Laboratorio' },
  progressLabels: { open: 'abierto', polystyrene: 'poliestireno', xrfCu: 'Cu', xrfZn: 'Zn', xrfPb: 'Pb', xrfBrass: 'latón', xrfCal: 'calibración' },
  task: {
    background: {
      title: 'El contador con el tubo apagado',
      concept: 'Estadística de conteo',
      predict: 'Con el tubo apagado (U = 0 kV), dejas el contador Geiger–Müller contando 100 s. ¿Qué tasa esperas que indique?',
      options: ['Exactamente 0 cuentas por segundo', 'Algo distinto de cero, pero muy poco', 'Lo mismo que con el tubo encendido'],
      act: 'Con U = 0 kV (o I = 0 mA), Δβ = 0 y Δt = 100 s o más, pulsa SCAN y espera a que termine (SCAN enciende HV, pero sin tensión o sin corriente el tubo no emite). No cambies U ni I mientras cuenta. Luego pulsa REPLAY para ver la tasa media.',
      observe: 'Lee la tasa media en REPLAY y calcula cuántas cuentas son en total (tasa × Δt). Compárala con la del haz directo, con el tubo encendido y sin placa.',
      explain:
        'El contador no distingue de dónde viene un fotón o una partícula: los rayos cósmicos y la radiactividad natural del entorno también lo disparan, siempre, a una tasa baja pero no nula: es el fondo. Son sucesos al azar: con N cuentas la incertidumbre es ≈ √N, grande frente a N cuando N es pequeño; por eso se mide ≥ 100 s. Toda medida con rayos X debe restar este fondo, sobre todo cuando la tasa de la muestra es pequeña.',
      teacher:
        'Resultado esperado: ≈ 0.2 cuentas/s (≈ 20 cuentas en 100 s, ±4.5 por Poisson), nunca exactamente 0, y unas 5000 veces menos que el haz directo sin absorbente a 21 kV, 0.05 mA (≈ 10³/s). Errores típicos: «sin rayos X, cero cuentas» y «es radiación que queda en el tubo». Origen: rayos cósmicos y radiactividad natural, no el tubo; con U > 0 pero I = 0 tampoco hay emisión. La tarea se da por hecha con una exposición terminada con U = 0 o I = 0, estable y de ≥ 100 s (guía EPN, Práctica 1); no se revisa el valor que anote el estudiante. Para discutir: ¿cuándo importa restar el fondo?',
    },
    'attenuation-thickness': {
      title: 'Atenuación en aluminio',
      concept: 'Ley de Lambert con un haz real',
      predict: 'Al aumentar el espesor d de aluminio, representas ln T frente a d, con T = tasa con placa / tasa sin placa. La ley de Lambert dice que ln T = −μ d para una sola longitud de onda. Con el haz del tubo a 21 kV, ¿cómo se ve el gráfico?',
      options: ['Una recta', 'Una curva que se aplana: cae menos deprisa al crecer d', 'Una curva que se empina: cae más deprisa al crecer d'],
      act: 'Con 21 kV, 0.05 mA, Δβ = 0 y Δt = 30 s, abre las puertas, comprueba que el juego I de absorbentes (Al) está en el soporte del blanco (si no, arrástralo desde la mesa al soporte) y ciérralas. Con TARGET lleva la rueda a cada ranura (0°, 10°, … 60°; 0° es la ranura abierta) y en cada una pulsa SCAN y espera a que termine. No cambies U ni I entre ranuras. Con REPLAY ves el valor medio de cada una; para anotarlas todas, descarga el registro de exposiciones en el Monitor.',
      actHelp: 'Si una ranura no se marca ✓ o pierde la suya, U o I cambiaron mientras contaba o no son las de las demás. Si tienes las siete ✓ y la tarea no avanza, el Δt fue corto: repítelas con un Δt mayor.',
      observe: 'Calcula T para cada placa (resta antes el fondo) y representa ln T frente a d. Calcula también μ_eff = −ln T / d para la placa más fina y para la más gruesa: ¿salen iguales? Para ir más lejos (unos 25 min), repite todo con el filtro de Zr en el colimador (21 kV, 0.15 mA, Δt = 200 s) y compara la forma.',
      explain:
        'La ley de Lambert vale para una sola longitud de onda. El haz del tubo es policromático: un continuo de frenado con las líneas K del Mo encima, y a 21 kV, muy cerca del umbral K del Mo, las líneas apenas se excitan, así que domina el continuo. Los fotones blandos (de baja energía, λ larga) se absorben antes; a mayor espesor el haz que queda es más duro (más energético), atraviesa mejor y μ_eff = −ln T / d disminuye: ln T frente a d se curva y se aplana. Por eso el μ medido depende del rango de espesores, no solo del material. El filtro de Zr no convierte el haz en Mo Kα: a 21 kV quita el extremo duro (λ < 69 pm, sobre su borde K) y deja una banda estrecha de 69 a 92 pm; la curva queda algo menos curvada y μ_eff sale mayor, más lejos del valor de Kα.',
      teacher:
        'Respuesta: la segunda opción (curva que se aplana). Al a 21 kV, 0.05 mA, tal como lo lee el aparato (τ = 100 µs, sin corregir): μ_eff/ρ = −ln T/(ρd) ≈ 6.4 cm²/g con 0.5 mm y ≈ 5.3 con 3 mm; el ajuste por el origen da ≈ 5.7, con χ²/gl ≫ 1 (no es una recta). Sin tiempo muerto serían 6.9 → 5.4: el tiempo muerto esconde parte de la curvatura. Para Mo Kα solo (xraylib) sería 5.11. Con el filtro de Zr (0.15 mA) la curva queda algo menos curvada (≈ 6.5 → 5.8) y el ajuste sube a ≈ 6.1, más lejos de 5.11: a 21 kV las líneas K apenas se excitan, y el Zr quita el extremo duro del continuo (59–69 pm, sobre su borde K de 18.0 keV) y deja una banda de energías justo por debajo del borde (λ ≈ 69–92 pm). Las pendientes locales entre placas vecinas caen más (hasta ≈ 4.5 sin Zr); pida μ_eff = −ln T/d. Errores típicos: «Lambert siempre da una recta», «μ solo depende del material», «el Zr deja Kα puro», y usar d en mm con μ/ρ en cm²/g sin pasar a ρd en g/cm². La tarea se da por hecha con exposiciones en las siete ranuras con los mismos U, I y filtros, estables, sin saturar, y con un Δt tal que la caída de μ_eff entre 0.5 y 3.0 mm supere 5 σ de Poisson según el modelo (basta Δt ≳ 6 s); no se revisa el μ del estudiante. Para discutir: ¿qué rango de espesores, U y filtro hay que citar junto a un μ?',
    },
    'attenuation-material': {
      title: 'Atenuación según el material',
      concept: 'Coeficiente de absorción y número atómico',
      predict: 'Con el tubo a 30 kV, ¿cuál deja pasar más radiación: una placa de 0.5 mm de hierro (Z = 26) o una de 0.5 mm de circonio (Z = 40)?',
      options: ['El hierro', 'El circonio', 'Lo mismo'],
      act: 'Con 30 kV, Δβ = 0 y Δt = 30 s, abre las puertas, cambia el juego I de absorbentes por el juego II en el soporte del blanco (arrastra el juego I a la mesa y el juego II al soporte) y ciérralas. Con TARGET lleva la rueda a cada ranura (0°, 10°, … 60°) y mide una exposición en cada una: la ranura abierta en 0° (sin placa), y luego poliestireno, Al, Fe, Cu, Zr y Ag. No pongas filtros. Puedes cambiar I entre ranuras, pero no mientras cuenta: si aparece el aviso de saturación, baja I y repite esa ranura; si una placa da muy pocas cuentas, sube I o alarga Δt.',
      actHelp: 'Anota la I de cada ranura. Si una ranura no se marca ✓, el contador se saturó, la tasa quedó muy cerca del fondo, o U o I cambiaron mientras contaba.',
      observe: 'Calcula T = (tasa con placa − fondo) / (tasa sin placa − fondo) para cada placa, con el fondo que mediste con el tubo apagado. Si usaste distinta I, escala antes la tasa sin placa por el cociente de corrientes. Ordena los materiales por T: ¿el orden coincide con el de Z?',
      explain:
        'A una energía dada, μ/ρ suele crecer con Z, pero no siempre. Al subir la energía del fotón, la absorción salta de golpe en el borde K: desde esa energía el fotón puede arrancar un electrón de la capa K. El borde K del Zr está en 18.0 keV, justo por encima de la línea Kα del Mo (17.5 keV): Kα, intensa a 30 kV, cae en la ventana de baja absorción del Zr y lo atraviesa (Kβ, 19.6 keV, queda sobre el borde y se absorbe). El Fe y el Cu, de menor Z, tienen su borde K muy por debajo (7.1 y 9.0 keV), así que su capa K absorbe Kα con fuerza; por lo mismo, el Ag (Z = 47, borde en 25.5 keV) deja pasar más que el Cu. Lo que importa es la energía del fotón frente a la del borde, no solo Z.',
      teacher:
        'Respuesta: el circonio. A 30 kV, 0.5 mm (sin tiempo muerto ni fondo): T ≈ 0.97 poliestireno, 0.56 Al, 1.3 × 10⁻³ Fe, 1.3 × 10⁻⁴ Cu, 1.6 × 10⁻³ Zr, 3.9 × 10⁻⁴ Ag; por T: PS > Al > Zr > Fe > Ag > Cu. El Zr transmite más que Fe y Cu porque Mo Kα (17.5 keV) cae en su ventana de baja absorción, justo bajo su borde K (18.0 keV): ≈ 70 % de lo que pasa por la placa de Zr es Kα; Kβ (19.6 keV) está sobre el borde y se absorbe. Fe y Cu solo dejan pasar el extremo duro del continuo (≈ 23–29 keV); el Ag supera al Cu porque Kα queda bajo su borde K (25.5 keV). Corriente: la guía EPN usa 0.02 mA en las tres primeras ranuras y 1 mA en el resto, pero a 0.02 mA el poliestireno y el haz abierto ya superan el umbral de saturación de la app (Rτ ≈ 0.32, ≈ 2400/s observadas), y a 1 mA el haz abierto lo supera de lejos: mídalos a 0.01 mA (≈ 1400/s). A 0.01 mA y 30 s el Cu (≈ 0.4/s) y la Ag (≈ 0.8/s) quedan bajo 5 σ sobre el fondo: la Ag necesita 0.02 mA o más, y el Cu ni con 0.05 mA basta; usa 1 mA como la guía, o un Δt mayor. Si se mezclan corrientes, corrija el tiempo muerto (R = m/(1 − mτ), τ = 100 µs) antes de escalar el haz abierto por I; sin corregir, el T de las placas pesadas sale un 8–16 % alto. Errores típicos: «μ siempre crece con Z», confundir los 30 kV del tubo con la energía de los fotones, no escalar por I y «arreglar» el punto del Zr en μ/ρ frente a Z. La tarea se da por hecha con las siete ranuras a 30 kV, con los mismos filtros, estables, sin saturar y a 5 σ sobre el fondo; no se revisa el μ del estudiante. Para discutir: el borde K del Ag también está por encima de Mo Kα; ¿por qué transmite menos que el Zr? (Kα queda lejos de su borde y, del mismo lado de un borde, μ/ρ crece con Z: 26.6 frente a 16.3 cm²/g; además el Ag es más denso, 10.5 frente a 6.5 g/cm³.)',
    },
    'kalpha-third-order': {
      title: 'Kα en tercer orden',
      concept: 'Órdenes de difracción',
      predict: 'En primer orden, Kα aparece en θ = 7.24°. ¿En qué ángulo θ esperas Kα de tercer orden?',
      options: [] as string[],
      act: 'Enciende HV y gira el cristal: arrástralo en Goniómetro o usa ADJUST en ⚙︎ Ajustes. Prueba tu ángulo y busca dónde el contador recibe Kα de tercer orden.',
      observe: 'En 3 × 7.24° solo llega el continuo débil; Kα aparece un poco más allá, con el contador en 2θ. En «Diferencia de camino» (botón λ), 2d sen θ = 3λ.',
      explain:
        'La ley de Bragg, nλ = 2d sen θ, fija sen θ, no θ: para n = 3 se triplica sen θ y θ = 22.21°, no 21.72°. La λ es la misma; solo cambia el orden. La «reflexión» es interferencia: las ondas dispersadas por planos vecinos se suman solo en estos ángulos.',
      teacher:
        'Respuesta: θ = 22.21° (tabla 2 del folleto); la tarea se cumple en el paso de 0.1° más cercano, 22.2°. Error típico: 21.72°, por triplicar θ; ahí solo llega el continuo. Otro: creer que el tercer orden es otra λ. Para discutir: ¿hasta qué orden permite la geometría ver Kα? (nλ ≤ 2d, n ≤ 7).',
    },
    'lif-kalpha-angle': {
      title: 'Kα con otro cristal',
      concept: 'La ley de Bragg y el cristal',
      predict: 'Con NaCl (d = 282.01 pm), la línea Kα del Mo aparece en primer orden en θ = 7.24°. En esta tarea el cristal es de LiF, con d = 201.35 pm. ¿En qué ángulo θ esperas Kα de primer orden?',
      options: [] as string[],
      act: 'En modo COUPLED (β = θ), haz un barrido desde 1.5° por debajo de tu ángulo hasta 1° por encima, con Δβ = 0.1° o menor, y pulsa SCAN. Así entran Kα y Kβ. Si el pico de Kα no aparece, corrige la ventana y repite.',
      observe: 'El pico de Kα queda a la derecha de los 7.24° del NaCl, y Kβ, a su izquierda, también se ha movido: los dos picos están más separados. En «Diferencia de camino» (botón λ), 2d sen θ = λ con la d del LiF.',
      explain:
        'La λ de Kα es la misma, 71.1 pm: la emite el tubo, y el cristal solo elige en qué ángulo llega al contador. En primer orden, la ley de Bragg da sen θ = λ / (2d): con una d menor, sen θ y θ crecen. Con LiF, θ = 10.17°; con NaCl, 7.24°. Por eso Kα y Kβ quedan más separados con LiF (1.15° frente a 0.82°): un cristal de d menor separa mejor las longitudes de onda.',
      teacher:
        'Respuesta: θ = arcsen(71.08 / (2 × 201.35)) = arcsen(0.1765) = 10.17° (NaCl: arcsen(71.08 / 564.02) = 7.24°). Con LiF, Kβ cae en 9.01°. Error típico: «el ángulo depende solo del tubo» (7.24°). Otro: escalar θ y no sen θ con el cociente de d; da 10.14°, casi igual a ángulos pequeños, pero en 3.er orden daría 31.1° en vez de 32.0°. Otro más: usar a₀ = 402.7 pm en vez de d = a₀/2 (da 5.06°). El modelo incluye extinción secundaria con una dispersión de mosaico supuesta: en él, el LiF da ≈ 1.1 veces la altura del NaCl; una pieza real puede diferir (su mosaico es desconocido), así que la diferencia de ≈ 10 % entre LiF y NaCl no significa nada; la de ≈ 25× con Si o calcita (cristal perfecto frente a mosaico) sí es física. La tarea se cumple con un barrido COUPLED sobre LiF que cubra la línea ±0.7°, con Δβ ≤ 0.23° y a 5 σ sobre el fondo según el modelo; no se revisa el número del estudiante. Para discutir: ¿hasta qué orden permite la geometría ver Kα con LiF? (nλ ≤ 2d, n ≤ 5).',
    },
    'line-threshold': {
      title: 'Umbral de las líneas',
      concept: 'Líneas características',
      predict: 'Si bajas la tensión U, ¿por debajo de qué valor desaparece la línea Kα?',
      options: ['17.4 kV', '20.0 kV', 'Nunca: el cristal siempre refleja Kα en ese ángulo'],
      act: 'Haz un barrido (SCAN) de 5° a 9°. Baja U (control deslizante en Goniómetro, o U y ADJUST en ⚙︎ Ajustes) y repite hasta que Kα ya no aparezca, pero aún lleguen rayos X a su ángulo. Consejo: acelera el tiempo.',
      observe: 'Kα y Kβ desaparecieron juntos, pero a su ángulo sigue llegando radiación de frenado (el continuo).',
      explain:
        'Kα nace en dos pasos: un electrón del haz arranca un electrón de la capa K del Mo (eU > 20.0 keV) y un electrón L llena el hueco emitiendo un fotón de solo 17.4 keV. El continuo en ese ángulo solo pide λmín < λ(Kα), o sea U > 17.4 kV. Justo sobre 20 kV la línea aún es muy débil.',
      teacher:
        'Respuesta: 20.0 kV, donde eU iguala la energía de enlace K del Mo (20.0 keV). El distractor 17.4 kV es hc/λ(Kα), donde λmín = λ(Kα). Kβ (19.65 keV) también desaparece en 20.0 kV, no en 19.65: el umbral es la capa K. La línea crece como (U/U_K − 1)^1.67 y casi no se ve hasta unos 22 kV: para medir el umbral hay que extrapolar a cero el área del pico a varias U, con corriente baja (0.1 mA) para evitar el tiempo muerto. Ver docs/teacher-key.md.',
    },
    'lambda-three-orders': {
      title: 'λ con tres órdenes',
      concept: 'Medir longitudes de onda',
      predict: 'Con cada orden n calcularás λ = 2d sen θ / n para Kα. ¿Qué esperas obtener?',
      options: ['La misma λ en los tres órdenes', 'Una λ más corta en cada orden superior', 'Una λ más larga en cada orden superior'],
      act: 'Prepara un barrido COUPLED que cubra los tres primeros órdenes de Kβ y Kα, con un paso Δβ fino y un tiempo Δt largo, como en el folleto. Al terminar, descarga los datos con CSV en el Monitor. Si no se completa, revisa que el barrido empiece antes del primer pico y termine después del último, que el pico más débil se distinga del ruido y que el CSV sea del barrido terminado. Antes de medir, calibra el cero (guía P7.1.2.1): con el cristal puesto, en COUPLED ve al máximo de Kα de primer orden, optimiza el blanco en TARGET y el sensor en SENSOR para la tasa máxima, y pulsa a la vez TARGET, COUPLED y β LIMITS (en 3 s; teclado Mayús+Z) para guardarlo. Un barrido sin calibrar desplaza todos los picos y no cuenta.',
      observe: 'Tienes tres pares de picos Kβ–Kα: en cada orden el par está más separado y es más débil.',
      explain:
        'Busca el centro de cada pico, calcula λ = 2d sen θ / n con d = a₀/2 = 282.01 pm y promedia los órdenes. Si todos dan la misma λ, confirmas la ley de Bragg: el orden cambia el ángulo, no la longitud de onda.',
      teacher:
        'Análisis fuera de la app (~20 min). Valores esperados en docs/teacher-key.md (tablas 3–5, datos simulados). Errores típicos: usar a₀ = 564.02 pm en vez de d = a₀/2 (λ sale el doble), tomar el ángulo del sensor (2θ) como θ, asignar un pico al orden equivocado. Para discutir: ¿por qué el par Kβ–Kα se separa más en órdenes altos?',
    },
    'moseley-k-edges': {
      title: 'Ley de Moseley',
      concept: 'Bordes de absorción K',
      predict: 'Un filtro de Zr (Z = 40) y otro de Ag (Z = 47) absorben mucho los fotones con energía mayor que la de su borde K (la energía necesaria para arrancar un electrón de la capa K). Al barrer β, ¿dónde esperas el borde de la Ag respecto al del Zr?',
      options: ['A un β menor que el del Zr', 'Al mismo β', 'A un β mayor que el del Zr'],
      act: 'Con 35 kV y 1 mA, en COUPLED, barre de 3.7° a 7.5° con Δβ = 0.1° y Δt = 5 s. Haz un barrido sin filtro y uno con cada filtro (Zr, Mo, Ag, In). Para cambiar de filtro, apaga HV, abre las puertas, colócalo en la ranura del sensor desde Montaje y ciérralas. Tras cada barrido, descarga el CSV en el Monitor. Todos los barridos deben tener la misma U y la misma I. Variante: repite todos los barridos con el cristal de LiF (d = 201.35 pm), que se elige en Montaje. Antes, traduce con la ley de Bragg la ventana 3.7°–7.5° del NaCl a LiF. Antes de medir, calibra el cero (guía P7.1.2.1): con el cristal puesto, en COUPLED ve al máximo de Kα de primer orden, optimiza el blanco en TARGET y el sensor en SENSOR para la tasa máxima, y pulsa a la vez TARGET, COUPLED y β LIMITS (en 3 s; teclado Mayús+Z) para guardarlo. Un barrido sin calibrar desplaza todos los picos y no cuenta.',
      actHelp: 'Si un filtro no se marca ✓, revisa los límites, Δβ y que U e I sean las del barrido sin filtro.',
      observe: 'Al crecer β, la transmisión T = tasa con filtro / tasa sin filtro sube de golpe en un ángulo distinto para cada filtro. Los picos Kα y Kβ son del tubo: aparecen también sin filtro y casi se cancelan en T.',
      explain:
        'Para θ < θ_K (λ < λ_K) el fotón tiene energía para arrancar un electrón K y se absorbe; por encima de θ_K ya no, y la transmisión sube. Calcula λ_K = 2d sen θ_K con la d de tu cristal (NaCl: 282.01 pm; LiF: 201.35 pm). Cuanto mayor es Z, más fuerte atrae el núcleo a los electrones K: la energía de enlace sube, λ_K se acorta y, por la ley de Bragg, el borde de la Ag cae a menor θ que el del Zr. La ley de Moseley vale también para los bordes: √(1/λ_K) = √R (Z − σ_K), con R la constante de Rydberg (pendiente al cuadrado) y σ_K la constante de apantallamiento, cuánto reducen los demás electrones la carga que siente el electrón K (−ordenada / pendiente). Con NaCl, tu R saldrá unos % por debajo de R∞ = 1.097 × 10⁷ m⁻¹, por física y por la resolución angular finita del contador; con LiF, que separa más los ángulos, la diferencia es menor.',
      teacher:
        'Respuesta: la primera opción; el borde de la Ag cae en θ ≈ 4.94° y el del Zr en ≈ 7.02° (Z mayor → λ_K menor → θ menor). Errores típicos: «más Z o más energía, mayor ángulo»; usar el factor ¾ de la línea Kα (para el borde no va: R saldría un 33 % alta); tomar los picos Kα/Kβ del tubo por bordes. Del ajuste se espera R ≈ 1.06 × 10⁷ m⁻¹ y σ_K ≈ 2.9, R ≈ 3.5 % por debajo de R∞ (±1 % por ruido): ≈ 1.3 % es física (relatividad y un apantallamiento que crece con Z) y ≈ 2.3 % es el sesgo de resolución del contador. Variante con LiF (d = 201.35 pm): los bordes caen en ≈ 6.3° (In), 6.9° (Ag), 8.9° (Mo) y 9.8° (Zr), así que la ventana pasa a ≈ 6.0°–10.2° (se calcula con la d del cristal; todos los barridos de un grupo deben ser sobre el mismo cristal, y no se mezclan NaCl y LiF). La ventana del NaCl traducida a LiF es 5.2°–10.5°. Con LiF, el modelo sin ruido da R ≈ 1.09 × 10⁷ m⁻¹ (≈ 1 % bajo R∞) y σ_K ≈ 3.4–3.6, según la ventana: con mayor dispersión dθ/dλ, la misma resolución angular desplaza menos λ_K. El borde del Zr queda a 0.3° de Kα, así que su valor depende de hasta dónde llegue el barrido. Para discutir: ¿por qué LiF da un R más cercano a R∞? Para discutir: ¿por qué la transmisión sube con λ en el borde, en vez de bajar? Ver docs/teacher-key.md (Moseley).',
    },
    'xrf-calibration': {
      title: 'Primer espectro de fluorescencia',
      concept: 'Calibración en energía del MCA',
      predict: 'Con canales y ganancia fijos, cada canal cubre el mismo intervalo de energía. Supón que el canal 0 es 0 keV y que el Kα del Cu (8.04 keV) cae en el canal 100. ¿En qué canal caería el Lα del Pb (10.56 keV)?',
      options: [] as string[],
      act: 'Sigue el orden de la guía: modo SENSOR, ADJUST del brazo del sensor a 90°; abre la puerta y, en Montaje, pon el detector de energía y la muestra XRF de Cu; modo TARGET, objetivo a 45.0°; cierra la puerta y enciende HV. En el MCA: 512 canales, ganancia −2.5, 180 s, Iniciar. Al terminar, marca el Kα del Cu con el cursor y usa «Usar cursor» en el Punto 1 (8.04 keV). Cambia a Pb (HV apagado, puerta, Montaje), Borrar e Iniciar; marca el Lα del Pb en el Punto 2 (10.56 keV) y pulsa Calibrar.',
      actHelp: 'El MCA guarda un solo espectro a la vez; Borrar no quita la calibración ni los puntos ya anotados. Si no se marca ✓: objetivo a 45.0°, HV encendido, los 180 s completos y nada cambia mientras cuenta. Si cambias canales o ganancia, se borran espectro y calibración.',
      observe: 'Cada elemento deja sus picos en canales propios, y el del Pb queda a la derecha del Cu. Tras calibrar, el eje pasa a keV y las líneas caen en sus energías de referencia. Cerca de 17 keV todos los espectros muestran el Kα y el Kβ del Mo del tubo, dispersados por la muestra.',
      explain:
        'El MCA solo cuenta pulsos por canal; la ganancia y el número de canales fijan los keV por canal (aquí ≈ 0.078 keV). Un MCA real tiene además un desfase b, así que se calibra con dos líneas conocidas, E = m · N + b, y se rehace al cambiar canales o ganancia. En este simulador b = 0 (una simplificación).',
      teacher:
        'Respuesta: ≈ 131 (10.56 / 8.04 · 100). En el espectro del modelo el Cu Kα cae en ≈ canal 103 y el Pb Lα en ≈ 135 (ancho de canal 0.0781 keV a 512 canales y ganancia −2.5; el centroide del Pb Lα del modelo es 10.54 keV). Errores típicos: tomar el Pb Lβ (12.6 keV) por el Lα (la comprobación falla); tomar los picos del Mo a ≈ 17 keV (tubo, dispersados) por líneas de la muestra; leer el número de canal como energía. Se cumple con un espectro de Cu y otro de Pb medidos después de abrir el paso Actúa, a 45.0°, con HV encendido, sin cambios durante la medición y con los canales y la ganancia actuales, donde Cu Kα y Pb Lα sobresalen al menos 5 σ en el ajuste de la app (a 35 kV, 1 mA y 180 s: ≳ 49 σ en el modelo; la escala absoluta es incierta), y con una calibración que lleve esos dos canales a sus energías de referencia con un error de a lo sumo un ancho de canal (la de la guía, 8.04 y 10.56 keV, lo cumple). El objetivo a 45° solo lo comprueba la tarea: el modelo fija ψ₁ = ψ₂ = 45°. Para discutir: ¿por qué la guía usa dos líneas y no una?',
    },
    'xrf-brass': {
      title: 'Composición del latón',
      concept: 'Líneas que se solapan',
      predict: 'En el espectro del latón (Cu, Zn y algo de Pb), ¿qué esperas ver entre 7.5 y 10 keV?',
      options: ['Un pico aislado por elemento', 'Cuatro picos separados: Kα y Kβ del Cu y del Zn', 'Picos que se solapan y no se separan a simple vista'],
      act: 'Pon el objetivo (β) a 45.0° (la tarea lo repuso). Mide Cu, Zn, Pb y el latón CuZn39Pb3, todos con 35 kV, 1 mA, 512 canales, ganancia −2.5 y 180 s. Con el MCA calibrado, ajusta las líneas en el panel Ajuste de líneas o descarga el CSV. Divide cada área por su tiempo vivo y calcula w = A / A_puro, normalizada al 100 %.',
      actHelp: 'Para cambiar de muestra: HV apagado, abre la puerta, Montaje, cierra, enciende HV, Borrar e Iniciar. Si el detector de energía no está montado, prepáralo como en «Primer espectro de fluorescencia». Puedes acelerar el tiempo. Si no se marca ✓: objetivo a 45.0°, los 180 s completos y los mismos U, I, filtros, canales y ganancia en todas las muestras. Los patrones anteriores a esta tarea valen; el latón debe medirse ahora.',
      observe: 'El Kα del Zn (8.63 keV) y el Kβ del Cu (8.91 keV) se funden en un solo pico ancho, y el Pb apenas asoma. Al ajustar con centros fijos sale el área de cada línea.',
      explain:
        'Cada elemento emite varias líneas y el detector tiene una resolución finita (FWHM ≈ 0.4 keV cerca de 8 keV): el Zn Kα y el Cu Kβ distan solo 0.27 keV, menos que un FWHM, y hay que ajustarlos juntos. El área de la línea es proporcional a la cantidad del elemento: comparada con la del patrón puro (por tiempo vivo) da su fracción. El resultado es de primer orden; la absorción en la matriz y la fluorescencia secundaria lo desvían unos puntos porcentuales.',
      teacher:
        'Análisis fuera de la app (~20 min; 4 × 180 s de medición: usa la aceleración del tiempo). Receta de la tarea: divide cada área por el tiempo vivo y calcula w = A / A_puro, normalizada. Con el ajuste de centros fijos sobre espectros sin ruido sale Cu 56.4 / Zn 41.0 / Pb 2.7 %; nominal 58 / 39 / 3 %. LD pondera además por la densidad (61.1 / 35.2 / 3.7 % en el modelo; LD publica 61.6 / 35.6 / 2.9 %); en una muestra gruesa la densidad se cancela en primer orden (I ∝ w / χ), así que esa ponderación no tiene base de primer orden. El sesgo es del método (absorción de la matriz y fluorescencia secundaria), no de los datos. Respuesta: la tercera (Cu Kβ 8.91 keV sobre Zn Kα 8.63 keV: 0.27 keV, menos que un FWHM ≈ 0.41 keV a 8 keV). Error típico: un elemento, un pico aislado. Se cumple con los tres patrones (pueden ser anteriores) y un latón medido después de abrir el paso Actúa, todos en un mismo haz (U, I, filtros, canales y ganancia iguales), a 45.0° con HV encendido y sin cambios, en los que sobresalen al menos 5 σ la línea principal de cada patrón y Cu Kα, Zn Kα y Pb Lα del latón; no se revisa la composición del estudiante. A 35 kV, 1 mA, 180 s: Cu Kα ≈ 73 σ, Zn Kα ≈ 58 σ, Pb Lα ≈ 7.4 σ (con 60 s solo 4.1 σ: no pasa); todo en el modelo, cuya escala absoluta es incierta.',
    },
    'xrf-coin': {
      title: 'La moneda de un centavo',
      concept: '¿Qué parte de la muestra se mide?',
      predict: 'La moneda de 1 centavo (2003) tiene color de cobre, pero un imán la atrae. ¿Qué mostrará su espectro?',
      options: ['Líneas fuertes de Fe y débiles de Cu', 'Líneas fuertes de Cu y débiles de Fe', 'Fe y Cu casi iguales', 'Solo líneas del Cu'],
      act: 'La tarea repuso el objetivo a 0°: modo TARGET y ADJUST a 45.0°. Con HV apagado y la puerta abierta, en Montaje pon la moneda de 1 centavo (2003); cierra la puerta, enciende HV y, en el MCA, Borrar e Iniciar (35 kV, 1 mA, 512 canales, ganancia −2.5, 180 s). Con el MCA calibrado, identifica las líneas.',
      actHelp: 'Si el detector de energía no está montado, prepáralo como en «Primer espectro de fluorescencia». Si no se marca ✓: objetivo a 45.0°, HV encendido, los 180 s completos y nada cambia mientras cuenta. Una línea débil necesita tiempo.',
      observe: 'Domina el Cu, pero el Fe asoma con claridad: el cobre es una capa fina sobre el acero.',
      explain:
        'La fluorescencia que llega al detector sale de las primeras decenas de µm: más profundo se absorbe antes de salir. La longitud de atenuación del Cu Kα en Cu es ≈ 21 µm, así que el recubrimiento da una señal de Cu casi como la del Cu macizo. El Fe Kα cruza el recubrimiento con ≈ 12 µm de longitud de atenuación y el haz incidente también se atenúa, así que el Fe del núcleo se ve débil. Un cálculo de primer orden diría «casi cobre puro», aunque la moneda es solo unos % de Cu en masa: la fluorescencia ve la superficie, no el volumen.',
      teacher:
        'Respuesta: la segunda. Moneda de 1 centavo de Ecuador 2003, acero cobreado (magnética); recubrimiento de Cu ≈ 18 µm (estimación, ninguna ceca la publica), comparable a la longitud de atenuación del Cu Kα en Cu (≈ 21 µm). El modelo da Cu Kα ≈ 30 × Fe Kα; a 35 kV, 1 mA y 180 s: Cu Kα ≈ 100 σ, Fe Kα ≈ 16 σ (en el modelo; la escala absoluta es incierta). El alojamiento del 559 938 real puede mostrar líneas de Fe, Cu, Zn y Au (hoja de instrucciones): compara con el espectro del Cu puro, donde no hay Fe. Error típico: «XRF mide la composición del volumen». Se cumple con un espectro de la moneda medido después de abrir el paso Actúa, a 45.0°, con HV y sin cambios, donde Cu Kα y Fe Kα sobresalen al menos 5 σ. Para discutir: ¿qué esperarías con un recubrimiento de 2 µm? ¿Y con uno de 100 µm?',
    },
    'forge-kalpha-10deg': {
      title: 'Diseña un cristal para Kα a 10°',
      concept: 'Ley de Bragg y espaciado d',
      predict: 'En la Forja puedes diseñar un cristal. Quieres que la línea Kα del Mo (λ = 71.08 pm) aparezca en primer orden en θ = 10°. ¿Qué espaciado d (en pm) necesita el cristal?',
      options: [] as string[],
      act: 'En la Forja diseña un cristal con esa d: por ejemplo, red «Tipo sal de roca» con corte (2 0 0), donde d = a/2, y la arista a adecuada. Abre las puertas, pulsa «Usar en el banco» y ciérralas. Haz un barrido COUPLED de 9° a 11° con Δβ = 0.1°.',
      actHelp: 'Si no se completa, revisa que el cristal venga de la Forja, que su d esté a menos del 1 % de tu cálculo y que el pico sobresalga del ruido (alarga Δt).',
      observe: 'El pico de Kα cae en 10°, no en los 7.24° del NaCl: la tabla «Órdenes de reflexión» de la Forja ya te daba ese θ antes de medir. El cristal fija el ángulo; el tubo, solo la λ.',
      explain:
        'De la ley de Bragg, sen θ = λ / (2d), se despeja d = λ / (2 sen θ) = 71.08 / (2 sen 10°) ≈ 205 pm. Es casi la d del LiF (201 pm): una celda tipo sal de roca con a ≈ 409 pm y corte (2 0 0) sirve. Un cristal «hipotético» sigue las mismas leyes de ángulos; solo sus alturas son una estimación.',
      teacher:
        'Respuesta: d = 71.08 / (2 sen 10°) = 204.7 pm (tolerancia de la tarea: 1 %). En sal de roca con corte (2 0 0), d = a/2, así que a ≈ 409.4 pm (LiF: 402.7 pm). Error típico: tomar a por d y poner a = 204.7 pm: d sale 102.3 pm y Kα cae en θ ≈ 20.3° (la tabla de la Forja lo muestra antes de medir). Escalar θ en vez de sen θ desde el NaCl da 204.2 pm, dentro del 1 %: a 10° sen θ ≈ θ; la diferencia se nota a ángulos grandes. La tarea se cumple con un barrido COUPLED guardado, terminado y sin cambios, de un cristal de la Forja con d dentro del 1 %, que cubre θ ± 0.7° con Δβ ≤ 0.23° y con Kα 5 σ sobre el fondo según el modelo; no se revisa el número del estudiante. A 35 kV, 1 mA y Δt = 1 s la línea sale a ≈ 47 σ.',
    },
    'forge-si-222': {
      title: 'Silicio: el segundo orden de (111)',
      concept: 'Interferencia dentro de la celda',
      predict: 'En la cara (111) del silicio, la ley de Bragg da un ángulo para cada orden de Kα: θ₁ para (111), θ₂ para (222) y θ₃ para (333). ¿Aparecerá un pico de Kα en θ₂?',
      options: ['Sí, más débil que el primero', 'No: el segundo orden está prohibido y solo hay continuo', 'Sí, más intenso que el primero'],
      act: 'En la Forja, en «Empezar desde…», elige Si (tipo diamante, corte (1 1 1)). Abre las puertas, pulsa «Usar en el banco» y ciérralas. Haz un barrido COUPLED de 5° a 21° (órdenes 1 a 3 de Kα) con Δβ = 0.2° y Δt = 5 s, a 35 kV y 1 mA, los máximos del equipo: el Si es un cristal perfecto y refleja poco. Son casi 7 min de medida: acelera el tiempo. Si los picos se ven pequeños, pulsa «Ampliar» en el Espectro.',
      observe: 'Hay pico en θ₁ ≈ 6.5° y en θ₃ ≈ 19.9°, pero en θ₂ ≈ 13.1° solo hay continuo. La tabla «Órdenes de reflexión» de la Forja marca el 2 como prohibido.',
      explain:
        'En el diamante, cada átomo tiene un compañero desplazado ¼ de la diagonal del cubo. En (222), la onda de ese compañero llega con media λ de retraso y anula la del primero: el factor de estructura F, la suma de las ondas de toda la celda, es 0. En (111) y (333) el retraso es de ¾ y 2¼ λ, y no se anulan. La ley de Bragg da el ángulo θ₂; es la estructura de la celda la que apaga ese pico (en un Si real queda un rastro muy débil). Extensión: cambia a blenda con Ga y As: el (222) reaparece, débil, porque f_Ga ≠ f_As.',
      teacher:
        'Respuesta: la segunda opción. Si (111): d = 313.6 pm, θ₁ = 6.51°, θ₂ = 13.1° (ausente), θ₃ = 19.88° (Kα). A 35 kV, 1 mA, Δt = 5 s las prominencias esperadas son ≈ 20 σ (n = 1) y ≈ 7.7 σ (n = 3); con Δt = 1 s n = 3 queda en 3.5 σ. La tarea exige un cristal con corte (1 1 1) sin orden 2 (según su tabla de |F|²; sirve el Si de la Forja o el de Montaje), un barrido COUPLED que cubre θ₁ − 0.7° a θ₃ + 0.7° con Δβ ≤ 0.23° y las líneas de órdenes 1 y 3 a ≥ 5 σ; no se revisa el número del estudiante. Error típico: creer que un pico ausente indica un fallo del montaje o que Bragg no se cumple. En blenda GaAs, (222) existe pero es débil (f_Ga ≠ f_As). En el modelo (222) es exactamente 0; en Si real hay un (222) débil por la densidad de enlace, y puede aparecer por reflexión múltiple (efecto Renninger) según el giro del cristal.',
    },
    'forge-kcl-111': {
      title: 'KCl cortado en (111)',
      concept: 'Factor de estructura',
      predict: 'En el NaCl cortado por la cara (111), la línea Kα se ve en primer orden. Si cortas el KCl igual, ¿qué esperas ver en primer orden?',
      options: ['Un pico de Kα como el del NaCl', 'Casi nada: el pico no sobresale del fondo', 'Un pico más intenso que el de segundo orden'],
      act: 'En la Forja, en «Empezar desde…», elige KCl y cambia el corte a (1 1 1). Abre las puertas, pulsa «Usar en el banco» y ciérralas. Haz un barrido COUPLED de 4.8° a 18° con Δβ = 0.2° y Δt = 2 s, a 30 kV. Si quieres comparar, repite con NaCl cortado igual.',
      observe: 'El pico claro está en θ₂ ≈ 11.3° (y Kβ en 10°). En θ₁ ≈ 5.6° y θ₃ ≈ 17.1° casi nada sobresale con este Δt. En la tabla «Órdenes de reflexión» de la Forja, el |F|² del orden 1 no es 0, pero sí menos del 1 % del orden 2.',
      explain:
        'Cada átomo dispersa según su factor de dispersión f, que crece con su número de electrones. En la sal de roca, en los órdenes impares de (111) las ondas del K y del Cl se restan (|F|² ∝ (f_K − f_Cl)²) y en los pares se suman (∝ (f_K + f_Cl)²). K y Cl tienen casi el mismo f a todos los ángulos (a θ₁ difieren en ≈ 1.5 electrones), así que la resta es pequeña: el pico existe, débil, pero no es cero; con Δt mucho mayor asoma en θ₁. En el NaCl, con Na y Cl muy distintos, se ve claro.',
      teacher:
        'Respuesta: la segunda opción. En la Forja |F|²(1)/|F|²(2) ≈ 0.007 en KCl (111), frente a ≈ 0.09 en NaCl (111); la tarea usa el umbral 0.02. θ₁ = 5.61°, θ₂ = 11.28°, θ₃ = 17.06°. A 30 kV y 1 mA, el orden 2 sale a ≈ 23 σ con Δt = 2 s, y el orden 1 a ≈ 2.2 σ (≈ 4.9 σ con Δt = 10 s). Se usan 30 kV porque a 35 kV el continuo de segundo orden se enciende en 5.60°, justo bajo θ₁, y deja el orden 1 sobre una rampa que el alumno puede malinterpretar: buena pregunta de extensión. Aproximación de átomos neutros frente a iones: cambia la razón solo ≈ 20 % (f_K − f_Cl en θ₁: 1.61 e neutros, 1.44 e iones), así que en el KCl real los órdenes impares son débiles en el mismo grado. Error típico: confundir «débil» con «prohibido» (el diamante (222) se anula por simetría). La tarea exige un cristal de la Forja con corte (1 1 1) cuyo orden 1 sea < 2 % del más fuerte, un barrido COUPLED que cubre θ₁ − 0.7° a θ₃ + 0.7° con Δβ ≤ 0.23° y Kα de orden 2 a ≥ 5 σ; no se revisa el número del estudiante.',
    },
    'forge-doublet': {
      title: 'Resuelve el doblete Kα₁/Kα₂',
      concept: 'Dispersión y resolución',
      predict: 'Kα es en realidad un doblete: Kα₁ (70.93 pm) y Kα₂ (71.36 pm), con la mitad de intensidad. Con LiF en primer orden se ven como un solo pico. ¿Cómo podrías verlos como dos picos?',
      options: ['Midiendo más tiempo en primer orden', 'Midiendo en un orden alto', 'De ninguna forma: 0.43 pm es demasiado poco para este aparato'],
      act: 'Monta LiF (desde Montaje o la Forja) y elige un orden alto: la tabla «Órdenes de reflexión» de la Forja da su θ. Haz un barrido COUPLED de θ − 0.7° a θ + 0.9° con Δβ = 0.1° y Δt = 15 s. Si no ves dos picos, prueba un orden mayor. Consejo: acelera el tiempo.',
      observe: 'En primer orden hay un solo pico. En n = 4 asoma un hombro a la derecha (Kα₂); en n = 5 hay dos picos con un valle entre ellos.',
      explain:
        'Calcula θ para 70.93 y 71.36 pm con la ley de Bragg y réstalos: con LiF, 0.06° en primer orden y 0.65° en n = 5. Al crecer n, sen θ = nλ/(2d) se acerca a 1 y θ cambia mucho más por cada pm de λ. Cada pico del aparato mide ≈ 0.29° de ancho a media altura: medir más tiempo baja el ruido, pero no estrecha los picos. Un orden n sobre los planos (2 0 0) equivale al primer orden sobre los planos (2n 0 0), con d/n: los órdenes altos son la forma de usar planos muy juntos.',
      teacher:
        'Respuesta: la segunda. Δθ ≈ (Δλ/λ) tan θ en cualquier orden (dθ/dλ = n/(2d cos θ) = tan θ/λ). LiF: 0.062° (n = 1), 0.13° (2), 0.22° (3), 0.34° (4, θ ≈ 44.9°), 0.65° (5, θ ≈ 62.0°). Con σ = 0.123° (FWHM 0.29°) y Kα₂ ≈ ½ Kα₁, n = 4 da solo un hombro (valle del 3 %) y n = 5 dos picos claros. La tarea pide una separación ≥ 4σ (0.49°), Δβ = 0.1° y Δt ≥ 10 s. Error típico: «más tiempo, más resolución». Separarlos en primer orden pide d ≈ 43 pm (θ ≈ 55.6°): las caras habituales tienen 200–400 pm, pero un corte de índices altos como LiF (8 0 0), d = 50 pm, es el orden 4 de (2 0 0) con otro nombre (0.35°, 2.8 σ: solo un hombro, la tarea no lo acepta); para 4σ hace falta (10 0 0), d = 40 pm, el orden 5. La Forja lo acepta y la tarea también. No se revisa la respuesta del estudiante.',
    },
  },
}
export type PedagogyDict = typeof es
