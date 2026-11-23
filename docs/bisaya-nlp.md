# Bisaya feedback analysis

## Scope and inputs

The supplied files are currently under [src/public/data/nlp](../src/public/data/nlp/), rather than a root `data/nlp` folder. All three were inspected:

- [bisaya_feedback_seed.csv](../src/public/data/nlp/bisaya_feedback_seed.csv): 121 **synthetic development** rows. These informed the implementation and are regression examples, not an unbiased accuracy benchmark.
- [bisaya_lexicon_semantic_reference.json](../src/public/data/nlp/bisaya_lexicon_semantic_reference.json): candidate vocabulary and semantic examples. Its schema differs from the application lexicon; useful entries were selectively merged, preserving existing terms and weights.
- [cydo_real_feedback_labeling_template.csv](../src/public/data/nlp/cydo_real_feedback_labeling_template.csv): currently a header only. **No manually labeled real participant rows were available.** No real-world accuracy or calibrated thresholds can be claimed.

No database migration, model training, service, paid API, or dependency was added for these changes. Existing numeric evaluation ratings remain separate from text sentiment. The earlier post-report migration is unrelated to this NLP change.

## Runtime behavior

[feedbackAnalyzer.ts](../src/features/evaluations/feedbackAnalyzer.ts) still runs rules before multilingual E5 when reports load. Its original fields remain: `label`, `score`, `matchedTerms`, and `themes`. `neutral` is an additional label; the existing internal `no-signal` key now displays as **Uncertain**. Neutral and Uncertain remain distinct in metrics. `isSuggestion?: boolean` remains independent of sentiment. Optional `context` metadata adds multiple intents, request type, relevance, actionability and exact original-text evidence spans. Legacy comments without context still render. The original participant text is preserved in reports.

[feedbackLexicon.json](../src/features/evaluations/feedbackLexicon.json) retains weighted `positive`/`negative` entries, `themes`, negators, intensifiers, diminishers, spelling variants, negation exceptions and window. Added configuration fields describe contrast markers, suggestion markers, feedback context and ambiguous topic cues. There is one rules engine, not a second vocabulary-specific analyzer.

Normalization handles case, accents, repeated letters, token boundaries, `kayo → kaayo`, `jud/dyud → gyud`, and `wala'y → walay`. Longest matching phrases occupy tokens and normalized aliases are deduplicated, preventing repeated polarity contributions. Negation scope ends at clause boundaries; existing exceptions and the three-token window remain. Examples:

| Comment | Rule sentiment | Topic/aspect result |
| --- | --- | --- |
| Nindot kaayo ang programa. | Positive | No forced topic |
| Dili nindot ang programa. | Negative | No forced topic |
| Walay klaro ang discussion. | Negative | content: Negative |
| Dili bati ang programa. | Positive | No forced topic |
| Nindot ang venue pero init kaayo. | Mixed | venue: Mixed |
| Lami ang snacks pero kulang. | Mixed | food: Mixed |
| Unta dugangan pa ang oras sa workshop. | Uncertain; suggestion=true | schedule; actionable request |
| I want more pogi participants. | Neutral; suggestion=false | participants; personal preference, Low relevance, Not directly actionable |

### Context, intents and explanations

The existing lexicon now includes participant subjects and a small `context` section for English, Tagalog, Cebuano and mixed-language request/preference markers, appearance descriptors, observation wording and polite suffixes. These identify scope and intent rather than adding attractiveness to program-quality sentiment vocabulary. A request is not automatically a program suggestion. `I want more food` identifies a practical food request without asserting dissatisfaction. `I want more pogi participants` is an appearance preference without a program-quality judgment. Explicit program preferences such as `I prefer an afternoon schedule` can be Neutral and actionable. Requests without a reliable program subject remain uncertain and require review.

Appearance preference detection requires related human-subject and appearance wording in the same request/preference clause, no unsupported trailing meaning, and no nearby negated appearance wording. Clear praise, complaints and mixed aspect results elsewhere survive. Unknown meaning is not promoted to Neutral. A participant mentioned only as the recipient of food is not automatically a separate topic. Participants are a sixth rule-detected topic; the existing five E5 topic reference sets are unchanged pending real-data validation.

Explanations cite exact spans for context evidence and identify normalized language cues separately. Semantic results are reference similarities, not word detection or calibrated probabilities. Low-relevance personal preferences do not create program-improvement follow-ups or appearance-based selection recommendations. Intent/relevance/actionability reliability still needs independent human review, including implicit requests, negation, sarcasm and longer mixed-subject comments.

