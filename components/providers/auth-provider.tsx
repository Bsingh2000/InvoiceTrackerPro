"use client";

import type { Session, User } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

type WorkspaceContext = {
  id: string;
  name: string;
  role: string;
};

type AuthContextValue = {
  session: Session;
  user: User;
  workspace: WorkspaceContext;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrappedUserId, setBootstrappedUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setSessionLoaded(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionLoaded(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const bootstrapWorkspace = useCallback(
    async (user: User) => {
      setLoading(true);
      setBootstrapError(null);

      try {
        const { data: memberships, error: memberError } = await supabase
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", user.id)
          .limit(1);

        if (memberError) {
          throw memberError;
        }

        const existingMembership = memberships?.[0] as
          | { workspace_id: string; role: string }
          | undefined;

        if (existingMembership) {
          await supabase.from("profiles").upsert({
            id: user.id,
            email: user.email,
            full_name: getFullName(user)
          });

          const { data: existingWorkspace, error: workspaceError } = await supabase
            .from("workspaces")
            .select("id, name")
            .eq("id", existingMembership.workspace_id)
            .single();

          if (workspaceError) {
            throw workspaceError;
          }

          setWorkspace({
            id: existingWorkspace.id,
            name: existingWorkspace.name,
            role: existingMembership.role
          });
          setBootstrappedUserId(user.id);
          return;
        }

        throw new Error("This account has not been invited to a workspace yet. Ask an admin to invite this email address from Settings.");
      } catch (error) {
        setBootstrappedUserId(null);
        setWorkspace(null);
        setBootstrapError(error instanceof Error ? error.message : "Workspace setup failed.");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!sessionLoaded) {
      return;
    }

    if (!session?.user) {
      setBootstrappedUserId(null);
      setWorkspace(null);
      setBootstrapError(null);
      setLoading(false);
      return;
    }

    if (requiresPasswordReset(session.user)) {
      setBootstrappedUserId(null);
      setWorkspace(null);
      setBootstrapError(null);
      setLoading(false);
      return;
    }

    if (bootstrappedUserId === session.user.id && workspace) {
      setLoading(false);
      return;
    }

    void bootstrapWorkspace(session.user);
  }, [bootstrapWorkspace, bootstrappedUserId, session, sessionLoaded, workspace]);

  useEffect(() => {
    if (!sessionLoaded || !session?.user || !requiresPasswordReset(session.user)) {
      return;
    }

    if (pathname !== "/auth/update-password") {
      router.replace("/auth/update-password?reason=temporary-password");
    }
  }, [pathname, router, session, sessionLoaded]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setBootstrappedUserId(null);
    setSession(null);
    setWorkspace(null);
  }, [supabase]);

  const value = useMemo(() => {
    if (!session || !workspace) {
      return null;
    }

    return {
      session,
      user: session.user,
      workspace,
      signOut
    };
  }, [session, signOut, workspace]);

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!session) {
    return <AuthGate />;
  }

  if (requiresPasswordReset(session.user)) {
    return (
      <AuthShell>
        <Card className="w-full max-w-lg p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-citrine-700">
            Password reset required
          </p>
          <h1 className="mt-2 text-3xl font-black text-ink-900">Replace your temporary password</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            This account was issued a temporary sign-in password. Set a new password before the workspace can open.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => router.replace("/auth/update-password?reason=temporary-password")}
              className="w-full sm:w-auto"
            >
              Create new password
            </Button>
            <Button className="w-full sm:w-auto" variant="secondary" onClick={signOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </Card>
      </AuthShell>
    );
  }

  if (bootstrapError || !value) {
    return (
      <AuthShell>
        <Card className="w-full max-w-lg p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-garnet-700">
            Workspace setup
          </p>
          <h1 className="mt-2 text-2xl font-black text-ink-900">Workspace could not load</h1>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            {bootstrapError ?? "The current account does not have a workspace yet."}
          </p>
          <Button className="mt-5" variant="secondary" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </Card>
      </AuthShell>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function AuthGate() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authMessage = searchParams.get("auth");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        throw result.error;
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-lg p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          Invoice Tracker Pro
        </p>
        <h1 className="mt-2 text-3xl font-black text-ink-900">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Only invited users can access this invoice workspace.
        </p>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label>
            <span className="field-label">Email</span>
            <input
              className="field-control"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            <span className="field-label">Password</span>
            <input
              className="field-control"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={6}
              required
            />
          </label>

        {error ? (
          <p className="rounded-lg border border-garnet-100 bg-garnet-50 p-3 text-sm font-semibold text-garnet-800">
            {error}
          </p>
        ) : null}

        {!error && authMessage === "password-reset" ? (
          <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Password updated. Sign in again with the new password.
          </p>
        ) : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}

function AuthLoadingScreen() {
  return (
    <AuthShell>
      <Card className="w-full max-w-md p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          Invoice Tracker Pro
        </p>
        <h1 className="mt-2 text-2xl font-black text-ink-900">Loading workspace</h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Connecting to Supabase and preparing your invoice data.
        </p>
      </Card>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-8 text-ink-900">
      {children}
    </main>
  );
}

function getFullName(user: User) {
  const value = user.user_metadata?.full_name;
  return typeof value === "string" ? value : null;
}

function requiresPasswordReset(user: User) {
  return user.app_metadata?.must_change_password === true;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
