# TweetLens design

TweetLens is a lab instrument for tweets. Every tweet is dipped like litmus
paper and changes colour: acid red for negative, violet for neutral, alkaline
blue for positive. The litmus strip is the one signature element and the main
unit of visualisation. Everything around it stays quiet, precise and readable,
like a well-kept lab notebook.

Red, violet and blue follow real litmus chemistry, and they stay distinguishable
for people with red-green colour blindness (the three hues differ in hue angle
by 75° or more in OKLCH and never rely on red-vs-green).

This file is the contract for the frontend. It was written before any frontend
code and is checked against the "Never use" list at the end.

---

## 1. Tokens

Only these colours exist. `--surface` in the light theme is an alias of
`--paper`, so components can use one token name in both themes.

| Token        | Bench (light) | Night lab (dark) | Role                                   |
| ------------ | ------------- | ---------------- | -------------------------------------- |
| `--paper`    | `#F2F4F3`     | `#1B2025`        | page background                        |
| `--surface`  | = `--paper`   | `#252B31`        | composer and raised areas (dark only)  |
| `--graphite` | `#262B30`     | `#E4E8E6`        | primary text, focus ring, primary button fill |
| `--pencil`   | `#5E666D`     | `#9AA3A9`        | secondary text, control borders        |
| `--bench`    | `#D9E0DC`     | `#343B42`        | 1px rules, panel edges, gridlines      |
| `--acid`     | `#C8364E`     | `#E2566C`        | negative (score −1)                    |
| `--litmus`   | `#7B5CA6`     | `#9D80C8`        | neutral (score 0)                      |
| `--base`     | `#2A6CB0`     | `#4F8FD6`        | positive (score +1)                    |

### Measured contrast (WCAG 2.x ratio, computed with culori)

| Pair                                   | Bench  | Night lab        | Verdict                       |
| -------------------------------------- | ------ | ---------------- | ----------------------------- |
| graphite on paper                      | 12.93  | 13.27            | AA, AAA                       |
| graphite on surface                    | n/a    | 11.57            | AA, AAA                       |
| pencil on paper                        | 5.28   | 6.40             | AA                            |
| pencil on surface                      | n/a    | 5.57             | AA                            |
| acid / litmus / base on paper          | 4.64 / 4.84 / 4.91 | 4.52 / 4.97 / 4.87 | AA for body text   |
| any OKLCH ramp colour on paper (11 samples) | min 4.64 | min 4.52     | AA for body text              |
| acid / litmus / base on surface        | n/a    | 3.94 / 4.33 / 4.24 | large text only (≥ 3:1)     |
| paper text on any ramp colour          | min 4.64 | min 4.52       | AA                            |
| graphite text on any ramp colour       | ~2.7   | ~2.8             | **fails, never used**         |
| paper text on graphite (primary button)| 12.93  | 13.27            | AA, AAA                       |
| graphite on bench                      | 10.64  | 9.18             | AA                            |
| pencil on bench                        | 4.35   | 4.42             | **fails, never used**         |
| bench line on paper                    | 1.21   | 1.45             | decorative rules only         |
| pencil line on paper                   | 5.28   | 6.40             | control boundaries (≥ 3:1)    |

Rules that follow from the table:

1. Coloured (hue) text sits only on `--paper`, never on `--surface` or `--bench`.
2. Text on a coloured strip or band is `--paper`, never `--graphite`.
3. `--bench` never sits behind text other than `--graphite`.
4. **Deviation from the brief:** text inputs, selects and secondary buttons draw
   their 1px border in `--pencil`, not `--bench`. `--bench` is 1.21:1 against
   paper and WCAG 1.4.11 asks 3:1 for the edge that identifies a control.
   `--bench` still draws every rule, panel edge and gridline.

### Score to colour

`score = P(positive) − P(negative)`, in [−1, +1].
`t = (score + 1) / 2`, then interpolate `acid → litmus → base` in **OKLCH**
(culori `interpolate([acid, litmus, base], 'oklch')`), shorter hue path.
The path runs red → raspberry → orchid → violet → indigo → blue; never three
flat steps. Sampled Bench ramp at t = 0, 0.1 … 1:

```
#c8364e #bd3c6c #af4484 #9f4d95 #8d55a1 #7b5ca6 #705fac #6362b0 #5465b2 #4268b2 #2a6cb0
```

