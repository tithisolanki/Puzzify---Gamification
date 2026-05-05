"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { GameBoard } from "@/components/GameBoard";
import { OpponentBoard } from "@/components/OpponentBoard";
import { HeatmapOverlay } from "@/components/HeatmapOverlay";
import { HUD } from "@/components/HUD";
import { LevelType, TileData, useGameLogic } from "@/hooks/useGameLogic";
import { useProfile } from "@/hooks/useProfile";
import { GameMode, useMultiplayer } from "@/hooks/useMultiplayer";
import { Settings, ShoppingCart, User, Crown, Activity, EyeOff, Volume2, Star, Target, Lightbulb, Users, ShieldAlert, Zap, Pause, ArrowLeft, BookOpen, Map, Hash, DoorOpen, Globe, Camera, CameraOff, Shield, Snowflake, Wand2 } from "lucide-react";

type Screen = "Menu" | "MultiplayerMenu" | "RoomLobby" | "Matchmaking" | "Play" | "Settings" | "Store" | "Profile" | "Manual";
const MODE_CARDS: { id: GameMode; title: string; description: string }[] = [
  {
    id: "normal",
    title: "Normal Mode",
    description: "Classic race with adaptive interference and full board visibility."
  },
  {
    id: "fog",
    title: "Fog-of-War Mode",
    description: "Only a spotlight around your active tile is visible. Memory matters."
  },
  {
    id: "solver_saboteur",
    title: "Solver vs Saboteur",
    description: "One solves while the other disrupts with tactical sabotage abilities."
  }
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("Menu");
  const [level, setLevel] = useState<LevelType>("Medium");
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [matchmakingDifficulty, setMatchmakingDifficulty] = useState<LevelType | "Random">("Random");
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [selectedSabotageAction, setSelectedSabotageAction] = useState<"lock_tile" | "fake_highlight" | "invert_controls" | null>(null);
  const [lockedTileId, setLockedTileId] = useState<string | null>(null);
  const [lockedTileMovesRemaining, setLockedTileMovesRemaining] = useState(0);
  const [fakeHighlightIds, setFakeHighlightIds] = useState<string[]>([]);
  const [invertMovesRemaining, setInvertMovesRemaining] = useState(0);
  const [allInterferenceUntil, setAllInterferenceUntil] = useState(0);
  const [inputDelayUntil, setInputDelayUntil] = useState(0);
  const [localCameraEnabled, setLocalCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [sabotageCooldownUntil, setSabotageCooldownUntil] = useState(0);
  const [activeShield, setActiveShield] = useState(false);
  const [shieldAbsorbing, setShieldAbsorbing] = useState(false);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [powerupCooldown, setPowerupCooldown] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const autoCameraStartedRef = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasRecordedGameRef = useRef(false);

  const { profile, updateProfile, recordGame, isLoaded } = useProfile();
  const mp = useMultiplayer();

  // Initialize game logic with seed, audio settings, and custom time limits
  // If multiplayer, we rely on mp.actualLevel for the exact difficulty
  const gameLevel = isMultiplayer && mp.actualLevel ? mp.actualLevel : level;
  const game = useGameLogic(gameLevel, isMultiplayer ? mp.seed : null, profile.audioEnabled, isMultiplayer ? mp.customTimeLimit : null);

  // Derived metrics
  const myMatchedIndices = game.tiles.filter(t => t.isMatched).map(t => t.correctIndex);
  const accuracy = game.totalSwaps > 0 ? Math.round((game.matches / game.totalSwaps) * 100) : 0;
  const isFrozen = Date.now() < frozenUntil;
  const canSolve = (!isMultiplayer || mp.activeMode !== "solver_saboteur" || mp.myRole === "solver") && !isFrozen;
  const isInverted = invertMovesRemaining > 0;
  const currentMillis = nowMs;
  const isFullInterferenceBurst = nowMs < allInterferenceUntil;
  const boardTiles: TileData[] = isMultiplayer && mp.activeMode === "solver_saboteur" && mp.myRole === "saboteur" && mp.opponentTileSnapshot?.length
    ? (mp.opponentTileSnapshot as TileData[])
    : game.tiles;
  const playerInitials = profile.gamerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "P1";

  // Final Score logic
  const cognitiveScore = Math.max(0, game.score + (accuracy * 10) + (game.maxCombo * 50));

  useEffect(() => {
    // If waiting finishes and we get a room via matchmaking or private start
    if ((screen === "Matchmaking" || screen === "RoomLobby") && mp.room && mp.seed) {
      setScreen("Play");
    }
  }, [screen, mp.room, mp.seed]);

  useEffect(() => {
    // Transition to Room Lobby when successfully created/joined
    if (mp.roomCode) {
      setScreen("RoomLobby");
    }
  }, [mp.roomCode]);

  useEffect(() => {
    // Sync progress outwards
    if (isMultiplayer && game.isPlaying) {
      const status = mp.activeMode === "solver_saboteur" && mp.myRole === "saboteur"
        ? "Opponent is sabotaging..."
        : "Opponent is solving...";
      const tileSnapshot = mp.activeMode === "solver_saboteur" && mp.myRole === "solver" ? game.tiles : null;
      mp.sendProgress(game.progressPercentage, myMatchedIndices, status, tileSnapshot);
    }
  }, [game.progressPercentage, isMultiplayer, game.isPlaying, mp, myMatchedIndices, mp.activeMode, mp.myRole, game.tiles]);

  useEffect(() => {
    // Sync attacks outwards
    if (isMultiplayer && game.outgoingAttack) {
      if (
        mp.activeMode === "solver_saboteur" &&
        game.outgoingAttack.type === "delay" &&
        game.outgoingAttack.intensity === "light"
      ) {
        return;
      }
      mp.sendInterference(game.outgoingAttack);
    }
  }, [game.outgoingAttack, isMultiplayer, mp, mp.activeMode]);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isMultiplayer || !mp.activeSabotage) return;
    const { actionType, payload } = mp.activeSabotage;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (actionType === "lock_tile" && payload?.tileId) {
      setLockedTileId(payload.tileId);
      setLockedTileMovesRemaining(payload.movesCount || 3);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (actionType === "fake_highlight") {
      setFakeHighlightIds(payload?.tileIds || []);
      setTimeout(() => setFakeHighlightIds([]), payload?.durationMs || 1800);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (actionType === "invert_controls") {
      setInvertMovesRemaining(1);
      setAllInterferenceUntil(Date.now() + (payload?.burstMs || 2400));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (actionType === "input_delay") {
      setInputDelayUntil(Date.now() + (payload?.durationMs || 1800));
    }
  }, [isMultiplayer, mp.activeSabotage]);

  useEffect(() => {
    if (!isMultiplayer || !mp.activePowerupAction) return;
    const { actionType, payload } = mp.activePowerupAction;
    if (actionType === "freeze") {
      setFrozenUntil(Date.now() + (payload?.durationMs || 5000));
    }
  }, [isMultiplayer, mp.activePowerupAction]);

  useEffect(() => {
    if (mp.activeInterference && activeShield) {
      setActiveShield(false);
      setShieldAbsorbing(true);
      setTimeout(() => setShieldAbsorbing(false), 1500);
    }
  }, [mp.activeInterference, activeShield]);

  useEffect(() => {
    if (!isMultiplayer || !mp.isLiveCaptureEnabled || !localCameraEnabled) return;
    if (!localVideoRef.current || !captureCanvasRef.current) return;

    const interval = setInterval(() => {
      const video = localVideoRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 224;
      canvas.height = 126;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameData = canvas.toDataURL("image/jpeg", 0.55);
      mp.sendVideoFrame(frameData);
    }, 700);

    return () => clearInterval(interval);
  }, [isMultiplayer, mp.isLiveCaptureEnabled, mp.sendVideoFrame, localCameraEnabled]);

  useEffect(() => {
    if (screen !== "Play" || !isMultiplayer || !mp.isLiveCaptureEnabled || localCameraEnabled || autoCameraStartedRef.current) return;
    autoCameraStartedRef.current = true;
    startCamera();
  }, [screen, isMultiplayer, mp.isLiveCaptureEnabled, localCameraEnabled]);

  useEffect(() => {
    if (!canSolve) return;
    if (game.moves <= 0) return;
    if (lockedTileMovesRemaining > 0) {
      setLockedTileMovesRemaining((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) {
          setLockedTileId(null);
        }
        return next;
      });
    }
    if (invertMovesRemaining > 0) {
      setInvertMovesRemaining((prev) => Math.max(0, prev - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.moves]);

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    // Sync win condition
    if (isMultiplayer && game.isGameOver && game.matches === game.getGridConfig().size) {
      mp.notifyWin();
    }
  }, [game.isGameOver, game.matches, game.getGridConfig, isMultiplayer, mp]);

  useEffect(() => {
    if (!isMultiplayer) return;
    if (!(game.isGameOver || mp.opponentWon)) {
      hasRecordedGameRef.current = false;
      return;
    }
    if (hasRecordedGameRef.current) return;
    const didWin = game.isGameOver && !mp.opponentWon;
    const mode = isMultiplayer ? mp.activeMode : "solo";
    recordGame(gameLevel, cognitiveScore, didWin, mode);
    hasRecordedGameRef.current = true;
  }, [isMultiplayer, game.isGameOver, mp.opponentWon, gameLevel, cognitiveScore, recordGame, mp.activeMode]);

  if (!isLoaded) return <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-white">Loading...</div>;

  const startSoloGame = (selectedLevel: LevelType) => {
    setIsMultiplayer(false);
    setLevel(selectedLevel);
    setIsPaused(false);
    setShowHeatmap(false);
    setScreen("Play");
    game.initGame();
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera is not supported in this browser.");
        setLocalCameraEnabled(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 180, frameRate: { ideal: 15, max: 24 } },
        audio: false
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }
      setCameraError(null);
      setLocalCameraEnabled(true);
    } catch {
      setCameraError("Camera permission denied or unavailable.");
      setLocalCameraEnabled(false);
    }
  };

  const handlePhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile({ photoDataUrl: String(reader.result || "") });
    };
    reader.readAsDataURL(file);
  };

  const stopCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setLocalCameraEnabled(false);
    autoCameraStartedRef.current = false;
  };

  const handleBoardTileClick = (id: string) => {
    setActiveTileId(id);
    if (isMultiplayer && mp.activeMode === "solver_saboteur" && mp.myRole === "saboteur") {
      if (selectedSabotageAction === "lock_tile") {
        triggerSabotage("lock_tile", id);
      } else if (selectedSabotageAction === "fake_highlight") {
        triggerSabotage("fake_highlight", id);
      }
      return;
    }
    if (!canSolve) return;
    if (lockedTileId === id) return;
    const clickAction = () => {
      if (!isInverted) {
        game.handleSwap(id);
        return;
      }
      const match = id.match(/tile-(\d+)/);
      if (match) {
        const idx = parseInt(match[1], 10);
        const size = game.getGridConfig().size;
        game.handleSwap(`tile-${size - 1 - idx}`);
      } else {
        game.handleSwap(id);
      }
    };
    if (Date.now() < inputDelayUntil) {
      setTimeout(clickAction, 180);
      return;
    }
    clickAction();
  };

  const triggerSabotage = (
    actionType: "lock_tile" | "fake_highlight" | "invert_controls" | "input_delay",
    targetTileId?: string
  ) => {
    if (Date.now() < sabotageCooldownUntil || !isMultiplayer || mp.myRole !== "saboteur" || mp.activeSabotage) return;
    setSabotageCooldownUntil(Date.now() + 5000);
    if (actionType === "lock_tile") {
      if (!targetTileId) return;
      mp.sendSabotageAction({ actionType, payload: { tileId: targetTileId, movesCount: 3 } });
      setSelectedSabotageAction(null);
      return;
    }
    if (actionType === "fake_highlight") {
      const board = mp.opponentTileSnapshot?.length ? (mp.opponentTileSnapshot as TileData[]) : game.tiles;
      const base = targetTileId ? [targetTileId] : [];
      const rest = board
        .filter((t) => !t.isMatched && !base.includes(t.id))
        .slice(0, 2)
        .map((t) => t.id);
      const wrongTiles = [...base, ...rest];
      mp.sendSabotageAction({ actionType, payload: { tileIds: wrongTiles, durationMs: 1800 } });
      setSelectedSabotageAction(null);
      return;
    }
    if (actionType === "invert_controls") {
      mp.sendSabotageAction({ actionType, payload: { movesCount: 1, burstMs: 2500 } });
      return;
    }
    mp.sendSabotageAction({ actionType, payload: { durationMs: 1800 } });
  };

  const startPublicMatchmaking = () => {
    setIsMultiplayer(true);
    setIsPaused(false);
    setShowHeatmap(false);
    setScreen("Matchmaking");
    mp.joinMatchmaking(matchmakingDifficulty);
  };

  const handleCreateRoom = () => {
    setIsMultiplayer(true);
    setIsPaused(false);
    setShowHeatmap(false);
    mp.createPrivateRoom();
  };

  const handleJoinRoom = () => {
    if (joinCodeInput.trim().length === 6) {
      setIsMultiplayer(true);
      setIsPaused(false);
      setShowHeatmap(false);
      mp.joinPrivateRoom(joinCodeInput.trim());
    }
  };

  const handlePause = () => {
    setIsPaused(true);
    game.pauseTimer();
  };

  const handleResume = () => {
    setIsPaused(false);
    game.resumeTimer();
  };

  const handleGameOverBack = () => {
    stopCamera();
    setScreen("Menu");
  };

  // Determine interference classes
  let interferenceClass = "";
  if (isMultiplayer && mp.activeInterference && !activeShield && !shieldAbsorbing) {
    const intensity = mp.activeInterference.intensity;
    const blurClass = mp.activeInterference.type === "blur" ? (intensity === "high" ? "blur-lg" : intensity === "medium" ? "blur-md" : "blur-sm") : "";
    const shakeClass = mp.activeInterference.type === "shake" ? "animate-[shake_0.25s_ease-in-out_infinite]" : "";
    const delayClass = mp.activeInterference.type === "delay" ? "pointer-events-none opacity-70" : "";
    const glitchClass = mp.activeInterference.type === "glitch" ? "animate-glitch saturate-0 contrast-125" : "";
    interferenceClass = `${blurClass} ${shakeClass} ${delayClass} ${glitchClass} transition-all duration-300`;
  }
  if (isFullInterferenceBurst) {
    interferenceClass = `blur-md animate-[shake_0.25s_ease-in-out_infinite] animate-glitch saturate-0 contrast-125 ${interferenceClass}`;
  }

  const fogMaskStyle = (() => {
    if (!isMultiplayer || mp.activeMode !== "fog") return {};
    const activeId = activeTileId || game.selectedId || "tile-0";
    const activeIndex = game.tiles.findIndex((t) => t.id === activeId);
    const index = activeIndex >= 0 ? activeIndex : 0;
    const cols = game.getGridConfig().cols;
    const rows = game.getGridConfig().size / cols;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = ((col + 0.5) / cols) * 100;
    const y = ((row + 0.5) / rows) * 100;
    return {
      background: `radial-gradient(circle at ${x}% ${y}%, transparent 0%, transparent 16%, rgba(0,0,0,0.86) 36%)`
    };
  })();

  return (
    <main className="min-h-screen bg-[var(--background)] text-white overflow-hidden flex flex-col relative font-sans">

      {/* Decorative background elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[var(--primary)] rounded-full blur-[150px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[var(--accent)] rounded-full blur-[150px] opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="w-full p-4 md:p-6 flex justify-between items-center z-10 relative">
        <h1 className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] cursor-pointer" onClick={() => setScreen("Menu")}>
          PUZZIFY
        </h1>
        <div className="flex gap-4">
          <button onClick={() => setScreen("Store")} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full font-bold transition-all border border-white/5">
            <span className="text-yellow-400">🪙 {profile.coins}</span>
            <ShoppingCart size={18} />
          </button>
          <button onClick={() => setScreen("Profile")} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/5">
            <User size={20} />
          </button>
          <button onClick={() => setScreen("Settings")} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/5">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Screen Content */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-4 flex flex-col items-center justify-center z-10 relative">

        {screen === "Menu" && (
          <div className="flex flex-col items-center w-full max-w-md animate-in fade-in zoom-in duration-500">
            <div className="mb-8 text-center">
              <h2 className="text-5xl font-black mb-4">Ready to race?</h2>
              <p className="text-white/60">Spatial cognitive training.</p>
            </div>

            <div className="w-full flex flex-col gap-6">

              <button onClick={() => setScreen("MultiplayerMenu")} className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--accent)] to-rose-500 p-[2px] transition-transform hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,77,157,0.3)]">
                <div className="flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm px-6 py-6 rounded-[14px]">
                  <Users size={32} className="mb-2 text-white" />
                  <span className="font-black text-2xl text-white tracking-widest">MULTIPLAYER HUB</span>
                  <span className="text-white/70 text-sm mt-1">Race globally or play with friends</span>
                </div>
              </button>

              <div className="flex items-center gap-4 w-full">
                <div className="h-px bg-white/10 flex-1"></div>
                <span className="text-white/40 text-xs font-bold tracking-widest uppercase">Solo Practice</span>
                <div className="h-px bg-white/10 flex-1"></div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => startSoloGame("Easy")} className="bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-all border border-white/5">Easy</button>
                <button onClick={() => startSoloGame("Medium")} className="bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-all border border-[var(--primary)]/50 shadow-[0_0_15px_rgba(108,43,217,0.3)]">Medium</button>
                <button onClick={() => startSoloGame("Hard")} className="bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-all border border-white/5">Hard</button>
              </div>

              <button onClick={() => setScreen("Manual")} className="w-full mt-4 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-all border border-white/5">
                <BookOpen size={20} /> How to Play
              </button>

            </div>
          </div>
        )}

        {screen === "MultiplayerMenu" && (
          <div className="w-full max-w-lg glass-panel rounded-3xl p-8 animate-in fade-in zoom-in-95">
            <button onClick={() => setScreen("Menu")} className="mb-6 flex items-center gap-2 text-white/50 hover:text-white transition-colors font-bold">
              <ArrowLeft size={20} /> Back to Menu
            </button>
            <h2 className="text-3xl font-black mb-8 flex items-center gap-3"><Users /> Multiplayer Hub</h2>

            <div className="space-y-8">
              {/* Quick Match Section */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Globe size={18} className="text-blue-400" /> Public Matchmaking</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center bg-black/30 p-3 rounded-xl border border-white/5">
                    <span className="text-sm font-bold text-white/70">Difficulty</span>
                    <select
                      className="bg-transparent text-white font-black outline-none cursor-pointer"
                      value={matchmakingDifficulty}
                      onChange={(e) => setMatchmakingDifficulty(e.target.value as any)}
                    >
                      <option className="bg-gray-900" value="Random">🎲 Random</option>
                      <option className="bg-gray-900" value="Easy">Easy</option>
                      <option className="bg-gray-900" value="Medium">Medium</option>
                      <option className="bg-gray-900" value="Hard">Hard</option>
                    </select>
                  </div>
                  <button onClick={startPublicMatchmaking} className="w-full py-3 rounded-xl bg-[var(--primary)] hover:bg-purple-600 font-bold transition-all">
                    Find Random Match
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full">
                <div className="h-px bg-white/10 flex-1"></div>
                <span className="text-white/40 text-xs font-bold tracking-widest uppercase">Or Play with Friends</span>
                <div className="h-px bg-white/10 flex-1"></div>
              </div>

              {/* Private Rooms Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
                  <DoorOpen size={32} className="text-[var(--accent)] mb-3" />
                  <h4 className="font-bold mb-2">Host Game</h4>
                  <p className="text-xs text-white/50 mb-4">Create a custom room.</p>
                  <button onClick={handleCreateRoom} className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-sm transition-all border border-[var(--accent)]/30">
                    Create Room
                  </button>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
                  <Hash size={32} className="text-yellow-400 mb-3" />
                  <h4 className="font-bold mb-2">Join Game</h4>
                  <p className="text-xs text-white/50 mb-2">Enter 6-digit code.</p>
                  <div className="w-full flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="CODE"
                      maxLength={6}
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-center font-mono font-black uppercase text-tracking-widest focus:border-[var(--primary)] outline-none"
                    />
                    <button
                      onClick={handleJoinRoom}
                      disabled={joinCodeInput.length !== 6}
                      className="w-full py-2 rounded-lg bg-[var(--accent)] hover:bg-pink-600 font-bold text-sm transition-all disabled:opacity-50"
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>

              {mp.joinError && (
                <div className="text-red-400 text-sm font-bold text-center animate-pulse">{mp.joinError}</div>
              )}
            </div>
          </div>
        )}

        {screen === "RoomLobby" && (
          <div className="w-full max-w-3xl glass-panel rounded-3xl p-8 animate-in fade-in zoom-in-95 relative overflow-hidden">
            {/* Large background code */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[150px] font-black text-white/[0.02] pointer-events-none">
              {mp.roomCode}
            </div>

            <button onClick={() => setScreen("MultiplayerMenu")} className="mb-6 flex items-center gap-2 text-white/50 hover:text-white transition-colors font-bold z-10 relative">
              <ArrowLeft size={20} /> Leave Room
            </button>

            <div className="flex flex-col items-center mb-10 z-10 relative">
              <span className="text-[var(--accent)] font-bold text-sm uppercase tracking-widest mb-2">Room Code</span>
              <div className="text-6xl font-black font-mono tracking-[0.2em]">{mp.roomCode}</div>
            </div>

            <div className="grid md:grid-cols-2 gap-8 z-10 relative">
              {/* Players Panel */}
              <div className="bg-black/30 border border-white/10 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-6 border-b border-white/10 pb-2">Players</h3>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-[var(--primary)]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500 overflow-hidden flex items-center justify-center font-black">
                        {profile.photoDataUrl ? (
                          <img src={profile.photoDataUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          playerInitials
                        )}
                      </div>
                      <span className="font-bold">{profile.gamerName}</span>
                    </div>
                    <span className="text-xs bg-[var(--primary)] px-2 py-1 rounded font-bold uppercase">Host</span>
                  </div>
                  <div className={`flex items-center justify-between p-4 rounded-xl border ${mp.opponentJoined ? 'bg-white/5 border-green-500/50' : 'bg-transparent border-dashed border-white/20'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${mp.opponentJoined ? 'bg-pink-500' : 'bg-white/10 text-white/30'}`}>
                        {mp.opponentJoined ? 'P2' : '?'}
                      </div>
                      <span className={`font-bold ${mp.opponentJoined ? 'text-white' : 'text-white/50'}`}>
                        {mp.opponentJoined ? 'Player 2' : 'Waiting...'}
                      </span>
                    </div>
                    {mp.opponentJoined && <span className="text-xs bg-green-500 px-2 py-1 rounded font-bold uppercase">Ready</span>}
                  </div>
                </div>
              </div>

              {/* Settings Panel */}
              <div className="bg-black/30 border border-white/10 rounded-2xl p-6 flex flex-col">
                <h3 className="text-xl font-bold mb-6 border-b border-white/10 pb-2 flex justify-between items-center">
                  Settings
                  {!mp.isHost && <span className="text-xs text-white/40 uppercase tracking-widest">(Host Only)</span>}
                </h3>

                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-sm font-bold text-white/70">Difficulty</span>
                    {mp.isHost ? (
                      <select
                        className="bg-transparent text-white font-black outline-none cursor-pointer"
                        value={mp.roomSettings.difficulty}
                        onChange={(e) => mp.updateRoomSettings({ difficulty: e.target.value as any })}
                      >
                        <option className="bg-gray-900" value="Easy">Easy</option>
                        <option className="bg-gray-900" value="Medium">Medium</option>
                        <option className="bg-gray-900" value="Hard">Hard</option>
                      </select>
                    ) : (
                      <span className="font-black text-white">{mp.roomSettings.difficulty}</span>
                    )}
                  </div>

                  <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-sm font-bold text-white/70">Time Limit</span>
                    {mp.isHost ? (
                      <select
                        className="bg-transparent text-white font-black outline-none cursor-pointer"
                        value={mp.roomSettings.timeLimit}
                        onChange={(e) => mp.updateRoomSettings({ timeLimit: parseInt(e.target.value) })}
                        disabled={mp.roomSettings.mode === "solver_saboteur"}
                      >
                        <option className="bg-gray-900" value={-1}>Default Match</option>
                        <option className="bg-gray-900" value={60}>1 Minute</option>
                        <option className="bg-gray-900" value={180}>3 Minutes</option>
                        <option className="bg-gray-900" value={300}>5 Minutes</option>
                        <option className="bg-gray-900" value={0}>No Limit</option>
                      </select>
                    ) : (
                      <span className="font-black text-white">
                        {mp.roomSettings.timeLimit === -1 ? "Default" : mp.roomSettings.timeLimit === 0 ? "No Limit" : `${mp.roomSettings.timeLimit / 60} Min`}
                      </span>
                    )}
                  </div>

                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-sm font-bold text-white/70 block mb-3">Gameplay Mode</span>
                    <div className="grid gap-2">
                      {MODE_CARDS.map((mode) => {
                        const active = mp.roomSettings.mode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            disabled={!mp.isHost}
                            onClick={() => mp.updateRoomSettings({ mode: mode.id, ...(mode.id === "solver_saboteur" ? { timeLimit: -1 } : {}) })}
                            className={`text-left rounded-lg p-3 border transition-all ${active
                                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                : "border-white/10 bg-black/20 hover:border-white/30"
                              } disabled:opacity-60`}
                          >
                            <div className="font-bold text-sm">{mode.title}</div>
                            <div className="text-xs text-white/60 mt-1">{mode.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                    <span className="text-sm font-bold text-white/70">Live Player Capture</span>
                    {mp.isHost ? (
                      <button
                        onClick={() => mp.updateRoomSettings({ liveCaptureEnabled: !mp.roomSettings.liveCaptureEnabled })}
                        className={`px-3 py-1 rounded-lg text-xs font-bold ${mp.roomSettings.liveCaptureEnabled ? "bg-green-500/30 text-green-200" : "bg-white/10 text-white/70"
                          }`}
                      >
                        {mp.roomSettings.liveCaptureEnabled ? "Enabled" : "Disabled"}
                      </button>
                    ) : (
                      <span className="font-black text-white">{mp.roomSettings.liveCaptureEnabled ? "Enabled" : "Disabled"}</span>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10">
                  {mp.isHost ? (
                    <button
                      onClick={mp.startPrivateGame}
                      disabled={!mp.opponentJoined}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] font-black text-lg transition-all disabled:opacity-50 disabled:grayscale hover:opacity-90 active:scale-95 shadow-[0_0_20px_rgba(255,77,157,0.4)]"
                    >
                      {mp.opponentJoined ? "START RACE" : "WAITING FOR P2..."}
                    </button>
                  ) : (
                    <div className="w-full py-4 rounded-xl bg-white/10 font-black text-lg text-center text-white/50 uppercase tracking-widest animate-pulse">
                      Waiting for host...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {screen === "Matchmaking" && (
          <div className="text-center animate-in fade-in zoom-in duration-500 flex flex-col items-center glass-panel p-12 rounded-3xl">
            <div className="w-24 h-24 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-8 shadow-[0_0_30px_rgba(255,77,157,0.5)]"></div>
            <h2 className="text-3xl font-black mb-2">Finding Opponent...</h2>
            <p className="text-white/50">Pool: <strong className="text-white">{matchmakingDifficulty}</strong></p>
            <button onClick={() => setScreen("MultiplayerMenu")} className="mt-8 text-white/40 hover:text-white transition-colors">Cancel</button>
          </div>
        )}

        {screen === "Play" && (
          <div className="w-full h-full flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-500">

            {game.isGameOver || mp.opponentWon ? (
              <div className="text-center bg-black/80 backdrop-blur-2xl p-8 rounded-3xl border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)] max-w-xl mx-auto w-full z-50">
                {mp.opponentWon && !game.isGameOver ? (
                  <>
                    <ShieldAlert size={64} className="mx-auto mb-4 text-red-500 drop-shadow-lg" />
                    <h2 className="text-4xl font-black mb-2 text-red-400">DEFEAT!</h2>
                    <p className="text-white/60 mb-6">Your opponent completed the puzzle first.</p>
                  </>
                ) : (
                  <>
                    <Crown size={64} className="mx-auto mb-4 text-yellow-400 drop-shadow-lg" />
                    <h2 className="text-4xl font-black mb-2 text-green-400">VICTORY!</h2>
                    <p className="text-white/60 mb-6">You mastered the spatial puzzle.</p>
                  </>
                )}

                {/* Advanced Post-Game Analytics */}
                <div className="bg-white/5 rounded-2xl p-4 mb-6 border border-white/10 text-left">
                  <h3 className="text-xl font-bold mb-4 border-b border-white/10 pb-2">Match Analytics</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-white/50 text-xs font-bold uppercase mb-1">Time Taken</div>
                      <div className="text-xl font-black">{game.timer}s</div>
                    </div>
                    <div>
                      <div className="text-white/50 text-xs font-bold uppercase mb-1">Accuracy</div>
                      <div className="text-xl font-black text-emerald-400">{accuracy}%</div>
                    </div>
                    <div>
                      <div className="text-white/50 text-xs font-bold uppercase mb-1">Total Moves</div>
                      <div className="text-xl font-black text-purple-400">{game.moves}</div>
                    </div>
                    <div>
                      <div className="text-white/50 text-xs font-bold uppercase mb-1">Max Combo</div>
                      <div className="text-xl font-black text-pink-400">{game.maxCombo}</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-end">
                    <div>
                      <div className="text-white/50 text-xs font-bold uppercase mb-1">Cognitive Score</div>
                      <div className="text-3xl font-black text-[var(--accent)] drop-shadow-[0_0_10px_rgba(255,77,157,0.5)]">{cognitiveScore}</div>
                    </div>
                    <button
                      onClick={() => setShowHeatmap(!showHeatmap)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all ${showHeatmap ? 'bg-orange-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                      <Map size={16} /> {showHeatmap ? "Hide Heatmap" : "View Heatmap"}
                    </button>
                  </div>
                </div>

                {showHeatmap && (
                  <div className="w-full aspect-square relative mb-6 rounded-2xl overflow-hidden border border-white/20">
                    <img src={game.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale" />
                    <HeatmapOverlay cols={game.getGridConfig().cols} size={game.getGridConfig().size} clickFrequencies={game.clickFrequencies} />
                  </div>
                )}

                <button
                  onClick={handleGameOverBack}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] font-black text-lg hover:opacity-90 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,77,157,0.4)]"
                >
                  RETURN TO MENU
                </button>
              </div>
            ) : (
              <div className={`flex flex-col ${isMultiplayer ? 'xl:flex-row' : ''} gap-6 items-center justify-center w-full max-w-7xl flex-1 relative`}>
                {isMultiplayer && mp.isLiveCaptureEnabled && (
                  <>
                    <div className="absolute top-2 left-2 z-40 w-28 h-20 sm:w-36 sm:h-24 bg-black/60 rounded-lg overflow-hidden border border-white/20">
                      {localCameraEnabled ? (
                        <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/60 px-2 text-center">Tap camera button</div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] sm:text-[10px] text-white/80 px-1 py-0.5 text-center">You</div>
                    </div>
                    <div className="absolute top-2 right-2 z-40 w-28 h-20 sm:w-36 sm:h-24 bg-black/60 rounded-lg overflow-hidden border border-white/20">
                      {mp.opponentFrameDataUrl ? (
                        <img src={mp.opponentFrameDataUrl} alt="Opponent live" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/60 px-2 text-center">Waiting opponent cam</div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] sm:text-[10px] text-white/80 px-1 py-0.5 text-center">Opponent</div>
                    </div>
                    <canvas ref={captureCanvasRef} className="hidden" />
                  </>
                )}

                {/* Pause Overlay */}
                {isPaused && (
                  <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center border border-white/10 shadow-2xl">
                    <h2 className="text-4xl font-black mb-8 tracking-widest uppercase">Paused</h2>
                    <div className="flex flex-col gap-4 w-full max-w-xs">
                      <button onClick={handleResume} className="w-full py-4 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] font-black text-lg hover:opacity-90 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,77,157,0.4)]">
                        RESUME
                      </button>
                      <button onClick={handleGameOverBack} className="w-full py-4 rounded-xl bg-white/10 hover:bg-white/20 font-black text-lg active:scale-95 transition-all border border-white/5">
                        EXIT GAME
                      </button>
                    </div>
                  </div>
                )}

                {/* Main Player Area */}
                <div className={`flex-1 w-full max-w-2xl flex flex-col relative ${interferenceClass}`}>

                  <div className="w-full flex justify-between mb-2">
                    <div className="flex gap-2">
                      <button
                        onClick={game.useHint}
                        disabled={!canSolve}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all flex items-center gap-2 text-sm font-bold border border-white/5 disabled:opacity-50"
                      >
                        <Lightbulb size={16} className="text-yellow-400" /> Smart Hint
                      </button>
                      {isMultiplayer && mp.isLiveCaptureEnabled && (
                        <button
                          onClick={localCameraEnabled ? stopCamera : startCamera}
                          className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all flex items-center gap-2 text-sm font-bold border border-white/5"
                        >
                          {localCameraEnabled ? <CameraOff size={16} /> : <Camera size={16} />}
                          {localCameraEnabled ? "Camera Off" : "Camera On"}
                        </button>
                      )}
                    </div>
                    <button onClick={handlePause} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all flex items-center gap-2 text-sm font-bold border border-white/5">
                      <Pause size={16} /> Pause
                    </button>
                  </div>
                  {isMultiplayer && mp.isLiveCaptureEnabled && !cameraError && (
                    <div className="text-xs text-white/60 mb-2">
                      {localCameraEnabled ? "Live camera on" : "Enable camera to stream live"}
                    </div>
                  )}
                  {cameraError && <div className="text-xs text-red-300 mb-2">{cameraError}</div>}

                  {isMultiplayer && mp.activeInterference && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-500 text-white font-black px-4 py-1 rounded-full animate-bounce z-50 flex items-center shadow-[0_0_20px_rgba(239,68,68,0.8)]">
                      <ShieldAlert size={16} className="mr-2" /> INTERFERENCE INCOMING
                    </div>
                  )}

                  <HUD
                    score={game.score}
                    moves={game.moves}
                    timer={game.timer}
                    timeLimit={game.timeLimit}
                    combo={game.combo}
                    accuracy={accuracy}
                  />

                  {/* Powerups Area */}
                  {canSolve && (
                    <div className="flex gap-4 justify-center mb-4 relative z-10">
                      <button 
                        onClick={() => { setActiveShield(true); setPowerupCooldown(Date.now() + 15000); }} 
                        disabled={currentMillis < powerupCooldown || activeShield}
                        className={`p-3 rounded-full border transition-all ${activeShield ? 'bg-blue-500/50 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'bg-white/10 hover:bg-white/20 border-white/20'} disabled:opacity-50 relative group`}
                      >
                        <Shield size={24} className={activeShield ? 'text-blue-200' : 'text-blue-400'} />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-[10px] uppercase font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">Shield</span>
                      </button>
                      <button 
                        onClick={() => { mp.sendPowerupAction({ actionType: "freeze", payload: { durationMs: 4000 } }); setPowerupCooldown(Date.now() + 15000); }} 
                        disabled={currentMillis < powerupCooldown || !isMultiplayer}
                        className="p-3 rounded-full border bg-white/10 hover:bg-white/20 border-white/20 transition-all disabled:opacity-50 relative group"
                      >
                        <Snowflake size={24} className="text-cyan-400" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-[10px] uppercase font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">Freeze</span>
                      </button>
                      <button 
                        onClick={() => { game.autoMatch(); setPowerupCooldown(Date.now() + 15000); }} 
                        disabled={currentMillis < powerupCooldown}
                        className="p-3 rounded-full border bg-white/10 hover:bg-white/20 border-white/20 transition-all disabled:opacity-50 relative group"
                      >
                        <Wand2 size={24} className="text-fuchsia-400" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-[10px] uppercase font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">Auto-Match</span>
                      </button>
                    </div>
                  )}

                  {isMultiplayer && mp.activeMode === "solver_saboteur" && (
                    <div className="mb-3 space-y-2">
                      <div className="text-xs font-bold uppercase tracking-widest text-center text-white/70">
                        Role: <span className={mp.myRole === "solver" ? "text-emerald-300" : "text-red-300"}>{mp.myRole}</span>
                      </div>
                      {mp.myRole === "saboteur" && (
                        <div className="flex flex-wrap gap-2 justify-center">
                          <button
                            onClick={() => setSelectedSabotageAction((prev) => prev === "lock_tile" ? null : "lock_tile")}
                            disabled={currentMillis < sabotageCooldownUntil}
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${selectedSabotageAction === "lock_tile" ? "bg-red-500/30 border-red-400" : "bg-white/10 border-white/20"} disabled:opacity-50`}
                          >
                            Lock (3 moves)
                          </button>
                          <button
                            onClick={() => setSelectedSabotageAction((prev) => prev === "fake_highlight" ? null : "fake_highlight")}
                            disabled={currentMillis < sabotageCooldownUntil}
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${selectedSabotageAction === "fake_highlight" ? "bg-yellow-500/30 border-yellow-300" : "bg-white/10 border-white/20"} disabled:opacity-50`}
                          >
                            Fake Highlight
                          </button>
                          <button
                            onClick={() => triggerSabotage("invert_controls")}
                            disabled={currentMillis < sabotageCooldownUntil}
                            className="px-3 py-1 rounded-full text-xs font-bold border bg-purple-500/20 border-purple-300 disabled:opacity-50"
                          >
                            Rotate + Interference
                          </button>
                        </div>
                      )}
                      {mp.myRole === "saboteur" && (
                        <div className="text-[11px] text-center text-white/60">
                          {selectedSabotageAction ? "Click a tile on solver grid to cast." : (currentMillis < sabotageCooldownUntil ? "Cooldown active..." : "Choose an ability.")}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Focus Meter */}
                  <div className="w-full glass-panel h-4 rounded-full mb-4 overflow-hidden relative border border-white/20">
                    <div
                      className={`h-full transition-all duration-300 ${game.isCalmMode ? 'bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)]' : 'bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]'}`}
                      style={{ width: `${game.focusMeter}%` }}
                    />
                    {game.isCalmMode && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black tracking-widest uppercase drop-shadow-md">Calm Mode Active</div>}
                  </div>

                  <div className={`w-full aspect-square relative flex items-center justify-center transition-transform duration-300 ${isInverted ? "rotate-90" : ""}`}>
                    <GameBoard
                      tiles={boardTiles}
                      onTileClick={handleBoardTileClick}
                      colorBlindMode={profile.colorBlindMode}
                      imageUrl={game.imageUrl}
                      gridConfig={game.getGridConfig()}
                      selectedId={mp.myRole === "saboteur" ? null : game.selectedId}
                    />
                    {isMultiplayer && mp.activeMode === "fog" && (
                      <div className="absolute inset-0 rounded-2xl pointer-events-none" style={fogMaskStyle} />
                    )}
                    {(fakeHighlightIds.length > 0 || lockedTileId) && (
                      <div className={`absolute inset-2 grid gap-1 sm:gap-2 ${game.getGridConfig().cols === 4 ? "grid-cols-4" : game.getGridConfig().cols === 6 ? "grid-cols-6" : "grid-cols-8"} pointer-events-none`}>
                        {boardTiles.map((tile) => (
                          <div
                            key={`fx-${tile.id}`}
                            className={`rounded-xl ${fakeHighlightIds.includes(tile.id) ? "ring-2 ring-yellow-300/70 bg-yellow-300/15 animate-pulse" : ""
                              } ${lockedTileId === tile.id ? "ring-2 ring-red-500/80 bg-red-500/20" : ""}`}
                          />
                        ))}
                      </div>
                    )}
                    {isFrozen && (
                      <div className="absolute inset-0 bg-cyan-900/40 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-cyan-400 pointer-events-none z-20 shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                        <div className="flex flex-col items-center animate-pulse">
                          <Snowflake size={48} className="text-cyan-300 mb-2 drop-shadow-lg" />
                          <span className="text-cyan-100 font-black text-xl tracking-widest uppercase">Frozen</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {isMultiplayer && mp.activeMode === "solver_saboteur" && lockedTileMovesRemaining > 0 && (
                    <div className="mt-2 text-xs text-center text-red-300 font-bold">
                      Locked tile active: {lockedTileMovesRemaining} move(s) left
                    </div>
                  )}
                </div>

                {/* Split Screen / Sidebar Area */}
                <div className={`w-full ${isMultiplayer ? 'xl:w-80' : 'xl:w-64'} shrink-0 flex flex-col sm:flex-row xl:flex-col gap-4 mt-4 xl:mt-0`}>

                  {/* Target Image Preview */}
                  <div className="flex-1 glass-panel rounded-2xl p-4 shadow-2xl flex flex-col items-center relative overflow-hidden group">
                    <div className="text-white/50 text-xs font-bold uppercase tracking-wider mb-3 text-center w-full flex justify-between items-center z-10">
                      <span>Target Image</span>
                      <Target size={14} />
                    </div>
                    <div className="w-full aspect-square rounded-xl overflow-hidden shadow-inner border border-white/20 relative">
                      {/* Explicit Grid overlay */}
                      <div className={`absolute inset-0 z-10 pointer-events-none grid gap-0.5 ${game.getGridConfig().cols === 4 ? "grid-cols-4" : game.getGridConfig().cols === 6 ? "grid-cols-6" : "grid-cols-8"}`}>
                        {Array.from({ length: game.getGridConfig().size }).map((_, i) => (
                          <div key={i} className="border border-white/30 w-full h-full rounded-sm"></div>
                        ))}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={game.imageUrl} alt="Target reference" className="w-full h-full object-cover pointer-events-none" />
                    </div>
                  </div>

                  {/* Opponent Split View (Multiplayer Only) */}
                  {isMultiplayer && (
                    <div className="flex-1 bg-black/60 border border-[var(--accent)]/30 rounded-2xl p-4 backdrop-blur-xl shadow-[0_0_30px_rgba(255,77,157,0.1)] flex flex-col relative overflow-hidden">
                      <div className="text-[var(--accent)] text-xs font-bold uppercase tracking-wider mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-2"><Zap size={14} /> Opponent</span>
                        <span>{mp.opponentProgress}%</span>
                      </div>
                      <div className="text-[11px] text-white/60 mb-2">{mp.opponentStatus}</div>

                      {/* Opponent Mini Board replacing the progress bar */}
                      <OpponentBoard
                        cols={game.getGridConfig().cols}
                        size={game.getGridConfig().size}
                        imageUrl={game.imageUrl}
                        matchedIndices={mp.opponentMatchedIndices}
                      />

                      <div className="mt-3 w-full bg-white/10 h-2 rounded-full overflow-hidden shadow-inner relative">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--accent)] to-rose-400 transition-all duration-500 ease-out"
                          style={{ width: `${mp.opponentProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                </div>

              </div>
            )}
          </div>
        )}

        {screen === "Manual" && (
          <div className="w-full max-w-2xl glass-panel rounded-3xl p-8 animate-in fade-in zoom-in-95 overflow-y-auto max-h-[80vh]">
            <button onClick={() => setScreen("Menu")} className="mb-6 flex items-center gap-2 text-white/50 hover:text-white transition-colors font-bold">
              <ArrowLeft size={20} /> Back to Menu
            </button>
            <h2 className="text-3xl font-black mb-6 flex items-center gap-3"><BookOpen /> How to Play</h2>

            <div className="space-y-6 text-white/80 leading-relaxed">
              <section>
                <h3 className="text-xl font-bold text-white mb-2">The Basics</h3>
                <p>Welcome to Puzzify! Your goal is to reconstruct a scrambled image by swapping tiles.</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Click a tile to <strong>select</strong> it.</li>
                  <li>Click a second tile to <strong>swap</strong> their positions.</li>
                  <li>When a tile lands in its correct spot, it locks in place with a green glow!</li>
                </ul>
              </section>

              <section>
                <h3 className="text-xl font-bold text-white mb-2">Multiplayer Races</h3>
                <p>In Multiplayer, you race against a live opponent. Both players get the exact same image and starting layout.</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Focus Meter:</strong> Fill it by making correct swaps quickly.</li>
                  <li><strong>Interference Attacks:</strong> Build a combo (3+ correct swaps in a row) to automatically attack your opponent! Attacks include blurring their screen, shaking their tiles, or delaying their inputs.</li>
                  <li><strong>Calm Mode:</strong> Reach 100% focus with a 5x combo to gain temporary immunity from incoming attacks.</li>
                </ul>
              </section>
            </div>
          </div>
        )}

        {screen === "Profile" && (
          <div className="w-full max-w-md sm:max-w-lg glass-panel rounded-3xl p-5 sm:p-8 animate-in fade-in zoom-in-95">
            <button onClick={() => setScreen("Menu")} className="mb-6 flex items-center gap-2 text-white/50 hover:text-white transition-colors font-bold">
              <ArrowLeft size={20} /> Back to Menu
            </button>
            <h2 className="text-3xl font-black mb-8 flex items-center gap-3"><User /> Your Profile</h2>

            <div className="space-y-6">
              <div className="bg-black/30 rounded-2xl p-4 flex items-center gap-4 border border-white/5">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 overflow-hidden flex items-center justify-center text-2xl font-black shadow-lg">
                  {profile.photoDataUrl ? (
                    <img src={profile.photoDataUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    playerInitials
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-xl">{profile.gamerName}</h3>
                  <p className="text-white/50 text-sm">Active Competitor</p>
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-3">
                <div>
                  <label className="text-xs text-white/50 uppercase font-bold">Gamer Name</label>
                  <input
                    value={profile.gamerName}
                    maxLength={20}
                    onChange={(e) => updateProfile({ gamerName: e.target.value || "Player 1" })}
                    className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 uppercase font-bold">Profile Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="mt-1 w-full text-xs text-white/70 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <Activity className="text-green-400 mb-2" />
                  <div className="text-2xl font-black">{profile.totalGames}</div>
                  <div className="text-xs text-white/50 uppercase font-bold">Games Played</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <Target className="text-blue-400 mb-2" />
                  <div className="text-2xl font-black">
                    {profile.totalGames > 0 ? Math.round((profile.totalWins / profile.totalGames) * 100) : 0}%
                  </div>
                  <div className="text-xs text-white/50 uppercase font-bold">Win Rate</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <Crown className="text-yellow-400 mb-2" />
                  <div className="text-2xl font-black">{profile.totalWins}</div>
                  <div className="text-xs text-white/50 uppercase font-bold">Total Wins</div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white/50 uppercase tracking-widest mt-6 mb-2">High Scores</h4>
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                  <span>Easy</span><span className="font-bold font-mono text-[var(--accent)]">{profile.bestScoreEasy}</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                  <span>Medium</span><span className="font-bold font-mono text-[var(--accent)]">{profile.bestScoreMedium}</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                  <span>Hard</span><span className="font-bold font-mono text-[var(--accent)]">{profile.bestScoreHard}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-white/50 uppercase tracking-widest mt-6 mb-2">Last 10 Matches</h4>
                {profile.matchHistory.length === 0 ? (
                  <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-sm text-white/60">
                    No matches recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {profile.matchHistory.map((entry) => (
                      <div key={entry.id} className="bg-white/5 p-3 rounded-lg border border-white/5 text-sm">
                        <div className="flex justify-between items-center">
                          <span className={`font-bold ${entry.isWin ? "text-emerald-400" : "text-rose-400"}`}>
                            {entry.isWin ? "WIN" : "LOSS"}
                          </span>
                          <span className="text-white/50 text-xs">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-white/80">
                          <span>{entry.mode.toUpperCase()} • {entry.level}</span>
                          <span className="font-mono font-bold text-[var(--accent)]">{entry.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {screen === "Settings" && (
          <div className="w-full max-w-md glass-panel rounded-3xl p-8 animate-in fade-in zoom-in-95">
            <button onClick={() => setScreen("Menu")} className="mb-6 flex items-center gap-2 text-white/50 hover:text-white transition-colors font-bold">
              <ArrowLeft size={20} /> Back to Menu
            </button>
            <h2 className="text-3xl font-black mb-8 flex items-center gap-3"><Settings /> Settings</h2>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <EyeOff className="text-blue-400" />
                  <div>
                    <div className="font-bold">Color-blind Mode</div>
                    <div className="text-xs text-white/50">Add patterns to tiles</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={profile.colorBlindMode}
                    onChange={(e) => updateProfile({ colorBlindMode: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <Volume2 className="text-green-400" />
                  <div>
                    <div className="font-bold">Sound Effects</div>
                    <div className="text-xs text-white/50">In-game audio</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={profile.audioEnabled}
                    onChange={(e) => updateProfile({ audioEnabled: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {screen === "Store" && (
          <div className="w-full max-w-4xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-8">
              <button onClick={() => setScreen("Menu")} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors font-bold">
                <ArrowLeft size={20} /> Back to Menu
              </button>
              <h2 className="text-3xl font-black text-center flex items-center gap-3">
                <ShoppingCart /> Item Shop
              </h2>
              <div className="w-24"></div> {/* Spacer for centering */}
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Premium Box */}
              <div className="bg-gradient-to-b from-purple-900/50 to-black/50 border border-[var(--primary)] rounded-3xl p-6 relative overflow-hidden group shadow-[0_0_30px_rgba(108,43,217,0.3)]">
                <div className="absolute top-0 right-0 bg-[var(--primary)] text-xs font-bold px-3 py-1 rounded-bl-xl">POPULAR</div>
                <Crown size={48} className="text-yellow-400 mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)] group-hover:scale-110 transition-transform" />
                <h3 className="text-2xl font-black mb-2">Premium Pass</h3>
                <p className="text-white/60 text-sm mb-6 min-h-[60px]">Ad-free experience, exclusive themes, and unlimited hints.</p>
                <button className="w-full py-3 rounded-xl bg-[var(--primary)] hover:bg-purple-600 font-bold transition-colors">
                  $4.99 / month
                </button>
              </div>

              {/* Hints Pack */}
              <div className="glass-panel rounded-3xl p-6">
                <Lightbulb size={48} className="text-pink-400 mb-4" />
                <h3 className="text-2xl font-black mb-2">10x Hints</h3>
                <p className="text-white/60 text-sm mb-6 min-h-[60px]">Stuck on Hard mode? Get 10 extra hints to reveal the board instantly.</p>
                <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold flex items-center justify-center gap-2 transition-colors border border-white/5">
                  <span className="text-yellow-400">🪙 500</span> Buy
                </button>
              </div>

              {/* Ad Reward */}
              <div className="glass-panel rounded-3xl p-6">
                <Star size={48} className="text-blue-400 mb-4" />
                <h3 className="text-2xl font-black mb-2">Free Coins</h3>
                <p className="text-white/60 text-sm mb-6 min-h-[60px]">Watch a short ad to earn 100 free coins instantly.</p>
                <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold flex items-center justify-center transition-colors border border-white/5">
                  ▶ Watch Ad
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
