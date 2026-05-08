import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

interface AuthViewProps {
  onSignIn: () => void;
}

type Mode = "signin" | "signup";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores");

const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(72, "Password is too long");

// Synthetic email so users only ever see a username field.
const usernameToEmail = (username: string): string =>
  `${username.toLowerCase()}@anikage.local`;

export function AuthView({ onSignIn }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async (): Promise<void> => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in failed. Please try again.");
        return;
      }
      if (result.redirected) return;
      onSignIn();
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    const u = usernameSchema.safeParse(username);
    if (!u.success) {
      toast.error(u.error.issues[0].message);
      return;
    }
    const p = passwordSchema.safeParse(password);
    if (!p.success) {
      toast.error(p.error.issues[0].message);
      return;
    }

    setLoading(true);
    const email = usernameToEmail(u.data);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password: p.data,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: u.data },
          },
        });
        if (error) {
          toast.error(
            error.message.toLowerCase().includes("registered")
              ? "That username is already taken"
              : error.message,
          );
          return;
        }
        toast.success(`Welcome, ${u.data}!`);
        onSignIn();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: p.data,
        });
        if (error) {
          toast.error("Invalid username or password");
          return;
        }
        toast.success(`Welcome back, ${u.data}!`);
        onSignIn();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4">
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-primary-glow/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-card/80 backdrop-blur-xl border border-border rounded-2xl p-10 shadow-[var(--shadow-card)]">
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-[var(--shadow-glow)]">
              <span className="text-primary-foreground font-black text-2xl">愛</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Anikage</h1>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {mode === "signin"
                ? "Welcome back. Step into your anime universe."
                : "Create your account and start your journey."}
            </p>
          </div>

          {/* Mode tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl mb-6">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_handle"
                maxLength={20}
                className="w-full bg-input border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                maxLength={72}
                className="w-full bg-input border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-xl py-3.5 transition-all hover:shadow-[var(--shadow-glow)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-card hover:bg-muted border border-border text-foreground font-semibold rounded-xl py-3.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
            By continuing, you agree to our{" "}
            <span className="text-primary hover:underline cursor-pointer">Terms</span> &{" "}
            <span className="text-primary hover:underline cursor-pointer">Privacy</span>.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Your watchlist · Your stats · Your stories.
        </p>
      </div>
    </div>
  );
}
