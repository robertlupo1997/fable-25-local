# PROMPTS.md — every prompt used to generate this project, verbatim

Three layers produced each site: (1) the mission prompt from the human, (2) this file's
orchestrator-authored agent prompts, and (3) the per-site briefs in `BRIEFS.md`. Each
finished site's `/guide` route additionally shows the brief it received, in its own words.

---

## Layer 1 — the mission prompt (human → orchestrator)

The original prompt (by Nick Saraev, transcribed from his video) that produced the public
FABLE 25 (fable-25.netlify.app), supplied by Trey with the instruction "I want to empower
you to do this for me":

> I want to build 25 websites with Fable as a way to demonstrate its extreme capabilities
> in web design, taste, and artistic flavor. Then I want to record a video on it to show
> over 500,000 people (my audience). I want each website to be fundamentally different, and
> involve a mixture of advanced visual techniques, some of which would include high-quality
> 3D tactics; otherworldly beautiful animations; exceptional color palettes;
> novel/interesting font styles; and whatever you deem fit as a way to showcase your
> skills. You can accomplish this in many ways, using many workflows; for instance, you
> could download images on Pinterest (…), generate similar (but different) images using GPT
> Image 2 (which you have keys for), animate them with Higgsfield (which you have an MCP
> for, and that includes dozens of animation models like Kling), and use those as key
> assets. You can also borrow from advanced motion design style websites; and you have,
> again, total creative freedom to design in a way that you believe best illustrates your
> capabilities. Once you have all 25 websites up, I'd like you to put them on Netlify and
> then serve me the link. I'd also like you to add a brief description of how you did so on
> a /guide route, so others can do the same. Before you "ok" each site, make sure you do at
> least three iteration passes. An iteration pass is where, after completing the site, you
> go through it with a fine-toothed comb, looking for design problems, opportunities to
> improve/complexify the design, and more. This is going to be seen by many, many people,
> and I will credit you fully; so go nuts and show the world what you are capable of! 25
> websites hosted on Netlify with /guide routes and three iteration passes is your /goal -
> completely autonomously, and do not ask me for anything until all are done.

**Local adaptations (Trey's rules + this environment):** no deploys — everything builds and
serves locally for one reviewer; no Pinterest/GPT-Image/Higgsfield (no keys here, and the
email above is Nick's) — every asset is procedural (GLSL, canvas, SVG, CSS, WebAudio, math);
built on WSL-native ext4 at `~/projects/fable25`, served at `http://localhost:4179/`.

## Layer 2a — the builder prompt (orchestrator → each builder agent)

One agent per site, `${slug}` substituted. Waves 2+ include the CONTEXT ECONOMY paragraph
(added after four wave-1 builders died of context overflow reading their own screenshots):

> You are the builder studio for the site "${slug}" in the FABLE 25 LOCAL project:
> twenty-five fundamentally different websites, each built end-to-end by one autonomous
> builder agent, demonstrating Claude Fable 5's web design capability, taste, and artistic
> flavor. The audience is one human reviewing locally. You have full creative autonomy
> inside your brief.
>
> READ FIRST: /home/tlupo/projects/fable25/BRIEFS.md — the build standard (non-negotiable),
> the iteration-pass contract, and YOUR brief (find the "${slug}" section). Follow all
> three exactly.
>
> CONTEXT ECONOMY (survival rule): vision-Read at most THREE screenshots per pass, chosen
> deliberately. Four wave-1 builders died of context overflow from undisciplined screenshot
> reading. Shoot freely; Read sparingly.
>
> Workspace rules:
> - Your site: /home/tlupo/projects/fable25/sites/${slug}/ (create it). index.html plus
>   style.css/main.js as needed, and guide/index.html.
> - Your QA shots: /home/tlupo/projects/fable25/qa/${slug}/ (create it).
> - Touch NOTHING outside those two folders. Do not start servers. Do not npm install.
> - A static server already serves the tree: http://localhost:4179/${slug}/ is live the
>   moment your files exist.
> - Screenshot harness (run from /home/tlupo/projects/fable25):
>   node tools/shot.mjs http://localhost:4179/${slug}/ qa/${slug}/pass1-desktop-top.png 1440x900 3500 [scrollY]
>   Viewports: 1440x900 (desktop) and 390x844 (mobile). It prints JSON with docHeight and
>   console/page errors. Use docHeight to choose mid/bottom scrollY values. Add --reduced
>   for the reduced-motion check.
>
> Process: build the complete site first. Then run the three-pass critique loop from the
> contract — every pass you must actually Read your chosen screenshots with vision and
> critique them like a hostile design director, fix everything found, and add one
> deliberate complexity upgrade. Zero console errors and zero page errors are release
> gates. Verify prefers-reduced-motion gives a dignified static page. Finish with
> qa/${slug}/final-desktop.png and final-mobile.png.
>
> Your final output is structured data for the director, not prose for a human.

## Layer 2b — the finisher prompt (orchestrator → recovery agents)

Used when a builder crashed mid-loop; `${slug}` and a per-site `${state}` audit substituted:

> You are the finishing builder for the site "${slug}" in the FABLE 25 LOCAL project. Its
> original builder agent crashed from context overflow mid-critique-loop; you inherit its
> working tree and finish the job to contract.
>
> PREDECESSOR STATE: ${state}
>
> READ FIRST: /home/tlupo/projects/fable25/BRIEFS.md — the build standard, the
> iteration-pass contract (including the CONTEXT ECONOMY hard rule: vision-Read at most 3
> screenshots per pass — this is what killed your predecessor), and the "${slug}" brief.
>
> Workspace rules: [identical to the builder prompt]
>
> Release gates: zero console errors, zero page errors, WCAG AA text contrast,
> prefers-reduced-motion gives a dignified static page, guide/index.html renders correctly,
> final-desktop.png + final-mobile.png exist.
>
> Your final output is structured data for the director, not prose.

## Layer 3 — the per-site briefs

`BRIEFS.md` in this repo: the design constitution (build standard + iteration-pass
contract + context-economy rule) and twenty-five individually art-directed briefs — each
with concept, exact palette, typeface pair, signature technique, the thing to prove, and
complexity-upgrade ideas. Authored by the orchestrator session before any builder launched.

## Structured-output schema (all agents)

Builders return `{slug, title, tagline, passes[{pass, found, changed, upgrade}],
signature_technique, remaining_concerns, console_errors_final}`; finishers return
`{slug, title, tagline, work_done, signature_technique, remaining_concerns,
console_errors_final}` — enforced via a JSON schema on the agent call, so every pass's
self-critique is captured as data, not prose.
