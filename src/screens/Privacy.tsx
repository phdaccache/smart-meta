import { t, useLang } from '../i18n'
import { policyFor } from '../lib/privacy'
import { Screen } from '../ui/components'

/** Settings → Privacy policy, also linked from sign-in (spec PR-8). Plain text only, never HTML. */
export function PrivacyScreen() {
  const policy = policyFor(useLang())
  return (
    <Screen title={policy.title} back="/settings" eyebrow={policy.updated}>
      <div className="policy">
        <div className="card pad policy-summary">
          {policy.summary.map((p) => <p key={p}>{p}</p>)}
        </div>
        {policy.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.body.map((p, i) => (Array.isArray(p)
              ? <ul key={i}>{p.map((item) => <li key={item}>{item}</li>)}</ul>
              : <p key={i}>{p}</p>))}
          </section>
        ))}
        <p className="settings-note">{t('set.policyNote')}</p>
      </div>
    </Screen>
  )
}
