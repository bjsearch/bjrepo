"use client";

import React, { useState, useMemo } from "react";
import { golfCourses, regionList } from "@/lib/golfCourses";
import Link from "next/link";

export default function GolfSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<(typeof golfCourses)[0] | null>(null);

  // 한글/영어 모두 검색 가능
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return selectedRegion
        ? golfCourses.filter((c) => c.region === selectedRegion)
        : golfCourses;
    }

    const query = searchQuery.toLowerCase();
    return golfCourses.filter((course) => {
      const matchName = course.name.toLowerCase().includes(query);
      const matchRegion = course.region.includes(query);
      const matchProvince = course.province.includes(query);
      const matchDescription = course.description.includes(query);

      const baseMatch = matchName || matchRegion || matchProvince || matchDescription;
      const regionMatch = selectedRegion ? course.region === selectedRegion : true;

      return baseMatch && regionMatch;
    });
  }, [searchQuery, selectedRegion]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4 overflow-hidden relative">
      {/* 배경 애니메이션 */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute w-96 h-96 bg-green-500 rounded-full filter blur-3xl top-40 left-10 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-cyan-500 rounded-full filter blur-3xl bottom-40 right-10" style={{ animation: "pulse 4s ease-in-out infinite 1s" }}></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <Link href="/golf-typing">
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 mb-2 cursor-pointer hover:opacity-80 transition">
              필드타이핑
            </h1>
          </Link>
          <p className="text-xl text-gray-300">🔍 골프장 검색</p>
        </div>

        {/* 검색 영역 */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-2xl p-8 mb-6 backdrop-blur" style={{ boxShadow: "0 0 40px rgba(74, 222, 128, 0.15)" }}>
          {/* 검색창 */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="골프장 이름으로 검색... (한글/영어)"
              className="flex-1 px-6 py-4 bg-gray-700 border-2 border-green-500 border-opacity-50 text-white placeholder-gray-500 rounded-xl font-semibold text-lg focus:outline-none focus:border-green-400 focus:border-opacity-100 transition-all hover:border-opacity-75 focus:ring-2 focus:ring-green-500 focus:ring-opacity-30"
            />
            <button className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black rounded-xl transition-all shadow-lg" style={{ boxShadow: "0 0 20px rgba(74, 222, 128, 0.5)" }}>
              🔍 검색
            </button>
          </div>

          {/* 지역 필터 */}
          <div>
            <p className="text-sm text-gray-400 mb-3 font-bold">📍 지역으로 필터링</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedRegion(null)}
                className={`px-4 py-2 rounded-full font-semibold transition-all ${
                  selectedRegion === null
                    ? "bg-green-500 text-white shadow-lg"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                전체
              </button>
              {regionList.map((region) => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-4 py-2 rounded-full font-semibold transition-all ${
                    selectedRegion === region
                      ? "bg-green-500 text-white shadow-lg"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 검색 결과 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 골프장 목록 */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur">
              <div className="p-6 border-b border-green-500 border-opacity-20">
                <p className="text-lg font-bold text-green-400">
                  🏌️ 검색 결과: {searchResults.length}개
                </p>
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <p className="text-lg mb-2">검색 결과가 없습니다</p>
                    <p className="text-sm">다른 검색어를 시도해보세요</p>
                  </div>
                ) : (
                  searchResults.map((course) => (
                    <button
                      key={course.id}
                      onClick={() => setSelectedCourse(course)}
                      className={`w-full p-4 text-left border-b border-gray-700 transition-all hover:bg-gray-700 hover:bg-opacity-50 ${
                        selectedCourse?.id === course.id ? "bg-green-500 bg-opacity-10 border-green-500" : ""
                      }`}
                    >
                      <p className="font-bold text-green-400 mb-1">{course.name}</p>
                      <p className="text-sm text-gray-400">
                        {course.region} • {course.holes}홀 • {course.established}년 개설
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 상세 정보 */}
          <div className="lg:col-span-1">
            {selectedCourse ? (
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-2xl p-6 backdrop-blur sticky top-4" style={{ boxShadow: "0 0 40px rgba(74, 222, 128, 0.15)" }}>
                <p className="text-xs text-gray-500 mb-2 uppercase font-bold">상세 정보</p>
                <h3 className="text-2xl font-black text-green-400 mb-4">{selectedCourse.name}</h3>

                {/* 기본 정보 */}
                <div className="space-y-3 mb-6">
                  <div className="bg-gray-700 bg-opacity-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">지역</p>
                    <p className="text-lg font-bold text-green-300">{selectedCourse.region}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-700 bg-opacity-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">홀</p>
                      <p className="text-lg font-bold text-cyan-300">{selectedCourse.holes}홀</p>
                    </div>
                    <div className="bg-gray-700 bg-opacity-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">개설</p>
                      <p className="text-lg font-bold text-yellow-300">{selectedCourse.established}년</p>
                    </div>
                  </div>
                </div>

                {/* 난이도 */}
                <div className="mb-6">
                  <p className="text-xs text-gray-400 mb-2 font-bold">난이도</p>
                  <div className={`px-4 py-2 rounded-lg text-center font-bold text-white ${
                    selectedCourse.difficulty === "쉬움" ? "bg-green-600" :
                    selectedCourse.difficulty === "중간" ? "bg-yellow-600" :
                    "bg-red-600"
                  }`}>
                    {selectedCourse.difficulty}
                  </div>
                </div>

                {/* 소개 */}
                <div className="mb-6">
                  <p className="text-xs text-gray-400 mb-2 font-bold">🏌️ 소개</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{selectedCourse.description}</p>
                </div>

                {/* 특징 */}
                {selectedCourse.features && selectedCourse.features.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-gray-400 mb-2 font-bold">⭐ 특징</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCourse.features.map((feature, i) => (
                        <span key={i} className="text-xs bg-green-900 bg-opacity-50 text-green-300 px-2 py-1 rounded-full border border-green-500 border-opacity-50">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 추천 클럽 */}
                {selectedCourse.recommendedClubs && selectedCourse.recommendedClubs.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-gray-400 mb-2 font-bold">🏌️ 추천 클럽</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCourse.recommendedClubs.map((club, i) => (
                        <span key={i} className="text-xs bg-blue-900 bg-opacity-50 text-blue-300 px-2 py-1 rounded-full border border-blue-500 border-opacity-50">
                          {club}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <Link href="/golf-typing">
                  <button className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg" style={{ boxShadow: "0 0 20px rgba(74, 222, 128, 0.5)" }}>
                    🎮 게임하기
                  </button>
                </Link>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-green-500 border-opacity-30 rounded-2xl shadow-2xl p-6 backdrop-blur text-center text-gray-400">
                <p className="text-lg">골프장을 선택해보세요</p>
                <p className="text-sm mt-2">목록에서 클릭하면 상세 정보를 볼 수 있습니다</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
