# Echo UI Kit

A hub of front-end dev tools — color pickers, palette generation, and live
page-inspection overlays (box model, fonts, contrast) — shipped as a browser
extension, built from shared packages so a future web app can reuse the same
tool components.

## Layout

```
packages/
  tools-core/      pure color/CSS logic (no DOM, no platform APIs)
  ui/               React components, consume storage via an adapter
  adapters/         platform-agnostic interfaces (StorageAdapter, ...)
  tailwind-config/  shared design tokens
  tsconfig/         shared tsconfig bases
apps/
  extension/        WXT (Manifest V3) side panel + content scripts
```

## Develop

```
pnpm install
pnpm dev      # apps/extension: load the printed dist as an unpacked extension
```
