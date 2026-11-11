# Foxbard design system, v0.3.0

Foxbard's look in code: one source of values, three themes (Dark, White, Paper), one set of shared CSS classes.

## What is here

| Path | What it is |
|---|---|
| `DESIGN.md` | The rules: color, type, layout, charts, and the full token table with contrast checks. Start here. |
| `tokens/tokens.json` | The source of every value. Edit this, never the CSS. |
| `tokens/tokens.css` | Generated CSS variables (`--fb-*`) for all three themes. |
| `components/foxbard.css` | Shared classes for slides and pages: wordmark, headings, cards, tags, tables, buttons, takeaway bar. |
| `components/theme-toggle.js` | The Dark / White / Paper switch. |
| `fonts/` | Supreme (headlines). License notes in `fonts/LICENSES.md`. Archivo, Hanken Grotesk and Geist Mono load from Google Fonts. |
| `logo/` | The fox mark (white, ink) and the favicon. |
| `tools/build.py` | Rebuilds `tokens.css`, `tokens.flat.json` and the token table in `DESIGN.md`, and fails if any color pair misses its contrast floor. |
| `CHANGELOG.md` | What changed in each version. |

## Use it

1. Link Google Fonts (Archivo, Hanken Grotesk, Geist Mono) and load `fonts/` for Supreme.
2. Include `tokens/tokens.css`, then `components/foxbard.css`.
3. On `<html>` set `data-theme="dark"` (or `white`, `paper`), `data-palette="lime-ink"` and `data-support="blue"`.

## Change a value

Edit `tokens/tokens.json`, then run `python3 tools/build.py`. It exits with an error if a contrast check fails.

## The locked choices (v0.3.0)

- Ink and lime. Lime is the highlighter, the one takeaway bar, and chart series 1.
- Support color: blue, `#2459E6` on White and Paper, `#7FA2FF` on Dark. One support-color item per card.
- Paper is linen `#F8F5EF`.
- Line icons only; no emoji.
