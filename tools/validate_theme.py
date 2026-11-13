#!/usr/bin/env python3
"""
Checks that Shopify enforces at SYNC time but Theme Check does not.

A green Theme Check has twice let a broken commit through on this theme:
  1. a range setting with more than 101 steps  -> section rejected
  2. a block type the parent section does not permit -> whole group rejected
Both failed silently: the file simply did not land on the theme. These are
the checks that would have caught them, plus the obvious structural ones.

Run: python3 tools/validate_theme.py
Exit 0 = safe to push.
"""
import json
import os
import re
import sys
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems = []
notes = []

# Tags Shopify permits in a `richtext` setting value.
RICHTEXT_OK = {"p", "br", "strong", "em", "b", "i", "a", "ul", "ol", "li"}


def rel(p):
    return os.path.relpath(p, ROOT)


def strip_comment(raw):
    m = re.match(r"^\s*/\*.*?\*/\s*", raw, flags=re.S)
    return raw[len(m.group(0)):] if m else raw


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.loads(strip_comment(fh.read()), object_pairs_hook=OrderedDict)


def section_schemas():
    """type -> parsed schema, for every section file."""
    out = {}
    d = os.path.join(ROOT, "sections")
    for name in sorted(os.listdir(d)):
        if not name.endswith(".liquid"):
            continue
        stype = name[:-7]
        raw = open(os.path.join(d, name), encoding="utf-8").read()
        m = re.search(r"\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}", raw, re.S)
        if not m:
            out[stype] = None
            continue
        try:
            out[stype] = json.loads(m.group(1))
        except json.JSONDecodeError as e:
            problems.append(f"sections/{name}: schema is not valid JSON — {e}")
            out[stype] = None
    return out


def walk_settings(settings, where):
    """Range-step limit: (max-min)/step + 1 must be <= 101.

    Plus: an empty-string "default". Theme Check passes it; the GitHub sync
    rejects the whole file with "setting with id=... default can't be blank".
    Omit the key instead — Shopify treats an absent default as empty anyway.
    """
    for st in settings or []:
        # A select/radio may legitimately offer "" as an option value; a free-text
        # setting may not declare "" as its default.
        if (st.get("type") in ("text", "textarea", "inline_richtext", "richtext", "html", "liquid", "url")
                and st.get("default") == ""):
            problems.append(
                f"{where}: setting '{st.get('id')}' has an empty \"default\": \"\" "
                f"— the GitHub sync rejects the whole file; drop the default key"
            )
        if st.get("type") != "range":
            continue
        step = st.get("step", 1)   # Shopify defaults step to 1 when omitted
        try:
            steps = (st["max"] - st["min"]) / step + 1
        except (KeyError, ZeroDivisionError, TypeError):
            problems.append(f"{where}: range '{st.get('id')}' has bad min/max/step")
            continue
        if steps > 101:
            problems.append(
                f"{where}: range '{st['id']}' has {steps:.0f} steps "
                f"(min {st['min']} max {st['max']} step {step}); Shopify's limit is 101 "
                f"— this silently rejects the whole section"
            )


def check_schemas(schemas):
    for stype, sch in schemas.items():
        if not sch:
            continue
        walk_settings(sch.get("settings"), f"sections/{stype}.liquid")
        for b in sch.get("blocks", []):
            walk_settings(b.get("settings"), f"sections/{stype}.liquid block '{b.get('type')}'")


def permitted_blocks(sch):
    """Block types the section's own schema allows, or None if it takes any."""
    if sch is None:
        return None
    blocks = sch.get("blocks")
    if blocks is None:
        return set()
    types = set()
    for b in blocks:
        t = b.get("type")
        if t == "@theme" or t == "@app":
            return None            # accepts theme/app blocks: don't police
        if t:
            types.add(t)
    return types


