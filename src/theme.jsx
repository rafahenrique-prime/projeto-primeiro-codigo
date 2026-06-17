import { createContext, useContext, useState } from 'react'

export const light = {
  appBg:       '#EDEDEE',
  bg:          '#ffffff',
  bgSecondary: '#F7F7F8',
  bgTertiary:  '#F0F0F1',
  border:      '#e5e5e5',
  borderLight: '#eeeeee',
  borderMid:   '#d0d0d0',
  text:        '#111111',
  textSecondary: '#333333',
  textMid:     '#666666',
  textMuted:   '#999999',
  inputBg:     '#f5f5f5',
  bubbleUser:  '#ffffff',
  bubbleAI:    '#fff0f0',
  navBg:       '#ffffff',
  scrollThumb: '#e0e0e0',
  primary:     '#E8192C',
  primaryBg:   '#fff5f5',
  primaryLight:'#fff0f0',
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
  primary:     '#E8192C',
  primaryBg:   '#2a1520',
  primaryLight:'#3a1a22',
  respostaBg:  '#1e2a1a',
  respostaBorder: '#2d4a25',
  respostaText:'#d1fae5',
}

const ThemeCtx = createContext({ theme: light, dark: false, toggle: () => {} })

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const toggle = () => setIsDark(v => {
    const next = !v
    localStorage.setItem('theme', next ? 'dark' : 'light')
    return next
  })
  return (
    <ThemeCtx.Provider value={{ theme: isDark ? dark : light, dark: isDark, toggle }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeCtx)
}
