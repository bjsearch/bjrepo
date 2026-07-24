"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  golfCourses,
  getCoursesByRegion,
  getRandomCourseFromRegion,
  GolfCourse,
  regionList,
} from "@/lib/golfCourses";
import MapComponent from "./GolfMap";

interface GameState {
  currentCourse: GolfCourse | null;
  userInput: string;
  score: number;
  streak: number;
  totalCorrect: number;
  totalAttempts: number;
  selectedRegion: string;
  gameStarted: boolean;
  timeLeft: number;
  isGameOver: boolean;
  hintIndex: number;
  usedCourseIds: Set<string>;
  playedCourses: GolfCourse[];
}

interface Particle {
  id: string;
  x: number;
  y: number;
}

const ParticleEffect = ({ particles }: { particles: Particle[] }) => (
  <>
    {particles.map((p) => (
      <div
        key={p.id}
        className="fixed pointer-events-none text-2xl font-bold text-green-400"
        style={{
          left: `${p.x}px`,
          top: `${p.y}px`,
          animation: "float-up 1s ease-out forwards",
          opacity: 0.8,
        }}
      >
        ✨
      </div>
    ))}
    <style>{`
      @keyframes float-up {
        0% { transform: translateY(0) scale(1); opacity: 1; }
        100% { transform: translateY(-80px) scale(0); opacity: 0; }
      }
      @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 0 20px rgba(74, 222, 128, 0.3); }
        50% { box-shadow: 0 0 40px rgba(74, 222, 128, 0.6); }
      }
      @keyframes streak-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      @keyframes shimmer {
        0% { background-position: -1000px 0; }
        100% { background-position: 1000px 0; }
      }
      @keyframes rotate-border {
        0% { border-color: rgba(74, 222, 128, 0.5); }
        50% { border-color: rgba(74, 222, 128, 1); }
        100% { border-color: rgba(74, 222, 128, 0.5); }
      }
    `}</style>
  </>
);

