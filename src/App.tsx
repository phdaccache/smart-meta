import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { setSettings } from './db/settings'
import { dayMonth } from './lib/dates'
import { Toaster } from './ui/components'
import { useSettingsLoaded } from './ui/hooks'
import { IconGoals, IconInsights, IconPlus, IconReview, IconToday } from './ui/icons'
import { match, navigate, useLocation } from './ui/router'
import { GoalDetailScreen, GoalEditScreen, GoalReviewScreen } from './screens/GoalDetail'
import { NewGoalScreen } from './screens/GoalForm'
import { GoalsScreen } from './screens/Goals'
import { NewProjectScreen, ProjectScreen } from './screens/Projects'
import { openQuickAdd, QuickAdd } from './screens/QuickAdd'
import { SettingsScreen, ValuesScreen } from './screens/Settings'
import { TodayScreen } from './screens/Today'
import { WelcomeScreen } from './screens/Welcome'
import { Screen } from './ui/components'

const TABS = [
  { path: '/', label: 'Today', Icon: IconToday },
  { path: '/goals', label: 'Goals', Icon: IconGoals },
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
  if ((m = match('/goals/:id/review', path))) return <GoalReviewScreen id={m.id} />
  if ((m = match('/goals/:id', path))) return <GoalDetailScreen key={m.id} id={m.id} />
  if (path === '/projects/new') return <NewProjectScreen />
  if ((m = match('/projects/:id', path))) return <ProjectScreen key={m.id} id={m.id} />
  if (path === '/settings') return <SettingsScreen />
  if (path === '/settings/values') return <ValuesScreen />
  if (path === '/review') return <Later title="Review" />
  if (path === '/insights') return <Later title="Insights" />
  return <Later title="Not found" />
}

function Later({ title }: { title: string }) {
  return (
    <Screen title={title} settings>
      <p className="muted">{title === 'Not found' ? 'Nothing here.' : 'Coming soon.'}</p>
    </Screen>
  )
}

export function App() {
  const settings = useSettingsLoaded()
  const valueCount = useLiveQuery(() => db.values.count(), [])
  const { path, query } = useLocation()
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
                    <Icon />
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
