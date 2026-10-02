# Smart Meta launch video

- `brag.mp4` / `brag.jpg`: landscape 1920×1080, 22 s, with its poster
- `brag-vertical.mp4` / `brag-vertical.jpg`: 9:16 cut for Reels, 1080×1920, same timeline and soundtrack
- `share-copy.txt`: captions to post
- `brag-plan.md`: angle and storyboard

## How it's made

Everything in the phone is the real app: `work/capture.mjs` drives the Vite dev server in headless Chrome at an
iPhone viewport (English, sample data loaded) and saves each screen's DOM. Those screens, styled by the app's own
`styles.css` (copied to `work/comp/app.css`), are laid out by `work/comp/index.html` + `comp.js`, where every frame is
a pure function of time (`renderAt(t)`). `?format=vertical` switches to the 9:16 layout.

## Re-render

Needs Chrome, Node, Python with numpy and `imageio-ffmpeg` (`pip install imageio-ffmpeg`).

```bash
cd brag-output/work
npm install
npm run dev --prefix ../..          # only to recapture screens: node capture.mjs, then rebuild comp/screens.js
node render.mjs video               # landscape frames → frames/
FORMAT=vertical node render.mjs video   # vertical frames → frames-v/
python audio.py                     # audio.wav
```

Then encode with ffmpeg (from `python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`), after
copying the poster frame (`f-00222.jpg`) over `f-00000.jpg`:

```bash
ffmpeg -framerate 30 -i frames/f-%05d.jpg -i audio.wav -vf "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -c:v libx264 -preset slow -crf 16 -movflags +faststart -c:a aac -b:a 192k -shortest ../brag.mp4
```
