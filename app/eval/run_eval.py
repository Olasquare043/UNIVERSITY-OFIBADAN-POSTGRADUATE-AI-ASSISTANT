"""Evaluate the assistant against data/eval/eval_set.json.

Compare retrieval strategies (fast, no LLM judging):
    python -m app.eval.run_eval --retrieval-only --modes dense hybrid

Full end-to-end run (retrieval + answer generation + LLM judge):
    python -m app.eval.run_eval
"""
import argparse
import json
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from app import config
from app.eval.judge import judge_answer
from app.eval.metrics import retrieval_scores
from app.rag.pipeline import _standalone_question, answer_question
from app.rag.retriever import retrieve

EVAL_SET = Path("data/eval/eval_set.json")
RESULTS_DIR = Path("data/eval/results")
PROGRESS_FILE = RESULTS_DIR / "answers_progress.json"


def load_eval_set(limit: int | None) -> list[dict]:
    items = json.loads(EVAL_SET.read_text(encoding="utf-8"))
    return items[:limit] if limit else items


def evaluate_retrieval(items: list[dict], mode: str, k: int) -> dict:
    per_question = []
    for item in items:
        if not item.get("evidence"):
            continue
        query = _standalone_question(item["question"], item.get("history", []))
        start = time.perf_counter()
        chunks = retrieve(query, top_k=k, mode=mode)
        latency = time.perf_counter() - start
        scores = retrieval_scores(item["evidence"], [c.text for c in chunks], k)
        per_question.append({"id": item["id"], "category": item["category"], "latency": latency, **scores})

    summary = {
        "mode": mode,
        f"hit@{k}": _mean(per_question, "hit"),
        f"recall@{k}": _mean(per_question, "recall"),
        "mrr": _mean(per_question, "reciprocal_rank"),
        "avg_latency_s": _mean(per_question, "latency"),
        "questions": len(per_question),
    }
    summary["missed"] = [q["id"] for q in per_question if not q["hit"]]
    return summary


def evaluate_answers(items: list[dict], resume: bool) -> dict:
    per_question = json.loads(PROGRESS_FILE.read_text(encoding="utf-8")) if resume and PROGRESS_FILE.exists() else []
    done = {q["id"] for q in per_question}
    for item in items:
        if item["id"] in done:
            continue
        start = time.perf_counter()
        result = answer_question(item["question"], history=item.get("history", []))
        latency = time.perf_counter() - start

        cited = {(source["document"], source["page"]) for source in result["sources"]}
        context = "\n\n".join(c.text[:600] for c in result["chunks"] if (c.source, c.page) in cited)
        verdict = judge_answer(item, result["answer"], context)
        per_question.append(
            {
                "id": item["id"],
                "category": item["category"],
                "question": item["question"],
                "answer": result["answer"],
                "sources": result["sources"],
                "latency": latency,
                **verdict,
            }
        )
        PROGRESS_FILE.write_text(json.dumps(per_question, ensure_ascii=False), encoding="utf-8")
        print(f"  {item['id']:<8} correctness={verdict['correctness']}  faithfulness={verdict['faithfulness']}")

    by_category = defaultdict(list)
    for q in per_question:
        by_category[q["category"]].append(q)

    return {
        "mode": config.RETRIEVAL_MODE,
        "correctness": _mean(per_question, "correctness"),
        "faithfulness": _mean(per_question, "faithfulness"),
        "avg_latency_s": _mean(per_question, "latency"),
        "by_category": {c: _mean(qs, "correctness") for c, qs in by_category.items()},
        "failures": [
            {k: q[k] for k in ("id", "question", "answer", "reason")}
            for q in per_question
            if q["correctness"] < 1 or q["faithfulness"] < 1
        ],
        "details": per_question,
    }


def _mean(rows: list[dict], key: str) -> float:
    return round(sum(float(r[key]) for r in rows) / len(rows), 3) if rows else 0.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--retrieval-only", action="store_true")
    parser.add_argument("--modes", nargs="+", default=["dense", "hybrid"])
    parser.add_argument("--k", type=int, default=config.TOP_K)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--resume", action="store_true", help="continue a run that stopped on a Groq quota limit")
    args = parser.parse_args()

    items = load_eval_set(args.limit)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if args.retrieval_only:
        summaries = [evaluate_retrieval(items, mode, args.k) for mode in args.modes]
        print(f"\n{'mode':<16}{'hit@k':>8}{'recall@k':>10}{'mrr':>8}{'latency':>10}")
        for s in summaries:
            print(f"{s['mode']:<16}{s[f'hit@{args.k}']:>8}{s[f'recall@{args.k}']:>10}{s['mrr']:>8}{s['avg_latency_s']:>9}s")
            print(f"    missed: {s['missed']}")
        report, name = summaries, f"{stamp}_retrieval.json"
    else:
        try:
            report = evaluate_answers(items, args.resume)
        except RuntimeError as error:
            raise SystemExit(f"\nStopped: {error}. Progress is saved; run again with --resume once the quota resets.")
        PROGRESS_FILE.unlink(missing_ok=True)
        print(f"\nmode={report['mode']}  correctness={report['correctness']}  faithfulness={report['faithfulness']}"
              f"  latency={report['avg_latency_s']}s")
        print("correctness by category:", report["by_category"])
        for f in report["failures"]:
            print(f"\n  [{f['id']}] {f['question']}\n    -> {f['reason']}")
        name = f"{stamp}_answers_{report['mode']}.json"

    (RESULTS_DIR / name).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved {RESULTS_DIR / name}")


if __name__ == "__main__":
    main()
