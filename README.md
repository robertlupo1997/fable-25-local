# FABLE 25 — Local

Twenty-five fundamentally different websites, designed and built end-to-end by **Claude
Fable 5** running in Claude Code — every design decision, every line of code and copy,
every critique and fix — from a single prompt, entirely on one local machine.

## Inspiration and attribution

This project is **inspired by** [Nick Saraev's video](https://fable-25.netlify.app/guide/)
and his original **FABLE 25** project ([fable-25.netlify.app](https://fable-25.netlify.app)),
in which Claude Fable 5 autonomously built 25 websites in an afternoon. **It is not part of
that project and is not affiliated with it** — it is an independent, local reproduction of
the method with twenty-five original briefs, run by Robert "Trey" Lupo. Nick's original
prompt (transcribed from his video) and every prompt used here are preserved verbatim in
[`PROMPTS.md`](PROMPTS.md).

## What's different from the original

- **Local, not deployed-first.** Everything builds and serves on one machine for one
  reviewer; this repo is the publication.
- **Every pixel is procedural.** No image-generation APIs were available, so all 25 briefs
  were art-directed around GLSL shaders, canvas simulation, SVG, CSS, WebAudio synthesis,
  and math. No stock assets, no generated media, no templates, no shared components.
- **Original briefs.** The 25 concepts (see [`BRIEFS.md`](BRIEFS.md)) are new — an aurora
  research institute, a numbers-station archive, a museum of pigment, a century of real
  USGS earthquakes, a polyrhythm observatory — not the original's.

## The method

1. An **orchestrator session** wrote a design constitution and 25 individually
   art-directed briefs (`BRIEFS.md`): non-negotiable build standard — real copy only,
   distinctive type, custom easing, responsive, WCAG AA, reduced-motion fallbacks, zero
   console errors — plus per-site palette, typefaces, signature technique, and one thing
   to prove.
2. **Parallel builder agents** (Claude Fable 5 subagents) each received one brief and full
   autonomy over one folder.
3. Every site passed a **three-pass screenshot critique loop**: render real pages in
   headless Chromium (`tools/shot.mjs`), *look at the pixels* with vision, critique like a
   hostile design director, fix everything, then add one deliberate complexity upgrade per
   pass — the rule that stops iteration converging on bland safety.
4. The orchestrator **cold-reviews every hero shot** between waves and sends sites back
   with specific findings.
5. Hard-won addition to the original method: the **relay pattern**. Long-lived single
   agents died of context overflow mid-job, so each site's lifecycle is split across
   three sequential scoped agents (build → polish + guide → gated closeout) passing state
   through a `NOTES.md` baton. Zero agent deaths after the switch.

Every site documents itself at its own **`/guide` route** — the brief it received, its
signature technique with real code excerpts, and what each critique pass found and changed.

## Run it

```bash
python3 -m http.server 4179 --directory sites
# open http://localhost:4179/
```

No build step, no dependencies (Playwright is only needed for `tools/shot.mjs`, the QA
harness). Sites use CDN-hosted Three.js and Google Fonts; everything else is vanilla.

## Status

| Wave | Sites | State |
|---|---|---|
| 1 | aurorae · foundry · paperlight · signalhouse · magnetica · monolith · tremor | ✅ complete |
| 2 | orbital · chromatarium · wintergarden · wireservice · inkwell · stratosphere | ✅ complete |
| 3 | reliquary · glasswing · cartome · staccato · nocturne · slowlight | ✅ complete |
| 4 | kitefield · pressroom · undertow · equinox · afterimage · tempo | ✅ complete |
| — | gallery index + project guide + final cold review | ✅ complete |

**The collection is complete: 25 sites, 4 waves + finale, ~80 agents, zero templates.**

## Honesty note

The brands are fictional and written as fiction. Real datasets are real and cited in-page
(the earthquake essay uses the USGS Earthquake Hazards Program FDSN catalog). Contrast
ratios are verified computationally, including pixel-sampling rendered scenes behind text.
Each site's `/guide` bounds its own confidence — what was verified, and what wasn't.

---

*Designed & built by Claude Fable 5 · directed prompts and review harness in this repo ·
2026. No license granted yet — ask before reusing.*
