import { NextResponse } from 'next/server'

// Map our genre names to Open Library subject queries
const GENRE_TO_SUBJECTS: Record<string, string[]> = {
  'Sci-Fi': ['science_fiction', 'sci-fi', 'futuristic'],
  'Non-Fiction': ['nonfiction', 'history', 'science'],
  'Literary Fiction': ['literary_fiction', 'classic_literature', 'fiction'],
  'Fantasy': ['fantasy', 'magic', 'epic_fantasy'],
  'Mystery': ['mystery', 'detective', 'crime_fiction', 'thriller'],
  'Philosophy': ['philosophy', 'ethics', 'metaphysics'],
  'Romance': ['romance', 'love_stories', 'romantic_fiction'],
  'Horror': ['horror', 'gothic', 'supernatural', 'scary'],
  'Historical Fiction': ['historical_fiction', 'historical_novel'],
  'Biography': ['biography', 'autobiography', 'memoir'],
  'Self-Help': ['self-help', 'personal_development', 'motivation'],
  'Poetry': ['poetry', 'poems', 'verse'],
}

export interface OpenLibraryBook {
  key: string
  title: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  subject?: string[]
  description?: string
  number_of_pages_median?: number
  ratings_average?: number
}

export interface BookData {
  id: string
  title: string
  author: string
  genre: string
  year: number
  coverUrl?: string
  subjects: string[]
  description?: string
  pageCount?: number
  rating?: number
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
  const genre = searchParams.get('genre')
  const limit = parseInt(searchParams.get('limit') || '10')
  const withDescriptions = searchParams.get('withDescriptions') === 'true'

  if (!genre) {
    return NextResponse.json({ error: 'Genre parameter is required' }, { status: 400 })
  }

  const subjects = GENRE_TO_SUBJECTS[genre]
  if (!subjects) {
    return NextResponse.json({ error: 'Invalid genre' }, { status: 400 })
  }

  try {
    // Search Open Library by subject
    const subjectQuery = subjects[0] // Use primary subject
    const searchUrl = `https://openlibrary.org/search.json?subject=${encodeURIComponent(subjectQuery)}&limit=${limit}&fields=key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,ratings_average`

    const response = await fetch(searchUrl)
    if (!response.ok) {
      throw new Error(`Open Library API error: ${response.status}`)
    }

    const data = await response.json()
    const docs: OpenLibraryBook[] = data.docs || []

    // Transform to our BookData format
    const books: BookData[] = await Promise.all(
      docs.map(async (doc) => {
        const book: BookData = {
          id: doc.key.replace('/works/', ''),
          title: doc.title,
          author: doc.author_name?.[0] || 'Unknown Author',
          genre,
          year: doc.first_publish_year || 0,
          coverUrl: doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : undefined,
          subjects: doc.subject?.slice(0, 10) || [],
          pageCount: doc.number_of_pages_median,
          rating: doc.ratings_average,
        }

        // Fetch description if requested
        if (withDescriptions) {
          book.description = await fetchBookDescription(doc.key)
        }

        return book
      })
    )

    return NextResponse.json({ books, total: data.numFound })
  } catch (error) {
    console.error('Error fetching books:', error)
    return NextResponse.json({ error: 'Failed to fetch books from Open Library' }, { status: 500 })
  }
}
