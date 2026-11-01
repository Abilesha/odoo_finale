import { useCallback, useEffect, useRef, useState } from 'react'

/** A touch/mouse/stylus signature canvas.
 *
 *  Pointer events rather than separate mouse and touch handlers: one code
 *  path for a finger, a mouse and a stylus, and `setPointerCapture` keeps the
 *  stroke alive when the finger slides outside the box mid-signature.
 *
 *  `touch-action: none` on the element stops the phone scrolling the page
 *  while the finger is drawing, which is the whole difficulty here.
 */
export function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  const prepare = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width) return               // laid out but not visible yet
    const ratio = window.devicePixelRatio || 1

    // Redrawing the backing store wipes it, so an existing signature is
    // preserved across a resize or an orientation change.
    const previous = dirty.current ? canvas.toDataURL('image/png') : null

    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1d1a24'

    if (previous) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = previous
    }
  }, [])

  useEffect(() => {
    prepare()
    const canvas = canvasRef.current
    // Catches the real cases: phone rotated, keyboard opening, the pad only
    // getting its width once this step becomes visible.
    const ro = new ResizeObserver(prepare)
    if (canvas) ro.observe(canvas)
    window.addEventListener('orientationchange', prepare)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', prepare)
    }
  }, [prepare])

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const down = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    try { canvas.setPointerCapture(e.pointerId) } catch { /* not supported */ }
    drawing.current = true
    const ctx = canvas.getContext('2d')
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // A deliberate tap is ink: draw a dot so a full stop or a short mark
    // registers instead of silently doing nothing.
    ctx.lineTo(x + 0.01, y)
    ctx.stroke()
    dirty.current = true
    setHasInk(true)
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    // Report on every stroke, not only when the finger lifts — a pointerup
    // lost to a scroll or a dropped event used to mean no signature at all.
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  const up = (e) => {
    if (!drawing.current) return
    drawing.current = false
    try { canvasRef.current.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    dirty.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div className={`relative overflow-hidden rounded-lg border-2 border-dashed bg-sand-50 transition-colors ${
        hasInk ? 'border-sage-400' : 'border-sand-300'
      }`}>
        <canvas
          ref={canvasRef}
          className="sigpad h-40 w-full cursor-crosshair touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-faint">
            Draw your signature here
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className={`text-xs ${hasInk ? 'text-sage-600' : 'text-ink-faint'}`}>
          {hasInk ? '✓ Signature captured' : 'Use your finger, a stylus or the mouse'}
        </p>
        {hasInk && (
          <button type="button" onClick={clear}
                  className="text-xs text-ink-faint underline underline-offset-2 hover:text-ink">
            Clear and redraw
          </button>
        )}
      </div>
    </div>
  )
}
