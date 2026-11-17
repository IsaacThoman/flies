"""Optional research figure: python3 script.py summary.json figure.png (matplotlib)."""
import json
import statistics
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

with open(sys.argv[1]) as source:
    data = json.load(source)

fig, axes = plt.subplots(2, 2, figsize=(13, 9), constrained_layout=True)
colors = dict(zip(["DM1", "VA2", "DA2", "V", "DM5"], plt.get_cmap("tab10").colors))
markers = {"pinned": "o", "wandering": "^"}

ax = axes[0, 0]
for x, (context, command) in enumerate(
    (context, command) for context in markers for command in ["walk", "turn"]
):
    calibration = data["calibration"][context]
    drift = [abs(row[command]) for row in calibration["drift"]]
    ax.scatter([x] * len(drift), drift, alpha=0.5, s=20)
    ax.plot([x - 0.2, x + 0.2], [calibration["tolerances"][command]] * 2, "k-")
ax.axhline(0.05, color="black", linestyle=":", label="strict command bound")
ax.axhline(0.1, color="firebrick", linestyle="--", label="drift-adjustment ceiling")
ax.set_xticks(range(4), ["pinned\nwalk", "pinned\nturn", "wandering\nwalk", "wandering\nturn"])
ax.set(ylabel="Absolute within-run command drift", title="A  Unstimulated calibration, 20 seeds/context")
ax.legend(fontsize=8)

limits = {"DNg100": 2, "DNa02 left": 2, "DNa02 right": 2, "MDN": 2,
          "DNp01": 10, "flight": 6, "DNg12": 3, "MN9": 2, "pIP10": 2}
for panel, field, bound, title, unit in [
    (axes[0, 1], "finalCommand", 0.05, "B  Final-second paired command residual", "max |command difference|"),
    (axes[1, 1], "lateReadout", 1, "D  Last-five-second paired readout residual", "max |readout difference| / bound"),
]:
    def magnitude(row):
        return max(abs(value) / (limits[key] if field == "lateReadout" else 1)
                   for key, value in row[field].items())

    for pair in data["contrasts"]:
        rows = [next(row for row in data["rows"] if row["context"] == pair["context"]
                     and row["seed"] == pair["seed"] and row["glomerulus"] == pair["glomerulus"]
                     and row["rate"] == pair["rate"] and row["family"] == family)
                for family in ["odor", "bristle"]]
        panel.scatter(*map(magnitude, rows), marker=markers[pair["context"]], s=24,
                      edgecolor=colors[pair["glomerulus"]], linewidth=0.7,
                      facecolor=colors[pair["glomerulus"]] if pair["qualified"] else "none", alpha=0.7)
    panel.axhline(bound, color="black", linestyle=":")
    panel.axvline(bound, color="black", linestyle=":")
    panel.set(xlabel=f"Odour: {unit}", ylabel=f"Bristle: {unit}", title=title)
    panel.set_xlim(left=0)
    panel.set_ylim(bottom=0)

ax = axes[1, 0]
for context in markers:
    for family, color in [("odor", "#2166ac"), ("bristle", "#b35806")]:
        rows = [row for row in data["rows"] if row["context"] == context
                and row["family"] == family and row["rate"] == 100]
        means = [statistics.mean(max(abs(v) for v in row["timeCourse"][s]["command"].values())
                                 for row in rows) for s in range(7, 67)]
        ax.plot(range(1, 61), means, color=color, linestyle="-" if context == "pinned" else "--",
                label=f"{context}, {family}")
ax.axhline(0.05, color="black", linestyle=":")
ax.set(xlabel="Seconds after offset (one-second bins)", ylabel="Mean max |paired command difference|",
       title="C  100 events/s washout, 15 pulses/line")
ax.legend(fontsize=8)

handles = [Line2D([], [], marker="o", linestyle="none", color=color, label=g) for g, color in colors.items()]
handles += [Line2D([], [], marker=m, linestyle="none", color="gray", label=context) for context, m in markers.items()]
axes[0, 1].legend(handles=handles, fontsize=7, ncol=2)
fig.suptitle("Olfactory recovery controls: background drift and pulse-paired residuals\n"
             "A: different windows in one run. B–D: stimulus minus time-matched no-stimulus control.", fontsize=13)
fig.text(0.5, -0.025, "B, D: each point is one matched pulse pair; hollow = unqualified drive match. "
         "C: descriptive means; gates use every individual trial. No navigation is measured.", ha="center", fontsize=9)
fig.savefig(sys.argv[2], dpi=170, bbox_inches="tight")
