import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
INPUT = (BASE / "../../data/caesar/dbg1_ud.json").resolve()
OUTPUT = (BASE / "../../data/caesar/dbg1_constructions.json").resolve()

# Load dbg1_ud.json
ud_raw = json.loads(INPUT.read_text(encoding="utf-8"))

# -----------------------------------------------------------------------------
# Normalize UD JSON shape
# Supports:
#   A) {"meta": {...}, "chapters": {"1":[sent,...], "2":[...], ...}}
#   B) {"1":[sent,...], "2":[...], ...}
# -----------------------------------------------------------------------------
if isinstance(ud_raw, dict) and "chapters" in ud_raw and isinstance(ud_raw["chapters"], dict):
    data = ud_raw["chapters"]
else:
    data = ud_raw

# --------------------------------------------------------------------------------------
# Utility: feats parsing
# --------------------------------------------------------------------------------------

def feats_get(feats, key):
    if not feats:
        return None
    if isinstance(feats, dict):
        return feats.get(key)
    if not isinstance(feats, str):
        return None
    for part in feats.split("|"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        if k == key:
            return v
    return None



def feats_has(feats, key, value):
    return feats_get(feats, key) == value


# --------------------------------------------------------------------------------------
# Helpers for token access and spans
# --------------------------------------------------------------------------------------

def tok_text(tok):
    return (tok.get("text") or "").strip()


def tok_lemma(tok):
    return (tok.get("lemma") or "").strip()


def is_punct(tok):
    return tok.get("upos") == "PUNCT" or tok.get("deprel") == "punct"

RESULT_CORRELATIVES = {
    # common “so / such / so great” result markers
    "tam", "ita", "sic", "tantus", "talis", "tot", "adeo",

    # optional: Caesar sometimes uses these in result-ish ways
    # keep if you want broader recall
    "eo", "usque"
}

def has_result_correlative(tokens, marker_i):
    """
    Returns (True, correlative_index) if we see a correlative result marker
    in the same strong-punct segment as the ut/uti marker, before it.
    Otherwise (False, None).

    Uses your segment_bounds() and tok_text/tok_lemma helpers.
    """
    seg_start, _ = segment_bounds(tokens, marker_i)

    best = None
    for j in range(seg_start, marker_i):
        t = tok_text(tokens[j]).lower()
        lem = tok_lemma(tokens[j]).lower()
        if t in RESULT_CORRELATIVES or lem in RESULT_CORRELATIVES:
            best = j  # keep last one before ut/uti
    return (best is not None), best




# ------------------------------------------------------------------
# STRONG boundaries (Edit 1)
# ------------------------------------------------------------------
STRONG_PUNCT = {".", ";", ":", "?", "!"}


def is_strong_boundary(tok):
    # UD tends to store punctuation tokens as text=";" etc.
    if tok.get("upos") == "PUNCT":
        return tok_text(tok) in STRONG_PUNCT
    return False


def has_strong_boundary_between(tokens, a, b):
    lo, hi = (a, b) if a <= b else (b, a)
    for k in range(lo + 1, hi):
        if is_strong_boundary(tokens[k]):
            return True
    return False


def segment_bounds(tokens, i):
    """
    Returns (seg_start, seg_end) for the 'segment' containing index i,
    where segments are separated by strong punctuation (. ; : ? !).
    """
    n = len(tokens)
    left = i
    while left > 0:
        if is_strong_boundary(tokens[left - 1]):
            break
        left -= 1

    right = i
    while right < n - 1:
        if is_strong_boundary(tokens[right + 1]):
            break
        right += 1

    return left, right

# For discourse/headverb detection only: colons/semicolons may separate, but do NOT block.
SENTENCE_END_PUNCT = {".", "?", "!"}

def is_sentence_end_boundary(tok):
    if tok.get("upos") == "PUNCT":
        return tok_text(tok) in SENTENCE_END_PUNCT
    return False

def sentence_bounds(tokens, i):
    """
    Returns (start, end) for the 'sentence unit' containing i,
    where boundaries are only . ? !
    (colons/semicolons do NOT break this)
    """
    n = len(tokens)

    left = i
    while left > 0:
        if is_sentence_end_boundary(tokens[left - 1]):
            break
        left -= 1

    right = i
    while right < n - 1:
        if is_sentence_end_boundary(tokens[right + 1]):
            break
        right += 1

    return left, right



def is_nounish(tok):
    return tok.get("upos") in ("NOUN", "PROPN", "PRON")


def is_finite_verb(tok):
    feats = tok.get("feats") or ""
    if tok.get("upos") not in ("VERB", "AUX"):
        return False
    vf = feats_get(feats, "VerbForm")
    return vf in (None, "Fin")  # many trees omit VerbForm=Fin


def is_infinitive(tok):
    feats = tok.get("feats") or ""
    return feats_has(feats, "VerbForm", "Inf")


def agree_gender_number(a, b):
    fa = a.get("feats") or ""
    fb = b.get("feats") or ""
    ga = feats_get(fa, "Gender")
    gb = feats_get(fb, "Gender")
    na = feats_get(fa, "Number")
    nb = feats_get(fb, "Number")
    if ga and gb and ga != gb:
        return False
    if na and nb and na != nb:
        return False
    return True


def build_children(tokens):
    children = {i: [] for i in range(len(tokens))}
    for i, tok in enumerate(tokens):
        head = tok.get("head", 0)
        if not isinstance(head, int) or head <= 0:
            continue
        h = head - 1
        if 0 <= h < len(tokens):
            children[h].append(i)
    return children


def in_subtree(tokens, children, root_i, query_i):
    stack = [root_i]
    seen = set()
    while stack:
        cur = stack.pop()
        if cur == query_i:
            return True
        if cur in seen:
            continue
        seen.add(cur)
        for c in children.get(cur, []):
            stack.append(c)
    return False


def find_next_boundary(tokens, start_i):
    # Existing behavior: stops at ANY punctuation (comma etc.).
    # Strong-boundary control is handled by explicit checks elsewhere.
    i = start_i
    while i < len(tokens):
        t = tokens[i]
        if is_punct(t):
            return max(start_i, i - 1)
        if t.get("deprel") in ("parataxis", "root") and i != start_i:
            return i - 1
        i += 1
    return len(tokens) - 1


# --------------------------------------------------------------------------------------
# Cum Clauses
# --------------------------------------------------------------------------------------

def tag_cum_clauses(tokens):
    tags = []
    for i, tok in enumerate(tokens):
        if tok_lemma(tok).lower() != "cum":
            continue
        if tok.get("upos") not in ("SCONJ", "ADP"):
            continue
        if tok.get("deprel") not in ("mark", "case"):
            continue
        head = tok.get("head", 0)
        if not isinstance(head, int) or head <= 0:
            continue
        v_i = head - 1
        if not (0 <= v_i < len(tokens)):
            continue

        # Never cross strong boundary between marker and verb (Edit 2: hard boundary rule)
        if has_strong_boundary_between(tokens, i, v_i):
            continue

        v = tokens[v_i]
        feats = v.get("feats") or ""
        if feats_has(feats, "Mood", "Sub") and is_finite_verb(v):
            end = find_next_boundary(tokens, v_i)
            # end is already bounded by punctuation, but keep hard boundary rule explicit
            if has_strong_boundary_between(tokens, i, end):
                # clamp to same segment as the verb
                seg_start, seg_end = segment_bounds(tokens, v_i)
                end = min(end, seg_end)
            tags.append({
                "type": "cum_clause",
                "start": i,
                "end": end,
                "confidence": 0.9,
                "trigger": {"cum_index": i, "verb_index": v_i}
            })
    return tags


# --------------------------------------------------------------------------------------
# Ablative Absolutes
# --------------------------------------------------------------------------------------
def get_feat(feats, key):
    """
    feats: either UD-style string like "Case=Abl|Gender=Fem|Number=Sing"
           or a dict (some pipelines use dicts).
    Returns the value string or None.
    """
    if not feats:
        return None
    if isinstance(feats, dict):
        return feats.get(key)
    if not isinstance(feats, str):
        return None
    for part in feats.split("|"):
        if "=" in part:
            k, v = part.split("=", 1)
            if k == key:
                return v
    return None


def tag_ablative_absolutes(tokens):
    children = build_children(tokens)
    tags = []

    for i, tok in enumerate(tokens):
        feats = tok.get("feats") or ""

        # Anchor = ablative participle
        if tok.get("upos") != "VERB":
            continue
        if not feats_has(feats, "VerbForm", "Part"):
            continue
        if not feats_has(feats, "Case", "Abl"):
            continue

        part_gender = get_feat(feats, "Gender")
        part_number = get_feat(feats, "Number")

        found_n = None

        # Look for an ablative noun-ish child (your existing heuristic)
        for ci in children.get(i, []):
            c = tokens[ci]
            c_feats = c.get("feats") or ""
            if not (is_nounish(c) and feats_has(c_feats, "Case", "Abl")):
                continue

            noun_gender = get_feat(c_feats, "Gender")
            noun_number = get_feat(c_feats, "Number")

            # REQUIRE agreement (gender + number) for abl abs to fire
            # If either side is missing Gender/Number, treat as non-match (conservative).
            if not part_gender or not part_number or not noun_gender or not noun_number:
                continue
            if part_gender != noun_gender:
                continue
            if part_number != noun_number:
                continue

            found_n = ci
            break

        if found_n is None:
            continue

        # IMPORTANT CHANGE:
        # Only tag the participle + noun (do NOT extend to the rest of the clause).
        lo = min(i, found_n)
        hi = max(i, found_n)

        tags.append({
            "type": "abl_abs",
            "start": lo,
            "end": hi,
            # Optional: if your frontend supports highlight_spans (yours does),
            # this ensures ONLY the noun + participle get highlighted, even if
            # some other system later decides to expand start/end.
            "highlight_spans": [[i, i], [found_n, found_n]],
            "confidence": 0.88,
            "trigger": {"part_index": i, "abl_noun_index": found_n}
        })

    return tags



# --------------------------------------------------------------------------------------
# Indirect Statements (Acc + Inf)
# --------------------------------------------------------------------------------------

SPEECH_LEMMAS = {
    "dico", "inquam", "aio", "nego", "respondeo", "puto", "existimo", "arbitror",
    "audio", "video", "cognosco", "intellego", "scio", "comperio", "nuntio"
}

# Broader set for *discourse inference* (conditionals in indirect discourse),
# without changing the indirect-statement tagger behavior.
INDIRECT_HEAD_LEMMAS = set(SPEECH_LEMMAS) | {
    # ordering / requesting / urging
    "impero", "iubeo", "mando", "praecipio", "cogo", "hortor", "moneo",
    "oro", "rogo", "peto", "postulo", "flagito", "posco", "suadeo", "persuadeo",
    "prohibeo", "veto",
    # reporting / announcing
    "nuntio", "renuntio", "refero", "denuntio",
    # perception / inference
    "intellego", "animadverto", "cognosco", "comperio", "rescio",
}

def tag_indirect_statements(tokens):
    children = build_children(tokens)
    tags = []

    for i, tok in enumerate(tokens):
        if tok.get("upos") not in ("VERB", "AUX"):
            continue
        if tok_lemma(tok).lower() not in SPEECH_LEMMAS:
            continue

        inf_i = None
        for ci in children.get(i, []):
            c = tokens[ci]
            if c.get("upos") in ("VERB", "AUX") and is_infinitive(c):
                inf_i = ci
                break

        if inf_i is None:
            continue

        best_acc = None
        for ci in children.get(inf_i, []):
            c = tokens[ci]
            if not is_nounish(c):
                continue
            if feats_has(c.get("feats") or "", "Case", "Acc") and c.get("deprel") in ("nsubj", "obj", "nsubj:pass"):
                best_acc = ci
                break

        if best_acc is None:
            for j in range(len(tokens)):
                if in_subtree(tokens, children, inf_i, j):
                    c = tokens[j]
                    if is_nounish(c) and feats_has(c.get("feats") or "", "Case", "Acc"):
                        best_acc = j
                        break

        if best_acc is None:
            continue

        # Hard boundary rule: don't pair acc + inf across . ; : (Edit 2)
        if has_strong_boundary_between(tokens, best_acc, inf_i):
            continue

        start = min(best_acc, inf_i)
        end = find_next_boundary(tokens, max(best_acc, inf_i))

        # Also ensure span doesn't cross strong boundaries
        if has_strong_boundary_between(tokens, start, end):
            seg_start, seg_end = segment_bounds(tokens, inf_i)
            start = max(start, seg_start)
            end = min(end, seg_end)
            if start > end:
                continue

        dist = abs(best_acc - inf_i)
        conf = 0.9 if dist <= 6 else 0.85
        if tokens[best_acc].get("deprel") == "nsubj":
            conf += 0.03

        tags.append({
            "type": "indirect_statement",
            "start": start,
            "end": end,
            "highlight_spans": [[best_acc, best_acc], [inf_i, inf_i]],
            "full_span": [start, end],
            "confidence": round(conf, 2),
            "trigger": {
                "speech_verb_index": i,
                "inf_index": inf_i,
                "acc_subject_index": best_acc
            }
        })

    return tags


# -----------------------------------------------------------------------------
# NEW CONSTRUCTIONS (Phase 3: Reading Guide support)
# -----------------------------------------------------------------------------

def is_subjunctive(tok):
    return feats_has(tok.get("feats"), "Mood", "Sub")

def get_tense(tok):
    return feats_get(tok.get("feats") or "", "Tense")

def get_aspect(tok):
    return feats_get(tok.get("feats") or "", "Aspect")

def get_mood(tok):
    return feats_get(tok.get("feats") or "", "Mood")

def get_verbform(tok):
    return feats_get(tok.get("feats") or "", "VerbForm")


def predicate_signature(tokens, children, vi: int):
    """
    Returns an "effective" predicate signature for conditional classification.

    This matters for 2-word predicates like:
      - factus est / factus esset  (perfect/pluperfect passive periphrastic)
      - sint erepturi              (future active periphrastic)

    Output keys:
      mood, tense, aspect, verbForm
      compound: None or {kind, aux_index, part_index}
    """
    if vi is None or not (0 <= vi < len(tokens)):
        return {"mood": None, "tense": None, "aspect": None, "verbForm": None, "compound": None}

    tok = tokens[vi]
    mood = get_mood(tok)
    tense = get_tense(tok)
    aspect = get_aspect(tok)
    verbForm = get_verbform(tok)

    lemma = (tok.get("lemma") or "").lower()
    upos = tok.get("upos")

    # Handle SUM/ESSE periphrases, which otherwise misreport tense/aspect badly.
    if lemma in {"sum", "esse"} and upos in {"AUX", "VERB"}:
        part_i = None
        part = None

        # Prefer a participle directly attached to SUM.
        for ci in children.get(vi, []):
            c = tokens[ci]
            feats = c.get("feats") or ""
            if feats_get(feats, "VerbForm") == "Part":
                part_i = ci
                part = c
                break

        if part is not None:
            p_feats = part.get("feats") or ""
            p_voice = feats_get(p_feats, "Voice")
            p_aspect = feats_get(p_feats, "Aspect")  # Perf/Prosp/etc
            p_form = (part.get("text") or "").lower()

            # Future active periphrastic: SUM + future active participle (-urus)
            if p_voice == "Act" and (p_aspect == "Prosp" or looks_like_future_participle_form(p_form)):
                return {
                    "mood": mood,
                    "tense": "Fut",
                    "aspect": "Prosp",
                    "verbForm": verbForm,
                    "compound": {"kind": "future_active_periphrastic", "aux_index": vi, "part_index": part_i},
                }

            # Perfect / pluperfect passive periphrastic: SUM + PPP
            if p_voice == "Pass" and p_aspect == "Perf":
                # Aux tense usually encodes: Pres (perfect passive), Past (pluperfect passive)
                if tense == "Pres":
                    eff_tense = "Past"
                elif tense == "Past":
                    eff_tense = "Pqp"
                else:
                    eff_tense = tense

                return {
                    "mood": mood,
                    "tense": eff_tense,
                    "aspect": "Perf",
                    "verbForm": verbForm,
                    "compound": {"kind": "perfect_passive_periphrastic", "aux_index": vi, "part_index": part_i},
                }

    return {"mood": mood, "tense": tense, "aspect": aspect, "verbForm": verbForm, "compound": None}

def is_future_passive_participle(tok):
    feats = tok.get("feats") or ""
    if tok.get("upos") not in ("VERB", "AUX"):
        return False
    return ("VerbForm=Part" in feats) and ("Voice=Pass" in feats) and ("Aspect=Prosp" in feats)

def is_neuter_singular(tok):
    feats = tok.get("feats") or ""
    return feats_has(feats, "Gender", "Neut") and feats_has(feats, "Number", "Sing")

def agrees_case_number_gender(a, b):
    fa = a.get("feats") or ""
    fb = b.get("feats") or ""
    ca = feats_get(fa, "Case")
    cb = feats_get(fb, "Case")
    if ca and cb and ca != cb:
        return False
    return agree_gender_number(a, b)

def is_gerund(tokens, gi):
    g = tokens[gi]
    if not is_future_passive_participle(g):
        return False
    if not is_neuter_singular(g):
        return False

    head_id = g.get("head", 0)
    if isinstance(head_id, int) and head_id > 0:
        hi = head_id - 1
        if 0 <= hi < len(tokens):
            h = tokens[hi]
            if is_nounish(h) and agrees_case_number_gender(g, h):
                return False
    return True

def is_gerundive(tokens, gi):
    g = tokens[gi]
    if not is_future_passive_participle(g):
        return False
    return not is_gerund(tokens, gi)

def tag_gerunds_and_gerundives(tokens):
    tags = []
    for i in range(len(tokens)):
        if is_gerund(tokens, i):
            tags.append({
                "type": "gerund",
                "start": i,
                "end": i,
                "confidence": 0.94,
                "trigger": {"index": i, "rule": "FPP_neut_sing_substantive"}
            })
        elif is_gerundive(tokens, i):
            tags.append({
                "type": "gerundive",
                "start": i,
                "end": i,
                "confidence": 0.92,
                "trigger": {"index": i, "rule": "FPP_other"}
            })
    return tags

def tag_purpose_clauses(tokens):
    tags = []
    n = len(tokens)
    children = build_children(tokens)

    # (1) ut/ne/neve + subjunctive
    for i, tok in enumerate(tokens):
        t = tok_text(tok).lower()
        lem = tok_lemma(tok).lower()
        if t not in {"ut", "ne", "neve", "uti"} and lem not in {"ut", "ne", "neve", "uti"}:
            continue

        head_id = tok.get("head", 0)
        if not isinstance(head_id, int) or head_id <= 0:
            continue
        vi = head_id - 1
        if not (0 <= vi < n):
            continue

        # Hard boundary rule: do not cross . ; : between introducer and verb
        if has_strong_boundary_between(tokens, i, vi):
            continue

        vtok = tokens[vi]
        if not is_finite_verb(vtok) or not is_subjunctive(vtok):
            continue

        clause_type = "purpose_clause"
        subtype = "ut_ne"
        conf = 0.93

        trigger = {"marker_index": i, "verb_index": vi, "rule": "mark+subj"}

        # Result clause specialization: ut/uti + subjunctive + correlative marker
        # (ne/neve stay purpose-only)
        is_ut_like = (tok_text(tok).lower() in {"ut", "uti"} or tok_lemma(tok).lower() in {"ut", "uti"})
        if is_ut_like:
            is_result, corr_i = has_result_correlative(tokens, i)
            if is_result:
                clause_type = "result_clause"
                subtype = "ut_correlative_result"
                conf = 0.93  # keep same confidence to preserve behavior
                trigger["correlative_index"] = corr_i
                trigger["rule"] = "ut/uti+subj+correlative"

        tags.append({
            "type": clause_type,
            "subtype": subtype,
            "start": min(i, vi),
            "end": max(i, vi),
            "highlight_spans": [[i, i], [vi, vi]],
            "confidence": conf,
            "trigger": trigger
        })


    # (3) ad + gerund, (4) ad + noun + gerundive
    for i, tok in enumerate(tokens):
        if tok.get("upos") != "ADP":
            continue
        if tok_text(tok).lower() != "ad" and tok_lemma(tok).lower() != "ad":
            continue
        if tok.get("deprel") != "case":
            continue

        head_id = tok.get("head", 0)
        if not isinstance(head_id, int) or head_id <= 0:
            continue
        hi = head_id - 1
        if not (0 <= hi < n):
            continue
        head_tok = tokens[hi]

        if head_tok.get("upos") in ("VERB", "AUX") and is_gerund(tokens, hi):
            # Hard boundary rule
            if has_strong_boundary_between(tokens, i, hi):
                continue
            tags.append({
                "type": "purpose_clause",
                "subtype": "ad_gerund",
                "start": min(i, hi),
                "end": max(i, hi),
                "highlight_spans": [[i, i], [hi, hi]],
                "confidence": 0.92,
                "trigger": {"ad_index": i, "gerund_index": hi, "rule": "ad+gerund"}
            })
            continue

        if is_nounish(head_tok):
            best_g = None
            best_dist = 10**9
            for ci in children.get(hi, []):
                ct = tokens[ci]
                if not is_future_passive_participle(ct):
                    continue
                if not agrees_case_number_gender(ct, head_tok):
                    continue
                dist = abs(ci - hi)
                if dist < best_dist:
                    best_dist = dist
                    best_g = ci

            if best_g is not None:
                # Hard boundary rule
                if has_strong_boundary_between(tokens, i, best_g):
                    continue
                tags.append({
                    "type": "purpose_clause",
                    "subtype": "ad_noun_gerundive",
                    "start": min(i, best_g),
                    "end": max(i, best_g),
                    "highlight_spans": [[i, i], [best_g, best_g]],
                    "confidence": 0.90,
                    "trigger": {"ad_index": i, "noun_index": hi, "gerundive_index": best_g, "rule": "ad+noun+gerundive_agree"}
                })
    
    # (2) qui + subjunctive  -> treat as its OWN construction type
    #     (subjunctive relative clause of characteristic), NOT purpose_clause
    for i, tok in enumerate(tokens):
        feats = tok.get("feats") or ""
        if not feats_has(feats, "PronType", "Rel"):
            continue

        # Guard: only true relative pronouns/determiners, not SCONJ/ADP
        if tok.get("upos") not in ("PRON", "DET"):
            continue
        lem = tok_lemma(tok).lower()
        if lem in {"cum", "ut"}:
            continue

        vi = None
        seen = set()
        cur = i
        for _ in range(6):
            head_id = tokens[cur].get("head", 0)
            if not isinstance(head_id, int) or head_id <= 0:
                break
            nxt = head_id - 1
            if nxt in seen or not (0 <= nxt < n):
                break

            # If climbing would jump across a strong boundary, stop
            if has_strong_boundary_between(tokens, i, nxt):
                break

            seen.add(nxt)
            cur = nxt
            if tokens[cur].get("upos") in ("VERB", "AUX") and is_finite_verb(tokens[cur]):
                vi = cur
                if tokens[cur].get("deprel") == "acl:relcl":
                    break

        if vi is None:
            continue
        if not is_subjunctive(tokens[vi]):
            continue

        if has_strong_boundary_between(tokens, i, vi):
            continue

        tags.append({
            "type": "subjunctive_relative_clause",
            "subtype": "qui_subj",
            "start": min(i, vi),
            "end": max(i, vi),
            "highlight_spans": [[i, i], [vi, vi]],
            "confidence": 0.90,
            "trigger": {"rel_pron_index": i, "verb_index": vi, "rule": "rel+subj"}
        })


    return tags


def tag_relative_clauses(tokens):
    tags = []
    n = len(tokens)

    for i, tok in enumerate(tokens):
        feats = tok.get("feats") or ""
        if not feats_has(feats, "PronType", "Rel"):
            continue

        # Guard: only true relative pronouns/determiners, not SCONJ/ADP; exclude junk lemmas (Edit 2A)
        if tok.get("upos") not in ("PRON", "DET"):
            continue
        lem = tok_lemma(tok).lower()
        if lem in {"cum", "ut"}:
            continue

        vi = None
        seen = set()
        cur = i
        for _ in range(6):
            head_id = tokens[cur].get("head", 0)
            if not isinstance(head_id, int) or head_id <= 0:
                break
            nxt = head_id - 1
            if nxt in seen or not (0 <= nxt < n):
                break

            # If climbing would jump across a strong boundary, stop (Edit 2C)
            if has_strong_boundary_between(tokens, i, nxt):
                break

            seen.add(nxt)
            cur = nxt
            if tokens[cur].get("upos") in ("VERB", "AUX") and is_finite_verb(tokens[cur]):
                vi = cur
                if tokens[cur].get("deprel") == "acl:relcl":
                    break

        if vi is None:
            continue

        # Never cross strong boundary between pronoun and its verb (Edit 2B)
        if has_strong_boundary_between(tokens, i, vi):
            continue

        mood = get_mood(tokens[vi])
        subtype = "subjunctive" if mood == "Sub" else "indicative" if mood == "Ind" else None
        if subtype is None:
            continue

        tags.append({
            "type": "relative_clause",
            "subtype": subtype,
            "start": min(i, vi),
            "end": max(i, vi),
            "highlight_spans": [[i, i], [vi, vi]],
            "confidence": 0.91 if subtype == "indicative" else 0.90,
            "trigger": {"rel_pron_index": i, "verb_index": vi, "rule": "PronType=Rel+finite"}
        })

    return tags

def is_imperfect_like(tok):
    # UD for Latin here usually uses: Tense=Past + Aspect=Imp
    return get_tense(tok) == "Past" and get_aspect(tok) == "Imp"

def is_pluperfect_like(tok):
    # Best-effort: some pipelines may give Tense=Pqp; yours often collapses into Past+Perf
    t = get_tense(tok)
    a = get_aspect(tok)
    return (t == "Pqp") or (t == "Past" and a == "Perf")

def infer_infinitive_tense(tokens, children, vi):
    """
    Best-effort tense inference for infinitives in indirect discourse:
      - If feats explicitly include Tense=Pres/Past/Fut, use it.
      - If it's 'esse' with a future participle dependent (futurum / -urus), treat as Fut.
      - If it looks perfect (Aspect=Perf or -isse / fuisse), treat as Past.
      - Else default Pres.
    """
    tok = tokens[vi]
    feats = tok.get("feats") or ""

    explicit = feats_get(feats, "Tense")
    if explicit:
        return explicit

    # Future infinitive often expressed as "futurum esse" (future participle modifying esse)
    for ci in children.get(vi, []):
        c = tokens[ci]
        cfeats = c.get("feats") or ""
        if feats_has(cfeats, "VerbForm", "Part") and feats_has(cfeats, "Aspect", "Prosp"):
            # Avoid misreading gerunds/gerundives: futurus is typically Voice=Act
            voice = feats_get(cfeats, "Voice")
            if voice == "Act" or (tok_lemma(tok).lower() in {"sum", "esse"}):
                return "Fut"

    txt = tok_text(tok).lower()

    # Perfect infinitives often end in -isse, and 'fuisse' is common.
    if feats_has(feats, "Aspect", "Perf") or txt.endswith("isse") or txt in {"fuisse", "fore"}:
        if txt == "fore":
            return "Fut"
        return "Past"

    return "Pres"

def looks_like_future_participle_form(form: str) -> bool:
    f = (form or "").lower()
    return f.endswith(("urus", "ura", "urum", "uros", "uras"))

def infer_infinitive_time(tokens, children, inf_i: int):
    if inf_i is None:
        return None

    tok = tokens[inf_i]
    feats = tok.get("feats") or ""
    txt = (tok.get("text") or "").lower()
    lemma = (tok.get("lemma") or "").lower()

    tense = feats_get(feats, "Tense")
    aspect = feats_get(feats, "Aspect")

    if tense in ("Past", "Pqp") or aspect == "Perf":
        return "Past"
    if tense == "Fut" or aspect == "Prosp":
        return "Fut"
    if txt == "fore":
        return "Fut"

    # Periphrastics: participle + esse
    if lemma == "sum":
        saw_future = False
        saw_past = False
        for j in range(len(tokens)):
            if j == inf_i:
                continue
            if not in_subtree(tokens, children, inf_i, j):
                continue

            tj = tokens[j]
            featsj = tj.get("feats") or ""
            formj = (tj.get("text") or "").lower()

            if feats_get(featsj, "VerbForm") == "Part":
                if looks_like_future_participle_form(formj) or feats_get(featsj, "Aspect") == "Prosp":
                    saw_future = True
                if feats_get(featsj, "Voice") == "Pass" and feats_get(featsj, "Aspect") == "Perf":
                    saw_past = True
            if formj == "fore":
                saw_future = True

        if saw_future:
            return "Fut"
        if saw_past:
            return "Past"

    return "Pres"

def classify_conditional(tokens, children, pv_i, ap_i, discourse):
    """
    Classify a conditional based on a (protasis, apodosis) pair.

    We intentionally keep labels stable (future_more_vivid, future_less_vivid, etc.),
    but we *de-bias* away from over-producing 'mixed' by:
      - handling SUM + participle periphrases correctly (2-word predicates)
      - treating indirect discourse primarily by the protasis form when apodosis is infinitival
    """
    disc = (discourse or {}).get("discourse", "direct")

    if pv_i is None or not (0 <= pv_i < len(tokens)):
        return "unknown"

    pv_sig = predicate_signature(tokens, children, pv_i)
    pm, pt, pa = pv_sig["mood"], pv_sig["tense"], pv_sig["aspect"]

    # If we can't find an apodosis, we still want a usable label.
    if ap_i is None or not (0 <= ap_i < len(tokens)):
        if pm == "Sub" and pt == "Pres":
            return "future_less_vivid"
        if pm == "Sub" and pt == "Past" and pa == "Imp":
            return "present_contrafactual"
        if pm == "Sub" and (pt == "Pqp" or pa == "Perf"):
            return "past_contrafactual"
        if pm == "Ind" and pt == "Fut":
            return "future_more_vivid"
        if pm == "Ind" and pt == "Pres":
            return "present_simple"
        if pm == "Ind" and pt == "Past":
            return "past_simple"
        return "mixed"

    av = tokens[ap_i]

    # ---------- Apodosis = infinitive (very common in indirect discourse) ----------
    if is_infinitive(av):
        inf_time = infer_infinitive_time(tokens, children, ap_i)

        # In indirect discourse, treat the protasis as the anchor, and only use infinitive time as a tie-breaker.
        if disc.startswith("indirect"):
            if pm == "Sub" and pt == "Pres":
                return "future_less_vivid"
            if pm == "Sub" and pt == "Past" and pa == "Imp":
                return "present_contrafactual"
            if pm == "Sub" and (pt == "Pqp" or pa == "Perf"):
                return "past_contrafactual"
            if pm == "Ind" and pt == "Fut" and inf_time == "Fut":
                return "future_more_vivid"
            if pm == "Ind" and pt == "Pres" and inf_time == "Pres":
                return "present_simple"
            if pm == "Ind" and pt == "Past" and inf_time in ("Past", "Pres"):
                return "past_simple"
            # Fallback: don't over-call mixed just because apodosis is infinitival
            return "future_less_vivid" if pm == "Sub" else "mixed"

        # Direct discourse + infinitive apodosis is rare; still avoid spamming 'mixed'.
        if pm == "Sub" and pt == "Pres":
            return "future_less_vivid"
        if pm == "Sub" and pt == "Past" and pa == "Imp":
            return "present_contrafactual"
        if pm == "Sub" and (pt == "Pqp" or pa == "Perf"):
            return "past_contrafactual"
        return "mixed"

    # ---------- Apodosis = finite (or periphrastic via predicate_signature) ----------
    av_sig = predicate_signature(tokens, children, ap_i)
    am, at, aa = av_sig["mood"], av_sig["tense"], av_sig["aspect"]

    # Normalize a bit for imperfect subjunctives (UD encodes these as Tense=Past, Aspect=Imp)
    prot_is_imperfect_subj = (pm == "Sub" and pt == "Past" and pa == "Imp")
    apod_is_imperfect_subj = (am == "Sub" and at == "Past" and aa == "Imp")

    prot_is_pluperfect_like = (pm == "Sub" and (pt == "Pqp" or pa == "Perf"))
    apod_is_pluperfect_like = (am == "Sub" and (at == "Pqp" or aa == "Perf"))

    if disc == "direct":
        # Indicative conditions
        if pm == "Ind" and am == "Ind":
            if pt == "Fut" and at == "Fut":
                return "future_more_vivid"
            if pt == "Pres" and at == "Pres":
                return "present_simple"
            if pt == "Past" and at == "Past":
                return "past_simple"
            return "mixed_indicative"

        # Subjunctive conditions
        if pm == "Sub" and am == "Sub":
            if pt == "Pres" and at == "Pres":
                return "future_less_vivid"
            if prot_is_imperfect_subj and apod_is_imperfect_subj:
                return "present_contrafactual"
            if prot_is_pluperfect_like and apod_is_pluperfect_like:
                return "past_contrafactual"
            return "mixed_subjunctive"

        return "mixed"

    # Indirect discourse: prefer to label by the conditional form rather than calling everything mixed.
    if pm == "Sub":
        if pt == "Pres" and at == "Pres" and am == "Sub":
            return "future_less_vivid"
        if prot_is_imperfect_subj:
            return "present_contrafactual"
        if prot_is_pluperfect_like:
            return "past_contrafactual"
        # last resort
        return "mixed_subjunctive"

    if pm == "Ind":
        if pt == "Fut" and at == "Fut" and am == "Ind":
            return "future_more_vivid"
        if pt == "Pres" and at == "Pres" and am == "Ind":
            return "present_simple"
        if pt == "Past" and at == "Past" and am == "Ind":
            return "past_simple"
        return "mixed"

    return "mixed"


def infer_sequence_from_tense(tense: str):
    # your workflow: primary if head verb present/future, otherwise secondary
    if tense in ("Pres", "Fut"):
        return "primary"
    if tense in ("Past", "Pqp"):
        return "secondary"
    return None

def infer_sequence_from_protasis(tok):
    # fallback when we can't find a head verb: use protasis tense as a proxy
    t = get_tense(tok)
    if t == "Pres":
        return "primary"
    if t in ("Past", "Pqp"):
        return "secondary"
    return None


def tag_conditionals(tokens):
    tags = []
    n = len(tokens)
    children = build_children(tokens)
    def is_relative_like_verb(j):
        tj = tokens[j]
        dep = (tj.get("deprel") or "")
        if "relcl" in dep:
            return True

        # Use the precomputed children map (fast + correct)
        for c in children.get(j, []):
            ct = tokens[c]
            if ct.get("upos") in ("PRON", "DET") and feats_has(ct.get("feats") or "", "PronType", "Rel"):
                return True

        return False

    def comma_clause_bounds(center_i, seg_start, seg_end, include_trailing_comma=True):
        """
        Clause bounds around center_i, using COMMAS as the hard cutoff.
        A clause cannot span across a comma, but it MAY include a comma at the end.
        Strong punctuation (. ; : ? !) is handled by segment_bounds().
        """
        left = seg_start
        for k in range(center_i - 1, seg_start - 1, -1):
            if tokens[k].get("upos") == "PUNCT" and tok_text(tokens[k]) == ",":
                left = k + 1
                break

        right = seg_end
        for k in range(center_i + 1, seg_end + 1):
            if tokens[k].get("upos") == "PUNCT" and tok_text(tokens[k]) == ",":
                right = k if include_trailing_comma else (k - 1)
                break

        left = max(seg_start, left)
        right = min(seg_end, right)
        if left > right:
            left, right = center_i, center_i
        return left, right


    def ancestors_local(idx, max_hops=30):
        out = []
        cur = idx
        for _ in range(max_hops):
            head_id = tokens[cur].get("head", 0)
            if not isinstance(head_id, int) or head_id <= 0:
                break
            cur = head_id - 1
            if not (0 <= cur < n):
                break
            out.append(cur)
        return out

    # --------------------------------------------
    # Helper: discourse inference (direct vs indirect + primary/secondary sequence)
    # --------------------------------------------
    def infer_discourse(pv_i, ap_i, seg_start, seg_end):
        """
        Returns:
          statement: 'direct' | 'indirect'
          sequence:  'primary' | 'secondary' | None
          head_verb_index: int | None
          head_verb_tense: str | None
          discourse: 'direct' | 'indirect_primary' | 'indirect_secondary' | 'indirect'
          reason: debug string

        IMPORTANT:
          - Headverb search is allowed across ':' and ';'
          - Headverb search is *blocked only* by '.', '?', '!' (see sentence_bounds()).
        """

        def mk(statement, sequence=None, head_i=None, reason=""):
            if statement == "direct":
                discourse = "direct"
            else:
                discourse = f"indirect_{sequence}" if sequence else "indirect"
            return {
                "statement": statement,
                "sequence": sequence,
                "head_verb_index": head_i,
                "head_verb_tense": (get_tense(tokens[head_i]) if head_i is not None else None),
                "discourse": discourse,
                "reason": reason,
            }

        def infer_sequence_from_head(i):
            ht = get_tense(tokens[i])
            if ht in ("Pres", "Fut"):
                return "primary"
            if ht in ("Past", "Pqp"):
                return "secondary"
            return None

        # (1) Strong signal: a headverb (say/think/order/etc.) in the dependency ancestors
        for base_i in [pv_i, ap_i]:
            if base_i is None:
                continue
            for anc in ancestors_local(base_i, max_hops=30):
                ta = tokens[anc]
                if tok_lemma(ta).lower() in INDIRECT_HEAD_LEMMAS and is_finite_verb(ta):
                    return mk("indirect", infer_sequence_from_head(anc), anc, "headverb_ancestor")

        # (2) Sentence-unit fallback: headverb anywhere in the same sentence unit (.?! delimits)
        anchor = pv_i if pv_i is not None else ap_i
        sb_start, sb_end = sentence_bounds(tokens, anchor)

        head_candidates = []
        for j in range(sb_start, sb_end + 1):
            tj = tokens[j]
            if tok_lemma(tj).lower() in INDIRECT_HEAD_LEMMAS and is_finite_verb(tj):
                head_candidates.append(j)

        if head_candidates:
            head_i = min(head_candidates, key=lambda j: abs(j - anchor))
            return mk("indirect", infer_sequence_from_head(head_i), head_i, "headverb_sentence_unit")

        # (3) Heuristic: infinitive apodosis with no other finite predicate in the SAME strong segment
        if ap_i is not None and is_infinitive(tokens[ap_i]):
            finite_in_seg = [j for j in range(seg_start, seg_end + 1) if is_finite_verb(tokens[j])]
            if len(finite_in_seg) == 0 or (len(finite_in_seg) == 1 and finite_in_seg[0] == pv_i):
                # fallback sequence from protasis tense
                pt = get_tense(tokens[pv_i])
                seq = "primary" if pt == "Pres" else "secondary" if pt in ("Past", "Pqp") else None
                return mk("indirect", seq, None, "heuristic_infinitive_main")

        return mk("direct", None, None, "default_direct")

    # --------------------------------------------
    # Helper: apodosis selection
    # --------------------------------------------
    def pick_apodosis(tokens, pv_i, protasis_nodes, *, blocked_nodes=None, prefer_after_i=None, forbidden=None):
        """
        Apodosis selection (within SAME strong-punct segment as pv_i):

        Goal: choose the closest predicate by proximity (NOT "finite beats infinitive").
        Still prefers being AFTER the end of the last protasis in the segment if possible.
        """
        seg_start, seg_end = segment_bounds(tokens, pv_i)
        blocked_nodes = blocked_nodes or set()
        forbidden = forbidden or set()
        prefer_after_i = pv_i if prefer_after_i is None else prefer_after_i

        def is_candidate(tok):
            if tok.get("upos") not in ("VERB", "AUX"):
                return False
            return is_finite_verb(tok) or is_infinitive(tok)

        def score(j):
            tj = tokens[j]
            s = 0

            if j >= prefer_after_i:
                s += 6
                s -= (j - prefer_after_i)
            else:
                s -= 2
                s -= (prefer_after_i - j)

            if tj.get("deprel") == "root":
                s += 8
            if tj.get("upos") == "VERB":
                s += 2
            if tok_lemma(tj).lower() in INDIRECT_HEAD_LEMMAS and is_finite_verb(tj):
                s -= 8

            # Make relative clauses a last-resort apodosis choice
            if is_relative_like_verb(j):
                s -= 50

            return s

        after, before = [], []

        for j in range(seg_start, seg_end + 1):
            if j in protasis_nodes or j in blocked_nodes or j in forbidden:
                continue
            if not is_candidate(tokens[j]):
                continue

            item = (score(j), j)
            if j >= prefer_after_i:
                after.append(item)
            else:
                before.append(item)

        if after:
            after.sort(reverse=True)
            return after[0][1]
        if before:
            before.sort(reverse=True)
            return before[0][1]

        return None



    # --------------------------------------------
    # Pass 1: collect all protases (so we can support multi-protasis -> single-apodosis)
    # --------------------------------------------
    protases = []
    seg_key_to_info = {}  # (seg_start, seg_end) -> {blocked_nodes, last_protasis_end}


    for i, tok in enumerate(tokens):
        if tok_text(tok).lower() != "si" and tok_lemma(tok).lower() != "si":
            continue
        if tok.get("deprel") != "mark":
            continue

        head_id = tok.get("head", 0)
        if not isinstance(head_id, int) or head_id <= 0:
            continue
        pv_i = head_id - 1
        if not (0 <= pv_i < n):
            continue

        # Do not cross strong punctuation between 'si' and its protasis verb
        if has_strong_boundary_between(tokens, i, pv_i):
            continue

        pv = tokens[pv_i]
        if pv.get("upos") not in ("VERB", "AUX"):
            continue

        seg_start, seg_end = segment_bounds(tokens, pv_i)

        # Comma-bounded surface span for the protasis
        prot_left, prot_right = comma_clause_bounds(
            pv_i,
            seg_start,
            seg_end,
            include_trailing_comma=True
        )

        # Ensure 'si' is included even if displaced
        prot_left = min(prot_left, i)

        # Protasis nodes are the TEXT span, not the dependency subtree
        protasis_nodes = set(range(prot_left, prot_right + 1))


        protases.append({
            "si_index": i,
            "pv_i": pv_i,
            "seg_start": seg_start,
            "seg_end": seg_end,
            "protasis_nodes": protasis_nodes,
        })

        key = (seg_start, seg_end)
        info = seg_key_to_info.setdefault(key, {"blocked_nodes": set(), "last_protasis_end": -1})
        info["blocked_nodes"] |= protasis_nodes
        info["last_protasis_end"] = max(info["last_protasis_end"], prot_right)

    # --------------------------------------------
    # Pass 2: for each protasis, pick apodosis + infer discourse + classify
    # --------------------------------------------
    for item in protases:
        i = item["si_index"]
        pv_i = item["pv_i"]
        seg_start, seg_end = item["seg_start"], item["seg_end"]
        protasis_nodes = item["protasis_nodes"]

        key = (seg_start, seg_end)
        seg_info = seg_key_to_info.get(key, {"blocked_nodes": set(), "last_protasis_end": pv_i})
        blocked_nodes = (seg_info["blocked_nodes"] - protasis_nodes)
        prefer_after_i = max(pv_i, seg_info.get("last_protasis_end", pv_i))

        # First apodosis pick (avoid using other protases as apodoses)
        ap_i = pick_apodosis(tokens, pv_i, protasis_nodes, blocked_nodes=blocked_nodes, prefer_after_i=prefer_after_i)

        # Infer discourse with the tentative apodosis
        disc = infer_discourse(pv_i, ap_i, seg_start, seg_end)

        # Rule: the inferred head verb of indirect discourse should NOT serve as apodosis.
        forbidden = set()
        if disc.get("head_verb_index") is not None:
            forbidden.add(disc["head_verb_index"])
        if forbidden and ap_i in forbidden:
            alt = pick_apodosis(tokens, pv_i, protasis_nodes, blocked_nodes=blocked_nodes, prefer_after_i=prefer_after_i, forbidden=forbidden)
            if alt is not None:
                ap_i = alt
                disc = infer_discourse(pv_i, ap_i, seg_start, seg_end)

        label = classify_conditional(tokens, children, pv_i, ap_i, disc)

        # Build meta using effective predicate signatures (handles 2-word predicates)
        pv_sig = predicate_signature(tokens, children, pv_i)
        av_sig = predicate_signature(tokens, children, ap_i) if ap_i is not None else None

        av = tokens[ap_i] if ap_i is not None else None
        apodosis_form = None
        apodosis_inf_tense = None
        if av is not None:
            if is_infinitive(av):
                apodosis_form = "infinitive"
                apodosis_inf_tense = infer_infinitive_time(tokens, children, ap_i)
            elif is_finite_verb(av):
                apodosis_form = "finite"

        meta = {
            "label": label,
            "discourse": disc.get("discourse"),
            "sequence": disc.get("sequence"),
            "statement": disc.get("statement"),
            "head_verb_index": disc.get("head_verb_index"),
            "head_verb_tense": disc.get("head_verb_tense"),
            "protasis": {
                "verb_index": pv_i,
                "mood": pv_sig["mood"],
                "tense": pv_sig["tense"],
                "aspect": pv_sig["aspect"],
                "verbForm": pv_sig["verbForm"],
                "compound": pv_sig.get("compound"),
            },
            "apodosis": {
                "verb_index": ap_i,
                "mood": (av_sig["mood"] if av_sig else None),
                "tense": (av_sig["tense"] if av_sig else None),
                "aspect": (av_sig["aspect"] if av_sig else None),
                "verbForm": (av_sig["verbForm"] if av_sig else None),
                "compound": (av_sig.get("compound") if av_sig else None),
                "form": apodosis_form,
                "inf_time": apodosis_inf_tense,
            }
        }

        prot_span_nodes = set(protasis_nodes)
        prot_span_nodes.add(i)      # include "si" index
        prot_span_nodes.add(pv_i)   # include verb index for safety

        prot_start = min(prot_span_nodes)
        prot_end = max(prot_span_nodes)

        # hard clamp to segment bounds
        prot_start = max(seg_start, prot_start)
        prot_end = min(seg_end, prot_end)

        tags.append({
            "type": "conditional_protasis",
            "subtype": meta.get("label") or "unknown",
            "start": prot_start,
            "end": prot_end,
            "highlight_spans": [[prot_start, prot_end]],
            "confidence": 0.83,
            "conditional": meta,
            "trigger": {
                "si_index": i,
                "protasis_verb_index": pv_i,
                "apodosis_verb_index": ap_i,
                "rule": "si+head"
            }

        })

        if ap_i is not None:
            ap_start, ap_end = comma_clause_bounds(ap_i, seg_start, seg_end, include_trailing_comma=True)


            if ap_end - ap_start < 1:
                clamp_left, clamp_right = comma_clause_bounds(
                    ap_i,
                    seg_start,
                    seg_end,
                    include_trailing_comma=True
                )
                ap_nodes = set()
                for j in range(clamp_left, clamp_right + 1):
                    if in_subtree(tokens, children, ap_i, j):
                        ap_nodes.add(j)
                if ap_nodes:
                    ap_start = min(ap_nodes)
                    ap_end = max(ap_nodes)
                    ap_start = max(clamp_left, ap_start)
                    ap_end = min(clamp_right, ap_end)


            
            tags.append({
                "type": "conditional_apodosis",
                "subtype": meta.get("label") or "unknown",
                "start": ap_start,
                "end": ap_end,
                "highlight_spans": [[ap_start, ap_end]],
                "confidence": 0.80,
                "conditional": meta,
                "trigger": {
                    "si_index": i,
                    "protasis_verb_index": pv_i,
                    "apodosis_verb_index": ap_i,
                    "rule": "main-clause-bound-by-commas"
                }

            })

    return tags


def tag_gerund_gerundive_flip(tokens):
    tags = []
    children = build_children(tokens)

    # gerund with object dependent (flip candidate)
    for i in range(len(tokens)):
        if not is_gerund(tokens, i):
            continue
        obj_children = [ci for ci in children.get(i, []) if tokens[ci].get("deprel") == "obj"]
        if not obj_children:
            continue

        best_obj = min(obj_children, key=lambda ci: abs(ci - i))

        span_start = min(i, best_obj)
        span_end = max(i, best_obj)

        tags.append({
            "type": "gerund_gerundive_flip",
            "subtype": "gerund_form_with_object",
            "start": span_start,
            "end": span_end,
            "highlight_spans": [[i, i], [best_obj, best_obj]],
            "confidence": 0.86,
            "trigger": {"gerund_index": i, "obj_index": best_obj, "rule": "gerund+obj"}
        })




    # ad + noun + gerundive (flip environment)
    for i, tok in enumerate(tokens):
        if tok.get("upos") != "ADP" or tok.get("deprel") != "case":
            continue
        if tok_text(tok).lower() != "ad" and tok_lemma(tok).lower() != "ad":
            continue

        head_id = tok.get("head", 0)
        if not isinstance(head_id, int) or head_id <= 0:
            continue
        hi = head_id - 1
        if not (0 <= hi < len(tokens)):
            continue
        head_tok = tokens[hi]

        # Case 1: UD attaches 'ad' to NOUN (old behavior)
        if is_nounish(head_tok):
            noun_i = hi

            best_g = None
            best_dist = 10**9
            for ci in children.get(noun_i, []):
                if not is_gerundive(tokens, ci):
                    continue
                ct = tokens[ci]
                if not agrees_case_number_gender(ct, head_tok):
                    continue
                dist = abs(ci - noun_i)
                if dist < best_dist:
                    best_dist = dist
                    best_g = ci

            if best_g is None:
                continue

            if has_strong_boundary_between(tokens, i, best_g):
                continue

            span_start = min(i, noun_i, best_g)
            span_end = max(i, noun_i, best_g)

            tags.append({
                "type": "gerund_gerundive_flip",
                "subtype": "gerundive_form_ad_phrase",
                "start": span_start,
                "end": span_end,
                "highlight_spans": [[i, i], [noun_i, noun_i], [best_g, best_g]],
                "confidence": 0.84,
                "trigger": {"ad_index": i, "noun_index": noun_i, "gerundive_index": best_g, "rule": "ad+noun+gerundive"}
            })

        # Case 2: UD attaches 'ad' to GERUNDIVE (your Caesar examples)
        elif is_gerundive(tokens, hi):
            ger_i = hi

            # Find a noun/pronoun that the gerundive agrees with among its children
            best_n = None
            best_dist = 10**9
            for ci in children.get(ger_i, []):
                ct = tokens[ci]
                if not is_nounish(ct):
                    continue
                if not agrees_case_number_gender(tokens[ger_i], ct):
                    continue
                dist = abs(ci - ger_i)
                if dist < best_dist:
                    best_dist = dist
                    best_n = ci

            # If none, optionally be looser: still tag ad+gerundive as an ad-phrase environment
            if best_n is None:
                if has_strong_boundary_between(tokens, i, ger_i):
                    continue

                span_start = min(i, ger_i)
                span_end = max(i, ger_i)

                tags.append({
                    "type": "gerund_gerundive_flip",
                    "subtype": "gerundive_form_ad_phrase_no_noun",
                    "start": span_start,
                    "end": span_end,
                    "highlight_spans": [[i, i], [ger_i, ger_i]],
                    "confidence": 0.72,
                    "trigger": {"ad_index": i, "gerundive_index": ger_i, "rule": "ad+gerundive(no_noun)"}
                })
                continue

            noun_i = best_n

            if has_strong_boundary_between(tokens, i, ger_i):
                continue

            span_start = min(i, noun_i, ger_i)
            span_end = max(i, noun_i, ger_i)

            tags.append({
                "type": "gerund_gerundive_flip",
                "subtype": "gerundive_form_ad_phrase",
                "start": span_start,
                "end": span_end,
                "highlight_spans": [[i, i], [noun_i, noun_i], [ger_i, ger_i]],
                "confidence": 0.86,
                "trigger": {"ad_index": i, "noun_index": noun_i, "gerundive_index": ger_i, "rule": "ad->gerundive + agreeing_noun"}
            })

        else:
            continue



    return tags


# -----------------------------------------------------------------------------
# Edit 4: de-duplicate tags (prevents accidental overlaps/duplicates from head-walks)
# -----------------------------------------------------------------------------
def dedup_tags(tag_list):
    seen = set()
    out_list = []
    for t in tag_list:
        key = (
            t.get("type"),
            t.get("subtype"),
            tuple(tuple(x) for x in (t.get("highlight_spans") or [])),
            tuple(sorted((t.get("trigger") or {}).items()))
        )
        if key in seen:
            continue
        seen.add(key)
        out_list.append(t)
    return out_list


# -----------------------------------------------------------------------------
# Run tagging
# -----------------------------------------------------------------------------

out = {
    "meta": {
        "source": str(INPUT),
        "tags": [
            "cum_clause",
            "abl_abs",
            "indirect_statement",
            "purpose_clause",
            "result_clause",
            "relative_clause",
            "gerund",
            "gerundive",
            "gerund_gerundive_flip",
            "conditional_protasis",
            "conditional_apodosis",
            "subjunctive_relative_clause",

        ]
    },
    "by_sentence": {}
}

total_tags = 0
for chapter, sentences in data.items():
    if not isinstance(sentences, list):
        continue

    for sent in sentences:
        if not isinstance(sent, dict):
            continue
        sid = sent.get("sid")
        toks = sent.get("tokens") or []

        tags = []
        tags.extend(tag_cum_clauses(toks))
        tags.extend(tag_ablative_absolutes(toks))
        tags.extend(tag_indirect_statements(toks))
        tags.extend(tag_purpose_clauses(toks))
        tags.extend(tag_relative_clauses(toks))
        tags.extend(tag_gerunds_and_gerundives(toks))
        tags.extend(tag_gerund_gerundive_flip(toks))
        tags.extend(tag_conditionals(toks))

        tags = dedup_tags(tags)

        if tags:
            out["by_sentence"][sid] = tags
            total_tags += len(tags)

print(f"Tagged {total_tags} constructions across all sentences.")
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote: {OUTPUT}")
