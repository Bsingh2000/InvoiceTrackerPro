"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loadingSession, setLoadingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) {
        return;
      }

      setHasSession(Boolean(data.user));
      setLoadingSession(false);
    });

    return () => {
      active = false;
    };
  }, [supabase]);

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
          Workspace invite
        </p>
        <h1 className="mt-2 text-3xl font-black text-ink-900">Set your password</h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Create a password for the invited account, then sign in to the invoice workspace.
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
