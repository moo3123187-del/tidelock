# TIDELOCK

A 3D first-person survival and factory-automation browser game set on **Orrin**, a tidally locked moon orbiting the banded gas giant **Tessara**.

**Play Live:** [https://moo3123187-del.github.io/tidelock/](https://moo3123187-del.github.io/tidelock/)

Built with React, TypeScript, Tailwind CSS, and Three.js with procedural terrain, PBR textures, custom GLSL sky/water shaders, Web Audio synthesis, and persistent local saves.

## Features

- **First-Person Exploration & Survival**: Survive across six distinct biomes—Daylight Plains, Twilight Belt, Subsolar Ridge, High Tide Flats, Far Side Dark, and the Near Sea Trench—while managing Health, Oxygen ($\text{O}_2$), Hydration, and Energy.
- **Dynamic Orbit & Tide Cycle**: Experience rotating **Day**, **Dusk**, **Eclipse**, and **Dawn** phases as Tessara looms in the sky, driving rising tides across the flats and altering solar power output.
- **Factory Building & Power Grid**: Place Miners, Smelters, Constructors, Solar Panels, Tide Turbines, Thermal Vents, Power Poles (with sagged catenary power cables), Storage Crates, and Conveyor Belts with 100% dismantle refund.
- **Vehicles & Deep-Sea Diving**: Build and pilot the **Hover Sled**, **All-Terrain Rover**, and **Needle Submersible** to traverse rugged ridges and dive into the Near Sea Trench.
- **Three Story Endings**: Repair the Comms Array for Rescue, stabilize the Rift Seal, or embrace Integration deep beneath the sea.

## Controls

| Action | Key / Input |
| :--- | :--- |
| Move | `W A S D` |
| Sprint | `Shift` |
| Jump / Dive | `Space` / `C` |
| Scan / Mine / Attack | `Left Mouse` (hold to auto-mine) |
| Interact / Enter Vehicle | `E` |
| Dismantle Structure (100% refund) | `X` |
| Hotbar Select | `1–8` or `Mouse Wheel` |
| Inventory & Craft | `Tab` |
| Build Menu | `B` |
| Power Grid Overview | `P` |
| World Map | `M` |
| Pause / Cancel Build | `Esc` / `Right Mouse` |

## GitHub Pages Deployment

This repository includes `.github/workflows/deploy.yml` to automatically build and deploy to GitHub Pages on every push to `main`:

1. Open your repository **Settings → Pages** on GitHub.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or run the **Deploy TIDELOCK to GitHub Pages** workflow manually in the **Actions** tab).

Your live site will be available at `https://moo3123187-del.github.io/tidelock/`.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build & Type-Check

```bash
npm run lint
npm run build
```
