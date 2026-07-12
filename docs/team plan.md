# 16-Day Team Plan — From A (Team Lead)

Hi team — I'm **A**, the AI/ML lead and **team lead** for this SOC dashboard hackathon.

This doc is our shared schedule for **16 days**. I wrote it in plain language so **B** (cybersec / backend), **C & D** (frontend + deck) can all see what everyone is doing and why.

**Assumption:** We have about **16 calendar days** with a few hours each (not 16 full-time days). If we get full days free, we can move faster — tell me and we'll compress.

**What we're building (MVP):**

```
Replay script (A)  →  Detection API (A)  →  ATT&CK + Neo4j (B)
                                              ↓
                                    RAG narrative + decisions (B)
                                              ↓
                                    Dashboard (C & D)
```

**What we're NOT building unless we're ahead on Day 12:**

- Cortex XSOAR, live Wazuh/OSQuery agents, Mininet simulation, self-hosted LLaMA, Digital Twin

A tight demo that works beats a huge vision that breaks on stage.

---

## Quick role guide

| Person | Role in one line |
|--------|------------------|
| **A (me)** | Network data → replay → detect attacks → send scores to backend |
| **B** | Map attacks to MITRE ATT&CK, Neo4j graph, RAG stories, mock SOAR responses |
| **C & D** | React dashboard, graphs, alert list, deck, demo video |

---

## The one rule that saves us: Day 1 API contract

On **Day 1**, the whole team agrees on JSON shapes — **written down**, not just spoken.

Example pieces we need to agree on:

- **Anomaly / detection event** — what A sends when something looks suspicious
- **ATT&CK match** — what B returns after mapping to a technique
- **Decision output** — what B recommends (block, isolate, etc.)
- **Audit log** — what gets stored for the dashboard timeline

If we skip this, **Day 9 integration will hurt**. C & D can use fake JSON that matches the real shape from Day 2 onward.

---

## Day-by-day overview

| Day | A — Data + AI/ML | B — Cybersec backend | C & D — Frontend + deck | Team |
|-----|------------------|----------------------|-------------------------|------|
| **1** | Pick CICIDS2017 subset, explore data | Pick 15–20 ATT&CK techniques (not the whole matrix) | Wireframe dashboard, repo setup | **Lock architecture + API contracts** |
| **2** | Replay script + fake scoring (prove the pipe) | Neo4j Aura + load ATT&CK subset | Dashboard shell + mock JSON | — |
| **3** | Baseline profiles (normal traffic only) | Test ATT&CK similarity matching | Alert list with 50–100 mock alerts | — |
| **4** | Isolation Forest (first working model) | Tune matching on edge cases | Attack-path graph (mock data) | — |
| **5** | Ensemble scoring + `/score` endpoint | Small curated RAG corpus (15–20 docs) | Layout + explainability placeholder | — |
| **6** | Threshold tuning | RAG narrative endpoint | Decision UI + audit trail UI | — |
| **7** | Test harness (accuracy on labeled rows) | Decision engine + blast radius | Human review queue UI | — |
| **8** | Fix detection edge cases | Mock SOAR + audit logging | Polish UI, loading states | A & B test against fake I/O |
| **9** | — | — | — | **Full integration test (whole pipeline)** |
| **10** | Wire live to B, one hop at a time | Same | Real API behind feature flag | — |
| **11** | 2–3 attack scenarios + 1 normal run | Validate ATT&CK across scenarios | Real data in all panels | — |
| **12** | Demo-critical bug fixes only | Same | UI polish, empty states | **Digital Twin go/no-go** |
| **13** | Feature freeze | Feature freeze | Deck + real metrics/screenshots | — |
| **14** | Support rehearsal | Support rehearsal | Final deck, backup video | Rehearse with timer |
| **15** | Freeze code, README/architecture | Same | Final video + speaker notes | Tag release commit |
| **16** | Final rehearsal, judge Q&A prep | Same | Submit repo + deck + video | **Submit early** |

---

## Day 1 — Foundations

