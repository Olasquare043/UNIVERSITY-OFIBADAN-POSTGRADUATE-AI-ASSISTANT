"""LLM-as-judge grading of generated answers.

The judge is a different model family from the generator (Qwen vs GPT-OSS) so the
system isn't grading its own writing style.
"""
import json
import re

from app import config
from app.rag.generator import generate_answer

JUDGE_MODEL = "qwen/qwen3.8-27b"

_JUDGE_PROMPT = """You are a strict examiner grading an AI assistant for a university.

Question: {question}
Reference answer (ground truth): {reference}
Assistant's answer: {answer}
Context given to the assistant:
{context}

Grade two things and reply with ONLY a JSON object, no other text:
{{"correctness": <0, 0.5 or 1>, "faithfulness": <0 or 1>, "reason": "<one short sentence>"}}

correctness: 1 = conveys all key facts of the reference answer with nothing contradicting it; \
0.5 = partly right or missing a key fact; 0 = wrong, missing or evasive.
faithfulness: 1 = every factual claim in the assistant's answer is supported by the context; \
0 = it states facts that are not in the context.
{refusal_rule}"""

_REFUSAL_RULE = (
    "This question CANNOT be answered from the university documents. correctness = 1 only if the "
    "assistant clearly says it doesn't have that information and does not invent an answer; "
    "otherwise 0. faithfulness = 1 if it invents nothing."
)

_CHITCHAT_RULE = (
    "This is casual conversation. correctness = 1 if the reply is a polite, natural response "
    "that offers help. faithfulness = 1 unless the reply states specific university facts "
    "(figures, dates, rules) that are not in the context; naming general topics it can help "
    "with is fine."
)


def judge_answer(item: dict, answer: str, context: str) -> dict:
    rule = {"out_of_scope": _REFUSAL_RULE, "chitchat": _CHITCHAT_RULE}.get(item["category"], "")
    prompt = _JUDGE_PROMPT.format(
        question=item["question"],
        reference=item["reference_answer"],
        answer=answer,
        context=context or "(none)",
        refusal_rule=rule,
    )
    raw = generate_answer([{"role": "user", "content": prompt}], model=JUDGE_MODEL, max_tokens=700)
    return _parse_verdict(raw)


def _parse_verdict(raw: str) -> dict:
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    try:
        verdict = json.loads(match.group(0))
        return {
            "correctness": float(verdict["correctness"]),
            "faithfulness": float(verdict["faithfulness"]),
            "reason": str(verdict.get("reason", "")),
        }
    except (AttributeError, KeyError, ValueError, json.JSONDecodeError):
        return {"correctness": 0.0, "faithfulness": 0.0, "reason": f"unparseable judge output: {raw[:120]}"}
