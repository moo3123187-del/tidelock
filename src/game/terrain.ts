import { WORLD_SEMI_X, WORLD_SEMI_Z } from './config';
import { RegionId } from './types';

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    val += amp * (smoothNoise(x * freq, z * freq) * 2 - 1);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getRegionAt(x: number, z: number, y?: number): RegionId {
  if (y !== undefined && y < -24 && x > 320 && x < 680 && z > -420 && z < -80) {
    return 'Cavern';
  }
  if (z > 340 && x > -700 && x < 340) return 'Spine';
  if (x >= 960) return 'NearSea';
  if (x >= 380) return 'Plains';
  if (x >= -420) return 'Belt';
  if (x >= -1040) return 'FarSide';
  return 'FarSea';
}

// Planet Tessara elevation angle in degrees (Design Bible §2)
export function getPlanetElevationDeg(x: number): number {
  // +1500 (sub-planet pole) -> 90°, 0 (terminator) -> 0°, -100 -> -6°
  const normalized = Math.max(-0.2, Math.min(1, x / 1350));
  return normalized * 90;
}

export function getGroundHeight(x: number, z: number): number {
  const n1 = fbm(x * 0.0045, z * 0.0045);
  const n2 = fbm(x * 0.015 + 41.3, z * 0.015 - 19.7);

  // Base Plains height (+12 to +44)
  let h = 22 + n1 * 18 + n2 * 4;

  // Flatten Cradle crash site around (650, -80)
  const dCradle = Math.hypot(x - 650, z + 80);
  if (dCradle < 110) {
    const t = 1 - smoothstep(40, 110, dCradle);
    h = h * (1 - t) + 18 * t;
  }

  // Terminator Belt (-420 to +380): ridges & Gantry Canyon
  const beltWeight = smoothstep(420, 260, x) * smoothstep(-520, -340, x);
  if (beltWeight > 0) {
    // Canyon trough near X = -50
    const canyonDist = Math.abs(x + 50 + Math.sin(z * 0.008) * 35);
    const canyonDepth = (1 - smoothstep(25, 110, canyonDist)) * 52;
    const ridgeHeight = Math.abs(n1) * 48 + 18;
    let beltH = 26 + ridgeHeight - canyonDepth + n2 * 6;

    // Halo Mesa plateau at (180, -20)
    const dMesa = Math.hypot(x - 180, z + 20);
    if (dMesa < 130) {
      const mt = 1 - smoothstep(70, 130, dMesa);
      beltH = beltH * (1 - mt) + 74 * mt;
    }

    // Flatten Relay Alpha pad (240, 210) & Terminus Gate pad (70, -190)
    const dRelay = Math.hypot(x - 240, z - 210);
    if (dRelay < 65) {
      const rt = 1 - smoothstep(30, 65, dRelay);
      beltH = beltH * (1 - rt) + 46 * rt;
    }
    const dGate = Math.hypot(x - 70, z + 190);
    if (dGate < 75) {
      const gt = 1 - smoothstep(35, 75, dGate);
      beltH = beltH * (1 - gt) + 28 * gt;
    }

    h = h * (1 - beltWeight) + beltH * beltWeight;
  }

  // Highland Spine (Z > 320, X in [-720, 360]) + Anvil Peak (-260, 580)
  const spineZ = smoothstep(260, 440, z);
  const spineX = smoothstep(-820, -560, x) * smoothstep(460, 240, x);
  const spineWeight = spineZ * spineX;
  if (spineWeight > 0) {
    let spineH = 75 + Math.abs(n1) * 95 + n2 * 12;
    const dAnvil = Math.hypot(x + 260, z - 580);
    if (dAnvil < 240) {
      spineH += (1 - smoothstep(20, 240, dAnvil)) * 185;
    }
    h = h * (1 - spineWeight) + spineH * spineWeight;
  }

  // Far Side Dark (-1040 to -420) & Salt Mirror (-680, -150)
  const farSideWeight = smoothstep(-360, -540, x) * smoothstep(-1120, -960, x);
  if (farSideWeight > 0) {
    let farH = 26 + n1 * 24 + n2 * 5;
    const dSalt = Math.hypot((x + 680) * 0.8, z + 150);
    if (dSalt < 190) {
      const st = 1 - smoothstep(95, 190, dSalt);
      farH = farH * (1 - st) + 4 * st;
    }
    h = h * (1 - farSideWeight) + farH * farSideWeight;
  }

  // Near Sea (X > 920) slopes down to seabed (-95) and The Trench (-230)
  if (x > 880) {
    const seaT = smoothstep(880, 1140, x);
    let seaFloor = -65 + n1 * 22 + n2 * 6;
    // The Trench around (1260, 0)
    const dTrench = Math.hypot((x - 1260) * 1.1, z * 0.7);
    if (dTrench < 190) {
      seaFloor -= (1 - smoothstep(45, 190, dTrench)) * 155;
    }
    h = h * (1 - seaT) + seaFloor * seaT;
  }

  // Far Sea (X < -980)
  if (x < -940) {
    const fSeaT = smoothstep(-940, -1180, x);
    const fSeaFloor = -55 + n1 * 18 + n2 * 4;
    h = h * (1 - fSeaT) + fSeaFloor * fSeaT;
  }

  // Skylight Cavern open depression / sinkhole at (500, -240)
  const dCavern = Math.hypot(x - 500, z + 240);
  if (dCavern < 115) {
    // Spiral/sloped crater descent down to Y = -48 so players can walk/glide right in!
    const rim = smoothstep(115, 42, dCavern);
    const floorTarget = -46 + n2 * 3;
    h = h * (1 - rim) + floorTarget * rim;
  }

  // Elliptical moon rim natural cliff barrier near edge
  const ellip = Math.sqrt((x / WORLD_SEMI_X) ** 2 + (z / WORLD_SEMI_Z) ** 2);
  if (ellip > 0.92 && x < 920 && x > -980) {
    h += smoothstep(0.92, 1.05, ellip) * 140;
  }

  return h;
}

