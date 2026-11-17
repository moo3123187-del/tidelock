import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';

const STATE_COLOR_MAP: Record<string, number> = {
  Running: 0x3ddc84,
  Throttled: 0x3ddc84,
  Idle: 0xffb020,
  NoInput: 0xffb020,
  OutputBlocked: 0xffb020,
  NoPower: 0x4da3ff,
  Fault: 0xff4d4d,
};

function extrudeShape(
  pts: [number, number][],
  depth: number,
  bevelSize = 0.08,
  bevelThickness = 0.08
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelSize > 0,
    bevelSegments: 3,
    steps: 1,
    bevelSize,
    bevelThickness,
  });
  geo.center();
  return geo;
}

function tubePipe(
  pts: [number, number, number][],
  radius: number,
  tubularSegments = 16,
  radialSegments = 10
): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

function lathePoints(pts: [number, number][], segments = 20): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

export function createStatusStripMesh(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 1.8, 6, 10),
    new THREE.MeshStandardMaterial({
      color: 0xffb020,
      emissive: 0xffb020,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    })
  );
}

function addContactShadow(g: THREE.Group, tex: ProceduralTextureSet, w: number, d: number): void {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.25, d * 1.25),
    new THREE.MeshBasicMaterial({
      map: tex.contactShadow,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  g.add(shadow);
}

export interface MachineVisualRefs {
  statusStrip?: THREE.Mesh;
  doorGlow?: THREE.Mesh;
  drillRod?: THREE.Object3D;
  robotArm?: THREE.Object3D;
  windRotor?: THREE.Object3D;
  chargeBars: THREE.Mesh[];
  heaterGrille?: THREE.Mesh;
}

export interface CreatureRigRefs {
  legFL?: THREE.Object3D;
  legFR?: THREE.Object3D;
  legBL?: THREE.Object3D;
  legBR?: THREE.Object3D;
  tail?: THREE.Object3D;
  segs: THREE.Object3D[];
}

export function updateMachineModelVisuals(
  group: THREE.Group,
  state: string,
  elapsed: number,
  storedPct = 0
): void {
  const refs = group.userData.visualRefs as MachineVisualRefs | undefined;
  const strip = refs?.statusStrip;
  if (strip && strip.material instanceof THREE.MeshStandardMaterial) {
    const col = STATE_COLOR_MAP[state] ?? 0xffb020;
    strip.material.color.setHex(col);
    strip.material.emissive.setHex(col);
    let intensity = 1.5;
    if (state === 'NoInput' || state === 'OutputBlocked') {
      intensity = Math.sin(elapsed * 6.28) > 0 ? 1.9 : 0.2;
    } else if (state === 'Throttled') {
      intensity = 0.7 + 0.7 * Math.sin(elapsed * 3.14);
    } else if (state === 'NoPower') {
      intensity = 0.45;
    }
    strip.material.emissiveIntensity = intensity;
  }

  const doorGlow = refs?.doorGlow;
  if (doorGlow && doorGlow.material instanceof THREE.MeshStandardMaterial) {
    const active = state === 'Running' || state === 'Throttled';
    const pulse = 0.8 + 0.4 * Math.sin(elapsed * Math.PI);
    doorGlow.material.emissiveIntensity = active ? 2.1 * pulse : 0.05;
  }

  const drillRod = refs?.drillRod;
  if (drillRod && (state === 'Running' || state === 'Throttled')) {
    drillRod.rotation.y += 0.09;
    drillRod.position.y = 3.9 + Math.sin(elapsed * Math.PI * 4) * 0.38;
  }

  const arm = refs?.robotArm;
  if (arm && (state === 'Running' || state === 'Throttled')) {
    arm.rotation.z = Math.sin(elapsed * 3.4) * 0.55;
  }

  const rotor = refs?.windRotor;
  if (rotor) {
    rotor.rotation.z -= 0.045;
  }

  if (refs && refs.chargeBars.length > 0) {
    for (let i = 0; i < refs.chargeBars.length; i++) {
      const bar = refs.chargeBars[i];
      if (bar.material instanceof THREE.MeshStandardMaterial) {
        const lit = storedPct >= (i + 0.02) * 0.2;
        bar.material.emissiveIntensity = lit ? 1.85 : 0.05;
        bar.material.color.setHex(lit ? 0xf2c230 : 0x2b2f33);
      }
    }
  }

  const grille = refs?.heaterGrille;
  if (grille && grille.material instanceof THREE.MeshStandardMaterial) {
    const active = state === 'Running' || state === 'Throttled';
    grille.material.emissiveIntensity = active ? 1.8 + 0.28 * Math.sin(elapsed * 5) : 0.08;
  }
}

export function buildBuildableMesh(
  defId: string,
  tex: ProceduralTextureSet,
  isSoftwareGl: boolean
): THREE.Group {
  const g = new THREE.Group();
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2c323b, roughness: 0.36, metalness: 0.82 });
  const metalLight = new THREE.MeshStandardMaterial({
    color: 0xc8ced6,
    map: tex.panelMetal,
    roughness: 0.32,
    metalness: 0.72,
  });
  const orangePaint = new THREE.MeshStandardMaterial({ color: 0xe86f51, roughness: 0.4, metalness: 0.38 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.86, metalness: 0.16 });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: tex.hazard,
    roughness: 0.5,
    metalness: 0.26,
  });
  const diamondMat = new THREE.MeshStandardMaterial({
    map: tex.diamondPlate,
    color: 0x6b7078,
    roughness: 0.46,
    metalness: 0.76,
  });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xd97742, roughness: 0.24, metalness: 0.88 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xbeefe6,
    roughness: 0.08,
    metalness: 0.16,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  switch (defId) {
    case 'furnace_t1': {
      addContactShadow(g, tex, 6, 6);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.75, 16), concrete);
      base.position.set(0, 0.38, 0);
      const skirt = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.22, 8, 24), hazardMat);
      skirt.rotation.x = Math.PI / 2;
      skirt.position.set(0, 0.3, 0);

      // Cylindrical/lathed rotary blast crucible
      const crucible = new THREE.Mesh(
        lathePoints([
          [2.7, 0],
          [2.9, 1.3],
          [2.65, 3.0],
          [2.1, 4.1],
          [1.6, 4.6],
          [0, 4.7],
        ], 20),
        metalLight
      );
      crucible.position.set(0, 0.75, 0);

      const collarRing = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.2, 10, 24), metalDark);
      collarRing.rotation.x = Math.PI / 2;
      collarRing.position.set(0, 2.5, 0);

      const hearthRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.22, 10, 20), metalDark);
      hearthRing.position.set(0, 2.35, -2.55);
      const doorGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
        new THREE.MeshStandardMaterial({
          color: 0xff7a2f,
          emissive: 0xff7a2f,
          emissiveIntensity: 1.9,
          roughness: 0.22,
        })
      );
      doorGlow.name = 'DoorGlow';
      doorGlow.rotation.x = -Math.PI / 2;
      doorGlow.position.set(0, 2.35, -2.2);

      const chimney = new THREE.Mesh(
        lathePoints([
          [0.9, 0],
          [0.72, 1.6],
          [0.65, 3.0],
          [0.88, 3.4],
          [0.7, 3.5],
        ], 16),
        metalDark
      );
      chimney.position.set(0.95, 4.7, 0.95);

      const pipe = new THREE.Mesh(
        tubePipe([
          [-2.6, 1.1, 0.8],
          [-3.1, 2.4, 0.8],
          [-2.6, 3.8, 0.2],
          [-1.5, 4.5, 0],
        ], 0.24),
        copperMat
      );
      const portIn = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.7, 12), metalDark);
      portIn.rotation.z = Math.PI / 2;
      portIn.position.set(-2.75, 1.85, 0);
      const portOut = portIn.clone();
      portOut.position.set(2.75, 1.85, 0);

      const strip = createStatusStripMesh();
      strip.name = 'StatusStrip';
      strip.position.set(-2.25, 2.75, -1.9);

      g.add(base, skirt, crucible, collarRing, hearthRing, doorGlow, chimney, pipe, portIn, portOut, strip);
      break;
    }

    case 'assembler_t1': {
      addContactShadow(g, tex, 8, 6);
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.2, 1.1, 18), concrete);
      deck.position.set(0, 0.55, 0);
      const ringTrim = new THREE.Mesh(new THREE.TorusGeometry(3.85, 0.18, 8, 28), hazardMat);
      ringTrim.rotation.x = Math.PI / 2;
      ringTrim.position.set(0, 0.95, 0);

      // Sweeping twin orbital gantry arches
      const archA = new THREE.Mesh(
        tubePipe([
          [-3.3, 0.8, 0],
          [-2.8, 4.2, 0],
          [0, 5.4, 0],
          [2.8, 4.2, 0],
          [3.3, 0.8, 0],
        ], 0.3),
        metalDark
      );
      const archB = new THREE.Mesh(
        tubePipe([
          [0, 0.8, 3.3],
          [0, 4.1, 2.6],
          [0, 5.4, 0],
          [0, 4.1, -2.6],
          [0, 0.8, -3.3],
        ], 0.24),
        metalLight
      );

      const domeShell = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
        glassMat
      );
      domeShell.position.set(0, 1.0, 0);

      const armBase = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 12), orangePaint);
      armBase.position.set(0, 4.85, 0);
      const arm = new THREE.Group();
      arm.name = 'RobotArm';
      arm.position.set(0, 4.5, 0);
      const armCurved = new THREE.Mesh(
        tubePipe([
          [0, 0, 0],
          [0.35, -1.2, -0.35],
          [0, -2.4, -0.1],
        ], 0.22),
        new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.3, metalness: 0.65 })
      );
      const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), copperMat);
      wrist.position.set(0, -2.45, -0.1);
      arm.add(armCurved, wrist);

      const strip = createStatusStripMesh();
      strip.name = 'StatusStrip';
      strip.position.set(-2.9, 2.5, -2.1);

      g.add(deck, ringTrim, archA, archB, domeShell, armBase, arm, strip);
      break;
    }

    case 'drill_t1': {
      addContactShadow(g, tex, 6, 6);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.36, 10, 24), hazardMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.36, 0);

      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const strut = new THREE.Mesh(
          tubePipe([
            [Math.cos(a) * 2.8, 0.35, Math.sin(a) * 2.8],
            [Math.cos(a) * 1.9, 3.8, Math.sin(a) * 1.9],
            [Math.cos(a) * 1.15, 6.4, Math.sin(a) * 1.15],
          ], 0.24),
          metalDark
        );
        g.add(strut);
      }

      const motor = new THREE.Mesh(
        lathePoints([
          [1.6, 0],
          [1.75, 0.9],
          [1.45, 2.1],
          [0.7, 2.7],
          [0, 2.8],
        ], 18),
        metalLight
      );
      motor.position.set(0, 5.5, 0);

      const coil1 = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.18, 10, 22), copperMat);
      coil1.rotation.x = Math.PI / 2;
      coil1.position.set(0, 4.9, 0);
      const coil2 = coil1.clone();
      coil2.position.set(0, 3.9, 0);

      const rodGroup = new THREE.Group();
      rodGroup.name = 'DrillRod';
      rodGroup.position.set(0, 3.9, 0);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.2, 7.4, 14),
        new THREE.MeshStandardMaterial({ color: 0xa6aeb8, metalness: 0.9, roughness: 0.2 })
      );
      rodGroup.add(shaft);
      for (let i = 0; i < 4; i++) {
        const flute = new THREE.Mesh(new THREE.TorusGeometry(0.5 - i * 0.05, 0.11, 8, 14), metalDark);
        flute.rotation.x = Math.PI / 2 + 0.25;
        flute.position.y = -2.4 + i * 1.1;
        rodGroup.add(flute);
      }

      const spout = new THREE.Mesh(
        tubePipe([
          [1.2, 2.1, 0],
          [2.4, 1.8, 0],
          [3.1, 1.1, 0],
        ], 0.45),
        metalDark
      );
      const strip = createStatusStripMesh();
      strip.name = 'StatusStrip';
      strip.position.set(-2.1, 2.0, -2.1);
      g.add(ring, motor, coil1, coil2, rodGroup, spout, strip);
      break;
    }

    case 'battery_t1': {
      addContactShadow(g, tex, 4, 4);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.55, 16), concrete);
      base.position.set(0, 0.28, 0);

      // Triad of sleek domed capacitor capsules
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
        const cx = Math.cos(a) * 0.95;
        const cz = Math.sin(a) * 0.95;
        const cell = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 3.6, 8, 14), metalDark);
        cell.position.set(cx, 2.9, cz);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.45, 12), copperMat);
        cap.position.set(cx, 5.25, cz);
        g.add(cell, cap);
      }

      const crown = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.2, 10, 24), metalLight);
      crown.rotation.x = Math.PI / 2;
      crown.position.set(0, 4.9, 0);

      for (let i = 0; i < 5; i++) {
        const bar = new THREE.Mesh(
          new THREE.TorusGeometry(1.75, 0.09, 8, 24, Math.PI * 0.75),
          new THREE.MeshStandardMaterial({
            color: 0xf2c230,
            emissive: 0xf2c230,
            emissiveIntensity: 1.75,
          })
        );
        bar.name = `ChargeBar_${i}`;
        bar.rotation.x = Math.PI / 2;
        bar.rotation.z = Math.PI * 0.125;
        bar.position.set(0, 1.5 + i * 0.72, 0);
        g.add(bar);
      }
      g.add(base, crown);
      break;
    }

    case 'heater_t1': {
      addContactShadow(g, tex, 3, 3);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.55, 16), hazardMat);
      base.position.set(0, 0.28, 0);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.2, 3.6, 16), orangePaint);
      core.position.set(0, 2.35, 0);
      const grille = new THREE.Mesh(
        new THREE.CylinderGeometry(1.12, 1.12, 1.9, 16, 1, false, -0.7, 1.4),
        new THREE.MeshStandardMaterial({
          color: 0xffb020,
          emissive: 0xffb020,
          emissiveIntensity: 1.85,
          roughness: 0.25,
        })
      );
      grille.name = 'HeaterGrille';
      grille.rotation.y = Math.PI;
      grille.position.set(0, 2.35, 0);

      for (const ry of [1.4, 2.35, 3.3]) {
        const guard = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.08, 8, 22), metalDark);
        guard.rotation.x = Math.PI / 2;
        guard.position.set(0, ry, 0);
        g.add(guard);
      }

      const dome = new THREE.Mesh(
        lathePoints([
          [1.35, 0],
          [1.25, 0.4],
          [0.7, 0.78],
          [0, 0.85],
        ], 16),
        metalDark
      );
      dome.position.set(0, 4.1, 0);
      const glowHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex.particleSoft,
          color: 0xff9f40,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glowHalo.scale.set(9.5, 9.5, 1);
      glowHalo.position.set(0, 2.35, -1.6);
      g.add(base, core, grille, dome, glowHalo);
      break;
    }

    case 'solar_t1': {
      addContactShadow(g, tex, 12, 12);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.45, 16), concrete);
      base.position.set(0, 0.22, 0);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.65, 14), metalDark);
      post.position.set(0, 1.0, 0);

      const frameGeo = extrudeShape(
        [
          [-5.4, -5.8],
          [5.4, -5.8],
          [5.8, -5.4],
          [5.8, 5.4],
          [5.4, 5.8],
          [-5.4, 5.8],
          [-5.8, 5.4],
          [-5.8, -5.4],
        ],
        0.2,
        0.08,
        0.08
      );
      frameGeo.rotateX(Math.PI / 2);
      const frame = new THREE.Mesh(frameGeo, metalDark);
      frame.position.set(0, 1.95, 0);
      frame.rotation.x = THREE.MathUtils.degToRad(15);
      g.add(base, post, frame);

      const panelMat = new THREE.MeshStandardMaterial({
        map: tex.solarGrid,
        color: 0xffffff,
        roughness: 0.14,
        metalness: 0.62,
      });
      const wingGeo = new THREE.CylinderGeometry(2.0, 2.0, 0.16, 6);
      for (const px of [-3.7, 0, 3.7]) {
        for (const pz of [-3.6, 0, 3.6]) {
          const p = new THREE.Mesh(wingGeo, panelMat);
          p.position.set(px, 2.08 - pz * 0.26, pz);
          p.rotation.x = THREE.MathUtils.degToRad(15);
          g.add(p);
        }
      }
      break;
    }

    case 'wind_turbine_t1': {
      addContactShadow(g, tex, 6, 6);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 0.85, 16), concrete);
      base.position.set(0, 0.42, 0);
      const mast = new THREE.Mesh(
        lathePoints([
          [1.25, 0],
          [0.95, 7],
          [0.72, 15],
          [0.55, 22],
        ], 16),
        metalLight
      );
      mast.position.set(0, 0.8, 0);

      const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 2.8, 8, 16), metalDark);
      nacelle.rotation.x = Math.PI / 2;
      nacelle.position.set(0, 22.8, 0.3);

      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xff6a13, emissive: 0xff6a13, emissiveIntensity: 1.9 })
      );
      beacon.position.set(0, 24.0, 1.4);

      const rotor = new THREE.Group();
      rotor.name = 'WindRotor';
      rotor.position.set(0, 22.8, -2.35);
      const hub = new THREE.Mesh(
        lathePoints([
          [0.95, -0.4],
          [0.7, 0.6],
          [0.15, 1.4],
          [0, 1.5],
        ], 16),
        orangePaint
      );
      hub.rotation.x = -Math.PI / 2;
      rotor.add(hub);

      const bladeGeo = extrudeShape(
        [
          [-0.36, 0],
          [0.36, 0],
          [0.18, 9.6],
          [-0.08, 9.6],
        ],
        0.14,
        0.04,
        0.04
      );
      bladeGeo.translate(0, 4.8, 0);
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(bladeGeo, metalLight);
        blade.rotation.z = (i * Math.PI * 2) / 3;
        blade.rotation.y = 0.16;
        rotor.add(blade);
      }
      g.add(base, mast, nacelle, beacon, rotor);
      break;
    }

    case 'bioreactor_t1': {
      addContactShadow(g, tex, 8, 8);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.1, 0.8, 18), hazardMat);
      base.position.set(0, 0.4, 0);
      const coreBio = new THREE.Mesh(
        new THREE.CapsuleGeometry(1.7, 3.2, 8, 16),
        new THREE.MeshStandardMaterial({
          color: 0x4fb070,
          emissive: 0x2ca35a,
          emissiveIntensity: 1.15,
          roughness: 0.2,
        })
      );
      coreBio.position.set(0, 3.9, 0);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 6.0, 20), glassMat);
      tank.position.set(0, 3.9, 0);
      for (const ry of [1.6, 3.9, 6.2]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.16, 10, 24), metalDark);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, ry, 0);
        g.add(ring);
      }
      const cap = new THREE.Mesh(
        lathePoints([
          [2.9, 0],
          [2.7, 0.7],
          [1.4, 1.2],
          [0, 1.25],
        ], 18),
        metalDark
      );
      cap.position.set(0, 6.8, 0);
      const pipe = new THREE.Mesh(
        tubePipe([
          [2.5, 1.6, 0],
          [3.4, 2.4, 0],
          [3.4, 5.6, 0],
          [2.3, 6.8, 0],
        ], 0.24),
        copperMat
      );
      const strip = createStatusStripMesh();
      strip.name = 'StatusStrip';
      strip.position.set(-2.95, 3.9, -2.2);
      g.add(base, coreBio, tank, cap, pipe, strip);
      break;
    }

    case 'tidal_turbine_t3': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.5, 1.6, 16), concrete);
      base.position.set(0, 0.8, 0);
      for (const sx of [-1, 1]) {
        const pylon = new THREE.Mesh(
          tubePipe([
            [sx * 4.2, 1.0, 0],
            [sx * 4.8, 6.5, 0],
            [sx * 4.5, 11.8, 0],
          ], 0.65),
          metalDark
        );
        g.add(pylon);
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5.0, 0.65, 12, 28),
        new THREE.MeshStandardMaterial({ color: 0x3fc1d1, emissive: 0x16687a, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.25 })
      );
      ring.position.set(0, 12, 0);
      const rotor = new THREE.Group();
      rotor.name = 'WindRotor';
      rotor.position.set(0, 12, 0);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 12), orangePaint);
      rotor.add(hub);
      const finGeo = extrudeShape(
        [
          [-0.45, 0],
          [0.45, 0],
          [0.25, 4.4],
          [-0.25, 4.4],
        ],
        0.18,
        0.06,
        0.06
      );
      finGeo.translate(0, 2.2, 0);
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(finGeo, metalLight);
        fin.rotation.z = (i * Math.PI) / 2;
        fin.rotation.y = 0.25;
        rotor.add(fin);
      }
      g.add(base, ring, rotor);
      break;
    }

    case 'fabricator_t0': {
      addContactShadow(g, tex, 4, 3);
      const pedestal = new THREE.Mesh(
        lathePoints([
          [2.0, 0],
          [1.8, 0.55],
          [1.15, 1.8],
          [1.6, 2.75],
          [1.85, 3.1],
          [0, 3.15],
        ], 18),
        metalLight
      );
      const ringTrim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.16, 10, 24), orangePaint);
      ringTrim.rotation.x = Math.PI / 2;
      ringTrim.position.set(0, 3.05, 0);
      const arch = new THREE.Mesh(
        tubePipe([
          [-1.7, 3.0, 0.6],
          [-1.5, 4.9, 0.2],
          [0, 5.3, -0.1],
          [1.5, 4.9, 0.2],
          [1.7, 3.0, 0.6],
        ], 0.16),
        metalDark
      );
      const screen = new THREE.Mesh(
        new THREE.CylinderGeometry(1.35, 1.35, 0.1, 20),
        new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x2699a8, emissiveIntensity: 1.5, roughness: 0.15 })
      );
      screen.position.set(0, 4.2, -0.25);
      screen.rotation.x = Math.PI * 0.38;
      g.add(pedestal, ringTrim, arch, screen);
      break;
    }

    case 'conveyor_t1': {
      const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 4, 12, 1, false, 0, Math.PI), metalDark);
      frame.rotation.z = Math.PI / 2;
      frame.rotation.y = Math.PI / 2;
      frame.position.set(0, 0.35, 0);
      const beltMat = new THREE.MeshStandardMaterial({
        map: tex.conveyorBelt,
        roughness: 0.72,
        metalness: 0.1,
      });
      const beltGeo = extrudeShape(
        [
          [-0.75, -1.95],
          [0.75, -1.95],
          [0.75, 1.95],
          [-0.75, 1.95],
        ],
        0.16,
        0.04,
        0.04
      );
      beltGeo.rotateX(Math.PI / 2);
      const belt = new THREE.Mesh(beltGeo, beltMat);
      belt.position.set(0, 0.64, 0);

      for (const sx of [-0.9, 0.9]) {
        const rail = new THREE.Mesh(
          tubePipe([
            [sx, 0.75, -2],
            [sx, 0.85, 0],
            [sx, 0.75, 2],
          ], 0.11),
          sx < 0 ? new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.35, metalness: 0.55 }) : metalDark
        );
        g.add(rail);
      }
      g.add(frame, belt);
      break;
    }

    case 'chest_t1': {
      addContactShadow(g, tex, 4, 3);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.95, 0.4, 12), concrete);
      base.position.set(0, 0.2, 0);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.45, 1.4, 8, 16), metalLight);
      body.rotation.z = Math.PI / 2;
      body.position.set(0, 1.65, 0);
      for (const rx of [-0.95, 0.95]) {
        const strap = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.12, 8, 20), metalDark);
        strap.rotation.y = Math.PI / 2;
        strap.position.set(rx, 1.65, 0);
        g.add(strap);
      }
      const latch = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.75, roughness: 0.25 })
      );
      latch.position.set(0, 1.9, -1.45);
      g.add(base, body, latch);
      break;
    }

    case 'power_pole_t1': {
      addContactShadow(g, tex, 2.5, 2.5);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.7, 12), concrete);
      base.position.set(0, 0.35, 0);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.45, 15, 12), metalDark);
      mast.position.set(0, 7.8, 0);
      const crossArc = new THREE.Mesh(
        tubePipe([
          [-2.0, 14.3, 0],
          [0, 14.9, 0],
          [2.0, 14.3, 0],
        ], 0.16),
        metalLight
      );
      const coilL = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 12), copperMat);
      coilL.position.set(-1.9, 14.6, 0);
      const coilR = coilL.clone();
      coilR.position.set(1.9, 14.6, 0);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 1.7 })
      );
      bulb.position.set(0, 15.5, 0);
      g.add(base, mast, crossArc, coilL, coilR, bulb);
      break;
    }

    case 'outpost_pod_t0': {
      addContactShadow(g, tex, 12, 12);
      // Cylindrical geodesic dome outpost with curved panoramic window & airlock ring
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 6.3, 1.0, 16), diamondMat);
      deck.position.set(0, 0.5, 0);
      const lowerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(5.6, 5.8, 4.8, 16, 1, true, 0.5, Math.PI * 1.72),
        metalLight
      );
      lowerWall.rotation.y = Math.PI * 0.64;
      lowerWall.position.set(0, 3.4, 0);
      const roofDome = new THREE.Mesh(
        new THREE.SphereGeometry(5.65, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
        metalLight
      );
      roofDome.scale.set(1, 0.72, 1);
      roofDome.position.set(0, 5.7, 0);

      const beltRing = new THREE.Mesh(new THREE.TorusGeometry(5.68, 0.24, 10, 28), metalDark);
      beltRing.rotation.x = Math.PI / 2;
      beltRing.position.set(0, 5.8, 0);

      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + 0.35;
        if (Math.sin(a) < -0.75) continue;
        const rib = new THREE.Mesh(
          tubePipe([
            [Math.cos(a) * 5.8, 0.8, Math.sin(a) * 5.8],
            [Math.cos(a) * 5.7, 5.8, Math.sin(a) * 5.7],
            [Math.cos(a) * 2.4, 9.1, Math.sin(a) * 2.4],
          ], 0.24),
          metalDark
        );
        g.add(rib);
      }

      for (const tz of [-1.8, 1.8]) {
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 3.2, 8, 12), orangePaint);
        tank.position.set(6.0, 3.8, tz);
        g.add(tank);
      }

      const airlockArch = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.34, 10, 20, Math.PI), metalDark);
      airlockArch.position.set(0, 1.0, -5.5);
      const win = new THREE.Mesh(
        new THREE.CylinderGeometry(5.65, 5.65, 2.8, 16, 1, true, -0.5, 1.0),
        glassMat
      );
      win.position.set(0, 4.2, 0);

      const bed = new THREE.Mesh(
        new THREE.CapsuleGeometry(1.1, 2.4, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xe86f51, roughness: 0.85 })
      );
      bed.rotation.z = Math.PI / 2;
      bed.position.set(-2.2, 1.9, 2.4);

      const strip = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.16, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff3d6, emissiveIntensity: 1.5 })
      );
      strip.rotation.x = Math.PI / 2;
      strip.position.set(0, 8.2, 0);

      g.add(deck, lowerWall, roofDome, beltRing, airlockArch, win, bed, strip);
      break;
    }

    case 'hab_room_t0': {
      addContactShadow(g, tex, 20, 20);
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(10.2, 10.6, 1.0, 16), diamondMat);
      floor.position.set(0, 0.5, 0);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(10.0, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
        metalLight
      );
      dome.scale.set(1, 0.85, 1);
      dome.position.set(0, 4.0, 0);
      const waist = new THREE.Mesh(new THREE.TorusGeometry(9.9, 0.35, 10, 32), metalDark);
      waist.rotation.x = Math.PI / 2;
      waist.position.set(0, 4.2, 0);

      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const wallArc = new THREE.Mesh(
          new THREE.CylinderGeometry(9.85, 9.95, 3.6, 10, 1, true, a - 0.52, 1.04),
          metalLight
        );
        wallArc.position.set(0, 2.6, 0);
        const portFrame = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 10, 20, Math.PI), metalDark);
        portFrame.rotation.y = (i * Math.PI) / 2;
        portFrame.position.set(Math.sin((i * Math.PI) / 2) * 9.5, 1.2, Math.cos((i * Math.PI) / 2) * 9.5);
        g.add(wallArc, portFrame);
      }

      const bed = new THREE.Mesh(
        new THREE.CapsuleGeometry(1.3, 3.2, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xe86f51, roughness: 0.85 })
      );
      bed.rotation.z = Math.PI / 2;
      bed.position.set(-4.8, 2.1, -4.8);
      const table = new THREE.Mesh(
        new THREE.CylinderGeometry(2.1, 1.8, 1.8, 16),
        new THREE.MeshStandardMaterial({ color: 0x7a6f66, roughness: 0.72 })
      );
      table.position.set(0, 1.9, 3.2);
      const ceilLight = new THREE.Mesh(
        new THREE.TorusGeometry(3.8, 0.22, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff3d6, emissiveIntensity: 1.4 })
      );
      ceilLight.rotation.x = Math.PI / 2;
      ceilLight.position.set(0, 10.6, 0);
      g.add(floor, dome, waist, bed, table, ceilLight);
      break;
    }

    case 'corridor_t0': {
      addContactShadow(g, tex, 10, 10);
      const floor = new THREE.Mesh(
        extrudeShape(
          [
            [-4.6, -5],
            [4.6, -5],
            [4.6, 5],
            [-4.6, 5],
          ],
          0.9,
          0.16,
          0.16
        ),
        diamondMat
      );
      floor.rotation.x = Math.PI / 2;
      floor.position.set(0, 0.5, 0);

      // Ribbed curved tubular tunnel shell
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(4.6, 4.6, 10, 18, 1, true, -Math.PI * 0.55, Math.PI * 1.1),
        metalLight
      );
      shell.rotation.z = Math.PI / 2;
      shell.rotation.y = Math.PI / 2;
      shell.position.set(0, 4.4, 0);

      for (const rz of [-4.2, 0, 4.2]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.28, 10, 22, Math.PI), metalDark);
        rib.position.set(0, 4.4, rz);
        g.add(rib);
      }

      const strip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.18, 7.6, 6, 10),
        new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff3d6, emissiveIntensity: 1.4 })
      );
      strip.rotation.x = Math.PI / 2;
      strip.position.set(0, 8.6, 0);
      g.add(floor, shell, strip);
      break;
    }

    default: {
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(1.8, 2.2, 8, 16), metalLight);
      pod.position.y = 2.6;
      g.add(pod);
    }
  }

  const refs: MachineVisualRefs = { chargeBars: [] };
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = !isSoftwareGl && !o.material.transparent && o.material instanceof THREE.MeshStandardMaterial;
      o.receiveShadow = true;
    }
    if (o.name === 'StatusStrip' && o instanceof THREE.Mesh) refs.statusStrip = o;
    else if (o.name === 'DoorGlow' && o instanceof THREE.Mesh) refs.doorGlow = o;
    else if (o.name === 'DrillRod') refs.drillRod = o;
    else if (o.name === 'RobotArm') refs.robotArm = o;
    else if (o.name === 'WindRotor') refs.windRotor = o;
    else if (o.name === 'HeaterGrille' && o instanceof THREE.Mesh) refs.heaterGrille = o;
    else if (o.name.startsWith('ChargeBar_') && o instanceof THREE.Mesh) {
      const idx = parseInt(o.name.slice(10), 10);
      refs.chargeBars[idx] = o;
    }
  });
  g.userData.visualRefs = refs;

  return g;
}

