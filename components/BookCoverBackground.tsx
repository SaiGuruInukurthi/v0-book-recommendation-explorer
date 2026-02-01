"use client"

import React from "react"

import { useEffect, useMemo, useRef, useCallback } from 'react'
import { useGesture } from '@use-gesture/react'
import './DomeGallery.css'

type ImageItem = string | { src: string; alt?: string }

type BookCoverBackgroundProps = {
  images?: ImageItem[]
  fit?: number
  minRadius?: number
  maxVerticalRotationDeg?: number
  segments?: number
  dragDampening?: number
  grayscale?: boolean
  autoRotate?: boolean
  overlayBlurColor?: string
}

type ItemDef = {
  src: string
  alt: string
  x: number
  y: number
  sizeX: number
  sizeY: number
}

const DEFAULT_BOOK_COVERS: ImageItem[] = [
  { src: 'https://covers.openlibrary.org/b/id/8225261-L.jpg', alt: 'Book cover' },
  { src: 'https://covers.openlibrary.org/b/id/8091016-L.jpg', alt: 'Book cover' },
  { src: 'https://covers.openlibrary.org/b/id/7222246-L.jpg', alt: 'Book cover' },
  { src: 'https://covers.openlibrary.org/b/id/8739161-L.jpg', alt: 'Book cover' },
  { src: 'https://covers.openlibrary.org/b/id/10521270-L.jpg', alt: 'Book cover' },
  { src: 'https://covers.openlibrary.org/b/id/12818647-L.jpg', alt: 'Book cover' },
]

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
const wrapAngleSigned = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360
  return a - 180
}

function buildItems(pool: ImageItem[], seg: number): ItemDef[] {
  const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2)
  const evenYs = [-4, -2, 0, 2, 4]
  const oddYs = [-3, -1, 1, 3, 5]

  const coords = xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs
    return ys.map(y => ({ x, y, sizeX: 2, sizeY: 2 }))
  })

  const totalSlots = coords.length
  if (pool.length === 0) {
    return coords.map(c => ({ ...c, src: '', alt: '' }))
  }

  const normalizedImages = pool.map(image => {
    if (typeof image === 'string') {
      return { src: image, alt: '' }
    }
    return { src: image.src || '', alt: image.alt || '' }
  })

  // Duplicate images to fill all slots
  const usedImages = Array.from({ length: totalSlots }, (_, i) => normalizedImages[i % normalizedImages.length])

  // Shuffle to avoid adjacent duplicates
  for (let i = 1; i < usedImages.length; i++) {
    if (usedImages[i].src === usedImages[i - 1].src) {
      for (let j = i + 1; j < usedImages.length; j++) {
        if (usedImages[j].src !== usedImages[i].src) {
          const tmp = usedImages[i]
          usedImages[i] = usedImages[j]
          usedImages[j] = tmp
          break
        }
      }
    }
  }

  return coords.map((c, i) => ({
    ...c,
    src: usedImages[i].src,
    alt: usedImages[i].alt
  }))
}

