# CSS / Tailwind Visual Generators: gaps and decisions

- Implemented: 6 visual builders (CSS Grid with spans and optional `grid-template-areas`, Flexbox, layered Box Shadow up to 10 layers, Glassmorphism with `@supports` fallback and backdrop contrast check, Linear/Radial/Conic/Mesh Gradients, Border Radius with 8-value organic toggle and Clip-path shapes), px/rem switch, Light/Dark/Busy preview backdrops, LTR/RTL toggle, CSS paste-to-import for box-shadow and gradients, and Tailwind v4 class output with arbitrary-value notes.
- **Drag placement & drag handles:** Grid cell spanning, gradient stop positions, and polygon vertices are edited via keyboard-accessible numeric inputs and sliders rather than pointer drag handles on the preview canvas.
- **Logical CSS properties toggle:** Not added separately in v1; Grid and Flexbox previews include an LTR/RTL toggle.
- **Share settings URL hash:** Settings persist in localStorage (`uu-css-tailwind-generators`); share-hash serialization is not implemented in v1.
