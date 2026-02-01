import { NextResponse } from 'next/server'

// Map Open Library subjects to our genre categories
const SUBJECT_TO_GENRE: Record<string, string> = {
  'science fiction': 'Sci-Fi',
  'sci-fi': 'Sci-Fi',
  'science_fiction': 'Sci-Fi',
  'futuristic': 'Sci-Fi',
  'space': 'Sci-Fi',
  'aliens': 'Sci-Fi',
  'cyberpunk': 'Sci-Fi',
  'dystopia': 'Sci-Fi',
  'fantasy': 'Fantasy',
  'magic': 'Fantasy',
  'epic fantasy': 'Fantasy',
  'dragons': 'Fantasy',
  'wizards': 'Fantasy',
  'mythology': 'Fantasy',
  'mystery': 'Mystery',
  'detective': 'Mystery',
  'crime': 'Mystery',
  'thriller': 'Mystery',
  'suspense': 'Mystery',
  'noir': 'Mystery',
  'philosophy': 'Philosophy',
  'ethics': 'Philosophy',
  'metaphysics': 'Philosophy',
  'existentialism': 'Philosophy',
  'logic': 'Philosophy',
  'nonfiction': 'Non-Fiction',
  'non-fiction': 'Non-Fiction',
  'history': 'Non-Fiction',
  'science': 'Non-Fiction',
  'true crime': 'Non-Fiction',
  'fiction': 'Literary Fiction',
  'literary fiction': 'Literary Fiction',
  'classic': 'Literary Fiction',
  'literature': 'Literary Fiction',
  'novel': 'Literary Fiction',
  'romance': 'Romance',
  'love': 'Romance',
  'love stories': 'Romance',
  'romantic': 'Romance',
  'horror': 'Horror',
  'gothic': 'Horror',
  'supernatural': 'Horror',
  'scary': 'Horror',
  'zombies': 'Horror',
  'vampires': 'Horror',
  'ghosts': 'Horror',
  'historical fiction': 'Historical Fiction',
  'historical': 'Historical Fiction',
  'historical novel': 'Historical Fiction',
  'war': 'Historical Fiction',
  'biography': 'Biography',
  'autobiography': 'Biography',
  'memoir': 'Biography',
  'biographies': 'Biography',
  'self-help': 'Self-Help',
  'self help': 'Self-Help',
  'personal development': 'Self-Help',
  'motivation': 'Self-Help',
  'inspirational': 'Self-Help',
  'poetry': 'Poetry',
  'poems': 'Poetry',
  'verse': 'Poetry',
  'poet': 'Poetry',
}

function detectGenre(subjects: string[]): string {
  if (!subjects || subjects.length === 0) return 'Literary Fiction'
  
  // Score each genre based on subject matches
  const genreScores: Record<string, number> = {
    'Sci-Fi': 0,
    'Fantasy': 0,
    'Mystery': 0,
    'Philosophy': 0,
    'Non-Fiction': 0,
    'Literary Fiction': 0,
    'Romance': 0,
    'Horror': 0,
    'Historical Fiction': 0,
    'Biography': 0,
    'Self-Help': 0,
    'Poetry': 0,
  }
  
  for (const subject of subjects) {
    const lowerSubject = subject.toLowerCase()
    for (const [keyword, genre] of Object.entries(SUBJECT_TO_GENRE)) {
      if (lowerSubject.includes(keyword)) {
        genreScores[genre] += 1
      }
    }
  }
  
  // Find genre with highest score
  let maxScore = 0
  let detectedGenre = 'Literary Fiction'
  for (const [genre, score] of Object.entries(genreScores)) {
    if (score > maxScore) {
      maxScore = score
      detectedGenre = genre
    }
  }
  
  return detectedGenre
}

export interface SearchResult {
  id: string
  title: string
  author: string
  genre: string
  year: number
  coverUrl?: string
  subjects: string[]
  description?: string
}

async function fetchBookDescription(workKey: string): Promise<string | undefined> {
  try {
    const response = await fetch(`https://openlibrary.org${workKey}.json`)
    if (!response.ok) return undefined
    const data = await response.json()
    if (typeof data.description === 'string') {
      return data.description
    }
    if (data.description?.value) {
      return data.description.value
    }
    return undefined
  } catch {
    return undefined
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const limit = parseInt(searchParams.get('limit') || '8')

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    // Search Open Library by title
    const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=${limit}&fields=key,title,author_name,first_publish_year,cover_i,subject`
    
    const response = await fetch(searchUrl)
    if (!response.ok) {
      throw new Error(`Open Library API error: ${response.status}`)
    }

    const data = await response.json()
    const docs = data.docs || []

    // Transform results with genre detection
    const results: SearchResult[] = await Promise.all(
      docs.map(async (doc: {
        key: string
        title: string
        author_name?: string[]
        first_publish_year?: number
        cover_i?: number
        subject?: string[]
      }) => {
        const subjects = doc.subject?.slice(0, 20) || []
        const genre = detectGenre(subjects)
        
        return {
          id: doc.key.replace('/works/', ''),
          title: doc.title,
          author: doc.author_name?.[0] || 'Unknown Author',
          genre,
          year: doc.first_publish_year || 0,
          coverUrl: doc.cover_i 
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` 
            : undefined,
          subjects: subjects.slice(0, 10),
          description: await fetchBookDescription(doc.key),
        }
      })
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error searching books:', error)
    return NextResponse.json({ error: 'Failed to search books' }, { status: 500 })
  }
}
