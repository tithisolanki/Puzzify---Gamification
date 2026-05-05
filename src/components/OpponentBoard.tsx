"use client";

interface OpponentBoardProps {
  cols: number;
  size: number;
  imageUrl: string;
  matchedIndices: number[];
}

export function OpponentBoard({ cols, size, imageUrl, matchedIndices }: OpponentBoardProps) {
  const getGridColsClass = () => {
    if (cols === 4) return "grid-cols-4";
    if (cols === 6) return "grid-cols-6";
    if (cols === 8) return "grid-cols-8";
    return "grid-cols-4";
  };

  const rows = size / cols;

  return (
    <div className="w-full aspect-square bg-black/50 rounded-xl overflow-hidden shadow-inner border border-white/10 p-1 relative">
      <div className={`w-full h-full grid gap-0.5 ${getGridColsClass()}`}>
        {Array.from({ length: size }).map((_, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const bgPositionX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
          const bgPositionY = rows > 1 ? (row / (rows - 1)) * 100 : 0;
          
          const isMatched = matchedIndices.includes(i);

          return (
            <div key={i} className="relative w-full h-full overflow-hidden rounded-sm bg-white/5 border border-white/5">
              <div 
                className={`absolute inset-0 transition-all duration-700 ease-out ${isMatched ? 'opacity-90 blur-lg scale-100' : 'opacity-20 blur-sm scale-110 grayscale'}`}
                style={{
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  backgroundPosition: `${bgPositionX}% ${bgPositionY}%`,
                }}
              />
              {/* Flash effect on newly matched tiles */}
              {isMatched && (
                <div className="absolute inset-0 bg-green-400 animate-ping opacity-0" style={{ animationDuration: '1s', animationIterationCount: 1 }}></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
