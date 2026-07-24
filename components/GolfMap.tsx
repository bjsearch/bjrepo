"use client";

import React from "react";
import { GolfCourse } from "@/lib/golfCourses";

interface GolfMapProps {
  courses: GolfCourse[];
  highlightedCourseId?: string;
  playedCourses?: GolfCourse[];
}

export default function GolfMap({
  courses,
  highlightedCourseId,
  playedCourses,
}: GolfMapProps) {
  // 한반도 좌표 범위
  const minLat = 33.0;
  const maxLat = 38.5;
  const minLng = 125.0;
  const maxLng = 130.0;

  const width = 500;
  const height = 600;

  // 좌표를 SVG 좌표로 변환
  const lngToX = (lng: number): number => {
    return ((lng - minLng) / (maxLng - minLng)) * width;
  };

  const latToY = (lat: number): number => {
    return ((maxLat - lat) / (maxLat - minLat)) * height;
  };

  // 집중할 골프장
  const highlightedCourse = courses.find((c) => c.id === highlightedCourseId);

  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black p-4 flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-green-400">골프장 지도</h3>
        <p className="text-sm text-gray-400">강조된 위치의 골프장을 맞춰보세요</p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="bg-gradient-to-br from-gray-800 to-gray-900 border-4 border-green-500 border-opacity-50 rounded-lg"
          style={{ maxWidth: "100%" }}
        >
          {/* 배경 (간단한 그리드) */}
          <defs>
            <pattern
              id="grid"
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="#374151"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#grid)" />

          {/* 한국 지도 윤곽선 */}
          <g opacity="0.3" stroke="#4ade80" strokeWidth="1.5" fill="none">
            {/* 한반도 경계선 (간소화된 형태) */}
            <path
              d={`
                M ${lngToX(127)} ${latToY(38.5)}
                L ${lngToX(128)} ${latToY(38.3)}
                L ${lngToX(128.5)} ${latToY(37.8)}
                L ${lngToX(129)} ${latToY(37.2)}
                L ${lngToX(129.5)} ${latToY(36.5)}
                L ${lngToX(130)} ${latToY(35.5)}
                L ${lngToX(129.8)} ${latToY(34.8)}
                L ${lngToX(129)} ${latToY(34.5)}
                L ${lngToX(128)} ${latToY(34.3)}
                L ${lngToX(127.5)} ${latToY(33.2)}
                L ${lngToX(126.5)} ${latToY(33)}
                L ${lngToX(125.5)} ${latToY(33.5)}
                L ${lngToX(125)} ${latToY(34)}
                L ${lngToX(125.2)} ${latToY(35)}
                L ${lngToX(125.5)} ${latToY(36)}
                L ${lngToX(126)} ${latToY(37)}
                L ${lngToX(126.5)} ${latToY(38)}
                L ${lngToX(127)} ${latToY(38.5)}
              `}
            />
          </g>

          {/* 주요 도시 위치 표시 (선택사항) */}
          <g opacity="0.2">
            {/* 서울 */}
            <circle cx={lngToX(126.98)} cy={latToY(37.57)} r="3" fill="#4ade80" />
            {/* 부산 */}
            <circle cx={lngToX(129.07)} cy={latToY(35.10)} r="3" fill="#4ade80" />
            {/* 대구 */}
            <circle cx={lngToX(128.60)} cy={latToY(35.87)} r="3" fill="#4ade80" />
            {/* 인천 */}
            <circle cx={lngToX(126.71)} cy={latToY(37.45)} r="3" fill="#4ade80" />
            {/* 대전 */}
            <circle cx={lngToX(127.42)} cy={latToY(36.35)} r="3" fill="#4ade80" />
          </g>

          {/* 플레이한 골프장들 연결선 */}
          {playedCourses && playedCourses.length > 1 && (
            <g>
              {playedCourses.map((course, idx) => {
                if (idx === playedCourses.length - 1) return null;
                const x1 = lngToX(course.lng);
                const y1 = latToY(course.lat);
                const nextCourse = playedCourses[idx + 1];
                const x2 = lngToX(nextCourse.lng);
                const y2 = latToY(nextCourse.lat);
                return (
                  <line
                    key={`path-${idx}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#4ade80"
                    strokeWidth="2"
                    opacity="0.7"
                    strokeDasharray="5,5"
                  />
                );
              })}
            </g>
          )}

          {/* 모든 골프장 마커 */}
          {courses.map((course) => {
            const x = lngToX(course.lng);
            const y = latToY(course.lat);
            const isHighlighted = course.id === highlightedCourseId;
            const isPlayed = playedCourses?.some(c => c.id === course.id);

            return (
              <g key={course.id}>
                {/* 외부 원 (강조 효과) */}
                {isHighlighted && (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r="20"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2"
                      opacity="0.6"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r="26"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="1"
                      opacity="0.3"
                      strokeDasharray="4"
                    />
                  </>
                )}

                {/* 마커 원 */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHighlighted ? "10" : "6"}
                  fill={
                    isHighlighted
                      ? "#ef4444"
                      : isPlayed
                      ? "#4ade80"
                      : "#6b7280"
                  }
                  opacity={isHighlighted ? 1 : 0.7}
                  className="cursor-pointer hover:opacity-100 transition-opacity"
                />

                {/* 마커 내부 하얀 점 */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHighlighted ? "4" : "2"}
                  fill="white"
                />

                {/* 강조된 마커에만 라벨 표시 */}
                {isHighlighted && (
                  <>
                    <rect
                      x={x - 50}
                      y={y - 35}
                      width="100"
                      height="30"
                      rx="4"
                      fill="white"
                      stroke="#ef4444"
                      strokeWidth="2"
                      opacity="0.95"
                    />
                    <text
                      x={x}
                      y={y - 15}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="bold"
                      fill="#1f2937"
                      className="pointer-events-none"
                    >
                      {course.name}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* 좌표 표시 */}
          <text
            x="10"
            y="20"
            fontSize="11"
            fill="#4b5563"
            fontFamily="monospace"
          >
            N 38.5°
          </text>
          <text
            x="10"
            y={height - 10}
            fontSize="11"
            fill="#4b5563"
            fontFamily="monospace"
          >
            N 33.0°
          </text>
          <text
            x="10"
            y={height - 25}
            fontSize="11"
            fill="#4b5563"
            fontFamily="monospace"
          >
            E 125.0°
          </text>
          <text
            x={width - 45}
            y={height - 25}
            fontSize="11"
            fill="#4b5563"
            fontFamily="monospace"
          >
            E 130.0°
          </text>
        </svg>
      </div>

      {/* 범례 */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>현재 골프장</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <div className="w-2 h-2 rounded-full bg-gray-500"></div>
          <span>다른 골프장</span>
        </div>
        {playedCourses && playedCourses.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>플레이한 골프장</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <div className="w-2 h-0.5 bg-green-500" style={{width: "15px"}}></div>
              <span>플레이 경로</span>
            </div>
          </>
        )}
      </div>

      {highlightedCourse && (
        <div className="mt-3 p-3 bg-gradient-to-r from-red-600 to-red-700 bg-opacity-20 border-l-4 border-red-500 rounded-lg">
          <p className="text-sm font-semibold text-red-400">
            {highlightedCourse.name}
          </p>
          <p className="text-xs text-gray-400">
            위치: {highlightedCourse.region} • {highlightedCourse.holes}홀
          </p>
        </div>
      )}
    </div>
  );
}
