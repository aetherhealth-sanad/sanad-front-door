import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Decorative 3D scenes for the patient journey.
 * Everything is built from procedural geometry: no model files, no network, no camera.
 * Scenes are purely illustrative. They never encode clinical meaning.
 */
export type SceneKind = 'hero' | 'vault' | 'beacon' | 'helix' | 'vial' | 'slabs' | 'orbit' | 'path';

export interface Scene3DProps {
  kind: SceneKind;
  /** 0..1, drives progress-style scenes (helix, vial, path). */
  value?: number;
  /** Integer count, drives the slab stack. */
  count?: number;
  /** Accessible description of the illustration. */
  label: string;
  className?: string;
}

const C = {
  pine: '#1F4D3F',
  pineLight: '#7FB59C',
  sage: '#C8D6CC',
  ink: '#1A1F1C',
  paper: '#F4F1EA',
  sheet: '#FBFAF6',
  stone: '#D6D0C2',
  warm: '#FFF1D6',
};

interface Ctx {
  track<T extends { dispose(): void }>(x: T): T;
}

interface SceneState {
  value: number;
  count: number;
  hover: boolean;
}

interface Built {
  group: THREE.Group;
  update(t: number, dt: number, s: SceneState): void;
  poke?(): void;
  camera: { z: number; y: number; lookY: number; fov?: number };
  floor: { y: number; size: number };
  spin: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (current: number, target: number, dt: number, rate = 6) =>
  current + (target - current) * Math.min(1, dt * rate);

function solid(ctx: Ctx, color: string, rough = 0.35) {
  return ctx.track(
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: rough,
      metalness: 0.02,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    }),
  );
}

