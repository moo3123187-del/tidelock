import React from 'react';
import { X, Wind } from 'lucide-react';
import { LANDMARKS, WORLD_SEMI_X, WORLD_SEMI_Z } from '../game/config';
import { HudSnapshot } from '../game/types';

interface WorldMapModalProps {
  hud: HudSnapshot;
  onClose: () => void;
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({ hud, onClose }) => {
  const mapW = 760;
  const mapH = 440;

  const toMapX = (wx: number) => ((wx + WORLD_SEMI_X) / (WORLD_SEMI_X * 2)) * mapW;
  const toMapY = (wz: number) => ((wz + WORLD_SEMI_Z) / (WORLD_SEMI_Z * 2)) * mapH;

  return (
    <div className="pda-backdrop fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="chamfer-panel tactical-grid w-[840px] max-w-full border border-white/20 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/12 px-7 py-4">
          <div className="border-l-2 border-[#E86F51] pl-3">
            <h2 className="font-display text-base font-bold uppercase tracking-wider text-white">
              Orrin Orbital Cartography
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              +X (East) faces Tessara · -X (West) is Far Side Dark · Hatched zones require O₂ tanks
            </p>
          </div>
          <button
            onClick={onClose}
            className="chamfer-btn border border-white/12 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          <div
            className="chamfer-sm relative mx-auto overflow-hidden border border-white/15 bg-[#060911]"
            style={{ width: '100%', maxWidth: mapW }}
          >
            <svg viewBox={`0 0 ${mapW} ${mapH}`} className="block h-auto w-full">
              <defs>
                <clipPath id="orrinEllipse">
                  <ellipse cx={mapW / 2} cy={mapH / 2} rx={mapW * 0.48} ry={mapH * 0.47} />
                </clipPath>
                <pattern id="airHazardHatch" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="12" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.22" />
                </pattern>
              </defs>

              <g clipPath="url(#orrinEllipse)">
                <rect x={0} y={0} width={toMapX(-1040)} height={mapH} fill="#0B2233" />
                <rect x={toMapX(-1040)} y={0} width={toMapX(-420) - toMapX(-1040)} height={mapH} fill="#141428" />
                <rect x={toMapX(-420)} y={0} width={toMapX(380) - toMapX(-420)} height={mapH} fill="#5C3227" />
                <rect x={toMapX(380)} y={0} width={toMapX(960) - toMapX(380)} height={mapH} fill="#8C7B5C" />
                <rect x={toMapX(960)} y={0} width={mapW - toMapX(960)} height={mapH} fill="#0E4A5A" />
                <rect
                  x={toMapX(-700)}
                  y={toMapY(340)}
                  width={toMapX(340) - toMapX(-700)}
                  height={mapH - toMapY(340)}
                  fill="#4B5563"
                  opacity={0.78}
                />

                <rect x={0} y={0} width={toMapX(-420)} height={mapH} fill="url(#airHazardHatch)" />
                <rect x={toMapX(920)} y={0} width={mapW - toMapX(920)} height={mapH} fill="url(#airHazardHatch)" />

                <ellipse
                  cx={toMapX(1260)}
                  cy={toMapY(0)}
                  rx={42}
                  ry={58}
                  fill="#041922"
                  stroke="#38BDF8"
                  strokeOpacity={0.45}
                  strokeWidth={1.2}
                />
              </g>

              <ellipse
                cx={mapW / 2}
                cy={mapH / 2}
                rx={mapW * 0.48}
                ry={mapH * 0.47}
                fill="none"
                stroke="#7AA2FF"
                strokeWidth={1.6}
              />

              <text x={toMapX(-730)} y={42} textAnchor="middle" fontSize="10" fill="#A78BFA" fontWeight="600">
                FAR SIDE DARK (O₂ / Suit T2+)
              </text>
              <text x={toMapX(-20)} y={42} textAnchor="middle" fontSize="10" fill="#FCA5A5" fontWeight="600">
                TERMINATOR BELT (Breathable)
              </text>
              <text x={toMapX(650)} y={42} textAnchor="middle" fontSize="10" fill="#FDE68A" fontWeight="600">
                PLAINS (Breathable)
              </text>
              <text x={toMapX(1180)} y={42} textAnchor="middle" fontSize="10" fill="#38BDF8" fontWeight="600">
                NEAR SEA (O₂ Underwater)
              </text>

              {hud.builtStructures.map((s) => (
                <rect
                  key={s.uid}
                  x={toMapX(s.x) - 3}
                  y={toMapY(s.z) - 3}
                  width={6}
                  height={6}
                  fill="#3DDC84"
                />
              ))}

              {hud.vehiclesSummary.map((v) => (
                <polygon
                  key={v.uid}
                  points={`${toMapX(v.x)},${toMapY(v.z) - 5} ${toMapX(v.x) + 5},${toMapY(v.z) + 4} ${toMapX(v.x) - 5},${toMapY(v.z) + 4}`}
                  fill="#F2C230"
                />
              ))}

              {LANDMARKS.map((lm) => {
                const lx = toMapX(lm.x);
                const ly = toMapY(lm.z);
                const discovered = hud.discoveredLandmarks.includes(lm.id);
                return (
                  <g key={lm.id}>
                    <circle
                      cx={lx}
                      cy={ly}
                      r={4.5}
                      fill={discovered ? '#38BDF8' : '#F28C38'}
                      stroke="#0B0E15"
                      strokeWidth={1.5}
                    />
                    <text
                      x={lx + 8}
                      y={ly + 3}
                      fontSize="10"
                      fill="#F1F5F9"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                    >
                      {lm.name.split(' (')[0]}
                    </text>
                  </g>
                );
              })}

              <circle
                cx={toMapX(hud.playerPos.x)}
                cy={toMapY(hud.playerPos.z)}
                r={6}
                fill="#FFFFFF"
                stroke="#E5484D"
                strokeWidth={2.5}
              />
            </svg>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#E5484D] bg-white" />
                You
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#38BDF8]" />
                Discovered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 bg-[#3DDC84]" />
                Built
              </span>
              <span className="flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-[#38BDF8]" />
                Hatched = O₂ Required
              </span>
            </div>
            <span className="font-mono-num text-[#7AA2FF]">Tessara Sub-Planet Pole → (+X)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
