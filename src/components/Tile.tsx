"use client";

import { Check } from "lucide-react";
import { useState, useEffect } from "react";

interface TileProps {
  id: string;
  bgPositionX: number;
  bgPositionY: number;
  imageUrl: string;
  cols: number;
  rows: number;
  isSelected: boolean;
  isMatched: boolean;
  isError: boolean;
  onClick: (id: string) => void;
  colorBlindMode?: boolean;
}

export function Tile({ id, bgPositionX, bgPositionY, imageUrl, cols, rows, isSelected, isMatched, isError, onClick, colorBlindMode }: TileProps) {
  const [ripple, setRipple] = useState(false);

  const handleClick = () => {
    setRipple(true);
    setTimeout(() => setRipple(false), 600);
    onClick(id);
  };

  return (
    <div 
      className={`relative w-full aspect-square cursor-pointer transition-all duration-500 ease-in-out 
        ${isSelected ? 'scale-95 shadow-[0_0_20px_rgba(255,77,157,1)] z-20' : ''} 
        ${isError ? 'shake-error' : ''} 
        ${isMatched ? 'animate-pulse-glow z-10 pointer-events-none' : 'hover:-translate-y-1 hover:shadow-lg hover:z-30'}`}
      onClick={handleClick}
      style={{
        transformStyle: 'preserve-3d'
      }}
    >
      <div className={`absolute inset-0 rounded-xl overflow-hidden flex items-center justify-center transition-all duration-300
        ${isSelected ? 'border-2 border-[var(--accent)]' : isMatched ? 'border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border border-white/20 glass-panel'}`}>
        
        <div 
          className="w-full h-full transition-opacity duration-300"
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: `${cols * 100}% ${rows * 100}%`,
            backgroundPosition: `${bgPositionX}% ${bgPositionY}%`,
            backgroundRepeat: "no-repeat",
            opacity: isMatched ? 1 : 0.9
          }}
        />
        
        {/* Color-blind overlay pattern */}
        {colorBlindMode && !isMatched && (
          <div className="absolute inset-0 pointer-events-none flex flex-wrap p-1 opacity-40 mix-blend-overlay">
             <div className="w-1/2 h-1/2 border border-white/50" />
             <div className="w-1/2 h-1/2 border border-white/50" />
             <div className="w-1/2 h-1/2 border border-white/50" />
             <div className="w-1/2 h-1/2 border border-white/50" />
          </div>
        )}

        {/* Ripple effect */}
        {ripple && (
          <span className="absolute w-full h-full bg-white/40 rounded-full pointer-events-none animate-ripple"></span>
        )}

        {/* Match Checkmark Overlay */}
        {isMatched && (
          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center pointer-events-none">
            <Check className="text-white drop-shadow-md opacity-80" size={32} />
          </div>
        )}
      </div>
    </div>
  );
}
