// The bench in 3D: the X-ray apparatus 554 800 on a table, a monitor beside it. Like every view it only draws
// the Apparatus state (arms, door, HV, displays, key LEDs); taps become picks that main.ts acts on.
// Proportions: LD instruction sheet 554 800 §1, §4, §7 (67 × 48 × 35 cm; panel column on the left, then the tube
// chamber and the experiment chamber, each behind a lead-glass sliding door) and LD P6.3.3.1 (s₁ = 5 cm,
// s₂ = 6 cm). Orientation as in the front photo of the experiment chamber (LD P7.1.2.1 Fig. 3, instruction sheet
// 554 800: Mo tube standing upright in the tube chamber, beam leaving horizontally through the collimator): the
// tube is vertical; the goniometer 554 831 axis is horizontal, along z towards the student, on the back wall; the
// target and sensor arms turn in the vertical x–y plane seen through the door (positive angle: sensor arm up,
// counter-clockwise); the crystal lies flat on the target stage (the stage stays in the Bragg set-up) at 0°. Built from primitives in code, no LD images or models. Scene units: cm.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { WHEEL_WINDOW_DEG, type Apparatus, type Key, type Setup } from '../apparatus/apparatus'
import type { BenchAssemblyHooks, Distance, Part, Zone } from '../apparatus/assembly'
import { getLang, t } from '../i18n'
import { getMode } from '../pedagogy/mode'
import { WHEELS_MG_CM2 } from '../physics/tables'
import { armEaser, dpr, palette, paletteVersion, reducedMotion, type Palette } from './canvas'
import { at } from './assembly-i18n'
import { fitDistance, freeArea, hitSizeCm, pxPerCm, s1FromRay, s2FromRay, type Reserve } from './bench-assembly-geometry'
import { PLATE_R_CM, S1_CM } from './goniometer'
import { GROUPS, keySelected } from './panel'

export type Focus = 'room' | 'panel' | 'monitor' | 'chamber'
export type Pick = Exclude<Focus, 'room'> | 'door'
type View = Focus | 'assembly' // 'assembly': the open chamber seen from the front while the student mounts the parts
type Colour = keyof Omit<Palette, 'caption' | 'footnote' | 'font' | 'mono'>

const RAD = Math.PI / 180
// Housing (instruction sheet §4) and the parts inside it, cm. x to the right, y up, z towards the student.
const W = 67
const H = 48
const D = 35
const FLOOR = 4.5 // chamber floor above the table (feet and base plate)
const CEIL = H - 2
const COL_X = -W / 2 + 17 // right edge of the panel column
const WALL_X = 1 // wall between the tube chamber and the experiment chamber
const BEAM_Y = 20
const ANODE_X = (COL_X + WALL_X) / 2
const SLIT_X = WALL_X + 5 // collimator slit, s₁ before the goniometer axis
const DOOR_TOP = 31 // lead-glass window above the experiment chamber door
const DOOR_W = W / 2 - WALL_X - 1.5
const DOOR_SLIDE = WALL_X + 0.75 - COL_X // open, it stops at the panel column
const PANEL = { x: (-W / 2 + COL_X) / 2, y: 35, w: 15, h: 21 } // control panel face
const PX_PER_CM = 80 // panel texture resolution
const MONITOR = { x: 60, z: -4, yaw: -0.35, w: 44, h: 27.5, y: 34 } // a 20″ screen
const DASH_CM_PER_S = 3 // the beam's dashes travel while the tube emits
const TAP_PX = 6 // a pointer moving further is an orbit drag, not a tap

