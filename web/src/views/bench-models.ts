// Procedural models of the apparatus parts for the 3D bench (views/bench.ts): X-ray tube, collimator, GM counter, target
// stage, filter cap, absorber strips. Everything is built from primitives, lathes and canvas textures drawn here; no
// image files and no manufacturer artwork. Proportions follow the real devices (a lab apparatus with its goniometer
// and end-window counter). Scene units: cm; x to the right, y up, z towards the student. Geometries are shared and
// cached: nothing here is disposed while the scene lives.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Palette } from './canvas'

export type Colour = keyof Omit<Palette, 'caption' | 'footnote' | 'font' | 'mono'>
export type MatFn = (c: Colour, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial

const RAD = Math.PI / 180

/** Crosshatch tile used as the knurling of the cone, the knobs and the thumb screws. */
function knurlTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(60,60,60,0.55)'
  g.lineWidth = 2
  for (let k = -64; k <= 64; k += 8) {
    g.beginPath()
    g.moveTo(k, 0)
    g.lineTo(k + 64, 64)
    g.moveTo(k + 64, 0)
    g.lineTo(k, 64)
    g.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** The material set. Colours come from the design tokens through `matte` (re-tinted when the theme changes). */
export function makeMats(matte: MatFn) {
  const knurl = knurlTexture()
  knurl.repeat.set(10, 3)
  const knurlSmall = knurlTexture()
  knurlSmall.repeat.set(5, 1)
  return {
    housing: matte('bench-housing', { roughness: 0.6 }),
    edge: matte('bench-edge', { roughness: 0.55 }),
    black: matte('bench-black', { roughness: 0.42 }),
    plastic: matte('bench-trim', { roughness: 0.55 }),
    stageGrey: matte('bench-metal', { roughness: 0.6 }), // the target stage's matte grey plastic
    white: matte('bench-white', { roughness: 0.55 }),
    steel: matte('bench-steel', { metalness: 1, roughness: 0.38 }),
    alu: matte('bench-alu', { metalness: 1, roughness: 0.3 }),
    brass: matte('bench-brass', { metalness: 0.95, roughness: 0.32 }),
    bronze: matte('bench-bronze', { metalness: 0.85, roughness: 0.42 }),
    knurled: matte('bench-steel', { metalness: 1, roughness: 0.35, map: knurl }),
    knurledBlack: matte('bench-black', { roughness: 0.5, map: knurlSmall }),
    strip: matte('bench-steel', { metalness: 0.9, roughness: 0.5, side: THREE.DoubleSide }),
    amber: matte('bench-amber', { roughness: 0.3, transparent: true, opacity: 0.9 }),
    crystal: matte('bench-crystal', { roughness: 0.08, transparent: true, opacity: 0.75, depthWrite: false }),
    crystalLif: matte('bench-crystal-lif', { roughness: 0.04, transparent: true, opacity: 0.55, depthWrite: false }), // LiF: clearer and a little smaller than NaCl
    // Window fillings of the absorber sets, by slot: open, polystyrene, Al, Fe, Cu, Zr, Ag.
    fills: [
      null,
      matte('bench-white', { roughness: 0.6, side: THREE.DoubleSide }),
      matte('bench-alu', { metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide }),
      matte('bench-iron', { metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide }),
      matte('bench-copper', { metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }),
      matte('bench-zirc', { metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide }),
      matte('bench-silver', { metalness: 1, roughness: 0.2, side: THREE.DoubleSide }),
    ] as (THREE.MeshStandardMaterial | null)[],
  }
}
export type Mats = ReturnType<typeof makeMats>

type Axis = 'x' | 'y' | 'z'
/** Cylinder along `axis`, centred on its origin. */
export function cylinder(r: number, len: number, m: THREE.Material, axis: Axis = 'y', seg = 24, r2 = r): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), m)
  if (axis === 'x') o.rotation.z = -Math.PI / 2
  if (axis === 'z') o.rotation.x = Math.PI / 2
  return o
}
const slab = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  o.position.set(x, y, z)
  return o
}
const lathe = (pts: [number, number][], seg: number, m: THREE.Material) =>
  new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m)

/** X-ray tube standing upright: aluminium foot, dark support rods, glass envelope with the amber anode at `beamY`, flange and
 * finned heat sink on top. Group origin: the tube axis on the chamber floor. Returns the group and the cathode's height. */
