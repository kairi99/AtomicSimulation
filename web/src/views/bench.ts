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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { WHEEL_WINDOW_DEG, type Apparatus, type Key, type Setup } from '../apparatus/apparatus'
import type { BenchAssemblyHooks, Distance, Part, Zone } from '../apparatus/assembly'
import { getLang, t } from '../i18n'
import { getMode } from '../pedagogy/mode'
import { WHEELS_MG_CM2 } from '../physics/tables'
import { armEaser, dpr, palette, paletteVersion, reducedMotion, type Palette } from './canvas'
import { at } from './assembly-i18n'
import { buildCollimator, buildCounter, buildFilterCap, buildHolderBox, buildStrip, buildTube, STRIP_R_CM, stripGeometry, makeMats, stageDiscGeometry } from './bench-models'
import { drawPanelFace } from './bench-panel-face'
import { fitPoints, freeArea, hitSizeCm, pxPerCm, s1FromRay, s2FromRay, type Reserve, type V3 } from './bench-assembly-geometry'
import { tableLayout, tableRect, tableSpots } from './bench-table-layout'
import { PLATE_R_CM, S1_CM } from './goniometer'
import { keySelected } from './panel'
import { BEAM_Y, CEIL, COL_X, D, FLOOR, H, SLIT_X, W, WALL_X } from '../apparatus/collision'

export type Focus = 'room' | 'panel' | 'monitor' | 'chamber'
export type Pick = Exclude<Focus, 'room'> | 'door'
type View = Focus | 'assembly' // 'assembly': the open chamber seen from the front while the student mounts the parts
type Colour = keyof Omit<Palette, 'caption' | 'footnote' | 'font' | 'mono'>