export default function GolfFieldTyping() {
  const [gameState, setGameState] = useState<GameState>({
    currentCourse: null,
    userInput: "",
    score: 0,
    streak: 0,
    totalCorrect: 0,
    totalAttempts: 0,
    selectedRegion: "강원",
    gameStarted: false,
    timeLeft: 60,
    isGameOver: false,
    hintIndex: 0,
    usedCourseIds: new Set(),
    playedCourses: [],
  });

  const [particles, setParticles] = useState<Particle[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getUnusedCourse = (region: string, usedIds: Set<string>): GolfCourse | undefined => {
    const regionCourses = getCoursesByRegion(region);
    const availableCourses = regionCourses.filter(c => !usedIds.has(c.id));
    if (availableCourses.length === 0) return undefined;
    return availableCourses[Math.floor(Math.random() * availableCourses.length)];
  };

  const createParticles = (x: number, y: number, count: number = 5) => {
    const newParticles = Array.from({ length: count }).map((_, i) => ({
      id: `${Date.now()}-${i}`,
      x: x + (Math.random() - 0.5) * 100,
      y: y + (Math.random() - 0.5) * 100,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles((prev) => prev.filter(p => !newParticles.some(np => np.id === p.id)));
    }, 1000);
  };

  useEffect(() => {
    if (gameState.gameStarted && !gameState.isGameOver) {
      timerRef.current = setInterval(() => {
        setGameState((prev) => {
          if (prev.timeLeft <= 1) {
            return { ...prev, isGameOver: true, gameStarted: false };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState.gameStarted, gameState.isGameOver]);

  const startGame = () => {
    const usedIds = new Set<string>();
    const course = getUnusedCourse(gameState.selectedRegion, usedIds);
    if (course) {
      usedIds.add(course.id);
      setGameState({
        ...gameState,
        currentCourse: course,
        userInput: "",
        gameStarted: true,
        isGameOver: false,
        timeLeft: 60,
        score: 0,
        streak: 0,
        totalCorrect: 0,
        totalAttempts: 0,
        hintIndex: 0,
        usedCourseIds: usedIds,
        playedCourses: [course],
      });
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const nextCourse = () => {
    const course = getUnusedCourse(gameState.selectedRegion, gameState.usedCourseIds);
    if (course) {
      setGameState((prev) => {
        const newUsedIds = new Set(prev.usedCourseIds);
        newUsedIds.add(course.id);
        return {
          ...prev,
          currentCourse: course,
          userInput: "",
          hintIndex: 0,
          usedCourseIds: newUsedIds,
          playedCourses: [...prev.playedCourses, course],
        };
      });
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      endGame();
    }
  };

  const showNextHint = () => {
    if (gameState.currentCourse && gameState.hintIndex < gameState.currentCourse.hints.length) {
      setGameState((prev) => ({
        ...prev,
        hintIndex: prev.hintIndex + 1,
      }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setGameState((prev) => ({
      ...prev,
      userInput: input,
    }));

    if (
      gameState.currentCourse &&
      input.toLowerCase() === gameState.currentCourse.name.toLowerCase()
    ) {
      const newScore = gameState.score + 100 + gameState.streak * 10;
      createParticles(window.innerWidth / 2, window.innerHeight / 2, 8);

      setGameState((prev) => ({
        ...prev,
        score: newScore,
        streak: prev.streak + 1,
        totalCorrect: prev.totalCorrect + 1,
        totalAttempts: prev.totalAttempts + 1,
        userInput: "",
      }));

      nextCourse();
    }
  };

  const handleRegionChange = (region: string) => {
    if (!gameState.gameStarted) {
      setGameState((prev) => ({
        ...prev,
        selectedRegion: region,
      }));
    }
  };

  const handleWrongAnswer = () => {
    setGameState((prev) => ({
      ...prev,
      streak: 0,
      totalAttempts: prev.totalAttempts + 1,
      userInput: "",
    }));
    nextCourse();
  };

  const endGame = () => {
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      isGameOver: true,
    }));
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const accuracy = gameState.totalAttempts > 0
    ? Math.round((gameState.totalCorrect / gameState.totalAttempts) * 100)
    : 0;

  const timerPercent = (gameState.timeLeft / 60) * 100;

  if (!gameState.gameStarted && !gameState.isGameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 overflow-hidden relative">
        {/* 배경 애니메이션 */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute w-96 h-96 bg-green-500 rounded-full filter blur-3xl top-20 left-20 animate-pulse"></div>
          <div className="absolute w-96 h-96 bg-cyan-500 rounded-full filter blur-3xl bottom-20 right-20" style={{ animation: "pulse 4s ease-in-out infinite 1s" }}></div>
        </div>

        <div className="max-w-2xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400 mb-4" style={{ textShadow: "0 0 30px rgba(74, 222, 128, 0.5)" }}>
              필드타이핑
            </h1>
            <p className="text-3xl font-bold text-green-400 mb-2">🏌️ 골프장판</p>
            <p className="text-xl text-gray-300">대한민국의 아름다운 골프장을 찾아보세요!</p>
          </div>

          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-50 rounded-2xl shadow-2xl p-8 mb-8 backdrop-blur" style={{ boxShadow: "0 0 40px rgba(74, 222, 128, 0.2)" }}>
            <h2 className="text-2xl font-bold text-green-400 mb-8 flex items-center gap-2">
              <span className="text-3xl">🗺️</span> 지역 선택
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
              {regionList.map((region) => (
                <button
                  key={region}
                  onClick={() => handleRegionChange(region)}
                  className={`p-4 rounded-xl font-bold transition-all duration-300 transform hover:scale-105 ${
                    gameState.selectedRegion === region
                      ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg border-2 border-green-300 scale-105"
                      : "bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-green-400 border-2 border-gray-600"
                  }`}
                  style={gameState.selectedRegion === region ? { boxShadow: "0 0 20px rgba(74, 222, 128, 0.5)" } : {}}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="mb-8 p-5 bg-green-500 bg-opacity-10 border-2 border-green-500 border-opacity-50 rounded-xl">
              <h3 className="font-bold text-green-400 mb-2 text-lg">📊 선택된 지역</h3>
              <p className="text-2xl font-bold text-green-300">{gameState.selectedRegion}</p>
              <p className="text-sm text-gray-300 mt-2">
                💯 {getCoursesByRegion(gameState.selectedRegion).length} 개의 골프장
              </p>
            </div>

            <button
              onClick={startGame}
              className="w-full bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 px-6 rounded-xl transition-all text-xl shadow-lg transform hover:scale-105 active:scale-95"
              style={{ boxShadow: "0 0 30px rgba(74, 222, 128, 0.5)" }}
            >
              🎮 게임 시작하기
            </button>
          </div>

          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-xl p-6 backdrop-blur">
            <p className="mb-4 text-green-400 font-bold text-lg flex items-center gap-2">
              <span className="text-2xl">💡</span> 게임 방법
            </p>
            <ul className="text-left space-y-3 text-gray-300 mb-6">
              <li className="flex items-start gap-3 hover:text-green-300 transition">
                <span className="text-green-400 font-bold">1️⃣</span>
                <span>지도에 표시된 골프장의 이름을 정확히 타이핑하세요</span>
              </li>
              <li className="flex items-start gap-3 hover:text-green-300 transition">
                <span className="text-green-400 font-bold">2️⃣</span>
                <span>정확하면 100점 + 연속 보너스를 얻습니다</span>
              </li>
              <li className="flex items-start gap-3 hover:text-green-300 transition">
                <span className="text-green-400 font-bold">3️⃣</span>
                <span>60초 안에 가능한 한 많은 골프장을 맞춰보세요</span>
              </li>
              <li className="flex items-start gap-3 hover:text-green-300 transition">
                <span className="text-green-400 font-bold">4️⃣</span>
                <span>각 정답마다 새로운 골프장이 나타납니다</span>
              </li>
            </ul>
            <div className="border-t border-gray-700 pt-4">
              <p className="text-xs font-bold text-green-400 mb-3 flex items-center gap-2">
                <span className="text-lg">✨</span> 특별 기능
              </p>
              <ul className="text-left space-y-2 text-xs text-gray-400">
                <li>🌟 각 골프장의 특징 및 역사 정보 제공</li>
                <li>🎯 단계별 힌트로 어려운 골프장도 맞춰보기</li>
                <li>🗺️ 게임 종료 후 플레이 경로를 지도에서 확인</li>
              </ul>
            </div>
          </div>
        </div>
        <ParticleEffect particles={particles} />
      </div>
    );
  }

  if (gameState.isGameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 overflow-hidden relative">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute w-96 h-96 bg-green-500 rounded-full filter blur-3xl top-20 left-20 animate-pulse"></div>
          <div className="absolute w-96 h-96 bg-cyan-500 rounded-full filter blur-3xl bottom-20 right-20" style={{ animation: "pulse 4s ease-in-out infinite 1s" }}></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-4">
              🎉 게임 완료!
            </h1>
            <p className="text-xl text-gray-300">당신의 골프 여정을 지도에서 확인하세요</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur">
              <MapComponent
                courses={golfCourses}
                playedCourses={gameState.playedCourses}
              />
            </div>

            <div className="space-y-4">
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-xl p-6 space-y-4 backdrop-blur">
                {/* 최종 점수 */}
                <div className="bg-gradient-to-r from-amber-500 to-yellow-600 bg-opacity-15 p-5 rounded-xl border-2 border-amber-500 border-opacity-50" style={{ boxShadow: "0 0 20px rgba(251, 146, 60, 0.3)" }}>
                  <p className="text-sm text-gray-300 font-semibold mb-1">최종 점수</p>
                  <p className="text-4xl font-black text-amber-400">{gameState.score}</p>
                </div>

                {/* 정답 */}
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 bg-opacity-15 p-5 rounded-xl border-2 border-green-500 border-opacity-50" style={{ boxShadow: "0 0 20px rgba(74, 222, 128, 0.3)" }}>
                  <p className="text-sm text-gray-300 font-semibold mb-1">정답</p>
                  <p className="text-4xl font-black text-green-400">
                    {gameState.totalCorrect}/{gameState.totalAttempts}
                  </p>
                </div>

                {/* 정확도 */}
                <div className="bg-gradient-to-r from-cyan-500 to-blue-600 bg-opacity-15 p-5 rounded-xl border-2 border-cyan-500 border-opacity-50" style={{ boxShadow: "0 0 20px rgba(34, 211, 238, 0.3)" }}>
                  <p className="text-sm text-gray-300 font-semibold mb-1">정확도</p>
                  <p className="text-4xl font-black text-cyan-400">{accuracy}%</p>
                </div>

                {/* 최대 연속 */}
                <div className="bg-gradient-to-r from-violet-500 to-purple-600 bg-opacity-15 p-5 rounded-xl border-2 border-violet-500 border-opacity-50" style={{ boxShadow: "0 0 20px rgba(139, 92, 246, 0.3)" }}>
                  <p className="text-sm text-gray-300 font-semibold mb-1">최대 연속</p>
                  <p className="text-4xl font-black text-violet-400" style={{ animation: gameState.streak > 0 ? "streak-pulse 0.6s ease-out" : "none" }}>
                    {gameState.streak} 🔥
                  </p>
                </div>

                <button
                  onClick={() =>
                    setGameState((prev) => ({
                      ...prev,
                      isGameOver: false,
                    }))
                  }
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black py-4 px-6 rounded-xl transition-all text-lg shadow-lg transform hover:scale-105 active:scale-95"
                  style={{ boxShadow: "0 0 30px rgba(74, 222, 128, 0.5)" }}
                >
                  🔄 다시 플레이
                </button>
              </div>
            </div>
          </div>
        </div>
        <ParticleEffect particles={particles} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 overflow-hidden relative">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute w-96 h-96 bg-green-500 rounded-full filter blur-3xl top-40 left-10 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-cyan-500 rounded-full filter blur-3xl bottom-40 right-10" style={{ animation: "pulse 4s ease-in-out infinite 1s" }}></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* 상단 정보 바 - 향상된 디자인 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {/* 점수 */}
          <div className="bg-gradient-to-br from-amber-500 to-yellow-600 bg-opacity-10 rounded-xl shadow-lg p-4 border-2 border-amber-500 border-opacity-30 backdrop-blur" style={{ boxShadow: "0 0 20px rgba(251, 146, 60, 0.2)" }}>
            <p className="text-xs text-gray-300 font-semibold uppercase">점수</p>
            <p className="text-3xl font-black text-amber-400 mt-1">{gameState.score}</p>
          </div>

          {/* 연속 - 애니메이션 적용 */}
          <div className={`bg-gradient-to-br from-green-500 to-emerald-600 bg-opacity-10 rounded-xl shadow-lg p-4 border-2 border-green-500 border-opacity-30 backdrop-blur transition-all ${gameState.streak > 0 ? "scale-110" : ""}`} style={{ animation: gameState.streak > 0 ? "pulse 0.5s ease-out" : "none", boxShadow: gameState.streak > 0 ? "0 0 30px rgba(74, 222, 128, 0.4)" : "0 0 20px rgba(74, 222, 128, 0.2)" }}>
            <p className="text-xs text-gray-300 font-semibold uppercase">연속</p>
            <p className="text-3xl font-black text-green-400 mt-1">
              {gameState.streak} 🔥
            </p>
          </div>

          {/* 정답 */}
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 bg-opacity-10 rounded-xl shadow-lg p-4 border-2 border-cyan-500 border-opacity-30 backdrop-blur" style={{ boxShadow: "0 0 20px rgba(34, 211, 238, 0.2)" }}>
            <p className="text-xs text-gray-300 font-semibold uppercase">정답</p>
            <p className="text-3xl font-black text-cyan-400 mt-1">{gameState.totalCorrect}</p>
          </div>

          {/* 타이머 - 원형 프로그레스 */}
          <div className="bg-gradient-to-br from-red-500 to-pink-600 bg-opacity-10 rounded-xl shadow-lg p-4 border-2 border-red-500 border-opacity-30 backdrop-blur relative" style={{ boxShadow: gameState.timeLeft <= 10 ? "0 0 30px rgba(239, 68, 68, 0.4)" : "0 0 20px rgba(239, 68, 68, 0.2)" }}>
            <p className="text-xs text-gray-300 font-semibold uppercase">남은 시간</p>
            <div className="relative mt-2">
              <svg width="60" height="60" className="transform -rotate-90">
                <circle cx="30" cy="30" r="25" fill="none" stroke="#374151" strokeWidth="3" />
                <circle
                  cx="30"
                  cy="30"
                  r="25"
                  fill="none"
                  stroke={gameState.timeLeft <= 10 ? "#ef4444" : "#4ade80"}
                  strokeWidth="3"
                  strokeDasharray={`${(timerPercent / 100) * 157} 157`}
                  className="transition-all duration-300"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className={`text-lg font-black ${gameState.timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-green-400"}`}>
                  {gameState.timeLeft}s
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 메인 게임 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 맵 */}
          <div className="lg:col-span-2 bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur" style={{ boxShadow: "0 0 40px rgba(74, 222, 128, 0.15)" }}>
            <MapComponent
              courses={getCoursesByRegion(gameState.selectedRegion)}
              highlightedCourseId={gameState.currentCourse?.id}
            />
          </div>

          {/* 입력 영역 - 향상된 디자인 */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-2xl p-6 flex flex-col backdrop-blur" style={{ boxShadow: "0 0 40px rgba(74, 222, 128, 0.15)" }}>
            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-2 font-bold">📍 지역: <span className="text-green-400 text-lg">{gameState.selectedRegion}</span></p>

              {/* 현재 골프장 */}
              <div className="bg-green-500 bg-opacity-10 p-5 rounded-xl border-2 border-green-500 border-opacity-40 mb-4 backdrop-blur" style={{ boxShadow: "0 0 20px rgba(74, 222, 128, 0.2)" }}>
                <p className="text-xs text-gray-400 mb-2 uppercase font-bold">🎯 이 골프장은</p>
                <p className="text-2xl font-black text-green-300 mb-2" style={{ animation: "pulse-glow 2s ease-in-out infinite" }}>
                  {gameState.currentCourse?.name}
                </p>
                <p className="text-xs text-gray-500">
                  {gameState.currentCourse?.region} • {gameState.currentCourse?.holes}홀 • {gameState.currentCourse?.established}년 개설
                </p>
              </div>

              {/* 힌트 섹션 */}
              <div className="bg-gradient-to-r from-cyan-600 to-blue-600 bg-opacity-10 p-4 rounded-xl border-2 border-cyan-500 border-opacity-40 backdrop-blur" style={{ boxShadow: "0 0 15px rgba(34, 211, 238, 0.2)" }}>
                <p className="text-xs font-bold text-cyan-400 mb-2 uppercase">💡 정보 & 힌트</p>
                <p className="text-sm text-gray-300 mb-3 leading-relaxed">{gameState.currentCourse?.description}</p>

                {gameState.hintIndex > 0 && (
                  <div className="space-y-2 mb-3">
                    {gameState.currentCourse?.hints.slice(0, gameState.hintIndex).map((hint, i) => (
                      <div key={i} className="text-sm text-cyan-300 bg-black bg-opacity-40 p-2.5 rounded-lg border-l-3 border-cyan-400">
                        ✓ {hint}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={showNextHint}
                  disabled={!gameState.currentCourse || gameState.hintIndex >= gameState.currentCourse.hints.length}
                  className="w-full text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:bg-gray-600 text-white font-bold py-2 px-2 rounded-lg transition-all hover:scale-105 active:scale-95"
                >
                  {gameState.hintIndex === 0 ? "💡 첫 번째 힌트" : "➡️ 다음 힌트"}
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-bold text-gray-300 mb-3 uppercase">
                ✏️ 골프장 이름 입력
              </label>
              <input
                ref={inputRef}
                type="text"
                value={gameState.userInput}
                onChange={handleInputChange}
                placeholder="골프장 이름을 입력하세요..."
                className="w-full px-4 py-3 bg-gray-700 border-2 border-green-500 border-opacity-50 text-white placeholder-gray-500 rounded-xl font-semibold text-lg focus:outline-none focus:border-green-400 focus:border-opacity-100 transition-all mb-4 hover:border-opacity-75 focus:ring-2 focus:ring-green-500 focus:ring-opacity-30 backdrop-blur"
              />

              <button
                onClick={handleWrongAnswer}
                className="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-bold py-3 px-4 rounded-xl transition-all mb-3 hover:scale-105 active:scale-95 shadow-lg"
                style={{ boxShadow: "0 0 20px rgba(234, 88, 12, 0.3)" }}
              >
                ⏭️ 건너뛰기
              </button>

              <button
                onClick={endGame}
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg transform hover:scale-105 active:scale-95"
                style={{ boxShadow: "0 0 20px rgba(239, 68, 68, 0.3)" }}
              >
                ⏹️ 게임 종료
              </button>
            </div>

            {/* 정확도 표시 */}
            <div className="mt-4 p-4 bg-gradient-to-r from-cyan-600 to-blue-600 bg-opacity-10 rounded-xl border-2 border-cyan-500 border-opacity-30 backdrop-blur">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-cyan-400 font-bold uppercase">정확도</p>
                <p className="text-2xl font-black text-cyan-300">{accuracy}%</p>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                  style={{ width: `${accuracy}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ParticleEffect particles={particles} />
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { text-shadow: 0 0 10px rgba(74, 222, 128, 0.3); }
          50% { text-shadow: 0 0 20px rgba(74, 222, 128, 0.6); }
        }
      `}</style>
    </div>
  );
}
