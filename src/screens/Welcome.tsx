import { setSettings } from '../db/settings'
import { InfoTip, Screen } from '../ui/components'
import { navigate, useLocation } from '../ui/router'
import { ValuesEditor } from './Settings'

/**
 * First run: values, then the first goal. Each step is its own address, so the
 * back gesture walks back through them.
 */
export function WelcomeScreen() {
  const { path } = useLocation()

  if (path !== '/welcome/values') {
    return (
      <Screen title="Smart Meta">
        <p className="wizard-lead">Specific goals, with your reason in front of you every day.</p>
        <div className="wizard-nav">
          <button className="btn primary" onClick={() => navigate('/welcome/values')}>Start</button>
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>
          <button className="link-btn" onClick={() => navigate('/settings')}>Restore data</button>
        </p>
      </Screen>
    )
  }

  return (
    <Screen back="/" title={<span className="title-row">What matters to you? <InfoTip label="About values">Write 3 to 5 values. Every goal names one of them as its reason.</InfoTip></span>}>
      <ValuesEditor onboarding onSaved={async () => {
        await setSettings({ onboarded: true })
        navigate('/goals/new?first=1', { replace: true })
      }} />
    </Screen>
  )
}
