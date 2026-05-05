"use client";

import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { LevelType } from "./useGameLogic";

export type InterferenceType = "blur" | "shake" | "delay" | "glitch";
export type GameMode = "normal" | "fog" | "solver_saboteur";
export type PlayerRole = "solver" | "saboteur";
export type InterferenceIntensity = "light" | "medium" | "high";
export type SabotageActionType = "lock_tile" | "fake_highlight" | "invert_controls" | "input_delay";
export type PowerupActionType = "freeze";

export type PowerupPayload = {
  actionType: PowerupActionType;
  payload?: {
    durationMs?: number;
  } | null;
};

export type InterferencePayload = {
  type: InterferenceType;
  durationMs: number;
  intensity: InterferenceIntensity;
};

export type SabotagePayload = {
  actionType: SabotageActionType;
  payload?: {
    tileId?: string;
    durationMs?: number;
    tileIds?: string[];
    movesCount?: number;
    burstMs?: number;
  } | null;
};

export type RoomSettings = {
  difficulty: LevelType;
  timeLimit: number; // -1 for default, 0 for unlimited, or specific seconds
  mode: GameMode;
  liveCaptureEnabled: boolean;
};

export function useMultiplayer() {
  const [socket, setSocket] = useState<Socket | null>(null);

  // Game State
  const [isWaiting, setIsWaiting] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [actualLevel, setActualLevel] = useState<LevelType | null>(null);
  const [customTimeLimit, setCustomTimeLimit] = useState<number | null>(null);
  const [activeMode, setActiveMode] = useState<GameMode>("normal");
  const [myRole, setMyRole] = useState<PlayerRole>("solver");
  const [isLiveCaptureEnabled, setIsLiveCaptureEnabled] = useState(false);

  // Progress State
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [opponentMatchedIndices, setOpponentMatchedIndices] = useState<number[]>([]);
  const [opponentStatus, setOpponentStatus] = useState("Opponent is solving...");
  const [activeInterference, setActiveInterference] = useState<InterferencePayload | null>(null);
  const [activeSabotage, setActiveSabotage] = useState<SabotagePayload | null>(null);
  const [activePowerupAction, setActivePowerupAction] = useState<PowerupPayload | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<{ gamerName: string; photoDataUrl?: string } | null>(null);
  const [opponentTileSnapshot, setOpponentTileSnapshot] = useState<any[] | null>(null);
  const [opponentFrameDataUrl, setOpponentFrameDataUrl] = useState<string | null>(null);
  const [opponentWon, setOpponentWon] = useState(false);

  // Private Room State
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
    difficulty: "Medium",
    timeLimit: -1,
    mode: "normal",
    liveCaptureEnabled: false
  });
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    // Connect to the local Socket.IO server
    const newSocket = io(`http://${window.location.hostname}:3001`);
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    // --- PUBLIC MATCHMAKING ---
    socket.on("waiting_for_opponent", () => {
      setIsWaiting(true);
    });

    socket.on("match_found", (data: {
      room: string;
      seed: number;
      level: LevelType;
      timeLimit?: number | null;
      mode?: GameMode;
      roles?: Record<string, PlayerRole>;
      liveCaptureEnabled?: boolean;
      opponentProfile?: { gamerName: string; photoDataUrl?: string };
    }) => {
      setIsWaiting(false);
      setRoom(data.room);
      setSeed(data.seed);
      setActualLevel(data.level);
      setActiveMode(data.mode || "normal");
      setIsLiveCaptureEnabled(!!data.liveCaptureEnabled);
      if (data.opponentProfile) {
        setOpponentProfile(data.opponentProfile);
      }
      if (socket.id && data.roles?.[socket.id]) {
        setMyRole(data.roles[socket.id]);
      } else {
        setMyRole("solver");
      }
      if (data.timeLimit !== undefined && data.timeLimit !== -1) {
        setCustomTimeLimit(data.timeLimit);
      } else {
        setCustomTimeLimit(null);
      }
    });

    // --- PRIVATE ROOMS ---
    socket.on("room_created", (data: { code: string; settings: RoomSettings }) => {
      setRoomCode(data.code);
      setRoomSettings(data.settings);
      setActiveMode(data.settings.mode);
      setIsLiveCaptureEnabled(data.settings.liveCaptureEnabled);
      setIsHost(true);
      setOpponentJoined(false);
      setOpponentProfile(null);
    });

    socket.on("room_joined_success", (data: { code: string; settings: RoomSettings; hostProfile?: any }) => {
      setRoomCode(data.code);
      setRoomSettings(data.settings);
      setActiveMode(data.settings.mode);
      setIsLiveCaptureEnabled(data.settings.liveCaptureEnabled);
      setIsHost(false);
      setOpponentJoined(true);
      setJoinError(null);
      if (data.hostProfile) {
        setOpponentProfile(data.hostProfile);
      }
    });

    socket.on("room_join_failed", (data: { message: string }) => {
      setJoinError(data.message);
      setRoomCode(null);
    });

    socket.on("guest_joined", (data?: { guestProfile?: any }) => {
      setOpponentJoined(true);
      if (data?.guestProfile) {
        setOpponentProfile(data.guestProfile);
      }
    });

    socket.on("guest_left", () => {
      setOpponentJoined(false);
      setOpponentProfile(null);
    });

    socket.on("settings_updated", (newSettings: RoomSettings) => {
      setRoomSettings(newSettings);
      setActiveMode(newSettings.mode);
      setIsLiveCaptureEnabled(newSettings.liveCaptureEnabled);
    });

    // --- IN GAME ---
    socket.on("opponent_progress", (data: { progress: number; matchedIndices: number[]; status?: string; tileSnapshot?: any[] | null }) => {
      setOpponentProgress(data.progress);
      setOpponentMatchedIndices(data.matchedIndices || []);
      setOpponentStatus(data.status || "Opponent is solving...");
      setOpponentTileSnapshot(data.tileSnapshot || null);
    });

    socket.on("receive_interference", (payload: InterferencePayload) => {
      setActiveInterference(payload);
      // Automatically clear interference based on payload.
      setTimeout(() => setActiveInterference(null), payload.durationMs || 2500);
    });

    socket.on("receive_sabotage_action", (payload: SabotagePayload) => {
      setActiveSabotage(payload);
      setTimeout(() => setActiveSabotage(null), payload.payload?.durationMs || 3000);
    });

    socket.on("receive_powerup_action", (payload: PowerupPayload) => {
      setActivePowerupAction(payload);
      setTimeout(() => setActivePowerupAction(null), payload.payload?.durationMs || 3000);
    });

    socket.on("receive_video_frame", (payload: { frameDataUrl: string }) => {
      setOpponentFrameDataUrl(payload.frameDataUrl || null);
    });

    socket.on("opponent_won", () => {
      setOpponentWon(true);
    });

    return () => {
      socket.off("waiting_for_opponent");
      socket.off("match_found");
      socket.off("room_created");
      socket.off("room_joined_success");
      socket.off("room_join_failed");
      socket.off("guest_joined");
      socket.off("guest_left");
      socket.off("settings_updated");
      socket.off("opponent_progress");
      socket.off("receive_interference");
      socket.off("receive_sabotage_action");
      socket.off("receive_powerup_action");
      socket.off("receive_video_frame");
      socket.off("opponent_won");
    };
  }, [socket]);

  // Actions
  const resetState = () => {
    setRoom(null);
    setSeed(null);
    setActualLevel(null);
    setCustomTimeLimit(null);
    setActiveMode("normal");
    setMyRole("solver");
    setIsLiveCaptureEnabled(false);
    setOpponentProgress(0);
    setOpponentMatchedIndices([]);
    setOpponentStatus("Opponent is solving...");
    setActiveInterference(null);
    setActiveSabotage(null);
    setActivePowerupAction(null);
    setOpponentProfile(null);
    setOpponentTileSnapshot(null);
    setOpponentFrameDataUrl(null);
    setOpponentWon(false);
    setRoomCode(null);
    setIsHost(false);
    setOpponentJoined(false);
    setJoinError(null);
  };

  const joinMatchmaking = useCallback((level: LevelType | "Random", profile?: any) => {
    if (socket) {
      resetState();
      socket.emit("join_matchmaking", { level, profile });
    }
  }, [socket]);

  const createPrivateRoom = useCallback((profile?: any) => {
    if (socket) {
      resetState();
      socket.emit("create_private_room", { profile });
    }
  }, [socket]);

  const joinPrivateRoom = useCallback((code: string, profile?: any) => {
    if (socket) {
      resetState();
      socket.emit("join_private_room", { code: code.toUpperCase(), profile });
    }
  }, [socket]);

  const updateRoomSettings = useCallback((settings: Partial<RoomSettings>) => {
    if (socket && roomCode && isHost) {
      socket.emit("update_room_settings", { code: roomCode, settings });
    }
  }, [socket, roomCode, isHost]);

  const startPrivateGame = useCallback(() => {
    if (socket && roomCode && isHost && opponentJoined) {
      socket.emit("start_private_game", { code: roomCode });
    }
  }, [socket, roomCode, isHost, opponentJoined]);

  // In-Game Actions
  const sendProgress = useCallback((progress: number, matchedIndices: number[], status?: string, tileSnapshot?: any[] | null) => {
    if (socket && room) {
      socket.emit("progress_update", { room, progress, matchedIndices, status, tileSnapshot });
    }
  }, [socket, room]);

  const sendInterference = useCallback((payload: InterferencePayload) => {
    if (socket && room) {
      socket.emit("send_interference", { room, ...payload });
    }
  }, [socket, room]);

  const sendSabotageAction = useCallback((payload: SabotagePayload) => {
    if (socket && room) {
      socket.emit("send_sabotage_action", { room, ...payload });
    }
  }, [socket, room]);

  const sendPowerupAction = useCallback((payload: PowerupPayload) => {
    if (socket && room) {
      socket.emit("send_powerup_action", { room, ...payload });
    }
  }, [socket, room]);

  const sendVideoFrame = useCallback((frameDataUrl: string) => {
    if (socket && room && isLiveCaptureEnabled) {
      socket.emit("send_video_frame", { room, frameDataUrl });
    }
  }, [socket, room, isLiveCaptureEnabled]);

  const notifyWin = useCallback(() => {
    if (socket && room) {
      socket.emit("game_won", { room });
    }
  }, [socket, room]);

  return {
    // Connection state
    isWaiting,
    room,
    seed,
    actualLevel,
    customTimeLimit,
    activeMode,
    myRole,
    isLiveCaptureEnabled,

    // Private Room state
    roomCode,
    isHost,
    roomSettings,
    opponentJoined,
    joinError,

    // In-game state
    opponentProgress,
    opponentMatchedIndices,
    opponentStatus,
    activeInterference,
    activeSabotage,
    activePowerupAction,
    opponentProfile,
    opponentTileSnapshot,
    opponentFrameDataUrl,
    opponentWon,

    // Methods
    joinMatchmaking,
    createPrivateRoom,
    joinPrivateRoom,
    updateRoomSettings,
    startPrivateGame,
    sendProgress,
    sendInterference,
    sendSabotageAction,
    sendPowerupAction,
    sendVideoFrame,
    notifyWin
  };
}
