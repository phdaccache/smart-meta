import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment } from 'react'
import { t, tk, useLang, type Key } from './i18n'
import { db } from './db/db'
import { setSettings } from './db/settings'
import { dayMonth } from './lib/dates'
import { AppBadge } from './ui/AppBadge'
import { Celebration } from './ui/Celebration'
import { Toaster } from './ui/components'
import { reviewPending } from './lib/review'
import { useSettingsLoaded, useToday } from './ui/hooks'
import { IconGoals, IconInsights, IconPlus, IconReview, IconToday } from './ui/icons'
import { leavingScreen, match, navigate, screensUnder, useLocation } from './ui/router'
import { GoalDetailScreen, GoalEditScreen, GoalReviewScreen } from './screens/GoalDetail'
import { NewGoalScreen } from './screens/GoalForm'
import { GoalsScreen } from './screens/Goals'
import { NewProjectScreen, ProjectScreen } from './screens/Projects'
import { openQuickAdd, QuickAdd } from './screens/QuickAdd'
import { AccountScreen, DeveloperScreen, SettingsScreen, ValuesScreen } from './screens/Settings'
import { ReviewScreen } from './screens/Review'
import { GoalInsightsScreen, InsightsScreen } from './screens/Insights'
import { TodayScreen } from './screens/Today'
import { WhatsNew } from './screens/WhatsNew'
import { introRoute, IntroStart } from './screens/Intro'
import { PrivacyScreen } from './screens/Privacy'
import { accountRoute, KeysPrompt } from './screens/Account'
import { NotificationsScreen } from './screens/Notifications'
import { DeveloperOnly } from './ui/developer'
import { phoneOwner } from './sync/controller'
import { Screen } from './ui/components'

const TABS: { path: string; label: Key; Icon: typeof IconToday }[] = [
  { path: '/', label: 'nav.today', Icon: IconToday },
  { path: '/goals', label: 'nav.plan', Icon: IconGoals },
  { path: '/review', label: 'nav.review', Icon: IconReview },
  { path: '/insights', label: 'nav.insights', Icon: IconInsights },
]

const hasTabs = (path: string) => TABS.some((tab) => tab.path === path) || path.startsWith('/day/')

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
  if (path === '/settings/account') return <AccountScreen />
  if (path === '/settings/notifications') return <NotificationsScreen />
  if (path === '/privacy') return <PrivacyScreen />
  if (path === '/settings/developer') return <DeveloperOnly><DeveloperScreen /></DeveloperOnly>
  if (path === '/review') return <ReviewScreen />
  if (path === '/insights') return <InsightsScreen />
  if ((m = match('/insights/goals/:id', path))) return <GoalInsightsScreen key={m.id} id={m.id} />
  return introRoute(path) ?? accountRoute(path) ?? <NotFound />
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
  // Someone has signed in on this phone (it has an owner): the first run is behind them.
  const owned = useLiveQuery(async () => !!(await phoneOwner()), [])
  const { path, query } = useLocation()
  const today = useToday(settings?.rolloverHour ?? 4)
  const reviewDot = useLiveQuery(
    async () => reviewPending(await db.goals.toArray(), await db.weekReviews.toArray(), today),
    [today],
  )
  if (!settings || goalCount == null || owned == null) return null

  // Settings live on the device; goals arrive with sync, so a restored phone skips first run. Signed in
  // with nothing to restore (a new account, from the intro's "Restore"), it's Today with Getting started.
  const onboarding = !settings.onboarded && goalCount === 0 && !owned
  // Signing in from the intro's "Restore" (a new phone) happens before any goal is here.
  const firstRunPage = path.startsWith('/welcome') || path.startsWith('/account') || path === '/settings' || path === '/settings/notifications' || path === '/privacy'
  const content = onboarding && !firstRunPage ? <IntroStart /> : route(path, query)
  const tabbed = !onboarding && hasTabs(path)
  // Each screen scrolls in a layer of its own, and the ones it was opened from stay drawn underneath,
  // each where it was, so Back finds them as they were (see screensUnder).
  const under = onboarding ? [] : screensUnder()
  const here = window.location.pathname + window.location.search
  // A layer is kept by its place, whatever screen it shows, so a drag begun as the screen changes isn't left
  // on a layer that's gone. The screen Back is taking away stays the same layer while it slides off (see slideBack).
  const leaving = leavingScreen()

  // Keyed by language: switching remounts the screens, so every text (and anything computed from it) is redone.
  return (
    <Fragment key={lang}>
      {settings.devToday && (
        <button className="dev-pill" onClick={() => setSettings({ devToday: null })}>
          Pretending it’s {dayMonth(settings.devToday)} · tap to reset
        </button>
      )}
      {[...under, here, ...(leaving ? [leaving.at] : [])].map((at, i) => {
        const shown = i === under.length
        const gone = i > under.length
        const [p, search = ''] = at.split('?')
        return (
          <div key={gone ? leaving!.key : i} className={`screen-layer ${gone ? 'leaving' : ''}`} inert={!shown}
            aria-hidden={shown ? undefined : true}>
            <main className={`app ${(shown ? tabbed : hasTabs(p)) ? '' : 'no-tabs'}`}>
              {shown ? content : route(p, new URLSearchParams(search))}
            </main>
          </div>
        )
      })}
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
      <WhatsNew waiting={onboarding || path.startsWith('/welcome')} />
      <Toaster />
      <KeysPrompt />
      <Celebration />
      <AppBadge />
    </Fragment>
  )
}