/** Mounts the bench on `canvas`. Throws if WebGL is unavailable (the caller falls back to the cards). */
export function mountBench(
  canvas: HTMLCanvasElement,
  a: Apparatus,
  views: { monitor(): { canvas(): HTMLCanvasElement; version(): number; empty(): boolean; emptyText(): string; title?(): string }; dialDeg(): number },
  onPick: (p: Pick | null) => void,
  hooks: BenchAssemblyHooks,
  /** `reserve`: css px of the stage the HUD covers (the chamber is centred in the rest); `tip`: the floating label. */
  env: { reserve: () => Reserve; tip: HTMLElement },
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 2000)
  const controls = new OrbitControls(camera, canvas)
  Object.assign(controls, {
    enablePan: false, enableDamping: !reducedMotion(), dampingFactor: 0.12,
    minAzimuthAngle: -0.7, maxAzimuthAngle: 0.7, minPolarAngle: 0.5, maxPolarAngle: 1.45,
  })
  let dirty = true
  controls.enabled = false // until the first layout places the camera
  // White light; its strength follows --bench-light (dimmer in dark mode, so the housing doesn't glare).
  const sky = new THREE.HemisphereLight(0xffffff, 0xffffff, 2.2)
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(-40, 90, 70)
  scene.add(sky, sun)

  // Materials take their colour from the design tokens, re-read when the theme changes.
  const tinted: [THREE.Material & { color: THREE.Color }, Colour][] = []
  const matte = (c: Colour, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, ...extra })
    tinted.push([m, c])
    return m
  }
  const glow = (c: Colour, extra: THREE.MeshBasicMaterialParameters = {}) => {
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...extra })
    tinted.push([m, c])
    return m
  }
  const housing = matte('bench-housing')
  const trim = matte('bench-trim')
  const metal = matte('bench-metal', { roughness: 0.4, metalness: 0.6 })
  const glass = matte('bench-glass', { transparent: true, opacity: 0.15, roughness: 0.1, depthWrite: false })
  const pickables: THREE.Object3D[] = []
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p?: Pick) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    o.position.set(x, y, z)
    if (p) (o.userData.pick = p), pickables.push(o)
    return o
  }
  const cyl = (r: number, len: number, m: THREE.Material, axis: 'x' | 'y' | 'z', seg = 32) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m)
    if (axis === 'x') o.rotation.z = -Math.PI / 2
    if (axis === 'z') o.rotation.x = Math.PI / 2
    return o
  }
  const pick = <T extends THREE.Object3D>(o: T, p: Pick) => {
    o.traverse((c) => ((c.userData.pick = p), pickables.push(c)))
    return o
  }

  // Table with a soft contact shadow under each object.
  const table = matte('bench-table', { roughness: 0.9 })
  scene.add(box(210, 3, 95, table, 18, -1.5, 5))
  for (const [x, z] of [[-82, -38], [118, -38], [-82, 48], [118, 48]]) scene.add(box(4, 70, 4, table, x, -38, z))
  const shade = document.createElement('canvas')
  shade.width = shade.height = 64
  const sc = shade.getContext('2d')!
  const grad = sc.createRadialGradient(32, 32, 4, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.35)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  sc.fillStyle = grad
  sc.fillRect(0, 0, 64, 64)
  const shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shade), transparent: true, depthWrite: false })
  for (const [x, z, w, d] of [[0, 0, W + 14, D + 14], [MONITOR.x, MONITOR.z, 36, 26]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shadowMat)
    s.rotation.x = -Math.PI / 2
    s.position.set(x, 0.05, z)
    scene.add(s)
  }

  // Housing: base, roof, back, sides, the panel column, the chamber wall and the front frames.
  const dev = new THREE.Group()
  scene.add(dev)
  for (const [x, z] of [[-W / 2 + 4, -D / 2 + 4], [W / 2 - 4, -D / 2 + 4], [-W / 2 + 4, D / 2 - 4], [W / 2 - 4, D / 2 - 4]]) {
    dev.add(box(4, 1.5, 4, trim, x, 0.75, z))
  }
  dev.add(box(W, FLOOR - 1.5, D, housing, 0, (FLOOR + 1.5) / 2, 0))
  dev.add(box(W, H - CEIL, D, housing, 0, (H + CEIL) / 2, 0))
  dev.add(box(W, CEIL - FLOOR, 1, housing, 0, (CEIL + FLOOR) / 2, -D / 2 + 0.5))
  dev.add(box(COL_X + W / 2, CEIL - FLOOR, D, housing, (COL_X - W / 2) / 2, (CEIL + FLOOR) / 2, 0))
  dev.add(box(1, CEIL - FLOOR, D, housing, W / 2 - 0.5, (CEIL + FLOOR) / 2, 0))
  dev.add(box(1.5, CEIL - FLOOR, D, housing, WALL_X, (CEIL + FLOOR) / 2, 0))
  for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) dev.add(box(1, 3, 12, trim, x + Math.sign(x) * 1, 38, 0)) // handles
  // Front frames round both doors and the window, a little proud of the chambers.
  const zf = D / 2 - 0.5
  const topFrame = box(W / 2 - WALL_X, 1.5, 1, housing, (W / 2 + WALL_X) / 2, DOOR_TOP, zf) // hides the arm's top when seen from the front
  dev.add(topFrame)
  dev.add(box(1.5, CEIL - FLOOR, 1, housing, WALL_X, (CEIL + FLOOR) / 2, zf))
  const window_ = box(W / 2 - WALL_X - 1, CEIL - DOOR_TOP - 1, 0.4, glass, (W / 2 + WALL_X) / 2, (CEIL + DOOR_TOP) / 2, zf, 'chamber')
  dev.add(window_)
  const tubeDoor = box(WALL_X - COL_X - 1, CEIL - FLOOR - 1, 0.4, glass, (WALL_X + COL_X) / 2, (CEIL + FLOOR) / 2, D / 2 + 0.2)
  dev.add(tubeDoor)
  // Fluorescent screen (D = 15 cm) closing the far side of the experiment chamber.
  const screen = cyl(7.5, 0.4, trim, 'x', 48)
  screen.position.set(W / 2 + 0.2, BEAM_Y, 0)
  dev.add(screen)

  // Experiment chamber door: lead glass in a frame, sliding left on its own rail in front of the tube chamber.
  const door = new THREE.Group()
  const doorH = DOOR_TOP - FLOOR - 1
  const pane = box(DOOR_W - 1.6, doorH - 1.6, 0.4, glass, 0, 0, 0)
  door.add(pane)
  for (const y of [-doorH / 2 + 0.4, doorH / 2 - 0.4]) door.add(box(DOOR_W, 0.8, 0.8, trim, 0, y, 0))
  for (const x of [-DOOR_W / 2 + 0.4, DOOR_W / 2 - 0.4]) door.add(box(0.8, doorH, 0.8, trim, x, 0, 0))
  door.add(box(0.8, 5, 1.6, trim, -DOOR_W / 2 + 2.5, 0, 0.8)) // grip
  pick(door, 'door')
  pane.userData.glass = true // open or locked, taps pass through the glass: only the frame and grip answer
  const doorX = (W / 2 + WALL_X) / 2
  door.position.set(doorX, FLOOR + 0.5 + doorH / 2, D / 2 + 1)
  dev.add(door)

  // Control panel face: displays, key LEDs and labels are a texture, the ADJUST knob a real knob.
  const panelCanvas = document.createElement('canvas')
  panelCanvas.width = PANEL.w * PX_PER_CM
  panelCanvas.height = PANEL.h * PX_PER_CM
  const panelTex = new THREE.CanvasTexture(panelCanvas)
  const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), new THREE.MeshBasicMaterial({ map: panelTex, toneMapped: false }))
  panelFace.position.set(PANEL.x, PANEL.y, D / 2 + 0.02)
  dev.add(pick(panelFace, 'panel'))
  const KNOB_PX = { x: PANEL.w / 2, y: 17.2 } // cm from the panel's top left
  const knob = new THREE.Group()
  const knobBody = cyl(1.6, 1.4, trim, 'z', 40)
  const notch = box(0.3, 1.1, 0.2, glow('accent', { opacity: 1 }), 0, 0.9, 0.75)
  knob.add(knobBody, notch)
  knob.position.set(PANEL.x - PANEL.w / 2 + KNOB_PX.x, PANEL.y + PANEL.h / 2 - KNOB_PX.y, D / 2 + 0.7)
  dev.add(pick(knob, 'panel'))
  // Connection panel below it: GM TUBE, HV OUT and the BNC sockets.
  dev.add(box(PANEL.w, 14, 0.2, trim, PANEL.x, 14, D / 2 + 0.1))
  for (const [x, y] of [[-4, 17], [0, 17], [4, 17], [-2, 11], [2, 11]]) {
    const s = cyl(0.7, 0.8, metal, 'z', 16)
    s.position.set(PANEL.x + x, y, D / 2 + 0.4)
    dev.add(s)
  }

  // Tube chamber: the Mo tube stands upright in its lead-glass tube, anode at beam height and cathode above it;
  // the X-rays leave sideways (+x) through the collimator. Heat sink behind; the cathode glows while HV is on.
  const leadTube = cyl(5.5, 22, glass, 'y')
  leadTube.position.set(ANODE_X, BEAM_Y + 5, 0)
  const bulb = cyl(3, 16, glass, 'y')
  bulb.position.copy(leadTube.position)
  const anode = cyl(0.8, 5, metal, 'y', 16)
  anode.position.set(ANODE_X, BEAM_Y - 2.5, 0)
  const cathode = cyl(0.6, 5, metal, 'y', 16)
  cathode.position.set(ANODE_X, BEAM_Y + 8.5, 0)
  const cathodeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), glow('led-on', { opacity: 0 }))
  cathodeGlow.position.set(ANODE_X, BEAM_Y + 5.5, 0)
  dev.add(leadTube, bulb, anode, cathode, cathodeGlow, box(10, 16, 3, metal, ANODE_X, BEAM_Y + 4, -D / 2 + 2.5))
  // Collimator through the chamber wall, ending in the slit.
  const coll = cyl(1, SLIT_X - WALL_X + 2, metal, 'x', 24)
  coll.position.set((SLIT_X + WALL_X - 2) / 2, BEAM_Y, 0)
  dev.add(coll)

  // Goniometer 554 831: its axis is horizontal, along z, on guide rods at the back of the chamber; the round
  // face stands upright behind the beam. Both arms turn in the x–y plane (rotation about +z: positive = up, as
  // seen from the front). The target stage sticks out towards the student so the crystal (or the absorber plate)
  // sits on the beam line at the axis; the counter sits on the sensor arm at s₂ from the axis, window to the axis.
  // Every Part of the assembly (apparatus/assembly.ts) is its own group, shown only while `assembly.mounted(part)`;
  // the guide rods belong to the chamber. s₁ and s₂ come from the assembly (the student sets them).
  const BACK_Z = -9 // the goniometer's face
  const RODS_Z = -D / 2 + 2
  const dist = { s1: hooks.assembly.distance('s1'), s2: hooks.assembly.distance('s2') }
  // Leaflet P6.3.2.1 measures the attenuation set-up to the EMPTY WINDOW of the absorber set (a point PLATE_R_CM beyond the
  // axis): s₁ from the collimator slit to it, s₂ from it to the sensor slit. Bragg measures to the target axis.
  // (The leaflet measures s₂ to the sensor-seat slit; the model puts the counter's window there, a small offset.)
  const refCm = () => (hooks.assembly.experiment === 'attenuation' ? PLATE_R_CM : 0)
  const axisX = () => SLIT_X + Math.max(1, dist.s1 - refCm())
  const s2Len = () => dist.s2 + refCm() // counter window along the sensor arm, from the axis
  for (const y of [-7.5, 7.5]) {
    const rod = cyl(0.3, 26, metal, 'x', 12) // guide rods the unit slides on
    rod.position.set(SLIT_X + 13, BEAM_Y + y, RODS_Z)
    dev.add(rod)
  }
  const goniW = new THREE.Group() // wrapper: the snap-in animation moves it, never the gonio group itself
  dev.add(goniW)
  const gonio = new THREE.Group()
  gonio.position.set(axisX(), BEAM_Y, 0)
  goniW.add(gonio)
  const disc = cyl(6, 1, metal, 'z', 48)
  disc.position.z = BACK_Z
  const guide = cyl(0.7, D / 2 - 1 + BACK_Z, metal, 'z', 12) // support from the back wall
  guide.position.z = (BACK_Z + (-D / 2 + 1)) / 2
  const carriage = box(3, 18, 1.4, metal, 0, 0, RODS_Z) // slides on both rods
  gonio.add(disc, guide, carriage)
  const targetArm = new THREE.Group()
  const stage = cyl(0.4, -BACK_Z - 1, metal, 'z', 12) // target holder, from the face to the beam line
  stage.position.set(0, -0.6, BACK_Z / 2 - 0.5)
  const crystalW = new THREE.Group()
  const crystal = box(2, 0.5, 2, matte('phys-crystal', { roughness: 0.3 }), 0, -0.25, 0) // top face through the axis, flat at 0°
  crystalW.add(crystal)
  const stageW = new THREE.Group()
  const stageTable = box(4.4, 0.5, 4.4, matte('bench-trim'), 0, -0.25, 0) // the target stage: under the crystal in Bragg, taken off for the absorbers
  stageW.add(stageTable)
  const plate = new THREE.Group() // absorber plate: slot k is on the beam line at β = 10k°
  targetArm.add(stage, crystalW, stageW, plate)
  const foilAt = (x: number) => {
    const f = cyl(0.8, 0.1, metal, 'x', 24)
    f.position.set(x, 0, 0)
    return f
  }
  const foilW = new THREE.Group()
  const collFoil = foilAt(SLIT_X + 0.5) // just past the slit, in the device frame
  collFoil.position.y = BEAM_Y
  foilW.add(collFoil)
  dev.add(foilW)
  const sensorArm = new THREE.Group()
  // ponytail: the counter clears floor and ceiling, but past 2θ ≈ 130° it clips the wall to the tube chamber
  const armBar = box(1, 1.6, 0.6, metal, 0, 0, BACK_Z + 1) // length and place follow s₂ (applyDist)
  const capMat = matte('danger')
  const makeCounter = () => {
    const g = new THREE.Group()
    const body = cyl(1.1, 8, trim, 'x') // 559 01 end-window counter: the window faces the axis
    body.position.x = 4
    const win = cyl(0.8, 0.1, metal, 'x', 24)
    win.position.x = -0.05
    const cap = cyl(1.3, 1.2, capMat, 'x', 24) // protective cap on the window
    cap.position.x = -0.55
    g.add(body, win, cap)
    return { g, body, cap }
  }
  const holder = cyl(0.35, -BACK_Z - 1, metal, 'z', 12) // from the arm at the back to the counter
  holder.position.set(4, 0, BACK_Z / 2 + 0.5)
  const counterW = new THREE.Group()
  const cM = makeCounter()
  const sensorFoil = foilAt(-0.3)
  cM.g.add(holder, sensorFoil)
  counterW.add(cM.g)
  sensorArm.add(armBar, counterW)
  gonio.add(targetArm, sensorArm)
  pick(gonio, 'chamber')

  // The counter before it is mounted lies in the chamber, cap on (the guide's first counter steps).
  const cL = makeCounter()
  cL.g.position.set(24, FLOOR + 1.1, 9)
  cL.g.rotation.y = -0.35
  dev.add(cL.g)

  // Collimator: sits in a groove in the chamber wall (the dark ring stays), shown only once mounted.
  const grooveRing = cyl(1.4, 0.2, matte('bench-ink'), 'x', 24)
  grooveRing.position.set(WALL_X + 0.85, BEAM_Y, 0)
  dev.add(grooveRing)
  const collW = new THREE.Group()
  collW.add(coll)
  dev.add(collW)

  // Sockets on the chamber's back wall: the goniometer's ribbon cable and "GM TUBE" for the counter's.
  const SOCK_Z = -D / 2 + 1.3
  const ribbonSock = { x: WALL_X + 4.5, y: BEAM_Y + 13 }
  const gmSock = { x: WALL_X + 4.5, y: BEAM_Y - 9 }
  dev.add(box(3.4, 2.4, 0.8, metal, ribbonSock.x, ribbonSock.y, SOCK_Z))
  const gmBody = cyl(1.1, 0.8, metal, 'z', 20)
  gmBody.position.set(gmSock.x, gmSock.y, SOCK_Z)
  dev.add(gmBody)
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 256
  labelCanvas.height = 48
  const labelTex = new THREE.CanvasTexture(labelCanvas)
  labelTex.colorSpace = THREE.SRGBColorSpace
  const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.125), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, toneMapped: false, depthWrite: false }))
  labelPlane.position.set(gmSock.x, gmSock.y - 2.2, -D / 2 + 1.05)
  dev.add(labelPlane)
  const drawLabel = () => {
    const c = labelCanvas.getContext('2d')!
    c.clearRect(0, 0, 256, 48)
    c.fillStyle = palette['bench-ink']
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `600 30px ${palette.font}`
    c.fillText('GM TUBE', 128, 26)
    labelTex.needsUpdate = true
  }

  // Ribbon cable: flat, along the back wall from the socket to the carriage (follows s₁).
  const ribbonW = new THREE.Group()
  const ribbonMat = matte('label-3', { roughness: 0.6 })
  const ribH = box(1, 1.8, 0.15, ribbonMat, 0, ribbonSock.y, -D / 2 + 1.1)
  const ribV = box(1.8, 1, 0.15, ribbonMat, 0, 0, -D / 2 + 1.1)
  ribbonW.add(ribH, ribV)
  dev.add(ribbonW)

  // Counter cable: round, a chain of short rods along a bezier from the counter's rear to the GM TUBE socket.
  const cableW = new THREE.Group()
  const CABLE_N = 18
  const cableMat = matte('bench-ink', { roughness: 0.5 })
  const beadGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 8)
  const beads: THREE.Mesh[] = []
  for (let k = 0; k < CABLE_N; k++) {
    const m = new THREE.Mesh(beadGeo, cableMat)
    beads.push(m)
    cableW.add(m)
  }
  dev.add(cableW)
  const cp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const cA = new THREE.Vector3()
  const cB = new THREE.Vector3()
  const cDir = new THREE.Vector3()
  const UP = new THREE.Vector3(0, 1, 0)
  const bez = (t: number, out: THREE.Vector3) => {
    const u = 1 - t
    return out.set(0, 0, 0).addScaledVector(cp[0], u * u * u).addScaledVector(cp[1], 3 * u * u * t).addScaledVector(cp[2], 3 * u * t * t).addScaledVector(cp[3], t * t * t)
  }
  const updateCable = (armRad: number) => {
    const c = Math.cos(armRad)
    const sn = Math.sin(armRad)
    const r = s2Len() + 8.1
    cp[0].set(axisX() + c * r, BEAM_Y + sn * r, 0)
    cp[1].set(cp[0].x + c * 3, cp[0].y + sn * 3, -2)
    cp[3].set(gmSock.x, gmSock.y, SOCK_Z + 0.6)
    cp[2].set(cp[3].x + 4, cp[3].y, 7)
    bez(0, cA)
    for (let k = 0; k < CABLE_N; k++) {
      bez((k + 1) / CABLE_N, cB)
      cDir.subVectors(cB, cA)
      const len = cDir.length()
      beads[k].position.addVectors(cA, cB).multiplyScalar(0.5)
      beads[k].scale.set(1, len * 1.15, 1)
      beads[k].quaternion.setFromUnitVectors(UP, cDir.divideScalar(len || 1))
      cA.copy(cB)
    }
  }

  // Beam: dashes travelling from the anode to the target, and the specular reflection at 2β (the direct beam at 0°
  // without the crystal) whose opacity is the model's expected rate there (log scale), as in the 2D goniometer.
  const dashCanvas = document.createElement('canvas')
  dashCanvas.width = 2
  dashCanvas.height = 16
  const dc = dashCanvas.getContext('2d')!
  dc.fillStyle = '#fff'
  dc.fillRect(0, 0, 2, 9)
  const BEAM_BASE = 10
  const beamPart = () => {
    const map = new THREE.CanvasTexture(dashCanvas)
    map.wrapT = THREE.RepeatWrapping
    return cyl(0.3, BEAM_BASE, glow('phys-beam', { map }), 'x', 8)
  }
  const setBeam = (m: THREE.Mesh, len: number) => {
    m.scale.y = len / BEAM_BASE // the cylinder's length axis
    ;(m.material as THREE.MeshBasicMaterial).map!.repeat.set(1, len / 1.1)
  }
  const incident = beamPart()
  const reflectedArm = new THREE.Group()
  reflectedArm.position.set(axisX(), BEAM_Y, 0) // turns about z with the arms
  const reflected = beamPart()
  reflectedArm.add(reflected)
  dev.add(incident, reflectedArm)
  const incidentMat = incident.material as THREE.MeshBasicMaterial
  const reflectedMat = reflected.material as THREE.MeshBasicMaterial

  // Monitor on its stand; the screen shows the live spectrum.
  const monitor = new THREE.Group()
  monitor.position.set(MONITOR.x, 0, MONITOR.z)
  monitor.rotation.y = MONITOR.yaw
  monitor.add(box(22, 1, 15, trim, 0, 0.5, 0), box(3, MONITOR.y - 10, 2, trim, 0, (MONITOR.y - 10) / 2 + 1, -3))
  monitor.add(box(MONITOR.w + 2, MONITOR.h + 2, 2, trim, 0, MONITOR.y, -1))
  const monitorCanvas = document.createElement('canvas')
  monitorCanvas.width = 1280
  monitorCanvas.height = 800
  const monitorTex = new THREE.CanvasTexture(monitorCanvas)
  const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(MONITOR.w, MONITOR.h), new THREE.MeshBasicMaterial({ map: monitorTex, toneMapped: false }))
  monitorScreen.position.set(0, MONITOR.y, 0.02)
  monitor.add(monitorScreen)
  scene.add(pick(monitor, 'monitor'))

  for (const tex of [panelTex, monitorTex]) {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  }

  // ── Panel face texture ────────────────────────────────────────────────
  const pc = panelCanvas.getContext('2d')!
  const KEY_ORDER: Key[] = GROUPS.flatMap(([, keys]) => keys)
  let panelSig = ''
  const drawPanel = (): boolean => {
    const d = a.display()
    const blink = !reducedMotion() && Math.floor(performance.now() / 500) % 2 === 1 // the device flashes at ~1 Hz
    const lamp = d.hvLamp && !blink
    const top = !(d.blinkTop && blink)
    const bottom = !(d.flashBottom && blink)
    const keys = KEY_ORDER.map((k) => (keySelected(a, k) ? 1 : 0)).join('')
    const sig = `${d.top}|${d.topUnit}|${d.bottom}|${d.bottomUnit}|${d.symbol}|${lamp}|${top}|${bottom}|${d.blinkTop}|${d.flashBottom}|${keys}|${getLang()}|${paletteVersion}`
    if (sig === panelSig) return false
    panelSig = sig
    const P = palette
    const s = t()
    const k = PX_PER_CM
    pc.fillStyle = P['bench-trim']
    pc.fillRect(0, 0, panelCanvas.width, panelCanvas.height)
    // HV lamp and the two LED displays
    pc.beginPath()
    pc.arc(0.9 * k, 1.5 * k, 0.35 * k, 0, 2 * Math.PI)
    pc.fillStyle = lamp ? P['led-on'] : P['led-bg']
    pc.fill()
    const led = (y: number, value: string, unit: string, on: boolean, sym = '', flashing = false) => {
      pc.fillStyle = P['led-bg']
      pc.beginPath()
      pc.roundRect(1.7 * k, y, 12.6 * k, 2.4 * k, 0.3 * k)
      pc.fill()
      if (flashing && reducedMotion()) {
        // steady cue instead of blinking, as the HTML panel does
        pc.strokeStyle = P.danger
        pc.lineWidth = 0.08 * k
        pc.stroke()
      }
      if (!on) return
      pc.fillStyle = P['led-on']
      pc.shadowColor = P['led-on']
      pc.shadowBlur = 0.25 * k
      pc.textBaseline = 'middle'
      pc.textAlign = 'right'
      pc.font = `${1.7 * k}px ${P.mono}`
      pc.fillText(value, 11.4 * k, y + 1.25 * k)
      pc.textAlign = 'left'
      pc.font = `${0.55 * k}px ${P.mono}`
      pc.fillText(unit, 11.7 * k, y + 0.8 * k)
      pc.fillText(sym, 11.7 * k, y + 1.7 * k)
      pc.shadowBlur = 0
    }
    led(0.5 * k, d.top, d.topUnit, top, '', d.blinkTop)
    led(3.3 * k, d.bottom, d.bottomUnit, bottom, d.symbol === 'lower' ? '▼' : d.symbol === 'upper' ? '▲' : d.symbol === 'exposure' ? '⧗' : '', d.flashBottom)
    // Key groups: pills with a lit LED where the HTML panel shows aria-pressed.
    const PILL_W = 2.6
    let y = 6.6
    for (const [g, groupKeys] of GROUPS) {
      pc.fillStyle = P['bench-ink']
      pc.globalAlpha = 0.7
      pc.textAlign = 'left'
      pc.textBaseline = 'alphabetic'
      pc.font = `600 ${0.42 * k}px ${P.font}`
      pc.fillText(s[g] as string, 0.5 * k, y * k)
      pc.globalAlpha = 1
      for (const [i, key] of groupKeys.entries()) {
        const x = 0.5 + i * (PILL_W + 0.2)
        pc.fillStyle = P['bench-ink']
        pc.globalAlpha = 0.14
        pc.beginPath()
        pc.roundRect(x * k, (y + 0.25) * k, PILL_W * k, 1.1 * k, 0.55 * k)
        pc.fill()
        pc.globalAlpha = 1
        pc.beginPath()
        pc.arc((x + 0.4) * k, (y + 0.8) * k, 0.13 * k, 0, 2 * Math.PI)
        pc.fillStyle = keySelected(a, key) ? P.accent : P['led-bg'] // as the HTML panel's key LEDs
        pc.fill()
        pc.fillStyle = P['bench-ink']
        pc.textAlign = 'center'
        pc.textBaseline = 'middle'
        const label = s.keys[key][0]
        pc.font = `500 ${(label.length > 4 ? 0.34 : 0.44) * k}px ${P.font}`
        pc.fillText(label, (x + 1.45) * k, (y + 0.82) * k)
      }
      y += 2.2
    }
    pc.fillStyle = P['bench-ink']
    pc.globalAlpha = 0.7
    pc.textAlign = 'center'
    pc.font = `600 ${0.42 * k}px ${P.font}`
    pc.fillText(s.adjust, KNOB_PX.x * k, (KNOB_PX.y - 2.3) * k)
    pc.globalAlpha = 1
    panelTex.needsUpdate = true
    return true
  }

  // ── Monitor texture: a copy of the uPlot canvas (or the empty-state text) ──
  const mc = monitorCanvas.getContext('2d')!
  let monitorSig = ''
  const drawMonitor = (): boolean => {
    const mon = views.monitor() // the spectrum, or the MCA while the energy detector is mounted
    const title = mon.title?.() ?? t().spectrum
    const sig = `${title}|${mon.version()}|${mon.emptyText()}|${paletteVersion}|${getLang()}`
    if (sig === monitorSig) return false
    monitorSig = sig
    const P = palette
    const [w, h] = [monitorCanvas.width, monitorCanvas.height]
    mc.fillStyle = P.surface
    mc.fillRect(0, 0, w, h)
    mc.fillStyle = P.label
    mc.textAlign = 'left'
    mc.textBaseline = 'top'
    mc.font = `600 44px ${P.font}`
    mc.fillText(title, 40, 32)
    const src = mon.canvas()
    if (!mon.empty() && src.width > 0 && src.height > 0) {
      const f = Math.min((w - 80) / src.width, (h - 120) / src.height)
      mc.drawImage(src, (w - src.width * f) / 2, 100 + (h - 120 - src.height * f) / 2, src.width * f, src.height * f)
    } else {
      mc.fillStyle = P['label-2']
      mc.textAlign = 'center'
      mc.font = `36px ${P.font}`
      mc.fillText(mon.emptyText(), w / 2, h / 2, w - 80)
    }
    monitorTex.needsUpdate = true
    return true
  }

  // ── Camera: framings per focus, eased flights between them ────────────
  type Preset = { pos: THREE.Vector3; target: THREE.Vector3; dx: number; dy: number }
  const presets = {} as Record<View, Preset>
  const frame = (target: THREE.Vector3, dir: THREE.Vector3, w: number, h: number, margin: number): Preset => {
    const vfov = camera.fov * RAD
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
    const dist = margin * Math.max(w / 2 / Math.tan(hfov / 2), h / 2 / Math.tan(vfov / 2))
    return { target, pos: target.clone().addScaledVector(dir.normalize(), dist), dx: 0, dy: 0 }
  }
  const monitorNormal = new THREE.Vector3(Math.sin(MONITOR.yaw), 0, Math.cos(MONITOR.yaw))
  let vw = 1 // canvas size in css px
  let vh = 1
  let hitMinCm = 1 // a drop volume is at least this big: 48 css px at the assembly framing
  let reserveSig = ''
  const layout = () => {
    // Portrait (phones): the device fills the width with the monitor's edge in view; orbit or tap to it.
    presets.room = camera.aspect < 1
      ? frame(new THREE.Vector3(12, 22, 0), new THREE.Vector3(0, 0.55, 1), 92, 55, 1.15)
      : frame(new THREE.Vector3(24, 20, 0), new THREE.Vector3(0, 0.45, 1), 125, 55, 1.35)
    presets.panel = frame(new THREE.Vector3(PANEL.x, PANEL.y, D / 2), new THREE.Vector3(0, 0.12, 1), PANEL.w, PANEL.h, 1.5)
    presets.monitor = frame(
      new THREE.Vector3(MONITOR.x, MONITOR.y, MONITOR.z).addScaledVector(monitorNormal, 1),
      monitorNormal.clone().setY(0.08), MONITOR.w, MONITOR.h, 1.1,
    )
    presets.chamber = frame(new THREE.Vector3(AXIS_C + 3, BEAM_Y + 3, 0), new THREE.Vector3(0, 0.12, 1), 32, 30, 1.1)
    // Assembly: the whole open chamber (floor to the sensor arm's top, wall to screen), centred in what the HUD leaves free.
    const r = env.reserve()
    const fa = freeArea(vw, vh, r)
    const target = new THREE.Vector3(17.5, 20.5, 0)
    const d = fitDistance(34, 34, camera.fov, camera.aspect, fa.fw, fa.fh, 1.06)
    presets.assembly = { target, pos: target.clone().addScaledVector(new THREE.Vector3(0, 0.1, 1).normalize(), d), dx: fa.dx, dy: fa.dy }
    reserveSig = `${r.left}|${r.right}|${r.top}|${r.bottom}`
    hitMinCm = hitSizeCm(0, pxPerCm(vh, camera.fov, d), 48)
    sizeHits()
    const room = presets.room.pos.distanceTo(presets.room.target)
    controls.minDistance = 0.45 * room
    controls.maxDistance = 1.3 * room
  }
  const AXIS_C = SLIT_X + S1_CM // the chamber framing keeps the default geometry
  let focus: Focus = 'room'
  let cur: View = 'room'
  let flight: { from: THREE.Vector3; fromTarget: THREE.Vector3; fromDx: number; fromDy: number; t0: number; ms: number } | null = null
  let dragActive = false // a part or a distance is being dragged: the orbit controls stay off
  const lookAt = new THREE.Vector3()
  let offX = 0
  let offY = 0
  const setOffset = (dx: number, dy: number) => {
    if (dx === offX && dy === offY) return
    offX = dx
    offY = dy
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) camera.clearViewOffset()
    else camera.setViewOffset(vw, vh, -dx, -dy, vw, vh)
  }
  /** Assembling (or swapping accessories with the door open): the chamber is framed from the front, whatever the card focus. */
  const assemblyView = (): boolean => {
    const A = hooks.assembly
    return !A.done() || (A.experiment === 'attenuation' && !a.doorsClosed)
  }
  const effective = (): View => (focus === 'room' && assemblyView() ? 'assembly' : focus)
  const go = (v: View, instant = false) => {
    cur = v
    // Seen from the front the open door and the frame above it would cover the chamber (its sliding door only half clears
    // the opening): they step aside for these two framings.
    topFrame.visible = door.visible = !(v === 'chamber' || v === 'assembly')
    if (!presets[v]) return // before the first layout, which then places the camera
    controls.enabled = false
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-camera')) || 0
    if (instant || reducedMotion()) {
      camera.position.copy(presets[v].pos)
      lookAt.copy(presets[v].target)
      setOffset(presets[v].dx, presets[v].dy)
      flight = null
      settle()
    } else flight = { from: camera.position.clone(), fromTarget: lookAt.clone(), fromDx: offX, fromDy: offY, t0: performance.now(), ms }
    dirty = true
  }
  const fly = (f: Focus, instant = false) => {
    focus = f
    go(effective(), instant)
  }
  const settle = () => {
    camera.lookAt(lookAt)
    if (cur === 'room') {
      controls.target.copy(lookAt)
      controls.enabled = !dragActive
      controls.update()
    }
  }
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2) // --ease-in-out

  // ── Picking: a tap (not a drag) on a part of the bench ────────────────
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const aim = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
  }
  /** Is the object drawn: itself and every ancestor visible (raycasting ignores `visible`), and its own `on()` condition. */
  const usable = (o: THREE.Object3D): boolean => {
    for (let n: THREE.Object3D | null = o; n; n = n.parent) if (!n.visible) return false
    const on = (o.userData.hit as HitTag | undefined)?.on
    return on ? on() : true
  }
  const hit = (e: PointerEvent): Pick | null => {
    aim(e)
    const first = ray.intersectObjects(pickables, false).find((h) => usable(h.object) && (!h.object.userData.glass || (a.doorsClosed && !a.hvOn && !a.busy)))
    return (first?.object.userData.pick as Pick | undefined) ?? null
  }

  // ── Assembly in 3D: drop zones, ghosts, grabbing parts and distances ───────────────────────────────
  type HitTag = { zone?: Zone; part?: () => Part | null; dist?: Distance; on?: () => boolean }
  const A = () => hooks.assembly
  const hitMat = new THREE.MeshBasicMaterial({ visible: false }) // raycastable, never drawn
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const zoneHits: THREE.Mesh[] = []
  const grabHits: THREE.Mesh[] = []
  const hitBox = (list: THREE.Mesh[], parent: THREE.Object3D, base: [number, number, number], pos: [number, number, number], tag: HitTag) => {
    const m = new THREE.Mesh(unit, hitMat)
    m.userData.base = base
    m.userData.hit = tag
    m.position.set(...pos)
    parent.add(m)
    list.push(m)
    return m
  }
  const sizeHits = () => {
    for (const m of [...zoneHits, ...grabHits]) {
      const b = m.userData.base as [number, number, number]
      m.scale.set(Math.max(b[0], hitMinCm), Math.max(b[1], hitMinCm), Math.max(b[2], hitMinCm))
    }
  }
  const zonesNow = (): readonly Zone[] => A().zones()
  // Ghosts: an accent-coloured translucent box with outline, child of its hit volume (same place and size).
  const ghosts = new Map<Zone, { g: THREE.Group; fill: THREE.MeshBasicMaterial; hit: THREE.Mesh }>()
  const edgesGeo = new THREE.EdgesGeometry(unit)
  const zoneHit = (zone: Zone, parent: THREE.Object3D, base: [number, number, number], pos: [number, number, number], on: () => boolean) => {
    const h = hitBox(zoneHits, parent, base, pos, { zone, on: () => on() && zonesNow().includes(zone) })
    const fill = glow('accent', { opacity: 0 })
    fill.depthTest = false
    const edge = new THREE.LineBasicMaterial({ transparent: true, depthTest: false, opacity: 0.9 })
    tinted.push([edge, 'accent'])
    const g = new THREE.Group()
    const box_ = new THREE.Mesh(unit, fill)
    const lines = new THREE.LineSegments(edgesGeo, edge)
    box_.renderOrder = lines.renderOrder = 20
    g.add(box_, lines)
    g.scale.setScalar(0.94)
    g.visible = false
    h.add(g)
    ghosts.set(zone, { g, fill, hit: h })
  }
  zoneHit('collimatorMount', dev, [6, 5, 5], [WALL_X + 3, BEAM_Y, 0], () => !A().mounted('collimator'))
  zoneHit('guideRods', dev, [14, 16, 6], [axisX(), BEAM_Y, BACK_Z], () => !A().mounted('goniometer'))
  zoneHit('ribbonSocket', dev, [5, 4, 4], [ribbonSock.x, ribbonSock.y, SOCK_Z + 1], () => true)
  zoneHit('gmSocket', dev, [5, 4, 4], [gmSock.x, gmSock.y, SOCK_Z + 1], () => true)
  zoneHit('sensorSeat', sensorArm, [9, 4, 4], [s2Len() + 4, 0, 0], () => true)
  zoneHit('targetHolder', targetArm, [5, 5, 5], [0, -0.25, 0], () => true)
  zoneHit('collimatorTip', dev, [3, 4, 4], [SLIT_X + 0.5, BEAM_Y, 0], () => true)
  // Grab volumes: parts on the device that can be dragged out (back to the tray), and the two distance handles.
  const capPart = (): Part => 'counterCap'
  hitBox(grabHits, cM.cap, [2.5, 3, 3], [0, 0, 0], { part: capPart })
  hitBox(grabHits, cL.cap, [2.5, 3, 3], [0, 0, 0], { part: capPart })
  hitBox(grabHits, cM.body, [8, 3, 3], [0, 0, 0], { part: () => 'counter', dist: 's2' })
  hitBox(grabHits, stageTable, [5, 3, 5], [0, 0, 0], { part: () => 'targetStage' })
  hitBox(grabHits, collFoil, [3, 4, 4], [0, 0, 0], { part: () => 'zrFilter' })
  hitBox(grabHits, targetArm, [2 * PLATE_R_CM, 2 * PLATE_R_CM, 3], [0, 0, 0], {
    part: () => (A().mounted('absorbersI') ? 'absorbersI' : A().mounted('absorbersII') ? 'absorbersII' : null),
    on: () => plate.children.length > 0,
  })
  hitBox(grabHits, gonio, [12, 12, 4], [0, 0, BACK_Z], { dist: 's1' })

  // Dimension lines (collimator slit to axis, axis to counter window) with end ticks.
  const dimLine = () => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3))
    const mat = new THREE.LineBasicMaterial({ transparent: true, depthTest: false })
    tinted.push([mat, 'accent'])
    const l = new THREE.LineSegments(g, mat)
    l.frustumCulled = false
    l.renderOrder = 15
    l.visible = false
    dev.add(l)
    return l
  }
  const dim1 = dimLine()
  const dim2 = dimLine()
  const mid1 = new THREE.Vector3()
  const mid2 = new THREE.Vector3()
  const DIM_Z = 3
  const setDim = (l: THREE.LineSegments, ax: number, ay: number, bx: number, by: number, mid: THREE.Vector3) => {
    const pos = (l.geometry.attributes.position as THREE.BufferAttribute)
    const dx = bx - ax
    const dy = by - ay
    const n = Math.hypot(dx, dy) || 1
    const px = (-dy / n) * 0.7
    const py = (dx / n) * 0.7
    pos.array.set([ax, ay, DIM_Z, bx, by, DIM_Z, ax - px, ay - py, DIM_Z, ax + px, ay + py, DIM_Z, bx - px, by - py, DIM_Z, bx + px, by + py, DIM_Z])
    pos.needsUpdate = true
    mid.set((ax + bx) / 2, (ay + by) / 2, DIM_Z)
  }
  let dimS1 = NaN
  let dimS2 = NaN
  let dimArm = NaN
  const updateDims = (armRad: number) => {
    if (dist.s1 === dimS1 && dist.s2 === dimS2 && armRad === dimArm) return
    dimS1 = dist.s1
    dimS2 = dist.s2
    dimArm = armRad
    const end1 = axisX() + refCm()
    setDim(dim1, SLIT_X, BEAM_Y - 4, end1, BEAM_Y - 4, mid1)
    const c = Math.cos(armRad)
    const sn = Math.sin(armRad)
    const o = 2.4 // the s₂ line runs beside the arm, on its lower side
    const r0 = refCm() // attenuation: the line starts at the empty window
    setDim(dim2, axisX() + c * r0 + sn * o, BEAM_Y + sn * r0 - c * o, axisX() + c * s2Len() + sn * o, BEAM_Y + sn * s2Len() - c * o, mid2)
    dirty = true
  }

  // Distances: where the goniometer and the counter sit.
  const applyDist = () => {
    dist.s1 = A().distance('s1')
    dist.s2 = A().distance('s2')
    const ax = axisX()
    gonio.position.x = ax
    reflectedArm.position.x = ax
    setBeam(incident, ax - ANODE_X)
    incident.position.set((ANODE_X + ax) / 2, BEAM_Y, 0)
    setBeam(reflected, s2Len() + 1.8)
    reflected.position.x = (s2Len() + 1.8) / 2
    const L = s2Len() + 5
    armBar.scale.x = L
    armBar.position.x = (s2Len() + 13) / 2
    cM.g.position.x = s2Len()
    ghosts.get('sensorSeat')!.hit.position.x = s2Len() + 4
    ghosts.get('guideRods')!.hit.position.x = ax
    const rx = ribbonSock.x
    ribH.scale.x = Math.max(0.01, ax - rx)
    ribH.position.x = (rx + ax) / 2
    const vTop = ribbonSock.y
    const vBot = BEAM_Y + 9
    ribV.position.set(ax, (vTop + vBot) / 2, -D / 2 + 1.1)
    ribV.scale.y = vTop - vBot
    dimS1 = dimS2 = NaN
    cabS1 = cabS2 = NaN
    dirty = true
  }
  let cabS1 = NaN
  let cabS2 = NaN
  let cabArm = NaN

  // Which accessories show: while assembling, what the assembly says; afterwards the Apparatus decides (tasks swap crystal/detector).
  const SLOT_COLOURS: Colour[] = ['phys-kalpha', 'phys-kbeta', 'phys-crystal', 'phys-constructive', 'phys-continuum', 'accent', 'bench-ink']
  const plateMats = {
    frame: matte('bench-trim', { side: THREE.DoubleSide }),
    al: matte('bench-metal', { roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }), // set I: aluminium grey
    mixed: SLOT_COLOURS.map((c) => matte(c, { roughness: 0.5, side: THREE.DoubleSide })), // set II: one colour per material
  }
  let builtHolder = ''
  const buildHolder = (holder: Setup['holder']) => {
    const key = `${holder}|${WHEELS_MG_CM2.al.length}|${WHEELS_MG_CM2.material.length}`
    if (key === builtHolder) return
    builtHolder = key
    for (const m of plate.children) (m as THREE.Mesh).geometry.dispose()
    plate.clear()
    if (!holder.endsWith('Wheel')) return
    const tiles = WHEELS_MG_CM2[holder === 'alWheel' ? 'al' : 'material']
    const count = tiles.length || 7 // before the absorber tables arrive the sets are drawn with all their windows
    const w = WHEEL_WINDOW_DEG * RAD
    // With the ring axis turned onto z, CylinderGeometry's θ sits at angle θ − 90° in the x–y plane and the arm turns it
    // by +β, so slot k centres on θ = 90° − 10k° and meets the beam (+x side) at β = 10k°.
    const seg = (n: number, from: number, to: number, m: THREE.Material) => {
      const o = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R_CM, PLATE_R_CM, 2.5, 8, 1, true, Math.PI / 2 - n * 10 * RAD + from, to - from), m)
      o.rotation.x = Math.PI / 2 // ring axis along z, like the goniometer axis
      plate.add(o)
    }
    for (let n = -1; n < 7; n++) seg(n, w, 10 * RAD - w, plateMats.frame) // frame after slot n
    for (let n = 0; n < count; n++) if (tiles.length === 0 || tiles[n]) seg(n, -w, w, holder === 'alWheel' ? plateMats.al : plateMats.mixed[n % plateMats.mixed.length])
  }
  let lastSetup: Setup | null = null
  let lastDone = false
  let asmDirty = true
  const applyVisibility = () => {
    const As = A()
    const assembling = !As.done()
    collW.visible = As.mounted('collimator')
    goniW.visible = As.mounted('goniometer')
    ribbonW.visible = As.mounted('ribbonCable')
    counterW.visible = As.mounted('counter')
    cM.cap.visible = As.mounted('counterCap')
    cL.g.visible = assembling && As.inChamber('counter') // lies on the floor during the cap step only; then it is a tray part
    cL.cap.visible = As.mounted('counterCap')
    cableW.visible = As.mounted('counterCable')
    stageW.visible = As.mounted('targetStage')
    const s_ = a.setup
    const holder: Setup['holder'] = assembling
      ? As.mounted('naclCrystal') ? 'crystal' : As.mounted('absorbersI') ? 'alWheel' : As.mounted('absorbersII') ? 'materialWheel' : 'empty'
      : s_.holder
    buildHolder(holder)
    crystal.visible = holder === 'crystal'
    stageTable.position.y = holder === 'crystal' ? -0.75 : -0.25 // the crystal lies flat on the stage
    collFoil.visible = assembling ? As.mounted('zrFilter') : !!s_.collimatorFilter
    sensorFoil.visible = assembling ? false : !!s_.sensorFilter
    lastSetup = s_
    lastDone = !assembling
    asmDirty = false
    dirty = true
  }
  applyDist()

  // Snap-in: a newly mounted part eases from a little above and towards the student into its place.
  const snapRoots: Partial<Record<Part, THREE.Object3D>> = {
    collimator: collW, goniometer: goniW, ribbonCable: ribbonW, counter: counterW, targetStage: stageW, naclCrystal: crystalW, zrFilter: foilW, absorbersI: plate, absorbersII: plate,
  }
  const SNAP_MS = 280
  const snaps = new Map<THREE.Object3D, number>()
  let prevOn: Partial<Record<Part, boolean>> = {}
  const noteMounted = (animate: boolean) => {
    const As = A()
    for (const p of As.parts()) {
      const on = As.mounted(p)
      if (animate && on && !prevOn[p] && snapRoots[p] && !reducedMotion()) snaps.set(snapRoots[p]!, performance.now())
      prevOn[p] = on
    }
  }
  const SNAP_OFF = new THREE.Vector3(0, 3, 7)
  const stepSnaps = (now: number) => {
    for (const [o, t0] of snaps) {
      const x = Math.min(1, (now - t0) / SNAP_MS)
      const k = (1 - x) ** 3 // ease-out
      o.position.copy(SNAP_OFF).multiplyScalar(x === 1 ? 0 : k)
      dirty = true
      if (x === 1) snaps.delete(o)
    }
  }

  let unsub = A().onChange(() => ((asmDirty = true), applyDist(), noteMounted(true)))
  noteMounted(false)
  hooks.onAssembly = () => {
    unsub()
    unsub = A().onChange(() => ((asmDirty = true), applyDist(), noteMounted(true)))
    snaps.clear()
    for (const o of Object.values(snapRoots)) o?.position.set(0, 0, 0)
    prevOn = {}
    noteMounted(false)
    asmDirty = true
    applyDist()
    go(effective())
  }

  // ── Drag lifecycle (the HUD owns the ghost chip and the thresholds; we draw zones and resolve drops)
  const valid = new Set<Zone>()
  let hot: Zone | null = null
  let shake: { zone: Zone; t: number } | null = null
  let tipOwner: 'zone' | 'dist' | null = null
  const zoneWorld = new THREE.Vector3()
  let tipX = NaN
  let tipY = NaN
  const showTip = (text: string, world: THREE.Vector3) => {
    const p = zoneWorldNdc.copy(world).project(camera)
    const x = Math.round(((p.x + 1) / 2) * vw)
    const y = Math.round(((1 - p.y) / 2) * vh)
    const tip = env.tip
    if (tip.textContent !== text) tip.textContent = text
    if (x !== tipX || y !== tipY) {
      tipX = x
      tipY = y
      tip.style.transform = `translate(${x}px, ${y}px)`
    }
    if (tip.hidden) tip.hidden = false
  }
  const zoneWorldNdc = new THREE.Vector3()
  const hideTip = () => {
    tipOwner = null
    if (!env.tip.hidden) env.tip.hidden = true
  }
  const restoreControls = () => {
    if (!dragActive && cur === 'room' && !flight) controls.enabled = true
  }
  hooks.resolveZone = (x, y) => {
    aim({ clientX: x, clientY: y })
    // Neighbouring drop volumes overlap on screen (collimator tip and target holder are ~2 cm apart): the nearest centre wins.
    let best: Zone | null = null
    let bestD = Infinity
    for (const h of ray.intersectObjects(zoneHits, false)) {
      if (!usable(h.object)) continue
      h.object.getWorldPosition(zoneWorld)
      const d = ray.ray.distanceToPoint(zoneWorld)
      if (d < bestD) ((bestD = d), (best = h.object.userData.hit.zone as Zone))
    }
    return best
  }
  hooks.onDragStart = (_part, zones) => {
    dragActive = true
    controls.enabled = false
    valid.clear()
    for (const z of zones) valid.add(z)
    shake = null
    canvas.toggleAttribute('data-grabbing', true)
    dirty = true
  }
  hooks.onDragMove = (_part, _x, _y, over) => {
    const next = over && valid.has(over) && ghosts.has(over) ? over : null
    if (next !== hot) {
      hot = next
      dirty = true
      if (next) {
        ghosts.get(next)!.hit.getWorldPosition(zoneWorld)
        tipOwner = 'zone'
        showTip(at().zoneHot(at().zones[next]), zoneWorld)
      } else if (tipOwner === 'zone') hideTip()
    }
  }
  hooks.onDragEnd = (_part, dropped, result) => {
    dragActive = false
    valid.clear()
    hot = null
    canvas.removeAttribute('data-grabbing')
    if (tipOwner === 'zone') hideTip()
    if (result && !result.ok && dropped && ghosts.has(dropped)) shake = { zone: dropped, t: 0.4 } // a refusal: the zone shakes, the toast says why
    restoreControls()
    dirty = true
  }
  const stepGhosts = (dtS: number, now: number) => {
    const pulse = reducedMotion() ? 0 : 0.05 * Math.sin(now / 280)
    for (const [z, gh] of ghosts) {
      const shaking = shake?.zone === z
      const on = valid.has(z) || shaking
      if (gh.g.visible !== on) ((gh.g.visible = on), (dirty = true))
      if (!on) continue
      const isHot = hot === z
      gh.fill.opacity = (isHot ? 0.3 : 0.1) + pulse
      gh.g.scale.setScalar(isHot ? 1 : 0.94)
      gh.g.position.x = shaking && !reducedMotion() ? Math.sin(shake!.t * 70) * 0.06 * (shake!.t / 0.4) : 0
      dirty = true
    }
    if (shake) {
      shake.t -= dtS
      if (shake.t <= 0) ((shake = null), (dirty = true))
    }
  }

  // Grabbing on the canvas: a part that is on the device starts the HUD's drag; the goniometer and the counter slide along their axes.
  let consumed = false
  let distDrag: { which: Distance; id: number; off: number; from: number } | null = null
  const distFromRay = (which: Distance, off: number): number | null =>
    which === 's1'
      ? s1FromRay(ray.ray.origin, ray.ray.direction, BACK_Z, SLIT_X - refCm(), off)
      : s2FromRay(ray.ray.origin, ray.ray.direction, 0, { x: axisX(), y: BEAM_Y }, sensorArm.rotation.z, off + refCm())
  const grabAt = (e: PointerEvent) => {
    aim(e)
    for (const h of ray.intersectObjects(grabHits, false)) {
      if (!usable(h.object)) continue
      const tag = h.object.userData.hit as HitTag
      const part = tag.part?.() ?? null
      if (part && A().zonesFor(part).length) return { part, which: null }
      if (tag.dist && A().current()?.distance?.which === tag.dist) return { part: null, which: tag.dist } // only the current step's distance; locked afterwards
    }
    return null
  }
  canvas.addEventListener('pointerdown', (e) => {
    consumed = false
    if ((e.pointerType === 'mouse' && e.button !== 0) || a.doorsClosed || dragActive || distDrag) return
    const g = grabAt(e)
    if (!g) return
    consumed = true
    controls.enabled = false
    if (g.part) {
      dragActive = true // until the HUD's onDragEnd; a tap without movement never starts a HUD drag, so pointerup releases it too
      const part = g.part
      const up = () => {
        removeEventListener('pointerup', up)
        removeEventListener('pointercancel', up)
        setTimeout(() => ((dragActive = false), restoreControls()), 0)
      }
      addEventListener('pointerup', up)
      addEventListener('pointercancel', up)
      hooks.beginDrag?.(part, e)
    } else if (g.which) {
      aim(e)
      const s0 = distFromRay(g.which, 0)
      distDrag = { which: g.which, id: e.pointerId, off: s0 == null ? 0 : s0 - A().distance(g.which), from: A().distance(g.which) }
      dragActive = true
      canvas.setPointerCapture?.(e.pointerId)
      canvas.toggleAttribute('data-grabbing', true)
      tipOwner = 'dist'
    }
  }, true)
  let down: { x: number; y: number } | null = null
  canvas.addEventListener('pointerdown', (e) => {
    down = e.button === 0 && !consumed ? { x: e.clientX, y: e.clientY } : null
  })
  canvas.addEventListener('pointermove', (e) => {
    if (distDrag && e.pointerId === distDrag.id) {
      aim(e)
      const cm = distFromRay(distDrag.which, distDrag.off)
      if (cm != null && cm !== A().distance(distDrag.which)) A().setDistance(distDrag.which, cm)
      return
    }
    if (e.buttons === 0 && e.pointerType === 'mouse') {
      const g = !a.doorsClosed && !dragActive ? grabAt(e) : null
      canvas.toggleAttribute('data-grab', !!g)
      canvas.style.cursor = g ? '' : hit(e) ? 'pointer' : ''
    }
  })
  /** The distance drag ends: on release the step is committed (it completes only now, not while the value passes the
   * tolerance band); cancelled (pointercancel, lost capture, Escape) it puts the value from before the drag back. */
  const endDistDrag = (e: { pointerId: number } | null, commit: boolean) => {
    if (!distDrag || (e && e.pointerId !== distDrag.id)) return
    const d = distDrag
    distDrag = null
    if (commit) A().commitDistance(d.which)
    else A().setDistance(d.which, d.from)
    dragActive = false
    canvas.removeAttribute('data-grabbing')
    hideTip()
    restoreControls()
  }
  canvas.addEventListener('pointercancel', (e) => endDistDrag(e, false))
  canvas.addEventListener('lostpointercapture', (e) => endDistDrag(e, false)) // after pointerup it finds no drag left
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !distDrag) return
    e.stopPropagation()
    endDistDrag(null, false)
  }, true)
  canvas.addEventListener('pointerup', (e) => {
    endDistDrag(e, true)
    const d = down
    down = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP_PX) return
    const p = hit(e)
    onPick(cur === 'assembly' && p !== 'door' ? null : p) // while assembling, a tap on the chamber is not "open the card"
  })
  controls.addEventListener('change', () => (dirty = true))

  // ── Sizing ─────────────────────────────────────────────────────────────
  new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    if (width === 0 || height === 0) return
    ;[vw, vh] = [width, height]
    renderer.setPixelRatio(dpr())
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    offX = offY = NaN // the view offset is in px: re-apply it at the new size
    camera.clearViewOffset()
    camera.updateProjectionMatrix()
    layout()
    if (!flight) go(effective(), true)
  }).observe(canvas)
  // The HUD changes size (a step with a slider, the checklist unfolded): the chamber follows into the free area.
  const asmEl = document.querySelector('[data-asm]')
  if (asmEl) {
    new ResizeObserver(() => {
      if (vw <= 1) return
      const r = env.reserve()
      if (`${r.left}|${r.right}|${r.top}|${r.bottom}` === reserveSig) return
      layout()
      if (cur === 'assembly') go('assembly')
    }).observe(asmEl)
  }
  let tintedVersion = -1

  // ── Per frame ──────────────────────────────────────────────────────────
  const arms = armEaser(a)
  let rate = 0
  let tipMemo = { which: '', cm: NaN, lang: '', text: '' } // the s₁/s₂ label is rebuilt only when it changes
  const rk = { target: NaN, u: NaN, i: NaN, hv: false }
  let doorOffset = a.doorsClosed ? 0 : DOOR_SLIDE
  let shakeT = 0
  const drawn = { t: NaN, s: NaN, door: NaN, g: NaN, rate: NaN, emitting: false, knob: NaN, mode: '', off: NaN }
  const render = (dtS: number) => {
    if (paletteVersion !== tintedVersion) {
      for (const [m, c] of tinted) m.color.set(palette[c])
      drawLabel()
      const light = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bench-light')) || 1
      sky.intensity = sun.intensity = 2.2 * light
      sky.groundColor.set(palette['bench-table'])
      tintedVersion = paletteVersion
      dirty = true
    }
    const want = effective()
    if (want !== cur) go(want)
    if (drawPanel()) dirty = true
    if (drawMonitor()) dirty = true
    if (flight) {
      const x = Math.min(1, (performance.now() - flight.t0) / flight.ms)
      const k = ease(x)
      const pr = presets[cur]
      camera.position.lerpVectors(flight.from, pr.pos, k)
      lookAt.lerpVectors(flight.fromTarget, pr.target, k)
      setOffset(flight.fromDx + (pr.dx - flight.fromDx) * k, flight.fromDy + (pr.dy - flight.fromDy) * k)
      camera.lookAt(lookAt)
      if (x === 1) (flight = null), settle()
      dirty = true
    } else if (cur === 'room' && controls.enabled) controls.update()

    arms.step(dtS)
    targetArm.rotation.z = (arms.t / 10) * RAD
    sensorArm.rotation.z = (arms.s / 10) * RAD
    const changed = a.setup !== lastSetup || asmDirty || A().done() !== lastDone
    if (changed) applyVisibility()
    stepSnaps(performance.now())
    stepGhosts(dtS, performance.now())
    const showDims = assemblyView() && !A().done()
    dim1.visible = showDims && goniW.visible
    dim2.visible = showDims && counterW.visible
    if (showDims) updateDims(sensorArm.rotation.z)
    if (cableW.visible) {
      const z = sensorArm.rotation.z
      if (z !== cabArm || dist.s1 !== cabS1 || dist.s2 !== cabS2) ((cabArm = z), (cabS1 = dist.s1), (cabS2 = dist.s2), updateCable(z), (dirty = true))
    }
    // The live distance label: while a distance is dragged, and for the current distance step.
    if (!dragActive || distDrag) {
      const which = distDrag?.which ?? (showDims ? A().current()?.distance?.which : undefined)
      if (which && (which === 's1' ? dim1 : dim2).visible && tipOwner !== 'zone') {
        tipOwner = 'dist'
        if (tipMemo.which !== which || tipMemo.cm !== dist[which] || tipMemo.lang !== getLang()) {
          tipMemo = { which, cm: dist[which], lang: getLang(), text: at().distLabel(which, dist[which]) }
        }
        showTip(tipMemo.text, which === 's1' ? mid1 : mid2)
      } else if (tipOwner === 'dist') hideTip()
    }
    const crystalOn = a.setup.holder === 'crystal'
    reflectedArm.rotation.z = crystalOn ? 2 * targetArm.rotation.z : 0
    knob.rotation.z = -views.dialDeg() * RAD
    if (a.target !== rk.target || a.u !== rk.u || a.i !== rk.i || a.hvOn !== rk.hv || changed) {
      rate = crystalOn ? a.specularRate() : a.transmittedRate()
      ;[rk.target, rk.u, rk.i, rk.hv] = [a.target, a.u, a.i, a.hvOn]
    }
    const emitting = a.emitting
    const g = a.hvOn && a.i > 0 ? 0.3 + (0.7 * a.i) / 100 : 0
    ;(cathodeGlow.material as THREE.MeshBasicMaterial).opacity = g
    incident.visible = emitting
    reflected.visible = emitting && (rate > 0 || (crystalOn && getMode() === 'lab'))
    // Lab mode: a faint constant path, since a brightness that follows the rate would find the peaks for the student
    reflectedMat.opacity = getMode() === 'lab' ? 0.2 : Math.min(1, Math.max(0.2, Math.log10(1 + rate) / 4))
    incidentMat.opacity = 0.9
    const animate = emitting && !reducedMotion()
    if (animate) {
      incidentMat.map!.offset.y -= (DASH_CM_PER_S * dtS) / 1.1
      reflectedMat.map!.offset.y -= (DASH_CM_PER_S * dtS) / 1.1
    }
    // Door: slides on the UI clock towards the apparatus state; a refused open gives a short shake.
    const goal = a.doorsClosed ? 0 : DOOR_SLIDE
    doorOffset = reducedMotion() ? goal : doorOffset + (goal - doorOffset) * Math.min(1, dtS * 10)
    if (Math.abs(goal - doorOffset) < 0.01) doorOffset = goal
    shakeT = Math.max(0, shakeT - dtS)
    door.position.x = doorX - doorOffset + (shakeT > 0 ? Math.sin(shakeT * 60) * 0.5 * (shakeT / 0.4) : 0)

    const mode = getMode()
    const same = drawn.t === arms.t && drawn.s === arms.s && drawn.door === door.position.x && drawn.g === g && drawn.rate === rate && drawn.emitting === emitting && drawn.knob === knob.rotation.z && drawn.mode === mode && drawn.off === offX
    if (!dirty && !animate && same) return
    Object.assign(drawn, { t: arms.t, s: arms.s, door: door.position.x, g, rate, emitting, knob: knob.rotation.z, mode, off: offX })
    dirty = false
    renderer.render(scene, camera)
  }

  return {
    render,
    fly: (f: Focus) => fly(f),
    /** Dev/E2E only: viewport positions of the usable drop zones and grab handles. */
    debug: () => {
      scene.updateMatrixWorld(true)
      const r = canvas.getBoundingClientRect()
      const v = new THREE.Vector3()
      const at_ = (m: THREE.Mesh) => {
        m.getWorldPosition(v).project(camera)
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
      }
      const zones: Record<string, { x: number; y: number }> = {}
      for (const m of zoneHits) if (usable(m)) zones[(m.userData.hit as HitTag).zone!] = at_(m)
      const grabs: Record<string, { x: number; y: number }> = {}
      grabHits.forEach((m, i) => {
        if (!usable(m)) return
        const tag = m.userData.hit as HitTag
        grabs[`${tag.dist ?? tag.part?.() ?? 'x'}${i}`] = at_(m)
      })
      return { zones, grabs, view: cur }
    },
    /** The door refused to open (interlock): a short shake. */
    shake: () => {
      if (!reducedMotion()) shakeT = 0.4
    },
  }
}