export function buildVehicleMesh(defId: string, tex: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.26, metalness: 0.65 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.38, metalness: 0.78 });
  const metalLight = new THREE.MeshStandardMaterial({
    color: 0xc4cad2,
    map: tex.panelMetal,
    roughness: 0.32,
    metalness: 0.68,
  });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.85, metalness: 0.08 });

  if (defId === 'vehicle_dart_t1') {
    const hullGeo = extrudeShape(
      [
        [0, 3.9],
        [1.55, 1.1],
        [1.8, -2.5],
        [1.05, -3.5],
        [-1.05, -3.5],
        [-1.8, -2.5],
        [-1.55, 1.1],
      ],
      0.54,
      0.18,
      0.16
    );
    hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, yellowMat);
    hull.position.set(0, 1.05, 0);

    const noseCone = new THREE.Mesh(
      lathePoints([
        [0, -1.6],
        [0.65, -0.5],
        [0.92, 0.8],
        [0.7, 1.6],
      ], 16),
      metalLight
    );
    noseCone.rotation.x = Math.PI / 2;
    noseCone.scale.set(1.1, 1.0, 0.52);
    noseCone.position.set(0, 1.4, -1.7);

    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 1.0, 6, 12), seatMat);
    seat.rotation.x = Math.PI / 2;
    seat.position.set(0, 1.68, 0.65);

    for (const tx of [-1.45, 1.45]) {
      const thruster = new THREE.Mesh(
        lathePoints([
          [0.45, 0],
          [0.62, 0.5],
          [0.58, 1.7],
          [0.42, 1.9],
        ], 14),
        metalDark
      );
      thruster.rotation.x = Math.PI / 2;
      thruster.position.set(tx, 1.0, 2.6);
      const glow = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.09, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x4de3ff, emissive: 0x4de3ff, emissiveIntensity: 2.2 })
      );
      glow.position.set(tx, 1.0, 4.45);
      g.add(thruster, glow);
    }

    const hoverGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.9, 0.1, 24),
      new THREE.MeshStandardMaterial({
        color: 0x4de3ff,
        emissive: 0x4de3ff,
        emissiveIntensity: 1.55,
        transparent: true,
        opacity: 0.48,
      })
    );
    hoverGlow.position.set(0, 0.12, 0);
    g.add(hull, noseCone, seat, hoverGlow);
  } else if (defId === 'vehicle_mule_t2') {
    addContactShadow(g, tex, 8, 14);
    // Sloped futuristic expedition rover silhouette via ExtrudeGeometry
    const bodyProfile = extrudeShape(
      [
        [-5.8, -0.7],
        [-5.2, 0.7],
        [-2.8, 2.7],
        [0.4, 2.8],
        [1.2, 1.6],
        [5.4, 1.5],
        [5.7, -0.7],
      ],
      6.0,
      0.32,
      0.32
    );
    bodyProfile.rotateY(-Math.PI / 2);
    const body = new THREE.Mesh(bodyProfile, yellowMat);
    body.position.set(0, 3.6, 0);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(2.35, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xbeefe6, roughness: 0.08, metalness: 0.18, transparent: true, opacity: 0.58 })
    );
    canopy.scale.set(1.08, 0.78, 1.18);
    canopy.position.set(0, 5.1, -2.1);

    const rollBar = new THREE.Mesh(
      tubePipe([
        [-2.6, 4.8, 0.4],
        [-2.4, 7.1, -1.0],
        [2.4, 7.1, -1.0],
        [2.6, 4.8, 0.4],
      ], 0.2),
      metalDark
    );
    const cargoTank = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 3.2, 8, 14), metalLight);
    cargoTank.rotation.z = Math.PI / 2;
    cargoTank.position.set(0, 5.5, 2.8);

    g.add(body, canopy, rollBar, cargoTank);

    for (const wx of [-3.9, 3.9]) {
      for (const wz of [-4.4, 0, 4.4]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.28, 20), seatMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 1.5, wz);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.38, 12), yellowMat);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(wx, 1.5, wz);
        const strut = new THREE.Mesh(
          tubePipe([
            [wx * 0.55, 2.6, wz],
            [wx * 0.9, 1.5, wz],
          ], 0.22),
          metalDark
        );
        g.add(wheel, hub, strut);
      }
    }
    for (const hx of [-1.8, 1.8]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff3d6, emissiveIntensity: 2.2 })
      );
      lamp.position.set(hx, 3.8, -5.65);
      g.add(lamp);
    }
  } else {
    const hull = new THREE.Mesh(
      lathePoints([
        [0, -6.5],
        [1.55, -4.8],
        [2.45, -1.8],
        [2.4, 1.8],
        [1.45, 5.2],
        [0.4, 6.4],
        [0, 6.5],
      ], 22),
      new THREE.MeshStandardMaterial({ color: 0x3fc1d1, roughness: 0.22, metalness: 0.62 })
    );
    hull.rotation.x = Math.PI / 2;
    hull.position.set(0, 2.7, 0);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.15, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xbeefe6, transparent: true, opacity: 0.52, roughness: 0.08, metalness: 0.18 })
    );
    dome.position.set(0, 2.85, -4.3);

    const finGeo = extrudeShape(
      [
        [-1.8, 0],
        [1.6, 0],
        [2.1, 2.3],
        [-0.4, 2.3],
      ],
      0.34,
      0.08,
      0.08
    );
    finGeo.rotateY(Math.PI / 2);
    const finTop = new THREE.Mesh(finGeo, yellowMat);
    finTop.position.set(0, 5.1, 1.4);

    const shroud = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.28, 10, 22), metalDark);
    shroud.position.set(0, 2.7, 6.2);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.5, 12), yellowMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.set(0, 2.7, 6.35);
    g.add(hull, dome, finTop, shroud, spinner);
  }

  return g;
}