def check_usage(schemas):
    """Every section referenced by a template/group must exist, and every
    block used must be permitted by that section's schema."""
    targets = []
    for d in ("templates", "sections"):
        base = os.path.join(ROOT, d)
        for dirpath, _, names in os.walk(base):
            for n in names:
                if n.endswith(".json"):
                    targets.append(os.path.join(dirpath, n))

    for path in sorted(targets):
        try:
            data = load_json(path)
        except json.JSONDecodeError as e:
            problems.append(f"{rel(path)}: invalid JSON — {e}")
            continue
        secs = data.get("sections")
        if not isinstance(secs, dict):
            continue
        for key, sec in secs.items():
            stype = sec.get("type")
            if stype not in schemas:
                problems.append(f"{rel(path)}: section '{key}' uses type '{stype}' "
                                f"but sections/{stype}.liquid does not exist")
                continue
            sch = schemas[stype]
            allowed = permitted_blocks(sch)
            if allowed is None:
                continue
            for bkey, blk in (sec.get("blocks") or {}).items():
                btype = blk.get("type")
                if blk.get("static"):
                    continue
                if btype not in allowed:
                    problems.append(
                        f"{rel(path)}: block '{bkey}' is type '{btype}', which section "
                        f"'{stype}' does not permit (allowed: {sorted(allowed) or 'none'}) "
                        f"— Shopify rejects the entire file"
                    )
            # block_order must match the blocks that exist
            order = sec.get("block_order")
            if order is not None:
                have = set((sec.get("blocks") or {}).keys())
                for k in order:
                    if k not in have:
                        problems.append(f"{rel(path)}: block_order names '{k}' "
                                        f"but section '{key}' has no such block")


def check_richtext(schemas):
    """richtext settings only accept a small tag set; anything else is stripped."""
    rich_ids = {}
    for stype, sch in schemas.items():
        if not sch:
            continue
        ids = set()
        for st in sch.get("settings", []) or []:
            if st.get("type") == "richtext":
                ids.add(st.get("id"))
        for b in sch.get("blocks", []) or []:
            for st in b.get("settings", []) or []:
                if st.get("type") == "richtext":
                    ids.add(st.get("id"))
        rich_ids[stype] = ids

    for d in ("templates", "sections"):
        base = os.path.join(ROOT, d)
        for dirpath, _, names in os.walk(base):
            for n in sorted(names):
                if not n.endswith(".json"):
                    continue
                path = os.path.join(dirpath, n)
                try:
                    data = load_json(path)
                except json.JSONDecodeError:
                    continue
                for key, sec in (data.get("sections") or {}).items():
                    ids = rich_ids.get(sec.get("type"), set())
                    if not ids:
                        continue
                    for sid, val in (sec.get("settings") or {}).items():
                        if sid in ids and isinstance(val, str) and "<" in val:
                            for t in set(re.findall(r"</?([a-zA-Z][a-zA-Z0-9]*)", val)):
                                if t.lower() not in RICHTEXT_OK:
                                    problems.append(
                                        f"{rel(path)}: section '{key}' setting '{sid}' is a "
                                        f"richtext field containing <{t}>, which Shopify strips "
                                        f"(allowed: {sorted(RICHTEXT_OK)})")


def check_assets():
    """Asset filenames referenced from section settings must exist."""
    assets = set(os.listdir(os.path.join(ROOT, "assets")))
    for d in ("templates", "sections"):
        base = os.path.join(ROOT, d)
        for dirpath, _, names in os.walk(base):
            for n in sorted(names):
                if not n.endswith(".json"):
                    continue
                path = os.path.join(dirpath, n)
                try:
                    data = load_json(path)
                except json.JSONDecodeError:
                    continue
                blob = json.dumps(data)
                for fn in re.findall(r'"([A-Za-z0-9_\-]+\.(?:webp|png|jpg|jpeg|avif|svg|css|js))"', blob):
                    if fn not in assets:
                        problems.append(f"{rel(path)}: references asset '{fn}' which is not in assets/")


