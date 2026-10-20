"""Batch traceability analytics: which lots had the most defects, and which machine they share.

"Defect rate" here = share of cells the inspection flagged (REJECT or REVIEW).

- Lot control chart (p-chart): centre line = overall defect rate p̄; per-lot limits
  p̄ ± 3·sqrt(p̄(1−p̄)/n). A lot above its upper limit is "out of control".
- Machine comparison: for each process step, each machine's defect rate vs. the other machines of
  that step, with a one-sided two-proportion z-test. A machine is a suspect when its rate is higher
  than the rest with p < SUSPECT_P and it has processed at least MIN_CELLS cells.
- Confounding: other suspects are re-tested without the strongest suspect's cells; machines whose
  excess disappears are reported as "explained by" it instead of being flagged.
These are screening statistics for a simulated genealogy, not a root-cause proof.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict

SUSPECT_P = 0.01
MIN_CELLS = 24
FLAGGED = ("REJECT", "REVIEW")


def _one_sided_p(f1: int, n1: int, f2: int, n2: int) -> float | None:
    """P-value for H1: rate1 > rate2 (pooled two-proportion z-test)."""
    if n1 == 0 or n2 == 0:
        return None
    p = (f1 + f2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    if se == 0:
        return None
    z = (f1 / n1 - f2 / n2) / se
    return 0.5 * math.erfc(z / math.sqrt(2))


def batch_report(rows: list[dict], lot_size: int) -> dict:
    rows = [r for r in rows if r.get("lot_id")]
    n_all = len(rows)
    f_all = sum(r["status"] in FLAGGED for r in rows)
    pbar = f_all / n_all if n_all else None

    # ---- lots ---------------------------------------------------------------
    by_lot: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_lot[r["lot_id"]].append(r)
    lots = []
    for lot_id in sorted(by_lot):
        cells = by_lot[lot_id]
        n = len(cells)
        flagged = [c for c in cells if c["status"] in FLAGGED]
        rate = len(flagged) / n
        ucl = lcl = None
        if pbar is not None:
            sigma = math.sqrt(pbar * (1 - pbar) / n)
            ucl, lcl = min(1.0, pbar + 3 * sigma), max(0.0, pbar - 3 * sigma)
        lots.append({
            "lot_id": lot_id,
            "cells": n,
            "complete": n >= lot_size,
            "flagged": len(flagged),
            "rejected": sum(c["status"] == "REJECT" for c in cells),
            "review": sum(c["status"] == "REVIEW" for c in cells),
            "rate": rate,
            "ucl": ucl,
            "lcl": lcl,
            "out_of_control": ucl is not None and rate > ucl,
            "defects": dict(Counter(c["defect"] for c in flagged if c["defect"])),
            "genealogy": cells[0]["genealogy"],
        })

    # ---- machines per process step ------------------------------------------
    steps: dict[str, list[dict]] = {}
    step_names = list(dict.fromkeys(s for r in rows for s in r["genealogy"]))  # process order
    suspects = []
    for step in step_names:
        machines = sorted({r["genealogy"].get(step) for r in rows if r["genealogy"].get(step)})
        out = []
        for m in machines:
            mine = [r for r in rows if r["genealogy"].get(step) == m]
            rest = [r for r in rows if r["genealogy"].get(step) not in (m, None)]
            n, f = len(mine), sum(r["status"] in FLAGGED for r in mine)
            n2, f2 = len(rest), sum(r["status"] in FLAGGED for r in rest)
            p = _one_sided_p(f, n, f2, n2)
            rate = f / n if n else None
            entry = {
                "machine": m,
                "cells": n,
                "lots": len({r["lot_id"] for r in mine}),
                "flagged": f,
                "rate": rate,
                "rest_rate": f2 / n2 if n2 else None,
                "lift": rate / pbar if (rate is not None and pbar) else None,
                "p_value": p,
                "suspect": bool(p is not None and p < SUSPECT_P and n >= MIN_CELLS and rate is not None
                                and pbar is not None and rate > pbar),
                "defects": dict(Counter(r["defect"] for r in mine if r["status"] in FLAGGED and r["defect"])),
            }
            out.append(entry)
            if entry["suspect"]:
                suspects.append({"step": step, **entry})
        steps[step] = out
    suspects.sort(key=lambda s: s["p_value"])

    # Confounding check: lots share machines by chance, so a machine can look bad only because
    # its lots also went through the strongest suspect. Re-test the other suspects on cells that
    # did NOT go through the strongest suspect; if the effect disappears, it is explained by it.
    if suspects:
        top = suspects[0]
        clean_rows = [r for r in rows if r["genealogy"].get(top["step"]) != top["machine"]]
        kept = [top]
        for s in suspects[1:]:
            mine = [r for r in clean_rows if r["genealogy"].get(s["step"]) == s["machine"]]
            rest = [r for r in clean_rows if r["genealogy"].get(s["step"]) not in (s["machine"], None)]
            p_cond = _one_sided_p(sum(r["status"] in FLAGGED for r in mine), len(mine),
                                  sum(r["status"] in FLAGGED for r in rest), len(rest))
            entry = next(e for e in steps[s["step"]] if e["machine"] == s["machine"])
            entry["p_value_without_top"] = p_cond
            if p_cond is None or p_cond >= SUSPECT_P:
                entry["suspect"] = False
                entry["explained_by"] = f'{top["step"]} {top["machine"]}'
            else:
                kept.append(s)
        suspects = kept

    return {
        "cells": n_all,
        "flagged": f_all,
        "rate": pbar,
        "lot_size": lot_size,
        "lots": lots,
        "steps": steps,
        "suspects": suspects,
        "method": {
            "defect_rate": "share of cells flagged by inspection (REJECT or REVIEW)",
            "control_chart": "p-chart, centre = overall rate, limits = ±3 sigma per lot size",
            "suspect": f"one-sided two-proportion z-test vs. other machines of the step, p < {SUSPECT_P}, "
                       f"at least {MIN_CELLS} cells",
        },
    }
