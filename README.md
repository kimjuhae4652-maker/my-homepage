# Manifesto Archive

A one-page participatory manifesto archive for `GitHub Pages + Supabase`.

## What is included

- Static one-page site built with `HTML + CSS + Vanilla JS`
- `KO / EN` interface toggle
- Timeline archive with language, tag, and keyword filters
- Instant submission flow with optional author name and optional image upload
- Demo content fallback when Supabase credentials are not configured
- Supabase SQL schema and RLS/storage policy setup
- GitHub Pages deployment workflow with no build step

## Project structure

- `index.html`: page structure and section layout
- `styles.css`: editorial poster-style visual system
- `config.js`: site copy, tags, Supabase settings, demo data
- `app.js`: archive fetch/filter/render and submission logic
- `supabase/schema.sql`: table, bucket, constraints, and policies
- `.github/workflows/deploy.yml`: GitHub Pages deployment

## 1. Create the Supabase resources

1. Create a new Supabase project.
2. Open the SQL editor and run [`supabase/schema.sql`](./supabase/schema.sql).
3. Confirm that the `manifestos` table and `manifesto-images` bucket were created.

## 2. Add your project credentials

Edit [`config.js`](./config.js) and replace:

- `https://YOUR_PROJECT.supabase.co`
- `YOUR_PUBLIC_ANON_KEY`

The anon key is safe to expose in a browser-based GitHub Pages site as long as your RLS policies remain in place.

## 3. Customize the archive

Update [`config.js`](./config.js) to change:

- Korean/English UI copy
- Project name
- Tag allowlist
- Demo entries used before Supabase is connected

## 4. Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to the default branch.
2. In GitHub, open `Settings > Pages`.
3. Set the source to `GitHub Actions`.
4. The included workflow will publish the repository root as a Pages site.

The site uses only relative asset paths, so it works for both:

- `https://<user>.github.io/`
- `https://<user>.github.io/<repo>/`

## Submission rules implemented in the client

- Body length: `20-500` characters
- Author length: `0-40` characters
- Tags: `1-3`
- Image types: `jpg/png/webp`
- Image size: `<= 5MB`
- Honeypot field blocks basic bot submissions

## Notes

- New submissions are inserted as `visible` and appear immediately.
- Moderation happens in Supabase by changing `status` from `visible` to `hidden`.
- There is no admin dashboard in v1.
