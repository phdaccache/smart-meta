import { useState } from 'react'
import { setSettings } from '../db/settings'
import { InfoTip, Screen } from '../ui/components'
import { navigate } from '../ui/router'
import { ValuesEditor } from './Settings'

/** First run: values, then the first goal, then Today. */
export function WelcomeScreen() {
  const [step, setStep] = useState<'intro' | 'values'>('intro')

  if (step === 'intro') {
    return (
      <Screen title="Smart Meta">
        <p className="wizard-lead">Specific goals, with your reason in front of you every day.</p>
        <div className="wizard-nav">
          <button className="btn primary" onClick={() => setStep('values')}>Start</button>
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>
          <button className="link-btn" onClick={() => navigate('/settings')}>Restore data</button>
        </p>
      </Screen>
    )
  }

  return (
    <Screen title={<span className="title-row">What matters to you? <InfoTip label="About values">Write 3 to 5 values. Every goal names one of them as its reason.</InfoTip></span>}>
      <ValuesEditor onboarding onSaved={async () => {
        await setSettings({ onboarded: true })
        navigate('/goals/new?first=1', { replace: true })
      }} />
    </Screen>
  )
}