def check_hero_derivatives():
    """Every width named in the hero's width lists must exist as avif+webp."""
    try:
        idx = load_json(os.path.join(ROOT, "templates", "index.json"))
    except Exception:
        return
    hero = None
    for sec in (idx.get("sections") or {}).values():
        if sec.get("type") == "sos-hero":
            hero = sec["settings"]
    if not hero:
        return
    assets = set(os.listdir(os.path.join(ROOT, "assets")))
    for stem_key, widths_key in (("desktop_stem", "desktop_widths"), ("mobile_stem", "mobile_widths")):
        stem = hero.get(stem_key)
        if not stem:
            continue
        widths = [w.strip() for w in str(hero.get(widths_key, "")).split(",") if w.strip()]
        for w in widths:
            for ext in ("avif", "webp"):
                fn = f"{stem}-{w}.{ext}"
                if fn not in assets:
                    problems.append(f"hero {stem_key}: '{fn}' is listed in {widths_key} but missing from assets/")
        if widths:
            fn = f"{stem}-{widths[-1]}.jpg"
            if fn not in assets:
                problems.append(f"hero {stem_key}: JPEG fallback '{fn}' missing from assets/")


def check_product_handles():
    """Showcase blocks must name a handle that the import CSV actually creates."""
    csv_path = os.path.join(ROOT, "data", "sultan-products.csv")
    if not os.path.exists(csv_path):
        notes.append("data/sultan-products.csv not found; skipped handle cross-check")
        return
    import csv as _csv
    with open(csv_path, encoding="utf-8") as fh:
        handles = {r["Handle"] for r in _csv.DictReader(fh)}
    for name in ("index.json", "collection.json"):
        path = os.path.join(ROOT, "templates", name)
        if not os.path.exists(path):
            continue
        data = load_json(path)
        for key, sec in (data.get("sections") or {}).items():
            if sec.get("type") != "sos-collection":
                continue
            for bkey, blk in (sec.get("blocks") or {}).items():
                h = (blk.get("settings") or {}).get("product_handle")
                if not h:
                    problems.append(f"templates/{name}: block '{bkey}' has no product_handle "
                                    f"— its card can never become a real product card")
                elif h not in handles:
                    problems.append(f"templates/{name}: block '{bkey}' names handle '{h}' "
                                    f"which the import CSV does not create")


def check_settings_data_types():
    """config/settings_data.json: Savor declares several settings as strings.

    A bare number where the schema wants a string makes the sync reject the
    whole file, which strands every theme-editor setting with it.
    """
    data_path = os.path.join(ROOT, "config", "settings_data.json")
    schema_path = os.path.join(ROOT, "config", "settings_schema.json")
    if not (os.path.exists(data_path) and os.path.exists(schema_path)):
        return
    data = load_json(data_path)
    schema = load_json(schema_path)
    wants_string = set()
    for group in schema or []:
        for st in group.get("settings", []) or []:
            if st.get("type") in ("text", "textarea", "select", "radio", "url"):
                if st.get("id"):
                    wants_string.add(st["id"])
    for scope, values in (("current", data.get("current")),):
        if not isinstance(values, dict):
            continue
        for key, val in values.items():
            if key in wants_string and isinstance(val, (int, float)) and not isinstance(val, bool):
                problems.append(
                    f"config/settings_data.json: '{key}' is the number {val} but the "
                    f"schema declares it a string — quote it, or the sync drops the file"
                )


def main():
    schemas = section_schemas()
    check_schemas(schemas)
    check_usage(schemas)
    check_richtext(schemas)
    check_assets()
    check_hero_derivatives()
    check_product_handles()
    check_settings_data_types()

    for n in notes:
        print(f"note: {n}")
    if problems:
        print(f"\nFAIL — {len(problems)} problem(s) Shopify would reject or silently drop:\n")
        for p in problems:
            print(f"  * {p}")
        return 1
    print("\nPASS — schemas, block permissions, richtext, assets, hero derivatives "
          "and product handles all consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
