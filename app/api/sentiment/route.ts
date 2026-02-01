import { generateText, Output } from 'ai'
import { z } from 'zod'
import { NextResponse } from 'next/server'

const sentimentSchema = z.object({
  moody: z.number().min(0).max(1).describe('How emotionally dark, atmospheric, or melancholic the book is (0-1)'),
  scientific: z.number().min(0).max(1).describe('How much the book deals with science, technology, or factual content (0-1)'),
  optimistic: z.number().min(0).max(1).describe('How hopeful, uplifting, or positive the book tone is (0-1)'),
  philosophical: z.number().min(0).max(1).describe('How much the book explores deep existential or ethical questions (0-1)'),
  adventurous: z.number().min(0).max(1).describe('How much action, exploration, or excitement the book contains (0-1)'),
})

export type SentimentScores = z.infer<typeof sentimentSchema>

interface BookInput {
  id: string
  title: string
  author: string
  genre: string
  subjects?: string[]
  description?: string
}

export async function POST(request: Request) {
  try {
    const { books }: { books: BookInput[] } = await request.json()

    if (!books || !Array.isArray(books) || books.length === 0) {
      return NextResponse.json({ error: 'Books array is required' }, { status: 400 })
    }

    // Process books in parallel with batching to avoid rate limits
    const BATCH_SIZE = 5
    const results: Record<string, SentimentScores> = {}

    for (let i = 0; i < books.length; i += BATCH_SIZE) {
      const batch = books.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.all(
        batch.map(async (book) => {
          try {
            const prompt = buildPrompt(book)

            const { output } = await generateText({
              model: 'openai/gpt-4o-mini',
              output: Output.object({
                schema: sentimentSchema,
              }),
              prompt,
              temperature: 0.3, // Lower temperature for more consistent scoring
            })

            return { id: book.id, scores: output }
          } catch (error) {
            console.error(`Error generating sentiment for ${book.title}:`, error)
            // Return fallback scores based on genre if LLM fails
            return { id: book.id, scores: getFallbackScores(book.genre) }
          }
        })
      )

      for (const result of batchResults) {
        if (result.scores) {
          results[result.id] = result.scores
        }
      }
    }

    return NextResponse.json({ sentiments: results })
  } catch (error) {
    console.error('Error in sentiment API:', error)
    return NextResponse.json({ error: 'Failed to generate sentiments' }, { status: 500 })
  }
}

function buildPrompt(book: BookInput): string {
  let prompt = `Analyze the following book and provide sentiment/mood scores from 0 to 1 for each dimension.

Book: "${book.title}" by ${book.author}
Genre: ${book.genre}`

  if (book.subjects && book.subjects.length > 0) {
    prompt += `\nSubjects/Themes: ${book.subjects.slice(0, 5).join(', ')}`
  }

  if (book.description) {
    prompt += `\nDescription: ${book.description.slice(0, 500)}`
  }

  prompt += `

Based on your knowledge of this book (or similar books if unfamiliar), score each dimension:
- moody: emotional darkness, atmosphere, melancholy (0 = light/cheerful, 1 = dark/brooding)
- scientific: science, technology, factual content (0 = no science, 1 = highly scientific)
- optimistic: hope, positivity, uplifting tone (0 = bleak/pessimistic, 1 = very hopeful)
- philosophical: existential/ethical depth (0 = surface-level, 1 = deeply philosophical)
- adventurous: action, exploration, excitement (0 = slow/contemplative, 1 = high adventure)

Provide scores as decimals between 0 and 1.`

  return prompt
}

function getFallbackScores(genre: string): SentimentScores {
  // Genre-based fallback scores when LLM fails
  const fallbacks: Record<string, SentimentScores> = {
    'Sci-Fi': { moody: 0.5, scientific: 0.9, optimistic: 0.5, philosophical: 0.7, adventurous: 0.7 },
    'Non-Fiction': { moody: 0.3, scientific: 0.8, optimistic: 0.6, philosophical: 0.6, adventurous: 0.3 },
    'Literary Fiction': { moody: 0.6, scientific: 0.2, optimistic: 0.4, philosophical: 0.8, adventurous: 0.3 },
    Fantasy: { moody: 0.5, scientific: 0.1, optimistic: 0.6, philosophical: 0.4, adventurous: 0.9 },
    Mystery: { moody: 0.7, scientific: 0.4, optimistic: 0.4, philosophical: 0.3, adventurous: 0.6 },
    Philosophy: { moody: 0.4, scientific: 0.3, optimistic: 0.5, philosophical: 1.0, adventurous: 0.1 },
  }

  return fallbacks[genre] || { moody: 0.5, scientific: 0.5, optimistic: 0.5, philosophical: 0.5, adventurous: 0.5 }
}
