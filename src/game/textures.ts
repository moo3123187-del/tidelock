import * as THREE from 'three';

export interface ProceduralTextureSet {
  hazard: THREE.CanvasTexture;
  diamondPlate: THREE.CanvasTexture;
  panelMetal: THREE.CanvasTexture;
  solarGrid: THREE.CanvasTexture;
  conveyorBelt: THREE.CanvasTexture;
  alienGoldSeam: THREE.CanvasTexture;
  tessaraSurface: THREE.CanvasTexture;
  tessaraRings: THREE.CanvasTexture;
  terrainDetail: THREE.CanvasTexture;
  terrainNormal: THREE.CanvasTexture;
  particleSoft: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalizeTex(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
  srgb = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const aniso = Math.min(2, renderer.capabilities.getMaxAnisotropy() || 1);

  // 1. Hazard stripes (#F2C230 / #2B2F33) with subtle grime wear
  const [hc, hctx] = createCanvas(256, 256);
  hctx.fillStyle = '#25292E';
  hctx.fillRect(0, 0, 256, 256);
  hctx.fillStyle = '#F2C230';
  for (let i = -256; i < 512; i += 64) {
    hctx.beginPath();
    hctx.moveTo(i, 0);
    hctx.lineTo(i + 32, 0);
    hctx.lineTo(i + 32 + 256, 256);
    hctx.lineTo(i + 256, 256);
    hctx.closePath();
    hctx.fill();
  }
  for (let i = 0; i < 600; i++) {
    hctx.fillStyle = `rgba(15,18,22,${Math.random() * 0.22})`;
    hctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 2);
  }
  const hazard = finalizeTex(hc, aniso, 2, 1);

  // 2. Diamond Plate
  const [dc, dctx] = createCanvas(256, 256);
  dctx.fillStyle = '#454B54';
  dctx.fillRect(0, 0, 256, 256);
  for (let y = 12; y < 256; y += 24) {
    for (let x = 12; x < 256; x += 24) {
      const even = ((x + y) / 24) % 2 === 0;
      dctx.strokeStyle = 'rgba(255,255,255,0.22)';
      dctx.lineWidth = 3;
      dctx.beginPath();
      if (even) {
        dctx.moveTo(x - 6, y - 6);
        dctx.lineTo(x + 6, y + 6);
      } else {
        dctx.moveTo(x + 6, y - 6);
        dctx.lineTo(x - 6, y + 6);
      }
      dctx.stroke();
      dctx.strokeStyle = 'rgba(0,0,0,0.35)';
      dctx.lineWidth = 1.5;
      dctx.beginPath();
      if (even) {
        dctx.moveTo(x - 5, y - 4);
        dctx.lineTo(x + 7, y + 8);
      } else {
        dctx.moveTo(x + 7, y - 4);
        dctx.lineTo(x - 5, y + 8);
      }
      dctx.stroke();
    }
  }
  const diamondPlate = finalizeTex(dc, aniso, 2, 2);