const RAD = Math.PI / 180
// Housing (instruction sheet §4) and the parts inside it, cm. x to the right, y up, z towards the student.
const ANODE_X = (COL_X + WALL_X) / 2
const DOOR_TOP = 40 // lead-glass window above the experiment chamber door
const DOOR_W = W / 2 - WALL_X - 1.5
const DOOR_X = (W / 2 + WALL_X) / 2 // the door's centre when closed
const DOOR_Z = D / 2 + 3 // its own track, in front of the tube chamber's door and the panel (the ADJUST knob stands 1.4 proud)
const DOOR_SLIDE = DOOR_X - DOOR_W / 2 + W / 2 - 0.3 // open, it has slid to the apparatus's left edge, over the tube chamber and the panel
const PANEL = { x: (-W / 2 + COL_X) / 2, y: 27.5, w: 15.5, h: 28 } // control panel face
const PX_PER_CM = 64 // panel texture resolution
const MONITOR = { x: 60, z: -4, yaw: -0.35, w: 44, h: 27.5, y: 34 } // a 20″ screen
const DASH_CM_PER_S = 3 // the beam's dashes travel while the tube emits
const LIGHT_BASE = 0.9 // light strength at --bench-light: 1
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
  const camera = new THREE.PerspectiveCamera(30, 1, 5, 1200) // near/far as tight as the scene allows: depth precision goes with far/near
  const controls = new OrbitControls(camera, canvas)
  Object.assign(controls, {
    enablePan: false, enableDamping: !reducedMotion(), dampingFactor: 0.12,
    minAzimuthAngle: -0.7, maxAzimuthAngle: 0.7, minPolarAngle: 0.5, maxPolarAngle: 1.45,
  })
  let dirty = true
  controls.enabled = false // until the first layout places the camera
  // White light; its strength follows --bench-light (dimmer in dark mode, so the housing doesn't glare). The metals need something
  // to reflect: a small studio-room environment, baked once.
  const sky = new THREE.HemisphereLight(0xffffff, 0xffffff, LIGHT_BASE)
  const sun = new THREE.DirectionalLight(0xffffff, LIGHT_BASE)
  sun.position.set(-40, 90, 70)
  scene.add(sky, sun)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  pmrem.dispose()

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
  const M = makeMats(matte)
  const housing = M.housing
  const trim = M.plastic
  const glass = matte('bench-glass', { transparent: true, opacity: 0.15, roughness: 0.08, depthWrite: false })
  // Glass never writes depth, so it is blended in sort order: drawn last (above the other translucent parts and the overlays of
  // order 0), the order cannot flip with the viewing angle and make the beam or the tags behind it pop in and out.
  const GLASS_ORDER = 5
  const doorGlass = matte('bench-glass', { transparent: true, opacity: 0.24, roughness: 0.08, depthWrite: false }) // the sliding door: a touch denser, so closed reads as closed
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

  const at3 = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o)
  /** One geometry from several meshes (their own transforms baked in): a draw call instead of many. */
  const merge = (meshes: THREE.Mesh[]) => {
    const gs = meshes.map((m) => {
      m.updateMatrix()
      return m.geometry.clone().applyMatrix4(m.matrix)
    })
    return mergeGeometries(gs)!
  }

  // Table: a light granite countertop (a speckled canvas texture, multiplied with the theme's table colour).
  const granite = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 512, 512)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 2400; i++) {
      const dark = rnd() < 0.75
      g.fillStyle = dark ? `rgba(50,44,56,${0.05 + rnd() * 0.2})` : `rgba(120,80,84,${0.04 + rnd() * 0.1})`
      g.beginPath()
      g.ellipse(rnd() * 512, rnd() * 512, 0.7 + rnd() * (dark ? 2.6 : 3.2), 0.7 + rnd() * 2.2, rnd() * 3, 0, 2 * Math.PI)
      g.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(7, 3.5)
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    return tex
  })()
  const table = matte('bench-table', { roughness: 0.5, map: granite })
  scene.add(box(210, 3, 105, table, 18, -1.5, 10))
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

  // Housing: feet, plinth with the connector strip, floor slab, roof, back, sides, the panel column, the chamber wall and the
  // front frames. Warm-grey powder coat, stainless frames, white liners in the experiment chamber, dark ones in the tube chamber.
  const dev = new THREE.Group()
  scene.add(dev)
  const feet = merge(
    [[-W / 2 + 4, -D / 2 + 4], [W / 2 - 4, -D / 2 + 4], [-W / 2 + 4, D / 2 - 4], [W / 2 - 4, D / 2 - 4]].map(([x, z]) => at3(cyl(1.5, 1.2, M.black, 'y', 16), x, 0.6, z)),
  )
  dev.add(new THREE.Mesh(feet, M.black))
  dev.add(box(W + 1.2, FLOOR - 2, D + 1, housing, 0, (FLOOR + 1.2) / 2 - 0.4, 0)) // plinth, a little wider than the body
  dev.add(box(W, 0.8, D, housing, 0, FLOOR - 0.4, 0))
  const handleMat = matte('bench-metal', { roughness: 0.5 })
  const roof = new THREE.Group() // cut away while assembling: the camera looks down into the chamber
  roof.add(box(W, H - CEIL, D, housing, 0, (H + CEIL) / 2, 0), box(W + 0.4, 0.7, 0.5, M.edge, 0, H - 0.35, D / 2 + 0.05))
  for (const x of [-W / 2 + 8, W / 2 - 8]) {
    // carry handles on the top corners: a flat grey strap on two posts
    roof.add(box(2.4, 0.7, 10, handleMat, x, H + 1.6, 0), box(2.4, 1.6, 1, handleMat, x, H + 0.8, -4.5), box(2.4, 1.6, 1, handleMat, x, H + 0.8, 4.5))
  }
  dev.add(roof)
  dev.add(box(W, CEIL - FLOOR, 1, housing, 0, (CEIL + FLOOR) / 2, -D / 2 + 0.5))
  dev.add(box(COL_X + W / 2, CEIL - FLOOR, D, housing, (COL_X - W / 2) / 2, (CEIL + FLOOR) / 2, 0))
  dev.add(box(1, CEIL - FLOOR, D, housing, W / 2 - 0.5, (CEIL + FLOOR) / 2, 0))
  dev.add(box(1.5, CEIL - FLOOR, D, housing, WALL_X, (CEIL + FLOOR) / 2, 0))
  // Liners. Experiment chamber: off-white walls and floor with a few countersunk screw holes. Tube chamber: dark.
  const IH = CEIL - FLOOR
  const liner = matte('bench-panel', { roughness: 0.6 }) // the chamber's light-grey walls and floor, a shade below the white plate
  const [ex0, ex1] = [WALL_X + 0.75 + 0.1, W / 2 - 1.1]
  dev.add(box(ex1 - ex0, IH, 0.2, liner, (ex0 + ex1) / 2, (CEIL + FLOOR) / 2, -D / 2 + 1.1))
  dev.add(box(ex1 - ex0, 0.2, D - 2, liner, (ex0 + ex1) / 2, FLOOR + 0.1, 0))
  dev.add(box(0.2, IH, D - 2, liner, ex1 + 0.1, (CEIL + FLOOR) / 2, 0))
  dev.add(box(0.2, IH, D - 2, liner, ex0 - 0.1, (CEIL + FLOOR) / 2, 0))
  const holes = (r: number, ps: [number, number][]) =>
    merge(ps.map(([x, z]) => at3(new THREE.Mesh(new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2)), x, FLOOR + 0.23, z)))
  const SCREWS: [number, number][] = [[7, 12], [22, 9], [30, 13], [15, -6], [27, -11], [5, -13]]
  dev.add(new THREE.Mesh(holes(0.55, SCREWS), M.black), new THREE.Mesh(holes(0.28, SCREWS).translate(0, 0.01, 0), M.steel))
  const [tx0, tx1] = [COL_X + 0.1, WALL_X - 0.75 - 0.1]
  dev.add(box(tx1 - tx0, IH, 0.2, M.black, (tx0 + tx1) / 2, (CEIL + FLOOR) / 2, -D / 2 + 1.1))
  dev.add(box(tx1 - tx0, 0.2, D - 2, M.black, (tx0 + tx1) / 2, FLOOR + 0.1, 0))
  dev.add(box(0.2, IH, D - 2, M.black, tx0 + 0.1, (CEIL + FLOOR) / 2, 0))
  dev.add(box(0.2, IH, D - 2, M.black, tx1 - 0.1, (CEIL + FLOOR) / 2, 0))
  // Front frames round both doors and the window, a little proud of the chambers (brushed stainless).
  const zf = D / 2 - 0.5
  const topFrame = box(W / 2 - WALL_X, 1.5, 1, M.steel, (W / 2 + WALL_X) / 2, DOOR_TOP, zf) // hides the arm's top when seen from the front
  dev.add(topFrame)
  dev.add(box(2.2, CEIL - FLOOR, 1, M.steel, WALL_X, (CEIL + FLOOR) / 2, zf))
  dev.add(box(1.2, CEIL - FLOOR, 1, M.steel, COL_X + 0.4, (CEIL + FLOOR) / 2, zf))
  dev.add(box(WALL_X - COL_X, 1.2, 1, M.steel, (COL_X + WALL_X) / 2, FLOOR + 0.2, zf)) // sill under the tube chamber
  const window_ = box(W / 2 - WALL_X - 1, CEIL - DOOR_TOP - 1, 0.4, glass, (W / 2 + WALL_X) / 2, (CEIL + DOOR_TOP) / 2, zf, 'chamber')
  window_.renderOrder = GLASS_ORDER
  dev.add(window_)
  const tubeDoor = box(WALL_X - COL_X - 1.4, CEIL - FLOOR - 1, 0.4, glass, (WALL_X + COL_X) / 2, (CEIL + FLOOR) / 2, D / 2 + 0.2)
  tubeDoor.renderOrder = GLASS_ORDER
  dev.add(tubeDoor)
  // The large round black port on the right wall of the experiment chamber.
  // Every face has its own depth: the black disc stands 0.15 cm proud of its white rim (the two front caps were coplanar and
  // z-fought into a moiré), and the rim 0.2 cm off the wall liner.
  const port = cyl(8.2, 0.3, matte('bench-black', { roughness: 0.28 }), 'x', 48)
  port.position.set(ex1 - 0.2, BEAM_Y, 0)
  const portRim = cyl(8.8, 0.2, M.white, 'x', 48)
  portRim.position.set(ex1 - 0.1, BEAM_Y, 0)
  dev.add(portRim, port)

  // Experiment chamber door: glass in a stainless frame with a vertical handle at its right edge, sliding left on its own
  // rail in front of the tube chamber.
  const door = new THREE.Group()
  const doorH = DOOR_TOP - FLOOR - 1
  const pane = box(DOOR_W - 2.2, doorH - 1.6, 0.4, doorGlass, 0.2, 0, 0)
  pane.renderOrder = GLASS_ORDER
  door.add(pane)
  for (const y of [-doorH / 2 + 0.4, doorH / 2 - 0.4]) door.add(box(DOOR_W, 0.8, 0.8, M.steel, 0, y, 0))
  door.add(box(1.4, doorH, 0.8, M.steel, -DOOR_W / 2 + 0.7, 0, 0), box(1, doorH, 0.8, M.steel, DOOR_W / 2 - 0.5, 0, 0))
  door.add(box(0.7, 10, 0.7, M.steel, DOOR_W / 2 - 1.6, 0, 1.5), box(0.5, 0.5, 1.2, M.steel, DOOR_W / 2 - 1.6, 4.3, 0.9), box(0.5, 0.5, 1.2, M.steel, DOOR_W / 2 - 1.6, -4.3, 0.9)) // handle
  pick(door, 'door')
  pane.userData.glass = true // open or locked, taps pass through the glass: only the frame and grip answer
  const doorX = DOOR_X
  door.position.set(doorX, FLOOR + 0.5 + doorH / 2, DOOR_Z)
  dev.add(door)
  // The door's track: a top and a bottom rail across the whole front, with the brackets that hold them off the frames.
  for (const y of [FLOOR + 0.5 + doorH + 0.7, FLOOR - 0.2]) {
    dev.add(box(W - 0.6, 0.8, 1.4, M.steel, 0, y, DOOR_Z))
    for (const x of [-W / 2 + 1.5, W / 2 - 1.5, WALL_X]) dev.add(box(1, 0.8, DOOR_Z - zf, M.steel, x, y, (DOOR_Z + zf) / 2))
  }

  // Control panel face: light grey, with the displays, keys, LEDs and labels as a texture, the ADJUST knob a real knob.
  const panelCanvas = document.createElement('canvas')
  panelCanvas.width = PANEL.w * PX_PER_CM
  panelCanvas.height = PANEL.h * PX_PER_CM
  const panelTex = new THREE.CanvasTexture(panelCanvas)
  dev.add(box(PANEL.w + 1.2, PANEL.h + 1.2, 0.2, M.edge, PANEL.x, PANEL.y, D / 2 + 0.1))
  const panelFace = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), new THREE.MeshBasicMaterial({ map: panelTex, toneMapped: false }))
  panelFace.position.set(PANEL.x, PANEL.y, D / 2 + 0.25) // clear of the bezel's front (D/2 + 0.2)
  dev.add(pick(panelFace, 'panel'))
  const KNOB_PX = { x: 4.7, y: 12.7 } // cm from the panel's top left
  const knob = new THREE.Group()
  const knobBody = cyl(2.2, 1.2, M.black, 'z', 40)
  const knobFace = cyl(1.9, 0.1, matte('bench-black', { roughness: 0.25 }), 'z', 40)
  knobFace.position.z = 0.6
  const notch = box(0.3, 1.0, 0.2, glow('accent', { opacity: 1 }), 0, 1.3, 0.7)
  knob.add(knobBody, knobFace, notch)
  knob.position.set(PANEL.x - PANEL.w / 2 + KNOB_PX.x, PANEL.y + PANEL.h / 2 - KNOB_PX.y, D / 2 + 0.8)
  dev.add(pick(knob, 'panel'))
  // Connector strip in the plinth: USB, HV IN (round), SIGNAL OUT (BNC), ANGLE and RATE (banana jacks).
  const STRIP = { x: -22.3, y: 3.7, w: 15.8, h: 3.7 }
  const PZ = (D + 1) / 2 // the plinth's front face
  dev.add(box(STRIP.w + 0.5, STRIP.h + 0.5, 0.1, M.edge, STRIP.x, STRIP.y, PZ + 0.05), box(STRIP.w, STRIP.h, 0.1, M.white, STRIP.x, STRIP.y, PZ + 0.1))
  const stripCanvas = document.createElement('canvas')
  stripCanvas.width = 632
  stripCanvas.height = 240
  const stripTex = new THREE.CanvasTexture(stripCanvas)
  stripTex.colorSpace = THREE.SRGBColorSpace
  const stripLabels = new THREE.Mesh(new THREE.PlaneGeometry(15.8, 6), new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, toneMapped: false, depthWrite: false }))
  stripLabels.position.set(STRIP.x, 3.95, PZ + 0.02)
  dev.add(stripLabels)
  const JACK_Z = PZ + 0.15
  const redMat = matte('danger', { roughness: 0.4 })
  const blueMat = matte('accent', { roughness: 0.4 })
  const redJacks: THREE.Mesh[] = []
  const blueJacks: THREE.Mesh[] = []
  const steelJacks: THREE.Mesh[] = []
  const holesJ: THREE.Mesh[] = []
  const jack = (list: THREE.Mesh[], r: number, len: number, x: number, y: number, hole = 0) => {
    list.push(at3(cyl(r, len, M.steel, 'z', 18), x, y, JACK_Z + len / 2))
    if (hole) holesJ.push(at3(cyl(hole, len + 0.05, M.black, 'z', 12), x, y, JACK_Z + len / 2 + 0.02))
  }
  jack(steelJacks, 1.15, 0.8, -23.3, STRIP.y, 0.85) // HV IN
  jack(steelJacks, 0.7, 0.9, -20.5, STRIP.y, 0.3) // SIGNAL OUT
  holesJ.push(at3(box(1.4, 1.0, 0.4, M.black, 0, 0, 0), -26.6, STRIP.y, JACK_Z + 0.2)) // USB
  for (const [x, y, list] of [[-18.2, STRIP.y + 1, redJacks], [-16.2, STRIP.y + 1, redJacks], [-18.2, STRIP.y - 1, blueJacks], [-16.2, STRIP.y - 1, blueJacks]] as const) {
    list.push(at3(cyl(0.5, 0.6, list === redJacks ? redMat : blueMat, 'z', 14), x, y, JACK_Z + 0.3))
    holesJ.push(at3(cyl(0.18, 0.65, M.black, 'z', 8), x, y, JACK_Z + 0.32))
  }
  for (const [list, mat] of [[redJacks, redMat], [blueJacks, blueMat], [steelJacks, M.steel], [holesJ, M.black]] as const) {
    dev.add(new THREE.Mesh(merge(list), mat))
  }

  // Tube chamber: the tube stands upright (finned heat sink, glass envelope with the amber anode at beam height, aluminium
  // foot); the X-rays leave sideways (+x) through the collimator. The filament glows while HV is on.
  const tube = buildTube(M, glass, BEAM_Y, FLOOR)
  tube.g.position.x = ANODE_X
  const cathodeGlow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), glow('led-on', { opacity: 0 }))
  cathodeGlow.position.set(ANODE_X, BEAM_Y + 5, 0)
  dev.add(tube.g, cathodeGlow)

  // Goniometer 554 831: its axis is horizontal, along z, on guide rods at the back of the chamber; the white plate stands upright
  // behind the beam on a long base rail with the counter, HV and signal sockets. Both arms turn in the x–y plane (rotation about
  // +z: positive = up, as seen from the front). The target stage sticks out towards the student so the crystal (or the absorber
  // strip) sits on the beam line at the axis; the counter sits on the sensor arm at s₂ from the axis, window to the axis.
  // Every Part of the assembly (apparatus/assembly.ts) is its own group, shown only while `assembly.mounted(part)`;
  // the goniometer itself, its guide rods and its ribbon cable are permanently installed (not parts) and drawn from the start. s₁ and s₂ come from the assembly (the student sets them).
  const BACK_Z = -9 // the plate's front face
  const RODS_Z = -D / 2 + 2
  const ARM_Z = BACK_Z + 1.4 // the sensor arm's rods, just in front of the plate
  const STAGE_Z = -1.45 // the target stage's disc
  const dist = { s1: hooks.assembly.distance('s1'), s2: hooks.assembly.distance('s2') }
  // Leaflet P6.3.2.1 measures the attenuation set-up to the EMPTY WINDOW of the absorber set (a point PLATE_R_CM beyond the
  // axis): s₁ from the collimator slit to it, s₂ from it to the sensor slit. Bragg measures to the target axis.
  // (The leaflet measures s₂ to the sensor-seat slit; the model puts the counter's window there, a small offset.)
  const refCm = () => (hooks.assembly.experiment === 'attenuation' ? PLATE_R_CM : 0)
  const axisX = () => SLIT_X + Math.max(1, dist.s1 - refCm())
  const s2Len = () => dist.s2 + refCm() // counter window along the sensor arm, from the axis
  const RAIL = { x0: 3, x1: 32.4, h: 5, z0: -13.6, z1: -8.2 }
  const railX = (RAIL.x0 + RAIL.x1) / 2
  dev.add(box(RAIL.x1 - RAIL.x0, RAIL.h, RAIL.z1 - RAIL.z0, M.white, railX, FLOOR + RAIL.h / 2, (RAIL.z0 + RAIL.z1) / 2))
  for (const y of [BEAM_Y + 13.4, BEAM_Y - 5]) {
    const rod = cyl(0.4, RAIL.x1 - RAIL.x0 + 1, M.steel, 'x', 12) // guide rods the unit slides on
    rod.position.set(railX, y, RODS_Z)
    dev.add(rod)
  }
  const gonio = new THREE.Group()
  gonio.position.set(axisX(), BEAM_Y, 0)
  dev.add(gonio)
  gonio.add(box(13, 21, 0.6, M.white, 0, 3.5, BACK_Z - 0.3))
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.16, 48, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), M.alu) // brushed-aluminium semicircle round the axis
  disc.position.z = BACK_Z + 0.08
  gonio.add(disc)
  const heads: THREE.Mesh[] = []
  const crosses: THREE.Mesh[] = []
  for (const [x, y] of [[-5.6, 12.8], [5.6, 12.8], [-5.6, -5.9], [5.6, -5.9], [-1.7, 9.8], [1.7, 9.8]]) {
    heads.push(at3(cyl(0.4, 0.12, M.steel, 'z', 12), x, y, BACK_Z + 0.06))
    crosses.push(at3(box(0.5, 0.08, 0.05, M.black, 0, 0, 0), x, y, BACK_Z + 0.13), at3(box(0.08, 0.5, 0.05, M.black, 0, 0, 0), x, y, BACK_Z + 0.13))
  }
  gonio.add(new THREE.Mesh(merge(heads), M.steel), new THREE.Mesh(merge(crosses), M.black)) // Phillips screw heads
  const thumbs = [-4.8, 4.8].map((x) => at3(cyl(0.45, 2, M.knurled, 'y', 14), x, -6.4, BACK_Z + 0.5)) // the two knurled thumb screws
  const carriage: THREE.Mesh[] = []
  for (const y of [13.4, -5]) {
    carriage.push(at3(box(4, 1.8, 1.8, M.steel, 0, 0, 0), 0, y, RODS_Z), at3(cyl(0.5, RODS_Z - BACK_Z + 0.6, M.steel, 'z', 10), 0, y, (RODS_Z + BACK_Z - 0.6) / 2))
  }
  gonio.add(...thumbs, new THREE.Mesh(merge(carriage), M.steel)) // slides on both rods
  const targetArm = new THREE.Group()
  const brassParts = [box(2.8, 4.2, 2.4, M.brass, 1, 0, -5.6), box(3, 0.5, 2.6, M.brass, 1, 2.35, -5.6), cyl(0.5, 2.8, M.brass, 'z', 14)]
  brassParts[2].position.set(0, 0, -3) // post from the brass block to the stage
  const stage = new THREE.Mesh(merge(brassParts), M.brass) // the target holder
  const clamp = new THREE.Group() // thread and black knurled clamp knob on top of the block
  clamp.add(at3(cyl(0.15, 1.6, M.steel, 'y', 8), 1, 3.4, -5.6), at3(cyl(0.55, 1.5, M.knurledBlack, 'y', 14), 1, 4.4, -5.6))
  const crystalW = new THREE.Group()
  const crystal = box(2.6, 0.5, 2.4, M.crystal, 0, -0.25, 0) // top face through the axis, flat at 0°
  crystal.renderOrder = 2
  const crystalLif = box(2.2, 0.45, 2, M.crystalLif, 0, -0.225, 0)
  crystalLif.renderOrder = 2
  crystalW.add(crystal, crystalLif)
  const stageW = new THREE.Group()
  const stageTable = new THREE.Group() // the target stage (grey block with its knob): its grab volume hangs here
  // The target HOLDER (black disc with its slots and curved groove) never leaves the brass block: always drawn, not a Part.
  const stageDisc = new THREE.Mesh(stageDiscGeometry(), M.black)
  stageDisc.position.z = STAGE_Z
  targetArm.add(stageDisc)
  const holderBox = buildHolderBox(M) // grey crystal holder with its knob: on the stage in the Bragg set-up
  holderBox.position.y = -0.5
  stageW.add(stageTable, holderBox)
  const plate = new THREE.Group() // absorber strip in the holder's groove: slot k is on the beam line at β = 10k°
  plate.position.z = STAGE_Z + 0.85 // the 4 cm strip straddles the disc's rim
  targetArm.add(stage, clamp, crystalW, stageW, plate)
  const foilW = new THREE.Group()
  const collFoil = buildFilterCap(M, 'Zr', palette.font || 'sans-serif') // the Zr cap slips over the collimator tip
  collFoil.position.set(SLIT_X - 0.3, BEAM_Y, 0)
  foilW.add(collFoil)
  dev.add(foilW)
  const sensorArm = new THREE.Group()
  // The arm stalls where the counter meets the chamber (apparatus/collision.ts): the Apparatus never asks for more.
  const armRods = [-2.9, 2.9].map((y) => at3(cyl(0.3, 1, M.steel, 'x', 10), 0, y, ARM_Z)) // two parallel thin rods; length and place follow s₂ (applyDist)
  const armLeft = box(1.1, 6.6, 1.4, M.alu, -5.9, 0, ARM_Z)
  const armRight = box(1.3, 6.6, 1.4, M.alu, 0, 0, ARM_Z) // the bracket at the counter end
  const makeCounter = (postLen: number) => {
    const c = buildCounter(M, postLen)
    return { g: c.g, body: c.body }
  }
  const counterW = new THREE.Group()
  const cM = makeCounter(-ARM_Z)
  const sensorFoil = at3(cyl(0.9, 0.1, M.fills[5]!, 'x', 24), -1.4, 0, 0)
  cM.g.add(sensorFoil)
  counterW.add(cM.g)
  sensorArm.add(...armRods, armLeft, armRight, counterW)
  gonio.add(targetArm, sensorArm)
  pick(gonio, 'chamber')

  // Collimator: a stainless ring on the chamber wall stays; the knurled cone with its brass slit insert is shown once mounted.
  const grooveRing = cyl(2.7, 0.3, M.steel, 'x', 40)
  grooveRing.position.set(WALL_X + 1.0, BEAM_Y, 0)
  const grooveHole = cyl(1.5, 0.05, M.black, 'x', 24)
  grooveHole.position.set(WALL_X + 1.17, BEAM_Y, 0)
  dev.add(grooveRing, grooveHole)
  const collW = buildCollimator(M, WALL_X + 1.3, SLIT_X, BEAM_Y)
  dev.add(collW)

  // Sockets: the goniometer's ribbon cable (already plugged in, on the chamber's back wall) and, on the base rail, "GM-TUBE"
  // for the counter's cable, "HV OUT" and "SIGNAL IN".
  const RIB_Z = -D / 2 + 1.3
  const SOCK_Z = RAIL.z1
  const ribbonSock = { x: WALL_X + 4.5, y: BEAM_Y + 13 }
  const gmSock = { x: 6.4, y: FLOOR + 2.4 }
  dev.add(box(3.4, 2.4, 0.8, M.steel, ribbonSock.x, ribbonSock.y, RIB_Z))
  const railSock = (x: number, r: number, hole: number, round = true) => {
    const o = new THREE.Group()
    o.add(at3(cyl(r, 0.5, M.steel, 'z', 20), 0, 0, 0.25), at3(cyl(hole, 0.55, M.black, 'z', 16), 0, 0, 0.27))
    if (!round) o.add(at3(cyl(0.18, 0.7, M.steel, 'z', 8), 0, 0, 0.35))
    o.position.set(x, gmSock.y, SOCK_Z)
    dev.add(o)
  }
  railSock(gmSock.x, 1.05, 0.7)
  railSock(23.8, 0.95, 0.7)
  railSock(28.2, 0.8, 0.5, false)
  const labelCanvas = document.createElement('canvas')
  labelCanvas.width = 1176
  labelCanvas.height = 200
  const labelTex = new THREE.CanvasTexture(labelCanvas)
  labelTex.colorSpace = THREE.SRGBColorSpace
  const labelPlane = new THREE.Mesh(new THREE.PlaneGeometry(RAIL.x1 - RAIL.x0, RAIL.h), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, toneMapped: false, depthWrite: false }))
  labelPlane.position.set(railX, FLOOR + RAIL.h / 2, SOCK_Z + 0.02)
  dev.add(labelPlane)
  const drawLabel = () => {
    const c = labelCanvas.getContext('2d')!
    c.clearRect(0, 0, 1176, 200)
    c.fillStyle = palette['bench-trim']
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    const px = (x: number) => (x - RAIL.x0) * 40
    c.font = `600 26px ${palette.font}`
    c.fillText('GM-TUBE', px(gmSock.x + 1.9), 100)
    c.fillText('HV', px(23.8 + 1.5), 90)
    c.fillText('SIGNAL', px(28.2 + 1.3), 90)
    c.font = `500 16px ${palette.font}`
    c.fillText('OUT', px(23.8 + 1.5), 118)
    c.fillText('IN', px(28.2 + 1.3), 118)
    labelTex.needsUpdate = true
    // connector strip on the plinth
    const s = stripCanvas.getContext('2d')!
    s.clearRect(0, 0, 632, 240)
    s.fillStyle = palette['bench-trim']
    s.textAlign = 'center'
    s.textBaseline = 'middle'
    s.font = `500 21px ${palette.font}`
    for (const [x, label] of [[-26.6, 'USB'], [-23.3, 'HV IN'], [-20.5, 'SIGNAL OUT'], [-18.2, 'ANGLE'], [-16.2, 'RATE']] as const) s.fillText(label, (x - (STRIP.x - 7.9)) * 40, 30)
    stripTex.needsUpdate = true
  }

  // Ribbon cable: flat, along the back wall from the socket to the carriage (follows s₁). Always drawn: it is permanently connected.
  const ribbonW = new THREE.Group() // always visible (not an assembly part)
  const ribbonMat = matte('bench-black', { roughness: 0.6 })
  const ribH = box(1, 1.8, 0.15, ribbonMat, 0, ribbonSock.y, RIB_Z + 0.2)
  const ribV = box(1.8, 1, 0.15, ribbonMat, 0, 0, RIB_Z + 0.2)
  ribbonW.add(ribH, ribV)
  dev.add(ribbonW)

  // Counter cable: a round black tube whose rings are rewritten when the arm or the distances move. Leaves the counter's rear
  // along the arm, droops to the floor and ends in a plug on the GM-TUBE socket.
  const cableW = new THREE.Group()
  const CABLE_N = 36
  const CABLE_R = 6
  const cablePos = new Float32Array((CABLE_N + 1) * CABLE_R * 3)
  const cableNor = new Float32Array(cablePos.length)
  const cableIdx: number[] = []
  for (let i = 0; i < CABLE_N; i++) {
    for (let j = 0; j < CABLE_R; j++) {
      const a = i * CABLE_R + j
      const b = i * CABLE_R + ((j + 1) % CABLE_R)
      cableIdx.push(a, a + CABLE_R, b, b, a + CABLE_R, b + CABLE_R)
    }
  }
  const cableGeo = new THREE.BufferGeometry()
  cableGeo.setAttribute('position', new THREE.BufferAttribute(cablePos, 3))
  cableGeo.setAttribute('normal', new THREE.BufferAttribute(cableNor, 3))
  cableGeo.setIndex(cableIdx)
  const cableMesh = new THREE.Mesh(cableGeo, M.black)
  cableMesh.frustumCulled = false
  const plug = new THREE.Group()
  plug.add(at3(cyl(0.7, 2, M.black, 'z', 14), 0, 0, 1.5), at3(cyl(0.85, 0.5, M.steel, 'z', 14), 0, 0, 0.75))
  plug.position.set(gmSock.x, gmSock.y, SOCK_Z)
  cableW.add(cableMesh, plug)
  dev.add(cableW)
  const cp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const cP = new THREE.Vector3()
  const cT = new THREE.Vector3()
  const cN = new THREE.Vector3()
  const cB = new THREE.Vector3()
  const cQ = new THREE.Vector3()
  const bez = (t: number, out: THREE.Vector3) => {
    const u = 1 - t
    return out.set(0, 0, 0).addScaledVector(cp[0], u * u * u).addScaledVector(cp[1], 3 * u * u * t).addScaledVector(cp[2], 3 * u * t * t).addScaledVector(cp[3], t * t * t)
  }
  const updateCable = (armRad: number) => {
    const c = Math.cos(armRad)
    const sn = Math.sin(armRad)
    const r = s2Len() + 8.9
    cp[0].set(axisX() + c * r, BEAM_Y + sn * r, 0)
    cp[1].set(cp[0].x + c * 4, Math.max(FLOOR + 1, cp[0].y + sn * 4 - 6), 4)
    cp[3].set(gmSock.x, gmSock.y, SOCK_Z + 2.5)
    cp[2].set(cp[3].x + 4, FLOOR + 0.6, cp[3].z + 8)
    cN.set(0, 0, 1)
    for (let i = 0; i <= CABLE_N; i++) {
      bez(i / CABLE_N, cP)
      bez(Math.min(1, (i + 1) / CABLE_N), cT).sub(bez(Math.max(0, (i - 1) / CABLE_N), cQ)).normalize()
      cN.addScaledVector(cT, -cN.dot(cT)).normalize() // parallel transport: the ring frame never flips
      cB.crossVectors(cT, cN)
      for (let j = 0; j < CABLE_R; j++) {
        const a = (j / CABLE_R) * 2 * Math.PI
        const k = (i * CABLE_R + j) * 3
        const nx = Math.cos(a) * cN.x + Math.sin(a) * cB.x
        const ny = Math.cos(a) * cN.y + Math.sin(a) * cB.y
        const nz = Math.cos(a) * cN.z + Math.sin(a) * cB.z
        cableNor[k] = nx
        cableNor[k + 1] = ny
        cableNor[k + 2] = nz
        cablePos[k] = cP.x + 0.2 * nx
        cablePos[k + 1] = cP.y + 0.2 * ny
        cablePos[k + 2] = cP.z + 0.2 * nz
      }
    }
    cableGeo.attributes.position.needsUpdate = true
    cableGeo.attributes.normal.needsUpdate = true
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
  const KEY_ORDER: Key[] = ['U', 'I', 'DT', 'DBETA', 'LIMITS', 'SENSOR', 'TARGET', 'COUPLED', 'ZERO', 'RESET', 'REPLAY', 'SCAN', 'SPEAKER', 'HV']
  let panelSig = ''
  const drawPanel = (): boolean => {
    const d = a.display()
    const blink = !reducedMotion() && Math.floor(performance.now() / 500) % 2 === 1 // the device flashes at ~1 Hz
    const lamp = d.hvLamp && !blink
    const top = !(d.blinkTop && blink)
    const bottom = !(d.flashBottom && blink)
    const keys = KEY_ORDER.map((k) => (keySelected(a, k) ? 1 : 0)).join('')
    const sig = `${d.top}|${d.topUnit}|${d.bottom}|${d.bottomUnit}|${d.symbol}|${lamp}|${top}|${bottom}|${d.blinkTop}|${d.flashBottom}|${keys}|${a.mode}|${getLang()}|${paletteVersion}`
    if (sig === panelSig) return false
    panelSig = sig
    const s = t()
    drawPanelFace(pc, palette, {
      display: d, lamp, top, bottom, modeLetter: a.mode?.[0] ?? '', selected: (k) => keySelected(a, k), labels: (k) => s.keys[k][0],
      adjust: s.adjust, reduced: reducedMotion(),
    }, PX_PER_CM)
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
    // Assembly: the whole open chamber AND the workbench in front of it, from the front and a little above, centred in what the
    // HUD leaves free. The view is fitted to the projected corners of both, so nothing needs orbiting.
    const r = env.reserve()
    const fa = freeArea(vw, vh, r)
    tableCfg = tableLayout((fa.fw * vw) / (fa.fh * vh) < 0.9)
    const rows = Math.ceil(partsOnTable().length / tableCfg.cols)
    const tx = (tableCfg.cols * tableCfg.dx) / 2 + 3
    const zMax = tableCfg.z0 + (rows - 1) * tableCfg.dz + 7 // the last row's labels
    const cx = tableCfg.cx
    const pts: V3[] = []
    for (const x of [1, 34]) for (const y of [FLOOR, CEIL]) for (const z of [-D / 2, D / 2]) pts.push({ x, y, z })
    for (const x of [cx - tx, cx + tx]) for (const z of [D / 2, zMax]) pts.push({ x, y: 0, z })
    const target = new THREE.Vector3(cx, 17, (zMax - D / 2) / 2)
    const dir = new THREE.Vector3(0, tableCfg.elev, 1).normalize()
    const d = fitPoints(pts, target, dir, camera.fov, camera.aspect, fa.fw, fa.fh, 1.05)
    presets.assembly = { target, pos: target.clone().addScaledVector(dir, d), dx: fa.dx, dy: fa.dy }
    reserveSig = `${r.left}|${r.right}|${r.top}|${r.bottom}`
    asmDist = d
    relayoutTable()
    scaleDist = NaN
    refreshScale(d)
    sizeHits() // the table zone's extent may have changed even if the finger size did not
    const room = presets.room.pos.distanceTo(presets.room.target)
    roomLimits = { min: 0.45 * room, max: 1.3 * room }
    applyLimits()
  }
  // Orbit limits per view. Room: the original narrow cone. Assembly: wider, so the student can look into the open chamber from
  // the side (±63°) and from high above, never from under the table (the camera stays above the table plane), and zoom from
  // 0.4x to 1.6x of the default fitted distance. Pan is on (right drag / two fingers), the target boxed around chamber + table.
  let asmDist = 100
  let roomLimits = { min: 1, max: 1000 }
  const PAN_BOX = new THREE.Box3(new THREE.Vector3(-12, 4, -12), new THREE.Vector3(48, 36, 70))
  const applyLimits = () => {
    if (cur === 'assembly') {
      Object.assign(controls, {
        enablePan: true, minAzimuthAngle: -1.1, maxAzimuthAngle: 1.1, minPolarAngle: 0.3, maxPolarAngle: 1.4,
        minDistance: 0.4 * asmDist, maxDistance: 1.6 * asmDist,
      })
    } else {
      Object.assign(controls, {
        enablePan: false, minAzimuthAngle: -0.7, maxAzimuthAngle: 0.7, minPolarAngle: 0.5, maxPolarAngle: 1.45,
        minDistance: roomLimits.min, maxDistance: roomLimits.max,
      })
    }
  }
  // Things sized for the default assembly distance follow the real camera distance: the finger-sized drop volumes (48 css px
  // on screen) and the width of the table labels. Cheap: only recomputed when the distance moved by > 3 %.
  let scaleDist = NaN
  function refreshScale(dist: number) {
    if (Math.abs(dist - scaleDist) < 0.03 * scaleDist) return
    scaleDist = dist
    const ppc = pxPerCm(vh, camera.fov, dist)
    const next = Math.min(hitSizeCm(0, ppc, 48), 3 * hitSizeCm(0, pxPerCm(vh, camera.fov, asmDist), 48)) // far out: capped, so volumes don't swallow their neighbours
    if (next !== hitMinCm) ((hitMinCm = next), sizeHits())
    tagBox.style.setProperty('--tag-w', `${Math.round(tableCfg.dx * ppc * 0.92)}px`)
  }
  const orbitable = (v: View) => v === 'room' || v === 'assembly'
  let userOrbit = false // the student moved the assembly camera: a relayout keeps it (see relayout)
  const AXIS_C = SLIT_X + S1_CM // the chamber framing keeps the default geometry
  let focus: Focus = 'room'
  let cur: View = 'room'
  let flight: { from: THREE.Vector3; fromTarget: THREE.Vector3; fromDx: number; fromDy: number; t0: number; ms: number } | null = null
  let dragActive = false // a part or a distance is being dragged: the orbit controls stay off
  let orbiting = false // an orbit / zoom / pan gesture is in progress: a pointer-down then never grabs a part
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
    if (!flight && orbitable(cur)) lookAt.copy(controls.target) // pan moved the target: fly from where the camera really looks
    cur = v
    userOrbit = false
    applyLimits()
    // Seen from the front the frame above the door would cover the arm's top, and the open door (it only half clears the
    // opening) the chamber card: they step aside. The assembly view keeps the door: the student slides it shut there.
    topFrame.visible = !(v === 'chamber' || v === 'assembly')
    door.visible = v !== 'chamber' // the assembly view shows it: closing it by hand is a step
    roof.visible = v !== 'assembly'
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
    if (orbitable(cur)) {
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
  type HitTag = { zone?: Zone; part?: () => Part | null; dist?: Distance; on?: () => boolean; table?: boolean }
  const A = () => hooks.assembly
  const hitMat = new THREE.MeshBasicMaterial({ visible: false }) // raycastable, never drawn
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const zoneHits: THREE.Mesh[] = []
  const grabHits: THREE.Mesh[] = []
  const doorHits: THREE.Mesh[] = [] // the door's grip: grabbed, it slides along its track
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
    for (const m of [...zoneHits, ...grabHits, ...doorHits]) {
      const b = m.userData.base as [number, number, number]
      if (m.userData.flat) {
        m.scale.set(b[0], b[1], b[2]) // the table zone is as big as the table, not finger-sized
        continue
      }
      m.scale.set(Math.max(b[0], hitMinCm), Math.max(b[1], hitMinCm), Math.max(b[2], hitMinCm))
    }
  }
  const zonesNow = (): readonly Zone[] => A().zones()
  // Ghosts: an accent-coloured translucent box with outline, child of its hit volume (same place and size).
  const ghosts = new Map<Zone, { g: THREE.Group; fill: THREE.MeshBasicMaterial; hit: THREE.Mesh }>()
  const edgesGeo = new THREE.EdgesGeometry(unit)
  const zoneHit = (zone: Zone, parent: THREE.Object3D, base: [number, number, number], pos: [number, number, number], on: () => boolean, flat = false) => {
    const h = hitBox(zoneHits, parent, base, pos, { zone, on: () => on() && zonesNow().includes(zone) })
    if (flat) h.userData.flat = true
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
    return h
  }
  zoneHit('collimatorMount', dev, [6, 5, 5], [WALL_X + 3, BEAM_Y, 0], () => !A().mounted('collimator'))
  zoneHit('gmSocket', dev, [5, 4, 4], [gmSock.x, gmSock.y, SOCK_Z + 1], () => true)
  zoneHit('sensorSeat', sensorArm, [9, 4, 4], [s2Len() + 4, 0, 0], () => true)
  zoneHit('targetHolder', targetArm, [5, 5, 5], [0, -0.25, 0], () => true)
  // Ghost of the absorber strip in the holder's groove (replaces the box ghost while a strip is carried).
  const stripGhostFill = glow('accent', { opacity: 0 })
  stripGhostFill.depthTest = false
  stripGhostFill.side = THREE.DoubleSide
  const stripGhost = new THREE.Mesh(stripGeometry('ghost', [0, 0, 0, 0, 0, 0, 0], WHEEL_WINDOW_DEG).frame, stripGhostFill)
  stripGhost.renderOrder = 20
  stripGhost.position.z = plate.position.z
  stripGhost.visible = false
  targetArm.add(stripGhost)
  zoneHit('collimatorTip', dev, [3, 4, 4], [SLIT_X + 0.5, BEAM_Y, 0], () => true)
  // The table in front of the apparatus is one big drop zone ("off the apparatus"); its extent follows the layout (relayoutTable).
  const trayHit = zoneHit('tray', scene, [70, 0.4, 30], [17.5, 0.2, 40], () => assemblyView(), true)
  // Grab volumes: parts on the device that can be dragged out (back to the table), and the two distance handles.
  hitBox(grabHits, cM.g, [9, 3.4, 3.4], [3, 0, 0], { part: () => 'counter', dist: 's2' })
  hitBox(grabHits, stageTable, [4, 3, 3.4], [0, -1, 0], { part: () => 'targetStage' })
  hitBox(grabHits, collFoil, [3, 4, 4], [0, 0, 0], { part: () => 'zrFilter' })
  hitBox(grabHits, plate, [3.6, 5, 4], [2.4, -2, 0], { // tight round the arc: the axis stays free for the s₁ handle behind it
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
    for (const r of armRods) {
      r.scale.y = s2Len() + 9 // from the bracket left of the axis to the one at the counter end
      r.position.x = (s2Len() - 2.8) / 2
    }
    armRight.position.x = s2Len() + 3.1
    cM.g.position.x = s2Len()
    ghosts.get('sensorSeat')!.hit.position.x = s2Len() + 4
    const rx = ribbonSock.x
    ribH.scale.x = Math.max(0.01, ax - rx)
    ribH.position.x = (rx + ax) / 2
    const vTop = ribbonSock.y
    const vBot = BEAM_Y + 9
    ribV.position.set(ax, (vTop + vBot) / 2, RIB_Z + 0.2)
    ribV.scale.y = vTop - vBot
    dimS1 = dimS2 = NaN
    cabS1 = cabS2 = NaN
    dirty = true
  }
  let cabS1 = NaN
  let cabS2 = NaN
  let cabArm = NaN

  // Which accessories show: while assembling, what the assembly says; afterwards the Apparatus decides (tasks swap crystal/detector).
  // ── The workbench: every part of the experiment lies on the table in front of the apparatus at its fixed home spot, with a
  // small label. The student grabs one there and drops it on a lit zone; a part taken off the device returns to its spot.
  type Prop = {
    part: Part; g: THREE.Group; rest: number; home: THREE.Vector3; from: THREE.Vector3; t0: number; tag: HTMLElement
    front: number; hit: THREE.Mesh; tx: number; ty: number
  }
  const props = new Map<Part, Prop>()
  const propRoot = new THREE.Group()
  scene.add(propRoot)
  const tagBox = document.createElement('div')
  tagBox.className = 'bench-tags'
  tagBox.setAttribute('aria-hidden', 'true')
  canvas.parentElement?.append(tagBox)
  const mkProp = (part: Part, rest: number, front: number, hitBase: [number, number, number], build: (g: THREE.Group) => void) => {
    const g = new THREE.Group()
    build(g)
    g.visible = false
    propRoot.add(g)
    const tag = document.createElement('span')
    tag.className = 'bench-tag'
    tag.hidden = true
    tagBox.append(tag)
    const hit = hitBox(grabHits, g, hitBase, [0, 0, 0], { part: () => part, on: () => carry?.part !== part })
    hit.userData.hit.table = true
    const pr: Prop = { part, g, rest, home: new THREE.Vector3(0, rest, 0), from: new THREE.Vector3(), t0: 0, tag, front, hit, tx: NaN, ty: NaN }
    props.set(part, pr)
    return pr
  }
  const propFont = palette.font || 'sans-serif'
  mkProp('collimator', 2.4, 2.5, [10, 3, 3], (g) => {
    g.add(buildCollimator(M, -2, 2.1, 0))
  })
  mkProp('counter', 2, 2, [9, 3, 3], (g) => {
    const c = makeCounter(0.4)
    c.g.position.x = -3.5 // centred on its body
    g.add(c.g)
  })
  mkProp('counterCable', 0.25, 3, [6, 1.5, 6], (g) => {
    // a coiled black cable with a round connector
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 90; i++) {
      const u = i / 90
      const ang = u * 2.4 * 2 * Math.PI
      const r = 2.5 - 0.5 * u
      pts.push(new THREE.Vector3(Math.cos(ang) * r, u * 0.5, Math.sin(ang) * r))
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.2, 6), M.black))
    g.add(at3(cyl(0.7, 2.2, M.black, 'x', 14), 3.6, 0.2, 0), at3(cyl(0.85, 0.5, M.steel, 'x', 14), 2.8, 0.2, 0))
  })
  mkProp('targetStage', 1.9, 2.5, [4, 3, 3.4], (g) => {
    g.add(buildHolderBox(M)) // the grey stage with its black knob, standing on the table
  })
  mkProp('naclCrystal', 0.3, 1.5, [3, 3, 3], (g) => g.add(box(2.6, 0.5, 2.4, M.crystal, 0, 0, 0)))
  mkProp('lifCrystal', 0.25, 1.5, [3, 3, 3], (g) => g.add(box(2.2, 0.45, 2, M.crystalLif, 0, 0, 0)))
  const stripProp = (key: string, kind: number[]) => (g: THREE.Group) => {
    const strip = buildStrip(M, key, kind, WHEEL_WINDOW_DEG)
    strip.rotation.z = -60 * RAD // lying on its curve, the windows facing up
    g.add(strip)
  }
  mkProp('absorbersI', STRIP_R_CM, 3, [7, 5, 4], stripProp('I', [0, 2, 2, 2, 2, 2, 2]))
  mkProp('absorbersII', STRIP_R_CM, 3, [7, 5, 4], stripProp('II', [0, 1, 2, 3, 4, 5, 6]))
  mkProp('zrFilter', 0.85, 2.2, [4, 4, 3], (g) => {
    const cap = buildFilterCap(M, 'Zr', propFont)
    cap.rotation.z = Math.PI / 2 // standing on its end, its label up
    g.add(cap)
  })
  /** The parts that lie on the table in this experiment (the order of the layout). */
  function partsOnTable(): readonly Part[] {
    return A().parts()
  }
  let tableCfg = tableLayout(false)
  const tableShown = (): boolean => assemblyView()
  function relayoutTable() {
    const parts = partsOnTable()
    const spots = tableSpots(parts, tableCfg)
    for (const p of parts) {
      const pr = props.get(p)!
      const sp = spots[p]!
      pr.home.set(sp.x, pr.rest, sp.z)
      if (pr.t0 === 0 && carry?.part !== p) pr.g.position.copy(pr.home)
    }
    const rc = tableRect(parts.length, tableCfg)
    trayHit.userData.base = [rc.w, 0.4, rc.d]
    trayHit.position.set(rc.cx, 0.2, rc.cz)
    applyProps()
    dirty = true
  }
  let tagLang = ''
  function applyProps() {
    const As = A()
    const on = tableShown()
    const inExp = partsOnTable()
    for (const pr of props.values()) {
      const shown = on && inExp.includes(pr.part) && (!As.mounted(pr.part) || carry?.part === pr.part)
      if (pr.g.visible !== shown) pr.g.visible = shown
      const tagOn = shown && carry?.part !== pr.part
      if (pr.tag.hidden === tagOn) pr.tag.hidden = !tagOn
    }
    dirty = true
  }
  const FLY_MS = 320
  const stepProps = (now: number) => {
    for (const pr of props.values()) {
      if (pr.t0 === 0) continue
      const x = reducedMotion() ? 1 : Math.min(1, (now - pr.t0) / FLY_MS)
      pr.g.position.lerpVectors(pr.from, pr.home, ease(x))
      dirty = true
      if (x === 1) pr.t0 = 0
    }
  }
  const tagV = new THREE.Vector3()
  /** Labels follow their parts on screen: written only after a frame was drawn, and only when the position moved. */
  const placeTags = () => {
    const lang = getLang()
    const relabel = lang !== tagLang
    tagLang = lang
    for (const pr of props.values()) {
      if (relabel) pr.tag.textContent = at().partsShort[pr.part]
      if (pr.tag.hidden) continue
      tagV.set(pr.home.x, 0, pr.home.z + pr.front)
      tagV.project(camera)
      const x = Math.round(((tagV.x + 1) / 2) * vw)
      const y = Math.round(((1 - tagV.y) / 2) * vh)
      if (x !== pr.tx || y !== pr.ty) {
        pr.tx = x
        pr.ty = y
        pr.tag.style.transform = `translate(${x}px, ${y}px)`
      }
    }
  }
  let builtHolder = ''
  const buildHolder = (holder: Setup['holder']) => {
    const key = `${holder}|${WHEELS_MG_CM2.al.length}|${WHEELS_MG_CM2.material.length}`
    if (key === builtHolder) return
    builtHolder = key
    plate.clear() // the strips' geometries are shared and cached: nothing is disposed
    if (!holder.endsWith('Wheel')) return
    const tiles = WHEELS_MG_CM2[holder === 'alWheel' ? 'al' : 'material']
    const count = tiles.length || 7 // before the absorber tables arrive the sets are drawn with all their windows
    // Slot 0 is open; set I is all aluminium, set II one material per slot: polystyrene, Al, Fe, Cu, Zr, Ag.
    const kind = Array.from({ length: 7 }, (_, n) => (n === 0 || n >= count || (tiles.length > 0 && !tiles[n]) ? 0 : holder === 'alWheel' ? 2 : n))
    plate.add(buildStrip(M, `${holder}${kind.join('')}`, kind, WHEEL_WINDOW_DEG))
  }
  let lastSetup: Setup | null = null
  let lastDone = false
  let asmDirty = true
  let lastTable = false
  const applyVisibility = () => {
    const As = A()
    const assembling = !As.done()
    collW.visible = As.mounted('collimator')
    counterW.visible = As.mounted('counter')
    cableW.visible = As.mounted('counterCable')
    stageW.visible = As.mounted('targetStage')
    const s_ = a.setup
    const holder: Setup['holder'] = assembling
      ? As.mounted('naclCrystal') || As.mounted('lifCrystal') ? 'crystal' : As.mounted('absorbersI') ? 'alWheel' : As.mounted('absorbersII') ? 'materialWheel' : 'empty'
      : s_.holder
    buildHolder(holder)
    const lif = assembling ? As.mounted('lifCrystal') : s_.crystal === 'LiF'
    crystal.visible = holder === 'crystal' && !lif
    crystalLif.visible = holder === 'crystal' && lif
    collFoil.visible = assembling ? As.mounted('zrFilter') : !!s_.collimatorFilter
    sensorFoil.visible = assembling ? false : !!s_.sensorFilter
    lastSetup = s_
    lastDone = !assembling
    asmDirty = false
    applyProps()
    dirty = true
  }
  applyDist()

  // Snap-in: a newly mounted part eases from a little above and towards the student into its place.
  const snapRoots: Partial<Record<Part, THREE.Object3D>> = {
    collimator: collW, counter: counterW, targetStage: stageW, naclCrystal: crystalW, lifCrystal: crystalW, zrFilter: foilW, absorbersI: plate, absorbersII: plate,
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
    relayoutTable()
    go(effective())
  }

  // ── Drag lifecycle (the HUD owns thresholds, Escape and the drop; we draw the carried part and the zones, and resolve drops)
  let carry: { part: Part } | null = null
  const carryPlane = new THREE.Plane()
  const carryN = new THREE.Vector3()
  const carryPt = new THREE.Vector3()
  const grabPt = new THREE.Vector3() // where the pointer met the part (world)
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
    if (!dragActive && orbitable(cur) && !flight) controls.enabled = true
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
  hooks.onDragStart = (part, zones) => {
    dragActive = true
    controls.enabled = false
    valid.clear()
    for (const z of zones) valid.add(z)
    shake = null
    canvas.toggleAttribute('data-grabbing', true)
    // The part (a copy of it, when it comes off the device) follows the pointer on the plane facing the camera through the grab point.
    carry = { part }
    const pr = props.get(part)
    if (pr) {
      pr.t0 = 0
      if (A().mounted(part) && !pr.g.visible) pr.g.position.copy(grabPt)
      camera.getWorldDirection(carryN)
      carryPlane.setFromNormalAndCoplanarPoint(carryN, pr.g.position)
      applyProps()
    }
    dirty = true
  }
  hooks.onDragMove = (part, x, y, over) => {
    const pr = carry && props.get(part)
    if (pr) {
      aim({ clientX: x, clientY: y })
      if (ray.ray.intersectPlane(carryPlane, carryPt)) pr.g.position.copy(carryPt)
      dirty = true
    }
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
  hooks.onDragEnd = (part, dropped, result) => {
    dragActive = false
    valid.clear()
    hot = null
    canvas.removeAttribute('data-grabbing')
    if (tipOwner === 'zone') hideTip()
    if (result && !result.ok && dropped && ghosts.has(dropped)) shake = { zone: dropped, t: 0.4 } // a refusal: the zone shakes, the toast says why
    const pr = props.get(part)
    carry = null
    if (pr) {
      // Back on the table (taken off the device, refused or cancelled): it flies to its home spot. A part now on the device
      // just disappears from the table; the device part snaps in.
      if (!A().mounted(part)) {
        pr.from.copy(pr.g.position)
        pr.t0 = performance.now()
      }
      asmDirty = true
      applyProps()
    }
    restoreControls()
    dirty = true
  }
  const stepGhosts = (dtS: number, now: number) => {
    const pulse = reducedMotion() ? 0 : 0.05 * Math.sin(now / 280)
    for (const [z, gh] of ghosts) {
      const shaking = shake?.zone === z
      const on = valid.has(z) || shaking
      if (gh.g.visible !== on) ((gh.g.visible = on), (dirty = true))
      if (z === 'targetHolder' && !on && stripGhost.visible) ((stripGhost.visible = false), (dirty = true))
      if (!on) continue
      if (z === 'targetHolder') {
        const strip = carry?.part === 'absorbersI' || carry?.part === 'absorbersII'
        gh.g.visible = !strip
        stripGhost.visible = strip
        stripGhostFill.opacity = (hot === z ? 0.45 : 0.25) + pulse
      }
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
    const hits = ray.intersectObjects(grabHits, false)
    // Parts on the table: any of them can be picked up (a wrong part is refused with a reason on the drop); the centre nearest to
    // the ray wins where two volumes overlap.
    let best: THREE.Object3D | null = null
    let bestD = Infinity
    for (const h of hits) {
      const tag = h.object.userData.hit as HitTag
      if (!tag.table || !usable(h.object)) continue
      h.object.getWorldPosition(zoneWorld)
      const d = ray.ray.distanceToPoint(zoneWorld)
      if (d < bestD) ((bestD = d), (best = h.object))
    }
    if (best) {
      const part = ((best as THREE.Object3D).userData.hit as HitTag).part?.() ?? null
      if (part) return { part, which: null, pt: (best as THREE.Object3D).getWorldPosition(grabPt) }
    }
    for (const h of hits) {
      if (!usable(h.object)) continue
      const tag = h.object.userData.hit as HitTag
      if (tag.table) continue
      const part = tag.part?.() ?? null
      if (part && A().zonesFor(part).length) return { part, which: null, pt: h.object.getWorldPosition(grabPt) }
      if (tag.dist && A().current()?.distance?.which === tag.dist) return { part: null, which: tag.dist, pt: null } // only the current step's distance; locked afterwards
    }
    return null
  }
  // The door by hand: the grip (handle and the edge round it) is a hit volume; the door follows the pointer along its track and,
  // released, goes where it was nearer: past the middle towards the other end it takes the same path as the button / a tap
  // (`onPick('door')`: the assembly gate, the loading check and the HV interlock all apply), otherwise it slides back. Escape or a
  // cancelled pointer puts it back untouched.
  hitBox(doorHits, door, [2.2, 12, 3], [DOOR_W / 2 - 1.6, 0, 1.2], {})
  let doorDrag: { id: number; x0: number; off0: number; sx: number; sy: number; moved: boolean } | null = null
  let doorDragOff: number | null = null // the door's offset while it is held (the frame loop does not ease it then)
  const doorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const doorPt = new THREE.Vector3()
  const doorWorld = new THREE.Vector3()
  const pointerX = (e: { clientX: number; clientY: number }): number | null => {
    aim(e)
    door.getWorldPosition(doorWorld)
    doorPlane.constant = -doorWorld.z
    return ray.ray.intersectPlane(doorPlane, doorPt) ? doorPt.x : null
  }
  const overDoorGrip = (e: PointerEvent): boolean => {
    aim(e)
    return ray.intersectObjects(doorHits, false).some((h) => usable(h.object))
  }
  const endDoorDrag = (e: { pointerId: number } | null, commit: boolean) => {
    if (!doorDrag || (e && e.pointerId !== doorDrag.id)) return
    const d = doorDrag
    const off = doorDragOff ?? d.off0
    doorDrag = null
    doorDragOff = null
    dragActive = false
    canvas.removeAttribute('data-grabbing')
    restoreControls()
    dirty = true
    if (!commit) return
    const wantClosed = d.moved ? off < DOOR_SLIDE / 2 : !a.doorsClosed // a tap without a slide toggles, as before
    if (wantClosed !== a.doorsClosed) onPick('door')
  }
  canvas.addEventListener('pointerdown', (e) => {
    consumed = false
    if ((e.pointerType !== 'mouse' || e.button === 0) && !dragActive && !distDrag && !orbiting && overDoorGrip(e)) {
      consumed = true
      controls.enabled = false
      dragActive = true
      doorDrag = { id: e.pointerId, x0: pointerX(e) ?? 0, off0: doorOffset, sx: e.clientX, sy: e.clientY, moved: false }
      canvas.setPointerCapture?.(e.pointerId)
      canvas.toggleAttribute('data-grabbing', true)
      return
    }
    if ((e.pointerType === 'mouse' && e.button !== 0) || a.doorsClosed || dragActive || distDrag || orbiting) return
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
    if (doorDrag && e.pointerId === doorDrag.id) {
      if (!doorDrag.moved && Math.hypot(e.clientX - doorDrag.sx, e.clientY - doorDrag.sy) >= TAP_PX) doorDrag.moved = true
      const x = pointerX(e)
      if (doorDrag.moved && x != null) doorDragOff = Math.min(DOOR_SLIDE, Math.max(0, doorDrag.off0 - (x - doorDrag.x0))) // the door follows the hand
      dirty = true
      return
    }
    if (distDrag && e.pointerId === distDrag.id) {
      aim(e)
      const cm = distFromRay(distDrag.which, distDrag.off)
      if (cm != null && cm !== A().distance(distDrag.which)) A().setDistance(distDrag.which, cm)
      return
    }
    if (e.buttons === 0 && e.pointerType === 'mouse') {
      const grip = !dragActive && overDoorGrip(e)
      const g = !grip && !a.doorsClosed && !dragActive ? grabAt(e) : null
      canvas.toggleAttribute('data-grab', !!g || grip)
      canvas.style.cursor = g || grip ? '' : hit(e) ? 'pointer' : ''
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
  canvas.addEventListener('pointercancel', (e) => (endDistDrag(e, false), endDoorDrag(e, false)))
  canvas.addEventListener('lostpointercapture', (e) => (endDistDrag(e, false), endDoorDrag(e, false))) // after pointerup it finds no drag left
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !(distDrag || doorDrag)) return
    e.stopPropagation()
    endDistDrag(null, false)
    endDoorDrag(null, false)
  }, true)
  canvas.addEventListener('pointerup', (e) => {
    endDistDrag(e, true)
    endDoorDrag(e, true)
    const d = down
    down = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP_PX) return
    const p = hit(e)
    onPick(cur === 'assembly' && p !== 'door' && p !== 'panel' && p !== 'monitor' ? null : p) // while assembling, a tap on the chamber is not "open the card"
  })
  // Orbit gestures (assembly: empty space orbits, wheel / pinch zooms, right-drag / two fingers pan). Part grabs never reach
  // here: their capturing pointerdown disables the controls first, and `orbiting` stops a second finger from grabbing mid-gesture.
  const panFix = new THREE.Vector3()
  controls.addEventListener('start', () => {
    orbiting = true
    if (cur === 'assembly') userOrbit = true
  })
  controls.addEventListener('end', () => (orbiting = false))
  controls.addEventListener('change', () => {
    dirty = true
    if (cur !== 'assembly' || !controls.enablePan) return
    // Keep the pan target inside the box around chamber + table (the camera moves with it, so the view just stops sliding).
    panFix.copy(controls.target).clamp(PAN_BOX.min, PAN_BOX.max).sub(controls.target)
    if (panFix.lengthSq() > 0) (controls.target.add(panFix), camera.position.add(panFix))
  })

  // ── Sizing ─────────────────────────────────────────────────────────────
  // Relayout policy: a resize or a HUD change recomputes the presets. If the student has orbited / zoomed / panned the assembly
  // camera, it is KEPT (only the HUD view offset, the limits and the label / hit scale follow), so a step's slider appearing or a
  // phone rotating slightly does not snap the view away. It is reset to the default framing only when that is necessary: the table
  // layout switched between landscape and portrait (the parts moved), or the view is not assembly (then there is nothing to keep).
  const relayout = (instant: boolean) => {
    const cols = tableCfg.cols
    layout()
    if (cur === 'assembly' && userOrbit && !flight && tableCfg.cols === cols) {
      setOffset(presets.assembly.dx, presets.assembly.dy)
      dirty = true
    } else if (instant) {
      if (!flight) go(effective(), true)
    } else if (cur === 'assembly') go('assembly')
  }
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
    relayout(true)
  }).observe(canvas)
  // The HUD changes size (a step with a slider, the checklist unfolded): the chamber follows into the free area.
  const asmEl = document.querySelector('[data-asm]')
  if (asmEl) {
    new ResizeObserver(() => {
      if (vw <= 1) return
      const r = env.reserve()
      if (`${r.left}|${r.right}|${r.top}|${r.bottom}` === reserveSig) return
      relayout(false)
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
      sky.intensity = sun.intensity = LIGHT_BASE * light
      scene.environmentIntensity = 0.3 * light // the painted and plastic parts take little of it ...
      for (const [m] of tinted) {
        const sm = m as THREE.MeshStandardMaterial
        if (sm.isMeshStandardMaterial && sm.metalness >= 0.8) ((sm.envMap = envTex), (sm.envMapIntensity = 1.1 * light)) // ... the metals a lot
      }
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
    } else if (orbitable(cur) && controls.enabled) controls.update()

    if (cur === 'assembly') refreshScale(camera.position.distanceTo(flight ? lookAt : controls.target))
    arms.step(dtS)
    targetArm.rotation.z = (arms.t / 10) * RAD
    sensorArm.rotation.z = (arms.s / 10) * RAD
    const changed = a.setup !== lastSetup || asmDirty || A().done() !== lastDone
    if (changed) applyVisibility()
    else if (tableShown() !== lastTable) applyProps()
    lastTable = tableShown()
    stepProps(performance.now())
    stepSnaps(performance.now())
    stepGhosts(dtS, performance.now())
    const showDims = assemblyView() && !A().done()
    dim1.visible = showDims
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
    if (doorDragOff != null) doorOffset = doorDragOff
    else {
      doorOffset = reducedMotion() ? goal : doorOffset + (goal - doorOffset) * Math.min(1, dtS * 10)
      if (Math.abs(goal - doorOffset) < 0.01) doorOffset = goal
    }
    shakeT = Math.max(0, shakeT - dtS)
    door.position.x = doorX - doorOffset + (shakeT > 0 ? Math.sin(shakeT * 60) * 0.5 * (shakeT / 0.4) : 0)

    const mode = getMode()
    const same = drawn.t === arms.t && drawn.s === arms.s && drawn.door === door.position.x && drawn.g === g && drawn.rate === rate && drawn.emitting === emitting && drawn.knob === knob.rotation.z && drawn.mode === mode && drawn.off === offX
    if (!dirty && !animate && same) return
    Object.assign(drawn, { t: arms.t, s: arms.s, door: door.position.x, g, rate, emitting, knob: knob.rotation.z, mode, off: offX })
    dirty = false
    renderer.render(scene, camera)
    placeTags()
  }

  return {
    render,
    fly: (f: Focus) => fly(f),
    /** Is the assembly camera the one on show (the "Recentrar vista" button follows it)? */
    assemblyActive: () => cur === 'assembly',
    /** Fly back to the default assembly framing (instant under reduced motion). */
    resetView: () => {
      if (cur === 'assembly') go('assembly')
    },    /** Dev/E2E only: viewport positions of the usable drop zones and grab handles. */
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
      const parts: Record<string, { x: number; y: number }> = {}
      grabHits.forEach((m, i) => {
        if (!usable(m)) return
        const tag = m.userData.hit as HitTag
        if (tag.table) {
          parts[tag.part!()!] = at_(m)
          return
        }
        grabs[`${tag.dist ?? tag.part?.() ?? 'x'}${i}`] = at_(m)
      })
      // a free spot of the table (drop point for taking a part off the device)
      const rc = tableRect(partsOnTable().length, tableCfg)
      v.set(rc.cx, 0, rc.cz).project(camera)
      const table = { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
      const proj = (o: THREE.Object3D, local = new THREE.Vector3()) => {
        v.copy(local)
        o.localToWorld(v).project(camera)
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
      }
      const picks = { panel: proj(panelFace), monitor: proj(monitorScreen), knob: proj(knob), door: proj(door, new THREE.Vector3(DOOR_W / 2 - 1.6, 0, 1.5)) }
      return { zones, grabs, parts, table, picks, view: cur, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }
    },
    /** The door refused to open (interlock): a short shake. */
    shake: () => {
      if (!reducedMotion()) shakeT = 0.4
    },
  }
}
