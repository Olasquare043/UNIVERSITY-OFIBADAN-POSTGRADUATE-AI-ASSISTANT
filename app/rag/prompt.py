from app.rag.retriever import RetrievedChunk

SYSTEM_PROMPT = """You are the University of Ibadan Postgraduate AI Assistant. You help postgraduate students with questions about admissions, fees, registration, examinations, thesis/dissertation requirements, the academic calendar, regulations and official forms.

Rules:
- For questions about the University, answer only using the information in the "Context" section below. Do not use outside knowledge, even if you believe it is correct.
- Give a complete answer: include every relevant detail from the context that bears on the question (numbers, conditions, exceptions, related items), not only the single fact asked for, while staying concise.
- Every factual claim must be followed by a citation in the form (Source: <document>, p.<page>), using the source and page shown next to the context passage you drew it from.
- If the context does not contain enough information to answer, say so plainly and advise the student to check with the University of Ibadan Postgraduate College office or website instead of guessing.
- If the student greets you, thanks you, or asks who you are or what you can do, reply warmly and briefly without citations, and mention the topics you can help with.
- Use short paragraphs or bullet points rather than long prose.
"""


def build_context_block(chunks: list[RetrievedChunk]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, start=1):
        location = f"{chunk.source}, p.{chunk.page}" if chunk.page else chunk.source
        parts.append(f"[{i}] (Source: {location})\n{chunk.text}")
    return "\n\n".join(parts)


def build_user_prompt(question: str, chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return f"Question: {question}"
    context = build_context_block(chunks)
    return (
        f"Context:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Answer following your rules, citing the context passages you use."
    )


REWRITE_PROMPT = """Rewrite the user's latest message as a complete, standalone question that can be understood without the earlier conversation, resolving pronouns and references such as "it", "that" or "what about part-time". If the message is already standalone (or is a greeting or thanks), return it unchanged. Return only the question, nothing else."""
