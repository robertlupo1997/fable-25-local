# FABLE 25 — LOCAL. Design constitution + twenty-five briefs.

One model, twenty-five studios. Built locally for an audience of one, who decides what
happens next. No deploys, no external services, no generated media — every pixel is earned
procedurally (GLSL, canvas, SVG, CSS, WebAudio, math). Restraint is also a budget.

## The build standard (non-negotiable, every site)

1. **Static + self-contained.** One folder: `sites/<slug>/` with `index.html` (+ optional
   `style.css`, `main.js`, small assets). No build step, no framework, vanilla JS only.
   CDN allowed for: Three.js, Google Fonts. Nothing else. No npm installs.
2. **Real copy only.** Fictional brands welcome — but written like the best copywriter you
   can be: specific, confident, zero lorem, zero placeholders. Never fabricate real-world
   facts, companies, or testimonials. If a site uses real data, cite the source in-page.
3. **Type.** 1–2 Google Fonts per brief, set to a deliberate scale. Kill widows in display
   text. Default system stacks only if the brief demands it.
4. **Motion.** Custom easing everywhere it matters — cubic-bezier or spring math; never the
   `ease`/`linear` defaults on a hero move. Every animation honors
   `prefers-reduced-motion: reduce` with a dignified static composition, not a blank page.
5. **Responsive 390 → 1600.** Recompose for mobile; don't shrink the desktop.
6. **Accessibility.** Semantic landmarks, exactly one `<h1>`, alt text, keyboard-reachable
   interactions, visible focus, WCAG AA text contrast (4.5:1 / 3:1 large). Decorative
   canvases are `aria-hidden="true"`.
7. **Zero console errors, zero page errors** at every screenshotted viewport and scroll
   position. The harness reports them; they are release blockers.
8. **Performance sanity.** No single asset > 300 KB. rAF loops pause on `document.hidden`.
   DPR-cap canvases at 2. If a phone would cry, simplify.
9. **The `/guide` route.** `sites/<slug>/guide/index.html`, written in the site's own visual
   language: the brief you received, your signature technique with a real code excerpt from
   your source, and what each critique pass actually found and changed. Honest, specific.
10. **Credit line** in every footer: `Designed & built by Claude Fable 5 · local build · 2026`.

## The iteration-pass contract (this is the part that matters)

A pass is not "look at the code." A pass is:

1. **Render.** From `/home/tlupo/projects/fable25`:
   `node tools/shot.mjs http://localhost:4179/<slug>/ qa/<slug>/pass<N>-desktop-top.png 1440x900 3500`
   Shoot desktop (1440x900) top / mid / bottom (use the reported docHeight to pick scrollY),
   and mobile (390x844) top / bottom. Check the JSON for `errors` and `pageErrors`.
2. **Look at the pixels.** Read your own screenshots with vision. Critique like a hostile
   design director: rhythm, alignment, contrast, widows, dead zones, muddy buttons, text
   drowning in artwork, anything that smells like "AI default."
3. **Fix everything found — then add one deliberate complexity upgrade** (a texture, a
   micro-interaction, marginalia, an easter egg). The upgrade rule stops iteration from
   converging on bland safety.

**Three passes minimum.** A pass without PNGs on disk in `qa/<slug>/` did not happen.
Do not start your own server (one is running on :4179). Do not touch any folder that is
not yours. Final hero shots: `qa/<slug>/final-desktop.png`, `qa/<slug>/final-mobile.png`.

---

## The briefs

### Wave 1

**1. `aurorae` — Institute of Atmospheric Light.** A fictional research station that
monitors the aurora borealis. Signature: full-viewport WebGL aurora — layered curtains of
curl-noise-displaced ribbons in a fragment shader, drifting on real solar-wind-like
parameters; scroll shifts geomagnetic latitude so the storm intensifies as you descend.
Palette: night `#050d12`, ice text `#dfe9ec`, aurora green `#5dfc9f`, storm magenta `#e04fd0`.
Type: Syne (display) + Instrument Sans. Prove: a shader can carry an entire narrative site.
Upgrade ideas: Kp-index dial that changes the solar wind; star parallax; magnetometer strip chart.

