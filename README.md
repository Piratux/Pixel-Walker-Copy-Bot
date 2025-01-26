# Pixel-Walker-Copy-Bot

Bot for PixelWalker game that allows to copy/paste selected regions.

Hosted on GitHub pages at:\
http://piratux.github.io/Pixel-Walker-Copy-Bot/

## Local development

At the root of project run:

```
npm run dev
```

Then open up this:\
http://localhost:3000/Pixel-Walker-Copy-Bot/

Vite supports HMR (Hot Module Replacement) out of box, which means you can make code changes, and changes will be
reflected live.

When `package.json` changes, you need to run dev command again.

### Local env files

To have custom config only when running locally:

- Create `.env.local` file at the root of the project as a copy of `.env`
- Modify the values in `.env.local` to your needs

All env file entries must start with `VITE_`, otherwise value will be undefined in code.

## Test production build

At the root of project run:

```
npm run build
npm run preview
```

Then open up this:\
http://localhost:4173/Pixel-Walker-Copy-Bot/

Vite's HMR won't work for production build, so you need to run build and preview commands when you make code changes.