function glass(ctx: Ctx, color: string, opacity = 0.3) {
  return ctx.track(
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.05,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity,
      envMapIntensity: 1.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

/* ── Helix: hero + progress ──────────────────────────────────────────── */
function buildHelix(ctx: Ctx, mode: 'hero' | 'progress'): Built {
  const group = new THREE.Group();
  const N = mode === 'hero' ? 20 : 16;
  const R = 0.85;
  const H = 4.4;
  const turns = 2.1;

  const strandPoints = (phase: number) =>
    Array.from({ length: 120 }, (_, i) => {
      const t = i / 119;
      const a = t * turns * Math.PI * 2 + phase;
      return new THREE.Vector3(Math.cos(a) * R, (t - 0.5) * H, Math.sin(a) * R);
    });

  [0, Math.PI].forEach((phase, idx) => {
    const geo = ctx.track(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strandPoints(phase)), 240, 0.05, 10),
    );
    group.add(new THREE.Mesh(geo, solid(ctx, idx === 0 ? C.pine : C.ink, 0.3)));
  });

  const nodeGeo = ctx.track(new THREE.SphereGeometry(0.13, 28, 20));
  const rungGeo = ctx.track(new THREE.CylinderGeometry(0.018, 0.018, 1, 8));
  const rungMat = solid(ctx, C.sage, 0.5);
  const unlit = new THREE.Color(C.stone);
  const lit = new THREE.Color(C.pineLight);

  const nodes: Array<{ meshes: THREE.Mesh[]; mats: THREE.MeshPhysicalMaterial[]; k: number; pulse: number; prev: number }> = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = t * turns * Math.PI * 2;
    const y = (t - 0.5) * H;
    const A = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R);
    const B = new THREE.Vector3(Math.cos(a + Math.PI) * R, y, Math.sin(a + Math.PI) * R);

    const rung = new THREE.Mesh(rungGeo, rungMat);
    const dir = B.clone().sub(A);
    rung.scale.y = dir.length();
    rung.position.copy(A.clone().add(B).multiplyScalar(0.5));
    rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(rung);

    const mats = [A, B].map(() =>
      ctx.track(
        new THREE.MeshPhysicalMaterial({
          color: unlit,
          roughness: 0.3,
          clearcoat: 0.8,
          emissive: new THREE.Color(C.pineLight),
          emissiveIntensity: 0,
        }),
      ),
    );
    const meshes = [A, B].map((p, j) => {
      const m = new THREE.Mesh(nodeGeo, mats[j]);
      m.position.copy(p);
      group.add(m);
      return m;
    });
    nodes.push({ meshes, mats, k: 0, pulse: 0, prev: 0 });
  }

  // Hero only: glass cells drifting around the helix.
  const cells: Array<{ mesh: THREE.Mesh; r: number; a0: number; y0: number; sp: number }> = [];
  if (mode === 'hero') {
    const cellGeo = ctx.track(new THREE.SphereGeometry(1, 40, 28));
    const coreGeo = ctx.track(new THREE.SphereGeometry(0.34, 24, 16));
    const coreMat = solid(ctx, C.pine, 0.4);
    const sizes = [0.42, 0.28, 0.2, 0.34, 0.16, 0.24, 0.3];
    sizes.forEach((s, i) => {
      const m = new THREE.Mesh(cellGeo, glass(ctx, i % 2 ? C.sage : C.pineLight, 0.32));
      m.scale.setScalar(s);
      if (s > 0.25) {
        const core = new THREE.Mesh(coreGeo, coreMat);
        m.add(core);
      }
      group.add(m);
      cells.push({ mesh: m, r: 1.7 + (i % 3) * 0.45, a0: (i / sizes.length) * Math.PI * 2, y0: (i % 4 - 1.5) * 1.05, sp: 0.18 + (i % 3) * 0.06 });
    });
  }

  return {
    group,
    camera: mode === 'hero' ? { z: 7.9, y: 0.4, lookY: 0 } : { z: 8.6, y: 0.3, lookY: 0 },
    floor: { y: -H / 2 - 0.35, size: 3.2 },
    spin: mode === 'hero' ? 0.28 : 0.22,
    update(t, dt, s) {
      const target = Math.round(clamp01(s.value) * N);
      nodes.forEach((n, i) => {
        let tk: number;
        if (mode === 'hero') {
          tk = 0.5 + 0.5 * Math.sin(t * 1.5 - i * 0.55);
        } else {
          tk = i < target ? 1 : 0;
          if (tk === 1 && n.prev === 0) n.pulse = 1;
          n.prev = tk;
        }
        n.k = ease(n.k, tk, dt, mode === 'hero' ? 20 : 7);
        n.pulse = Math.max(0, n.pulse - dt * 1.6);
        const scale = 1 + n.pulse * 0.7;
        n.mats.forEach((m) => {
          m.color.lerpColors(unlit, lit, n.k);
          m.emissiveIntensity = (mode === 'hero' ? 0.55 : 0.8) * n.k + n.pulse * 0.8;
        });
        n.meshes.forEach((m) => m.scale.setScalar(scale));
      });
      cells.forEach((c, i) => {
        const a = c.a0 + t * c.sp;
        c.mesh.position.set(Math.cos(a) * c.r, c.y0 + Math.sin(t * 0.6 + i) * 0.25, Math.sin(a) * c.r);
      });
    },
    poke() {
      nodes.forEach((n, i) => {
        window.setTimeout(() => {
          n.pulse = 1;
        }, i * 28);
      });
    },
  };
}

