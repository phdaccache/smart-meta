import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment } from 'react'
import { t, tk, useLang, type Key } from './i18n'
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
import { WhatsNew } from './screens/WhatsNew'
import { introRoute, IntroStart } from './screens/Intro'
import { Screen } from './ui/components'

const TABS: { path: string; label: Key; Icon: typeof IconToday }[] = [
  { path: '/', label: 'nav.today', Icon: IconToday },
  { path: '/goals', label: 'nav.plan', Icon: IconGoals },
  { path: '/review', label: 'nav.review', Icon: IconReview },
  { path: '/insights', label: 'nav.insights', Icon: IconInsights },
]

function route(path: string, query: URLSearchParams) {
  let m: Record<string, string> | null
  if (path === '/') return <TodayScreen />
  if ((m = match('/day/:date', path))) return <TodayScreen key={m.date} date={m.date} />
  if (path === '/goals') return <GoalsScreen />
  if (path === '/goals/new') return <NewGoalScreen />
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
  return introRoute(path) ?? <NotFound />
}

function NotFound() {
  return (
    <Screen title={t('nav.notFound')} settings>
      <p className="muted">{t('nav.nothingHere')}</p>
    </Screen>
  )
}

export function App() {
  const lang = useLang()
  const settings = useSettingsLoaded()
  const goalCount = useLiveQuery(() => db.goals.filter((g) => !g.deletedAt).count(), [])
  const { path, query } = useLocation()
  const today = useToday(settings?.rolloverHour ?? 4)
  const reviewDot = useLiveQuery(
    async () => reviewPending(await db.goals.toArray(), await db.weekReviews.toArray(), today),
    [today],
  )
  if (!settings || goalCount == null) return null

  // Settings live on the device; goals arrive with sync, so a restored phone skips first run.
  const onboarding = !settings.onboarded && goalCount === 0
  const content = onboarding && !path.startsWith('/welcome') && path !== '/settings' ? <IntroStart /> : route(path, query)
  const tabbed = !onboarding && (TABS.some((tab) => tab.path === path) || path.startsWith('/day/'))

  // Keyed by language: switching remounts the screens, so every text (and anything computed from it) is redone.
  return (
    <Fragment key={lang}>
      {settings.devToday && (
        <button className="dev-pill" onClick={() => setSettings({ devToday: null })}>
          Pretending it’s {dayMonth(settings.devToday)} · tap to reset
        </button>
      )}
      <main className={`app ${tabbed ? '' : 'no-tabs'}`}>{content}</main>
      {tabbed && (
        <>
          <button className="fab" aria-label={t('nav.quickAdd')} onClick={openQuickAdd}><IconPlus width={26} height={26} /></button>
          <div className="tabbar">
            <nav aria-label={t('nav.main')}>
              {TABS.map(({ path: p, label, Icon }) => {
                const current = p === '/' ? path === '/' || path.startsWith('/day/') : path.startsWith(p)
                return (
                  <a key={p} href={p} aria-current={current ? 'page' : undefined}
                    onClick={(e) => { e.preventDefault(); navigate(p) }}>
                    <span className="tab-icon">
                      <Icon />
                      {p === '/review' && reviewDot && <i className="tab-dot" aria-label={t('nav.reviewReady')} />}
                    </span>
                    {tk(label)}
                  </a>
                )
              })}
            </nav>
          </div>
        </>
      )}
      <QuickAdd />
      <WhatsNew firstRun={onboarding} />
      <Toaster />
    </Fragment>
  )
}
