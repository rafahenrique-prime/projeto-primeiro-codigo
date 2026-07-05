import { useState } from 'react'

const POSITIONS = {
  right:  { top: '50%', left: 'calc(100% + 10px)', transform: 'translateY(-50%)' },
  bottom: { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  top:    { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
}

// Tooltip customizado (substitui o title nativo do browser — some instantâneo, sem delay do SO)
export default function Tooltip({ text, children, position = 'right', maxWidth = 220, block = false }) {
  const [show, setShow] = useState(false)
  if (!text) return children

  return (
    <div
      style={{ position: 'relative', display: block ? 'block' : 'inline-flex', width: block ? '100%' : undefined }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute', ...POSITIONS[position],
          background: '#111827', color: '#fff', fontSize: 12, fontWeight: 500, lineHeight: 1.4,
          padding: '7px 11px', borderRadius: 8, whiteSpace: maxWidth ? 'normal' : 'nowrap',
          width: maxWidth ? maxWidth : 'max-content', maxWidth,
          boxShadow: '0 6px 16px rgba(0,0,0,0.25)', zIndex: 1000, pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </div>
  )
}
