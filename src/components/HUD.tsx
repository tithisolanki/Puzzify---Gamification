"use client";

import { formatTime } from "../utils/helpers";
import { Trophy, Zap, Clock, Maximize2, Crosshair } from "lucide-react";

interface HUDProps {
  score: number;
  moves: number;
  timer: number;
  timeLimit: number;
  combo: number;
  accuracy: number;
}

export function HUD({ score, moves, timer, timeLimit, combo, accuracy }: HUDProps) {
  const isTimeLow = timeLimit > 0 && timeLimit - timer <= 30;

  return (
    <div className="w-full mx-auto mb-6 p-4 bg-white/10 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 flex flex-col md:flex-row justify-between items-center gap-4">
      
      {/* Stats Left */}
      <div className="flex gap-4 md:gap-6">
        <div className="flex flex-col items-center">
          <span className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">Score</span>
          <div className="flex items-center gap-1 md:gap-2 text-xl md:text-2xl font-black text-[var(--accent)]">
            <Trophy size={18} />
            {score}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">Moves</span>
          <div className="flex items-center gap-1 md:gap-2 text-xl md:text-2xl font-black text-white">
            <Maximize2 size={18} className="text-purple-400" />
            {moves}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">Acc %</span>
          <div className="flex items-center gap-1 md:gap-2 text-xl md:text-2xl font-black text-emerald-400">
            <Crosshair size={18} />
            {accuracy}%
          </div>
        </div>
      </div>

      {/* Center: Timer & Combo */}
      <div className="flex flex-col items-center flex-1">
        <div className={`text-3xl font-black tabular-nums tracking-tight transition-colors duration-300 ${isTimeLow ? 'text-red-500 animate-pulse' : 'text-white'}`}>
          <Clock size={24} className="inline mr-2 opacity-50" />
          {timeLimit > 0 ? formatTime(timeLimit - timer) : formatTime(timer)}
        </div>
        <div className="h-6 mt-1 flex items-center justify-center">
          {combo > 1 && (
            <div className="text-[var(--accent)] font-bold text-sm flex items-center animate-bounce bg-white/10 px-3 py-0.5 rounded-full border border-[var(--accent)]/30">
              <Zap size={14} className="mr-1" />
              COMBO x{combo}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
