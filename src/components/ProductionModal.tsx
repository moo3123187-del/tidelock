import React from 'react';
import { X, Zap, BatteryCharging } from 'lucide-react';
import { HudSnapshot } from '../game/types';

interface ProductionModalProps {
  hud: HudSnapshot;
  onClose: () => void;
}

export const ProductionModal: React.FC<ProductionModalProps> = ({ hud, onClose }) => {
  const { production } = hud;
  const pctStored =
    production.capacityKws > 0
      ? Math.round((production.storedKws / production.capacityKws) * 100)
      : 0;

  return (
    <div className="pda-backdrop fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="chamfer-panel tactical-grid w-[560px] max-w-full border border-white/20 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/12 px-7 py-4">
          <div className="flex items-center gap-2 border-l-2 border-[#3DDC84] pl-3">
            <Zap className="w-4 h-4 text-[#F2C230]" />
            <h2 className="font-display text-base font-bold uppercase tracking-wider text-white">
              Power Grid &amp; Production
            </h2>
          </div>
          <button
            onClick={onClose}
            className="chamfer-btn border border-white/12 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 p-6 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Supply</div>
              <div className="font-mono-num mt-1 text-xl font-bold text-[#3DDC84]">
                {Math.round(production.supplyKw)} kW
              </div>
            </div>
            <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Demand</div>
              <div className="font-mono-num mt-1 text-xl font-bold text-[#F2C230]">
                {Math.round(production.demandKw)} kW
              </div>
            </div>
            <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Satisfaction</div>
              <div className="font-mono-num mt-1 text-xl font-bold text-[#38BDF8]">
                {Math.round(production.satisfaction * 100)}%
              </div>
            </div>
          </div>

          <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-white">
                <BatteryCharging className="w-4 h-4 text-[#F2C230]" />
                Battery Reserve
              </span>
              <span className="font-mono-num font-semibold text-[#F2C230]">
                {Math.round(production.storedKws)} / {Math.round(production.capacityKws)} kWs ({pctStored}%)
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full bg-white/10">
              <div className="h-full bg-[#F2C230] transition-all" style={{ width: `${pctStored}%` }} />
            </div>
            <div className="mt-2.5 text-slate-300">
              {production.demandKw > production.supplyKw
                ? `Eclipse endurance at current deficit: ${production.eclipseEnduranceSec}s (Full Eclipse = 600s)`
                : 'Net power surplus — battery banks charging'}
            </div>
          </div>

          <div className="chamfer-sm border border-white/10 bg-[#0D1422]/85 p-4">
            <div className="mb-2.5 font-bold uppercase tracking-wider text-white">Machine Telemetry</div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(production.machineCounts).map(([state, count]) => (
                <div
                  key={state}
                  className="chamfer-slot flex items-center justify-between border border-white/10 bg-black/30 px-3 py-2"
                >
                  <span className="text-slate-300">{state}</span>
                  <span className="font-mono-num font-bold text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
