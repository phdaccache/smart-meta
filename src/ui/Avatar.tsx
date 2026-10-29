import { useEffect, useState, type CSSProperties } from 'react'
import { t, tk, type Key } from '../i18n'
import {
  AVATAR_COLORS, AVATAR_LOOKS, AVATAR_PATTERNS, AVATAR_SUGGESTIONS, DEFAULT_AVATAR, lastEmoji, NAME_MAX, type Avatar,
} from '../lib/avatar'
import { saveProfile, useProfile } from '../sync/profile'
import { Segmented, Sheet } from './components'
import { IconCheck } from './icons'

/** One avatar from its four settings; with none yet, the default fox. */
export function AvatarView({ avatar, size }: { avatar: Avatar | null; size: number }) {
  const a = avatar ?? DEFAULT_AVATAR
  return (
    <span className={`av ${a.look} p-${a.pattern}`} style={{ '--s': `${size}px`, '--c': `var(--c-${a.color})` } as CSSProperties} aria-hidden="true">
      {a.emoji && <span className="emo">{a.emoji}</span>}
    </span>
  )
}

/** Settings → Name and avatar: Cancel and Done, as the mockup picked in S0. */
export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useProfile()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR)
  const [emojiText, setEmojiText] = useState(DEFAULT_AVATAR.emoji)
  useEffect(() => {
    if (!open || !saved) return
    setName(saved.name)
    setAvatar(saved.avatar ?? DEFAULT_AVATAR)
    setEmojiText((saved.avatar ?? DEFAULT_AVATAR).emoji)
  }, [open, !!saved])

  const set = (p: Partial<Avatar>) => setAvatar((a) => ({ ...a, ...p }))
  const dirty = !!saved && (name !== saved.name || JSON.stringify(avatar) !== JSON.stringify(saved.avatar ?? DEFAULT_AVATAR))
  const done = async () => {
    await saveProfile({ name, avatar })
    onClose()
  }
  const style = { '--c': `var(--c-${avatar.color})` } as CSSProperties
  return (
    <Sheet open={open} onClose={onClose} title={t('set.profile')} large dirty={dirty}
      done={{ label: t('common.save'), onClick: done }}>
      <div className="ed-preview">
        <AvatarView avatar={avatar} size={96} />
        <input className="ed-name" value={name} maxLength={NAME_MAX} placeholder={t('prof.namePlaceholder')} aria-label={t('prof.name')}
          autoComplete="name" onChange={(e) => setName(e.target.value)} />
      </div>

      <p className="ed-label">{t('prof.emoji')}</p>
      <label className="emoji-row">
        <input value={emojiText} autoComplete="off" aria-label={t('prof.anyEmoji')}
          onChange={(e) => {
            const found = lastEmoji(e.target.value)
            setEmojiText(found ?? '')
            if (found) set({ emoji: found })
          }}
          onBlur={() => setEmojiText(avatar.emoji)} />
        <span>{t('prof.emojiHint')}</span>
      </label>
      <div className="av-picker" style={style} role="radiogroup" aria-label={t('prof.emoji')}>
        {AVATAR_SUGGESTIONS.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={avatar.emoji === e} className={avatar.emoji === e ? 'on' : ''}
            onClick={() => { set({ emoji: e }); setEmojiText(e) }}>
            <span className="emo">{e}</span>
          </button>
        ))}
      </div>

      <p className="ed-label">{t('prof.look')}</p>
      <Segmented label={t('prof.look')} value={avatar.look} onChange={(look) => set({ look })}
        options={AVATAR_LOOKS.map((l) => ({ value: l, label: tk(`prof.look.${l}` as Key) }))} />

      <p className="ed-label">{t('look.color')}</p>
      <div className="look-colors" role="radiogroup" aria-label={t('look.color')}>
        {AVATAR_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={avatar.color === c} aria-label={tk(`look.c.${c}` as Key)}
            className={`swatch ${avatar.color === c ? 'on' : ''}`} style={{ '--c': `var(--c-${c})` } as CSSProperties}
            onClick={() => set({ color: c })}>
            {avatar.color === c && <IconCheck width={16} height={16} />}
          </button>
        ))}
      </div>

      <p className="ed-label">{t('prof.pattern')}</p>
      <div className="av-picker patterns" style={style} role="radiogroup" aria-label={t('prof.pattern')}>
        {AVATAR_PATTERNS.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={avatar.pattern === p} aria-label={tk(`prof.p.${p}` as Key)}
            className={avatar.pattern === p ? 'on' : ''} onClick={() => set({ pattern: p })}>
            <AvatarView avatar={{ ...avatar, emoji: '', pattern: p }} size={36} />
          </button>
        ))}
      </div>
    </Sheet>
  )
}
