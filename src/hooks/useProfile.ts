"use client";

import { useState, useEffect } from "react";

export type MatchHistoryEntry = {
  id: string;
  timestamp: number;
  level: "Easy" | "Medium" | "Hard";
  mode: "solo" | "normal" | "fog" | "solver_saboteur";
  score: number;
  isWin: boolean;
};

export type ProfileData = {
  gamerName: string;
  photoDataUrl: string;
  bestScoreEasy: number;
  bestScoreMedium: number;
  bestScoreHard: number;
  totalGames: number;
  totalWins: number;
  colorBlindMode: boolean;
  audioEnabled: boolean;
  coins: number;
  inventory: {
    shield: number;
    freeze: number;
    autoMatch: number;
  };
  lastSpinTimestamp: number;
  matchHistory: MatchHistoryEntry[];
};

const DEFAULT_PROFILE: ProfileData = {
  gamerName: "Player 1",
  photoDataUrl: "",
  bestScoreEasy: 0,
  bestScoreMedium: 0,
  bestScoreHard: 0,
  totalGames: 0,
  totalWins: 0,
  colorBlindMode: false,
  audioEnabled: true,
  coins: 100, // starting coins
  inventory: {
    shield: 1,
    freeze: 1,
    autoMatch: 1,
  },
  lastSpinTimestamp: 0,
  matchHistory: [],
};

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("puzzify_profile");
    if (saved) {
      try {
        setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(saved) });
      } catch (e) {
        console.error("Failed to parse profile data");
      }
    }
    setIsLoaded(true);
  }, []);

  const updateProfile = (updates: Partial<ProfileData>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem("puzzify_profile", JSON.stringify(next));
      return next;
    });
  };

  const addCoins = (amount: number) => {
    updateProfile({ coins: profile.coins + amount });
  };

  const updateInventory = (updates: Partial<ProfileData["inventory"]>) => {
    setProfile((prev) => {
      const next: ProfileData = {
        ...prev,
        inventory: {
          ...prev.inventory,
          ...updates,
        },
      };
      localStorage.setItem("puzzify_profile", JSON.stringify(next));
      return next;
    });
  };

  const addPowerup = (type: keyof ProfileData["inventory"], amount: number = 1) => {
    setProfile((prev) => {
      const next: ProfileData = {
        ...prev,
        inventory: {
          ...prev.inventory,
          [type]: Math.max(0, prev.inventory[type] + amount),
        },
      };
      localStorage.setItem("puzzify_profile", JSON.stringify(next));
      return next;
    });
  };

  const usePowerup = (type: keyof ProfileData["inventory"]) => {
    let consumed = false;
    setProfile((prev) => {
      if (prev.inventory[type] <= 0) {
        return prev;
      }
      consumed = true;
      const next: ProfileData = {
        ...prev,
        inventory: {
          ...prev.inventory,
          [type]: prev.inventory[type] - 1,
        },
      };
      localStorage.setItem("puzzify_profile", JSON.stringify(next));
      return next;
    });
    return consumed;
  };

  const canSpin = () => {
    return Date.now() - profile.lastSpinTimestamp >= 24 * 60 * 60 * 1000;
  };

  const markSpinNow = () => {
    updateProfile({ lastSpinTimestamp: Date.now() });
  };

  const recordGame = (
    level: "Easy" | "Medium" | "Hard",
    score: number,
    isWin: boolean,
    mode: MatchHistoryEntry["mode"] = "solo"
  ) => {
    setProfile((prev) => {
      const key = `bestScore${level}` as keyof ProfileData;
      const currentBest = prev[key] as number;
      const newBest = (currentBest === 0 || score > currentBest) ? score : currentBest;
      const next: ProfileData = {
        ...prev,
        [key]: newBest,
        totalGames: prev.totalGames + 1,
        totalWins: prev.totalWins + (isWin ? 1 : 0),
        matchHistory: [
          {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            level,
            mode,
            score,
            isWin,
          },
          ...prev.matchHistory,
        ].slice(0, 10),
      };
      localStorage.setItem("puzzify_profile", JSON.stringify(next));
      return next;
    });
  };

  return {
    profile,
    updateProfile,
    addCoins,
    updateInventory,
    addPowerup,
    usePowerup,
    canSpin,
    markSpinNow,
    recordGame,
    isLoaded
  };
}
