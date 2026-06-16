import { createContext, useContext, useState } from 'react'

export const light = {
  appBg:       '#F3F4F6',
  bg:          '#ffffff',
  bgSecondary: '#F9FAFB',
  bgTertiary:  '#F3F4F6',
  border:      '#EBEBEB',
  borderLight: '#E5E7EB',
  borderMid:   '#D1D5DB',
  text:        '#0A0A0A',
  textSecondary: '#374151',
  textMid:     '#6B7280',
  textMuted:   '#9CA3AF',
  inputBg:     '#F7F7F7',
  bubbleUser:  '#ffffff',
  bubbleAI:    '#DCFCE7',
  navBg:       '#ffffff',
  scrollThumb: '#E5E5E5',
}

export const dark = {
  appBg:       '#0f0f17',
  bg:          '#1a1a2a',
  bgSecondary: '#222233',
  bgTertiary:  '#2a2a3d',
  border:      '#2e2e42',
  borderLight: '#353550',
  borderMid:   '#404058',
  text:        '#e2e8f0',
  textSecondary: '#cbd5e1',
  textMid:     '#94a3b8',
  textMuted:   '#64748b',
  inputBg:     '#222233',
  bubbleUser:  '#252538',
  bubbleAI:    '#1a3a2a',
  navBg:       '#1a1a2a',
  scrollThumb: '#2e2e42',
}

const ThemeCtx = createContext({ theme: light, dark: false, toggle: () => {} })

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false)
  const toggle = () => setIsDark(v => !v)
  return (
    <ThemeCtx.Provider value={{ theme: isDark ? dark : light, dark: isDark, toggle }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeCtx)
}
