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
}

export default function GolfFieldTyping() {
  const [gameState, setGameState] = useState<GameState>({
    currentCourse: null,
    userInput: "",
    score: 0,
    streak: 0,
    totalCorrect: 0,
    totalAttempts: 0,
    selectedRegion: "서울/경기",
    gameStarted: false,
    timeLeft: 60,
    isGameOver: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
    const course = getRandomCourseFromRegion(gameState.selectedRegion);
    if (course) {
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
      });
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const nextCourse = () => {
    const course = getRandomCourseFromRegion(gameState.selectedRegion);
    if (course) {
      setGameState((prev) => ({
        ...prev,
        currentCourse: course,
        userInput: "",
      }));
      setTimeout(() => inputRef.current?.focus(), 0);
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
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-green-900 mb-2">
              필드타이핑 - 골프장판
            </h1>
            <p className="text-lg text-gray-600">
              대한민국 골프장 이름을 타이핑해보세요!
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              지역 선택
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {regionList.map((region) => (
                <button
                  key={region}
                  onClick={() => handleRegionChange(region)}
                  className={`p-4 rounded-lg font-semibold transition-all ${
                    gameState.selectedRegion === region
                      ? "bg-green-500 text-white shadow-lg scale-105"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">
                선택된 지역: {gameState.selectedRegion}
              </h3>
              <p className="text-sm text-blue-800">
                {
                  getCoursesByRegion(gameState.selectedRegion).length
                } 개의 골프장이 있습니다
              </p>
            </div>

            <button
              onClick={startGame}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-all text-lg"
            >
              게임 시작 🏌️
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6 text-center text-gray-600">
            <p className="mb-2">💡 게임 방법:</p>
            <ul className="text-left space-y-1 text-sm">
              <li>• 지도에 표시된 골프장의 이름을 정확히 타이핑하세요</li>
              <li>• 정확하면 100점 + 연속 보너스를 얻습니다</li>
              <li>• 60초 안에 가능한 한 많은 골프장을 맞춰보세요</li>
              <li>• 각 정답마다 새로운 골프장이 나타납니다</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.isGameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-green-900 mb-2">
              게임 끝! 🏌️
            </h1>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">최종 점수</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {gameState.score}
                </p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">정답</p>
                <p className="text-3xl font-bold text-blue-600">
                  {gameState.totalCorrect}/{gameState.totalAttempts}
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">정확도</p>
                <p className="text-3xl font-bold text-purple-600">
                  {accuracy}%
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">최대 연속</p>
                <p className="text-3xl font-bold text-green-600">
                  {gameState.streak}
                </p>
              </div>
            </div>

            <button
              onClick={() =>
                setGameState((prev) => ({
                  ...prev,
                  isGameOver: false,
                }))
              }
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-all text-lg"
            >
              다시 플레이 🔄
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* 상단 정보 바 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">점수</p>
            <p className="text-2xl font-bold text-yellow-600">
              {gameState.score}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">연속</p>
            <p className="text-2xl font-bold text-green-600">
              {gameState.streak}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">정답</p>
            <p className="text-2xl font-bold text-blue-600">
              {gameState.totalCorrect}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">남은 시간</p>
            <p
              className={`text-2xl font-bold ${
                gameState.timeLeft <= 10
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {gameState.timeLeft}s
            </p>
          </div>
        </div>

        {/* 메인 게임 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* 맵 */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-lg overflow-hidden">
            <MapComponent
              courses={getCoursesByRegion(gameState.selectedRegion)}
              highlightedCourseId={
                gameState.currentCourse?.id
              }
            />
          </div>

          {/* 입력 영역 */}
          <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col">
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">지역: {gameState.selectedRegion}</p>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-700 mb-2">이 골프장은:</p>
                <p className="text-xl font-bold text-green-700">
                  {gameState.currentCourse?.name}
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  {gameState.currentCourse?.province} •{" "}
                  {gameState.currentCourse?.holes}홀
                </p>
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                골프장 이름 입력:
              </label>
              <input
                ref={inputRef}
                type="text"
                value={gameState.userInput}
                onChange={handleInputChange}
                placeholder="골프장 이름을 입력하세요..."
                className="w-full px-4 py-3 border-2 border-green-300 rounded-lg font-semibold text-lg focus:outline-none focus:border-green-500 mb-4"
                autoComplete="off"
              />

              <button
                onClick={handleWrongAnswer}
                disabled={!gameState.userInput}
                className="w-full bg-gray-400 hover:bg-gray-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition-all mb-4"
              >
                모르겠어요
              </button>

              <button
                onClick={endGame}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-all"
              >
                게임 종료
              </button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800">
                💡 정확도: {accuracy}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
