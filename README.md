# Junyan Lin — portfolio

Personal portfolio site. Pure static: one HTML file, one CSS file, two ES-module
JavaScript files. No build step, no Node, no package manager.

## Files

```
index.html            page shell (ASCII only; all copy is injected from content.js)
src/styles.css        styles (ASCII only)
src/main.js           rendering, language toggle, project overlay, interactions (ASCII only)
src/content.js        all English / Chinese copy, experience, skills, projects (UTF-8)
work/img/<id>/01.jpg  cover image for each project, 1200 x 675
Junyan_Lin_Resume.pdf resume linked from the top bar
favicon.svg
```

External dependencies are loaded from CDNs at runtime: Google Fonts (Instrument
Serif, Instrument Sans, IBM Plex Mono) and Lenis 1.3.11 for smooth scrolling.
If Lenis fails to load the page falls back to native scrolling.

## Preview locally

ES modules need an HTTP server (opening `index.html` directly from the file
system will not work). Any static server is fine, for example:

```
python3 -m http.server 5173
```

then open http://127.0.0.1:5173/.

## Editing copy

Edit `src/content.js` only. Keep `index.html`, `src/main.js` and
`src/styles.css` free of non-ASCII characters; some editors re-encode those
files and corrupt Chinese text and symbols such as `€` or `—`.

## Deploy

Upload the whole folder to any static host (GitHub Pages, Netlify, Vercel,
Cloudflare Pages). No configuration is needed.
