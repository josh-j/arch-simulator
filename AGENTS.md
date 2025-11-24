# Repository Guidelines

## Project Structure & Module Organization
- `index.html` boots the interactive canvas UI and loads YAML config parts (`config.meta.yaml`, `config.topology.yaml`, `config.connections.yaml`, `config.simulations.yaml`, `config.docs.yaml`) via `js-yaml`.
- `engine.js` contains the ArchitectureSimulator class: renders sites/nodes, SVG links, filters, simulations, and inspector interactions.
- `style.css` holds the visual system (CSS variables, panel layout, canvas styling).
- `docker-compose.yml` serves the static site through nginx for Traefik-hosted deployments; no backend services exist.

## Build, Test, and Development Commands
- Local preview (no build step): `python3 -m http.server 8000` then open `http://localhost:8000`. Required so `fetch` can load the YAML config parts.
- Docker preview: `docker compose up -d` to serve the static files via nginx; `docker compose down` to stop.
- Quick lint sweep: run `npx prettier --check "*.js" "*.css"` if you have Prettier installed; otherwise keep existing spacing.

## Coding Style & Naming Conventions
- JavaScript: ES modules, 4-space indentation, template literals for HTML fragments, early returns where possible. Avoid adding new globals; extend `ArchitectureSimulator` methods instead.
- Data: node and layer IDs use `kebab-case`; labels are Title Case; colors should reference existing CSS vars before adding hex literals.
- CSS: prefer existing custom properties; keep new rules scoped to specific classes to avoid bleed into canvas labels.
- YAML: align with current keys (`meta`, `theme`, `nodeTypes`, `layers`, `simulations`, `sites`, `nodes`, `lines`). Keep comments minimal and ASCII.

## Testing Guidelines
- No automated tests; rely on manual validation in the browser.
- Verify: layer toggles collapse/expand correctly, simulations animate nodes in the expected order, inspector content updates per node click, and no console errors.
- After YAML edits, refresh and confirm colors, labels, and flow paths match the intended architecture.

## Commit & Pull Request Guidelines
- Commit messages follow the existing pattern `Type: Summary` (examples from history: `Feat: Add collapsible panels`, `Fix: Prevent browser translation`). Use Title Case and keep to one sentence.
- PRs: include a brief description of changes, rationale for config updates, and before/after screenshots or GIFs when altering visuals or flows.
- Reference related issues or TODOs in the description; call out any manual verification performed (e.g., “Tested via python http.server, no console errors”).
