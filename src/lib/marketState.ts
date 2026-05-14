import { useEffect, useState } from 'react'

// US 2026 market holidays (NYSE close-all-day). YYYY-MM-DD in America/New_York.
const HOLIDAYS_2026: Set<string> = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed; 7/4 is Sat)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
])

const MARKET_OPEN_MIN = 9 * 60 + 30 // 9:30 AM ET → 570
const MARKET_CLOSE_MIN = 16 * 60 // 4:00 PM ET → 960

export interface MarketState {
  isOpen: boolean
  nextChange: Date
  label: 'open' | 'closed'
}

interface ETParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: string // Mon, Tue, …, Sun
}

function etParts(d: Date): ETParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(d)
  const m: Record<string, string> = {}
  for (const p of parts) m[p.type] = p.value
  return {
    year: +m.year,
    month: +m.month,
    day: +m.day,
    hour: +m.hour % 24,
    minute: +m.minute,
    second: +m.second,
    weekday: m.weekday,
  }
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isWeekend(weekday: string): boolean {
  return weekday === 'Sat' || weekday === 'Sun'
}

function isHoliday(year: number, month: number, day: number): boolean {
  return HOLIDAYS_2026.has(dateKey(year, month, day))
}

function isTradingDay(p: ETParts): boolean {
  return !isWeekend(p.weekday) && !isHoliday(p.year, p.month, p.day)
}

function isOpenAt(p: ETParts): boolean {
  if (!isTradingDay(p)) return false
  const t = p.hour * 60 + p.minute
  return t >= MARKET_OPEN_MIN && t < MARKET_CLOSE_MIN
}

// Construct a UTC Date that displays as `year-month-day hour:minute` in ET.
// Iterates to handle DST boundaries.
function makeEtInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let d = new Date(Date.UTC(year, month - 1, day, hour, minute))
  for (let i = 0; i < 4; i++) {
    const got = etParts(d)
    if (
      got.year === year &&
      got.month === month &&
      got.day === day &&
      got.hour === hour &&
      got.minute === minute
    ) {
      return d
    }
    const dayDelta = (year - got.year) * 365 + (month - got.month) * 31 + (day - got.day)
    const minDelta = hour * 60 + minute - (got.hour * 60 + got.minute)
    d = new Date(d.getTime() + (dayDelta * 24 * 60 + minDelta) * 60 * 1000)
  }
  return d
}

function addEtDays(year: number, month: number, day: number, n: number) {
  const base = new Date(Date.UTC(year, month - 1, day + n, 12, 0))
  const p = etParts(base)
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday }
}

export function getMarketState(now: Date = new Date()): MarketState {
  const p = etParts(now)
  if (isOpenAt(p)) {
    const close = makeEtInstant(p.year, p.month, p.day, 16, 0)
    return { isOpen: true, nextChange: close, label: 'open' }
  }
  // Find next trading-day 9:30 ET opening that is strictly in the future.
  for (let i = 0; i <= 14; i++) {
    const d = addEtDays(p.year, p.month, p.day, i)
    if (isWeekend(d.weekday) || isHoliday(d.year, d.month, d.day)) continue
    const candidate = makeEtInstant(d.year, d.month, d.day, 9, 30)
    if (candidate.getTime() > now.getTime()) {
      return { isOpen: false, nextChange: candidate, label: 'closed' }
    }
  }
  return { isOpen: false, nextChange: now, label: 'closed' }
}

// Human label for the next-change time (used in pill `title`).
// Examples: "Closes 4:00 PM ET", "Opens 9:30 AM ET", "Opens 9:30 AM ET Mon".
export function formatNextChange(state: MarketState, now: Date = new Date()): string {
  const p = etParts(state.nextChange)
  const nowP = etParts(now)
  const hour12 = ((p.hour + 11) % 12) + 1
  const ampm = p.hour >= 12 ? 'PM' : 'AM'
  const timeStr = `${hour12}:${String(p.minute).padStart(2, '0')} ${ampm}`
  if (state.isOpen) return `Closes ${timeStr} ET`
  const sameDay = p.year === nowP.year && p.month === nowP.month && p.day === nowP.day
  return sameDay ? `Opens ${timeStr} ET` : `Opens ${timeStr} ET ${p.weekday}`
}

export function useMarketState(): MarketState {
  const [state, setState] = useState<MarketState>(() => getMarketState())
  useEffect(() => {
    const id = setInterval(() => setState(getMarketState()), 30_000)
    return () => clearInterval(id)
  }, [])
  return state
}
