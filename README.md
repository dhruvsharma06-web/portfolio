# Dhruv Sharma — portfolio

Static site (HTML, CSS, JavaScript). No build step. three.js is vendored in `/vendor`.

- `index.html` — home: name, statement, work by domain, experience, tech stack, contact
- `space.js` + `js/shaders.js` — space backgrounds over the particle film: ray-traced black hole, the Sun, a planet per domain, Earth, the aurora landing site, and a rocket that follows the scroll
- `about.html` — education, current research, how I work
- `core.js` — shared motion: scroll-driven particle film (starry name), cursor, kinetic titles, intro, page transitions
- `main.js` — home page interactions: scene transitions, glass cards, tech stack, copy email
- `404.html` — custom not-found page; `Dhruv_Sharma_Resume.pdf` — résumé download
- `media/og.jpg` — link preview image for LinkedIn, WhatsApp and X

## Deploy on Vercel
Import this repo at vercel.com/new, framework preset **Other**, leave build settings empty, Deploy.

Fonts: Inter Display / Inter (SIL Open Font License), self-hosted in `/fonts`. three.js r170 (MIT).
