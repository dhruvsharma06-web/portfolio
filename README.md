# Dhruv Sharma — portfolio

Static site (HTML, CSS, JavaScript). No build step. three.js is vendored in `/vendor`.

- `index.html` — home: a scroll journey from a black hole, past the Sun and nine planets (one per project field), down to Earth and a rocket landing under the aurora
- `space.js` + `js/shaders.js` — the WebGL scene: ray-traced black hole, star warp, planets, Earth, landing site and the rocket
- `space.css` — home page layout
- `about.html` — education, current research, how I work
- `core.js` — shared motion: particle film on the about page, cursor, reveals, page transitions
- `main.js` — tech stack hover, copy email, stat counters
- `404.html` — custom not-found page; `Dhruv_Sharma_Resume.pdf` — résumé download
- `media/og.jpg` — link preview image for LinkedIn, WhatsApp and X

## Deploy on Vercel
Import this repo at vercel.com/new, framework preset **Other**, leave build settings empty, Deploy.

Fonts: Inter Display / Inter (SIL Open Font License), self-hosted in `/fonts`. three.js r170 (MIT).