/* ── Vault: consent ──────────────────────────────────────────────────── */
function buildVault(ctx: Ctx): Built {
  const group = new THREE.Group();
  const body = new THREE.Mesh(ctx.track(new RoundedBoxGeometry(2.1, 1.6, 1.1, 6, 0.2)), solid(ctx, C.pine, 0.32));
  body.position.y = -0.35;
  group.add(body);

  const plate = new THREE.Mesh(ctx.track(new RoundedBoxGeometry(1.7, 1.2, 0.04, 4, 0.1)), solid(ctx, '#2A5E4D', 0.4));
  plate.position.set(0, -0.35, 0.56);
  group.add(plate);

  const hole = new THREE.Mesh(ctx.track(new THREE.CircleGeometry(0.13, 28)), ctx.track(new THREE.MeshBasicMaterial({ color: C.ink })));
  hole.position.set(0, -0.2, 0.585);
  group.add(hole);
  const slot = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(0.07, 0.26)), ctx.track(new THREE.MeshBasicMaterial({ color: C.ink })));
  slot.position.set(0, -0.42, 0.585);
  group.add(slot);

  const pivot = new THREE.Group();
  pivot.position.set(0.6, 0.45, 0);
  const shackle = new THREE.Group();
  shackle.position.x = -0.6;
  const steel = ctx.track(new THREE.MeshPhysicalMaterial({ color: '#C9CFC9', metalness: 0.9, roughness: 0.22, clearcoat: 0.4 }));
  const arc = new THREE.Mesh(ctx.track(new THREE.TorusGeometry(0.6, 0.11, 20, 64, Math.PI)), steel);
  arc.position.y = 0.4;
  const legGeo = ctx.track(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 20));
  const legL = new THREE.Mesh(legGeo, steel);
  legL.position.set(-0.6, 0, 0);
  const legR = new THREE.Mesh(legGeo, steel);
  legR.position.set(0.6, 0, 0);
  shackle.add(arc, legL, legR);
  pivot.add(shackle);
  group.add(pivot);

  const st = { open: 0, forced: false };
  return {
    group,
    camera: { z: 7.4, y: 0.6, lookY: 0.15 },
    floor: { y: -1.2, size: 2.6 },
    spin: 0.0,
    update(t, dt, s) {
      const target = st.forced ? 1 : s.hover ? 0.35 : 0;
      st.open = ease(st.open, target, dt, 5);
      pivot.position.y = 0.45 + st.open * 0.55;
      pivot.rotation.y = st.open * 1.15;
      group.position.y = Math.sin(t * 0.9) * 0.06;
      group.rotation.y = Math.sin(t * 0.4) * 0.25;
    },
    poke() {
      st.forced = !st.forced;
    },
  };
}

/* ── Beacon: safety ──────────────────────────────────────────────────── */
function buildBeacon(ctx: Ctx): Built {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    ctx.track(new THREE.SphereGeometry(0.55, 48, 32)),
    ctx.track(new THREE.MeshPhysicalMaterial({ color: C.pine, roughness: 0.25, clearcoat: 1, emissive: new THREE.Color(C.pineLight), emissiveIntensity: 0.25 })),
  );
  group.add(core);
  const ringGeo = ctx.track(new THREE.TorusGeometry(1, 0.02, 12, 96));
  const rings = [0, 1, 2, 3].map((i) => {
    const mat = ctx.track(new THREE.MeshBasicMaterial({ color: C.pine, transparent: true, opacity: 0 }));
    const m = new THREE.Mesh(ringGeo, mat);
    m.rotation.x = Math.PI / 2;
    group.add(m);
    return { m, mat, phase: i * 0.9 };
  });
  const burst = { p: 1 };
  const period = 3.6;
  return {
    group,
    camera: { z: 6.6, y: 2.6, lookY: 0 },
    floor: { y: -0.9, size: 2.2 },
    spin: 0,
    update(t, dt) {
      rings.forEach((r) => {
        const p = ((t + r.phase) % period) / period;
        r.m.scale.setScalar(0.8 + p * 2.6);
        r.mat.opacity = (1 - p) * 0.55;
      });
      burst.p = Math.min(1, burst.p + dt / 1.2);
      core.scale.setScalar(1 + (burst.p < 1 ? Math.sin(burst.p * Math.PI) * 0.18 : 0) + Math.sin(t * 2) * 0.02);
      (core.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.25 + (1 - burst.p) * 0.6;
    },
    poke() {
      burst.p = 0;
    },
  };
}

