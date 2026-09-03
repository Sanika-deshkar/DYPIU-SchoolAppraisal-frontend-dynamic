import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/client";
import { login, verifyOtp, resendOtp, requestPasswordReset } from "../../api/auth";
import { dashboardForRole, normalizeUserProfile, fetchCurrentAuditCycle } from "../../api/submissions";
import { InlineSpinner } from "../../features/schoolAppraisal/components/LoadingState";
import backgroundImage from "../../assets/images/dyp.jpeg";
import iqacLogo from "../../assets/images/IQAS.png";
import universityLogo from "../../assets/images/image.png";

const normalizeEmail = (value) => value.trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(location.state?.message || "");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loginSessionId, setLoginSessionId] = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timer, setTimer] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(30);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (!mfaRequired) return;

    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [mfaRequired]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const storeSessionAndNavigate = async (profile, email, authPayload = {}) => {
    const refreshToken =
      profile.refreshToken ||
      authPayload.refreshToken ||
      authPayload.data?.refreshToken ||
      authPayload.user?.refreshToken ||
      "";

    const setItem = (key, val) => {
      const str = val == null ? "" : String(val);
      sessionStorage.setItem(key, str);
      localStorage.setItem(key, str);
    };

    setItem("token", profile.token);
    if (refreshToken) {
      setItem("refreshToken", refreshToken);
    }
    setItem("userId", profile.id);
    setItem("email", profile.email || email);
    setItem("username", profile.email || email);
    setItem("name", profile.name);
    setItem("designation", profile.designation);
    setItem("school", profile.school);
    setItem("post", profile.post);
    setItem("administrativePosts", JSON.stringify(profile.administrativePosts || []));
    setItem("accountType", profile.accountType);
    setItem("category", profile.category);
    setItem("auditorType", profile.auditorType);
    setItem("auditorRole", profile.auditorRole);
    setItem("role", profile.role);
    setItem("universityId", profile.universityId || authPayload.universityId || authPayload.user?.universityId || "");
    setItem("universityCode", profile.universityCode || authPayload.universityCode || authPayload.user?.universityCode || "");
    setItem("universityName", profile.universityName || authPayload.universityName || authPayload.user?.universityName || "");
    try {
      const { data } = await fetchCurrentAuditCycle();
      const activeYear = data?.activeYear || data?.academicYear;
      if (activeYear) {
        setItem("academicYear", activeYear);
      } else if (profile.academicYear) {
        setItem("academicYear", profile.academicYear);
      }
    } catch {
      if (profile.academicYear) setItem("academicYear", profile.academicYear);
    }
    navigate(dashboardForRole(profile.role), { replace: true });
  };

  const handleLogin = async () => {
    const email = normalizeEmail(username);
    const pw = password.trim();

    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!pw) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await login(email, pw);

      if (data?.mfaRequired) {
        setMfaRequired(true);
        setLoginSessionId(data.loginSessionId);
        setTimer(data.expiresIn || 300);
        setResendCooldown(30);
        setOtpDigits(["", "", "", "", "", ""]);
        setMessage("Verification code sent to your email address.");
        setError("");
        setPassword("");
        return;
      }

      const profile = normalizeUserProfile(data);

      if (!profile.token || !profile.role) {
        throw new Error("Login response is missing token or role.");
      }

      storeSessionAndNavigate(profile, email, data);
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, "Invalid email address or password."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify) => {
    const code = codeToVerify || otpDigits.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setOtpLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await verifyOtp(loginSessionId, code);
      const profile = normalizeUserProfile(data);

      if (!profile.token || !profile.role) {
        throw new Error("Verification response is missing token or role.");
      }

      storeSessionAndNavigate(profile, username, data);
    } catch (verifyError) {
      setError(getApiErrorMessage(verifyError, "Invalid verification code."));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendLoading) return;

    setResendLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await resendOtp(loginSessionId);
      setResendCooldown(30);
      setTimer(data?.expiresIn || 300);
      setOtpDigits(["", "", "", "", "", ""]);
      setMessage(data?.message || "Verification code resent successfully.");
    } catch (resendError) {
      setError(getApiErrorMessage(resendError, "Could not resend verification code."));
    } finally {
      setResendLoading(false);
    }
  };

  const handleOtpDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join("");
    if (fullCode.length === 6) {
      handleVerifyOtp(fullCode);
    }
  };

  const handleOtpDigitKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "Enter") {
      handleVerifyOtp();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim().replace(/\D/g, "").slice(0, 6);
    if (!pastedData) return;

    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pastedData.length; i++) {
      newDigits[i] = pastedData[i];
    }
    setOtpDigits(newDigits);

    const focusIdx = Math.min(pastedData.length, 5);
    otpRefs.current[focusIdx]?.focus();

    if (pastedData.length === 6) {
      handleVerifyOtp(pastedData);
    }
  };

  const handleBackToLogin = () => {
    setMfaRequired(false);
    setLoginSessionId("");
    setError("");
    setMessage("");
    setOtpDigits(["", "", "", "", "", ""]);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") handleLogin();
  };

  const handleForgotPassword = async () => {
    const email = normalizeEmail(username);

    if (!email) {
      setError("Please enter your email above, then click Forgot password.");
      setMessage("");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      setMessage("");
      return;
    }

    setResetLoading(true);
    setError("");
    setMessage("");

    try {
      const { data } = await requestPasswordReset(email);
      setMessage(data?.message || "Password reset link sent. Please check your email.");
    } catch (resetError) {
      setError(getApiErrorMessage(resetError, "Could not send password reset link."));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; }

        .dyp-input {
          width: 100%;
          padding: 11px 14px;
          border: 1.5px solid rgba(255,255,255,0.55);
          border-radius: 4px;
          font-size: 14px;
          color: white;
          background: rgba(255,255,255,0.08);
          margin-bottom: 14px;
          font-family: inherit;
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }
        .dyp-input::placeholder { color: rgba(255,255,255,0.5); }
        .dyp-input:focus {
          border-color: white;
          box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
        }
        .dyp-btn {
          width: 100%;
          padding: 12px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.2s;
          margin-bottom: 12px;
          letter-spacing: 0.2px;
        }
        .dyp-btn:hover:not(:disabled) { background: #1d4ed8; }
        .dyp-btn:disabled { opacity: 0.72; cursor: not-allowed; }
        .dyp-forgot {
          background: none;
          border: none;
          font-size: 13px;
          color: rgba(255,255,255,0.75);
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          text-align: center;
          width: 100%;
          transition: color 0.2s;
        }
        .dyp-forgot:hover:not(:disabled) { color: white; text-decoration: underline; }
        .dyp-forgot:disabled { opacity: 0.65; }

        @media (max-width: 900px) {
          .school-login-card {
            width: min(100%, 520px) !important;
            flex-direction: column;
          }
          .school-login-left {
            padding: 120px 24px 24px !important;
          }
          .school-login-right {
            width: 100% !important;
            border-left: 0 !important;
            border-top: 1px solid rgba(255,255,255,0.15);
          }
          .school-login-logo {
            height: 72px !important;
          }
        }
      `}</style>

      <div style={s.wrap}>
        <img
          className="school-login-logo"
          src={universityLogo}
          alt="University Logo"
          style={s.topLeftLogo}
        />

        <img
          className="school-login-logo"
          src={iqacLogo}
          alt="IQAC Logo"
          style={s.topRightLogo}
        />

        <div style={s.overlay} />

        <div className="school-login-card" style={s.card}>
          <div className="school-login-left" style={s.left}>
            <h1 style={s.uniName}>Academic and Administrative Audit</h1>
            <h1 style={s.uniName}>
              D. Y. Patil International University, Akurdi, Pune, Maharashtra
            </h1>

            <p style={s.desc}>
              To create a vibrant learning environment fostering innovation,
              creativity, experiential learning, and research-driven academic
              excellence across all schools.
            </p>
          </div>

          <div className="school-login-right" style={s.right}>
            {!mfaRequired ? (
              <>
                <h2 style={s.panelTitle}>Welcome! Please login to continue.</h2>

                {error && <div style={s.error}>{error}</div>}
                {message && <div style={s.success}>{message}</div>}

                <input
                  className="dyp-input"
                  type="email"
                  placeholder="Enter email address"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="email"
                  maxLength={254}
                />

                <div style={{ position: "relative", marginBottom: 2 }}>
                  <input
                    className="dyp-input"
                    style={{ marginBottom: 0, paddingRight: 52 }}
                    type={showPw ? "text" : "password"}
                    placeholder="Enter password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    style={s.eyeBtn}
                    onClick={() => setShowPw((value) => !value)}
                    tabIndex={-1}
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>

                <div style={{ marginBottom: 16 }} />

                <button className="dyp-btn" type="button" onClick={handleLogin} disabled={loading} aria-busy={loading}>
                  {loading && <InlineSpinner label="Signing in" />}
                  {loading ? "Signing in..." : "Login"}
                </button>

                <button
                  className="dyp-forgot"
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  aria-busy={resetLoading}
                >
                  {resetLoading && <InlineSpinner label="Sending reset link" />}
                  {resetLoading ? "Sending reset link..." : "Forgot password?"}
                </button>
              </>
            ) : (
              <>
                <h2 style={s.panelTitle}>Verify your identity</h2>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: -14, marginBottom: 18, lineHeight: 1.4 }}>
                  Enter the 6-digit code sent to: <strong>{username}</strong>
                </p>

                {error && <div style={s.error}>{error}</div>}
                {message && <div style={s.success}>{message}</div>}

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    justifyContent: "center",
                    marginBottom: 16
                  }}
                  onPaste={handleOtpPaste}
                >
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (otpRefs.current[idx] = el)}
                      className="dyp-input"
                      style={{
                        width: 38,
                        height: 44,
                        textAlign: "center",
                        fontSize: 18,
                        fontWeight: "bold",
                        marginBottom: 0,
                        padding: 0
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpDigitKeyDown(idx, e)}
                      disabled={otpLoading || timer === 0}
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                  <span>{timer > 0 ? `Expires in ${formatTime(timer)}` : "Code expired"}</span>
                  <button
                    type="button"
                    className="dyp-forgot"
                    style={{ width: "auto", fontSize: 12, color: resendCooldown > 0 ? "rgba(255,255,255,0.4)" : "#60a5fa" }}
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0 || resendLoading}
                  >
                    {resendLoading ? "Resending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                  </button>
                </div>

                <button
                  className="dyp-btn"
                  type="button"
                  onClick={() => handleVerifyOtp()}
                  disabled={otpLoading || otpDigits.join("").length !== 6 || timer === 0}
                  aria-busy={otpLoading}
                >
                  {otpLoading && <InlineSpinner label="Verifying code" />}
                  {otpLoading ? "Verifying..." : "Verify Code"}
                </button>

                <button
                  className="dyp-forgot"
                  type="button"
                  onClick={handleBackToLogin}
                  disabled={otpLoading}
                >
                  Back to Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const s = {
  topLeftLogo: {
    position: "absolute",
    top: 20,
    left: 20,
    height: 100,
    zIndex: 2,
  },

  topRightLogo: {
    position: "absolute",
    top: 20,
    right: 20,
    height: 100,
    zIndex: 2,
  },

  wrap: {
    minHeight: "100vh",
    width: "100%",
    backgroundImage: `url(${backgroundImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    position: "relative",
  },

  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(8, 16, 38, 0.30)",
    pointerEvents: "none",
  },

  card: {
    position: "relative",
    zIndex: 1,
    width: "65%",
    maxWidth: 1280,
    display: "flex",
    alignItems: "stretch",
    borderRadius: 8,
    background: "rgba(15, 25, 50, 0.72)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    overflow: "hidden",
    minHeight: 260,
  },

  left: {
    flex: 1,
    color: "white",
    padding: "24px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    justifyContent: "center",
  },

  uniName: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.3,
    color: "white",
  },

  desc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.8,
    margin: 0,
    maxWidth: 500,
  },

  right: {
    width: 320,
    flexShrink: 0,
    background: "transparent",
    borderLeft: "1px solid rgba(255,255,255,0.15)",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  panelTitle: {
    fontSize: 15.5,
    fontWeight: 700,
    color: "white",
    marginBottom: 22,
    marginTop: 0,
    lineHeight: 1.45,
  },

  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    padding: 4,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 1,
  },

  error: {
    background: "rgba(185,28,28,0.25)",
    border: "1px solid rgba(252,165,165,0.5)",
    color: "#fca5a5",
    padding: "9px 12px",
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 1.5,
  },

  success: {
    background: "rgba(21,128,61,0.25)",
    border: "1px solid rgba(134,239,172,0.5)",
    color: "#86efac",
    padding: "9px 12px",
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 1.5,
  },
};
