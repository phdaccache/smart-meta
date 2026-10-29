import { Component, type ReactNode } from 'react'
import { t } from '../i18n'
import { log, readLog } from '../sync/log'

/**
 * When drawing the app fails, React leaves an empty (black) page. This says so instead, with the error and
 * a way out: reload, or copy the diagnostics log for the developer. Nothing on the phone is touched.
 */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    log('crash', error, (error.stack ?? '').split('\n').slice(0, 4).join(' | '))
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const copy = () => navigator.clipboard?.writeText(readLog().join('\n')).catch(() => {})
    return (
      <div className="crash">
        <h1>{t('err.crashed')}</h1>
        <p className="small muted">{error.message}</p>
        <button className="btn primary block" onClick={() => window.location.replace('/')}>{t('err.reload')}</button>
        <button className="btn block" onClick={copy}>{t('err.copyLog')}</button>
      </div>
    )
  }
}