Verdict words come from the arg-max class, not from the score:
"Reads negative", "Reads neutral", "Reads positive". When the top class is
under 50% the verdict says "Leans" instead of "Reads".

### Focus

Every focusable element: `outline: 2px solid var(--graphite); outline-offset: 2px`
via `:focus-visible`. Never removed, never recoloured.

### Shape

No drop shadows anywhere. Radius is chosen per element:

| Element                         | Radius |
| ------------------------------- | ------ |
| litmus strip, swatches, bands   | 2px    |
| text inputs, composer, selects  | 6px    |
| buttons                         | 4px    |
| chips                           | 999px (pill, they are tags) |
| charts, tables, sections        | 0 (sections are rules, not cards) |

---

## 2. Typography

One family: **Atkinson Hyperlegible Next** (Google Fonts, weights 400/500/700,
plus italic 400), fallback `"Atkinson Hyperlegible", system-ui, sans-serif`.

Scale, ratio 1.25:

| Token        | px | Use                                             |
| ------------ | -- | ----------------------------------------------- |
| `--step--1`  | 14 | captions, axis labels, swatch labels            |
| `--step-0`   | 16 | body (line-height 1.55, measure ≤ 70ch)         |
| `--step-1`   | 20 | section headings, composer text                 |
| `--step-2`   | 25 | page headings                                   |
| `--step-3`   | 31 | secondary readings (arena scores, pulse average)|
| `--step-4`   | 39 | mobile hero score                               |
| `--step-5`   | 61 | hero score                                      |

Hero score: 61px, weight 700, `font-variant-numeric: tabular-nums`,
`letter-spacing: -0.02em`, always signed with a true minus (U+2212):
`+0.62`, `−0.81`, and `±0.00` when it rounds to zero.

Sentence case everywhere. No all-caps, no letter-spaced eyebrows above
headings, no headline with a single coloured or italic word.

---

## 3. The litmus strip

| Property     | Value                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| Size         | 72px wide, 2px radius; 320px tall on Analyze, 200px in Arena                |
| Paper        | `--paper` mixed 4% toward `--graphite`, plus SVG `feTurbulence` fibre noise at 6% opacity (5% in dark) |
| Dry handle   | the top 14% never takes colour: that is where the strip is "held"           |
| Wick         | colour rises from the bottom behind an SVG mask whose top edge is a soft, slightly irregular wave (two summed sines, ±3px). 900ms, `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out). The wave keeps a slow drift for 900ms, then flattens to a faint ±1px meniscus. |
| Glide        | analyze-as-you-type and model switches: no re-wick; the fill colour tweens to the new hue over 300ms (OKLCH interpolation per frame) |
| Score        | printed beside the strip, never on it                                       |
| Mobile (< 720px) | rotates to a horizontal band (full width × 44px) above the reading; colour wicks from left to right; the dry handle is the left 10% |

Reuse, so the app has one visual language:

* **Model arena:** four strips side by side, model name and signed score
  under each. One line of text names the outlier.
* **Robustness lab:** a results tray. Rows are tricky tweets, columns are
  models; each cell is a 28 × 36px swatch of strip paper in the model's hue.
  A wrong call gets a thin 1.5px `--paper` cross drawn on the swatch (paper on
  any ramp colour is ≥ 4.52:1).
* **Live pulse:** a horizontal chart-recorder ribbon. Each incoming tweet adds a
  3px band that scrolls left; a rolling-average line (last 25 tweets) is drawn
  above it in `--graphite`. Clicking a band opens that tweet.
* **Bulk analyzer:** the whole dataset as a "mood barcode": one thin band per
  tweet in date order (file order if there is no date), scaled to the width,
  above every other chart.

---

## 4. Layout

Analyze is the home page. No hero, no tagline, no statistics: the first thing on
screen is the composer with the strip beside it.

Grid (≥ 1100px): `nav 184px | gap 48px | main (fluid, max 760px) | gap 40px | strip column 152px`.
Content is left-aligned; the right side of very wide screens stays empty paper.
Between 720px and 1100px the nav rail stays, the strip column narrows to 96px.
Below 720px the rail collapses to a top bar with a "Menu" disclosure, and the
strip turns horizontal above the reading. Works down to 360px with no
horizontal scroll.

Sections are separated by 48px of space and a 1px `--bench` rule. Nothing
floats; nothing has a shadow.

### Navigation rail

```
TweetLens

