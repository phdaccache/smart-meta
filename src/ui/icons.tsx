import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const Svg = ({ children, ...p }: P) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
)

export const IconToday = (p: P) => (
  <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4" /></Svg>
)
export const IconGoals = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></Svg>
)
export const IconReview = (p: P) => (
  <Svg {...p}><path d="M5 4h14v16H5z" /><path d="M9 9h6M9 13h6M9 17h3" /></Svg>
)
export const IconInsights = (p: P) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>
)
export const IconSettings = (p: P) => (
  <Svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>
)
export const IconPlus = (p: P) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
)
export const IconChevronRight = (p: P) => (
  <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>
)
export const IconChevronLeft = (p: P) => (
  <Svg {...p}><path d="m15 6-6 6 6 6" /></Svg>
)
export const IconCheck = (p: P) => (
  <Svg strokeWidth="2.6" {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
)
export const IconCalendar = (p: P) => (
  <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4M8 14h2M14 14h2M8 17h2" /></Svg>
)
export const IconClose = (p: P) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
)
export const IconCloud = (p: P) => (
  <Svg {...p}><path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7z" /></Svg>
)
export const IconInfo = (p: P) => (
  <Svg strokeWidth="1.7" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r="0.6" fill="currentColor" /></Svg>
)
export const IconSteps = (p: P) => (
  <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11" /><circle cx="5" cy="18" r="1.2" /></Svg>
)
