"use client"

import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import * as d3 from "d3"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Book, X, Sparkles, ZoomIn, ZoomOut, Maximize2, ArrowLeft, Layers, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import BookCoverBackground from "@/components/BookCoverBackground"

// Genre color mapping
const genreColors: Record<string, string> = {
  "Sci-Fi": "#06b6d4",
  "Non-Fiction": "#8b5cf6",
  "Literary Fiction": "#ec4899",
  "Fantasy": "#f59e0b",
  "Mystery": "#10b981",
  "Philosophy": "#6366f1",
  "Romance": "#f43f5e",
  "Horror": "#dc2626",
  "Historical Fiction": "#a16207",
  "Biography": "#0891b2",
  "Self-Help": "#84cc16",
  "Poetry": "#d946ef",
}

// Genre descriptions for the initial view
const genreDescriptions: Record<string, string> = {
  "Sci-Fi": "Explores future technology, space exploration, and speculative science",
  "Non-Fiction": "Real-world knowledge, history, science, and human understanding",
  "Literary Fiction": "Character-driven narratives exploring the human condition",
  "Fantasy": "Magical worlds, epic quests, and mythological adventures",
  "Mystery": "Suspenseful puzzles, crime solving, and psychological tension",
  "Philosophy": "Fundamental questions about existence, ethics, and meaning",
  "Romance": "Love stories, relationships, and emotional connections",
  "Horror": "Fear, supernatural terror, and psychological dread",
  "Historical Fiction": "Stories set in past eras with historical authenticity",
  "Biography": "True stories of remarkable lives and achievements",
  "Self-Help": "Personal growth, motivation, and life improvement",
  "Poetry": "Lyrical expression, verse, and emotional artistry",
}

// Sentiment scores type
interface SentimentScores {
  moody: number
  scientific: number
  optimistic: number
  philosophical: number
  adventurous: number
}

// Book node interface
interface BookNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  author: string
  genre: string
  year: number
  coverUrl?: string
  description?: string
  sentimentScores: SentimentScores
}

// Genre node interface
interface GenreNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  color: string
  bookCount: number
}

// Link interface
interface GraphLink extends d3.SimulationLinkDatum<BookNode | GenreNode> {
  similarityWeight: number
  reason: string
}

// API response types
interface BookApiResponse {
  books: Array<{
    id: string
    title: string
    author: string
    genre: string
    year: number
    coverUrl?: string
    subjects: string[]
    description?: string
  }>
  total: number
}

interface SentimentApiResponse {
  sentiments: Record<string, SentimentScores>
}

// Calculate cosine similarity between two sentiment profiles
function calculateSimilarity(a: SentimentScores, b: SentimentScores): number {
  const aVec = [a.moody, a.scientific, a.optimistic, a.philosophical, a.adventurous]
  const bVec = [b.moody, b.scientific, b.optimistic, b.philosophical, b.adventurous]
  
  const dotProduct = aVec.reduce((sum, val, i) => sum + val * bVec[i], 0)
  const magnitudeA = Math.sqrt(aVec.reduce((sum, val) => sum + val * val, 0))
  const magnitudeB = Math.sqrt(bVec.reduce((sum, val) => sum + val * val, 0))
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0
  return dotProduct / (magnitudeA * magnitudeB)
}

// Generate explanation for why two books are connected
function generateConnectionReason(bookA: BookNode, bookB: BookNode, similarity: number): string {
  const reasons: string[] = []
  const a = bookA.sentimentScores
  const b = bookB.sentimentScores
  
  const dimensions = [
    { name: "moody atmosphere", diff: Math.abs(a.moody - b.moody), avg: (a.moody + b.moody) / 2 },
    { name: "scientific rigor", diff: Math.abs(a.scientific - b.scientific), avg: (a.scientific + b.scientific) / 2 },
    { name: "optimistic outlook", diff: Math.abs(a.optimistic - b.optimistic), avg: (a.optimistic + b.optimistic) / 2 },
    { name: "philosophical depth", diff: Math.abs(a.philosophical - b.philosophical), avg: (a.philosophical + b.philosophical) / 2 },
    { name: "adventurous spirit", diff: Math.abs(a.adventurous - b.adventurous), avg: (a.adventurous + b.adventurous) / 2 },
  ]
  
  dimensions.sort((x, y) => (x.diff - y.diff) + (y.avg - x.avg) * 0.5)
  
  const topMatches = dimensions.slice(0, 2)
  
  if (topMatches[0].avg > 0.5) {
    reasons.push(`Both share strong ${topMatches[0].name}`)
  }
  if (topMatches[1].avg > 0.5) {
    reasons.push(`similar ${topMatches[1].name}`)
  }
  
  if (reasons.length === 0) {
    return `These works share a ${Math.round(similarity * 100)}% thematic similarity based on their emotional and intellectual profiles.`
  }
  
  return `${reasons.join(" and ")}. Overall ${Math.round(similarity * 100)}% thematic match.`
}

