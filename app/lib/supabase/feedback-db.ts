import { supabase } from "./client";

export type FeedbackCategory =
  | "general"
  | "bug"
  | "idea"
  | "flow"
  | "visual"
  | "nutrition"
  | "workout"
  | "grocery"
  | "account";

export type FeedbackSentiment = "issue" | "idea" | "praise" | "question";

export type FeedbackStatus = "new" | "reviewing" | "planned" | "resolved" | "closed";

export type FeedbackRecord = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  category: FeedbackCategory;
  sentiment: FeedbackSentiment;
  rating: number | null;
  page_path: string | null;
  message: string;
  status: FeedbackStatus;
  admin_notes: string | null;
};

export type CreateFeedbackInput = {
  category: FeedbackCategory;
  sentiment: FeedbackSentiment;
  rating?: number | null;
  page_path?: string | null;
  message: string;
};

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const user = data.session?.user;
  if (!user) throw new Error("User not signed in");

  return user;
}

function cleanOptionalText(value?: string | null) {
  const next = value?.trim();
  return next ? next : null;
}

function describeSupabaseError(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}) {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  return `${parts.join(" ")}${error.code ? ` Code: ${error.code}` : ""}`;
}

export async function createFeedback(input: CreateFeedbackInput) {
  const user = await getCurrentUser();
  const message = input.message.trim();

  if (message.length < 3) {
    throw new Error("Feedback needs at least a few words.");
  }

  const { data, error } = await supabase
    .from("beta_feedback")
    .insert({
      user_id: user.id,
      category: input.category,
      sentiment: input.sentiment,
      rating: input.rating ?? null,
      page_path: cleanOptionalText(input.page_path),
      message,
    })
    .select("*")
    .single();

  if (error) throw new Error(describeSupabaseError(error));

  return data as FeedbackRecord;
}

export async function listMyFeedback(limit = 5) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("beta_feedback")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(describeSupabaseError(error));

  return (data ?? []) as FeedbackRecord[];
}
