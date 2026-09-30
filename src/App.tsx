import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { setSettings } from './db/settings'
import { dayMonth } from './lib/dates'
import { Toaster } from './ui/components'
import { reviewPending } from './lib/review'
import { useSettingsLoaded, useToday } from './ui/hooks'
import { IconGoals, IconInsights, IconPlus, IconReview, IconToday } from './ui/icons'
import { match, navigate, useLocation } from './ui/router'
import { GoalDetailScreen, GoalEditScreen, GoalReviewScreen } from './screens/GoalDetail'
import { NewGoalScreen } from './screens/GoalForm'
import { GoalsScreen } from './screens/Goals'
import { NewProjectScreen, ProjectScreen } from './screens/Projects'
import { openQuickAdd, QuickAdd } from './screens/QuickAdd'
import { SettingsScreen, ValuesScreen } from './screens/Settings'
import { ReviewScreen } from './screens/Review'
import { GoalInsightsScreen, InsightsScreen } from './screens/Insights'
import { TodayScreen } from './screens/Today'
import { WelcomeScreen } from './screens/Welcome'
import { Screen } from './ui/components'

const TABS = [
  { path: '/', label: 'Today', Icon: IconToday },
  { path: '/goals', label: 'Plan', Icon: IconGoals },
  { path: '/review', label: 'Review', Icon: IconReview },
  { path: '/insights', label: 'Insights', Icon: IconInsights },
]

function route(path: string, query: URLSearchParams) {
  let m: Record<string, string> | null
  if (path === '/') return <TodayScreen />
  if ((m = match('/day/:date', path))) return <TodayScreen key={m.date} date={m.date} />
  if (path === '/goals') return <GoalsScreen />
  if (path === '/goals/new') return <NewGoalScreen first={query.get('first') === '1'} />
  if ((m = match('/goals/:id/edit', path))) return <GoalEditScreen id={m.id} />
  if ((m = match('/goals/:id/review', path))) return <GoalReviewScreen id={m.id} presetHit={query.get('hit') === '1' ? true : undefined} />
  if ((m = match('/goals/:id', path))) return <GoalDetailScreen key={m.id} id={m.id} />
  if (path === '/projects/new') return <NewProjectScreen goalId={query.get('goal')} />
  if ((m = match('/projects/:id', path))) return <ProjectScreen key={m.id} id={m.id} />
  if (path === '/settings') return <SettingsScreen />
  if (path === '/settings/values') return <ValuesScreen />
  if (path === '/review') return <ReviewScreen />
  if (path === '/insights') return <InsightsScreen />
  if ((m = match('/insights/goals/:id', path))) return <GoalInsightsScreen key={m.id} id={m.id} />
  return <NotFound />
}

function NotFound() {
  return (
    <Screen title="Not found" settings>
      <p className="muted">Nothing here.</p>
    </Screen>
  )
}

export function App() {
  const settings = useSettingsLoaded()
  const valueCount = useLiveQuery(() => db.values.count(), [])
  const { path, query } = useLocation()
  const today = useToday(settings?.rolloverHour ?? 4)
  const reviewDot = useLiveQuery(
    async () => reviewPending(await db.goals.toArray(), await db.weekReviews.toArray(), today),
    [today],
  )
  if (!settings || valueCount == null) return null

  // Settings live on the device; values arrive with sync, so a restored phone skips first run.
  const onboarding = !settings.onboarded && valueCount === 0
  const inFirstGoal = path === '/goals/new' && query.get('first') === '1'
  const content = onboarding && !inFirstGoal && path !== '/settings' ? <WelcomeScreen /> : route(path, query)
  const tabbed = !onboarding && (TABS.some((t) => t.path === path) || path.startsWith('/day/'))

  return (
    <>
      {settings.devToday && (
        <button className="dev-pill" onClick={() => setSettings({ devToday: null })}>
          Pretending it’s {dayMonth(settings.devToday)} · tap to reset
        </button>
      )}
      <main className={`app ${tabbed ? '' : 'no-tabs'}`}>{content}</main>
      {tabbed && (
        <>
          <button className="fab" aria-label="Quick add" onClick={openQuickAdd}><IconPlus width={26} height={26} /></button>
          <div className="tabbar">
            <nav aria-label="Main">
              {TABS.map(({ path: p, label, Icon }) => {
                const current = p === '/' ? path === '/' || path.startsWith('/day/') : path.startsWith(p)
                return (
                  <a key={p} href={p} aria-current={current ? 'page' : undefined}
                    onClick={(e) => { e.preventDefault(); navigate(p) }}>
                    <span className="tab-icon">
                      <Icon />
                      {p === '/review' && reviewDot && <i className="tab-dot" aria-label="Review ready" />}
                    </span>
                    {label}
                  </a>
                )
              })}
            </nav>
          </div>
        </>
      )}
      <QuickAdd />
      <Toaster />
    </>
  )
}