Analyze          ▌   ← 3 × 18px bar in the colour of the last analysed score
Model arena
Robustness lab
Live pulse
Bulk analyzer



Night lab        ← theme toggle, a text button that names the theme it switches to
```

Plain text links, no icons. The active page is marked by a short vertical bar
in the colour of the last analysed sentiment (`--pencil` before anything has
been analysed).

---

## 5. Wireframes

### 5.1 Analyze (`/`), 1440px

```
┌────────────────┬───────────────────────────────────────────────────────────┬───────────────┐
│ TweetLens      │ Analyze a tweet                                           │               │
│                │                                                           │   ┌───────┐   │
│ ▌Analyze       │ ┌───────────────────────────────────────────────────────┐ │   │ (dry) │   │
│  Model arena   │ │ Paste a tweet, or write one                           │ │   │       │   │
│  Robustness lab│ │                                                       │ │   │~~~~~~~│   │
│  Live pulse    │ │                                                       │ │   │▓▓▓▓▓▓▓│   │
│  Bulk analyzer │ └───────────────────────────────────────────────────────┘ │   │▓▓▓▓▓▓▓│   │
│                │ Examples (Sarcastic) (Hinglish) (Negation) (Emoji only)  ◔ │   │▓▓▓▓▓▓▓│   │
│                │                                                    94 left│   │▓▓▓▓▓▓▓│   │
│                │ [Test this tweet]   Read with: VADER  Naive Bayes         │   │▓▓▓▓▓▓▓│   │
│                │                     ▔Logistic regression▔  Neural net     │   └───────┘   │
│                │                                                           │               │
│                │ +0.62                       Reads positive                │               │
│                │ negative 8%   neutral 22%   positive 70%                  │               │
│                │───────────────────────────────────────────────────────────│               │
│                │ Pipeline x-ray                                            │               │
│                │ Stage 4 of 8  Emojis become words                         │               │
│                │                                                           │               │
│                │   so   NOT_happy   with   face_with_tears_of_joy          │               │
│                │                                                           │               │
│                │ [Previous stage] [Next stage] [Play all]   or use ← and → │               │
│                │───────────────────────────────────────────────────────────│               │
│                │ [Why this prediction?]                                    │               │
│                │  I am ‿‿‿‿ not happy ‿‿‿‿ with this 😂                     │               │
│                │  Blue underlines pushed the score up, red pulled it down. │               │
│                │───────────────────────────────────────────────────────────│               │
│ Night lab      │ Emotions                      │ Irony check               │               │
│                │ joy        ███████████ 61%    │ 23% likely ironic         │               │
│                │ optimism   █████ 24%          │ ▕████░░░░░░░░▏            │               │
│                │ sadness    ██ 9%              │ Trained on 2,862 tweets;  │               │
│                │ anger      █ 6%               │ treat it as a hint.       │               │
└────────────────┴───────────────────────────────────────────────────────────┴───────────────┘
```

The strip column is sticky, so the strip stays beside the reading while the
x-ray, why and emotion sections scroll under it.

### 5.2 Analyze, 390px

```
┌──────────────────────────────┐
│ TweetLens              Menu  │
│──────────────────────────────│
│ Analyze a tweet              │
│ ┌──────────────────────────┐ │
│ │ Paste a tweet, or write  │ │
│ │ one                      │ │
│ └──────────────────────────┘ │
│ (Sarcastic) (Hinglish)     ◔ │
│ (Negation) (Emoji only)      │
│ [Test this tweet]            │
│ Read with [Logistic regr. ▾] │
│ ┌──────────────────────────┐ │
│ │dry│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓~~     │ │  ← strip turned horizontal
│ └──────────────────────────┘ │
│ +0.62                        │
│ Reads positive               │
│ negative 8% neutral 22% …    │
│──────────────────────────────│
│ Pipeline x-ray …             │
```

### 5.3 Model arena (`/arena`)

```
│ Model arena                                                    │
│ Four models read the same tweet. When they disagree, the       │
│ colours split.                                                 │
│ ┌───────────────────────────────────────────────┐              │
│ │ tweet text                                    │ [Compare]    │
│ └───────────────────────────────────────────────┘              │
│ Examples (Sarcastic) (Hinglish) (Negation) (Emoji only)        │
│                                                                │
│   ┌──┐      ┌──┐      ┌──┐      ┌──┐                           │
│   │  │      │  │      │  │      │  │                           │
│   │▓▓│      │▓▓│      │░░│      │▓▓│                           │
│   └──┘      └──┘      └──┘      └──┘                           │
│   VADER     Naive     Logistic  Neural                         │
│             Bayes     regr.     net                            │
│   −0.41     −0.38     +0.12     −0.52                          │
│                                                                │
│ Logistic regression is the outlier: it reads neutral while     │
│ the other three read negative.                                 │
│────────────────────────────────────────────────────────────────│
│ On 12,284 held-out tweets (TweetEval test split)               │
│ Macro F1                         Accuracy                      │
│ Logistic regression ████████ .61 Logistic regression ███ .64   │
│ Neural net          ███████  .60 …                             │
│ …                                                              │
│                                                                │
│ Where each model goes wrong (rows: true label, columns: read)  │
│ VADER           Naive Bayes     Logistic regr.   Neural net    │
│ ┌──┬──┬──┐      ┌──┬──┬──┐      ┌──┬──┬──┐       ┌──┬──┬──┐    │
│ │..│..│..│      │  │  │  │      │  │  │  │       │  │  │  │    │
│ └──┴──┴──┘      └──┴──┴──┘      └──┴──┴──┘       └──┴──┴──┘    │
│────────────────────────────────────────────────────────────────│
│ How each model reads (four short paragraphs)                   │
```

Mobile: strips stay side by side (4 × 64px fits in 360px with 16px gutters),
heights shrink to 160px; confusion matrices go two per row.

### 5.4 Robustness lab (`/robustness`)

```
│ Robustness lab                                                     │
│ 36 tweets written to trip models up. Each swatch is one model's    │
│ reading of that tweet; a cross marks a wrong call.                 │
│                                                                    │
│ Correct calls   VADER 22 of 36  Naive Bayes 17 of 36  …            │
│                 (bar under each name, direct-labelled)             │
│────────────────────────────────────────────────────────────────────│
│                                     VADER  Naive  Logistic Neural  Expected  │
│ Negation                                   Bayes  regr.    net               │
│   not bad at all, honestly            ▮     ▮✕     ▮        ▮      positive  │
│   I don't hate it                     ▮✕    ▮✕     ▮        ▮      positive  │
│ Sarcasm                                                            │
│   Great, my flight is delayed again   ▮✕    ▮      ▮✕       ▮✕     negative  │
│ …                                                                  │
│ Your traps                                                         │
│   (rows added by the user, kept in this browser)                   │
│────────────────────────────────────────────────────────────────────│
│ Add a trap                                                         │
│ [tweet text                          ] Expected (neg|neu|pos)      │
│ [Add to tray]                                                      │
```

Selecting a row (click or Enter) expands it inline: the four signed scores and
one sentence on why the tweet is tricky. Mobile: the tweet text wraps above its
four swatches; the expected label sits at the end of the swatch row.

### 5.5 Live pulse (`/pulse`)

```
│ Live pulse                                                          │
│ Replays the TweetEval test split in random order as if it were      │
│ arriving now. There is no live connection to X.                     │
│                                                                     │
│ [Pause]  Speed (1×) 2× 4×  Read with [Logistic regression ▾]        │
│ Track a word [ ______ ]                                             │
│                                                                     │
│ +0.08  rolling average of the last 25 tweets                        │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │      ~~~~~~~~~~~~~~~/\~~~~~~~~~~~~~~~ +0.08                       │ │
│ │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ 0 (faint grid)           │ │
│ │ |||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||| │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ older                                                         now  │
│                                                                     │
│ 312 tweets so far: 98 negative, 141 neutral, 73 positive            │
│─────────────────────────────────────────────────────────────────────│
│ Selected tweet                                                      │
│ ▮  "text of the clicked band"                                       │
│    −0.44 Reads negative. TweetEval label: negative.                 │
```

The ribbon pauses while the pointer is over it so a band can be clicked.
Arrow keys move the selection between bands when the ribbon has focus.

### 5.6 Bulk analyzer (`/bulk`)

```
│ Bulk analyzer                                                       │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│   Drop a CSV of tweets to test a whole batch.                       │
│ │ It needs a 'text' column. 'date' and 'label' columns are       │  │
│   optional and unlock the timeline and the error matrix.            │
│ │ [Upload CSV]  [Try 1,200 airline tweets from February 2015]    │  │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│ (after a file is read)                                              │
│ Mood barcode: 1,200 tweets, 16 to 24 Feb 2015                       │
│ ||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||| │
│ 16 Feb                                                      24 Feb  │
│                                                                     │
│ −0.31  mean score    [Download report]                              │
│ negative ████████████ 58%                                           │
│ neutral  █████ 24%                                                  │
│ positive ███ 18%                                                    │
│                                                                     │
│ Daily mean score (line, direct label at the last point)             │
│ Error matrix (if 'label'): 3×3 litmus heatmap with counts           │
│ Words driving this batch: most negative / most positive terms       │
│ Strongest readings: five most negative, five most positive tweets   │
```

The dropzone is the empty state. After a file is read it shrinks to a single
line: "airline-tweets.csv, 1,200 rows. [Upload another CSV]".

---

## 6. Motion plan

There is exactly one orchestrated moment. Everything else answers a user action.

| Trigger                                | Motion                                                                 | Duration / easing                 | Reduced motion          |
| -------------------------------------- | ---------------------------------------------------------------------- | --------------------------------- | ----------------------- |
| First visit of a session (Analyze)     | demo tweet types itself into the composer (~28ms per character), then the strip wicks | ~2.6s total, once per session (`sessionStorage`) | text appears at once, strip colours at once |
| "Test this tweet", example chip, Enter | strip drains to dry paper (120ms) then wicks up                        | 900ms, ease-out                   | colour changes at once  |
| Typing (debounced 280ms)               | strip hue glides; score number tweens                                  | 300ms, ease-out                   | instant                 |
| Switching model                        | strip hue glides; nav bar hue glides                                   | 300ms                             | instant                 |
| X-ray: next / previous stage           | removed tokens strike through (180ms) then collapse out (framer-motion layout); emoji tokens cross-fade into words; hashtags split into pieces that slide apart; negators slide into the next word and become `NOT_` | ~650ms per stage                  | stage swaps at once     |
| X-ray: Play all                        | steps through every stage                                              | 1.1s per stage                    | steps without animation |
| "Why this prediction?" opened          | rough-notation underlines draw one after another, strongest first      | 350ms each                        | drawn at once           |
| Arena compare                          | the four strips wick together, staggered 60ms                          | 900ms                             | at once                 |
| Live pulse                             | ribbon scrolls left by 3px per tweet; average line redraws             | linear, per tweet                 | bands appear without scrolling |
| Bulk barcode                           | none (it is data, it just appears)                                     | n/a                               | n/a                     |

Never: fade-and-slide-up on sections, hover lift, parallax, particles, blobs,
glows, looping idle animations.

`MotionConfig reducedMotion="user"` wraps the app, and every hand-written
animation checks `prefers-reduced-motion`.

---

## 7. Charts

D3 (scales, shapes) rendered as React SVG, token palette only.

* Lines and bars are labelled directly; no legends.
* Faint horizontal gridlines in `--bench` only; no vertical gridlines, no 3D,
  no default chart colours.
* Category colours: negative `--acid`, neutral `--litmus`, positive `--base`.
  Non-sentiment series (macro F1, emotions) are `--graphite` bars.
* Confusion matrices are heatmaps on a single-hue `--litmus` ramp (from
  `--paper` to `--litmus`, OKLCH), with the count printed in each cell. Count
  text flips from `--graphite` to `--paper` above 55% intensity; both pass AA
  at the extremes of the ramp.
* Axis text 14px `--pencil`.

---

## 8. Copy

Plain, specific, sentence case. Buttons say what happens.

| Place                | Text                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| Composer placeholder | Paste a tweet, or write one                                                          |
| Analyze button       | Test this tweet                                                                      |
| Arena button         | Compare the four models                                                              |
| X-ray controls       | Previous stage, Next stage, Play all                                                 |
| Why toggle           | Why this prediction? / Hide the reasons                                              |
| Bulk empty state     | Drop a CSV of tweets to test a whole batch.                                          |
| Bulk buttons         | Upload CSV, Try 1,200 airline tweets from February 2015, Download report             |
| Missing column error | This CSV has no 'text' column. Rename the column that holds the tweets to 'text' and upload it again. |
| Empty file error     | This CSV has a 'text' column but every row in it is empty. Fill in the tweets and upload it again. |
| Too large            | This CSV has 31,204 rows. TweetLens reads up to 20,000 at a time; split the file and upload the parts. |
| Server down          | TweetLens can't reach its models. Start the API with `make api` and try again.       |
| Pulse note           | Replays the TweetEval test split in random order as if it were arriving now. There is no live connection to X. |
| Robustness add       | Add to tray                                                                          |

---

## 9. What the instruments measure

Four models, all trained in this repository on the TweetEval sentiment
training split (45,615 tweets) and scored on its 12,284-tweet test split:

| Model               | How it reads                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| VADER               | hand-built lexicon and grammar rules on the raw tweet; its four scores are calibrated into three probabilities with a small logistic regression |
| Naive Bayes         | word and word-pair counts after the pipeline                                    |
| Logistic regression | TF-IDF over words, word pairs and 2–5 character pieces after the pipeline (the default instrument) |
| Neural net          | one hidden layer of 128 units over TF-IDF word features                         |

Emotions (anger, joy, optimism, sadness) and irony come from two more
logistic regressions trained on TweetEval's emotion and irony splits.
"Why this prediction?" is leave-one-out: the weight of a word is how much the
score moves when that word is removed and the tweet is read again.

---

## 10. Review against the "Never use" list

| Never use                                         | How TweetLens stays clear                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Purple-to-blue gradients                          | The only gradient-like thing is the score ramp, and it is never painted as a gradient: each strip, swatch and band is one flat interpolated colour. The barcode is many flat bands. |
| Gradient text                                     | None. Text is graphite, pencil, paper or a single flat hue.                               |
| Glassmorphism                                     | No blur, no translucency over content.                                                    |
| Neon glow                                         | No shadows or glows of any kind.                                                          |
| Sparkle icons, ✨                                 | No icon set at all. The only drawn marks are the cross on wrong swatches and the counter ring. |
| Emojis in headings or buttons                     | Emojis appear only inside tweets, which is the data.                                      |
| Inter / Roboto / Poppins                          | Atkinson Hyperlegible Next only.                                                          |
| Grids of identical rounded cards with soft shadows| Sections are separated by whitespace and 1px rules. The arena's four strips are instruments, not cards, and have no container. |
| All-caps eyebrow labels                           | Sentence case everywhere, no eyebrows. `NOT_` in the x-ray is data, shown in a token, not a label. |
| 01 / 02 / 03 markers on non-sequences             | Numbers appear only on the x-ray, which is a true sequence ("Stage 4 of 8").              |
| "A · B · C" meta strings                          | Meta is written as sentences ("1,200 tweets, 16 to 24 Feb 2015").                         |
| "→" on buttons                                    | Buttons are plain verbs.                                                                  |
| "Unlock the power of AI" hero copy                | No hero. The composer is the first thing on screen.                                       |
| Fake testimonials or statistics                   | Every number on screen is computed from real data at run time or training time; the live pulse says it is a replay. |
| A stock icon next to every item                   | No icons.                                                                                 |

Changes made while reviewing this document:

* The reading under the hero score was sketched as
  "Logistic regression · 70% sure · 12ms", an "A · B · C" meta string. It is
  now a sentence ("Reads positive. Logistic regression gives it 70%.") and the
  latency moved to the arena, where it is compared.
* The arena's four models were at risk of becoming four identical boxes. They
  are strips standing on the paper with a text label underneath, no container,
  and the benchmark numbers live in a real bar chart below them.
* The hero score was first planned in the sentiment hue. It is `--graphite`
  instead: the strip already carries the colour, and the instrument stays quiet
  around it.
* Control borders moved from `--bench` to `--pencil` (see rule 4 in section 1).

This review is repeated against the 1440px and 390px screenshots of every page
in both themes as each page is built.
