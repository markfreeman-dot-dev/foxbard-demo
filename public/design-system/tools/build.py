"""Foxbard build: tokens/tokens.json (source) -> tokens/tokens.css, tokens/tokens.flat.json and the token section of DESIGN.md.

Checks contrast for every theme and fails (exit 1) when a pair misses its floor.
Usage: python3 tools/build.py   (run from design-systems/foxbard/ or anywhere)
"""
import json
import os
import re
import sys

B = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(f"{B}/tokens/tokens.json"))
THEMES = ["dark", "white", "paper"]


def get(path):
    n = T
    for p in path.split("."):
        n = n[p]
    return n


def val(v):
    if isinstance(v, str) and v.startswith("{"):
        return val(get(v[1:-1])["$value"])
    return v


def css(v, t):
    if t == "fontFamily":
        return ", ".join(f'"{x}"' if " " in x or x[0].isupper() else x for x in v)
    return str(v)


def flat(node, path, out):
    if isinstance(node, dict) and "$value" in node:
        out.append((path, val(node["$value"]), node.get("$type")))
        return
    if isinstance(node, dict):
        for k, v in node.items():
            if not k.startswith("$"):
                flat(v, path + [k], out)


# ---- CSS ----
shared = []
for key in ["font", "space", "radius", "border"]:
    flat(T[key], [key], shared)
palette = []
flat(T["color"]["palette"], ["color"], palette)
theme_vars = {}
for th in THEMES:
    rows = []
    flat(T["color"]["theme"][th], [], rows)
    theme_vars[th] = rows

var = lambda p: "--fb-" + "-".join(p)
lines = ["/* GENERATED from tokens/tokens.json by tools/build.py. Do not edit. */",
         "/* Dark is the default theme. Set data-theme=\"white\" or data-theme=\"paper\" on any ancestor to switch. */",
         ":root, [data-theme=\"dark\"] {"]
lines += [f"  {var(p)}: {css(v, t)};" for p, v, t in shared + palette]
lines += [f"  {var(p)}: {v};" for p, v, t in theme_vars["dark"]]
lines += ["  --fb-mode: dark;", "  color-scheme: dark;", "}"]
for th in ["white", "paper"]:
    lines += [f"[data-theme=\"{th}\"] {{"]
    lines += [f"  {var(p)}: {v};" for p, v, t in theme_vars[th]]
    lines += ["  --fb-mode: light;", "  color-scheme: light;", "}"]
PAL = T["color"].get("palettes", {})
PAL_DEFAULT = T["color"].get("palette-default", {}).get("$value", "")
for pname, pal in PAL.items():
    for th in THEMES:
        sel = f'[data-palette="{pname}"][data-theme="{th}"]'
        if th == "dark":
            sel = f'[data-palette="{pname}"]:not([data-theme="white"]):not([data-theme="paper"])'
        lines += [f"{sel} {{"] + [f"  --fb-{k}: {v};" for k, v in pal[th].items()] + ["}"]
SUP = {k: v for k, v in T["color"].get("support-options", {}).items() if not k.startswith("$")}
for sname, sv in SUP.items():
    for th in THEMES:
        sel = f'[data-support="{sname}"][data-theme="{th}"]'
        if th == "dark":
            sel = f'[data-support="{sname}"]:not([data-theme="white"]):not([data-theme="paper"])'
        lines += [f"{sel} {{", f"  --fb-support: {sv[th]};", f"  --fb-chart-3: {sv[th]};", "}"]
open(f"{B}/tokens/tokens.css", "w").write("\n".join(lines) + "\n")

flat_json = {"shared": {"-".join(p): v for p, v, t in shared + palette},
             "themes": {th: {"-".join(p): v for p, v, t in theme_vars[th]} for th in THEMES},
             "palettes": {n: {th: pal[th] for th in THEMES} for n, pal in PAL.items()},
             "palette-default": PAL_DEFAULT}
json.dump(flat_json, open(f"{B}/tokens/tokens.flat.json", "w"), indent=2)


# ---- contrast ----
def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]


def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + .05) / (lb + .05)


PAIRS = [("text", "background", 4.5), ("text-muted", "background", 4.5), ("text", "surface", 4.5),
         ("text-muted", "surface", 4.5), ("on-accent", "accent", 4.5), ("accent-mark", "background", 3.0),
         ("success", "background", 4.5), ("warning", "background", 4.5), ("error", "background", 4.5),
         ("info", "background", 4.5), ("chart-1", "background", 3.0), ("chart-2", "background", 2.5),
         ("chart-3", "background", 3.0), ("chart-4", "background", 3.0), ("chart-5", "background", 3.0)]