**Team checkpoint (everyone, ~1–2 hours together)**

- Draw the pipeline on paper or a whiteboard
- Agree who owns which repo folders
- **Write the API contract** in a shared doc (Google Doc / `docs/API_CONTRACT.md`)
- Pick **one primary demo attack** (e.g. Port Scan or DDoS from our CSVs)

---

### A (me) — Day 1

**Tasks**

- Use **CICIDS2017**, not NSL-KDD — it's newer and fits our "modern enterprise attack" story
- Download only what we need: Wednesday + Friday CSVs (we already have 4 files in `data/`)
- Run EDA: row counts, labels, missing values, duplicates

**Why**

We don't need gigabytes of data. A small slice with clear attack labels is enough for a convincing demo.

**Tip**

Column names in CICIDS2017 often have **extra spaces** — strip them when loading or joins break later.

**Done when**

- We know which attack types are in our files (BENIGN, DDoS, PortScan, DoS variants, Bot, etc.)
- EDA summary exists (see `reports/eda/`)

---

### B — Day 1

**Tasks**

- Don't map the entire MITRE ATT&CK matrix — pick **15–20 techniques** that match our CICIDS2017 attacks
- Examples: brute force (T1110), lateral movement (T1021) — only if they appear in our scenario

**Why**

"Complete ATT&CK coverage" sounds good but wastes days. Judges care that mapping is **believable**, not exhaustive.

**Tip**

List technique ID, name, and tactic (e.g. Initial Access, Discovery) in a spreadsheet B can load into Neo4j later.

---

### C & D — Day 1

**Tasks**

- Sketch dashboard on **paper or Figma** before coding: alert feed, graph, detail panel, audit log
- Set up repo (or monorepo folders), pick UI library, colors/fonts

**Why**

30 minutes of wireframing saves a day of rearranging React components.

**Tip**

Design for **lots of alerts** (scroll, density), not just 3 cards on screen.

---

## Day 2 — Prove the pipe (fake scores are OK)

### A — Day 2

**Tasks**

- Build **replay script skeleton**: read CSV rows one-by-one, wait ~1 second, POST to backend
- Stand up a tiny **FastAPI stub** (`/ingest` or `/predict`) that returns **dummy** JSON:

```json
{ "attack": "Port Scan", "confidence": 95.0 }
```

**Why**

Proving **events flow** matters more than accurate ML today. B and C&D can build against real traffic shape while I train later.

**Tip**

Log every request/response during dev — saves hours when something 404s on Day 9.

**Done when**

Replay → backend stub → (optional) dashboard mock receives *something*

---

### B — Day 2

**Tasks**

