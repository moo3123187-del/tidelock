import { ITEMS } from './config';

const ICON_CACHE = new Map<string, string>();

function shade(hex: string, pct: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + Math.round(2.55 * pct)));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + Math.round(2.55 * pct)));
  const b = Math.min(255, Math.max(0, (n & 255) + Math.round(2.55 * pct)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function metalGrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, base: string) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(base, 24));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -26));
  return g;
}

function glowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 0.45) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrystalCluster(ctx: CanvasRenderingContext2D, col: string, glow: string) {
  glowCircle(ctx, 32, 34, 24, glow, 0.38);
  const shards: [number, number, number, number, number][] = [
    [32, 10, 21, 48, 43],
    [18, 22, 12, 49, 25],
    [45, 19, 39, 49, 51],
  ];
  for (const [tipX, tipY, lx, by, rx] of shards) {
    const midX = (lx + rx) * 0.5;
    // Left lit facet
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(lx, by - 7);
    ctx.lineTo(midX, by);
    ctx.closePath();
    ctx.fillStyle = shade(col, 24);
    ctx.fill();
    // Right shaded facet
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(midX, by);
    ctx.lineTo(rx, by - 6);
    ctx.closePath();
    ctx.fillStyle = shade(col, -16);
    ctx.fill();
    // Crisp specular edge
    ctx.strokeStyle = shade(col, 42);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(midX, by);
    ctx.stroke();
  }
}

