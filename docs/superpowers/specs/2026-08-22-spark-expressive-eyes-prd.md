# PRD — Spark expressive eye system

**Status:** approved to build 2026-08-22 ("go ahead"), on the two assumptions recorded below.
**Branch:** `feat/landing-pwa` (already past its final whole-branch review; this adds to it).

## Problem

The Spark orb tracks the cursor and blinks, but it has no inner life. It cannot notice you, react,
think, acknowledge, or rest. It reads as a decorated graphic rather than a character — and the
character is the landing page's main personality asset.

## Goal

An original expressive-eye system with the *range and timing* associated with sophisticated
robotic-character animation: gaze, attention, surprise, curiosity, thinking, acknowledgment,
error, sleep and wake, with everything returning smoothly to cursor tracking.

**Explicitly not** a recreation of EVE or any existing character — no third-party artwork, model,
or animation frames. Original geometry only, built from the orb that already exists.

## Two assumptions (stated, not verified with the user)

1. **`/join` stays calm.** The orb renders on the sign-up form. An orb that gets curious, thinks,
   and falls asleep beside a form works against the single conversion that page exists to
   produce. `/join` gets tracking + blink + the existing submit acknowledgment; the landing page
   gets the full range.
2. **This lands before the Railway deploy**, since the deploy is deferred.

## Non-goals

- No change to the visual design of the orb body (shipped 2026-08-22, commit `0a1fc57`).
- No new dependency. No Framer Motion / GSAP — the existing rAF + direct-DOM approach already
  outperforms what a library would give here, and adding one costs a teacher mobile-data bytes.
- No behaviour that fires with no real event behind it (see Hooks).

## What already exists and is being reused, not rebuilt

Verified by inspection 2026-08-22:

- **Global cursor tracking**, already the correct "look toward, never move to" model:
  `eyeOffset()` returns a normalised direction vector saturating at 14 user-units past reach 240.
- **The performance architecture**: rAF loop writing via `setAttribute` / `style.transform`
  straight to the DOM, zero React re-renders per pointer move, cached `getBoundingClientRect`,
  `IntersectionObserver` parking the loop off-screen, frame-rate-independent easing with a
  two-sided delta clamp.
- **Gaze already survives the blink** — the blink swaps eye-*shape* opacity while the eye *group*
  keeps its translate.
- `orbTilt()` parallax, `idlePointer()` touch wander, pure DOM-free geometry in `eyes.ts`.

## The structural change

Today the eyes are **shape-swap**: five pre-drawn SVG paths cross-faded by opacity. Expressive
work needs **parametric** eyes — width, height, roundness, spread, lift, opacity and tilt as
continuous values that can be interpolated, overshot and blended. That rewrite is the enabler;
everything else layers on it.

**Backwards compatibility is a hard requirement.** `data-state` and the five
`.spark__eye-shape--<state>` classes are consumed by `Landing.tsx`, `Join.tsx`, `Joined.tsx` and
four tests. Those keep working unchanged. The new machine is exposed as a separate
`data-behavior` attribute, and the parametric geometry drives the neutral/blink shape while
`puppy`, `starry` and `happy` remain drawn shapes.

## Behaviours and their real hooks

Only behaviours with a genuine trigger ship. Anything else would be decoration pretending to be
intelligence.

| Behaviour | Priority | Real trigger |
|---|---|---|
| `error` | 4 | `/join` validation failure or API error |
| `surprised` | 4 | first pointer entry after load |
| `success` | 3 | `/join` submit accepted (already sets `mood="happy"`) |
| `curious` | 2 | pointer dwells on the CTA |
| `thinking` | 2 | `/join` submit in flight (~700 ms) |
| `waking` | 1 | pointer returns after sleep |
| `sleeping` | 0 | 45 s without pointer movement |
| `tracking` | 0 | default |

Higher priority pre-empts lower. A transient behaviour expires and falls back to `tracking`,
resuming from the cursor's *current* position — never via centre.

## Movement vocabulary

- Velocity-aware gaze: slow pointer → smooth minimal follow; fast pointer → quicker reaction.
- Spring settle with slight overshoot rather than a mechanical stop.
- Micro-saccades: sub-pixel secondary drift, barely perceptible.
- Blink variety: normal, fast, double, occasional long; gaze preserved throughout.
- Idle looking-around during long dwell, rarely.

## Accessibility

`prefers-reduced-motion` currently kills tracking outright. That is all-or-nothing and loses
essential feedback. New behaviour: keep a reduced-amplitude gaze and blinks, drop saccades,
overshoot, idle wander, breathing and the sleep cycle.

## Success criteria

- Cursor tracking works in all eight directions, at slow and fast speeds, and resumes correctly
  after every transient behaviour without snapping or centre-returning.
- Every listed behaviour is reachable from a real trigger and observed in a browser.
- No React re-render on pointer movement (unchanged from today).
- The existing `data-state` contract and all four Spark tests pass untouched.
- No horizontal-scroll or contrast regression on any page.
