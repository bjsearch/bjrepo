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

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getUnusedCourse = (region: string, usedIds: Set<string>): GolfCourse | undefined => {
    const regionCourses = getCoursesByRegion(region);
    const availableCourses = regionCourses.filter(c => !usedIds.has(c.id));

    if (availableCourses.length === 0) {
      return undefined;
    }

    return availableCourses[Math.floor(Math.random() * availableCourses.length)];
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
      const newStreak = gameState.streak + 1;
      const newCorrect = gameState.totalCorrect + 1;

      setGameState((prev) => ({
        ...prev,
        score: newScore,
        streak: newStreak,
        totalCorrect: newCorrect,
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
    const newStreak = 0;
    setGameState((prev) => ({
      ...prev,
      streak: newStreak,
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

  const accuracy =
    gameState.totalAttempts > 0
      ? Math.round(
          (gameState.totalCorrect / gameState.totalAttempts) * 100
        )
      : 0;

  if (!gameState.gameStarted && !gameState.isGameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-2">
              필드타이핑
            </h1>
            <p className="text-2xl font-bold text-green-400 mb-2">골프장판</p>
            <p className="text-lg text-gray-400">
              대한민국 골프장 이름을 타이핑해보세요!
            </p>
          </div>

          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 border-opacity-30 rounded-xl shadow-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-green-400 mb-6">
              지역 선택
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {regionList.map((region) => (
                <button
                  key={region}
                  onClick={() => handleRegionChange(region)}
                  className={`p-4 rounded-lg font-semibold transition-all duration-200 ${
                    gameState.selectedRegion === region
                      ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/50 scale-105"
                      : "bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-green-400 border border-gray-600"
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="mb-6 p-4 bg-green-500 bg-opacity-10 border-l-4 border-green-500 rounded-lg">
              <h3 className="font-semibold text-green-400 mb-2">
                선택된 지역: {gameState.selectedRegion}
              </h3>
              <p className="text-sm text-gray-300">
                {
                  getCoursesByRegion(gameState.selectedRegion).length
                } 개의 골프장이 있습니다
              </p>
            </div>

            <button
              onClick={startGame}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3 px-6 rounded-lg transition-all text-lg shadow-lg shadow-green-500/50"
            >
              게임 시작 🏌️
            </button>
          </div>

          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 border-opacity-20 rounded-xl shadow-xl p-6">
            <p className="mb-4 text-green-400 font-bold">💡 게임 방법:</p>
            <ul className="text-left space-y-2 text-sm mb-4 text-gray-300">
              <li className="flex items-start gap-2"><span className="text-green-400">•</span> 지도에 표시된 골프장의 이름을 정확히 타이핑하세요</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span> 정확하면 100점 + 연속 보너스를 얻습니다</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span> 60초 안에 가능한 한 많은 골프장을 맞춰보세요</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span> 각 정답마다 새로운 골프장이 나타납니다</li>
            </ul>
            <div className="border-t border-gray-700 pt-4">
              <p className="text-xs font-semibold text-green-400 mb-3">🎯 새로운 기능:</p>
              <ul className="text-left space-y-2 text-xs text-gray-400">
                <li className="flex items-start gap-2"><span className="text-green-400">✨</span> 각 골프장의 특징 및 역사 정보 제공</li>
                <li className="flex items-start gap-2"><span className="text-green-400">✨</span> 단계별 힌트로 어려운 골프장도 맞춰보기 가능</li>
                <li className="flex items-start gap-2"><span className="text-green-400">✨</span> 골프장 개설 연도 및 상세 설명 표시</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.isGameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-2">
              게임 끝! 🏌️
            </h1>
            <p className="text-gray-400">당신의 골프 여정을 지도에서 확인하세요</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 지도 */}
            <div className="lg:col-span-2 bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 border-opacity-30 rounded-xl shadow-2xl overflow-hidden">
              <MapComponent
                courses={golfCourses}
                playedCourses={gameState.playedCourses}
              />
            </div>

            {/* 통계 */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 border-opacity-30 rounded-xl shadow-xl p-6 space-y-4">
                <div className="bg-gradient-to-r from-amber-500 to-yellow-600 bg-opacity-10 p-4 rounded-lg border border-amber-500 border-opacity-30">
                  <p className="text-sm text-gray-400">최종 점수</p>
                  <p className="text-3xl font-bold text-amber-400">
                    {gameState.score}
                  </p>
                </div>
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 bg-opacity-10 p-4 rounded-lg border border-green-500 border-opacity-30">
                  <p className="text-sm text-gray-400">정답</p>
                  <p className="text-3xl font-bold text-green-400">
                    {gameState.totalCorrect}/{gameState.totalAttempts}
                  </p>
                </div>
                <div className="bg-gradient-to-r from-cyan-500 to-blue-600 bg-opacity-10 p-4 rounded-lg border border-cyan-500 border-opacity-30">
                  <p className="text-sm text-gray-400">정확도</p>
                  <p className="text-3xl font-bold text-cyan-400">
                    {accuracy}%
                  </p>
                </div>
                <div className="bg-gradient-to-r from-violet-500 to-purple-600 bg-opacity-10 p-4 rounded-lg border border-violet-500 border-opacity-30">
                  <p className="text-sm text-gray-400">최대 연속</p>
                  <p className="text-3xl font-bold text-violet-400">
                    {gameState.streak}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setGameState((prev) => ({
                      ...prev,
                      isGameOver: false,
                    }))
                  }
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3 px-6 rounded-lg transition-all text-lg shadow-lg shadow-green-500/50"
                >
                  다시 플레이 🔄
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black p-4">
      <div className="max-w-7xl mx-auto">
        {/* 상단 정보 바 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-amber-500 border-opacity-30 rounded-lg shadow-lg p-4">
            <p className="text-sm text-gray-400">점수</p>
            <p className="text-2xl font-bold text-amber-400">
              {gameState.score}
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 border-opacity-30 rounded-lg shadow-lg p-4">
            <p className="text-sm text-gray-400">연속</p>
            <p className="text-2xl font-bold text-green-400">
              {gameState.streak}
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-cyan-500 border-opacity-30 rounded-lg shadow-lg p-4">
            <p className="text-sm text-gray-400">정답</p>
            <p className="text-2xl font-bold text-cyan-400">
              {gameState.totalCorrect}
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-opacity-30 rounded-lg shadow-lg p-4"
            style={{borderColor: gameState.timeLeft <= 10 ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)'}}>
            <p className="text-sm text-gray-400">남은 시간</p>
            <p
              className={`text-2xl font-bold ${
                gameState.timeLeft <= 10
                  ? "text-red-500"
                  : "text-green-400"
              }`}
            >
              {gameState.timeLeft}s
            </p>
          </div>
        </div>

        {/* 메인 게임 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* 맵 */}
          <div className="lg:col-span-2 bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 border-opacity-30 rounded-xl shadow-2xl overflow-hidden">
            <MapComponent
              courses={getCoursesByRegion(gameState.selectedRegion)}
              highlightedCourseId={
                gameState.currentCourse?.id
              }
            />
          </div>

          {/* 입력 영역 */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-green-500 border-opacity-30 rounded-xl shadow-xl p-6 flex flex-col">
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">지역: <span className="text-green-400 font-semibold">{gameState.selectedRegion}</span></p>
              <div className="bg-green-500 bg-opacity-10 p-4 rounded-lg mb-4 border border-green-500 border-opacity-30">
                <p className="text-sm text-gray-400 mb-2">이 골프장은:</p>
                <p className="text-xl font-bold text-green-400">
                  {gameState.currentCourse?.name}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {gameState.currentCourse?.region} •{" "}
                  {gameState.currentCourse?.holes}홀 • {gameState.currentCourse?.established}년 개설
                </p>
              </div>

              {/* 힌트 섹션 */}
              <div className="bg-gradient-to-br from-cyan-600 to-blue-600 bg-opacity-10 p-4 rounded-lg border-l-4 border-cyan-500">
                <p className="text-xs font-semibold text-cyan-400 mb-2">💡 정보 & 힌트</p>
                <p className="text-sm text-gray-300 mb-3">{gameState.currentCourse?.description}</p>

                {gameState.hintIndex > 0 && (
                  <div className="space-y-1 mb-3">
                    {gameState.currentCourse?.hints.slice(0, gameState.hintIndex).map((hint, i) => (
                      <div key={i} className="text-sm text-cyan-300 bg-black bg-opacity-30 p-2 rounded">
                        ✓ {hint}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={showNextHint}
                  disabled={!gameState.currentCourse || gameState.hintIndex >= gameState.currentCourse.hints.length}
                  className="w-full text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:bg-gray-600 text-white font-semibold py-1 px-2 rounded transition-all"
                >
                  {gameState.hintIndex === 0 ? "힌트 보기" : "다음 힌트"}
                </button>
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                골프장 이름 입력:
              </label>
              <input
                ref={inputRef}
                type="text"
                value={gameState.userInput}
                onChange={handleInputChange}
                placeholder="골프장 이름을 입력하세요..."
                className="w-full px-4 py-3 bg-gray-700 border-2 border-green-500 border-opacity-50 text-white placeholder-gray-500 rounded-lg font-semibold text-lg focus:outline-none focus:border-green-400 focus:border-opacity-100 focus:ring-2 focus:ring-green-500 focus:ring-opacity-30 mb-4 transition-all"
                autoComplete="off"
              />

              <button
                onClick={handleWrongAnswer}
                disabled={!gameState.userInput}
                className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition-all mb-4"
              >
                모르겠어요
              </button>

              <button
                onClick={endGame}
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-lg shadow-red-500/30"
              >
                게임 종료
              </button>
            </div>

            <div className="mt-4 p-3 bg-gradient-to-r from-cyan-600 to-blue-600 bg-opacity-10 rounded-lg border border-cyan-500 border-opacity-30">
              <p className="text-xs text-cyan-300">
                💡 정확도: <span className="font-bold">{accuracy}%</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
