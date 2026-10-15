# AI 3D Studio

A Spline-style 3D design editor that runs in the browser, with AI generation built in.

Live build: https://claude.ai/artifact/9bduaQdxE5w9zzfEDLcCJW

## Mesh generation keys

| Model | Input | Approx. cost | Notes |
| --- | --- | --- | --- |
| Hunyuan3D 3.1 Pro (fal.ai) | Text or image | ~$0.38 per model | Best all-round detail, PBR textures, up to 1.5M faces |
| Rodin by Hyper3D (fal.ai) | Text or image | ~$0.40, High detail 3x | Sculpt-level geometry; High detail adds 4K textures |
| TRELLIS.2 (fal.ai) | Image | lowest | Open model, 4K PBR |
| Meshy 6 | Text or image | Meshy credits | Uses your Meshy key |

Get a fal.ai key at https://fal.ai/dashboard/keys and paste it in AI Generate → API keys. Keys stay in your browser. Mesh generation works in the hosted app (GitHub Pages or `npm run dev`); the Claude preview blocks calls to outside services.

## Run it

```bash
npm install
npm run dev      # editor at http://localhost:5173
npm run build    # static build in dist/
```

## What it does (stage 1)

| Area | In this build |
| --- | --- |
| Editor layout | Toolbar, scene layers (drag to reorder or nest, rename, hide, lock), Design / Interact inspector, view cube, grid |
| Objects | Rounded cube, sphere, cylinder, cone, torus, torus knot, capsule, icosahedron, pyramid, plane, ring; extruded 2D star, polygon, heart, rounded rectangle; 3D text with 4 fonts; groups; image planes; imported models |
| Transform | Move / rotate / scale gizmos, local or world axes, snapping, numeric fields with drag-to-scrub, focus (F) |
| Materials | Physical, Standard, Glass, Toon, Lambert, Phong, Basic, Matcap, Normal; emission; transmission, IOR, clearcoat, sheen, iridescence; layers for gradient, noise, fresnel and image textures |
| Lighting & scene | Directional, point and spot lights with soft shadows; studio environment; ambient light; fog; background or transparent; perspective or orthographic camera |
| Post-processing | Bloom, depth of field, vignette, noise, chromatic aberration, tone mapping |
| Interactions | States plus events: Start, Mouse Down, Mouse Hover, Key Down, Scroll, Mouse Move (look at / follow cursor); toggle, once, loop and ping-pong; six easings including spring and bounce; Play mode |
| AI | Design with Claude: describe or upload a reference image and it builds or edits editable objects, materials and interactions, then reviews a render of its result and refines it. Text or image to production-quality textured mesh with Hunyuan3D 3.1 Pro (recommended), Rodin by Hyper3D or TRELLIS.2 through one fal.ai key, or Meshy 6 with a Meshy key |
| Import | .glb, .gltf, .obj, .stl, .ply, images, project files; drag and drop |
| Export | Self-contained web page with interactions (the equivalent of Spline's public URL / viewer), React and vanilla JS code, iframe embed, GLB, GLTF, USDZ, OBJ, STL, PLY, PNG, JPG, WEBP, WebM video, project .json |
| Workflow | Undo / redo, duplicate, group / ungroup, multi-select, keyboard shortcuts, autosave in the browser |

## Spline features still to build

- Real-time multiplayer editing, comments, team libraries and hosted public links with analytics
- Timeline / keyframe animation editor (today animation is state-to-state)
- Vector pen tool for custom 2D paths, boolean operations, sculpting and vertex editing, cloner and array tools
- More material layers (rainbow, outline, displace, depth, video textures) and more environment presets
- Physics, particles, game controls, variables and conditional logic, API / webhook actions, audio and video objects
- Multiple scene cameras with camera states, responsive embed sizing, scroll-linked camera paths
- Native app exports (SwiftUI, Android) and Spline's own .splinecode runtime
