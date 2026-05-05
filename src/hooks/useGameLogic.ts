"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { InterferencePayload } from "./useMultiplayer";
import { useAudio } from "./useAudio";

export type LevelType = "Easy" | "Medium" | "Hard";

export type TileData = {
  id: string; // unique ID
  correctIndex: number;
  currentIndex: number;
  bgPositionX: number;
  bgPositionY: number;
  isMatched: boolean;
  isError: boolean;
};

// Seeded random number generator
function seededRandom(seed: number) {
  var x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const newArray = [...array];
  let currentSeed = seed;
  for (let i = newArray.length - 1; i > 0; i--) {
    const random = seededRandom(currentSeed++);
    const j = Math.floor(random * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function useGameLogic(level: LevelType, initialSeed?: number | null, audioEnabled: boolean = true, customTimeLimit?: number | null) {
  const { playSwap, playMatch, playError, playInterference } = useAudio(audioEnabled);
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [focusMeter, setFocusMeter] = useState(0); // 0 to 100
  const [isCalmMode, setIsCalmMode] = useState(false);
  const [maxCombo, setMaxCombo] = useState(0);
  const [totalSwaps, setTotalSwaps] = useState(0);
  const [clickFrequencies, setClickFrequencies] = useState<Record<string, number>>({});

  // Callbacks for multiplayer events
  const [outgoingAttack, setOutgoingAttack] = useState<InterferencePayload | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lockRef = useRef<boolean>(false);

  const getGridConfig = useCallback(() => {
    switch (level) {
      case "Easy": return { cols: 4, size: 16 };
      case "Medium": return { cols: 6, size: 36 };
      case "Hard": return { cols: 8, size: 64 };
    }
  }, [level]);

  const getTimeLimit = useCallback(() => {
    if (customTimeLimit !== undefined && customTimeLimit !== null && customTimeLimit !== -1) {
      return customTimeLimit; // -1 means default, 0 means unlimited
    }
    switch (level) {
      case "Easy": return 0; // No limit
      case "Medium": return 120; // 2 mins
      case "Hard": return 180; // 3 mins
    }
  }, [level, customTimeLimit]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        const limit = getTimeLimit();
        if (limit > 0 && prev + 1 >= limit) {
          endGame(false);
          return limit;
        }
        return prev + 1;
      });
    }, 1000);
  }, [getTimeLimit]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const resumeTimer = useCallback(() => {
    if (isPlaying && !isGameOver) {
      startTimer();
    }
  }, [isPlaying, isGameOver, startTimer]);

  const initGame = useCallback(() => {
    const { cols, size } = getGridConfig();
    const rows = size / cols;

    // Use the provided seed for multiplayer sync, or generate a random one
    const gameSeed = initialSeed ?? Math.floor(Math.random() * 100000);
    setImageUrl(`https://picsum.photos/seed/${gameSeed}/800/800`);

    const initialTiles: TileData[] = [];
    for (let i = 0; i < size; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const bgPositionX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
      const bgPositionY = rows > 1 ? (row / (rows - 1)) * 100 : 0;

      initialTiles.push({
        id: `tile-${i}`,
        correctIndex: i,
        currentIndex: i,
        bgPositionX,
        bgPositionY,
        isMatched: false,
        isError: false,
      });
    }

    // Shuffle using the seed so both players get the exact same layout
    const indices = Array.from({ length: size }, (_, i) => i);
    let currentShuffleSeed = gameSeed;
    let shuffledIndices = seededShuffle(indices, currentShuffleSeed);
    // Ensure complete derangement: no tile is in its original position
    let preventInfiniteLoop = 0;
    while (shuffledIndices.some((val, i) => val === i) && preventInfiniteLoop < 100) {
      currentShuffleSeed++;
      shuffledIndices = seededShuffle(indices, currentShuffleSeed);
      preventInfiniteLoop++;
    }

    const jumbledTiles = initialTiles.map((tile, i) => ({
      ...tile,
      currentIndex: shuffledIndices[i],
    }));

    const sortedJumbledTiles = [...jumbledTiles].sort((a, b) => a.currentIndex - b.currentIndex);

    setTiles(sortedJumbledTiles);
    setSelectedId(null);
    setMoves(0);
    setMatches(0);
    setTimer(0);
    setScore(0);
    setCombo(0);
    setFocusMeter(0);
    setIsCalmMode(false);
    setMaxCombo(0);
    setTotalSwaps(0);
    setClickFrequencies({});
    setIsGameOver(false);
    setOutgoingAttack(null);
    setIsPlaying(true);
    lockRef.current = false;
    startTimer();
  }, [getGridConfig, initialSeed, startTimer]);

  const useHint = useCallback(() => {
    // Smart Hint: Briefly pulse edge/corner tiles that are not matched yet
    const { cols, size } = getGridConfig();
    const rows = size / cols;
    
    setTiles(prev => prev.map(t => {
      if (t.isMatched) return t;
      const col = t.correctIndex % cols;
      const row = Math.floor(t.correctIndex / cols);
      const isEdge = col === 0 || col === cols - 1 || row === 0 || row === rows - 1;
      
      if (isEdge) {
        return { ...t, isError: true }; // Reusing isError temporarily for the shake/pulse effect
      }
      return t;
    }));
    
    setTimeout(() => {
      setTiles(prev => prev.map(t => t.isMatched ? t : { ...t, isError: false }));
    }, 600);
  }, [getGridConfig]);

  useEffect(() => {
    // Only init automatically if we're not in multiplayer waiting for a seed.
    // If initialSeed is given, or if we are just playing solo (no room context in page.tsx)
    // Actually, let's just let page.tsx call initGame manually or we let this run.
    initGame();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [initialSeed, initGame]);

  const endGame = (won: boolean) => {
    setIsPlaying(false);
    setIsGameOver(true);
    if (timerRef.current) clearInterval(timerRef.current);

    if (won) {
      const timeLimit = getTimeLimit();
      const timeBonus = timeLimit > 0 ? Math.max(0, timeLimit - timer) * 10 : 0;
      const finalScore = score + timeBonus - (moves * 2) + (level === "Hard" ? 500 : 250);
      setScore(Math.max(10, finalScore));
    }
  };

  const handleSwap = (id: string) => {
    if (!isPlaying || lockRef.current) return;
    
    // Track click frequency for heatmap
    setClickFrequencies(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

    const clickedTile = tiles.find(t => t.id === id);
    if (!clickedTile || clickedTile.isMatched) return;

    // First click: select the tile
    if (!selectedId) {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(5); } catch (e) { }
      }
      playSwap();
      setSelectedId(id);
      return;
    }

    // Clicking the same tile unselects it
    if (selectedId === id) {
      playSwap();
      setSelectedId(null);
      return;
    }

    // Second click: swap
    lockRef.current = true;
    setMoves(m => m + 1);
    setTotalSwaps(prev => prev + 1);
    playSwap();
    
    const firstId = selectedId;
    const secondId = id;

    const t1 = tiles.find(t => t.id === firstId);
    const t2 = tiles.find(t => t.id === secondId);

    if (!t1 || !t2) return;

    const idx1 = t1.currentIndex;
    const idx2 = t2.currentIndex;

    setTiles(prev => {
      let updatedTiles = prev.map(t => {
        if (t.id === firstId) return { ...t, currentIndex: idx2 };
        if (t.id === secondId) return { ...t, currentIndex: idx1 };
        return t;
      });

      updatedTiles.sort((a, b) => a.currentIndex - b.currentIndex);

      let newMatchesFound = 0;
      updatedTiles = updatedTiles.map(t => {
        if ((t.id === firstId || t.id === secondId) && t.currentIndex === t.correctIndex) {
          newMatchesFound++;
          return { ...t, isMatched: true };
        }
        return t;
      });

      if (newMatchesFound > 0) {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([30, 50, 30]); } catch (e) { }
        }
        playMatch();

        // Handle Combos and Focus
        const newCombo = combo + newMatchesFound;
        setCombo(newCombo);
        setMaxCombo(prev => Math.max(prev, newCombo));
        setScore(s => s + (50 * newMatchesFound) + (newCombo * 10));

        const newFocus = Math.min(100, focusMeter + (newMatchesFound * 20));
        setFocusMeter(newFocus);

        if (newCombo >= 5 && newFocus === 100) {
          setIsCalmMode(true);
        }

        // Multiplayer Interference Logic:
        // 1) Correct placement always creates light pressure.
        // 2) Bigger combos escalate duration and intensity.
        const comboAttack: InterferencePayload | null =
          newCombo >= 5
            ? { type: "glitch", durationMs: 4200, intensity: "high" }
            : newCombo === 4
              ? { type: "shake", durationMs: 3400, intensity: "medium" }
              : newCombo === 3
                ? { type: "blur", durationMs: 2800, intensity: "medium" }
                : null;
        const baseAttack: InterferencePayload = { type: "delay", durationMs: 2200, intensity: "light" };
        setOutgoingAttack(comboAttack || baseAttack);
        playInterference();

        // Clear attack queue instantly so it can be sent again.
        setTimeout(() => setOutgoingAttack(null), 100);

        const totalMatches = updatedTiles.filter(t => t.isMatched).length;
        setMatches(totalMatches);
        if (totalMatches === getGridConfig().size) {
          endGame(true);
        }
      } else {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate(100); } catch (e) { }
        }
        playError();
        
        setCombo(0);
        if (focusMeter > 0) setFocusMeter(Math.max(0, focusMeter - 10));
        if (isCalmMode) setIsCalmMode(false);

        // Mark as error briefly
        updatedTiles = updatedTiles.map(t =>
          t.id === firstId || t.id === secondId ? { ...t, isError: true } : t
        );
      }

      return updatedTiles;
    });

    setSelectedId(null);

    // Clear error state after a split second
    setTimeout(() => {
      setTiles(prev => prev.map(t => ({ ...t, isError: false })));
      lockRef.current = false;
    }, 400);
  };

  const autoMatch = useCallback(() => {
    if (!isPlaying || lockRef.current) return;
    
    setTiles(prev => {
      const unmatched = prev.filter(t => !t.isMatched);
      if (unmatched.length < 2) return prev;
      
      const t1 = unmatched[0];
      const t2 = prev.find(t => t.currentIndex === t1.correctIndex);
      
      if (!t2 || t1.id === t2.id) return prev;

      const idx1 = t1.currentIndex;
      const idx2 = t2.currentIndex;

      let updatedTiles = prev.map(t => {
        if (t.id === t1.id) return { ...t, currentIndex: idx2 };
        if (t.id === t2.id) return { ...t, currentIndex: idx1 };
        return t;
      });

      updatedTiles.sort((a, b) => a.currentIndex - b.currentIndex);

      let newMatchesFound = 0;
      updatedTiles = updatedTiles.map(t => {
        if ((t.id === t1.id || t.id === t2.id) && t.currentIndex === t.correctIndex) {
          newMatchesFound++;
          return { ...t, isMatched: true };
        }
        return t;
      });

      if (newMatchesFound > 0) {
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([30, 50, 30]); } catch (e) { }
        }
        playMatch();
        setScore(s => s + (50 * newMatchesFound));
        
        const totalMatches = updatedTiles.filter(t => t.isMatched).length;
        setMatches(totalMatches);
        if (totalMatches === getGridConfig().size) {
          endGame(true);
        }
      }
      return updatedTiles;
    });
  }, [isPlaying, getGridConfig, playMatch]);

  return {
    tiles,
    moves,
    timer,
    matches,
    score,
    combo,
    focusMeter,
    isCalmMode,
    isPlaying,
    isGameOver,
    selectedId,
    outgoingAttack,
    maxCombo,
    totalSwaps,
    clickFrequencies,
    handleSwap,
    autoMatch,
    initGame,
    pauseTimer,
    resumeTimer,
    useHint,
    timeLimit: getTimeLimit(),
    imageUrl,
    getGridConfig,
    progressPercentage: Math.round((matches / getGridConfig().size) * 100)
  };
}