- Create **Neo4j Aura** free instance (don't self-host unless you love Docker pain)
- Load ATT&CK subset as graph nodes; give each technique a **`tactic`** property

**Why**

We'll filter/group by tactic in the graph view. Aura is enough for demo scale.

---

### C & D — Day 2

**Tasks**

- Dashboard shell: routing, layout, nav
- **Paste the agreed JSON** from Day 1 into mock files — build components against real schema, not imagination

**Why**

If mocks don't match the API contract, Day 10 swap to real API breaks everything.

---

## Day 3 — Baselines + alert list at scale

### A — Day 3

**Tasks**

- Build **baseline profiles** for "normal" behavior (per feature or per entity)
- Compute baselines using **only BENIGN traffic** — **hold out entire attack windows**

**Why**

If attack traffic sneaks into the baseline, anomaly scores look artificially low ("attacks look normal"). This is a subtle bug that ruins demos.

**Tip**

Document exactly which CSV rows/time ranges count as "normal only."

---

### B — Day 3

**Tasks**

- Build **embedding similarity** match: anomaly description → nearest ATT&CK technique
- Manually test **3–4 descriptions** before trusting automation

**Why**

Sentence transformers can sound confident while being wrong. Spot-check early.

---

### C & D — Day 3

**Tasks**

- Alert list / anomaly feed with **50–100 mock alerts**

**Why**

You'll find scroll, performance, and layout bugs now, not during integration.

---

## Day 4 — First real detector + graph

### A — Day 4

**Tasks**

- Finish feature extraction pipeline
- Train **Isolation Forest** — get a working version, don't over-tune yet

**Why**

Isolation Forest trains fast on tabular network features. Good first anomaly detector.

**Tip**

Come back to hyperparameters on Day 6. Move forward with "good enough."

---

### B — Day 4

**Tasks**

- Test matching on **ambiguous events** (could be two techniques)
- Decide tie-break rule: e.g. top match only if confidence gap > X

---

### C & D — Day 4

**Tasks**

- Attack-path graph with **react-force-graph** (or vis.js) using mock nodes/edges

**Why**

react-force-graph looks good quickly; raw D3 eats time we don't have.

---

## Day 5 — Ensemble + RAG corpus + explainability slot

### A — Day 5

**Tasks**

- Add **autoencoder** (or second scorer)
- Combine scores simply: **average or max** of normalized scores — no fancy weighted ensemble
- Expose **`/score`** endpoint with stable JSON

**Why**

Judges reward a working pipeline, not ML complexity we'll can't explain.

---

### B — Day 5

**Tasks**

- Build small **CVE / CERT-In corpus**: **15–20 hand-picked docs** tied to our demo attack

**Why**

20 good documents beat 500 noisy scrapes. RAG quality = retrieval quality.

---

### C & D — Day 5

**Tasks**

- Refine dashboard layout
- Add **explainability panel** placeholder (bar chart for top features later)

**Why**

Even a simple SHAP bar chart reads as "we thought about explainability."

---

## Day 6 — Thresholds + narratives + loading states

### A — Day 6

**Tasks**

- **Threshold tuning**: plot score distributions for normal vs attack; pick a separation point you can **show on a chart**
- Baseline update logic (if we simulate "learning normal" over time)

**Why**

Don't hand-pick a magic threshold that only works on one row. Judges may ask "why this number?"

---

### B — Day 6

**Tasks**

- **RAG narrative** endpoint: LLM + retrieval
- Write a **fixed prompt template** now; test on 2–3 anomaly types

**Why**

Consistent story format in the UI beats creative but random paragraphs.

---

### C & D — Day 6

**Tasks**

- Decision / response status UI
- Audit trail viewer
- **Loading and error states** (not an afterthought on Day 15)

---

## Day 7 — Test harness + human in the loop

### A — Day 7

**Tasks**

- Small **test harness**: batch of labeled rows → score → threshold → label → print accuracy / confusion-style stats

**Why**

We want a real number for the deck: "X% detection on our test scenarios."

---

### B — Day 7

**Tasks**

- **Decision engine**: confidence + simple **blast radius** (e.g. count of connected assets in graph)

**Why**

A simple metric we can explain beats a black box "risk score."

---

### C & D — Day 7

**Tasks**

- **Human review queue**: approve / reject actions — make buttons obvious

**Why**

Judges like responsible-AI / human-in-the-loop framing.

---

## Day 8 — Hardening + polish before integration week

### A — Day 8

**Tasks**

- Fix detection edge cases: malformed features, missing fields, wrong array length

---

### B — Day 8

**Tasks**

- Mock **SOAR** endpoints: isolate, block, revoke
- **Audit logging** for every automated action

---

### C & D — Day 8

**Tasks**

- Polish alert feed + graph
- Loading states everywhere

**A & B together**

- Each runs their module against a **fake version** of the other's expected input/output
- Fix contract mismatches **today**, not on Day 9

---

## Day 9 — Integration day (most important day)

**Whole team — block calendar time**

**Goal:** One real event flows end-to-end:

```
Replay → Detect → ATT&CK match → Narrative → Decision → Mock SOAR → Audit → Dashboard
```

**Rules**

- Pick the **simplest reliable attack scenario** first (not edge cases)
- Whoever finds a broken contract: **fix the contract together** — no silent patches in one person's branch
- If something fails, write it down in a shared bug list with owner

**Why this day decides win vs scramble**

Teams that integrate only on Day 14 spend the last days fixing "it doesn't connect." We get **7 days** to fix what breaks today.

---

## Day 10 — Live wiring, one hop at a time

### A & B

- Connect **ingestion → detection**, then **detection → correlation** — not all at once
- Easier to see which hop broke

### C & D

- Switch to real API behind **`USE_MOCK_API=false`** env flag
- Can flip back to mocks instantly if backend dies mid-work

---

## Day 11 — Scenario testing + real UI

### A & B

- Run **2–3 attack scenarios** from CICIDS2017 (e.g. DDoS, Port Scan, DoS)
- Run **one boring normal** session — show **low false positives**, not only detections

### C & D

- Every API response renders correctly
- **Empty state**: zero alerts — what does the dashboard show?

---

## Day 12 — Digital Twin decision + demo-only bugs

**Whole team**

- **Digital Twin:** only if core pipeline is rock solid; otherwise **cut it**
- A broken stretch feature on stage is worse than not having it

### A & B

- Fix only what can **fail visibly** in the live demo

### C & D

- Responsive pass, loading/empty states, visual polish

---

## Day 13 — Feature freeze

**Everyone:** no new features — critical bugs only.

**New ideas** → "v2 roadmap" slide (judges like forward thinking without risking the demo).

### C & D

- Deck outline with **real screenshots**
- Pull **real numbers**: detection rate, false positive count, simulated MTTD vs a simple SOC baseline you can defend

---

## Day 14 — Rehearsal + backup video

**Whole team**

- Rehearse **out loud with a timer** — twice minimum
- Know what to **cut** if we're running long (don't get stopped before the "wow" moment)
- **Record backup video** on a clean run — not tired on Day 15