export function buildVehicleCockpit(defId: string, tex: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e242d, roughness: 0.36, metalness: 0.82 });
  const trimMetal = new THREE.MeshStandardMaterial({
    color: 0x8e98a6,
    map: tex.panelMetal,
    roughness: 0.3,
    metalness: 0.74,
  });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.26, metalness: 0.62 });
  const tealGlow = new THREE.MeshStandardMaterial({
    color: 0x4dd0e1,
    emissive: 0x4dd0e1,
    emissiveIntensity: 1.6,
  });
  const amberGlow = new THREE.MeshStandardMaterial({
    color: 0xff8a3d,
    emissive: 0xff8a3d,
    emissiveIntensity: 1.5,
  });
  const glassCanopy = new THREE.MeshStandardMaterial({
    color: 0xbfefff,
    roughness: 0.08,
    metalness: 0.14,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });

  if (defId === 'vehicle_dart_t1') {
    const nose = new THREE.Mesh(
      lathePoints([
        [0, -1.1],
        [0.45, -0.3],
        [0.72, 0.6],
        [0.68, 1.1],
      ], 16),
      yellow
    );
    nose.rotation.x = Math.PI / 2;
    nose.scale.set(1.1, 1.0, 0.34);
    nose.position.set(0, -0.72, -1.65);

    const barCurve = new THREE.Mesh(
      tubePipe([
        [-0.58, -0.5, -0.78],
        [-0.36, -0.42, -0.84],
        [0, -0.43, -0.88],
        [0.36, -0.42, -0.84],
        [0.58, -0.5, -0.78],
      ], 0.032),
      trimMetal
    );
    const gripL = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.14, 6, 10), darkMetal);
    gripL.rotation.z = 1.25;
    gripL.position.set(-0.56, -0.49, -0.78);
    const gripR = gripL.clone();
    gripR.rotation.z = -1.25;
    gripR.position.set(0.56, -0.49, -0.78);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16), tealGlow);
    gauge.position.set(0, -0.42, -0.89);
    gauge.rotation.x = Math.PI * 0.38;
    g.add(nose, barCurve, gripL, gripR, gauge);
  } else if (defId === 'vehicle_mule_t2') {
    const dash = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.5, 0.42, 20, 1, false, -0.7, 1.4),
      new THREE.MeshStandardMaterial({ map: tex.panelMetal, color: 0x353b44, roughness: 0.42, metalness: 0.7 })
    );
    dash.rotation.y = Math.PI;
    dash.position.set(0, -0.68, -0.2);

    const frameArch = new THREE.Mesh(
      tubePipe([
        [-1.18, -0.65, -1.12],
        [-1.08, 0.72, -1.12],
        [0, 0.84, -1.12],
        [1.08, 0.72, -1.12],
        [1.18, -0.65, -1.12],
      ], 0.065),
      yellow
    );
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16), tealGlow);
    screen.position.set(-0.18, -0.44, -0.96);
    screen.rotation.x = Math.PI * 0.38;
    const warnBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 6, 10), amberGlow);
    warnBar.rotation.z = Math.PI / 2;
    warnBar.position.set(0.32, -0.44, -0.96);
    const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.028, 10, 24), darkMetal);
    wheelRing.position.set(-0.48, -0.42, -0.84);
    wheelRing.rotation.x = -0.5;
    g.add(dash, frameArch, screen, warnBar, wheelRing);
  } else {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.065, 12, 32), darkMetal);
    ring.position.set(0, -0.05, -1.06);
    const domeTint = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      glassCanopy
    );
    domeTint.rotation.x = -Math.PI / 2;
    domeTint.position.set(0, -0.05, -0.42);
    const console = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.1, 8, 14), darkMetal);
    console.rotation.z = Math.PI / 2;
    console.position.set(0, -0.66, -1.0);
    const display = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), tealGlow);
    display.position.set(0, -0.47, -0.92);
    display.rotation.x = Math.PI * 0.38;
    const strutL = new THREE.Mesh(
      tubePipe([
        [-0.95, -0.25, -1.06],
        [-0.55, 0.72, -1.06],
      ], 0.036),
      yellow
    );
    const strutR = new THREE.Mesh(
      tubePipe([
        [0.95, -0.25, -1.06],
        [0.55, 0.72, -1.06],
      ], 0.036),
      yellow
    );
    g.add(ring, domeTint, console, display, strutL, strutR);
  }
  return g;
}