export function buildTube(M: Mats, glass: THREE.Material, beamY: number, floor: number) {
  const g = new THREE.Group()
  const y0 = floor
  const foot = lathe([[0, 0], [5.6, 0], [5.6, 0.5], [3.9, 6.6], [3.9, 7.2], [0, 7.2]], 32, M.alu)
  foot.position.y = y0
  const ring = cylinder(4.1, 0.9, M.steel, 'y', 32)
  ring.position.y = y0 + 7.65
  const yG0 = y0 + 8.1 // glass envelope from here to the flange
  const yFl = beamY + 8.6
  const rodGeo = mergeGeometries([0, 1, 2].map((k) => {
    const a = (k * 2 * Math.PI) / 3 + 0.5
    return new THREE.CylinderGeometry(0.32, 0.32, yFl - yG0 + 0.6, 8).translate(Math.cos(a) * 4.5, (yFl + yG0) / 2, Math.sin(a) * 4.5)
  }))!
  const rods = new THREE.Mesh(rodGeo, M.black)
  const env = cylinder(3.3, yFl - yG0, glass, 'y', 32)
  env.position.y = (yFl + yG0) / 2
  const anode = cylinder(1.7, 4.2, M.amber, 'y', 20)
  anode.position.y = beamY
  const stem = cylinder(0.55, yFl - yG0 - 0.6, M.steel, 'y', 12)
  stem.position.y = (yFl + yG0) / 2
  const flange = cylinder(4.5, 0.7, M.steel, 'y', 32)
  flange.position.y = yFl + 0.35
  // Heat sink: one lathe, a stack of eight thin discs on a core.
  const pts: [number, number][] = [[0, 0]]
  for (let k = 0; k < 8; k++) {
    const yy = k * 0.95
    pts.push([1.7, yy], [4, yy], [4, yy + 0.4], [1.7, yy + 0.4])
  }
  pts.push([1.7, 7.65], [0, 7.65])
  const sink = lathe(pts, 32, M.alu)
  sink.position.y = yFl + 0.7
  g.add(foot, ring, rods, env, anode, stem, flange, sink)
  return { g, top: yFl + 8.4 }
}

/** Collimator: round stainless ring flange on the wall, knurled cone, short neck and a small brass slit insert at the tip.
 * Built in the device frame: the wall's inner face at `wallFaceX`, the slit at `slitX`, the beam on `beamY`. */
export function buildCollimator(M: Mats, wallFaceX: number, slitX: number, beamY: number) {
  const g = new THREE.Group()
  const L = slitX - wallFaceX
  const cone = lathe([[0, 0], [2.4, 0], [2.4, 0.5], [1.15, L - 1.7], [1, L - 1.7], [1, L - 0.05], [0, L - 0.05]], 40, M.knurled)
  cone.geometry.rotateZ(-Math.PI / 2)
  cone.position.set(wallFaceX, beamY, 0)
  const insert = cylinder(0.55, 0.7, M.brass, 'x', 16)
  insert.position.set(slitX - 0.35, beamY, 0)
  const slit = slab(0.05, 0.9, 0.12, M.black, slitX + 0.01, beamY, 0)
  g.add(cone, insert, slit)
  return g
}

/** End-window GM counter: bronze front cylinder, brass band, dark rear body, aluminium hex clamp on a post towards the arm.
 * Origin: the window; the body runs towards +x. `postLen`: how far the clamp's post reaches back to the arm (−z). */
export function buildCounter(M: Mats, postLen: number) {
  const g = new THREE.Group()
  const front = cylinder(1.3, 4.3, M.bronze, 'x', 28)
  front.position.x = 2.15
  const band = cylinder(1.42, 0.5, M.brass, 'x', 28)
  band.position.x = 4.4
  const body = cylinder(1.05, 3.6, M.plastic, 'x', 24)
  body.position.x = 6.5
  const stub = cylinder(0.4, 0.8, M.black, 'x', 10)
  stub.position.x = 8.5
  const win = cylinder(0.9, 0.1, M.steel, 'x', 24)
  win.position.x = -0.05
  const hex = cylinder(1.95, 1.5, M.alu, 'x', 6)
  hex.position.x = 3.1
  const post = slab(1.5, 1.4, postLen, M.alu, 3.1, 0, -postLen / 2)
  const screw = cylinder(0.3, 1.1, M.steel, 'y', 8)
  screw.position.set(3.1, -2.1, 0)
  const head = cylinder(0.55, 0.5, M.knurled, 'y', 14)
  head.position.set(3.1, -2.8, 0)
  g.add(front, band, body, stub, win, hex, post, screw, head)
  return { g, body: front }
}

/** Target stage: black round disc (r 3.4) with a long horizontal slot and a short vertical slot from its bottom edge, in the
 * x–y plane, centred on the axis, face towards +z. */
export function stageDiscGeometry(): THREE.BufferGeometry {
  const R = 3.4
  const s = new THREE.Shape()
  const hw = 0.3 // half width of the vertical slot
  const d = Math.asin(hw / R)
  s.absarc(0, 0, R, -Math.PI / 2 + d, (3 * Math.PI) / 2 - d, false) // the circle from the slot's right lip round to its left lip
  s.lineTo(-hw, -1.4)
  s.lineTo(hw, -1.4)
  s.closePath()
  const hole = new THREE.Path()
  const [x0, x1, y0, y1] = [-2.3, 2.3, 0.35, 0.65]
  hole.moveTo(x0, y0)
  hole.lineTo(x1, y0)
  hole.lineTo(x1, y1)
  hole.lineTo(x0, y1)
  hole.closePath()
  s.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: 40 })
  geo.translate(0, 0, -0.15)
  return geo
}

