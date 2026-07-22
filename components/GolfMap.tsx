"use client";

import React from "react";
import { GolfCourse } from "@/lib/golfCourses";

interface GolfMapProps {
  courses: GolfCourse[];
  highlightedCourseId?: string;
}

export default function GolfMap({
  courses,
  highlightedCourseId,
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
    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-green-100 p-4 flex flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-800">골프장 지도</h3>
        <p className="text-sm text-gray-600">강조된 위치의 골프장을 맞춰보세요</p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="bg-gradient-to-br from-blue-50 to-green-50 border-4 border-gray-300 rounded-lg"
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
                stroke="#e0e0e0"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#grid)" />

          {/* 모든 골프장 마커 */}
          {courses.map((course) => {
            const x = lngToX(course.lng);
            const y = latToY(course.lat);
            const isHighlighted = course.id === highlightedCourseId;

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
                      : "#10b981"
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
            fill="#999"
            fontFamily="monospace"
          >
            N 38.5°
          </text>
          <text
            x="10"
            y={height - 10}
            fontSize="11"
            fill="#999"
            fontFamily="monospace"
          >
            N 33.0°
          </text>
          <text
            x="10"
            y={height - 25}
            fontSize="11"
            fill="#999"
            fontFamily="monospace"
          >
            E 125.0°
          </text>
          <text
            x={width - 45}
            y={height - 25}
            fontSize="11"
            fill="#999"
            fontFamily="monospace"
          >
            E 130.0°
          </text>
        </svg>
      </div>

      {/* 범례 */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>현재 골프장</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span>다른 골프장</span>
        </div>
      </div>

      {highlightedCourse && (
        <div className="mt-3 p-3 bg-white rounded-lg border-l-4 border-red-500">
          <p className="text-sm font-semibold text-gray-800">
            {highlightedCourse.name}
          </p>
          <p className="text-xs text-gray-600">
            위치: {highlightedCourse.province} • {highlightedCourse.holes}홀
          </p>
        </div>
      )}
    </div>
  );
}
