import { useState } from 'react'
import { setSettings } from '../db/settings'
import { Screen } from '../ui/components'
import { navigate } from '../ui/router'
import { ValuesEditor } from './Settings'

/** First run: values, then the first goal, then Today. */
export function WelcomeScreen() {
  const [step, setStep] = useState<'intro' | 'values'>('intro')

  if (step === 'intro') {
    return (
      <Screen title="Goals that survive the moment">
        <div className="stack" style={{ gap: 16, fontSize: 17, lineHeight: 1.5 }}>
          <p>Most goals don’t fail because you forget them. They fail because they’re vague, and because the reason is missing at the moment you choose.</p>
          <p>So this app will ask you to be specific, and it will put your reason next to everything you do each day.</p>
          <p className="muted">It never writes goals for you. It only makes sure they’re checkable.</p>
        </div>
        <div className="wizard-nav">
          <button className="btn primary" onClick={() => setStep('values')}>Start with what matters</button>
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>
          New phone? <button className="link-btn" onClick={() => navigate('/settings')}>Restore your data</button>
        </p>
      </Screen>
    )
  }

  return (
    <Screen eyebrow="Step 1 of 2" title="What matters to you?">
      <p className="wizard-lead">
        Write three to five values — short statements of what you care about. Each goal will name one of these as its reason.
      </p>
      <ValuesEditor onboarding onSaved={async () => {
        await setSettings({ onboarded: true })
        navigate('/goals/new?first=1', { replace: true })
      }} />
    </Screen>
  )
}