export function buildFirstPersonToolGroup(itemId: string, tex: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.34, metalness: 0.82 });
  const metalLight = new THREE.MeshStandardMaterial({
    color: 0xc8ced6,
    map: tex.panelMetal,
    roughness: 0.28,
    metalness: 0.76,
  });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff6a13, roughness: 0.4, metalness: 0.36 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xd97742, roughness: 0.24, metalness: 0.88 });
  const suitFabric = new THREE.MeshStandardMaterial({ color: 0x454c56, roughness: 0.7, metalness: 0.24 });

  // Sculpted cylindrical/contoured EVA forearm & ergonomic gauntlet (zero rectangular blocks)
  const forearm = new THREE.Mesh(
    lathePoints([
      [0.09, 0],
      [0.105, 0.18],
      [0.12, 0.44],
      [0.128, 0.66],
    ], 16),
    suitFabric
  );
  forearm.rotation.x = Math.PI / 2;
  forearm.position.set(0.055, -0.145, 0.08);

  const wristRing = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.02, 10, 20), orangeMat);
  wristRing.position.set(0.055, -0.145, 0.09);

  const bracer = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 6, 12), metalLight);
  bracer.rotation.x = Math.PI / 2;
  bracer.position.set(0.055, -0.065, 0.28);

  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), metalDark);
  knuckle.scale.set(1.1, 0.85, 1.2);
  knuckle.position.set(0.02, -0.09, -0.02);

  g.add(forearm, wristRing, bracer, knuckle);

  if (itemId === 'scanner') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.28, 8, 16), metalLight);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0, -0.18);

    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.11, 6, 10), metalDark);
    grip.position.set(0, -0.11, -0.08);
    grip.rotation.x = 0.25;

    const screen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.078, 0.025, 16),
      new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x4dd0e1, emissiveIntensity: 1.7 })
    );
    screen.position.set(0, 0.095, -0.13);
    screen.rotation.x = Math.PI * 0.35;

    const dish = new THREE.Mesh(
      lathePoints([
        [0.055, 0],
        [0.09, 0.06],
        [0.135, 0.13],
        [0.11, 0.13],
        [0.07, 0.04],
      ], 18),
      metalDark
    );
    dish.rotation.x = -Math.PI / 2;
    dish.position.set(0, 0.015, -0.38);

    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x4dd0e1, emissiveIntensity: 1.9, roughness: 0.1 })
    );
    lens.position.set(0, 0.015, -0.45);

    const conduit = new THREE.Mesh(
      tubePipe([
        [0.08, -0.04, -0.08],
        [0.125, -0.01, -0.22],
        [0.08, 0.02, -0.34],
      ], 0.018),
      copperMat
    );

    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 2.2, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x4dd0e1,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.name = 'ActiveBeam';
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 0.015, -1.58);
    beam.visible = false;

    g.add(body, grip, screen, dish, lens, conduit, beam);
  } else if (itemId === 'cutter') {
    const barrel = new THREE.Mesh(
      lathePoints([
        [0.075, 0],
        [0.105, 0.12],
        [0.108, 0.34],
        [0.088, 0.5],
        [0.065, 0.54],
      ], 16),
      orangeMat
    );
    barrel.rotation.x = -Math.PI / 2;
    barrel.position.set(0, 0, -0.01);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 18), metalDark);
    ring.position.set(0, 0, -0.38);

    const battery = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.22, 12), metalLight);
    battery.rotation.z = Math.PI / 2;
    battery.position.set(0, -0.11, -0.15);

    const prongGeo = extrudeShape(
      [
        [0, 0],
        [0.24, 0.03],
        [0.24, 0.07],
        [0, 0.09],
      ],
      0.03,
      0.01,
      0.01
    );
    prongGeo.rotateY(Math.PI / 2);
    const prongL = new THREE.Mesh(prongGeo, metalDark);
    prongL.position.set(-0.065, 0.03, -0.57);
    const prongR = prongL.clone();
    prongR.position.set(0.065, 0.03, -0.57);

    const cable = new THREE.Mesh(
      tubePipe([
        [-0.08, -0.11, -0.15],
        [-0.14, -0.02, -0.28],
        [-0.09, 0.04, -0.44],
      ], 0.018),
      copperMat
    );

    const tip = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.056, 0),
      new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xff8a3d, emissiveIntensity: 2.2 })
    );
    tip.position.set(0, 0.04, -0.62);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.042, 2.5, 10),
      new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.85 })
    );
    beam.name = 'ActiveBeam';
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, 0.04, -1.88);
    beam.visible = false;

    g.add(barrel, ring, battery, prongL, prongR, cable, tip, beam);
  } else if (itemId === 'knife') {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 6, 12), metalDark);
    grip.rotation.x = Math.PI * 0.35;
    grip.position.set(0, -0.04, -0.1);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 14), orangeMat);
    guard.position.set(0, 0.05, -0.2);

    const bladeGeo = extrudeShape(
      [
        [0, -0.035],
        [0.34, -0.035],
        [0.44, 0.015],
        [0.32, 0.045],
        [0, 0.045],
      ],
      0.012,
      0.006,
      0.006
    );
    bladeGeo.rotateY(Math.PI / 2);
    const blade = new THREE.Mesh(bladeGeo, metalLight);
    blade.position.set(0, 0.13, -0.4);
    blade.rotation.x = -0.22;
    g.add(grip, guard, blade);
  } else if (itemId === 'handlamp') {
    const body = new THREE.Mesh(
      lathePoints([
        [0.065, 0],
        [0.072, 0.26],
        [0.095, 0.36],
        [0.115, 0.44],
        [0.09, 0.44],
      ], 16),
      metalDark
    );
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0, -0.02);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.016, 8, 16), orangeMat);
    collar.position.set(0, 0, -0.36);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.03, 16),
      new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xfff3d6, emissiveIntensity: 2.1 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, -0.45);
    g.add(body, collar, lens);
  } else if (itemId === 'flare') {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.056, 0.38, 12),
      new THREE.MeshStandardMaterial({ color: 0xe86f51, roughness: 0.55 })
    );
    tube.rotation.x = 0.3;
    tube.position.set(0, 0.05, -0.18);
    const striker = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 12), metalDark);
    striker.rotation.x = 0.3;
    striker.position.set(0, 0.18, -0.22);
    const spark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.068, 0),
      new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff5a2f, emissiveIntensity: 2.4 })
    );
    spark.position.set(0, 0.24, -0.24);
    g.add(tube, striker, spark);
  } else {
    const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.12, 8, 12), metalLight);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(0, -0.02, -0.18);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07, 0),
      new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 1.3 })
    );
    core.position.set(0, 0.06, -0.18);
    g.add(pad, core);
  }

  return g;
}