**2. `foundry` — a one-face type foundry.** A specimen site for Fraunces, treated like a
flagship release. Signature: kinetic type — variable-font axes (wght, opsz, SOFT, WONK)
driven by scroll and cursor; a waterfall that breathes; a drag-the-axes playground.
Palette: paper `#f4f1ea`, ink `#141414`, foundry orange `#ff4d00`. Type: Fraunces only,
every optical size. Prove: typography IS the interface — no imagery at all.
Upgrade ideas: glyph inspector with bezier outlines; a "wonk" toggle; letterpress impression shadow on click.

**3. `paperlight` — a shadow-puppet theatre.** A five-act folk tale told in layered
paper-cutout scenes. Signature: pure SVG + CSS — no canvas, no WebGL. Layered parallax
depth, a lantern glow that follows the cursor via CSS custom properties, silhouettes with
torn-paper edges (SVG filters). Palette: stage `#1a1412`, cream `#f5e9d4`, lantern amber
`#ffb347`, plum shadow `#3d2c3f`. Type: Libre Caslon Text + Karla. Prove: restraint —
CSS/SVG alone can be breathtaking.
Upgrade ideas: act-curtain wipes; fireflies (CSS only); a hidden sixth act after the colophon.

**4. `signalhouse` — a numbers-station archive.** A cold-war listening post that never shut
down. Signature: an interactive shortwave receiver — WebAudio oscillators, filtered noise
static between stations, a tunable dial that lands on procedural transmissions (morse,
interval tones, a synthesized voice-like formant chant). All audio starts muted until the
user turns the power knob; keyboard operable. Palette: bakelite `#0e0f11`, dial cream
`#e8dcc0`, tuning red `#d43a2f`. Type: IBM Plex Mono + Archivo. Prove: sound design from
raw oscillators, zero samples.
Upgrade ideas: signal-strength needle with spring physics; a logbook that records what you found; spectrum waterfall canvas.

**5. `magnetica` — a ferrofluid instrument.** A lab demonstration site for an impossible
material. Signature: 2D ferrofluid simulation — metaballs via marching squares on canvas,
spiking into Rosensweig peaks under a draggable magnet; field lines drawn faintly beneath.
Palette: lab white `#f2f4f6`, ferro black `#0a0a0c`, coil copper `#c96f2e`. Type: Chivo +
Chivo Mono. Prove: physics simulation as the hero, light theme done with discipline.
Upgrade ideas: two magnets with interference; a field-strength slider styled as a rheostat; specimen labels.

**6. `monolith` — a brutalist poster compilation.** An annual of oversized typographic
posters for fictional civic events. Signature: disciplined excess — massive Archivo Black
headlines cut by a hard grid, scroll-snap poster pages, hover reveals the grid skeleton.
Chaos gridded underneath. Palette: raw concrete `#b9b5ad`, ink `#1c1a17`, warning orange
`#e8551a`. Type: Archivo Black + Inter Tight. Prove: loud can be rigorous.
Upgrade ideas: print-registration marks; a poster that rebuilds itself letter by letter; concrete texture via CSS gradients only.

**7. `tremor` — a century of earthquakes.** A scroll-driven data essay on 100 years of
major seismic events, using real USGS catalog data (fetch it, bake it into a local JSON,
cite it in-page). Signature: a seismograph aesthetic — needle-drawn canvas traces, each
decade a chapter, magnitude rendered as physical amplitude you feel in the layout.
Palette: seismogram paper `#faf6ee`, ink `#26221c`, event red `#c8102e`, depth blue
`#274b8f`. Type: Spectral + Martian Mono. Prove: honest data storytelling with real cited data.
Upgrade ideas: a "felt report" marginalia column; depth cross-section; the needle jitters on scroll velocity.

