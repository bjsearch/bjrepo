'use client'

import { YouTubeVideo } from '@/lib/types'

interface Props {
  videos: YouTubeVideo[]
  isLoading: boolean
  topics: string[]
}

export default function VideoRecommendations({ videos, isLoading, topics }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <span>🎬</span> Video References
        </h3>
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-28 h-16 bg-slate-200 rounded-lg flex-shrink-0"></div>
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 bg-slate-200 rounded w-full"></div>
                <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                <div className="h-2 bg-slate-100 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!videos || videos.length === 0) {
    if (topics.length === 0) return null

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <span>🎬</span> Video References
        </h3>
        <div className="text-center py-4">
          <p className="text-slate-400 text-sm">
            Add a YouTube API key to get personalized video recommendations.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            {topics.map((topic) => (
              <a
                key={topic}
                href={`https://www.youtube.com/results?search_query=english+${encodeURIComponent(topic)}+learning`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                Search: {topic}
              </a>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const groupedVideos = videos.reduce((acc, video) => {
    if (!acc[video.topic]) acc[video.topic] = []
    acc[video.topic].push(video)
    return acc
  }, {} as Record<string, YouTubeVideo[]>)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 animate-fadeIn">
      <h3 className="font-semibold text-slate-700 mb-1 flex items-center gap-2">
        <span>🎬</span> Video References
      </h3>
      <p className="text-xs text-slate-400 mb-4">YouTube videos to help you learn related English expressions</p>

      <div className="space-y-5">
        {Object.entries(groupedVideos).map(([topic, topicVideos]) => (
          <div key={topic}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{topic}</span>
            </div>
            <div className="space-y-2">
              {topicVideos.map((video) => (
                <a
                  key={video.id}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all group"
                >
                  {video.thumbnail ? (
                    <div className="relative w-28 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                        <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-28 h-16 flex-shrink-0 rounded-lg bg-red-100 flex items-center justify-center">
                      <svg className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 line-clamp-2 group-hover:text-indigo-700 transition-colors leading-tight">
                      {video.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{video.channelTitle}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
