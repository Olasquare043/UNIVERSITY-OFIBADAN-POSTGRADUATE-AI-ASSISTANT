import { CalendarDays, ClipboardCheck, FileSignature, Scale, ScrollText, UserPlus, Wallet } from "lucide-react";

export const TOPICS = [
  {
    title: "Admissions",
    icon: UserPlus,
    questions: ["What are the requirements for admission into the MPhil/PhD programme?", "What is the acceptance fee?"],
  },
  {
    title: "Fees",
    icon: Wallet,
    questions: ["How much are the postgraduate school fees?", "Can I pay my school fees in instalments?"],
  },
  {
    title: "Registration",
    icon: ClipboardCheck,
    questions: ["How do I register as a new postgraduate student?", "What is the deadline for late registration?"],
  },
  {
    title: "Examinations and regulations",
    icon: Scale,
    questions: ["What is the pass mark for a course?", "What happens in case of examination misconduct?"],
  },
  {
    title: "Thesis and dissertation",
    icon: ScrollText,
    questions: ["How many copies of my thesis must I submit?", "What is the deadline for thesis submission?"],
  },
  {
    title: "Calendar",
    icon: CalendarDays,
    questions: ["When does the 2025/2026 academic session start?", "What are the key dates in the academic calendar?"],
  },
  {
    title: "Forms and scholarships",
    icon: FileSignature,
    questions: ["How do I request conversion from MPhil to PhD?", "Are there scholarships for postgraduate students?"],
  },
];

// Follow-up questions are picked from the topic of the question just asked.
const FOLLOW_UP_RULES = [
  {
    match: /fee|pay|tuition|acceptance|instalment|charge/i,
    questions: ["Can I pay my school fees in instalments?", "What is the acceptance fee?", "How do I get my payment receipt?"],
  },
  {
    match: /thesis|dissertation|submit|copies|viva|oral/i,
    questions: [
      "What is the deadline for thesis submission?",
      "How many copies of my thesis must I submit?",
      "What is the required format for a thesis?",
    ],
  },
  {
    match: /calendar|session|semester|date|deadline|when/i,
    questions: [
      "What are the key dates in the academic calendar?",
      "What is the deadline for late registration?",
      "When does the 2025/2026 academic session start?",
    ],
  },
  {
    match: /exam|misconduct|pass ?mark|grade|plagiar|result/i,
    questions: [
      "What is the pass mark for a course?",
      "What happens in case of examination misconduct?",
      "What is the plagiarism policy for theses?",
    ],
  },
  {
    match: /regist|enrol|clearance|course/i,
    questions: [
      "How do I register as a new postgraduate student?",
      "What is the deadline for late registration?",
      "What forms do I need for clearance?",
    ],
  },
  {
    match: /admission|apply|requirement|convert|conversion|form|scholarship/i,
    questions: [
      "What are the requirements for admission into the MPhil/PhD programme?",
      "How do I request conversion from MPhil to PhD?",
      "Are there scholarships for postgraduate students?",
    ],
  },
];

const GENERAL_FOLLOW_UPS = [
  "What is the acceptance fee?",
  "How do I register as a new postgraduate student?",
  "What is the deadline for thesis submission?",
];

export function suggestFollowUps(question, alreadyAsked = []) {
  const asked = new Set(alreadyAsked.map((text) => text.trim().toLowerCase()));
  const rule = FOLLOW_UP_RULES.find((r) => r.match.test(question));
  const pool = [...(rule ? rule.questions : []), ...GENERAL_FOLLOW_UPS];

  return [...new Set(pool)].filter((text) => !asked.has(text.toLowerCase())).slice(0, 3);
}