// Calculate genre similarity based on shared thematic elements
function calculateGenreSimilarity(genreA: string, genreB: string): { weight: number; reason: string } {
  const similarities: Record<string, Record<string, { weight: number; reason: string }>> = {
    "Sci-Fi": {
      "Non-Fiction": { weight: 0.7, reason: "Scientific exploration and intellectual curiosity" },
      "Literary Fiction": { weight: 0.6, reason: "Dystopian themes and social commentary" },
      "Fantasy": { weight: 0.5, reason: "World-building and speculative elements" },
      "Mystery": { weight: 0.4, reason: "Problem-solving and discovery" },
      "Philosophy": { weight: 0.75, reason: "Existential questions and human nature" },
    },
    "Non-Fiction": {
      "Philosophy": { weight: 0.85, reason: "Pursuit of knowledge and understanding" },
      "Literary Fiction": { weight: 0.5, reason: "Human condition and historical context" },
      "Mystery": { weight: 0.45, reason: "Investigation and analysis" },
      "Fantasy": { weight: 0.3, reason: "Cultural mythology and archetypes" },
    },
    "Literary Fiction": {
      "Philosophy": { weight: 0.8, reason: "Deep character study and moral questions" },
      "Mystery": { weight: 0.55, reason: "Psychological exploration" },
      "Fantasy": { weight: 0.45, reason: "Narrative storytelling traditions" },
    },
    "Fantasy": {
      "Mystery": { weight: 0.5, reason: "Quest narratives and hidden truths" },
      "Philosophy": { weight: 0.55, reason: "Mythological wisdom and hero journeys" },
    },
    "Mystery": {
      "Philosophy": { weight: 0.5, reason: "Search for truth and meaning" },
    },
  }
  
  if (genreA === genreB) return { weight: 1, reason: "Same genre" }
  
  const lookup = similarities[genreA]?.[genreB] || similarities[genreB]?.[genreA]
  return lookup || { weight: 0.3, reason: "Shared literary heritage" }
}

// Sentiment bar component
function SentimentBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-mono">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}

type ViewMode = "genres" | "books"
type LoadingState = "idle" | "fetching-books" | "generating-sentiments"