### Wave 2

**8. `orbital` — a micro-satellite cooperative.** A fictional collective that shares one
constellation. Signature: Three.js Earth (procedural — atmosphere shader, no textures) with
an instanced satellite constellation on real Keplerian propagation; click a satellite to
ride its orbit. Palette: `#060913`, starlight `#e6ecf5`, telemetry cyan `#43d9c7`, solar
gold `#f2b632`. Type: Chakra Petch + Inter. Prove: real orbital math driving a 3D scene.
Upgrade ideas: ground-track projection; terminator line computed from a sun vector; telemetry ticker.

**9. `chromatarium` — a museum of pigment.** Six rooms, six pigments, each room an essay in
one color. Signature: exceptional palette discipline — every room derives its full UI from
one pigment via OKLCH math; grain and wash textures from CSS gradients and blend modes.
Palette: gallery bone `#efece5`, ink `#22201d`; rooms: ultramarine `#1a3aa8`, vermilion
`#d5321f`, viridian `#1d7a5f`, ochre `#c8862a`, Tyrian `#66023c`, lead white. Type:
Newsreader + Familjen Grotesk. Prove: color mastery as the entire show.
Upgrade ideas: pigment-history marginalia; a mixing bench; room transitions as color-field dissolves.

**10. `wintergarden` — a generative glasshouse.** A conservatory where every visit grows a
different garden. Signature: seeded stochastic L-systems drawn stem-by-stem on canvas —
you watch them grow; species vary by seed. Gentle generative WebAudio chimes (muted until
invited). Palette: glasshouse dusk `#0f1712`, leaf `#7fbf7a`, bloom `#e77fb3`, brass
`#b59a5a`. Type: Gloock + Mulish. Prove: generative art with botanical credibility.
Upgrade ideas: a seed-packet share card (canvas-rendered); seasons; a gardener's log naming each generated specimen.

**11. `wireservice` — a teletype newsroom.** A wire service for a city that doesn't exist.
Signature: dispatches typed character-by-character with authentic teletype cadence and
bell; CRT phosphor persistence done as layered text-shadows; fully keyboard-navigable.
Palette: CRT black `#0b0d0b`, phosphor `#57ff6c`, paper `#e9e9e2`, alert amber `#ffb000`.
Type: Fragment Mono + Public Sans. Prove: terminal aesthetics with editorial standards.
Upgrade ideas: a priority-flash bulletin; paper-feed mode that prints the wire to a scrolling page; operator hotkeys.

**12. `inkwell` — a calligraphy studio.** One brush, one page. Signature: velocity-driven
variable-width ink strokes with bristle texture and feathered edges (canvas), a practice
sheet with guide characters, pressure faked from pointer speed. Palette: washi `#f7f3e8`,
sumi `#1a1a18`, seal red `#b3271e`. Type: Shippori Mincho + Zen Kaku Gothic New. Prove:
input craft — the drawing feel is the product.
Upgrade ideas: ink that pools and dries; a gallery of the visitor's strokes; a red seal stamp with lacquer depth.

**13. `stratosphere` — a high-altitude balloon mission.** Scroll is altitude: 0 → 39 km.
Signature: the page's entire sky is computed — Rayleigh gradient thinning with height,
temperature/pressure readouts from the real barometric formula, cloud decks passed on the
way up, the horizon curving at apogee. Palette: computed sky, ink `#10141f`, payload white
`#f4f7fb`, mission orange `#ff6a2b`. Type: Sora + IBM Plex Mono. Prove: scroll-driven
storytelling where physics does the art direction.
Upgrade ideas: a burst-and-descent epilogue; instrument gauges with real units; radiosonde audio pips.

### Wave 3

