import React, { useEffect, useState } from 'react';
import {
  BatteryCharging,
  Droplets,
  Eye,
  EyeOff,
  Flame,
  Flashlight,
  Hammer,
  Heart,
  Map as MapIcon,
  Package,
  Pause,
  Pin,
  Utensils,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import {
  BUILDABLES,
  ITEMS,
  LANDMARKS,
  ORBIT_DURATION,
  RECIPES,
  REGION_CONFIG,
  SUIT_SPECS,
} from '../game/config';
import { getIsoIconDataUrl } from '../game/isoIcons';
import { HudSnapshot } from '../game/types';

interface HudOverlayProps {
  hud: HudSnapshot;
  pinnedTarget: { kind: 'recipe' | 'buildable'; id: string } | null;
  onUnpin: () => void;
  onSelectSlot: (idx: number) => void;
  onOpenModal: (modal: 'inventory' | 'build' | 'production' | 'map') => void;
  onPause: () => void;
  onToggleMute: () => void;
  onSetOrbitSpeed: (mult: number) => void;
  onCancelBuild: () => void;
}

function formatClock(seconds: number): string {
  const s = ((Math.floor(seconds) % ORBIT_DURATION) + ORBIT_DURATION) % ORBIT_DURATION;
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const COMPASS_MARKS: { deg: number; label: string; major?: boolean }[] = [
  { deg: 0, label: 'N', major: true },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E · TESSARA', major: true },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S', major: true },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W', major: true },
  { deg: 315, label: 'NW' },
];

const COMPASS_TICKS: number[] = Array.from({ length: 24 }, (_, i) => i * 15);

const WAYPOINT_LANDMARKS: Record<string, { short: string; color: string }> = {
  cradle: { short: 'Cradle', color: '#F2C230' },
  meridian_wreck: { short: 'Wreck', color: '#F28C38' },
  skylight_cavern: { short: 'Cavern', color: '#C256C8' },
  relay_alpha: { short: 'Relay', color: '#38BDF8' },
  terminus_gate: { short: 'Gate', color: '#5FB5B0' },
  the_lantern: { short: 'Lantern', color: '#D9B25F' },
};

const RadialGauge: React.FC<{
  pct: number;
  color: string;
  label: string;
  value: string;
  icon: React.ReactNode;
}> = ({ pct, color, label, value, icon }) => {
  const r = 24;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90">
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="rgba(7, 10, 16, 0.55)"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="4.5"
          />
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="4.5"
            strokeLinecap="butt"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">{icon}</div>
      </div>
      <div className="drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-300/85">
          {label}
        </div>
        <div className="font-mono-num text-sm font-bold text-white leading-tight">{value}</div>
      </div>
    </div>
  );
};

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  pinnedTarget,
  onUnpin,
  onSelectSlot,
  onOpenModal,
  onPause,
  onToggleMute,
  onSetOrbitSpeed,
  onCancelBuild,
}) => {
  const [hudHidden, setHudHidden] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') setHudHidden((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const reg = REGION_CONFIG[hud.region];
  const suit = SUIT_SPECS[hud.stats.suitTier];

  const phaseColor =
    hud.orbitPhase === 'Eclipse'
      ? '#7AA2FF'
      : hud.orbitPhase === 'Dusk' || hud.orbitPhase === 'Dawn'
      ? '#F28C38'
      : '#FFD9A0';

  const airLabel =
    hud.airStatus === 'submerged'
      ? 'Submerged · O₂ Draining'
      : hud.airStatus === 'toxic_haze'
      ? 'Toxic Haze · Suit T2+ Needed'
      : hud.airStatus === 'pressurized'
      ? 'Pressurized Habitat Air'
      : 'Breathable Surface Air';

  const airColor =
    hud.airStatus === 'submerged'
      ? '#38BDF8'
      : hud.airStatus === 'toxic_haze'
      ? '#F59E0B'
      : '#34D399';

  const equippedSlot = hud.hotbar[hud.selectedSlot];
  const equippedItem = equippedSlot ? ITEMS[equippedSlot.itemId] : null;

  const frostAlpha = hud.stats.warmth < 38 ? Math.min(0.42, ((38 - hud.stats.warmth) / 38) * 0.42) : 0;
  const dangerAlpha = hud.stats.health < 35 ? Math.min(0.45, ((35 - hud.stats.health) / 35) * 0.45) : 0;

  // Auto-dim secondary HUD telemetry when vitals are full & safe; snap to 100% on drain or alert
  const isCalmAndFull =
    hud.stats.health > 92 &&
    hud.stats.oxygen > hud.stats.maxOxygen * 0.92 &&
    hud.stats.warmth > 88 &&
    hud.stats.hunger > 78 &&
    hud.stats.thirst > 78 &&
    !hud.underwater &&
    hud.airStatus !== 'toxic_haze' &&
    !hud.alertBanner &&
    !hud.inVehicle;

  // Player heading in degrees 0..360 (0 = -Z North, 90 = +X East / Tessara)
  const fx = -Math.sin(hud.playerPos.rotY);
  const fz = -Math.cos(hud.playerPos.rotY);
  const headingDeg = ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
  const wrapDelta = (target: number, center: number) => ((target - center + 540) % 360) - 180;

  // World compass beacons (landmarks + placed bases)
  const compassBeacons = [
    ...LANDMARKS.filter((lm) => WAYPOINT_LANDMARKS[lm.id]).map((lm) => {
      const meta = WAYPOINT_LANDMARKS[lm.id];
      const dx = lm.x - hud.playerPos.x;
      const dz = lm.z - hud.playerPos.z;
      return {
        id: lm.id,
        label: meta.short,
        color: meta.color,
        dist: Math.round(Math.hypot(dx, dz)),
        deg: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360,
      };
    }),
    ...hud.builtStructures
      .filter((s) => s.defId === 'outpost_pod_t0' || s.defId === 'hab_room_t0')
      .slice(0, 4)
      .map((s, idx) => {
        const dx = s.x - hud.playerPos.x;
        const dz = s.z - hud.playerPos.z;
        return {
          id: s.uid,
          label: s.defId === 'hab_room_t0' ? `Hab ${idx + 1}` : `Pod ${idx + 1}`,
          color: '#3DDC84',
          dist: Math.round(Math.hypot(dx, dz)),
          deg: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360,
        };
      }),
  ];

  // Inventory total lookup for Pinned Schematic Tracker
  const countOf = (itemId: string) => {
    let n = 0;
    for (const s of hud.inventory) if (s.itemId === itemId) n += s.count;
    for (const s of hud.hotbar) if (s && s.itemId === itemId) n += s.count;
    return n;
  };

  const pinnedInfo = (() => {
    if (!pinnedTarget) return null;
    if (pinnedTarget.kind === 'recipe') {
      const r = RECIPES.find((item) => item.id === pinnedTarget.id);
      if (!r) return null;
      return {
        title: r.name,
        iconId: Object.keys(r.outputs)[0],
        costs: Object.entries(r.inputs),
      };
    }
    const b = BUILDABLES[pinnedTarget.id];
    if (!b) return null;
    return {
      title: b.name,
      iconId: b.id,
      costs: Object.entries(b.cost),
    };
  })();

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Subtle Screen-Edge Environmental & Damage Feedback */}
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-200"
        style={{
          background:
            hud.damageFlash > 0.04
              ? `radial-gradient(circle at center, transparent 48%, rgba(229, 72, 77, ${Math.min(0.62, hud.damageFlash * 0.58)}) 100%)`
              : hud.underwater
              ? 'radial-gradient(circle at center, transparent 60%, rgba(16, 108, 148, 0.3) 100%)'
              : frostAlpha > 0
              ? `radial-gradient(circle at center, transparent 62%, rgba(165, 225, 255, ${frostAlpha}) 100%)`
              : dangerAlpha > 0
              ? `radial-gradient(circle at center, transparent 62%, rgba(229, 72, 77, ${dangerAlpha}) 100%)`
              : 'radial-gradient(circle at center, transparent 78%, rgba(5, 8, 15, 0.22) 100%)',
        }}
      />

      {/* Delicate Curved EVA Helmet Visor Rim */}
      {!hudHidden && (
        <svg
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          className="pointer-events-none fixed inset-0 h-full w-full opacity-60"
        >
          <path
            d="M 18 95 Q 24 22 95 16"
            fill="none"
            stroke="rgba(186, 220, 255, 0.22)"
            strokeWidth="1.4"
          />
          <path
            d="M 982 95 Q 976 22 905 16"
            fill="none"
            stroke="rgba(186, 220, 255, 0.22)"
            strokeWidth="1.4"
          />
          <path
            d="M 18 505 Q 24 578 95 584"
            fill="none"
            stroke="rgba(186, 220, 255, 0.22)"
            strokeWidth="1.4"
          />
          <path
            d="M 982 505 Q 976 578 905 584"
            fill="none"
            stroke="rgba(186, 220, 255, 0.22)"
            strokeWidth="1.4"
          />
        </svg>
      )}

      {/* Soft top & bottom gradient scrims (no boxy cards) */}
      {!hudHidden && (
        <>
          <div className="hud-scrim-top pointer-events-none fixed inset-x-0 top-0 h-28" />
          <div className="hud-scrim-bottom pointer-events-none fixed inset-x-0 bottom-0 h-44" />
        </>
      )}

      {/* TOP HUD */}
      <div className="relative flex items-start justify-between gap-4 px-5 pt-3.5">
        {/* Top-Left: Unboxed Mission & Region Telemetry (auto-fades gently when calm) */}
        {!hudHidden ? (
          <div
            className={`max-w-xs border-l-2 border-[#F2C230] pl-3 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] transition-opacity duration-500 ${
              isCalmAndFull ? 'opacity-65 hover:opacity-100' : 'opacity-100'
            }`}
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
              <span className="font-display font-bold text-[#F2C230]">{reg.name}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono-num text-slate-300">
                {hud.playerPos.x}, {hud.playerPos.y}, {hud.playerPos.z}
              </span>
            </div>
            <div className="mt-0.5 text-xs font-semibold text-white">{hud.story.questTitle}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-slate-200/85">
              {hud.story.questStep}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-medium text-slate-300/85">
              <span>{suit.name}</span>
              <span>·</span>
              <span>Max {suit.depthRating}m</span>
              {hud.nearHeater && (
                <>
                  <span>·</span>
                  <span className="text-[#FF8A3D]">Heated</span>
                </>
              )}
              {hud.insideShelter && (
                <>
                  <span>·</span>
                  <span className="text-[#3DDC84]">Sheltered</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Top-Center: Horizon Compass Tape with Live Waypoints + Orbit Bar */}
        {!hudHidden && (
          <div className="pointer-events-auto flex flex-col items-center">
            {/* Sliding Degree Compass Tape + In-World Beacons */}
            <div className="relative h-9 w-[340px] sm:w-[440px] overflow-hidden border-b border-white/15">
              <div className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-[#F2C230]" />
              {COMPASS_TICKS.map((deg) => {
                const d = wrapDelta(deg, headingDeg);
                if (Math.abs(d) > 85) return null;
                const xPct = 50 + (d / 85) * 50;
                return (
                  <div
                    key={deg}
                    className="absolute bottom-0 w-px bg-white/25"
                    style={{ left: `${xPct}%`, height: deg % 45 === 0 ? '7px' : '4px' }}
                  />
                );
              })}
              {COMPASS_MARKS.map((m) => {
                const d = wrapDelta(m.deg, headingDeg);
                if (Math.abs(d) > 82) return null;
                const xPct = 50 + (d / 85) * 50;
                const isTessara = m.deg === 90;
                return (
                  <span
                    key={m.label}
                    className={`font-display absolute top-0.5 -translate-x-1/2 text-[10px] font-bold tracking-wider whitespace-nowrap ${
                      isTessara
                        ? 'text-[#7AA2FF]'
                        : m.major
                        ? 'text-white'
                        : 'text-slate-400'
                    }`}
                    style={{ left: `${xPct}%` }}
                  >
                    {m.label}
                  </span>
                );
              })}

              {/* 3D In-World Compass Waypoint Pips */}
              {compassBeacons.map((b) => {
                if (b.dist < 16) return null;
                const d = wrapDelta(b.deg, headingDeg);
                if (Math.abs(d) > 82) return null;
                const xPct = 50 + (d / 85) * 50;
                return (
                  <div
                    key={b.id}
                    className="absolute bottom-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
                    style={{ left: `${xPct}%`, color: b.color }}
                  >
                    <span className="text-[9px] leading-none">◆</span>
                    <span className="font-mono-num text-[9px] font-semibold">
                      {b.label} {b.dist}m
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Clean Single-Line Orbit & Audio Controls */}
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-3 text-[11px] drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
              <span className="font-display font-bold uppercase tracking-wider" style={{ color: phaseColor }}>
                {hud.orbitPhase}
              </span>
              <span className="font-mono-num font-semibold text-white">
                {formatClock(hud.orbitSeconds)}
              </span>
              <span className="text-slate-300">
                {hud.orbitPhase === 'Eclipse'
                  ? 'Solar 0 kW'
                  : `Eclipse ${formatClock(hud.timeToEclipseSec)}`}
              </span>
              <span className="text-slate-500">|</span>
              <span className="font-mono-num text-[#38BDF8]">
                Tide {hud.tideOffset >= 0 ? `+${hud.tideOffset.toFixed(1)}` : hud.tideOffset.toFixed(1)}s{' '}
                {hud.tideTrend === 'rising' ? '▲' : '▼'}
              </span>
              <span className="text-slate-500">|</span>
              <div className="flex items-center gap-1">
                {[1, 8, 20].map((mult) => (
                  <button
                    key={mult}
                    onClick={() => onSetOrbitSpeed(mult)}
                    className={`chamfer-btn px-2 py-0.5 text-[10px] font-mono-num transition-colors ${
                      hud.orbitSpeedMultiplier === mult
                        ? 'bg-[#F2C230] text-slate-950 font-bold'
                        : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                    title="Orbit clock speed"
                  >
                    {mult}x
                  </button>
                ))}
                <button
                  onClick={onToggleMute}
                  className="ml-1 p-1 text-slate-300 hover:text-white"
                  title={hud.muted ? 'Unmute' : 'Mute'}
                >
                  {hud.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={onPause}
                  className="p-1 text-slate-300 hover:text-white"
                  title="Pause & Save Slots (Esc)"
                >
                  <Pause className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {(hud.inVehicle || hud.underwater) && (
              <div className="chamfer-sm mt-2 flex items-center gap-3 border border-cyan-400/40 bg-[#080C14]/88 px-3.5 py-1 text-xs">
                {hud.inVehicle && (
                  <>
                    <span className="font-display font-bold text-[#F2C230]">{hud.inVehicle.name}</span>
                    <span className="font-mono-num text-slate-200">{hud.inVehicle.speed} s/s</span>
                    <span className="text-slate-500">·</span>
                    <span
                      className={`font-mono-num ${
                        hud.inVehicle.batteryPct < 20 ? 'text-[#E5484D]' : 'text-[#3DDC84]'
                      }`}
                    >
                      Batt {hud.inVehicle.batteryPct}%
                    </span>
                  </>
                )}
                {hud.underwater && (
                  <span className="font-mono-num text-[#38BDF8]">
                    Depth {hud.depthBelowSea}m / {suit.depthRating}m
                  </span>
                )}
              </div>
            )}

            {hud.alertBanner && (
              <div
                className={`chamfer-sm mt-2 border px-4 py-1.5 text-xs font-semibold ${
                  hud.alertBanner.tone === 'danger'
                    ? 'border-[#E5484D]/80 bg-[#230B0F]/92 text-red-100'
                    : hud.alertBanner.tone === 'warning'
                    ? 'border-[#FFB020]/80 bg-[#231908]/92 text-amber-100'
                    : 'border-[#38BDF8]/70 bg-[#0A1C26]/92 text-cyan-100'
                }`}
              >
                {hud.alertBanner.text}
              </div>
            )}
          </div>
        )}

        {/* Top-Right: Cinema HUD Toggle */}
        <div className="pointer-events-auto flex items-center">
          <button
            onClick={() => setHudHidden((v) => !v)}
            className="chamfer-btn flex items-center gap-1.5 bg-[#080C14]/75 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-white/15 hover:text-white border border-white/10"
            title="Toggle Cinema HUD [H]"
          >
            {hudHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{hudHidden ? 'Show HUD [H]' : '[H]'}</span>
          </button>
        </div>
      </div>

      {/* RIGHT-SIDE PINNED SCHEMATIC TRACKER */}
      {!hudHidden && pinnedInfo && (
        <div className="pointer-events-auto fixed right-5 top-28 z-20 w-60 border-r-2 border-[#F2C230] bg-[#080D16]/78 px-3.5 py-2.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] chamfer-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Pin className="w-3.5 h-3.5 shrink-0 text-[#F2C230]" />
              <span className="truncate font-display text-xs font-bold uppercase tracking-wider text-white">
                {pinnedInfo.title}
              </span>
            </div>
            <button
              onClick={onUnpin}
              className="p-0.5 text-slate-400 hover:text-white"
              title="Unpin schematic"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <img
              src={getIsoIconDataUrl(pinnedInfo.iconId, 64)}
              alt={pinnedInfo.title}
              className="h-8 w-8 shrink-0 object-contain"
            />
            <div className="flex-1 space-y-1 text-[11px]">
              {pinnedInfo.costs.map(([id, qty]) => {
                const have = countOf(id);
                const ok = have >= qty;
                return (
                  <div key={id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-300">{ITEMS[id]?.name ?? id}</span>
                    <span
                      className={`font-mono-num font-bold ${
                        ok ? 'text-[#3DDC84]' : 'text-[#E5484D]'
                      }`}
                    >
                      {have}/{qty}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CENTER PRECISION RETICLE & INTERACTION */}
      <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center">
        <div
          className={`relative flex h-8 w-8 items-center justify-center ${
            hud.scanProgress > 0 || hud.interactionPrompt ? 'opacity-95' : 'opacity-55'
          }`}
        >
          {hud.scanProgress > 0 && (
            <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="rgba(56, 189, 248, 0.22)"
                strokeWidth="2"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.2"
                strokeDasharray={100.53}
                strokeDashoffset={100.53 * (1 - Math.min(1, hud.scanProgress))}
              />
            </svg>
          )}
          <div
            className={`h-1 w-1 ${
              hud.scanProgress > 0
                ? 'bg-[#38BDF8]'
                : hud.interactionPrompt
                ? 'bg-[#F2C230]'
                : 'bg-white'
            }`}
          />
          <div
            className={`absolute left-1 top-1 h-2 w-2 border-l border-t ${
              hud.scanProgress > 0
                ? 'border-[#38BDF8]'
                : hud.interactionPrompt
                ? 'border-[#F2C230]'
                : 'border-white/80'
            }`}
          />
          <div
            className={`absolute right-1 top-1 h-2 w-2 border-r border-t ${
              hud.scanProgress > 0
                ? 'border-[#38BDF8]'
                : hud.interactionPrompt
                ? 'border-[#F2C230]'
                : 'border-white/80'
            }`}
          />
          <div
            className={`absolute left-1 bottom-1 h-2 w-2 border-l border-b ${
              hud.scanProgress > 0
                ? 'border-[#38BDF8]'
                : hud.interactionPrompt
                ? 'border-[#F2C230]'
                : 'border-white/80'
            }`}
          />
          <div
            className={`absolute right-1 bottom-1 h-2 w-2 border-r border-b ${
              hud.scanProgress > 0
                ? 'border-[#38BDF8]'
                : hud.interactionPrompt
                ? 'border-[#F2C230]'
                : 'border-white/80'
            }`}
          />
        </div>

        {hud.scanProgress > 0 && hud.scanTargetName && (
          <div className="chamfer-sm mt-8 w-60 border border-[#38BDF8]/70 bg-[#070B13]/92 px-3.5 py-2 text-center">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wide text-[#38BDF8]">
              <span className="truncate">Scanning {hud.scanTargetName}</span>
              <span className="font-mono-num">{Math.round(hud.scanProgress * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full bg-slate-800">
              <div
                className="h-full bg-[#38BDF8]"
                style={{ width: `${Math.round(hud.scanProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {hud.buildModeId && (
          <div className="chamfer-sm mt-10 border border-[#F2C230]/70 bg-[#070B13]/92 px-4 py-1.5 text-xs text-slate-100">
            <span className={hud.buildValid ? 'text-[#3DDC84] font-bold' : 'text-[#E5484D] font-bold'}>
              {hud.buildValid ? 'Ready to Place' : 'Blocked or Missing Materials'}
            </span>
            <span className="mx-2 text-slate-500">|</span>
            <span>LMB Place · R Rotate · RMB Cancel</span>
          </div>
        )}

        {(hud.interactionPrompt || hud.dismantlePrompt) && !hud.buildModeId && (
          <div className="mt-12 flex flex-col items-center gap-1.5">
            {hud.interactionPrompt && (
              <div className="chamfer-sm border border-white/20 bg-[#070B13]/90 px-4 py-1.5 text-xs font-semibold tracking-wide text-white shadow-lg">
                {hud.interactionPrompt}
              </div>
            )}
            {hud.dismantlePrompt && (
              <div className="text-[11px] font-medium text-slate-300/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                {hud.dismantlePrompt}
              </div>
            )}
          </div>
        )}

        {hud.targetInfo && !hud.buildModeId && hud.scanProgress <= 0 && (
          <div className="mt-4 text-center drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
            <div
              className={`font-display text-xs font-bold uppercase tracking-wider ${
                hud.targetInfo.tone === 'cyan'
                  ? 'text-[#38BDF8]'
                  : hud.targetInfo.tone === 'danger'
                  ? 'text-[#FF6B6B]'
                  : hud.targetInfo.tone === 'emerald'
                  ? 'text-[#3DDC84]'
                  : 'text-[#F2C230]'
              }`}
            >
              {hud.targetInfo.title}
            </div>
            <div className="text-[11px] text-slate-200/90">{hud.targetInfo.subtitle}</div>
          </div>
        )}

        {!hud.pointerLocked && !hud.buildModeId && !hudHidden && (
          <div className="mt-20 text-[11px] font-medium text-slate-200/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
            Click viewport to lock look · Scroll wheel switches tools · F Lamp
          </div>
        )}
      </div>

      {/* BOTTOM HUD */}
      {!hudHidden && (
        <div className="relative flex items-end justify-between gap-4 px-5 pb-4">
          {/* Bottom-Left: Borderless Diegetic Radial Gauges & Auto-Fading Secondary Bars */}
          <div
            className={`pointer-events-auto w-[275px] space-y-2.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] transition-opacity duration-500 ${
              isCalmAndFull ? 'opacity-70 hover:opacity-100' : 'opacity-100'
            }`}
          >
            <div className="flex items-center gap-4">
              <RadialGauge
                pct={(hud.stats.health / hud.stats.maxHealth) * 100}
                color="#E5484D"
                label="Health"
                value={`${Math.round(hud.stats.health)}`}
                icon={<Heart className="w-4 h-4 text-[#E5484D]" />}
              />
              <RadialGauge
                pct={(hud.stats.oxygen / hud.stats.maxOxygen) * 100}
                color="#38BDF8"
                label="Air (O₂)"
                value={`${Math.round(hud.stats.oxygen)}s`}
                icon={<Wind className="w-4 h-4 text-[#38BDF8]" />}
              />
            </div>

            {/* Explicit Atmosphere / Air Requirement Readout */}
            <div
              className="flex items-center gap-2 border-l-2 pl-2 text-[11px] font-semibold"
              style={{ borderColor: airColor, color: airColor }}
            >
              <span>{airLabel}</span>
            </div>

            {/* Secondary Bars: Warmth, Food, Water, Stamina (auto-fades deeper when calm) */}
            <div
              className={`space-y-1.5 pt-0.5 text-[10px] transition-opacity duration-500 ${
                isCalmAndFull ? 'opacity-65 hover:opacity-100' : 'opacity-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 shrink-0 text-[#FF8A3D]" />
                <span className="w-12 text-slate-300">Warmth</span>
                <div className="h-1.5 flex-1 bg-white/12">
                  <div
                    className="h-full bg-[#FF8A3D]"
                    style={{
                      width: `${Math.max(0, Math.min(100, (hud.stats.warmth / hud.stats.maxWarmth) * 100))}%`,
                    }}
                  />
                </div>
                <span className="font-mono-num w-8 text-right text-slate-200">
                  {Math.round(hud.stats.warmth)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-0.5">
                <div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1">
                      <Utensils className="w-2.5 h-2.5 text-[#7BC96F]" />
                      Food
                    </span>
                    <span className="font-mono-num">{Math.round(hud.stats.hunger)}</span>
                  </div>
                  <div className="mt-1 h-1 bg-white/15">
                    <div className="h-full bg-[#7BC96F]" style={{ width: `${hud.stats.hunger}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1">
                      <Droplets className="w-2.5 h-2.5 text-[#4DA3FF]" />
                      Water
                    </span>
                    <span className="font-mono-num">{Math.round(hud.stats.thirst)}</span>
                  </div>
                  <div className="mt-1 h-1 bg-white/15">
                    <div className="h-full bg-[#4DA3FF]" style={{ width: `${hud.stats.thirst}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 text-[#F2C230]" />
                      Stam
                    </span>
                    <span className="font-mono-num">{Math.round(hud.stats.stamina)}</span>
                  </div>
                  <div className="mt-1 h-1 bg-white/15">
                    <div className="h-full bg-[#F2C230]" style={{ width: `${hud.stats.stamina}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom-Center: Chamfered Tactical Dock */}
          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            {equippedItem && (
              <div className="font-display text-xs font-semibold uppercase tracking-wider text-slate-100 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                {equippedItem.name}
              </div>
            )}

            {/* Quick System Buttons + Power/Lamp Status */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
              <button
                onClick={() => onOpenModal('inventory')}
                className="chamfer-btn flex items-center gap-1.5 bg-[#090E18]/85 px-3 py-1 text-slate-200 hover:bg-white/15 border border-white/10"
              >
                <Package className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Craft [Tab]</span>
              </button>
              <button
                onClick={() => onOpenModal('build')}
                className="chamfer-btn flex items-center gap-1.5 bg-[#090E18]/85 px-3 py-1 text-slate-200 hover:bg-white/15 border border-white/10"
              >
                <Hammer className="w-3.5 h-3.5 text-[#F2C230]" />
                <span>Build [B]</span>
              </button>
              <button
                onClick={() => onOpenModal('production')}
                className="chamfer-btn flex items-center gap-1.5 bg-[#090E18]/85 px-3 py-1 text-slate-200 hover:bg-white/15 border border-white/10"
              >
                <BatteryCharging className="w-3.5 h-3.5 text-[#3DDC84]" />
                <span>Power [P]</span>
              </button>
              <button
                onClick={() => onOpenModal('map')}
                className="chamfer-btn flex items-center gap-1.5 bg-[#090E18]/85 px-3 py-1 text-slate-200 hover:bg-white/15 border border-white/10"
              >
                <MapIcon className="w-3.5 h-3.5 text-[#E86F51]" />
                <span>Map [M]</span>
              </button>
              {hud.buildModeId && (
                <button
                  onClick={onCancelBuild}
                  className="chamfer-btn bg-red-500/30 px-3 py-1 font-semibold text-red-100 hover:bg-red-500/50"
                >
                  Cancel Build
                </button>
              )}
              <span className="hidden sm:inline-flex items-center gap-2 pl-2 text-[11px] font-mono-num text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                <span className="text-[#F2C230]">
                  {Math.round(hud.production.supplyKw)}/{Math.round(hud.production.demandKw)} kW
                </span>
                <span className="flex items-center gap-1">
                  <Flashlight className="w-3 h-3" />
                  <span className={hud.handlampOn ? 'text-amber-300' : 'text-slate-500'}>
                    {hud.handlampOn ? 'On' : 'Off'}
                  </span>
                </span>
              </span>
            </div>

            {/* 8-Slot Chamfered Hotbar */}
            <div className="flex items-center gap-1.5 pt-0.5">
              {hud.hotbar.map((slot, idx) => {
                const selected = hud.selectedSlot === idx;
                const def = slot ? ITEMS[slot.itemId] : null;
                return (
                  <button
                    key={idx}
                    onClick={() => onSelectSlot(idx)}
                    className={`chamfer-slot relative flex h-14 w-14 flex-col items-center justify-center transition-all ${
                      selected
                        ? 'bg-[#121A2A]/95 ring-1 ring-[#F2C230] -translate-y-0.5'
                        : 'bg-[#080C14]/80 hover:bg-[#101622]/90'
                    }`}
                    title={def ? `${def.name} — ${def.description}` : `Empty Slot ${idx + 1}`}
                  >
                    <span
                      className={`font-mono-num absolute left-1.5 top-0.5 text-[10px] ${
                        selected ? 'text-[#F2C230] font-bold' : 'text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    {slot && def && (
                      <>
                        <img
                          src={getIsoIconDataUrl(slot.itemId, 64)}
                          alt={def.name}
                          className="h-9 w-9 object-contain"
                        />
                        {slot.count > 1 && (
                          <span className="font-mono-num absolute bottom-1 right-1.5 text-[10px] font-bold text-white drop-shadow">
                            {slot.count}
                          </span>
                        )}
                      </>
                    )}
                    {selected && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#F2C230]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden lg:block w-[275px]" />
        </div>
      )}
    </div>
  );
};