export default function BookCoverBackground({
  images = DEFAULT_BOOK_COVERS,
  fit = 0.8,
  minRadius = 600,
  maxVerticalRotationDeg = 0,
  segments = 34,
  dragDampening = 2,
  grayscale = false,
  autoRotate = true,
  overlayBlurColor = 'transparent'
}: BookCoverBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const sphereRef = useRef<HTMLDivElement>(null)

  const rotationRef = useRef({ x: 0, y: 0 })
  const startRotRef = useRef({ x: 0, y: 0 })
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const inertiaRAF = useRef<number | null>(null)
  const autoRotateRAF = useRef<number | null>(null)

  const items = useMemo(() => buildItems(images, segments), [images, segments])

  const applyTransform = (xDeg: number, yDeg: number) => {
    const el = sphereRef.current
    if (el) {
      el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`
    }
  }

  // Auto-rotate effect
  useEffect(() => {
    if (!autoRotate) return

    let lastTime = performance.now()
    const speed = 0.01 // degrees per ms

    const animate = (time: number) => {
      const delta = time - lastTime
      lastTime = time

      if (!draggingRef.current) {
        rotationRef.current.y = wrapAngleSigned(rotationRef.current.y + delta * speed)
        applyTransform(rotationRef.current.x, rotationRef.current.y)
      }

      autoRotateRAF.current = requestAnimationFrame(animate)
    }

    autoRotateRAF.current = requestAnimationFrame(animate)

    return () => {
      if (autoRotateRAF.current) {
        cancelAnimationFrame(autoRotateRAF.current)
      }
    }
  }, [autoRotate])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect
      const w = Math.max(1, cr.width)
      const h = Math.max(1, cr.height)
      const minDim = Math.min(w, h)
      const aspect = w / h

      let basis = aspect >= 1.3 ? w : minDim
      let radius = basis * fit
      const heightGuard = h * 1.35
      radius = Math.min(radius, heightGuard)
      radius = clamp(radius, minRadius, Infinity)

      const viewerPad = Math.max(8, Math.round(minDim * 0.25))
      root.style.setProperty('--radius', `${Math.round(radius)}px`)
      root.style.setProperty('--viewer-pad', `${viewerPad}px`)
      root.style.setProperty('--overlay-blur-color', overlayBlurColor)
      root.style.setProperty('--tile-radius', '16px')
      root.style.setProperty('--image-filter', grayscale ? 'grayscale(1) brightness(0.3)' : 'brightness(0.35) saturate(0.8)')
      applyTransform(rotationRef.current.x, rotationRef.current.y)
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [fit, minRadius, grayscale, overlayBlurColor])

  useEffect(() => {
    applyTransform(rotationRef.current.x, rotationRef.current.y)
  }, [])

  const stopInertia = useCallback(() => {
    if (inertiaRAF.current) {
      cancelAnimationFrame(inertiaRAF.current)
      inertiaRAF.current = null
    }
  }, [])

  const startInertia = useCallback(
    (vx: number, vy: number) => {
      const MAX_V = 1.4
      let vX = clamp(vx, -MAX_V, MAX_V) * 80
      let vY = clamp(vy, -MAX_V, MAX_V) * 80

      let frames = 0
      const d = clamp(dragDampening ?? 0.6, 0, 1)
      const frictionMul = 0.94 + 0.055 * d
      const stopThreshold = 0.015 - 0.01 * d
      const maxFrames = Math.round(90 + 270 * d)

      const step = () => {
        vX *= frictionMul
        vY *= frictionMul
        if (Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) {
          inertiaRAF.current = null
          return
        }
        if (++frames > maxFrames) {
          inertiaRAF.current = null
          return
        }
        const nextX = clamp(rotationRef.current.x - vY / 200, -maxVerticalRotationDeg, maxVerticalRotationDeg)
        const nextY = wrapAngleSigned(rotationRef.current.y + vX / 200)
        rotationRef.current = { x: nextX, y: nextY }
        applyTransform(nextX, nextY)
        inertiaRAF.current = requestAnimationFrame(step)
      }
      stopInertia()
      inertiaRAF.current = requestAnimationFrame(step)
    },
    [dragDampening, maxVerticalRotationDeg, stopInertia]
  )

  useGesture(
    {
      onDragStart: ({ event }) => {
        stopInertia()
        const evt = event as PointerEvent
        draggingRef.current = true
        startRotRef.current = { ...rotationRef.current }
        startPosRef.current = { x: evt.clientX, y: evt.clientY }
      },
      onDrag: ({ event, last, velocity = [0, 0], direction = [0, 0], movement }) => {
        if (!draggingRef.current || !startPosRef.current) return

        const evt = event as PointerEvent
        const dxTotal = evt.clientX - startPosRef.current.x
        const dyTotal = evt.clientY - startPosRef.current.y

        const nextX = clamp(
          startRotRef.current.x - dyTotal / 20,
          -maxVerticalRotationDeg,
          maxVerticalRotationDeg
        )
        const nextY = wrapAngleSigned(startRotRef.current.y + dxTotal / 20)

        if (rotationRef.current.x !== nextX || rotationRef.current.y !== nextY) {
          rotationRef.current = { x: nextX, y: nextY }
          applyTransform(nextX, nextY)
        }

        if (last) {
          draggingRef.current = false

          let [vMagX, vMagY] = velocity
          const [dirX, dirY] = direction
          let vx = vMagX * dirX
          let vy = vMagY * dirY

          if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001 && Array.isArray(movement)) {
            const [mx, my] = movement
            vx = clamp((mx / 20) * 0.02, -1.2, 1.2)
            vy = clamp((my / 20) * 0.02, -1.2, 1.2)
          }

          if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) {
            startInertia(vx, vy)
          }
        }
      }
    },
    { target: mainRef, eventOptions: { passive: true } }
  )

  return (
    <div
      ref={rootRef}
      className="sphere-root"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        ['--segments-x' as string]: segments,
        ['--segments-y' as string]: segments,
        ['--overlay-blur-color' as string]: overlayBlurColor,
        ['--tile-radius' as string]: '16px',
        ['--image-filter' as string]: grayscale ? 'grayscale(1) brightness(0.5)' : 'brightness(0.7)'
      } as React.CSSProperties}
    >
      <main ref={mainRef} className="sphere-main" style={{ pointerEvents: 'auto' }}>
        <div className="stage">
          <div ref={sphereRef} className="sphere">
            {items.map((it, i) => (
              <div
                key={`${it.x},${it.y},${i}`}
                className="item"
                data-src={it.src}
                data-offset-x={it.x}
                data-offset-y={it.y}
                data-size-x={it.sizeX}
                data-size-y={it.sizeY}
                style={{
                  ['--offset-x' as string]: it.x,
                  ['--offset-y' as string]: it.y,
                  ['--item-size-x' as string]: it.sizeX,
                  ['--item-size-y' as string]: it.sizeY
                } as React.CSSProperties}
              >
                <div className="item__image" style={{ cursor: 'default', pointerEvents: 'none' }}>
                  {it.src && <img src={it.src || "/placeholder.svg"} draggable={false} alt={it.alt} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overlay" />
        <div className="overlay overlay--blur" />
        <div className="edge-fade edge-fade--top" />
        <div className="edge-fade edge-fade--bottom" />
      </main>
    </div>
  )
}