The synthetic seed's earlier `Needs review` label for the pogi-participants example was deliberately revised to Neutral/participants to reflect the new requested interpretation. It remains synthetic development data. The exact participant wording without a trailing period is covered separately in regression tests; it is not a real-world accuracy benchmark.

Both asserted positive and negative evidence preserve Mixed. Existing weak ambiguous-word weighting still applies, including the old `kapoy pero lingaw gyud` regression. An unnamed contrast/reason clause may inherit exactly one preceding topic. It cannot inherit across a sentence or a list of multiple topics. Within a clause, sentiment attaches to the closest topic within the existing five-token distance; topic aliases do not multiply sentiment scores.

Wish/request clauses do not automatically assert current positive or negative conditions. A separate assertion still contributes, for example `Unta dugangan ang snacks kay kulang` is a suggestion **and** Negative. Praise before an unpunctuated `unta` is retained. Rule detection is conservative and marker-based; it does not understand every implied or rhetorical request.

## Full evaluation context

Comment NLP and overall evaluation interpretation are separate. [evaluationAnalysis.ts](../src/features/evaluations/evaluationAnalysis.ts) summarizes the saved overall rating and existing `responses` JSON fields (`fb_valuable`, `fb_improve`, `fb_learning`, `fb_attend_again`, `fb_participation`, `fb_time_mgmt`, `q1`–`q4`, `overall_star`). It accepts the existing comment analysis as an input, never changes it, and does not embed survey answers or calculate a replacement satisfaction score. Stored rating is authoritative; `overall_star` is used only when a valid stored rating is absent. Scores 1–2 are described as low, 3 as Neutral, and 4–5 as high on the existing five-point scale. These ordinal descriptions are separate from text sentiment.

Selecting Time management for improvement alongside an Excellent/Good scheduling assessment prompts review of time allocation; it does not declare the response contradictory or invalid. Probably not is a separate future-participation concern and is never attributed to an unrelated personal preference. Self-reported engagement remains distinct from QR attendance. Missing answers are shown as not recorded and never invented. Mismatched stored/form overall ratings are flagged without modifying either.

Both **Evaluations → View full response** and each Insights comment's **Full evaluation context** expose the two analyses. Reports fetch the existing `responses` field along with evaluation text; no schema migration is needed. The full-response dialog reuses the hybrid comment analyzer when opened, with rules available immediately and normal fallback if the model fails. Overall interpretation is deterministic and available independently of model loading. A q4 answer of 3 now displays as Neutral recommendation; a historical false recommendation flag with no q4 answer is described as no affirmative recommendation recorded, since the boolean alone cannot distinguish Neutral from Disagree. Aggregate ratings, recommendation percentages and attendance totals remain unchanged.

## Semantic configuration and safeguards