/* ── Vial: lab values ────────────────────────────────────────────────── */
function buildVial(ctx: Ctx): Built {
  const group = new THREE.Group();
  const r = 0.5;
  const top = 1.45;
  const profile = (rad: number, topY: number) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 18; i++) {
      const a = -Math.PI / 2 + (i / 18) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * rad, -top + rad + Math.sin(a) * rad));
    }
    pts.push(new THREE.Vector2(rad, topY));
    return pts;
  };

  group.add(new THREE.Mesh(ctx.track(new THREE.LatheGeometry(profile(r, top), 64)), glass(ctx, C.sheet, 0.22)));
  const rim = new THREE.Mesh(ctx.track(new THREE.TorusGeometry(r, 0.035, 12, 64)), glass(ctx, C.sheet, 0.5));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = top;
  group.add(rim);

  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const liquidMat = ctx.track(
    new THREE.MeshPhysicalMaterial({ color: C.pineLight, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.88, side: THREE.DoubleSide, clippingPlanes: [plane], emissive: new THREE.Color(C.pine), emissiveIntensity: 0.12 }),
  );
  group.add(new THREE.Mesh(ctx.track(new THREE.LatheGeometry(profile(r - 0.05, top - 0.05), 64)), liquidMat));

  const surface = new THREE.Mesh(
    ctx.track(new THREE.CircleGeometry(r - 0.05, 48)),
    ctx.track(new THREE.MeshPhysicalMaterial({ color: '#A9D0BC', roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.9 })),
  );
  surface.rotation.x = -Math.PI / 2;
  group.add(surface);

  const bubbleGeo = ctx.track(new THREE.SphereGeometry(0.045, 12, 10));
  const bubbleMat = glass(ctx, C.sheet, 0.6);
  const bubbles = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(bubbleGeo, bubbleMat);
    group.add(m);
    return { m, x: (i % 3 - 1) * 0.16, z: ((i * 2) % 3 - 1) * 0.12, off: i / 7, sp: 0.25 + (i % 3) * 0.08 };
  });

  const st = { level: 0, shake: 0 };
  return {
    group,
    camera: { z: 7.2, y: 1.6, lookY: 0 },
    floor: { y: -top - 0.05, size: 1.5 },
    spin: 0.3,
    update(t, dt, s) {
      st.level = ease(st.level, clamp01(s.value), dt, 3);
      st.shake = Math.max(0, st.shake - dt * 1.4);
      const bottom = -top + 0.15;
      const topLevel = top - 0.55;
      const y = bottom + st.level * (topLevel - bottom) + Math.sin(t * 2.4) * 0.012 * (1 + st.shake * 4);
      plane.constant = y;
      surface.position.y = y;
      surface.rotation.z = Math.sin(t * 1.7) * 0.03 * (1 + st.shake * 6);
      surface.visible = st.level > 0.02;
      bubbles.forEach((b) => {
        const p = (t * b.sp + b.off) % 1;
        const span = Math.max(0.01, y - bottom);
        b.m.position.set(b.x + Math.sin(t + b.off * 6) * 0.03, bottom + p * span, b.z);
        b.m.visible = st.level > 0.05;
      });
    },
    poke() {
      st.shake = 1;
    },
  };
}