rows, fails = [], 0
PAL_PAIRS = [("on-accent", "accent", 4.5), ("accent-mark", "background", 3.0), ("chart-1", "background", 3.0),
             ("chart-3", "background", 3.0), ("chart-4", "background", 3.0), ("text", "surface", 4.5), ("text-2", "background", 4.5), ("support", "background", 4.5), ("support", "surface", 4.5)]
for pname in PAL:
    for th in THEMES:
        c = dict(flat_json["themes"][th]); c.update(PAL[pname][th])
        for a, b, need in PAL_PAIRS:
            r = ratio(c[a], c[b]); ok = r >= need; fails += not ok
            rows.append(f"| {pname} · {th} | {a} on {b} | `{c[a]}` on `{c[b]}` | {r:.1f}:1 | {need}:1 | {'pass' if ok else 'FAIL'} |")
for sname, sv in SUP.items():
    for th in THEMES:
        c = dict(flat_json["themes"][th]); c.update(PAL.get(PAL_DEFAULT, {}).get(th, {}))
        for bg in ("background", "surface"):
            r = ratio(sv[th], c[bg]); ok = r >= 4.5; fails += not ok
            rows.append(f"| support {sname} · {th} | support on {bg} | `{sv[th]}` on `{c[bg]}` | {r:.1f}:1 | 4.5:1 | {'pass' if ok else 'FAIL'} |")
for th in THEMES:
    c = flat_json["themes"][th]
    for a, b, need in PAIRS:
        r = ratio(c[a], c[b])
        ok = r >= need
        fails += not ok
        rows.append(f"| {th} | {a} on {b} | `{c[a]}` on `{c[b]}` | {r:.1f}:1 | {need}:1 | {'pass' if ok else 'FAIL'} |")

# ---- DESIGN.md token section ----
roles = list(flat_json["themes"]["dark"].keys())
sec = ["<!-- TOKENS:START (generated by tools/build.py from tokens/tokens.json; do not edit by hand) -->",
       "| Role | Dark (default) | White | Paper |", "|---|---|---|---|"]
sec += [f"| {r} | `{flat_json['themes']['dark'][r]}` | `{flat_json['themes']['white'][r]}` | `{flat_json['themes']['paper'][r]}` |" for r in roles]
sec += ["", f"Palettes (set `data-palette` on `<html>`; default `{PAL_DEFAULT}`):", "", "| Palette | Accent | Marks dark / light | Chart 1 dark / light | Note |", "|---|---|---|---|---|"]
sec += [f"| {n} | `{p['dark']['accent']}` | `{p['dark']['accent-mark']}` / `{p['white']['accent-mark']}` | `{p['dark']['chart-1']}` / `{p['white']['chart-1']}` | {p.get('$description','')} |" for n, p in PAL.items()]
sec += ["", "| Base palette | Value | Use |", "|---|---|---|"]
sec += [f"| {k} | `{v['$value']}` | {v.get('$description', '')} |" for k, v in T["color"]["palette"].items()]
fam = T["font"]["family"]
sec += ["", "Type: " + " · ".join(f"{k} {', '.join(v['$value'])}" for k, v in fam.items() if not k.startswith("$")),
        "Weights: " + " · ".join(f"{k} {v['$value']}" for k, v in T["font"]["weight"].items()),
        "Deck sizes (slide width %): " + " · ".join(f"{k} {v['$value']}" for k, v in T["font"]["size"]["deck"].items() if not k.startswith("$")),
        "Web sizes: " + " · ".join(f"{k} {v['$value']}" for k, v in T["font"]["size"]["web"].items()),
        "Document sizes: " + " · ".join(f"{k} {v['$value']}" for k, v in T["font"]["size"]["doc"].items()),
        "Space: " + " · ".join(v["$value"] for v in T["space"].values()),
        "Radius: " + " · ".join(f"{k} {v['$value']}" for k, v in T["radius"].items()),
        "", "| Theme | Pair | Colors | Ratio | Floor | Check |", "|---|---|---|---|---|---|"] + rows + ["<!-- TOKENS:END -->"]
p = f"{B}/DESIGN.md"
d = open(p).read()
d = re.sub(r"<!-- TOKENS:START.*?<!-- TOKENS:END -->", lambda m: "\n".join(sec), d, flags=re.S)
open(p, "w").write(d)
print(f"tokens {len(shared) + len(palette)} shared + {len(roles)} per theme x {len(THEMES)} · css written · DESIGN.md updated · contrast fails {fails}")
sys.exit(1 if fails else 0)
