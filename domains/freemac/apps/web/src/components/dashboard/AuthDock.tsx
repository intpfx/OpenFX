type AuthState = "checking" | "authenticated" | "unauthenticated";

interface Props {
  initialized: boolean;
  authState: AuthState;
  loginPassword: string;
  loginError: string | null;
  loginBusy: boolean;
  setupPassword: string;
  setupError: string | null;
  onSetupPasswordChange: (value: string) => void;
  onSubmitSetup: () => void | Promise<void>;
  onLoginPasswordChange: (value: string) => void;
  onSubmitLogin: () => void | Promise<void>;
}

export function AuthDock({
  initialized,
  authState,
  loginPassword,
  loginError,
  loginBusy,
  setupPassword,
  setupError,
  onSetupPasswordChange,
  onSubmitSetup,
  onLoginPasswordChange,
  onSubmitLogin,
}: Props) {
  const visible = !initialized || authState !== "authenticated";

  return (
    <section
      className={
        visible
          ? `auth-dock auth-dock--visible${!initialized ? " auth-dock--setup" : ""}`
          : "auth-dock"
      }
    >
      <div className="auth-dock__inner">
        <div>
          <p className="eyebrow">{initialized ? "Access" : "Setup"}</p>
          <h2>
            {!initialized
              ? "Initialize freemac"
              : authState === "checking"
                ? "Checking session"
                : "Unlock dashboard"}
          </h2>
          <p className="auth-copy">
            {!initialized
              ? "Set one local password, then expose TCP/24531 and connect the relay when needed."
              : "Sign in to unlock relay actions and agent planning."}
          </p>
        </div>

        {!initialized ? (
          <div className="auth-form auth-form--setup">
            <label>
              <span>Local Dashboard Password</span>
              <input
                type="password"
                value={setupPassword}
                onChange={(event) => onSetupPasswordChange(event.target.value)}
              />
            </label>
            {setupError && <p className="error-text">{setupError}</p>}
            <button className="button" onClick={() => void onSubmitSetup()}>
              Initialize
            </button>
          </div>
        ) : (
          <div className="auth-form">
            <label>
              <span>Local Dashboard Password</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => onLoginPasswordChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void onSubmitLogin();
                  }
                }}
              />
            </label>
            {loginError && <p className="error-text">{loginError}</p>}
            <button
              className="button"
              onClick={() => void onSubmitLogin()}
              disabled={loginBusy || authState === "checking"}
            >
              {loginBusy ? "Signing in..." : "Sign in"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