export function getTerrainColor(x: number, y: number, z: number): [number, number, number] {
  const reg = getRegionAt(x, z, y);
  if (y < -4 && (x > 850 || x < -920)) {
    // Seabed sand & mineral silt
    return y < -130 ? [0.06, 0.22, 0.28] : [0.16, 0.36, 0.4];
  }
  switch (reg) {
    case 'Plains': {
      const m = smoothNoise(x * 0.02, z * 0.02);
      if (m > 0.62) return [0.435, 0.56, 0.357]; // moss #6F8F5B
      if (m < 0.24) return [0.478, 0.435, 0.4]; // rock #7A6F66
      return [0.788, 0.698, 0.549]; // sand #C9B28C
    }
    case 'Belt': {
      const m = smoothNoise(x * 0.025, z * 0.025);
      if (y < 5) return [0.23, 0.2, 0.33]; // shadow violet #3B3354
      if (m > 0.58) return [0.816, 0.604, 0.29]; // ochre #D09A4A
      return [0.659, 0.333, 0.227]; // rust #A8553A
    }
    case 'Spine': {
      if (y > 145) return [0.91, 0.902, 0.875]; // salt white #E8E6DF
      return [0.353, 0.392, 0.439]; // slate #5A6470
    }
    case 'FarSide': {
      const dSalt = Math.hypot((x + 680) * 0.8, z + 150);
      if (dSalt < 130) return [0.78, 0.8, 0.86]; // Salt Mirror pale sheen
      return [0.07, 0.07, 0.14]; // Near-black indigo #0B0B1A
    }
    case 'NearSea':
      return [0.12, 0.36, 0.42];
    case 'FarSea':
      return [0.08, 0.18, 0.26];
    case 'Cavern':
      return [0.48, 0.36, 0.25];
  }
}