---

## Day 15 — Code freeze + docs

- **No commits** except critical fixes
- **Tag a git release** / commit hash — known-good fallback
- README at repo top: setup steps + architecture diagram (judges skim repos)

### C & D

- Finalize deck speaker notes
- Edit backup video

---

## Day 16 — Submit + judge prep

**Presenting team practices answers to:**

- What's your false positive rate?
- How does this scale to real infrastructure?
- What if the LLM / matcher is wrong?

**Submit several hours before deadline** — upload failures are real.

---

## Glossary (for B, C, D)

| Term | Plain English |
|------|----------------|
| **CICIDS2017** | Public dataset of network connections with attack labels |
| **Replay script** | Feeds CSV rows slowly to fake "live" traffic |
| **Baseline** | "What normal looks like" — built from benign rows only |
| **Isolation Forest** | ML that flags unusual rows without needing attack examples |
| **Autoencoder** | Neural net that learns normal patterns; big reconstruction error = anomaly |
| **Threshold** | Score above this = alert |
| **ATT&CK** | MITRE's catalog of hacker techniques (T1234 IDs) |
| **Neo4j** | Graph database — good for techniques, assets, relationships |
| **RAG** | Retrieve documents + ask LLM to write an analyst-style summary |
| **SOAR** | Security automation (block IP, isolate host) — we **mock** this |
| **SHAP** | Which features pushed the model toward "attack" |
| **API contract** | Agreed JSON field names and types — don't change silently |

---

## What I (A) need from you

| From | By when | What |
|------|---------|------|
| **Everyone** | Day 1 EOD | Signed-off API contract in writing |
| **B** | Day 2 | URL + sample response for ingest/detection handoff |
| **C & D** | Day 2 | Mock files matching that contract |
| **Everyone** | Day 9 | Show up for integration block |
| **Everyone** | Day 12 | Honest yes/no on Digital Twin |

---

## Related docs in this repo

- [`ROLE-A-ML-PIPELINE-GUIDE.md`](./ROLE-A-ML-PIPELINE-GUIDE.md) — deeper ML/pipeline detail for my role
- [`../reports/eda/eda_summary.md`](../reports/eda/eda_summary.md) — what we learned from the data on Day 1

---

*— A, Team Lead*
