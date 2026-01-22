export const GRAMMAR_LESSONS = {
  ablative_absolute: {
    id: "ablative_absolute",
    title: "Ablative Absolute",
    summary: "A phrase of a noun and participle in the ablative, grammatically independent, giving background information about time, cause, or concession.",
    content: `<section>
<h2>Overview</h2>
<p>An ablative absolute is a phrase of a noun (or pronoun) and a verb participle both in the ablative, grammatically independent from the rest of the sentence. It gives background information about time, cause, or concession.</p>
<p><strong>Tip:</strong> if you can remove the phrase and the sentence still works, there's a good chance you're looking at an ablative absolute.</p>
</section>

<section>
<h2>Literal Translation</h2>
<p><strong>[ablative noun/pronoun] + [perfect passive ablative participle]</strong> → "with [noun] having been [verbed]"</p>
<ul>
<li>Ex.: <em>verbīs dictīs</em> → "with the words having been said"</li>
<li>Note: deponent perfect participles would render a translation of, "with [noun] having [verbed]"</li>
</ul>

<p><strong>[ablative noun/pronoun] + [present active ablative participle]</strong> → "with [noun] [verbing]"</p>
<ul>
<li>Ex.: <em>homine audiente</em> → "with the man listening"</li>
</ul>
</section>

<section>
<h2>Textual Functions</h2>
<p>The ablative absolute usually expresses one of three relationships, which the reader must decide from context, as these meanings appear the exact same in Latin form.</p>
<ol>
<li><strong>Temporal.</strong> Answers "when?", and can begin with words such as when, while, and after.<br/>Ex.: <em>verbīs dictīs</em> → "after the words were heard"</li>
<li><strong>Causal.</strong> Answers: why? because of what?<br/>Ex.: <em>hoste victō</em> → "because the enemy was defeated"</li>
<li><strong>Concessive.</strong> Answers: despite what? although what?<br/>Ex.: <em>Caesare invītō</em> → "although Caesar was unwilling"</li>
</ol>
</section>`,
    constructionTypes: ["abl_abs"],
    enableReverseSearch: true,
  },

  cum_clauses: {
    id: "cum_clauses",
    title: "Cum Clauses",
    summary: "Subordinate clauses introduced by cum (\"when / since / although\") that give background circumstances for the main action.",
    content: `<section>
<h2>Overview</h2>
<p>A cum clause is a subordinate clause introduced by cum ("when / since / although"). In Caesar, cum clauses usually give background circumstances for the main action.</p>
</section>

<section>
<h2>Literal Translation and Textual Function</h2>
<p><strong>cum + verb</strong> → "when / since / although … verb"</p>
<p>Form depends on the verb and the context, and in Caesar, cum clauses most often signal one of four relationships:</p>

<p><strong>cum + indicative verb</strong> → 1 use: <strong>Temporal.</strong> Straightforward, answers, "when?" Often best translated as when or after.</p>
<ul>
<li>Ex.: <em>cum haec verba audīvit</em> → "when/after he had heard these words"</li>
</ul>

<p><strong>cum + subjunctive</strong> → 3 uses:</p>
<ol>
<li><strong>Circumstantial:</strong> Gives background conditions rather than a precise time. Often translated as when or while.<br/>Ex.: <em>cum haec verba audīvisset</em> → "when/while he had heard these words"</li>
<li><strong>Causal:</strong> answers, "why?" Often translated as since or because.<br/>Ex.: <em>cum haec verba audīvisset</em> → "since/because he had heard these words"</li>
<li><strong>Concessive:</strong> answers, "despite what?" Often translated as although.<br/>Ex.: <em>cum haec verba audīvisset</em> → "although he had heard these words"</li>
</ol>
</section>`,
    constructionTypes: ["cum_clause"],
    enableReverseSearch: true,
  },

  indirect_statement: {
    id: "indirect_statement",
    title: "Indirect Statement (Accusative + Infinitive)",
    summary: "Reports what someone says, thinks, knows, or perceives using an accusative subject and an infinitive.",
    content: `<section>
<h2>Overview</h2>
<p>An indirect statement reports what someone says, thinks, knows, or perceives. In Latin, indirect statement is formed with an accusative subject and an infinitive, not with a word like "that."</p>
</section>

<section>
<h2>Literal Translation and Textual Function</h2>
<p><strong>[accusative subject] + [infinitive]</strong> → "that [subject] [verb] …"</p>
<p>The tense of the infinitive shows time relative to the main verb, not absolute time. The first example for each infinitive is in primary sequence (head verb is present/future/future perfect), and the second example is in secondary sequence (head verb is imperfect/perfect/pluperfect).</p>

<p><strong>Present Infinitive</strong> → same time as main verb</p>
<p>Ex.: <em>Caesarem mīlitēs mittere</em></p>
<ul>
<li>→ "(he says) that Caesar is sending soldiers"</li>
<li>→ "(he said) that Caesar was sending soldiers"</li>
</ul>

<p><strong>Perfect Infinitive</strong> → earlier than main verb</p>
<p>Ex.: <em>Caesarem mīlitēs mīsisse</em></p>
<ul>
<li>→ "(he says) that Caesar has sent soldiers"</li>
<li>→ "(he said) that Caesar had sent soldiers"</li>
</ul>

<p><strong>Future Infinitive</strong> → later than main verb</p>
<p>Ex.: <em>Caesarem mīlitēs missūrum esse</em></p>
<ul>
<li>→ "(he says) that Caesar will send soldiers"</li>
<li>→ "(he said) that Caesar would send soldiers"</li>
</ul>

<p>In Caesar, indirect statement is a primary way he reports intentions, information, and justification without interrupting narrative flow.</p>
</section>`,
    constructionTypes: ["indirect_statement"],
    enableReverseSearch: true,
  },

  purpose_clauses: {
    id: "purpose_clauses",
    title: "Purpose Clauses",
    summary: "Purpose clauses explain intended outcomes (why), result clauses explain actual outcomes (what happened). Both use ut + subjunctive.",
    content: `<section>
<h2>Overview</h2>
<p>Purpose and result clauses take similar forms, but they answer different questions.</p>
<ul>
<li>Purpose clauses explain an intended outcome: why something was done.</li>
<li>Result clauses explain an actual outcome: what ended up happening.</li>
</ul>
<p><strong>Tip:</strong> purpose looks forward (intention), result looks backward (consequence).</p>
</section>

<section>
<h2>Purpose Clauses:</h2>
<p><strong>ut / nē + subjunctive</strong> → "in order to / so that (not) …". Negation: nē</p>
<p>They often follow verbs of: motion (mittit, venit), effort (cōnātur, studet), or planning (parat, cōnstituit).</p>
<p>Ex.:<br/><em>lēgātōs mittit ut pācem petant</em> → "he sends envoys to seek peace"</p>

<p>Other types of purposes clauses, which do not look like result clauses, include:</p>
<ol>
<li><strong>Relative clause of purpose:</strong> quī + subjunctive → "who should [verb]…". Note that not all uses of quī + subjunctive are purpose.</li>
<li><strong>ad + gerund</strong> → "for [verb]ing".</li>
<li><strong>ad + noun + gerundive</strong> → "to [verb] [noun]"</li>
</ol>
</section>

<section>
<h2>Result Clauses:</h2>
<p><strong>ut / ut nōn / ut nē + subjunctive</strong> → "with the result that …". Negation: ut nōn or ut nē</p>
<p>They are signaled by a modifier in the main clause, such as tālis, tantus, tam, ita, or sīc.</p>
<p>Ex.:<br/><em>tanta fuit multitūdō ut flūmen explērēt</em> → "the crowd was so great that it filled the river"</p>
</section>

<section>
<h2>How to Tell Them Apart While Reading</h2>
<p>Ask: Why was this done? → Purpose. What happened because of this? → Result</p>
<p>Check: is an intensifier present? (tam / tantus / ita) → probably result. Is nē alone as negation? → purpose.</p>
</section>`,
    constructionTypes: ["purpose_clause", "result_clause"],
    enableReverseSearch: true,
  },

  gerunds_gerundives: {
    id: "gerunds_gerundives",
    title: "Gerunds and Gerundives",
    summary: "Gerunds are verbal nouns; gerundives are verbal adjectives. Both express purpose and compress action efficiently.",
    content: `<section>
<h2>Overview</h2>
<p>A gerund and a gerundive are closely related verb forms used to express purpose or activity. In Caesar, these constructions often demonstrate purpose and allow him to compress action efficiently.</p>
<ul>
<li>A gerund is a verbal noun ("[verb]ing").</li>
<li>A gerundive, or a future passive participle, is a verbal adjective ("needing to be verbed") that agrees with a noun.</li>
</ul>
</section>

<section>
<h2>Formation:</h2>
<p><strong>Gerund:</strong> verb stem + -nd- + singular neuter endings. (gen. -ndī, dat. -ndō, acc. -ndum, abl. -ndō)</p>
<p><strong>Gerundive:</strong> verb stem + -nd- + 1st/2nd declension adjective endings (-ndus, -nda, -ndum).</p>
</section>

<section>
<h2>Literal Translation and Textual Function</h2>

<p><u>Gerund:</u> Used like a noun; often expresses purpose. Gerunds literally translate as "verbing," and often are used in the following ways:</p>
<ul>
<li><strong>Genitive (often with causā):</strong> <em>bellī īnferendī causā</em> → "for the sake of waging war"</li>
<li><strong>Accusative (with ad):</strong> <em>ad haec audiendum</em> → "for hearing these things"</li>
<li><strong>Ablative:</strong> <em>in petendā pāce</em> → "in seeking peace"</li>
</ul>

<p><u>Gerundive:</u> A future passive participle that agrees with a noun in case, number, and gender. Literal translations ("needing to be verbed") are usually awkward, but readers can often identify and use the gerund-gerundive flip or the passive periphrastic.</p>

<p><u>Gerund-Gerundive Flip:</u> When a gerund would take a direct object, Latin often replaces it with a gerundive agreeing with that object.</p>
<p>How to flip:</p>
<ul>
<li>Identify the gerundive (-nd- adjective)</li>
<li>Turn it into a gerund ("softening")</li>
<li>Make the noun it modifies the object of that gerund</li>
</ul>
<p>Ex.: <em>ad animōs effēminandōs</em> → "for courage needing to be softened" → "for softening courage"</p>

<p><u>Passive Periphrastic (Gerundive + sum):</u> When a gerundive is combined with sum, it expresses obligation or necessity. Translate with must / had to / ought to.</p>
<p>Ex.: <em>faciendum est</em> → "it must be done." <em>sibi iter faciendum esse</em> → "that a journey must be made by him." As seen in the second example, the agent takes the dative case.</p>
</section>`,
    constructionTypes: ["gerund", "gerundive", "gerund_gerundive_flip", "passive_periphrastic"],
    enableReverseSearch: true,
  },

  relative_clauses: {
    id: "relative_clauses",
    title: "Relative Clauses",
    summary: "Introduced by qui, quae, quod to describe an antecedent. Subjunctive marks characteristic or purpose uses.",
    content: `<section>
<h2>Overview</h2>
<p>A relative clause is introduced by forms of quī, quae, quod ("who/which/that") and describes an antecedent (a noun or pronoun). Most relative clauses in Caesar are straightforward description, but the subjunctive shows up for two important reading uses: characteristic and purpose.</p>
</section>

<section>
<h2>Literal Translation and Textual Function</h2>
<p>Gender + number of the pronoun come from the antecedent. Case comes from the pronoun's job inside its own clause (subject, direct object, object of a preposition, etc.).</p>

<p><u>Indicative Relative Clauses (most common)</u></p>
<p><strong>quī/quae/quod + indicative</strong> → "who/which/that …" (describing a definite person/thing)</p>
<p>Ex.: <em>virōs quī ā nāvibus veniēbant</em> → "the men who were coming from the ships"</p>

<p><u>Subjunctive Relative Clauses (two important uses)</u></p>
<ol>
<li><strong>Relative Clause of Characteristic:</strong> quī/quae/quod + subjunctive when the antecedent is general / indefinite / negative / interrogative: "the kind of person who would…". Translate with "would", or add "the sort of."<br/>Ex.: <em>nēmō est quī hostem petere possit</em> → "there is no one who can / would be able to attack the enemy"</li>
<li><strong>Relative Clause of Purpose:</strong> A purpose clause where ut/nē is replaced by a relative word. quī/quae/quod (or relative adverb) + subjunctive → "to / in order to …" or "who was [verbed] to …".<br/>Ex.: <em>mīlitēs vēnērunt quī urbem peterent</em> → "the soldiers came to attack the city" (lit. "the soldiers, who were to attack the city, came")</li>
</ol>

<p><strong>Tip:</strong> if it feels like "the ___ who would do X," it's characteristic; if it feels like "the ___ sent/chosen to do X," it's purpose.</p>
</section>`,
    constructionTypes: ["relative_clause", "relative_clause_characteristic", "relative_clause_purpose"],
    enableReverseSearch: true,
  },

  conditionals: {
    id: "conditionals",
    title: "Conditionals",
    summary: "Protasis (if-clause) + apodosis (then-clause). Classified by mood and tense: factual, non-factual, and mixed.",
    content: `<section>
<h2>Overview</h2>
<p>A conditional has two parts:</p>
<ul>
<li><strong>Protasis</strong> = the "if" clause (sī / nisi / sin)</li>
<li><strong>Apodosis</strong> = the "then" clause (the result)</li>
</ul>
<p>You classify conditionals by the mood + tense of the main verb in each half.</p>

<p>Two frequent confusions:</p>
<ol>
<li>In indirect discourse, the apodosis becomes an infinitive (as part of indirect statement: tē errāre / errāvisse / errātūrum esse…).</li>
<li>In indirect discourse, the protasis is usually treated as subordinate, so it tends to show up in the subjunctive, and sequence affects its tense.</li>
</ol>

<p>Indirect statement in sequences:</p>
<ul>
<li>Primary sequence reporting verbs: present/future (e.g. dīcō = "I say").</li>
<li>Secondary sequence reporting verbs: perfect/imperfect/pluperfect (e.g. dīxī = "I said")</li>
</ul>

<p>Your reading job is: bracket the sī-clause, find the main verb(s) in each half, then match the pattern.</p>

<p>Quick notes:</p>
<ul>
<li>Negation in conditionals is nōn, not nē.</li>
<li>nisi = "unless / if not"; sin = "but if."</li>
<li>Order can flip: apodosis can come first.</li>
</ul>
</section>

<section>
<h2>I. Factual Conditions</h2>

<h3>1) Simple Present</h3>
<p><strong>Direct form:</strong> sī + pres. indicative, pres. indicative.<br/>Example: <em>sī crēdis, errās</em> → If you believe, you are wrong.</p>
<p><strong>Indirect (primary):</strong> sī + pres. subjunctive, acc. + present infinitive.<br/>Example: <em>dīcō sī haec crēdās, tē errāre</em> → I say that, if you believe this, you are wrong.</p>
<p><strong>Indirect (secondary):</strong> sī + impf. subjunctive, acc. + present infinitive.<br/>Example: <em>dīxī sī haec crēderēs, tē errāre</em> → I said that, if you believed this, you were wrong.</p>

<h3>2) Future More Vivid</h3>
<p><strong>Direct form:</strong> sī + fut. (or fut. perf.) indicative, fut. indicative.<br/>Example: <em>sī crēdēs, errābis</em> → If you believe, you will be wrong.</p>
<p><strong>Indirect (primary):</strong> sī + pres. subjunctive, acc. + future infinitive.<br/>Example: <em>dīcō sī haec crēdās, tē errātūrum esse</em> → I say that, if you believe this, you will be wrong.</p>
<p><strong>Indirect (secondary):</strong> sī + impf. subjunctive, acc. + future infinitive.<br/>Example: <em>dīxī sī haec crēderēs, tē errātūrum esse</em> → I said that, if you believed this, you would be wrong.</p>

<h3>3) Simple Past</h3>
<p>Direct Latin can use imperfect (ongoing past) or perfect (completed past).</p>
<p><strong>Direct forms:</strong> sī + impf./perf. indicative, impf./perf. indicative.<br/>Example: <em>sī crēdēbās / crēdidistī, errābās / errāvistī</em> → If you were believing (/believed), you were wrong.</p>
<p><strong>Indirect (primary):</strong> sī + perf. subjunctive, acc. + perfect infinitive.<br/>Example: <em>dīcō sī haec crēdiderīs, tē errāvisse.</em> I say that, if you believed this, you were wrong.</p>
<p><strong>Indirect (secondary):</strong> sī + plup. subjunctive, acc. + perfect infinitive.<br/>Example: <em>dīxī sī haec crēdidissēs, tē errāvisse</em> → I said that, if you had believed this, you had been wrong.</p>
</section>

<section>
<h2>II. Non-Factual Conditions</h2>

<h3>4) Future Less Vivid (hypothetical future)</h3>
<p><strong>Direct form:</strong> sī + pres. subjunctive, pres. subjunctive.<br/>Example: <em>sī crēdās, errēs</em> → If you should believe, you would be wrong.</p>
<p><strong>Indirect (primary):</strong> sī + pres. subjunctive, acc. + future infinitive.<br/>Example: <em>dīcō sī haec crēdās, tē errātūrum esse</em> → I say that, if you should believe this, you would be wrong.</p>
<p><strong>Indirect (secondary):</strong> sī + impf. subjunctive, acc. + future infinitive.<br/>Example: <em>dīxī sī haec crēderēs, tē errātūrum esse</em> → I said that, if you were to believe this, you would be wrong.</p>

<h3>5) Present Contrary-to-Fact</h3>
<p><strong>Direct form:</strong> sī + impf. subjunctive, impf. subjunctive.<br/>Example: <em>sī crēderēs, errārēs</em> → If you were believing, you would be wrong.</p>
<p><strong>Indirect (primary or secondary):</strong> protasis stays impf. subjunctive, acc. + future infinitive.<br/>Example: <em>dīcō / dīxī sī haec crēderēs, tē errātūrum esse.</em> I say/said that, if you were believing this, you would be wrong.</p>
<p><em>Note: in indirect discourse, future less vivid and present contrary-to-fact can look extremely similar, so you often decide the label after you translate and read the context.</em></p>

<h3>6) Past Contrary-to-Fact (unreal past)</h3>
<p><strong>Direct form:</strong> sī + plup. subjunctive, plup. subjunctive.<br/>Example: <em>sī crēdidissēs, errāvissēs</em> → If you had believed, you would have been wrong.</p>
<p><strong>Indirect (primary or secondary):</strong> protasis stays plup. subjunctive, acc. + future perfect infinitive.<br/>Example: <em>dīcō / dīxī sī haec crēdidissēs, tē errātūrum fuisse.</em> I say/said that, if you had believed this, you would have been wrong.</p>
</section>

<section>
<h2>III. Mixed Conditions</h2>
<p>If the verb patterns don't fit a clean template, call it mixed and translate each half as best you can based on the examples.</p>
</section>`,
    constructionTypes: ["conditional_protasis", "conditional_apodosis"],
    enableReverseSearch: true,
  },
};

export const GRAMMAR_LESSONS_LIST = Object.values(GRAMMAR_LESSONS);
