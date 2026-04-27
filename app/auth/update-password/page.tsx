"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [loadingSession, setLoadingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [requiresTemporaryReset, setRequiresTemporaryReset] = useState(
    searchParams.get("reason") === "temporary-password"
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) {
        return;
      }

      setHasSession(Boolean(data.user));
      setRequiresTemporaryReset(
        data.user?.app_metadata?.must_change_password === true ||
          searchParams.get("reason") === "temporary-password"
      );
      setLoadingSession(false);
    });

    return () => {
      active = false;
    };
  }, [searchParams, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (password.length < 8) {
        throw new Error("Use at least 8 characters for the password.");
      }

      if (password !== confirmPassword) {
        throw new Error("The passwords do not match.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      const completionResponse = await fetch("/api/auth/complete-password-reset", {
        method: "POST",
        headers: {
          "X-Requested-With": "invoice-tracker-password-reset"
        }
      });
      const completionData = (await completionResponse.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!completionResponse.ok || completionData?.error) {
        throw new Error(completionData?.error || "Password saved, but the reset flow could not be completed.");
      }

      const { error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        await supabase.auth.signOut();
        setMessage("Password saved. Sign in again with the new password.");
        window.setTimeout(() => router.push("/dashboard?auth=password-reset"), 700);
        return;
      }

      setMessage("Password saved. Opening your workspace...");
      window.setTimeout(() => router.push("/dashboard"), 700);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Password could not be updated.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-8 text-ink-900">
      <Card className="w-full max-w-lg p-5 sm:p-6">
        <div className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <LockKeyhole className="size-5" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          {requiresTemporaryReset ? "Temporary password" : "Workspace invite"}
        </p>
        <h1 className="mt-2 text-3xl font-black text-ink-900">
          {requiresTemporaryReset ? "Replace your password" : "Set your password"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          {requiresTemporaryReset
            ? "Create a new password for this account before the workspace can open."
            : "Create a password for the invited account, then sign in to the invoice workspace."}
        </p>

        {loadingSession ? (
          <p className="mt-6 rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm font-semibold text-ink-600">
            Checking invite session...
          </p>
        ) : null}

        {!loadingSession && !hasSession ? (
          <p className="mt-6 rounded-lg border border-citrine-100 bg-citrine-50 p-3 text-sm font-semibold leading-6 text-citrine-900">
            This invite session is not active. Open the latest invite email link again.
          </p>
        ) : null}

        {!loadingSession && hasSession ? (
          <form className="mt-6 grid gap-4" onSubmit={submit}>
            <label>
              <span className="field-label">New password</span>
              <input
                className="field-control"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label>
              <span className="field-label">Confirm password</span>
              <input
                className="field-control"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-garnet-100 bg-garnet-50 p-3 text-sm font-semibold text-garnet-800">
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                {message}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving password..." : "Save password"}
            </Button>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