export default function KnowledgeGraphExplorer() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedBook, setSelectedBook] = useState<BookNode | null>(null)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [connectedBook, setConnectedBook] = useState<BookNode | null>(null)
  const [connectionReason, setConnectionReason] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("genres")
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  
  // Real data states
  const [loadingState, setLoadingState] = useState<LoadingState>("idle")
  const [genreBooks, setGenreBooks] = useState<BookNode[]>([])
  const [error, setError] = useState<string | null>(null)
  
  // Search states
  const [searchResults, setSearchResults] = useState<Array<{
    id: string
    title: string
    author: string
    genre: string
    year: number
    coverUrl?: string
    subjects: string[]
    description?: string
  }>>([])
  const [isSearching, setIsSearching] = useState(false)
  const [highlightedBookId, setHighlightedBookId] = useState<string | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Cache for already fetched genres
  const booksCacheRef = useRef<Map<string, BookNode[]>>(new Map())

  // Store simulation reference
  const simulationRef = useRef<d3.Simulation<GenreNode | BookNode, GraphLink> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // Estimated book counts per genre (we show these before fetching)
  const estimatedCounts: Record<string, number> = {
  "Sci-Fi": 1000,
  "Non-Fiction": 5000,
  "Literary Fiction": 3000,
  "Fantasy": 2000,
  "Mystery": 1500,
  "Philosophy": 800,
  "Romance": 4000,
  "Horror": 1200,
  "Historical Fiction": 2500,
  "Biography": 3500,
  "Self-Help": 2800,
  "Poetry": 1800,
  }

  // Generate genre graph data
  const genreGraphData = useMemo(() => {
    const genres = Object.keys(genreColors)
    const nodes: GenreNode[] = genres.map((genre) => ({
      id: genre,
      name: genre,
      color: genreColors[genre],
      bookCount: estimatedCounts[genre],
    }))

    const links: GraphLink[] = []
    for (let i = 0; i < genres.length; i++) {
      for (let j = i + 1; j < genres.length; j++) {
        const { weight, reason } = calculateGenreSimilarity(genres[i], genres[j])
        if (weight > 0.4) {
          links.push({
            source: genres[i],
            target: genres[j],
            similarityWeight: weight,
            reason,
          })
        }
      }
    }

    return { nodes, links }
  }, [])

  // Generate book graph data from fetched books - creates a proper graph (not tree) structure
  const bookGraphData = useMemo(() => {
    if (genreBooks.length === 0) return { nodes: [], links: [] }

    const nodes: BookNode[] = genreBooks.map((book) => ({ ...book }))
    const links: GraphLink[] = []
    
    // Calculate all pairs and their similarities
    const allPairs: { i: number; j: number; sim: number }[] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const sim = calculateSimilarity(nodes[i].sentimentScores, nodes[j].sentimentScores)
        allPairs.push({ i, j, sim })
      }
    }
    
    // Sort by similarity (highest first)
    allPairs.sort((a, b) => b.sim - a.sim)
    
    // Graph-building strategy: ensure each node has 2-3 connections for a proper graph structure
    // This prevents hub-and-spoke patterns and creates cross-links between nodes
    const nodeConnectionCount: Map<number, number> = new Map()
    const selectedPairs: typeof allPairs = []
    const maxConnectionsPerNode = 3
    const targetTotalConnections = Math.floor(nodes.length * 1.5) // ~1.5 connections per node on average
    
    // First pass: greedily select top pairs while ensuring distribution
    for (const pair of allPairs) {
      const countI = nodeConnectionCount.get(pair.i) || 0
      const countJ = nodeConnectionCount.get(pair.j) || 0
      
      // Only add if both nodes have room for more connections
      if (countI < maxConnectionsPerNode && countJ < maxConnectionsPerNode) {
        selectedPairs.push(pair)
        nodeConnectionCount.set(pair.i, countI + 1)
        nodeConnectionCount.set(pair.j, countJ + 1)
        
        // Stop if we have enough connections
        if (selectedPairs.length >= targetTotalConnections) break
      }
    }
    
    // Sort selected pairs by similarity weight (highest first) for final pruning
    selectedPairs.sort((a, b) => b.sim - a.sim)
    
    // Remove bottom 30% of edges by weight - keep only top 70%
    const edgesToKeep = Math.max(1, Math.ceil(selectedPairs.length * 0.7))
    const prunedPairs = selectedPairs.slice(0, edgesToKeep)
    
    // Create links from pruned pairs (top 70% by weight)
    for (const pair of prunedPairs) {
      links.push({
        source: nodes[pair.i].id,
        target: nodes[pair.j].id,
        similarityWeight: pair.sim,
        reason: generateConnectionReason(nodes[pair.i], nodes[pair.j], pair.sim),
      })
    }
    
    // Find disconnected components and connect each one to the searched book
    // Uses Union-Find to detect connected components
    const parent: number[] = nodes.map((_, i) => i)
    const find = (x: number): number => {
      if (parent[x] !== x) parent[x] = find(parent[x])
      return parent[x]
    }
    const union = (x: number, y: number) => {
      const px = find(x), py = find(y)
      if (px !== py) parent[px] = py
    }
    
    // Build initial connectivity from existing links
    const nodeIdToIndex = new Map(nodes.map((n, i) => [n.id, i]))
    for (const link of links) {
      const sourceIdx = nodeIdToIndex.get(link.source as string)
      const targetIdx = nodeIdToIndex.get(link.target as string)
      if (sourceIdx !== undefined && targetIdx !== undefined) {
        union(sourceIdx, targetIdx)
      }
    }
    
    // Find the searched book's index (or use first node if no searched book)
    const searchedIdx = highlightedBookId 
      ? nodeIdToIndex.get(highlightedBookId) ?? 0 
      : 0
    
    // Get all unique disconnected components (excluding the searched book's component)
    const searchedComponent = find(searchedIdx)
    const disconnectedComponents = new Set<number>()
    for (let i = 0; i < nodes.length; i++) {
      const componentRoot = find(i)
      if (componentRoot !== searchedComponent) {
        disconnectedComponents.add(componentRoot)
      }
    }
    
    // For each disconnected component, find the best edge to the SEARCHED BOOK specifically
    for (const componentRoot of disconnectedComponents) {
      // Find all nodes in this disconnected component
      const nodesInComponent = nodes
        .map((_, idx) => idx)
        .filter(idx => find(idx) === componentRoot)
      
      // Find the node in this component with highest similarity to the searched book
      let bestNodeIdx = -1
      let bestSimilarity = -1
      
      for (const nodeIdx of nodesInComponent) {
        const sim = calculateSimilarity(
          nodes[nodeIdx].sentimentScores, 
          nodes[searchedIdx].sentimentScores
        )
        if (sim > bestSimilarity) {
          bestSimilarity = sim
          bestNodeIdx = nodeIdx
        }
      }
      
      // Add edge from best node in disconnected component to the searched book
      if (bestNodeIdx !== -1) {
        links.push({
          source: nodes[bestNodeIdx].id,
          target: nodes[searchedIdx].id,
          similarityWeight: bestSimilarity,
          reason: generateConnectionReason(nodes[bestNodeIdx], nodes[searchedIdx], bestSimilarity),
        })
        // Merge this component with the searched book's component
        union(bestNodeIdx, searchedIdx)
      }
    }

    return { nodes, links }
  }, [genreBooks, highlightedBookId])

  // Fetch books from Open Library and generate sentiments
  const fetchBooksForGenre = useCallback(async (genre: string) => {
    // Check cache first
    if (booksCacheRef.current.has(genre)) {
      setGenreBooks(booksCacheRef.current.get(genre)!)
      return
    }

    setError(null)
    setLoadingState("fetching-books")

    try {
      // Step 1: Fetch books from Open Library
      const booksResponse = await fetch(`/api/books?genre=${encodeURIComponent(genre)}&limit=12&withDescriptions=true`)
      
      if (!booksResponse.ok) {
        throw new Error("Failed to fetch books from Open Library")
      }
      
      const booksData: BookApiResponse = await booksResponse.json()
      
      if (booksData.books.length === 0) {
        throw new Error("No books found for this genre")
      }

      setLoadingState("generating-sentiments")

      // Step 2: Generate sentiment scores using LLM
      const sentimentResponse = await fetch("/api/sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          books: booksData.books.map(b => ({
            id: b.id,
            title: b.title,
            author: b.author,
            genre: b.genre,
            subjects: b.subjects,
            description: b.description,
          }))
        })
      })

      if (!sentimentResponse.ok) {
        throw new Error("Failed to generate sentiment scores")
      }

      const sentimentData: SentimentApiResponse = await sentimentResponse.json()

      // Step 3: Combine book data with sentiments
      const booksWithSentiments: BookNode[] = booksData.books.map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        genre: book.genre,
        year: book.year || 0,
        coverUrl: book.coverUrl,
        description: book.description,
        sentimentScores: sentimentData.sentiments[book.id] || {
          moody: 0.5,
          scientific: 0.5,
          optimistic: 0.5,
          philosophical: 0.5,
          adventurous: 0.5,
        }
      }))

      // Cache the results
      booksCacheRef.current.set(genre, booksWithSentiments)
      setGenreBooks(booksWithSentiments)
      
    } catch (err) {
      console.error("Error fetching books:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoadingState("idle")
    }
  }, [])

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }
    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [])

  // Handle search filtering for loaded books
  const filteredBooks = genreBooks.filter(
    (book) =>
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase())
  )
  
  // Debounced search for Open Library API
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    // Don't search for short queries
    if (query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    
    setIsSearching(true)
    
    // Debounce the API call
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/books/search?q=${encodeURIComponent(query)}&limit=6`)
        if (response.ok) {
          const data = await response.json()
          setSearchResults(data.results || [])
        }
      } catch (err) {
        console.error("Search error:", err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }, [])
  
  // Handle selecting a book from search results
  const handleSearchBookSelect = useCallback(async (searchResult: {
    id: string
    title: string
    author: string
    genre: string
    year: number
    coverUrl?: string
    subjects: string[]
    description?: string
  }) => {
    setSearchQuery("")
    setSearchResults([])
    setHighlightedBookId(searchResult.id)
    
    const genre = searchResult.genre
    
    // Switch to the genre view and load books
    setSelectedGenre(genre)
    setViewMode("books")
    setSelectedBook(null)
    setConnectedBook(null)
    setConnectionReason("")
    
    // Check cache first
    if (booksCacheRef.current.has(genre)) {
      const cachedBooks = booksCacheRef.current.get(genre)!
      
      // Check if the searched book is already in the cache
      const existingBook = cachedBooks.find(b => b.id === searchResult.id)
      if (existingBook) {
        setGenreBooks(cachedBooks)
        // Auto-select the searched book
        setTimeout(() => {
          setSelectedBook(existingBook)
          findConnection(existingBook.id)
        }, 500)
        return
      }
    }
    
    // Need to fetch books for this genre
    setError(null)
    setLoadingState("fetching-books")
    
    try {
      // Fetch books, including the searched book title to ensure it's in results
      const booksResponse = await fetch(
        `/api/books?genre=${encodeURIComponent(genre)}&limit=11&withDescriptions=true`
      )
      
      if (!booksResponse.ok) {
        throw new Error("Failed to fetch books")
      }
      
      const booksData: BookApiResponse = await booksResponse.json()
      
      // Add the searched book to the list if not already present
      let books = booksData.books
      const hasSearchedBook = books.some(b => b.id === searchResult.id)
      if (!hasSearchedBook) {
        books = [
          {
            id: searchResult.id,
            title: searchResult.title,
            author: searchResult.author,
            genre: searchResult.genre,
            year: searchResult.year,
            coverUrl: searchResult.coverUrl,
            subjects: searchResult.subjects,
            description: searchResult.description,
          },
          ...books.slice(0, 11)
        ]
      }
      
      setLoadingState("generating-sentiments")
      
      // Generate sentiment scores
      const sentimentResponse = await fetch("/api/sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          books: books.map(b => ({
            id: b.id,
            title: b.title,
            author: b.author,
            genre: b.genre,
            subjects: b.subjects,
            description: b.description,
          }))
        })
      })
      
      if (!sentimentResponse.ok) {
        throw new Error("Failed to generate sentiment scores")
      }
      
      const sentimentData: SentimentApiResponse = await sentimentResponse.json()
      
      const booksWithSentiments: BookNode[] = books.map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        genre: book.genre,
        year: book.year || 0,
        coverUrl: book.coverUrl,
        description: book.description,
        sentimentScores: sentimentData.sentiments[book.id] || {
          moody: 0.5,
          scientific: 0.5,
          optimistic: 0.5,
          philosophical: 0.5,
          adventurous: 0.5,
        }
      }))
      
      booksCacheRef.current.set(genre, booksWithSentiments)
      setGenreBooks(booksWithSentiments)
      
      // Auto-select the searched book after graph renders
      const searchedBook = booksWithSentiments.find(b => b.id === searchResult.id)
      if (searchedBook) {
        setTimeout(() => {
          setSelectedBook(searchedBook)
          findConnection(searchedBook.id)
        }, 800)
      }
      
    } catch (err) {
      console.error("Error:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoadingState("idle")
    }
  }, [])

  // Zoom controls
  const handleZoom = (direction: "in" | "out" | "reset") => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    if (direction === "in") {
      svg.transition().duration(300).call(zoomRef.current.scaleBy, 1.3)
    } else if (direction === "out") {
      svg.transition().duration(300).call(zoomRef.current.scaleBy, 0.7)
    } else {
      svg.transition().duration(300).call(zoomRef.current.transform, d3.zoomIdentity)
    }
  }

  // Handle back to genres
  const handleBackToGenres = useCallback(() => {
    setViewMode("genres")
    setSelectedGenre(null)
    setSelectedBook(null)
    setConnectedBook(null)
    setConnectionReason("")
    setHighlightedBookId(null)
    setSearchQuery("")
    setSearchResults([])
    setGenreBooks([])
    setError(null)
  }, [])

  // Initialize D3 force simulation for genres
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || viewMode !== "genres") return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const { width, height } = dimensions

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform)
      })

    zoomRef.current = zoom
    svg.call(zoom)

    // Container for zoom/pan
    const container = svg.append("g")

    // Create defs for glow
    const defs = svg.append("defs")

    // Glow filter
    const filter = defs.append("filter").attr("id", "glow")
    filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur")
    const feMerge = filter.append("feMerge")
    feMerge.append("feMergeNode").attr("in", "coloredBlur")
    feMerge.append("feMergeNode").attr("in", "SourceGraphic")

    // Create simulation
    const simulation = d3
      .forceSimulation<GenreNode>(genreGraphData.nodes as GenreNode[])
      .force(
        "link",
        d3.forceLink<GenreNode, GraphLink>(genreGraphData.links)
          .id((d) => d.id)
          .distance(180)
          .strength((d) => d.similarityWeight * 0.3)
      )
      .force("charge", d3.forceManyBody().strength(-500))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(80))

    simulationRef.current = simulation

    // Draw links
    const links = container
      .append("g")
      .selectAll("line")
      .data(genreGraphData.links)
      .join("line")
      .attr("stroke", "rgba(255,255,255,0.12)")
      .attr("stroke-width", (d) => d.similarityWeight * 4)
      .attr("stroke-opacity", (d) => 0.15 + d.similarityWeight * 0.3)
      .attr("stroke-dasharray", "4,4")

    // Draw nodes
    const nodes = container
      .append("g")
      .selectAll<SVGGElement, GenreNode>("g")
      .data(genreGraphData.nodes as GenreNode[])
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, GenreNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on("drag", (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Outer glow circle
    nodes
      .append("circle")
      .attr("r", 55)
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", 0.15)
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.4)
      .attr("filter", "url(#glow)")

    // Inner circle
    nodes
      .append("circle")
      .attr("r", 40)
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", 0.3)
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 2)

    // Genre icon
    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", (d) => d.color)
      .attr("font-size", "22px")
      .text((d) => {
        const icons: Record<string, string> = {
          "Sci-Fi": "🚀",
          "Non-Fiction": "📚",
          "Literary Fiction": "✍️",
          "Fantasy": "🗡️",
          "Mystery": "🔍",
          "Philosophy": "🧠",
        }
        return icons[d.name] || "📖"
      })

    // Genre name label
    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", 65)
      .attr("fill", "white")
      .attr("font-size", "13px")
      .attr("font-weight", "600")
      .text((d) => d.name)

    // Book count
    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", 82)
      .attr("fill", "rgba(255,255,255,0.5)")
      .attr("font-size", "11px")
      .text((d) => `${d.bookCount.toLocaleString()}+ books`)

    // Click handler
    nodes.on("click", (event, d) => {
      event.stopPropagation()
      handleGenreClick(d.name)
    })

    // Hover effects
    nodes
      .on("mouseenter", function (_, d) {
        d3.select(this).selectAll("circle").transition().duration(200).attr("r", (_, i) => (i === 0 ? 65 : 48))
        d3.select(this).select("circle").attr("fill-opacity", 0.25)
      })
      .on("mouseleave", function () {
        d3.select(this).selectAll("circle").transition().duration(200).attr("r", (_, i) => (i === 0 ? 55 : 40))
        d3.select(this).select("circle").attr("fill-opacity", 0.15)
      })

    // Simulation tick
    simulation.on("tick", () => {
      links
        .attr("x1", (d) => (d.source as GenreNode).x || 0)
        .attr("y1", (d) => (d.source as GenreNode).y || 0)
        .attr("x2", (d) => (d.target as GenreNode).x || 0)
        .attr("y2", (d) => (d.target as GenreNode).y || 0)

      nodes.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`)
    })

    return () => {
      simulation.stop()
    }
  }, [dimensions, viewMode, genreGraphData])

  // Initialize D3 force simulation for books
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || viewMode !== "books" || !selectedGenre || bookGraphData.nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const { width, height } = dimensions

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform)
      })

    zoomRef.current = zoom
    svg.call(zoom)

    // Container for zoom/pan
    const container = svg.append("g")

    // Create defs for glow
    const defs = svg.append("defs")

    // Glow filter
    const filter = defs.append("filter").attr("id", "glow")
    filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur")
    const feMerge = filter.append("feMerge")
    feMerge.append("feMergeNode").attr("in", "coloredBlur")
    feMerge.append("feMergeNode").attr("in", "SourceGraphic")
    
    // Highlight glow filter (stronger, golden glow for searched book)
    const highlightFilter = defs.append("filter").attr("id", "highlight-glow")
    highlightFilter.append("feGaussianBlur").attr("stdDeviation", "8").attr("result", "coloredBlur")
    const highlightMerge = highlightFilter.append("feMerge")
    highlightMerge.append("feMergeNode").attr("in", "coloredBlur")
    highlightMerge.append("feMergeNode").attr("in", "coloredBlur")
    highlightMerge.append("feMergeNode").attr("in", "SourceGraphic")

    const genreColor = genreColors[selectedGenre]
    const highlightColor = "#fbbf24" // Golden/amber for highlight

  // Create simulation with highlighted book fixed at center
  // Adjusted forces to keep nodes closer together
  const simulation = d3
  .forceSimulation<BookNode>(bookGraphData.nodes)
  .force(
  "link",
  d3.forceLink<BookNode, GraphLink>(bookGraphData.links)
  .id((d) => d.id)
  .distance(100) // Reduced from 140 to bring nodes closer
  .strength((d) => d.similarityWeight * 0.6) // Increased strength to pull connected nodes together
  )
  .force("charge", d3.forceManyBody().strength(-200)) // Reduced repulsion from -350 to keep nodes closer
  .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1)) // Added centering strength
  .force("collision", d3.forceCollide().radius(45)) // Slightly reduced collision radius
    
    // If there's a highlighted book, fix it at the center
    if (highlightedBookId) {
      const highlightedNode = bookGraphData.nodes.find(n => n.id === highlightedBookId)
      if (highlightedNode) {
        highlightedNode.fx = width / 2
        highlightedNode.fy = height / 2
      }
    }

    simulationRef.current = simulation

    // Draw links
    const links = container
      .append("g")
      .selectAll("line")
      .data(bookGraphData.links)
      .join("line")
      .attr("stroke", genreColor)
      .attr("stroke-width", (d) => 1 + d.similarityWeight * 3)
      .attr("stroke-opacity", (d) => 0.2 + d.similarityWeight * 0.4)

    // Draw nodes
    const nodes = container
      .append("g")
      .selectAll<SVGGElement, BookNode>("g")
      .data(bookGraphData.nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, BookNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on("drag", (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Outer ring for highlighted book
    nodes
      .filter((d) => d.id === highlightedBookId)
      .append("circle")
      .attr("r", 48)
      .attr("fill", "none")
      .attr("stroke", highlightColor)
      .attr("stroke-width", 3)
      .attr("stroke-dasharray", "8,4")
      .attr("filter", "url(#highlight-glow)")
      .attr("class", "highlight-ring")

    // Node circles - highlighted book gets special styling
    nodes
      .append("circle")
      .attr("r", (d) => d.id === highlightedBookId ? 40 : 32)
      .attr("fill", (d) => d.id === highlightedBookId ? highlightColor : genreColor)
      .attr("fill-opacity", (d) => d.id === highlightedBookId ? 0.25 : 0.15)
      .attr("stroke", (d) => d.id === highlightedBookId ? highlightColor : genreColor)
      .attr("stroke-width", (d) => d.id === highlightedBookId ? 3 : 2)
      .attr("filter", (d) => d.id === highlightedBookId ? "url(#highlight-glow)" : "url(#glow)")

    // Inner circle
    nodes
      .append("circle")
      .attr("r", (d) => d.id === highlightedBookId ? 28 : 22)
      .attr("fill", (d) => d.id === highlightedBookId ? highlightColor : genreColor)
      .attr("fill-opacity", (d) => d.id === highlightedBookId ? 0.7 : 0.5)

    // Book icon in center (star for highlighted, book for others)
    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "white")
      .attr("font-size", (d) => d.id === highlightedBookId ? "18px" : "14px")
      .text((d) => d.id === highlightedBookId ? "⭐" : "📖")

    // "SEARCHED" label for highlighted book
    nodes
      .filter((d) => d.id === highlightedBookId)
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", -55)
      .attr("fill", highlightColor)
      .attr("font-size", "9px")
      .attr("font-weight", "700")
      .attr("letter-spacing", "1px")
      .text("SEARCHED")

    // Book title label
    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", (d) => d.id === highlightedBookId ? 56 : 48)
      .attr("fill", (d) => d.id === highlightedBookId ? highlightColor : "white")
      .attr("font-size", (d) => d.id === highlightedBookId ? "11px" : "10px")
      .attr("font-weight", (d) => d.id === highlightedBookId ? "600" : "500")
      .attr("opacity", 0.9)
      .text((d) => (d.title.length > 18 ? d.title.slice(0, 18) + "..." : d.title))

    // Author label
    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("y", 62)
      .attr("fill", "rgba(255,255,255,0.5)")
      .attr("font-size", "9px")
      .text((d) => (d.author.length > 20 ? d.author.slice(0, 20) + "..." : d.author))

    // Click handler
    nodes.on("click", (event, d) => {
      event.stopPropagation()
      setSelectedBook(d)
      findConnection(d.id)
    })

    // Hover effects
    nodes
      .on("mouseenter", function () {
        d3.select(this).selectAll("circle").transition().duration(200).attr("r", (_, i) => (i === 0 ? 38 : 26))
      })
      .on("mouseleave", function () {
        d3.select(this).selectAll("circle").transition().duration(200).attr("r", (_, i) => (i === 0 ? 32 : 22))
      })

    // Simulation tick
    simulation.on("tick", () => {
      links
        .attr("x1", (d) => (d.source as BookNode).x || 0)
        .attr("y1", (d) => (d.source as BookNode).y || 0)
        .attr("x2", (d) => (d.target as BookNode).x || 0)
        .attr("y2", (d) => (d.target as BookNode).y || 0)

      nodes.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`)
    })

    // Click on background to deselect
    svg.on("click", () => {
      setSelectedBook(null)
      setConnectedBook(null)
      setConnectionReason("")
    })

    return () => {
      simulation.stop()
    }
  }, [dimensions, viewMode, selectedGenre, bookGraphData, highlightedBookId])

  // Find connection between selected book and another
  const findConnection = useCallback(
    (bookId: string) => {
      if (viewMode !== "books") return
      
      const link = bookGraphData.links.find(
        (l) =>
          (typeof l.source === "object" ? (l.source as BookNode).id : l.source) === bookId ||
          (typeof l.target === "object" ? (l.target as BookNode).id : l.target) === bookId
      )
      if (link) {
        const connectedId =
          (typeof link.source === "object" ? (link.source as BookNode).id : link.source) === bookId
            ? typeof link.target === "object"
              ? (link.target as BookNode).id
              : link.target
            : typeof link.source === "object"
              ? (link.source as BookNode).id
              : link.source
        const connected = bookGraphData.nodes.find((n) => n.id === connectedId)
        setConnectedBook(connected || null)
        setConnectionReason(link.reason)
      }
    },
    [viewMode, bookGraphData]
  )

  // Handle genre selection
  const handleGenreClick = useCallback(async (genre: string) => {
    setSelectedGenre(genre)
    setViewMode("books")
    setSelectedBook(null)
    setConnectedBook(null)
    setConnectionReason("")
    setHighlightedBookId(null) // Clear any previous search highlight
    await fetchBooksForGenre(genre)
  }, [fetchBooksForGenre])

  // Collect all book cover URLs for the background
  const backgroundImages = useMemo(() => {
    const covers: string[] = []
    // Add loaded genre books covers
    genreBooks.forEach(book => {
      if (book.coverUrl) covers.push(book.coverUrl)
    })
    // If not enough, add some default Open Library covers
    if (covers.length < 6) {
      const defaultCovers = [
        'https://covers.openlibrary.org/b/id/8225261-L.jpg',
        'https://covers.openlibrary.org/b/id/8091016-L.jpg',
        'https://covers.openlibrary.org/b/id/7222246-L.jpg',
        'https://covers.openlibrary.org/b/id/8739161-L.jpg',
        'https://covers.openlibrary.org/b/id/10521270-L.jpg',
        'https://covers.openlibrary.org/b/id/12818647-L.jpg',
        'https://covers.openlibrary.org/b/id/8406786-L.jpg',
        'https://covers.openlibrary.org/b/id/6979861-L.jpg',
      ]
      covers.push(...defaultCovers.slice(0, 8 - covers.length))
    }
    return covers
  }, [genreBooks])

  return (
    <div className="h-screen w-screen bg-background overflow-hidden relative">
      {/* Dome Gallery Background with Book Covers */}
      <BookCoverBackground
        images={backgroundImages}
        fit={0.8}
        minRadius={600}
        maxVerticalRotationDeg={0}
        segments={34}
        dragDampening={2}
        autoRotate
      />

      {/* Search bar - always enabled, searches Open Library API */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
        <div
          className={`
            relative flex items-center gap-3 px-5 py-3 
            bg-card/60 backdrop-blur-xl border rounded-full
            transition-all duration-300
            ${searchFocused ? "border-primary shadow-[0_0_30px_rgba(6,182,212,0.3)] w-[450px]" : "border-border/50 w-[380px]"}
          `}
        >
          {isSearching ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <Search className="w-5 h-5 text-muted-foreground" />
          )}
          <input
            type="text"
            placeholder="Search any book by title..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 300)}
            className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("")
                setSearchResults([])
                setHighlightedBookId(null)
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search results dropdown - shows results from Open Library API */}
        <AnimatePresence>
          {searchQuery.length >= 2 && (searchResults.length > 0 || isSearching) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full mt-2 w-full bg-card/90 backdrop-blur-xl border border-border rounded-xl overflow-hidden shadow-2xl max-h-[400px] overflow-y-auto"
            >
              {isSearching && searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Searching Open Library...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground">
                  <p className="text-sm">No books found</p>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 border-b border-border/50 bg-secondary/30">
                    <p className="text-xs text-muted-foreground">
                      Results from Open Library - Click to explore related books
                    </p>
                  </div>
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSearchBookSelect(result)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-secondary/50 transition-colors text-left border-b border-border/20 last:border-0"
                    >
                      {result.coverUrl ? (
                        <img
                          src={result.coverUrl || "/placeholder.svg"}
                          alt={result.title}
                          className="w-10 h-14 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-secondary rounded flex items-center justify-center">
                          <Book className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-foreground font-medium truncate">{result.title}</div>
                        <div className="text-muted-foreground text-sm truncate">{result.author}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${genreColors[result.genre]}20`,
                              color: genreColors[result.genre],
                            }}
                          >
                            {result.genre}
                          </span>
                          {result.year > 0 && (
                            <span className="text-xs text-muted-foreground">{result.year}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Back button (when viewing books) */}
      <AnimatePresence>
        {viewMode === "books" && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute top-6 left-6 z-20"
          >
            <Button
              variant="outline"
              onClick={handleBackToGenres}
              className="bg-card/60 backdrop-blur-xl border-border hover:bg-secondary gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Genres
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      <AnimatePresence>
        {loadingState !== "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm z-40 flex items-center justify-center"
          >
            <div className="bg-card border border-border rounded-2xl p-8 text-center max-w-md">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {loadingState === "fetching-books" ? "Fetching Books" : "Analyzing Sentiments"}
              </h3>
              <p className="text-muted-foreground text-sm">
                {loadingState === "fetching-books" 
                  ? "Searching Open Library for books in this genre..."
                  : "Using AI to analyze emotional and thematic profiles of each book..."
                }
              </p>
              {selectedGenre && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: genreColors[selectedGenre] }} />
                  <span className="text-sm text-muted-foreground">{selectedGenre}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      <AnimatePresence>
        {error && viewMode === "books" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm z-40 flex items-center justify-center"
          >
            <div className="bg-card border border-destructive/50 rounded-2xl p-8 text-center max-w-md">
              <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                <X className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Error Loading Books</h3>
              <p className="text-muted-foreground text-sm mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={handleBackToGenres}>
                  Back to Genres
                </Button>
                <Button onClick={() => selectedGenre && fetchBooksForGenre(selectedGenre)}>
                  Retry
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current genre indicator (when viewing books) */}
      <AnimatePresence>
        {viewMode === "books" && selectedGenre && loadingState === "idle" && !error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-10"
          >
            <div
              className="px-4 py-2 rounded-full flex items-center gap-2"
              style={{
                backgroundColor: genreColors[selectedGenre] + "20",
                borderColor: genreColors[selectedGenre],
                borderWidth: 1,
              }}
            >
              <Layers className="w-4 h-4" style={{ color: genreColors[selectedGenre] }} />
              <span className="text-sm font-medium" style={{ color: genreColors[selectedGenre] }}>
                {selectedGenre}
              </span>
              <span className="text-xs text-muted-foreground">
                ({genreBooks.length} books loaded)
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend (only in genre view) */}
      <AnimatePresence>
        {viewMode === "genres" && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute top-6 left-6 z-10 bg-card/60 backdrop-blur-xl border border-border rounded-xl p-4"
          >
            <h3 className="text-sm font-semibold text-foreground mb-3">Click a genre to explore</h3>
            <div className="space-y-2">
              {Object.entries(genreColors).map(([genre, color]) => (
                <div key={genre} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-muted-foreground">{genre}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Data source info (in genre view) */}
      <AnimatePresence>
        {viewMode === "genres" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-card/60 backdrop-blur-xl border border-border rounded-xl px-4 py-2"
          >
            <p className="text-xs text-muted-foreground text-center">
              Powered by <span className="text-primary">Open Library API</span> + <span className="text-accent">AI Sentiment Analysis</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom controls */}
      <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleZoom("in")}
          className="bg-card/60 backdrop-blur-xl border-border hover:bg-secondary"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleZoom("out")}
          className="bg-card/60 backdrop-blur-xl border-border hover:bg-secondary"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => handleZoom("reset")}
          className="bg-card/60 backdrop-blur-xl border-border hover:bg-secondary"
        >
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="absolute inset-0">
        <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="w-full h-full" />
      </div>

      {/* Details sidebar */}
      <AnimatePresence>
        {selectedBook && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute top-0 right-0 h-full w-[400px] bg-card/95 backdrop-blur-xl border-l border-border z-30 overflow-y-auto"
          >
            <div className="p-6">
              {/* Close button */}
              <button
                onClick={() => {
                  setSelectedBook(null)
                  setConnectedBook(null)
                  setConnectionReason("")
                }}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Searched book indicator */}
              {selectedBook.id === highlightedBookId && (
                <div className="mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
                  <span className="text-amber-400 text-lg">⭐</span>
                  <span className="text-amber-400 text-sm font-medium">Your searched book</span>
                </div>
              )}

              {/* Book header */}
              <div className="mb-8">
                {selectedBook.coverUrl ? (
                  <img 
                    src={selectedBook.coverUrl || "/placeholder.svg"} 
                    alt={selectedBook.title}
                    className="w-20 h-28 object-cover rounded-lg mb-4 shadow-lg"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: genreColors[selectedBook.genre] + "30" }}
                  >
                    <Book className="w-8 h-8" style={{ color: genreColors[selectedBook.genre] }} />
                  </div>
                )}
                <h2 className="text-2xl font-bold text-foreground mb-1">{selectedBook.title}</h2>
                <p className="text-lg text-muted-foreground">{selectedBook.author}</p>
                <div className="flex items-center gap-3 mt-3">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: genreColors[selectedBook.genre] + "20",
                      color: genreColors[selectedBook.genre],
                    }}
                  >
                    {selectedBook.genre}
                  </span>
                  {selectedBook.year > 0 && (
                    <span className="text-sm text-muted-foreground">{selectedBook.year}</span>
                  )}
                </div>
              </div>

              {/* Description if available */}
              {selectedBook.description && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                    {selectedBook.description}
                  </p>
                </div>
              )}

              {/* Sentiment Profile */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI-Generated Sentiment Profile
                </h3>
                <div className="space-y-4">
                  <SentimentBar label="Moody" value={selectedBook.sentimentScores.moody} />
                  <SentimentBar label="Scientific" value={selectedBook.sentimentScores.scientific} />
                  <SentimentBar label="Optimistic" value={selectedBook.sentimentScores.optimistic} />
                  <SentimentBar label="Philosophical" value={selectedBook.sentimentScores.philosophical} />
                  <SentimentBar label="Adventurous" value={selectedBook.sentimentScores.adventurous} />
                </div>
              </div>

              {/* Connection explanation */}
              {connectedBook && connectionReason && (
                <div className="bg-secondary/50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" />
                    Why this link?
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{connectionReason}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Connected to:</span>
                    <span
                      className="px-2 py-1 rounded-full"
                      style={{
                        backgroundColor: genreColors[connectedBook.genre] + "20",
                        color: genreColors[connectedBook.genre],
                      }}
                    >
                      {connectedBook.title}
                    </span>
                  </div>
                </div>
              )}

              {/* How similarity is calculated */}
              <div className="mt-6 p-4 border border-border rounded-xl">
                <h4 className="text-xs font-semibold text-foreground mb-2">How connections work</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Sentiment scores are generated by <strong>GPT-4o-mini</strong> based on book metadata from Open Library.
                  Connections use <strong>cosine similarity</strong> on 5-dimensional sentiment vectors, showing only the strongest matches.
                </p>
              </div>

              {/* Data source */}
              <div className="mt-4 p-4 border border-border rounded-xl">
                <h4 className="text-xs font-semibold text-foreground mb-2">Data Sources</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>Book data: <span className="text-primary">Open Library API</span></li>
                  <li>Sentiment analysis: <span className="text-accent">OpenAI GPT-4o-mini</span></li>
                  <li>Similarity: Cosine similarity (threshold: 90%)</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Branding */}
      <div className="absolute bottom-6 right-6 z-10">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Book className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold">BookGraph</span>
        </div>
      </div>
    </div>
  )
}
