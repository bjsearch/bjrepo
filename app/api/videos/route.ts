import { NextRequest, NextResponse } from 'next/server'
import { YouTubeVideo } from '@/lib/types'
import { getSession } from '@/lib/auth'

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY

const TOPIC_QUERIES: Record<string, string> = {
  grammar: 'English grammar tips for beginners',
  expressions: 'modern English expressions native speakers use',
  conversation: 'English conversation practice daily life',
  writing: 'improve English writing skills',
  vocabulary: 'English vocabulary advanced words',
  idioms: 'English idioms and phrases',
  pronunciation: 'English pronunciation tips',
}

function buildSearchQuery(topic: string): string {
  const topicLower = topic.toLowerCase()
  for (const [key, query] of Object.entries(TOPIC_QUERIES)) {
    if (topicLower.includes(key)) return query
  }
  return `English learning ${topic} tips expressions`
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { topics } = await request.json()

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ videos: [] })
    }

    if (!YOUTUBE_API_KEY) {
      // Return mock data when no API key
      const mockVideos: YouTubeVideo[] = topics.slice(0, 3).map((topic: string, i: number) => ({
        id: `mock-${i}`,
        title: `English ${topic} - Tips & Expressions for Learners`,
        channelTitle: 'English Learning Channel',
        thumbnail: `https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg`,
        url: `https://www.youtube.com/results?search_query=english+${encodeURIComponent(topic)}+learning`,
        description: `Learn English ${topic} expressions and tips used by native speakers`,
        topic,
      }))
      return NextResponse.json({ videos: mockVideos })
    }

    const searchTopics = topics.slice(0, 3)
    const videoPromises = searchTopics.map(async (topic: string) => {
      const query = buildSearchQuery(topic)
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=2&relevanceLanguage=en&videoDuration=medium&key=${YOUTUBE_API_KEY}`

      const response = await fetch(url)
      if (!response.ok) return []

      const data = await response.json()
      if (!data.items) return []

      return data.items.map((item: {
        id: { videoId: string }
        snippet: {
          title: string
          channelTitle: string
          thumbnails: { medium?: { url: string }; default?: { url: string } }
          description: string
        }
      }): YouTubeVideo => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        description: item.snippet.description,
        topic,
      }))
    })

    const results = await Promise.all(videoPromises)
    const videos = results.flat().slice(0, 6)

    return NextResponse.json({ videos })
  } catch (error) {
    console.error('YouTube API error:', error)
    return NextResponse.json({ videos: [] })
  }
}
