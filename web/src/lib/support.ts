/** Shapes returned by the /api/support routes. */

/**
 * The public view of a therapist. The API decides what leaves the server: no
 * phone, address, date of birth or emergency contact ever reaches the browser
 * in this shape.
 */
export interface Therapist {
  id: string;
  fullName: string;
  discipline: string;
  bio: string | null;
  clinicalAreas: string[];
  modalities: string[];
  languages: string[];
  sessionModes: string[];
  sessionFee: number;
  currency: string;
  yearsExperience: number;
  acceptingNewCases: boolean;
  registrationVerified: boolean;
  registrationBody: string | null;
  registrationCountry: string | null;
}

export interface Conversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  otherUserId: string;
  otherName: string | null;
  otherRole: string;
  lastMessage: string | null;
  messageCount: number;
  /** Messages from the other side since this user last opened the thread. */
  unreadCount: number;
}

export interface Message {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
}

export interface DirectoryResponse {
  therapists: Therapist[];
  total: number;
}

export interface ConversationsResponse {
  conversations: Conversation[];
  total: number;
}

export interface MessagesResponse {
  conversationId: string;
  other: { id: string; fullName: string | null; role: string } | null;
  messages: Message[];
  total: number;
}

/** GBP is the seeded default; anything else is shown with its own code. */
export function formatFee(fee: number, currency: string): string {
  const amount = Number.isFinite(fee) ? fee : 0;
  if (currency === "GBP") {
    return amount % 1 === 0 ? `£${amount}` : `£${amount.toFixed(2)}`;
  }
  return `${amount % 1 === 0 ? amount : amount.toFixed(2)} ${currency}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** `["anxiety", "burnout"]` becomes `Anxiety · Burnout`. */
export function titleCaseList(values: string[] | null | undefined): string {
  if (!values?.length) return "";
  return values
    .map((value) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " "))
    .join(" \u00b7 ");
}