/* ── Slabs: review ───────────────────────────────────────────────────── */
function buildSlabs(ctx: Ctx): Built {
  const group = new THREE.Group();
  const MAX = 8;
  const geo = ctx.track(new RoundedBoxGeometry(2.3, 0.16, 1.6, 4, 0.06));
  const mats = Array.from({ length: MAX }, () => solid(ctx, C.sage, 0.4));
  const slabs = mats.map((m) => {
    const mesh = new THREE.Mesh(geo, m);
    group.add(mesh);
    return { mesh, k: 0 };
  });
  const sage = new THREE.Color(C.sage);
  const pine = new THREE.Color(C.pine);
  const st = { explode: 0, n: 0, poke: 0 };
  return {
    group,
    camera: { z: 8.2, y: 2.4, lookY: 0 },
    floor: { y: -1.5, size: 2.6 },
    spin: 0.2,
    update(t, dt, s) {
      const n = Math.max(1, Math.min(MAX, Math.round(s.count)));
      st.explode = ease(st.explode, s.hover || st.poke > 0 ? 1 : 0, dt, 5);
      st.poke = Math.max(0, st.poke - dt);
      st.n = ease(st.n, n, dt, 6);
      const gap = 0.05 + st.explode * 0.34;
      slabs.forEach((sl, i) => {
        sl.k = ease(sl.k, i < n ? 1 : 0, dt, 8);
        const y = (i - (st.n - 1) / 2) * (0.17 + gap);
        sl.mesh.position.set(0, y, 0);
        sl.mesh.scale.setScalar(Math.max(0.001, sl.k));
        sl.mesh.rotation.y = (i - n / 2) * 0.07 * st.explode;
        const newest = i === n - 1;
        mats[i].color.lerp(newest ? pine : sage, Math.min(1, dt * 6));
      });
      group.position.y = Math.sin(t * 0.8) * 0.05;
    },
    poke() {
      st.poke = 1.4;
    },
  };
}

/* ── Orbit: summary ──────────────────────────────────────────────────── */
function buildOrbit(ctx: Ctx): Built {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(ctx.track(new THREE.SphereGeometry(0.75, 56, 40)), glass(ctx, C.sage, 0.35)));
  group.add(new THREE.Mesh(ctx.track(new THREE.SphereGeometry(0.34, 40, 28)), ctx.track(new THREE.MeshPhysicalMaterial({ color: C.pine, roughness: 0.3, clearcoat: 1, emissive: new THREE.Color(C.pineLight), emissiveIntensity: 0.3 }))));
  const moonGeo = ctx.track(new THREE.SphereGeometry(0.13, 24, 18));
  const lineGeo = ctx.track(new THREE.TorusGeometry(1, 0.008, 8, 128));
  const lineMat = ctx.track(new THREE.MeshBasicMaterial({ color: C.stone, transparent: true, opacity: 0.8 }));
  const orbits = [
    { r: 1.5, tilt: 0.35, sp: 0.5, col: C.pine },
    { r: 1.95, tilt: -0.6, sp: 0.34, col: C.ink },
    { r: 2.4, tilt: 1.0, sp: 0.24, col: C.pineLight },
  ].map((o) => {
    const holder = new THREE.Group();
    holder.rotation.z = o.tilt;
    holder.rotation.x = o.tilt * 0.5;
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = Math.PI / 2;
    line.scale.setScalar(o.r);
    const moon = new THREE.Mesh(moonGeo, solid(ctx, o.col, 0.3));
    holder.add(line, moon);
    group.add(holder);
    return { ...o, moon };
  });
  const st = { boost: 0 };
  return {
    group,
    camera: { z: 8, y: 1.0, lookY: 0 },
    floor: { y: -2.1, size: 2.8 },
    spin: 0.18,
    update(t, dt) {
      st.boost = Math.max(0, st.boost - dt * 1.2);
      orbits.forEach((o, i) => {
        const a = t * o.sp * (1 + st.boost * 4) + i * 2;
        o.moon.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
      });
    },
    poke() {
      st.boost = 1;
    },
  };
}