function drawOreRock(ctx: CanvasRenderingContext2D, rockCol: string, veinCol: string) {
  ctx.beginPath();
  ctx.moveTo(14, 42);
  ctx.lineTo(13, 27);
  ctx.lineTo(25, 14);
  ctx.lineTo(42, 16);
  ctx.lineTo(52, 29);
  ctx.lineTo(48, 46);
  ctx.lineTo(29, 51);
  ctx.closePath();
  ctx.fillStyle = metalGrad(ctx, 14, 14, 50, 50, rockCol);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Mineral veins / metallic facets
  const veins: [number, number, number][] = [
    [26, 28, 6],
    [39, 24, 5],
    [35, 39, 5.5],
  ];
  for (const [vx, vy, vr] of veins) {
    ctx.beginPath();
    ctx.moveTo(vx, vy - vr);
    ctx.lineTo(vx + vr, vy);
    ctx.lineTo(vx, vy + vr);
    ctx.lineTo(vx - vr, vy);
    ctx.closePath();
    ctx.fillStyle = shade(veinCol, 15);
    ctx.fill();
    ctx.strokeStyle = shade(veinCol, 36);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawIngot(ctx: CanvasRenderingContext2D, col: string) {
  // Chamfered 3D bar
  ctx.beginPath();
  ctx.moveTo(12, 34);
  ctx.lineTo(24, 21);
  ctx.lineTo(51, 21);
  ctx.lineTo(39, 34);
  ctx.closePath();
  ctx.fillStyle = shade(col, 28);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(12, 34);
  ctx.lineTo(39, 34);
  ctx.lineTo(39, 44);
  ctx.lineTo(12, 44);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(39, 34);
  ctx.lineTo(51, 21);
  ctx.lineTo(51, 31);
  ctx.lineTo(39, 44);
  ctx.closePath();
  ctx.fillStyle = shade(col, -25);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(12, 34);
  ctx.lineTo(24, 21);
  ctx.lineTo(51, 21);
  ctx.lineTo(39, 34);
  ctx.closePath();
  ctx.stroke();
}

function drawSuit(ctx: CanvasRenderingContext2D, accent: string, base: string) {
  glowCircle(ctx, 32, 30, 22, accent, 0.28);
  // Helmet
  ctx.beginPath();
  ctx.arc(32, 19, 10, 0, Math.PI * 2);
  ctx.fillStyle = metalGrad(ctx, 22, 10, 42, 28, base);
  ctx.fill();
  // Visor
  roundRect(ctx, 25, 14, 14, 8, 4);
  ctx.fillStyle = metalGrad(ctx, 25, 14, 39, 22, accent);
  ctx.fill();
  // Armored torso & shoulders
  ctx.beginPath();
  ctx.moveTo(15, 34);
  ctx.lineTo(21, 29);
  ctx.lineTo(43, 29);
  ctx.lineTo(49, 34);
  ctx.lineTo(45, 52);
  ctx.lineTo(19, 52);
  ctx.closePath();
  ctx.fillStyle = metalGrad(ctx, 16, 29, 46, 52, base);
  ctx.fill();
  // Chest accent plate
  roundRect(ctx, 25, 34, 14, 10, 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(29, 37, 6, 4);
}

function drawTank(ctx: CanvasRenderingContext2D, col: string) {
  glowCircle(ctx, 32, 32, 22, col, 0.28);
  for (const cx of [24, 40]) {
    roundRect(ctx, cx - 6, 17, 12, 34, 6);
    ctx.fillStyle = metalGrad(ctx, cx - 6, 17, cx + 6, 51, col);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 4, 13, 8, 5);
  }
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(24, 13);
  ctx.lineTo(40, 13);
  ctx.stroke();
  ctx.fillStyle = '#F2C230';
  ctx.beginPath();
  ctx.arc(32, 13, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

export function getIsoIconDataUrl(id: string, size = 64): string {
  const key = `${id}_${size}`;
  const cached = ICON_CACHE.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);

  const item = ITEMS[id];
  const baseCol = item?.color ?? '#9AA0A6';

  switch (id) {
    case 'scanner': {
      glowCircle(ctx, 40, 22, 20, '#4DD0E1', 0.4);
      ctx.save();
      ctx.translate(32, 34);
      ctx.rotate(-0.48);
      roundRect(ctx, -11, -12, 22, 24, 4);
      ctx.fillStyle = metalGrad(ctx, -11, -12, 11, 12, '#BFC4C9');
      ctx.fill();
      roundRect(ctx, -7, -8, 14, 9, 2);
      ctx.fillStyle = '#4DD0E1';
      ctx.fill();
      // Dish
      ctx.beginPath();
      ctx.arc(0, -18, 9, Math.PI, 0);
      ctx.fillStyle = '#2F3640';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -19, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#4DD0E1';
      ctx.fill();
      // Grip
      roundRect(ctx, -5, 11, 10, 13, 3);
      ctx.fillStyle = '#333A44';
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'cutter': {
      glowCircle(ctx, 45, 19, 18, '#F2C230', 0.48);
      ctx.save();
      ctx.translate(30, 34);
      ctx.rotate(-0.52);
      roundRect(ctx, -14, -9, 26, 17, 4);
      ctx.fillStyle = metalGrad(ctx, -14, -9, 12, 8, '#FF6A13');
      ctx.fill();
      // Prongs
      ctx.fillStyle = '#333A44';
      ctx.fillRect(10, -8, 11, 4);
      ctx.fillRect(10, 3, 11, 4);
      // Plasma tip
      ctx.beginPath();
      ctx.arc(21, -0.5, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#F2C230';
      ctx.fill();
      // Grip
      roundRect(ctx, -9, 7, 9, 14, 3);
      ctx.fillStyle = '#2A2F37';
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'knife': {
      ctx.save();
      ctx.translate(32, 32);
      ctx.rotate(-0.72);
      // Blade
      ctx.beginPath();
      ctx.moveTo(-2, -3);
      ctx.lineTo(22, -3);
      ctx.lineTo(26, 2);
      ctx.lineTo(18, 5);
      ctx.lineTo(-2, 5);
      ctx.closePath();
      ctx.fillStyle = metalGrad(ctx, -2, -3, 24, 5, '#D5DCE4');
      ctx.fill();
      // Guard
      roundRect(ctx, -5, -7, 4, 15, 1.5);
      ctx.fillStyle = '#E5484D';
      ctx.fill();
      // Grip
      roundRect(ctx, -21, -3, 16, 7, 2.5);
      ctx.fillStyle = '#2E343D';
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'handlamp': {
      glowCircle(ctx, 44, 20, 19, '#FFF3D6', 0.45);
      ctx.save();
      ctx.translate(31, 33);
      ctx.rotate(-0.62);
      roundRect(ctx, -18, -5, 24, 10, 3);
      ctx.fillStyle = metalGrad(ctx, -18, -5, 6, 5, '#4B5058');
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, -5);
      ctx.lineTo(15, -9);
      ctx.lineTo(15, 9);
      ctx.lineTo(6, 5);
      ctx.closePath();
      ctx.fillStyle = '#FF6A13';
      ctx.fill();
      ctx.fillStyle = '#FFF3D6';
      ctx.fillRect(15, -8, 3, 16);
      ctx.restore();
      break;
    }

    case 'flare': {
      glowCircle(ctx, 41, 18, 18, '#FF4D4D', 0.55);
      ctx.save();
      ctx.translate(31, 35);
      ctx.rotate(-0.48);
      roundRect(ctx, -5, -14, 10, 30, 3);
      ctx.fillStyle = metalGrad(ctx, -5, -14, 5, 16, '#E86F51');
      ctx.fill();
      ctx.fillStyle = '#F2C230';
      ctx.fillRect(-5, -6, 10, 4);
      ctx.beginPath();
      ctx.arc(0, -18, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF3D6';
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'scrap_plate': {
      ctx.beginPath();
      ctx.moveTo(14, 26);
      ctx.lineTo(44, 16);
      ctx.lineTo(50, 38);
      ctx.lineTo(20, 48);
      ctx.closePath();
      ctx.fillStyle = metalGrad(ctx, 14, 16, 50, 48, '#8E959E');
      ctx.fill();
      ctx.strokeStyle = '#D5DCE4';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      for (const [rx, ry] of [
        [21, 28],
        [41, 22],
        [44, 35],
        [24, 42],
      ]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#3B4048';
        ctx.fill();
      }
      break;
    }

    case 'fibre': {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(32 + i * 3, 49);
        ctx.quadraticCurveTo(32 + i * 7, 29, 32 + i * 9, 14 + Math.abs(i) * 3);
        ctx.strokeStyle = i % 2 === 0 ? '#78A35E' : '#587D44';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.fillStyle = '#D09A4A';
      ctx.fillRect(25, 37, 14, 4);
      break;
    }

    case 'resin': {
      glowCircle(ctx, 32, 36, 20, '#F28C38', 0.42);
      ctx.beginPath();
      ctx.moveTo(32, 13);
      ctx.bezierCurveTo(46, 27, 48, 49, 32, 50);
      ctx.bezierCurveTo(16, 49, 18, 27, 32, 13);
      ctx.fillStyle = metalGrad(ctx, 20, 15, 44, 50, '#F28C38');
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(27, 32, 3, 6, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,245,215,0.6)';
      ctx.fill();
      break;
    }

    case 'silica':
    case 'brine_salt': {
      ctx.beginPath();
      ctx.moveTo(12, 47);
      ctx.quadraticCurveTo(32, 15, 52, 47);
      ctx.closePath();
      ctx.fillStyle = metalGrad(ctx, 12, 24, 52, 47, baseCol);
      ctx.fill();
      for (const [sx, sy] of [
        [27, 33],
        [35, 31],
        [31, 39],
        [39, 41],
      ]) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(sx, sy, 2.2, 2.2);
      }
      break;
    }

    case 'water_flask': {
      roundRect(ctx, 20, 19, 24, 32, 6);
      ctx.fillStyle = metalGrad(ctx, 20, 19, 44, 51, '#38BDF8');
      ctx.fill();
      roundRect(ctx, 26, 12, 12, 8, 2);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(24, 24, 4, 21);
      break;
    }

    case 'ration': {
      roundRect(ctx, 16, 17, 32, 32, 4);
      ctx.fillStyle = metalGrad(ctx, 16, 17, 48, 49, '#7BC96F');
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(20, 26, 24, 13);
      ctx.fillStyle = '#F2C230';
      ctx.fillRect(24, 31, 16, 3);
      break;
    }

    case 'medkit': {
      roundRect(ctx, 13, 18, 38, 30, 5);
      ctx.fillStyle = '#F1F5F9';
      ctx.fill();
      ctx.fillStyle = '#E5484D';
      ctx.fillRect(28, 23, 8, 20);
      ctx.fillRect(22, 29, 20, 8);
      break;
    }

    case 'biomass': {
      glowCircle(ctx, 32, 33, 18, '#4FB070', 0.35);
      ctx.beginPath();
      ctx.ellipse(32, 33, 16, 13, -0.35, 0, Math.PI * 2);
      ctx.fillStyle = metalGrad(ctx, 16, 20, 48, 46, '#4FB070');
      ctx.fill();
      ctx.beginPath();
      ctx.arc(30, 31, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#A7F3D0';
      ctx.fill();
      break;
    }

    case 'ferrite':
      drawOreRock(ctx, '#6E4C41', '#D96B43');
      break;
    case 'cuprite':
      drawOreRock(ctx, '#635345', '#3FC1D1');
      break;
    case 'aluminite':
      drawOreRock(ctx, '#7B828C', '#E2E8F0');
      break;
    case 'titanite':
      drawOreRock(ctx, '#475569', '#5FB5B0');
      break;
    case 'tar':
      drawOreRock(ctx, '#1E242B', '#475569');
      break;

    case 'prismite':
      drawCrystalCluster(ctx, '#C256C8', '#E879F9');
      break;
    case 'lithe':
      drawCrystalCluster(ctx, '#9B5CFF', '#C084FC');
      break;
    case 'lantern_ore':
      drawCrystalCluster(ctx, '#D9B25F', '#BEEFE6');
      break;

    case 'iron_ingot':
      drawIngot(ctx, '#9AA0A6');
      break;
    case 'copper_ingot':
      drawIngot(ctx, '#E86F51');
      break;
    case 'steel':
      drawIngot(ctx, '#64748B');
      break;

    case 'glass': {
      ctx.beginPath();
      ctx.moveTo(15, 22);
      ctx.lineTo(43, 14);
      ctx.lineTo(49, 41);
      ctx.lineTo(21, 49);
      ctx.closePath();
      ctx.fillStyle = 'rgba(190, 239, 230, 0.72)';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(22, 42);
      ctx.lineTo(39, 20);
      ctx.stroke();
      break;
    }

    case 'char': {
      drawOreRock(ctx, '#1E242B', '#FF6A13');
      break;
    }

    case 'sealant': {
      roundRect(ctx, 21, 16, 22, 32, 6);
      ctx.fillStyle = metalGrad(ctx, 21, 16, 43, 48, '#D09A4A');
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.fillRect(27, 11, 10, 6);
      break;
    }

    case 'polymer': {
      for (const [hx, hy] of [
        [24, 26],
        [39, 26],
        [32, 39],
      ]) {
        ctx.beginPath();
        ctx.arc(hx, hy, 9, 0, Math.PI * 2);
        ctx.fillStyle = metalGrad(ctx, hx - 9, hy - 9, hx + 9, hy + 9, '#4DA3FF');
        ctx.fill();
      }
      break;
    }

    case 'copper_wire': {
      ctx.beginPath();
      ctx.arc(32, 32, 16, 0, Math.PI * 2);
      ctx.strokeStyle = '#E86F51';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, 32, 16, 0, Math.PI * 2);
      ctx.strokeStyle = '#FDBA74';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }

    case 'circuit_board': {
      roundRect(ctx, 14, 16, 36, 32, 3);
      ctx.fillStyle = '#15803D';
      ctx.fill();
      ctx.strokeStyle = '#3DDC84';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(24, 24, 16, 16);
      ctx.strokeStyle = '#F2C230';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(16, 25);
      ctx.lineTo(24, 25);
      ctx.moveTo(40, 36);
      ctx.lineTo(48, 36);
      ctx.moveTo(32, 17);
      ctx.lineTo(32, 24);
      ctx.stroke();
      break;
    }

    case 'hull_panel':
    case 'pressure_plate': {
      const pCol = id === 'pressure_plate' ? '#475569' : '#BFC4C9';
      roundRect(ctx, 13, 15, 38, 34, 4);
      ctx.fillStyle = metalGrad(ctx, 13, 15, 51, 49, pCol);
      ctx.fill();
      ctx.strokeStyle = id === 'pressure_plate' ? '#3FC1D1' : '#F2C230';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(19, 21, 26, 22);
      break;
    }

    case 'battery_cell': {
      glowCircle(ctx, 32, 33, 20, '#F2C230', 0.35);
      roundRect(ctx, 20, 17, 24, 34, 4);
      ctx.fillStyle = metalGrad(ctx, 20, 17, 44, 51, '#F2C230');
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(22, 26, 20, 15);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(27, 12, 10, 5);
      ctx.fillStyle = '#3DDC84';
      ctx.fillRect(26, 31, 12, 5);
      break;
    }

    case 'insulated_suit':
      drawSuit(ctx, '#FF8A3D', '#CBD5E1');
      break;
    case 'pressure_suit':
      drawSuit(ctx, '#3FC1D1', '#94A3B8');
      break;
    case 'deepsuit':
      drawSuit(ctx, '#F2C230', '#475569');
      break;

    case 'standard_tank':
      drawTank(ctx, '#38BDF8');
      break;
    case 'high_cap_tank':
      drawTank(ctx, '#06B6D4');
      break;

    // Buildables & Vehicles
    case 'vehicle_dart_t1': {
      glowCircle(ctx, 20, 42, 14, '#4DE3FF', 0.35);
      ctx.beginPath();
      ctx.moveTo(52, 29);
      ctx.lineTo(14, 19);
      ctx.lineTo(18, 38);
      ctx.lineTo(44, 38);
      ctx.closePath();
      ctx.fillStyle = metalGrad(ctx, 14, 19, 52, 38, '#F2C230');
      ctx.fill();
      ctx.fillStyle = '#4DE3FF';
      ctx.fillRect(14, 41, 32, 3);
      break;
    }

    case 'vehicle_mule_t2': {
      roundRect(ctx, 11, 23, 42, 18, 4);
      ctx.fillStyle = metalGrad(ctx, 11, 23, 53, 41, '#F2C230');
      ctx.fill();
      roundRect(ctx, 32, 15, 17, 11, 3);
      ctx.fillStyle = '#CBD5E1';
      ctx.fill();
      ctx.fillStyle = '#BEEFE6';
      ctx.fillRect(42, 18, 6, 5);
      for (const wx of [18, 32, 46]) {
        ctx.beginPath();
        ctx.arc(wx, 44, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#1E293B';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(wx, 44, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#F2C230';
        ctx.fill();
      }
      break;
    }

    case 'vehicle_needle_t2': {
      glowCircle(ctx, 44, 32, 18, '#3FC1D1', 0.4);
      ctx.beginPath();
      ctx.ellipse(32, 33, 21, 11, 0, 0, Math.PI * 2);
      ctx.fillStyle = metalGrad(ctx, 11, 22, 53, 44, '#3FC1D1');
      ctx.fill();
      ctx.beginPath();
      ctx.arc(43, 33, 8, -Math.PI / 2, Math.PI / 2);
      ctx.fillStyle = '#BEEFE6';
      ctx.fill();
      ctx.fillStyle = '#F2C230';
      ctx.fillRect(24, 16, 10, 7);
      break;
    }

    default: {
      // Stylized sci-fi industrial module silhouette with accent bar
      roundRect(ctx, 13, 18, 38, 30, 5);
      ctx.fillStyle = metalGrad(ctx, 13, 18, 51, 48, '#94A3B8');
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.fillRect(17, 24, 30, 16);
      const accent =
        id.includes('solar') || id.includes('wind') || id.includes('tidal') || id.includes('bio')
          ? '#3DDC84'
          : id.includes('heater') || id.includes('furnace')
          ? '#FF7A2F'
          : id.includes('battery')
          ? '#F2C230'
          : '#38BDF8';
      ctx.fillStyle = accent;
      ctx.fillRect(20, 29, 24, 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(13, 18, 38, 30);
      break;
    }
  }

  const url = canvas.toDataURL('image/png');
  ICON_CACHE.set(key, url);
  return url;
}
