import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetiker from '../fonts/helvetiker_regular.typeface.json';
import helvetikerBold from '../fonts/helvetiker_bold.typeface.json';
import optimer from '../fonts/optimer_regular.typeface.json';
import mono from '../fonts/droid_sans_mono_regular.typeface.json';

const loader = new FontLoader();
export const FONTS: Record<string, Font> = {
  helvetiker: loader.parse(helvetiker as any),
  helvetiker_bold: loader.parse(helvetikerBold as any),
  optimer: loader.parse(optimer as any),
  mono: loader.parse(mono as any),
};

const D = THREE.MathUtils.degToRad;

function extrude(shape: THREE.Shape, p: any) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, p.depth ?? 0.2),
    bevelEnabled: (p.bevel ?? 0) > 0,
    bevelSize: p.bevel ?? 0,
    bevelThickness: p.bevel ?? 0,
    bevelSegments: 4,
    curveSegments: 32,
  });
  g.center();
  return g;
}

function starShape(points: number, outer: number, inner: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function polygonShape(sides: number, r: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / 2;
    i === 0 ? s.moveTo(Math.cos(a) * r, Math.sin(a) * r) : s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

function heartShape(size: number) {
  const k = size / 2;
  const s = new THREE.Shape();
  s.moveTo(0, -0.9 * k);
  s.bezierCurveTo(-0.2 * k, -0.6 * k, -1.0 * k, -0.3 * k, -1.0 * k, 0.25 * k);
  s.bezierCurveTo(-1.0 * k, 0.75 * k, -0.45 * k, 1.0 * k, 0, 0.55 * k);
  s.bezierCurveTo(0.45 * k, 1.0 * k, 1.0 * k, 0.75 * k, 1.0 * k, 0.25 * k);
  s.bezierCurveTo(1.0 * k, -0.3 * k, 0.2 * k, -0.6 * k, 0, -0.9 * k);
  return s;
}

function roundedRectShape(w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function buildGeometry(type: string, p: any): THREE.BufferGeometry | null {
  switch (type) {
    case 'cube': {
      const r = Math.min(p.cornerRadius ?? 0, Math.min(p.width, p.height, p.depth) / 2 - 0.0001);
      if (r <= 0.0001) return new THREE.BoxGeometry(p.width, p.height, p.depth);
      return new RoundedBoxGeometry(p.width, p.height, p.depth, Math.max(1, p.segments | 0), r);
    }
    case 'sphere':
      return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments, 0, D(p.phiLength ?? 360));
    case 'cylinder':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments);
    case 'cone':
      return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments);
    case 'torus':
      return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments, D(p.arc ?? 360));
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(p.radius, p.tube, p.tubularSegments, p.radialSegments, p.p, p.q);
    case 'plane':
      return new THREE.PlaneGeometry(p.width, p.height);
    case 'image':
      return new THREE.PlaneGeometry(p.width, p.height);
    case 'capsule':
      return new THREE.CapsuleGeometry(p.radius, p.length, p.capSegments, p.radialSegments);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(p.radius, p.detail);
    case 'pyramid':
      return new THREE.ConeGeometry(p.radius, p.height, Math.max(3, p.sides | 0));
    case 'ring':
      return new THREE.RingGeometry(p.innerRadius, p.outerRadius, p.segments);
    case 'star':
      return extrude(starShape(Math.max(3, p.points | 0), p.outerRadius, p.innerRadius), p);
    case 'polygon':
      return extrude(polygonShape(Math.max(3, p.sides | 0), p.radius), p);
    case 'heart':
      return extrude(heartShape(p.size), p);
    case 'roundedRect':
      return extrude(roundedRectShape(p.width, p.height, p.radius), p);
    case 'text': {
      const g = new TextGeometry(String(p.text || ' '), {
        font: FONTS[p.font] ?? FONTS.helvetiker_bold,
        size: p.size,
        depth: Math.max(0.0001, p.depth),
        curveSegments: p.curveSegments ?? 8,
        bevelEnabled: (p.bevel ?? 0) > 0,
        bevelThickness: p.bevel,
        bevelSize: p.bevel * 0.6,
        bevelSegments: 3,
      });
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const dx = p.align === 'left' ? -b.min.x : p.align === 'right' ? -b.max.x : -(b.min.x + b.max.x) / 2;
      g.translate(dx, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
      return g;
    }
  }
  return null;
}
