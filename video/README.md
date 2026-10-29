# Launch video

A 30-second vertical video (1080×1920, 30 fps, with sound), in English and Brazilian Portuguese.

| | Video | Poster | Share caption |
|---|---|---|---|
| English | [brag.mp4](brag.mp4) | [brag.jpg](brag.jpg) | [share-copy.txt](share-copy.txt) |
| Português | [brag-pt-BR.mp4](brag-pt-BR.mp4) | [brag-pt-BR.jpg](brag-pt-BR.jpg) | [share-copy-pt-BR.txt](share-copy-pt-BR.txt) |

`brag-preview.webp` is the silent, looping preview the main README shows: GitHub doesn't play videos stored in the repo, so it links to the mp4 instead.

## Story

| Time | Scene |
|---|---|
| 0.0–6.3 | Night: "Every night / you dream up / new goals." Goal pills bloom, then fall off at sunrise: "By morning, / they're gone." |
| 6.3–8.0 | The app icon: "Now they stay." |
| 8.0–14.4 | "Make it SMART.": the icon splits into S M A R T, the vague "Go to the gym" becomes a SMART goal one letter at a time. |
| 14.4–22.5 | The app: Plan ("Your why, always in sight."), Today's miss prompt with a tap on Forgot ("Missed a day? Say why."), Review's "Add a prep?" ("Every week, it suggests a fix."). |
| 22.5–27.1 | "Not only goals.": habits, a prep, project steps and a task float in on strings around one goal and get reeled into it. No text on the pieces, just their kind. |
| 27.1–30.0 | Icon, "Smart Meta", "Goals that survive the moment of decision." |

The copy never uses "I" or "my". The why shown in the app shots is rewritten the same way (the sample data is first person).

## How it's made

Everything is in [src/](src): an HTML composition drawn frame by frame in headless Chrome, piped to ffmpeg, with a soundtrack synthesized in Python.

- `capture.mjs`: screenshots Plan, Today and Review from the running app with its sample data, and records where the focused cards sit. Output goes to `assets/`. The pt-BR run shows the English sample data as a Brazilian user would write it.
- `comp.src.html`: the composition, both languages; `window.render(t)` draws time `t`.
- `build.mjs`: bakes each language's screen positions into `comp-en.html` and `comp-pt.html`.
- `audio.py`: music and sound effects (120 BPM, C major), written to `audio.wav`. Needs numpy.
- `render.mjs`: renders 900 frames and muxes `audio.wav` into an mp4.
- `stills.mjs`: stills at chosen times, for checking a change without rendering it all.

Needs Node, Python with numpy, Chrome and ffmpeg. Set `CHROME` and `FFMPEG` to their paths if they aren't at the defaults in the scripts.

```bash
cd video/src
npm ci
# only when the app's screens changed: start the app (npm run dev -- --port 5174 at the repo root), then
node capture.mjs en && node capture.mjs pt
python audio.py audio.wav
node build.mjs
node render.mjs en ../brag.mp4
node render.mjs pt ../brag-pt-BR.mp4
# the README preview (300 px wide, 15 fps)
ffmpeg -i ../brag.mp4 -vf "fps=15,scale=300:-2:flags=lanczos" -c:v libwebp_anim -q:v 62 -compression_level 6 -loop 0 -an ../brag-preview.webp
```

Fonts: the app uses SF Pro on Apple devices; the video uses Inter for both the captures and the titles.
