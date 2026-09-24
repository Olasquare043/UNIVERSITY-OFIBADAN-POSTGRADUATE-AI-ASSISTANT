import { Award, BookOpen, CalendarDays, FileSignature, FileText, GraduationCap, Lightbulb, Scale, ScrollText, Wallet } from "lucide-react";

// First match wins, so more specific patterns come first.
const KINDS = [
  { match: /\bform\b/i, label: "Form", icon: FileSignature },
  { match: /calendar/i, label: "Calendar", icon: CalendarDays },
  { match: /\bfee/i, label: "Fee schedule", icon: Wallet },
  { match: /thesis|dissertation|manual of style/i, label: "Thesis guide", icon: ScrollText },
  { match: /handbook/i, label: "Handbook", icon: BookOpen },
  { match: /admission|orientation/i, label: "Admission guide", icon: GraduationCap },
  { match: /scholarship|bursary/i, label: "Scholarship", icon: Award },
  { match: /policy|regulation/i, label: "Policy and regulations", icon: Scale },
  { match: /guideline|workshop|material/i, label: "Guidelines", icon: Lightbulb },
];

const DEFAULT_KIND = { label: "Document", icon: FileText };

export function documentKind(name) {
  return KINDS.find((kind) => kind.match.test(name)) || DEFAULT_KIND;
}