**14. `reliquary` — a museum of impossible objects.** Five artifacts that cannot exist,
raymarched. Signature: SDF raymarching in fragment shaders — a Klein bottle reliquary, a
Penrose triangle in bronze, a shadow that casts an object; museum-label typography treats
each absurdity with total scholarly sobriety. Palette: charcoal `#17161a`, label ivory
`#efe9dd`, brass `#ad8f52`, violet `#8a63d2`. Type: Cardo + Questrial. Prove: raymarching
as a gallery medium; copywriting with a straight face.
Upgrade ideas: acquisition numbers and provenance; a rotating plinth interaction; a "do not touch" easter egg that ripples the SDF.

**15. `glasswing` — a butterfly conservatory.** Iridescence, computed. Signature: thin-film
interference shader on procedurally-shaped wings (the actual physics — optical path
difference to RGB), flocking flight via boids, one butterfly that lands on the cursor when
still. Palette: mist `#eef4f0`, ink `#182420`, computed iridescent spectrum, leaf `#4fb597`.
Type: Italiana + Figtree. Prove: physical optics as beauty; a light theme with atmosphere.
Upgrade ideas: species plates generated from wing-shape parameters; pinned-specimen mode with pins and labels; wingbeat audio (subtle).

**16. `cartome` — the Bureau of Speculative Cartography.** Maps of places that never were.
Signature: procedural inked maps — coastlines from domain-warped noise, rivers that descend
gradients, hatched relief, aged-plate paper texture; each reload charts a new territory.
Palette: plate cream `#f2ead8`, sepia ink `#3a2e22`, survey red `#b5432a`, water `#5b7fa6`.
Type: IM Fell English + Alegreya Sans. Prove: generative art in a printmaker's discipline.
Upgrade ideas: place-name generator with etymologies; a compass rose that tracks the cursor; fold-crease shading.

**17. `staccato` — a rhythm arcade.** A playable drum machine as nightlife. Signature: a
16-step sequencer, all sounds synthesized from raw WebAudio oscillators and noise (kick,
snare, hat, tom — zero samples), visuals pulsed by an analyser node. Silent until the user
hits play. Palette: club black `#101010`, hot pink `#ff2e88`, acid `#d4ff3f`, cyan
`#35e0ff`. Type: Bungee + DM Sans. Prove: an instrument, not a page — and disciplined neon.
Upgrade ideas: pattern presets with names; swing control; a record button that replays your take.

**18. `nocturne` — a field guide to moths.** Dark botanical plates for invented species.
Signature: procedurally drawn moths — bilateral symmetry from seeded parameters (wing
shape, eyespots, dust); they steer toward a draggable lamp with real steering behaviors;
plates render as engraved SVG. Palette: night `#131521`, page `#e9e6db`, lamp `#ffd47e`,
wing dust `#9aa4c7`. Type: Faustina + Nunito Sans. Prove: generative creatures with
taxonomy-plate elegance.
Upgrade ideas: Latin binomials generated to match wing parameters; a moon phase that changes who visits; collection drawer.

**19. `slowlight` — a long-exposure darkroom.** Photographs that develop while you watch.
Signature: canvas "exposures" — star trails, light-painting, headlight rivers — accumulated
frame-by-frame in real time under a safelight UI; prints develop in trays on scroll.
Palette: darkroom `#16090b`, safelight red `#e0442e`, print silver `#d9d9d9`. Type:
Besley + Hanken Grotesk. Prove: time as a visual medium; near-monochrome restraint.
Upgrade ideas: exposure-time dial; contact sheet of past visits (localStorage); a print that fixes only when you stop scrolling.

### Wave 4

**20. `kitefield` — a kite festival.** The one daylight-and-wind site. Signature: verlet
rope-and-cloth kites in a procedural sky — fly one with your pointer, wind gusts ripple
tails and grass; the crowd of kites is autonomous. Palette: sky `#d8e9f2`, ink `#21374a`,
kite red `#e34234`, string `#7a6f5d`. Type: Bricolage Grotesque + Atkinson Hyperlegible.
Prove: soft-body physics with joy; a bright palette that still has hierarchy.
Upgrade ideas: wind sock and forecast; kite designer (pick sail pattern); tangled-lines easter egg.

