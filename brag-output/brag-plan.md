# Smart Meta: brag plan

**What it is:** a personal SMART-goals app for the iPhone (PWA, local-first, English and Português).
**For:** people who keep dreaming up goals and habits and never turn them into a plan.
**What sets it apart:** it won't let a goal stay vague. The goal is built one SMART letter at a time, the reason you wrote shows up on Today every day, a miss asks "What happened?", and the weekly review turns those reasons into a concrete fix.
**Best claim:** "Goals that survive the moment of decision." (the app's own manifest description)
**Visual hook:** the welcome animation from v1.2.0: loose, tilted goal pills ("Read more", "Go to the gym", "Save money"…) snapping into a ticked list.
**Real UI shown:** welcome, the SMART steps, the Relevant step (typing a reason), Today (the same reason heading the group, a miss prompt), Review (an evidence-backed suggestion). All rendered from the app's own DOM and `styles.css`, captured from the dev server with sample data.
**Tone:** default, leaning polished. Warm paper background, the app's blue, calm and confident; the app's restraint is the brand.
**Share caption:** Stop dropping goals you never really defined.

## Identity
- Background `#f5f3ee`, surface `#fcfbf8`, ink `#1b1a17`, accent `#2c5d8f`, on-track `#2f7a4d`, prep `#2f7a5b`.
- Inter (in the app's own font stack), 700 for display with -0.02em tracking.
- App icon: blue rounded square with a white tick.

## Storyboard (1920×1080, 30 fps, 21 s)

| # | Time | Scene | On screen | Motion |
|---|---|---|---|---|
| 1 | 0.0–3.0 | Hook | Five loose goal pills, big, tilted, drifting. Headline: **Stop dropping goals you never really defined.** | Pills pop in scattered; headline words rise in by 1.0 s, hold. |
| 2 | 3.0–7.2 | Reveal | Headline out; the pills snap into a list and tick green one by one (the app's welcome animation). Pull back: the list is inside the phone's welcome screen. Left: icon + **Smart Meta** / *Turn them into a weekly plan.* | Snap 3.2–4.6, ticks 4.4–5.2, camera pull back 5.2–6.0. |
| 3 | 7.2–10.2 | SMART | Phone cycles the real steps S, M, A, R, T. Left: big S M A R T letters, the active one lit with its word. Caption: **Build every goal one letter at a time.** | Screen swaps every 0.55 s with a little slide; letters light in step. |
| 4 | 10.2–13.8 | The why | Relevant step: the reason types itself in. Cut to Today: the same sentence heads the Exercise group. Caption: **The reason you wrote shows up every day.** | Typing 10.4–11.6; zoom into Today's group. |
| 5 | 13.8–17.4 | Misses + review | Today's prompt "Last week: 2 of 3 gym. What happened?": tap "Too tired". Then Review's suggestion card. Caption: **Miss a day? Say why. The weekly review suggests the fix.** | Finger tap ripple, chip turns on; slide to Review, zoomed on the suggestion. |
| 6 | 17.4–21.0 | Outro | Icon, **Smart Meta**, *Goals that survive the moment of decision.*, small line: Works offline · English & Português. | Phone slides away, type settles, quiet hold. |

## Sound
Generated in Python: warm soft-synth pad + pluck arpeggio in D major at 100 BPM, light kick from scene 2. Pill pops and ticks as soft plucks pitched to the key (D/F#/A), a filtered whoosh on the snap and the cut to Review. Mixed under the music, gentle limiter, fade out at the end.
