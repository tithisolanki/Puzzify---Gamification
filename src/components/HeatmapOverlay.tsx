"use client";

interface HeatmapOverlayProps {
  cols: number;
  size: number;
  clickFrequencies: Record<string, number>;
}

export function HeatmapOverlay({ cols, size, clickFrequencies }: HeatmapOverlayProps) {
  // Find max clicks to normalize the intensity
  const maxClicks = Math.max(1, ...Object.values(clickFrequencies));

  const getGridColsClass = () => {
    if (cols === 4) return "grid-cols-4";
    if (cols === 6) return "grid-cols-6";
    if (cols === 8) return "grid-cols-8";
    return "grid-cols-4";
  };

  const getHeatColor = (clicks: number) => {
    if (clicks === 0) return "rgba(0, 0, 0, 0.5)"; // Default cool
    
    const intensity = clicks / maxClicks;
    // Cold (blue) -> Warm (yellow) -> Hot (red)
    if (intensity < 0.3) return `rgba(59, 130, 246, 0.6)`; // Blue
    if (intensity < 0.7) return `rgba(234, 179, 8, 0.6)`; // Yellow
    return `rgba(239, 68, 68, 0.8)`; // Red
  };

  return (
    <div className="absolute inset-0 z-50 rounded-2xl overflow-hidden pointer-events-none">
      <div className={`w-full h-full grid gap-1 sm:gap-2 p-2 ${getGridColsClass()}`}>
        {Array.from({ length: size }).map((_, i) => {
          const tileId = `tile-${i}`;
          const clicks = clickFrequencies[tileId] || 0;
          return (
            <div 
              key={i} 
              className="w-full h-full rounded-xl flex items-center justify-center transition-colors duration-1000"
              style={{ backgroundColor: getHeatColor(clicks) }}
            >
              {clicks > 0 && <span className="text-white font-black text-xs opacity-70">{clicks}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