/* ── Path: next step ─────────────────────────────────────────────────── */
function buildPath(ctx: Ctx): Built {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.4, 0, 0.7),
    new THREE.Vector3(-1.1, 0, -0.7),
    new THREE.Vector3(0.2, 0, 0.5),
    new THREE.Vector3(1.4, 0, -0.5),
    new THREE.Vector3(2.5, 0, 0.4),
  ]);
  group.add(new THREE.Mesh(ctx.track(new THREE.TubeGeometry(curve, 120, 0.035, 8)), solid(ctx, C.stone, 0.5)));
  const N = 5;
  const nodeGeo = ctx.track(new THREE.SphereGeometry(0.16, 24, 18));
  const nodes = Array.from({ length: N }, (_, i) => {
    const mat = ctx.track(new THREE.MeshPhysicalMaterial({ color: C.stone, roughness: 0.3, clearcoat: 0.8, emissive: new THREE.Color(C.pineLight), emissiveIntensity: 0 }));
    const m = new THREE.Mesh(nodeGeo, mat);
    m.position.copy(curve.getPoint(i / (N - 1)));
    group.add(m);
    return { m, mat, k: 0 };
  });
  const traveler = new THREE.Mesh(ctx.track(new THREE.SphereGeometry(0.22, 32, 24)), ctx.track(new THREE.MeshPhysicalMaterial({ color: C.pine, roughness: 0.2, clearcoat: 1, emissive: new THREE.Color(C.pineLight), emissiveIntensity: 0.5 })));
  group.add(traveler);
  const halo = new THREE.Mesh(ctx.track(new THREE.TorusGeometry(0.36, 0.015, 10, 48)), ctx.track(new THREE.MeshBasicMaterial({ color: C.pine, transparent: true, opacity: 0.5 })));
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  const unlit = new THREE.Color(C.stone);
  const lit = new THREE.Color(C.pineLight);
  const st = { p: 0, hop: 0 };
  return {
    group,
    camera: { z: 5.6, y: 3.6, lookY: 0 },
    floor: { y: -0.4, size: 3.2 },
    spin: 0,
    update(t, dt, s) {
      st.p = ease(st.p, clamp01(s.value), dt, 2.5);
      st.hop = Math.max(0, st.hop - dt * 2);
      const pos = curve.getPoint(st.p);
      traveler.position.set(pos.x, 0.3 + Math.sin(t * 2.2) * 0.05 + Math.sin(st.hop * Math.PI) * 0.4, pos.z);
      halo.position.set(pos.x, 0.02, pos.z);
      halo.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08);
      nodes.forEach((n, i) => {
        n.k = ease(n.k, i / (N - 1) <= st.p + 0.001 ? 1 : 0, dt, 8);
        n.mat.color.lerpColors(unlit, lit, n.k);
        n.mat.emissiveIntensity = 0.7 * n.k;
      });
      group.rotation.y = Math.sin(t * 0.3) * 0.18;
    },
    poke() {
      st.hop = 1;
    },
  };
}

function build(kind: SceneKind, ctx: Ctx): Built {
  switch (kind) {
    case 'hero':
      return buildHelix(ctx, 'hero');
    case 'helix':
      return buildHelix(ctx, 'progress');
    case 'vault':
      return buildVault(ctx);
    case 'beacon':
      return buildBeacon(ctx);
    case 'vial':
      return buildVial(ctx);
    case 'slabs':
      return buildSlabs(ctx);
    case 'orbit':
      return buildOrbit(ctx);
    case 'path':
      return buildPath(ctx);
  }
}

function canWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function softShadow(ctx: Ctx, y: number, size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(60,48,30,0.26)');
    grad.addColorStop(1, 'rgba(60,48,30,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = ctx.track(new THREE.CanvasTexture(c));
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    ctx.track(new THREE.PlaneGeometry(size * 2, size * 2)),
    ctx.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

export default function Scene3D({ kind, value = 0, count = 0, label, className = '' }: Scene3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ value, count });
  const kick = useRef<() => void>(() => {});
  const [supported] = useState(canWebGL);

  useEffect(() => {
    live.current.value = value;
    live.current.count = count;
    kick.current();
  }, [value, count]);

  useEffect(() => {
    const el = host.current;
    if (!el || !supported) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const disposables: Array<{ dispose(): void }> = [];
    const ctx: Ctx = {
      track(x) {
        disposables.push(x);
        return x;
      },
    };

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.localClippingEnabled = true;
    renderer.domElement.className = 'scene-canvas';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.9;

    const key = new THREE.DirectionalLight(C.warm, 2.2);
    key.position.set(-3, 5, 4);
    scene.add(key);

    const built = build(kind, ctx);
    const root = new THREE.Group();
    root.add(built.group);
    scene.add(root);
    scene.add(softShadow(ctx, built.floor.y, built.floor.size));

    const camera = new THREE.PerspectiveCamera(built.camera.fov ?? 34, 1, 0.1, 60);
    camera.position.set(0, built.camera.y, built.camera.z);
    camera.lookAt(0, built.camera.lookY, 0);

    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the subject fully in frame on narrow or short boxes.
      const fit = camera.aspect < 0.9 ? 1 / Math.max(0.62, camera.aspect) : 1;
      camera.position.set(0, built.camera.y * fit, built.camera.z * fit);
      camera.lookAt(0, built.camera.lookY, 0);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(() => {
      resize();
      schedule();
    });
    ro.observe(el);

    const ptr = { down: false, lastX: 0, moved: 0, px: 0, py: 0, hover: false, vel: 0, rot: 0 };
    const loop = { raf: 0, running: false, last: performance.now(), clock: 0 };
    const state: SceneState = { value: live.current.value, count: live.current.count, hover: false };

    const frame = (now: number) => {
      loop.raf = 0;
      const dt = Math.min(0.05, (now - loop.last) / 1000);
      loop.last = now;
      loop.clock += dt;
      state.value = live.current.value;
      state.count = live.current.count;
      state.hover = ptr.hover;
      built.update(loop.clock, reduced ? 1 : dt, state);
      if (!ptr.down) {
        ptr.rot += ptr.vel;
        ptr.vel *= 0.94;
      }
      root.rotation.y = ptr.rot + (reduced ? 0.4 : loop.clock * built.spin);
      root.rotation.x = ease(root.rotation.x, -ptr.py * 0.14, dt || 0.016, 4);
      renderer.render(scene, camera);
      if (loop.running && !reduced) loop.raf = requestAnimationFrame(frame);
    };
    function schedule() {
      if (!loop.raf) loop.raf = requestAnimationFrame(frame);
    }
    kick.current = schedule;

    const start = () => {
      if (loop.running || reduced) return;
      loop.running = true;
      loop.last = performance.now();
      schedule();
    };
    const stop = () => {
      loop.running = false;
      if (loop.raf) cancelAnimationFrame(loop.raf);
      loop.raf = 0;
    };

    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { threshold: 0.01 });
    io.observe(el);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);

    const onDown = (e: PointerEvent) => {
      ptr.down = true;
      ptr.lastX = e.clientX;
      ptr.moved = 0;
      ptr.vel = 0;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ptr.px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.py = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      ptr.hover = true;
      if (ptr.down) {
        const dx = e.clientX - ptr.lastX;
        ptr.lastX = e.clientX;
        ptr.moved += Math.abs(dx);
        ptr.rot += dx * 0.012;
        ptr.vel = dx * 0.004;
      }
      if (reduced) schedule();
    };
    const onUp = () => {
      if (ptr.down && ptr.moved < 5) {
        built.poke?.();
        if (reduced) schedule();
      }
      ptr.down = false;
    };
    const onLeave = () => {
      ptr.hover = false;
      ptr.py = 0;
      if (reduced) schedule();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);

    resize();
    schedule();

    return () => {
      stop();
      kick.current = () => {};
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      disposables.forEach((d) => d.dispose());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kind, supported]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className={`scene-host ${className}`}
      style={{ touchAction: 'pan-y' }}
    />
  );
}