export function buildCreatureMesh(kind: string, tex?: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'plodder') {
    if (tex) addContactShadow(g, tex, 6, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc9b28c, roughness: 0.85 });
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x8b7b63, roughness: 0.78 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x6f8f5b, roughness: 0.9 });

    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'Body';
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.75, 2.8, 8, 16), bodyMat);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1.12, 1.0, 0.95);
    torso.position.set(0, 3.15, 0);

    // Organic domed carapace shell + moss cushions
    const shellDome = new THREE.Mesh(new THREE.SphereGeometry(2.15, 16, 12), shellMat);
    shellDome.scale.set(1.0, 0.55, 1.45);
    shellDome.position.set(0, 4.35, 0.1);
    const mossCap = new THREE.Mesh(new THREE.SphereGeometry(1.65, 14, 10), mossMat);
    mossCap.scale.set(1.0, 0.45, 1.35);
    mossCap.position.set(0, 4.85, 0.25);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 12), bodyMat);
    head.scale.set(0.92, 0.88, 1.2);
    head.position.set(0, 3.55, -3.7);
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), mossMat);
    crest.scale.set(0.6, 0.85, 1.25);
    crest.position.set(0, 4.55, -3.55);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.2, 10), bodyMat);
    tail.name = 'Tail';
    tail.rotation.x = Math.PI * 0.45;
    tail.position.set(0, 3.0, 3.6);
    bodyGroup.add(torso, shellDome, mossCap, head, crest, tail);
    g.add(bodyGroup);

    const legCoords: [string, number, number][] = [
      ['LegFL', -1.45, -1.9],
      ['LegFR', 1.45, -1.9],
      ['LegBL', -1.45, 1.9],
      ['LegBR', 1.45, 1.9],
    ];
    for (const [name, lx, lz] of legCoords) {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(lx, 2.2, lz);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.5, 6, 10), bodyMat);
      leg.position.set(0, -1.05, 0);
      pivot.add(leg);
      g.add(pivot);
    }
  } else if (kind === 'skitter') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b6058, roughness: 0.62, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.0, 8, 12), mat);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0.78, 0);
    const eyes = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 1.9 })
    );
    eyes.scale.set(1.2, 0.55, 0.6);
    eyes.position.set(0, 0.92, -0.88);
    g.add(body, eyes);

    const legSpecs: [string, number, number][] = [
      ['LegFL', -0.5, -0.45],
      ['LegFR', 0.5, -0.45],
      ['LegBL', -0.5, 0.45],
      ['LegBR', 0.5, 0.45],
    ];
    for (const [name, lx, lz] of legSpecs) {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(lx, 0.72, lz);
      const sign = lx < 0 ? -1 : 1;
      const leg = new THREE.Mesh(
        tubePipe([
          [0, 0, 0],
          [sign * 0.45, 0.28, 0],
          [sign * 0.65, -0.7, 0],
        ], 0.09),
        mat
      );
      pivot.add(leg);
      g.add(pivot);
    }
  } else if (kind === 'ridge_stalker' || kind === 'cave_lurker') {
    if (tex) addContactShadow(g, tex, 6, 12);
    const isLurker = kind === 'cave_lurker';
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isLurker ? 0x1d2738 : 0x3b3254,
      roughness: 0.44,
      metalness: 0.32,
    });
    const spineMat = new THREE.MeshStandardMaterial({
      color: isLurker ? 0x2f435c : 0x564878,
      roughness: 0.36,
      metalness: 0.42,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.42, 5.8, 8, 14), bodyMat);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 3.45, 0);

    for (let i = 0; i < 4; i++) {
      const finGeo = extrudeShape(
        [
          [-0.45, 0],
          [0.45, 0],
          [0.85, 1.35],
          [-0.1, 1.1],
        ],
        0.22,
        0.04,
        0.04
      );
      finGeo.rotateY(Math.PI / 2);
      const fin = new THREE.Mesh(finGeo, spineMat);
      fin.position.set(0, 5.05, -2.2 + i * 1.65);
      g.add(fin);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(1.45, 14, 12), bodyMat);
    head.scale.set(0.95, 0.85, 1.35);
    head.position.set(0, 4.15, -4.9);

    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.92, 2.2, 10), spineMat);
    snout.rotation.x = -Math.PI / 2;
    snout.position.set(0, 3.9, -6.4);

    const eyeMat = new THREE.MeshStandardMaterial({
      color: isLurker ? 0xc256c8 : 0xf28c38,
      emissive: isLurker ? 0xc256c8 : 0xf28c38,
      emissiveIntensity: 3.0,
    });
    for (const ex of [-0.8, 0.8]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), eyeMat);
      eye.position.set(ex, 4.45, -6.15);
      g.add(eye);
    }

    const tail = new THREE.Group();
    tail.name = 'Tail';
    tail.position.set(0, 3.3, 4.1);
    const tailGeo = new THREE.ConeGeometry(0.95, 6.2, 10);
    tailGeo.rotateX(Math.PI / 2);
    tailGeo.translate(0, 0, 3.1);
    const tailMesh = new THREE.Mesh(tailGeo, bodyMat);
    tail.add(tailMesh);

    const legCoords: [string, number, number][] = [
      ['LegFL', -1.55, -2.5],
      ['LegFR', 1.55, -2.5],
      ['LegBL', -1.55, 2.5],
      ['LegBR', 1.55, 2.5],
    ];
    for (const [name, lx, lz] of legCoords) {
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.position.set(lx, 3.0, lz);
      const leg = new THREE.Mesh(
        tubePipe([
          [0, 0, 0],
          [lx > 0 ? 0.35 : -0.35, -1.4, 0.5],
          [0, -3.0, -0.2],
        ], 0.36),
        bodyMat
      );
      pivot.add(leg);
      g.add(pivot);
    }
    g.add(torso, head, snout, tail);
  } else {
    // Warden Leviathan — organic undulating armored sea serpent
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x0d2a38, roughness: 0.24, metalness: 0.62 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xff7a2f,
      emissive: 0xff7a2f,
      emissiveIntensity: 2.6,
    });
    const head = new THREE.Mesh(new THREE.ConeGeometry(8.5, 20, 12), shellMat);
    head.rotation.x = -Math.PI / 2;
    head.position.set(0, 8, -22);
    g.add(head);
    for (const ex of [-4.5, 4.5]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 12), glowMat);
      eye.position.set(ex, 9.8, -24);
      const eyeSub = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10), glowMat);
      eyeSub.position.set(ex * 1.15, 7.6, -21);
      g.add(eye, eyeSub);
    }
    const finGeo = extrudeShape(
      [
        [-0.8, 0],
        [1.2, 0],
        [2.2, 4.2],
        [-0.2, 3.4],
      ],
      0.5,
      0.12,
      0.12
    );
    finGeo.rotateY(Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const r = 7.4 - i * 0.72;
      const segGroup = new THREE.Group();
      segGroup.name = `Seg_${i}`;
      segGroup.position.set(0, 8, -10 + i * 10);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.78, 5.2, 8, 14), shellMat);
      seg.rotation.x = Math.PI / 2;
      const crest = new THREE.Mesh(finGeo, glowMat);
      crest.scale.setScalar(r / 7.5);
      crest.position.set(0, r * 0.65, 0);
      segGroup.add(seg, crest);
      g.add(segGroup);
    }
  }
  const rig: CreatureRigRefs = { segs: [] };
  g.traverse((o) => {
    if (o.name === 'LegFL') rig.legFL = o;
    else if (o.name === 'LegFR') rig.legFR = o;
    else if (o.name === 'LegBL') rig.legBL = o;
    else if (o.name === 'LegBR') rig.legBR = o;
    else if (o.name === 'Tail') rig.tail = o;
    else if (o.name.startsWith('Seg_')) {
      const idx = parseInt(o.name.slice(4), 10);
      rig.segs[idx] = o;
    }
  });
  g.userData.rig = rig;
  return g;
}

