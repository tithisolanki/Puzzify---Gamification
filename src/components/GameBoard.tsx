"use client";

import { Tile } from "./Tile";
import { TileData } from "../hooks/useGameLogic";

interface GameBoardProps {
  tiles: TileData[];
  onTileClick: (id: string) => void;
  colorBlindMode?: boolean;
  imageUrl: string;
  gridConfig: { cols: number; size: number };
  selectedId: string | null;
}

export function GameBoard({ tiles, onTileClick, colorBlindMode, imageUrl, gridConfig, selectedId }: GameBoardProps) {
  const getGridColsClass = () => {
    if (gridConfig.cols === 4) return "grid-cols-4";
    if (gridConfig.cols === 6) return "grid-cols-6";
    if (gridConfig.cols === 8) return "grid-cols-8";
    return "grid-cols-4";
  };

  const rows = gridConfig.size / gridConfig.cols;

  return (
    <div className="w-full h-full p-2 bg-white/5 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/10 flex flex-col items-center">
      <div className={`w-full aspect-square grid gap-1 sm:gap-2 ${getGridColsClass()}`}>
        {tiles.map((tile) => (
          <Tile
            key={tile.id}
            id={tile.id}
            bgPositionX={tile.bgPositionX}
            bgPositionY={tile.bgPositionY}
            imageUrl={imageUrl}
            cols={gridConfig.cols}
            rows={rows}
            isSelected={selectedId === tile.id}
            isMatched={tile.isMatched}
            isError={tile.isError}
            onClick={() => onTileClick(tile.id)}
            colorBlindMode={colorBlindMode}
          />
        ))}
      </div>
    </div>
  );
}