/** Grey rectangular crystal holder with its small black knob below (the Bragg set-up). Top face at y = 0. */
export function buildHolderBox(M: Mats) {
  const g = new THREE.Group()
  g.add(slab(3.4, 1.9, 2.8, M.stageGrey, 0, -0.95, 0), cylinder(0.5, 0.7, M.knurledBlack, 'z', 14))
  g.children[1].position.set(0, -1.7, 1.75)
  return g
}

/** Little canvas label ("Zr"), drawn black on transparent. */
function textTexture(text: string, font: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = '#17171a'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `600 56px ${font}`
  g.fillText(text, 48, 52)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** White plastic ring cap that slips over the collimator tip (axis x, 1.6 long, centred), a thin foil in its opening and
 * the element's symbol printed on its end face (which faces +x, the printed text's top towards −z). */
export function buildFilterCap(M: Mats, symbol: string, font: string) {
  const g = new THREE.Group()
  const ring = lathe([[1.05, 0], [1.42, 0], [1.42, 1.6], [0.55, 1.6], [0.55, 1.2], [1.05, 1.2], [1.05, 0]], 28, M.white)
  ;(ring.material as THREE.Material).side = THREE.DoubleSide
  ring.geometry.rotateZ(-Math.PI / 2)
  ring.geometry.translate(-0.8, 0, 0)
  const foil = cylinder(0.56, 0.04, M.fills[5]!, 'x', 16)
  foil.position.x = 0.7
  const labelGeo = new THREE.PlaneGeometry(1.6, 1.6)
  labelGeo.rotateY(Math.PI / 2)
  labelGeo.rotateX(-Math.PI / 2)
  const label = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: textTexture(symbol, font), transparent: true, toneMapped: false, depthWrite: false }))
  label.position.set(0.81, 0, 0)
  g.add(ring, foil, label)
  return g
}

/** Drawn radius of the absorber strip about the axis. It rides outside the black holder's rim like the real strip (~6 cm of arc,
 * ~4 cm tall). VISUAL SIZE ONLY: the beam logic (s₁/s₂ reference, `PLATE_R_CM` in goniometer.ts) is unchanged, so the drawn
 * window sits (STRIP_R_CM − PLATE_R_CM) beyond the leaflet's reference point on the beam line. */
export const STRIP_R_CM = 3.7
// ── Absorber sets: a curved brushed-steel strip with seven rectangular windows (the plate of the target stage) ──
const stripCache = new Map<string, { frame: THREE.BufferGeometry; fills: (THREE.BufferGeometry | null)[] }>()
/** Frame and window fillings of an absorber strip, as arcs of radius STRIP_R_CM about z. Slot k is centred at 90° − 10k°
 * (so it meets the beam on the +x side at β = 10k°). `windows[k]`: the slot k holds a filling of kind `kind[k]` (an index into
 * `Mats.fills`); a slot that is false stays open. All pieces of one material are merged: a strip is ~8 draw calls. */
export function stripGeometry(key: string, kind: readonly number[], windowDeg: number) {
  const hit = stripCache.get(key)
  if (hit) return hit
  const R = STRIP_R_CM
  const H = 4 // strip height (z)
  const WIN_H = 2.6
  const w = windowDeg * RAD
  const arc = (from: number, to: number, zc: number, zh: number, slot: number) => {
    const g = new THREE.CylinderGeometry(R, R, zh, 8, 1, true, Math.PI / 2 - slot * 10 * RAD + from, to - from)
    g.translate(0, zc, 0)
    g.rotateX(Math.PI / 2) // ring axis along z, like the goniometer axis
    return g
  }
  const frame: THREE.BufferGeometry[] = []
  for (let n = -1; n < 7; n++) frame.push(arc(w, 10 * RAD - w, 0, H, n)) // the bar between slot n and n+1
  const fills: (THREE.BufferGeometry | null)[] = []
  const groups = new Map<number, THREE.BufferGeometry[]>()
  for (let n = 0; n < 7; n++) {
    frame.push(arc(-w, w, WIN_H / 2 + (H - WIN_H) / 4, (H - WIN_H) / 2, n), arc(-w, w, -(WIN_H / 2 + (H - WIN_H) / 4), (H - WIN_H) / 2, n))
    if (kind[n]) (groups.get(kind[n]) ?? groups.set(kind[n], []).get(kind[n])!).push(arc(-w, w, 0, WIN_H, n))
  }
  for (let k = 0; k < 7; k++) fills[k] = groups.has(k) ? mergeGeometries(groups.get(k)!) : null
  const out = { frame: mergeGeometries(frame)!, fills }
  stripCache.set(key, out)
  return out
}

/** An absorber strip as meshes: the steel frame plus one mesh per filling material. */
export function buildStrip(M: Mats, key: string, kind: readonly number[], windowDeg: number) {
  const s = stripGeometry(key, kind, windowDeg)
  const g = new THREE.Group()
  g.add(new THREE.Mesh(s.frame, M.strip))
  s.fills.forEach((geo, k) => geo && g.add(new THREE.Mesh(geo, M.fills[k]!)))
  return g
}