  // 3. Industrial Panel Metal (scruffy brushed panels + panel seams + wear)
  const [pc, pctx] = createCanvas(256, 256);
  const pGrad = pctx.createLinearGradient(0, 0, 256, 256);
  pGrad.addColorStop(0, '#C7CCD1');
  pGrad.addColorStop(0.5, '#B4BAC1');
  pGrad.addColorStop(1, '#A6ACB3');
  pctx.fillStyle = pGrad;
  pctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    pctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    pctx.fillRect(0, y, 256, 1);
  }
  pctx.strokeStyle = 'rgba(26, 30, 38, 0.42)';
  pctx.lineWidth = 3;
  pctx.strokeRect(4, 4, 248, 248);
  pctx.strokeRect(12, 12, 110, 232);
  pctx.strokeRect(134, 12, 110, 232);
  pctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  pctx.lineWidth = 1;
  pctx.strokeRect(14, 14, 106, 228);
  pctx.strokeRect(136, 14, 106, 228);
  pctx.fillStyle = 'rgba(38,42,50,0.6)';
  for (const rx of [20, 112, 142, 234]) {
    for (const ry of [20, 128, 234]) {
      pctx.beginPath();
      pctx.arc(rx, ry, 2.8, 0, Math.PI * 2);
      pctx.fill();
    }
  }
  const panelMetal = finalizeTex(pc, aniso, 1, 1);

  // 4. Solar Cell Grid
  const [sc, sctx] = createCanvas(256, 256);
  sctx.fillStyle = '#142240';
  sctx.fillRect(0, 0, 256, 256);
  sctx.strokeStyle = '#5D88FF';
  sctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    sctx.beginPath();
    sctx.moveTo(i, 0);
    sctx.lineTo(i, 256);
    sctx.stroke();
    sctx.beginPath();
    sctx.moveTo(0, i);
    sctx.lineTo(256, i);
    sctx.stroke();
  }
  sctx.strokeStyle = 'rgba(190, 239, 230, 0.22)';
  sctx.lineWidth = 1;
  for (let i = 16; i < 256; i += 32) {
    sctx.beginPath();
    sctx.moveTo(i, 0);
    sctx.lineTo(i, 256);
    sctx.stroke();
  }
  const solarGrid = finalizeTex(sc, aniso, 1, 1);

  // 5. Scrolling Conveyor Belt
  const [cc, cctx] = createCanvas(128, 256);
  cctx.fillStyle = '#22262C';
  cctx.fillRect(0, 0, 128, 256);
  cctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < 256; y += 16) {
    cctx.fillRect(0, y, 128, 3);
  }
  cctx.strokeStyle = '#F2C230';
  cctx.lineWidth = 6;
  cctx.lineCap = 'round';
  for (const ay of [56, 184]) {
    cctx.beginPath();
    cctx.moveTo(30, ay + 24);
    cctx.lineTo(64, ay - 20);
    cctx.lineTo(98, ay + 24);
    cctx.stroke();
  }
  const conveyorBelt = finalizeTex(cc, aniso, 1, 1);

  // 6. Alien Tidal-Glass + Glowing Gold Circuit Seams (#BEEFE6 + #D9B25F)
  const [ac, actx] = createCanvas(256, 256);
  actx.fillStyle = '#C9F4EC';
  actx.fillRect(0, 0, 256, 256);
  actx.strokeStyle = '#D9B25F';
  actx.lineWidth = 5;
  actx.strokeRect(14, 14, 228, 228);
  actx.beginPath();
  actx.moveTo(14, 128);
  actx.lineTo(84, 128);
  actx.lineTo(128, 84);
  actx.lineTo(172, 128);
  actx.lineTo(242, 128);
  actx.moveTo(128, 14);
  actx.lineTo(128, 242);
  actx.stroke();
  actx.beginPath();
  actx.arc(128, 128, 24, 0, Math.PI * 2);
  actx.stroke();
  const alienGoldSeam = finalizeTex(ac, aniso, 2, 2);

  // 7. High-Res 1024x512 Tessara Giant Planet Banded Gas Atmosphere
  const [tc, tctx] = createCanvas(1024, 512);
  const grad = tctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#101633');
  grad.addColorStop(0.14, '#243570');
  grad.addColorStop(0.24, '#4B6BD1');
  grad.addColorStop(0.32, '#8EB4FF');
  grad.addColorStop(0.41, '#2D3E82');
  grad.addColorStop(0.5, '#6B8CFF');
  grad.addColorStop(0.58, '#B8D4FF');
  grad.addColorStop(0.67, '#435EBA');
  grad.addColorStop(0.78, '#23306B');
  grad.addColorStop(0.9, '#19234F');
  grad.addColorStop(1.0, '#0C1129');
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, 1024, 512);

  // Turbulent wavy bands & cyclone storms
  for (let y = 24; y < 488; y += 10) {
    tctx.fillStyle = y % 20 === 0 ? 'rgba(215, 232, 255, 0.14)' : 'rgba(18, 26, 62, 0.16)';
    tctx.beginPath();
    tctx.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 32) {
      tctx.lineTo(x, y + Math.sin(x * 0.018 + y * 0.12) * 4.5);
    }
    tctx.lineTo(1024, y + 6);
    tctx.lineTo(0, y + 6);
    tctx.closePath();
    tctx.fill();
  }
  // Great Planetshine Vortex
  const vg = tctx.createRadialGradient(580, 290, 6, 580, 290, 74);
  vg.addColorStop(0, 'rgba(220, 240, 255, 0.55)');
  vg.addColorStop(0.5, 'rgba(107, 140, 255, 0.35)');
  vg.addColorStop(1, 'rgba(107, 140, 255, 0)');
  tctx.fillStyle = vg;
  tctx.beginPath();
  tctx.ellipse(580, 290, 82, 42, -0.08, 0, Math.PI * 2);
  tctx.fill();
  const tessaraSurface = finalizeTex(tc, aniso, 1, 1);

  // 7b. Concentric Cassini-banded planetary ring texture (radial U = 0..1 across ring width)
  const [rc, rctx] = createCanvas(512, 32);
  for (let x = 0; x < 512; x++) {
    const t = x / 511;
    const band = Math.sin(t * 58) * 0.3 + Math.sin(t * 145) * 0.2 + 0.5;
    const cassiniGap = t > 0.56 && t < 0.63 ? 0.08 : 1.0;
    const edgeFade = Math.sin(t * Math.PI);
    const alpha = Math.max(0, Math.min(1, (0.25 + band * 0.55) * cassiniGap * Math.pow(edgeFade, 0.55)));
    const r = Math.round(165 + t * 55);
    const g = Math.round(192 + t * 38);
    const b = 255;
    rctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    rctx.fillRect(x, 0, 1, 32);
  }
  const tessaraRings = finalizeTex(rc, aniso, 1, 1);
  tessaraRings.wrapS = THREE.ClampToEdgeWrapping;
  tessaraRings.wrapT = THREE.RepeatWrapping;

  // 8. Terrain Detail Albedo + 9. Procedural Normal Map (Sobel from height noise)
  const size = 256;
  const heightField = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = Math.sin(x * 0.12) * Math.cos(y * 0.12) * 0.35;
      const n2 = Math.sin(x * 0.31 + y * 0.19) * 0.25;
      const n3 = (Math.random() - 0.5) * 0.4;
      heightField[y * size + x] = 0.5 + n1 + n2 + n3;
    }
  }

  const [gc, gctx] = createCanvas(size, size);
  const gImg = gctx.createImageData(size, size);
  const [nc, nctx] = createCanvas(size, size);
  const nImg = nctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const h = heightField[idx];
      const v = Math.max(155, Math.min(250, Math.round(180 + h * 65)));
      gImg.data[idx * 4] = v;
      gImg.data[idx * 4 + 1] = v;
      gImg.data[idx * 4 + 2] = v;
      gImg.data[idx * 4 + 3] = 255;

      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (heightField[y * size + xp] - heightField[y * size + xm]) * 1.6;
      const dy = (heightField[yp * size + x] - heightField[ym * size + x]) * 1.6;
      const len = Math.hypot(-dx, -dy, 1);
      nImg.data[idx * 4] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      nImg.data[idx * 4 + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      nImg.data[idx * 4 + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      nImg.data[idx * 4 + 3] = 255;
    }
  }
  gctx.putImageData(gImg, 0, 0);
  nctx.putImageData(nImg, 0, 0);
  const terrainDetail = finalizeTex(gc, aniso, 55, 55, true);
  const terrainNormal = finalizeTex(nc, aniso, 55, 55, false);

  // 10. Soft radial particle sprite
  const [ptc, ptctx] = createCanvas(64, 64);
  const pg = ptctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  pg.addColorStop(0, 'rgba(255,255,255,1)');
  pg.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  pg.addColorStop(1, 'rgba(255,255,255,0)');
  ptctx.fillStyle = pg;
  ptctx.fillRect(0, 0, 64, 64);
  const particleSoft = finalizeTex(ptc, 1, 1, 1);

  // 11. Soft Contact Shadow blob
  const [sc2, sctx2] = createCanvas(128, 128);
  const sg = sctx2.createRadialGradient(64, 64, 4, 64, 64, 62);
  sg.addColorStop(0, 'rgba(0,0,0,0.62)');
  sg.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  sctx2.fillStyle = sg;
  sctx2.fillRect(0, 0, 128, 128);
  const contactShadow = finalizeTex(sc2, 1, 1, 1);

  return {
    hazard,
    diamondPlate,
    panelMetal,
    solarGrid,
    conveyorBelt,
    alienGoldSeam,
    tessaraSurface,
    tessaraRings,
    terrainDetail,
    terrainNormal,
    particleSoft,
    contactShadow,
    dispose: () => {
      hazard.dispose();
      diamondPlate.dispose();
      panelMetal.dispose();
      solarGrid.dispose();
      conveyorBelt.dispose();
      alienGoldSeam.dispose();
      tessaraSurface.dispose();
      tessaraRings.dispose();
      terrainDetail.dispose();
      terrainNormal.dispose();
      particleSoft.dispose();
      contactShadow.dispose();
    },
  };
}
