// Maps database/PostgREST errors to safe, user-facing messages (pure).
//
// Raw database messages are NEVER shown to users: they can name tables, columns or
// policies. Only the SQLSTATE code and a few of OUR OWN exception texts (raised by
// the migrations) are used to choose between fixed messages. Anything unrecognised
// becomes a generic "unavailable" message.

export type RpcContext = "search" | "submit" | "reply" | "staff" | "student_status";

export type RpcErrorKind =
  | "not_authorized"
  | "invalid_recipient"
  | "invalid_category"
  | "invalid_scope"
  | "invalid_text"
  | "invalid_input"
  | "not_found"
  | "invalid_transition"
  | "conflict"
  | "window_passed"
  | "closed"
  | "rate_limited"
  | "unavailable";

export type MappedRpcError = { readonly kind: RpcErrorKind; readonly message: string };

const MESSAGES: Readonly<Record<RpcErrorKind, string>> = {
  not_authorized: "Your account is not approved to do this yet. If you think this is a mistake, contact the university administrator.",
  invalid_recipient: "That lecturer cannot receive complaints right now. Please choose another lecturer.",
  invalid_category: "That category is no longer available. Please choose another one.",
  invalid_scope: "The selected level or department is not available. Please choose again.",
  invalid_text: "The title or description was not accepted. Please check it and try again.",
  invalid_input: "Some of the information was not accepted. Please check it and try again.",
  not_found: "That complaint could not be found.",
  conflict: "The complaint changed in the meantime. Please reload the page and try again.",
  invalid_transition: "That status change is not allowed from the current status.",
  window_passed: "The period for reopening this complaint has passed. Please submit a new complaint.",
  closed: "This complaint is closed, so you can no longer reply. Please submit a new complaint if you still need help.",
  rate_limited: "You are doing that too often. Please wait a little while and try again.",
  unavailable: "Something went wrong on our side. Please try again in a moment.",
};

function field(error: unknown, key: "code" | "message"): string {
  if (typeof error !== "object" || error === null) return "";
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function mapRpcError(error: unknown, context: RpcContext): MappedRpcError {
  const code = field(error, "code");
  const message = field(error, "message").toLowerCase();

  let kind: RpcErrorKind = "unavailable";
  if (code === "42501") {
    kind = "not_authorized";
  } else if (code === "54000") {
    kind = "rate_limited";
  } else if (code === "P0002" && context !== "search" && context !== "submit") {
    kind = "not_found";
  } else if (code === "55000" && context === "student_status") {
    kind = "window_passed";
  } else if (code === "55000" && context === "staff") {
    kind = "conflict";
  } else if (code === "55000" && context === "reply") {
    kind = "closed";
  } else if (code === "22023") {
    if (context === "search" || context === "reply") {
      kind = "invalid_input";
    } else if (context === "staff" || context === "student_status") {
      if (message.includes("invalid status transition")) kind = "invalid_transition";
      else if (message.includes("invalid recipient")) kind = "invalid_recipient";
      else if (message.includes("reason")) kind = "invalid_text";
      else kind = "invalid_input";
    } else if (message.includes("invalid recipient")) {
      kind = "invalid_recipient";
    } else if (message.includes("invalid category")) {
      kind = "invalid_category";
    } else if (message.includes("invalid level or department")) {
      kind = "invalid_scope";
    } else if (message.includes("invalid title") || message.includes("invalid description")) {
      kind = "invalid_text";
    } else {
      kind = "invalid_input";
    }
  }
  return { kind, message: MESSAGES[kind] };
}