export function buildPlayerAvatar(): THREE.Group {
  const g = new THREE.Group();
  const suitMat = new THREE.MeshStandardMaterial({ color: 0xbfc4c9, roughness: 0.48, metalness: 0.35 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.0, 8, 12), suitMat);
  torso.position.set(0, 2.95, 0);
  g.add(torso);
  return g;
}

export function buildLandmarkMesh(id: string, tex: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, map: tex.panelMetal, roughness: 0.38, metalness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242930, roughness: 0.48, metalness: 0.62 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86f51, roughness: 0.4, metalness: 0.38 });
  const alienMat = new THREE.MeshStandardMaterial({
    map: tex.alienGoldSeam,
    color: 0xbeefe6,
    roughness: 0.2,
    metalness: 0.42,
  });
  const goldGlow = new THREE.MeshStandardMaterial({
    color: 0xd9b25f,
    emissive: 0xd9b25f,
    emissiveIntensity: 1.95,
    roughness: 0.2,
  });

  if (id === 'cradle') {
    addContactShadow(g, tex, 16, 16);
    const scorch = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 9.6, 0.42, 20),
      new THREE.MeshStandardMaterial({ color: 0x28211d, roughness: 0.95 })
    );
    scorch.position.set(0, 0.21, 0);

    const pod = new THREE.Mesh(
      lathePoints([
        [5.4, 0],
        [5.55, 1.3],
        [4.9, 5.2],
        [4.1, 8.2],
        [2.6, 9.7],
        [0, 10.1],
      ], 24),
      metal
    );
    pod.position.set(0, 0.5, 0);
    pod.rotation.z = 0.12;

    const heatCollar = new THREE.Mesh(new THREE.CylinderGeometry(5.65, 5.9, 1.35, 20), dark);
    heatCollar.position.set(0, 0.95, 0);

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.4;
      const strut = new THREE.Mesh(
        tubePipe([
          [Math.cos(a) * 4.5, 2.5, Math.sin(a) * 4.5],
          [Math.cos(a) * 5.8, 1.2, Math.sin(a) * 5.8],
          [Math.cos(a) * 6.4, 0.25, Math.sin(a) * 6.4],
        ], 0.34),
        dark
      );
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.35, 12), orange);
      pad.position.set(Math.cos(a) * 6.4, 0.18, Math.sin(a) * 6.4);
      g.add(strut, pad);
    }

    const wingGeo = extrudeShape(
      [
        [-4.5, -1.6],
        [4.8, -0.8],
        [4.2, 1.8],
        [-3.8, 1.2],
      ],
      0.28,
      0.08,
      0.08
    );
    wingGeo.rotateX(Math.PI / 2);
    const wing = new THREE.Mesh(wingGeo, dark);
    wing.position.set(-6.0, 1.2, 2.4);
    wing.rotation.set(0.2, 0.4, -0.18);

    const hatchRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.28, 10, 20), dark);
    hatchRing.position.set(0, 2.9, -4.65);
    const hatchGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, 0.2, 18),
      new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x4dd0e1, emissiveIntensity: 1.25 })
    );
    hatchGlow.rotation.x = Math.PI / 2;
    hatchGlow.position.set(0, 2.9, -4.8);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xff6a13, emissive: 0xff6a13, emissiveIntensity: 2.6 })
    );
    beacon.position.set(-1.15, 10.65, 0);
    g.add(scorch, pod, heatCollar, wing, hatchRing, hatchGlow, beacon);
  } else if (id === 'relay_alpha') {
    addContactShadow(g, tex, 26, 22);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(12, 13.5, 1.6, 16), dark);
    pad.position.set(0, 0.8, 0);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(7.2, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
      metal
    );
    dome.position.set(0, 1.5, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.4, 10, 28), dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 1.6, 0);
    const win = new THREE.Mesh(
      new THREE.CylinderGeometry(7.25, 7.25, 2.1, 16, 1, true, -0.5, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x4dd0e1, emissiveIntensity: 1.3 })
    );
    win.position.set(0, 4.4, 0);
    const tower = new THREE.Mesh(
      lathePoints([
        [2.6, 0],
        [1.9, 14],
        [1.3, 28],
        [1.1, 36],
      ], 12),
      dark
    );
    tower.position.set(5, 1.5, 4);
    const dish = new THREE.Mesh(
      lathePoints([
        [0, 0],
        [3.4, 1.1],
        [6.6, 4.2],
      ], 24),
      metal
    );
    dish.position.set(5, 36, 4);
    dish.rotation.x = Math.PI / 3;
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x4dd0e1, emissiveIntensity: 2.5 })
    );
    pulse.position.set(5, 39, 4);
    g.add(pad, dome, ring, win, tower, dish, pulse);
  } else if (id === 'terminus_gate') {
    addContactShadow(g, tex, 58, 30);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(28, 31, 4.2, 16), alienMat);
    plinth.position.set(0, 2.1, 0);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(22, 4.2, 12, 36, Math.PI), alienMat);
    arch.position.set(0, 16, 0);
    for (const sx of [-22, 22]) {
      const basePillar = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, 16, 12), alienMat);
      basePillar.position.set(sx, 10, 0);
      g.add(basePillar);
    }
    const seal = new THREE.Mesh(new THREE.TorusGeometry(10, 1.0, 12, 32), goldGlow);
    seal.position.set(0, 26, 0);
    const sealInner = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.55, 10, 28), goldGlow);
    sealInner.position.set(0, 26, 0);
    g.add(plinth, arch, seal, sealInner);
  } else if (id === 'the_lantern') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(28, 38, 16, 16), alienMat);
    base.position.set(0, 8, 0);
    const spire = new THREE.Mesh(
      lathePoints([
        [19, 0],
        [14, 34],
        [10, 62],
        [7.5, 88],
      ], 16),
      alienMat
    );
    spire.position.set(0, 12, 0);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(12, 0), goldGlow);
    core.name = 'LanternCore';
    core.position.set(0, 98, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(21, 1.3, 12, 36), goldGlow);
    ring.name = 'LanternRing';
    ring.position.set(0, 98, 0);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(27, 0.85, 12, 36), goldGlow);
    ring2.position.set(0, 98, 0);
    ring2.rotation.x = Math.PI / 3;
    const light = new THREE.PointLight(0xd9b25f, 28, 260, 1.25);
    light.position.set(0, 98, 0);
    g.add(base, spire, core, ring, ring2, light);
  }
  return g;
}