The model remains `Xenova/multilingual-e5-small`, pinned revision `0b7ea4d6ad2e9d527e013a65b805a4b4df72f648`, `q8`. Comments **and** references use `query: `, batch size 16, mean pooling, L2 normalization (`normalize: true`), cosine similarity averaged over each reference group. This follows the [official multilingual E5 symmetric-similarity guidance](https://huggingface.co/intfloat/multilingual-e5-small#faq) and [Transformers.js feature-extraction configuration](https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.FeatureExtractionPipeline).

[feedbackSemanticReferences.json](../src/features/evaluations/feedbackSemanticReferences.json) contains full sentences for each of the five topics, with positive, negative, mixed and neutral suggestions, including code-switching. References are examples for similarity; model weights are not trained or fine-tuned. Existing generic sentiment references remain alongside the new examples.

Pipeline and production reference-vector promises remain cached in memory, with failed loads reset for retry; existing Transformers.js model caching is retained. Production does not add persistent raw-comment or embedding storage. Invalid vectors fall back to a fresh complete rules-only result. Regression tests inject deterministic vectors; these verify routing, prefixes, pooling, normalization and preservation of rule output, **not pretrained model accuracy**.

Clear rule sentiment cannot be overwritten by embeddings. Requests without evaluative evidence remain uncertain; explicit, supported preferences may be Neutral. Appearance-only preferences bypass semantic reassignment. Comments with no feedback context, topic or matched sentiment remain unclassified. Semantic topics must meet the existing absolute threshold **and** beat neutral/off-topic reference similarity. Added semantic topics retain uncertain aspect sentiment rather than borrowing the entire comment's polarity. Rules and existing topic sentiment remain available when loading fails.

The existing defaults are still **sentiment margin 0.035**, **topic similarity 0.82**. They are similarity cutoffs, not calibrated probabilities. Expanded references can change score distributions, so these defaults still require real-data validation. The optional analyzer options support test/evaluation injection without changing existing callers.

## Development verification

```sh
npm run test:nlp
npm run test:feedback
npm run eval:nlp
npm run eval:feedback
npm run build
npm run lint
```

The new evaluator prints sentiment confusion matrices, precision/recall/F1/support per class, multi-label metrics for all six topics, exact topic-set agreement and separate suggestion metrics. Unlabeled legacy topics/suggestions are excluded. Zero-support metrics are shown as zero with an explicit warning. Synthetic results must always be described as development/regression agreement.

## Real feedback evaluation and threshold calibration

1. Copy the labeling template to a **private location outside public assets and Git**. Export only authorized, de-identified comment text; avoid names, contact details, reference codes or account IDs. Use anonymous row IDs. The script never needs Supabase credentials or participant identity.
2. Have Cebuano-speaking reviewers label each comment independently of predictions: Positive, Negative, Neutral, Mixed or Uncertain (legacy Needs review is also accepted); all applicable topics separated with `;`; suggestion `true`/`false`. Empty topic means no reliable category, not missing annotation. Resolve reviewer disagreements, and document the sampling period/language mix privately. Remove identifying details before evaluation.
3. Split real comments into **calibration** and **held-out** CSVs before changing references/rules. Keep duplicate/paraphrased comments and related activity/participant groups in the same split where possible. Do not copy synthetic examples into either file. Do not inspect the held-out set while adjusting vocabulary or cutoffs. For multilingual conclusions, include sufficient real examples of each language and label combination.
4. Evaluate defaults without tuning:

```sh
npm run eval:nlp -- --real "C:/private/real-heldout.csv" --mode rules
npm run eval:nlp -- --real "C:/private/real-heldout.csv" --mode hybrid
```

5. Use a **fresh** held-out set if prior results informed changes. Run exploratory calibration:

```sh
npm run eval:nlp -- --calibration "C:/private/real-calibration.csv" --heldout "C:/private/real-heldout.csv" --mode hybrid
```

Optional `--margins 0.02,0.035,0.05 --topics 0.8,0.82,0.85` specifies an exploratory candidate grid. These candidates are comparisons, not recommendations or assumed optima. Selection maximizes the equally weighted mean of sentiment macro-F1 and topic macro-F1 on **calibration only**; ties retain candidate order (defaults first in the default grid). The held-out set is scored only after selection. The script never changes production cutoffs automatically.

Both sets must be nonempty and contain every sentiment plus positive/negative examples for every topic to select candidates. Coverage is a necessary safeguard, **not evidence of sufficient statistical power**; small, unrepresentative sets yield unstable metrics. Review supports, confusion patterns, reviewer agreement and false-positive costs. Collect more independent samples and uncertainty estimates before generalizing or adopting cutoffs. Do not repeatedly tune against the same held-out results.

The evaluator rejects identical paths, normalized exact overlap between calibration and held-out comments, and overlap with the supplied synthetic development data. This does not detect all paraphrases or group leakage; reviewers must check those. Empty real data produces no accuracy or calibration result and does not load a model. Hybrid evaluation fails explicitly if model loading fails rather than reporting fallback rules as hybrid accuracy. Model weights may download on the first genuine hybrid run. Only aggregate metrics are printed; comments, row identifiers and review notes are not logged.

## Adding Bisaya examples later

Add terms to the existing lexicon arrays with conservative weights and complete phrases when a word is context-dependent. Use `spellingVariants` for equivalent spellings, and avoid generic topic cues that force irrelevant comments into a category. Add a positive, negative, mixed and neutral suggestion sentence to the relevant semantic topic group; add sentiment references to the appropriate sentiment group. Keep suggestions separate from polarity. Add regression examples and run `test:nlp`, `eval:nlp` and the build.

Do not add real held-out comments to references or regression data until that test set has been retired and replaced. Sarcasm, implicit topic references, long-distance negation, dialect variation, unclear request wording and ambiguous multi-topic clauses still need human review. Synthetic success does not settle these limitations.