**21. `pressroom` — a union letterpress shop.** Est. 1962, never modernized, proud of it.
Signature: an ink-spread press simulation — set a line of movable type in a composing
stick, pull the press lever, watch impression + ink squash render your print (canvas);
wood-type specimen wall. Palette: oat `#ede5d6`, ink black `#211d19`, union blue `#274e8d`,
rubine `#cf2e5a`. Type: Rozha One + Crimson Pro. Prove: skeuomorphism with taste — texture
earned by simulation, not stock photos.
Upgrade ideas: loose-registration mode (two-color misprint charm); job tickets as copy; the smell of the shop described in a footnote.

**22. `undertow` — an atlas of the seafloor cables.** The internet's basement, visited.
Signature: a canvas bathymetry map (procedurally inked depth contours) where bioluminescent
packet-particles travel plausible-but-fictional cable routes; a cross-section ride from
landing station to abyssal plain on scroll. Palette: abyss `#04070d`, cable copper
`#d1763a`, biolume `#59f2d2`, chart `#93a7c4`. Type: Krona One + Overpass. Prove: technical
subject, poetic execution; darkness with legible depth.
Upgrade ideas: latency readouts between fictional cities; a shark-bite incident log; pressure gauge deepening as you scroll.

**23. `equinox` — a solar garden.** A sundial park driven by the real solar-position
algorithm. Signature: pick any city and date — gnomon shadows, day length, and the sky's
gradient are computed (declination, hour angle, altitude/azimuth), animated through the
day; the equinoxes and solstices are the four chapters. Palette: stone `#d9d2c4`, gnomon
`#2b2620`, solar `#e0a10e`, computed sky. Type: Marcellus + Outfit. Prove: real astronomy
math, no data files, art-directed like a landscape architect.
Upgrade ideas: analemma tracing; golden-hour band on the day dial; a shadow that points at the footer at your local sunset.

**24. `afterimage` — a photocopy zine on seeing.** Five spreads on perception, illustrated
by a live WebGL image-processing rig applied to procedurally generated "photographs."
Signature: post-processing as art direction — ordered dithering, CMYK halftone separation,
chromatic aberration, video-feedback tunnels, each spread one effect with its recipe.
Palette: zine white `#f5f5f2`, ink `#111111`, process magenta `#ec008c`, cyan `#00aeef`,
yellow `#ffe600`. Type: Space Grotesk + Space Mono. Prove: shader post-processing taught
like a zine, punk but precise.
Upgrade ideas: a copier "degrade" button (each press re-photocopies the page); registration-drift on scroll; staple shadows.

**25. `tempo` — a polyrhythm observatory.** Steve Reich as a website. Signature: N circles,
N periods — phase patterns drawn as orbiting bodies whose alignments flash and click
(WebAudio, muted until invited); the math of 3-against-4-against-5 made visible and
audible; phasing pieces you can conduct. Palette: bone `#f1ede4`, ink `#191714`, OKLCH
hue-wheel per voice, accent `#c73e1d`. Type: Young Serif + Rubik. Prove: math-music
visualization with warmth — the finale is earned minimalism.
Upgrade ideas: a phase-shift slider (Reich's trick); polygon-inscribed rhythm view; a coda that locks all voices into unison.

---

## Director's notes (for the record)

- Waves ship in order; the director reviews every hero shot cold between waves and sends
  sites back with specific findings before the next wave launches.
- Known parallel-load hazard: many headless Chromes at once can hang a machine — builders
  use the shared harness only, shoot sequentially within their own pass, never loop
  screenshots in the background.
- Kicker lesson inherited from the original: display text over bright animated scenes
  almost always needs a text-shadow or scrim. Check it in pass 1, not pass 3.
