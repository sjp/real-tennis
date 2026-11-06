# Real Tennis

[![CI](https://github.com/sjp/real-tennis/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sjp/real-tennis/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/github/deployments/sjp/real-tennis/github-pages?label=pages)](https://sjp.github.io/real-tennis/)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](package.json)

A browser game that teaches [real tennis](https://en.wikipedia.org/wiki/Real_tennis),
the original indoor racket sport, played off the walls, penthouses and
galleries of an enclosed court. It follows the T&RA rules: openings and
galleries, chases on both sides, the tambour, service faults and chase
comparison. The Marker calls the score and explains each rule the first
time it comes up.

**▶ Play it at <https://sjp.github.io/real-tennis/>**

Pick a mode from the menu:

- **Learn**: guided lessons, one rule at a time.
- **Practice**: on your own, with a ball machine.
- **Match**: singles against the computer (Easy, Medium or Hard; 1, 3 or 5 sets).
- **Rules**: the Laws, explained with the court.
- **Settings**: sound, controls, hit assist and progress.

## Controls

### Keyboard

| Key              | Action                                    |
| ---------------- | ----------------------------------------- |
| W A S D / arrows | Move                                      |
| Shift            | Sprint                                    |
| Space            | Swing (when serving: toss, then swing)    |
| 1 – 4            | Shot: 1 drive, 2 cut, 3 lob, 4 boast      |
| 1 – 8            | Serve style, while serving                |
| H                | Hit assist on/off                         |
| M                | Court markings on/off                     |
| X                | Rule explanations on/off                  |
| ?                | Rules reference                           |
| Esc              | Pause (or close the rules)                |
| Space / Enter    | Dismiss an explanation, or start a lesson |

In **Practice** there are also:

| Key | Action       |
| --- | ------------ |
| R   | Drop feed    |
| F   | Machine feed |
| Q   | Serve        |
| E   | Change ends  |

### Touch

- **Left thumb**: put it anywhere for a joystick. Push past the rim to sprint.
- **Right side**: Swing (Toss / Swing when serving), Sprint, and the shot
  buttons. While serving, one button cycles the serve styles.
- In Practice, extra buttons work the ball machine.

## Development

You need Node 24 or later.

```sh
npm ci            # install
npm run dev       # dev server at http://localhost:5173/
npm run check     # lint (oxlint), format check (oxfmt), type-check
npm run fmt       # format
npm test          # unit tests (Vitest)
npm run build     # production build into dist/
npm run preview   # serve dist/ at http://localhost:4173/real-tennis/
```

Every push to `main` runs CI on Node 24, 26 and latest. When CI passes, the
build deploys to GitHub Pages.
