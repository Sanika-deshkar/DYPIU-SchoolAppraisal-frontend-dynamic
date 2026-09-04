import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuditForm from "../../features/schoolAppraisal/components/AuditForm";
import AppSidebar from "../../features/schoolAppraisal/components/AppSidebar";
import UserProfileModal from "../../features/schoolAppraisal/components/UserProfileModal";
import { scrollPageToTop } from "../../utils/scrollToTop";
import { fetchCurrentAuditCycle } from "../../api/submissions";
import { fetchCurrentUser } from "../../api/users";
import { clearAuthState } from "../../api/client";
import { fetchActiveSchema, fetchUniversityBranding } from "../../api/config";

const compactYear = (str = "") => {
  const match = String(str).match(/(\d{4})\D+(\d{2,4})/);
  if (!match) return "2025-26";
  const start = match[1];
  const end = match[2].slice(-2);
  return `${start}-${end}`;
};

export default function DirectorDashboard() {
  const navigate = useNavigate();
  const [academicYear, setAcademicYear] = useState(
    sessionStorage.getItem("academicYear") ? compactYear(sessionStorage.getItem("academicYear")) : "2025-26"
  );
  const [activeAcademicYear, setActiveAcademicYear] = useState("");
  const [availableYears, setAvailableYears] = useState(["2025-26", "2026-27"]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileOverrides, setProfileOverrides] = useState({});
  const [accountAvatarUrl, setAccountAvatarUrl] = useState("");
  const [schema, setSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [reportMode, setReportMode] = useState(false);
  const [universityInfo, setUniversityInfo] = useState(null);

  // Fetch University Branding
  useEffect(() => {
    let isActive = true;
    const universityCode = sessionStorage.getItem("universityCode") || localStorage.getItem("universityCode") || "dypiu";
    fetchUniversityBranding(universityCode)
      .then((data) => {
        if (isActive && data) setUniversityInfo(data);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, []);

  // Fetch Current User
  useEffect(() => {
    let isActive = true;
    fetchCurrentUser()
      .then(({ data }) => {
        if (!isActive) return;
        const remote = data?.data || data || {};
        if (remote.avatarUrl) setAccountAvatarUrl(remote.avatarUrl);
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, []);

  // Fetch Dynamic Active Schema for School & University
  useEffect(() => {
    let isActive = true;
    const loadDynamicSchema = async () => {
      setSchemaLoading(true);
      try {
        const universityCode = sessionStorage.getItem("universityCode") || localStorage.getItem("universityCode") || "dypiu";
        const userSchool = sessionStorage.getItem("userSchool") || sessionStorage.getItem("school") || "";
        const dynamicSchema = await fetchActiveSchema("academic", universityCode, userSchool);
        if (!isActive) return;

        if (dynamicSchema && Array.isArray(dynamicSchema.sections) && dynamicSchema.sections.length > 0) {
          const normalizedSections = dynamicSchema.sections.map((sec) => ({
            ...sec,
            id: sec.idString || sec.id || sec.sectionKey,
            sectionKey: sec.sectionKey || sec.idString || String(sec.id),
          }));
          const normalizedSchema = {
            ...dynamicSchema,
            sections: normalizedSections,
          };
          setSchema(normalizedSchema);
          setActiveSectionId(normalizedSections[0].id);
        } else {
          setSchema(null);
          setActiveSectionId("");
        }
      } catch (err) {
        console.warn("No active dynamic schema available for director:", err);
        if (isActive) {
          setSchema(null);
          setActiveSectionId("");
        }
      } finally {
        if (isActive) setSchemaLoading(false);
      }
    };

    loadDynamicSchema();
    return () => {
      isActive = false;
    };
  }, [academicYear]);

  useEffect(() => {
    let isActive = true;
    const loadCycles = async () => {
      try {
        const { data } = await fetchCurrentAuditCycle();
        if (!isActive) return;
        const activeLabel = data.activeYear || "2025-2026";
        const activeFormatted = compactYear(activeLabel);
        setActiveAcademicYear(activeFormatted);

        const rawYears = data.availableYears || [activeLabel];
        const formatted = Array.from(new Set(rawYears.map(compactYear))).sort();
        setAvailableYears(formatted);

        const stored = sessionStorage.getItem("academicYear");
        const selected = stored ? compactYear(stored) : activeFormatted;
        setAcademicYear(selected);
        sessionStorage.setItem("academicYear", selected);
      } catch {
        // Fallback to initial
      }
    };
    loadCycles();
    return () => {
      isActive = false;
    };
  }, []);

  const isHistoricalYear = Boolean(activeAcademicYear && compactYear(academicYear) !== compactYear(activeAcademicYear));

  const profile = {
    id: sessionStorage.getItem("userId") || "",
    name: sessionStorage.getItem("name") || "Director of Schools",
    designation: sessionStorage.getItem("designation") || "Director",
    school: sessionStorage.getItem("school") || "School",
    email: sessionStorage.getItem("email") || sessionStorage.getItem("username") || "",
    avatarUrl: accountAvatarUrl,
    ...profileOverrides,
  };

  const handleLogout = () => {
    clearAuthState();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <PrintStyles />
      <div className="academic-audit-shell" style={styles.shell}>
      <AppSidebar
        title="School Appraisal"
        subtitle={universityInfo?.universityName || "University Appraisal"}
        roleTitle="Academic Audit"
        roleText="Director of Schools"
        academicYear={academicYear}
        currentAcademicYear={activeAcademicYear}
        availableYears={availableYears}
        onYearChange={(newYear) => {
          sessionStorage.setItem("academicYear", newYear);
          setAcademicYear(newYear);
        }}
        items={schema?.sections || []}
        activeId={activeSectionId}
        onChange={(sectionId) => {
          setReportMode(false);
          setActiveSectionId(sectionId);
          scrollPageToTop();
        }}
        profile={profile}
        onLogout={() => setShowLogoutModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      <main className="academic-audit-main" style={styles.page}>
        {schemaLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}></div>
            <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 600 }}>Loading Appraisal Form...</p>
          </div>
        ) : !schema || !schema.sections || schema.sections.length === 0 ? (
          <div style={{ padding: "40px 24px", maxWidth: "820px", margin: "40px auto" }}>
            <div style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "48px 36px",
              textAlign: "center",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)"
            }}>
              <div style={{ fontSize: "56px", marginBottom: "16px" }}>📋</div>
              <h2 style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>
                No Active Appraisal Form Published
              </h2>
              <p style={{ color: "#64748b", fontSize: "15px", lineHeight: "1.6", maxWidth: "580px", margin: "0 auto 24px" }}>
                IQAC has not yet published an appraisal form for <strong>{profile.school || "your school/department"}</strong> for Academic Year <strong>{academicYear}</strong>.
              </p>
              <div style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "10px",
                padding: "16px 20px",
                textAlign: "left",
                color: "#166534",
                fontSize: "14px",
                display: "inline-block"
              }}>
                <strong>💡 What happens next?</strong>
                <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                  <li>IQAC creates and designs the appraisal sections and tables in <strong>Appraisal Form Studio</strong>.</li>
                  <li>Once IQAC clicks <strong>🚀 Publish Version</strong>, your form will instantly become available here for data entry and submission.</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <AuditForm
            schema={schema}
            academicYear={academicYear}
            activeAcademicYear={activeAcademicYear}
            isHistoricalYear={isHistoricalYear}
            activeSectionId={activeSectionId}
            reportMode={reportMode}
            onReportModeChange={setReportMode}
            onSectionChange={setActiveSectionId}
          />
        )}
      </main>

      {showLogoutModal && <LogoutModal onCancel={() => setShowLogoutModal(false)} onConfirm={handleLogout} />}
      {showProfileModal && (
        <UserProfileModal
          profile={profile}
          onClose={() => setShowProfileModal(false)}
          onSaved={(updates) => {
            if (updates.name) sessionStorage.setItem("name", updates.name);
            if (updates.email) sessionStorage.setItem("email", updates.email);
            setProfileOverrides((prev) => ({ ...prev, ...updates }));
          }}
        />
      )}
    </div>
    </>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @media (max-width: 900px) {
        .academic-audit-shell { flex-direction: column; }
        .academic-audit-main { padding: 18px !important; }
      }
      @media print {
        .app-sidebar,
        .academic-report-actions {
          display: none !important;
        }
        .academic-audit-shell {
          display: block !important;
          background: #fff !important;
        }
        .academic-audit-main {
          padding: 0 !important;
          overflow: visible !important;
        }
        body {
          background: #fff !important;
        }
      }
    `}</style>
  );
}

function LogoutModal({ onCancel, onConfirm }) {
  return (
    <div style={styles.modalBackdrop} onClick={onCancel}>
      <div style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalTitle}>Confirm Logout</div>
        <div style={styles.modalText}>You are about to leave School Appraisal. Any unsaved edits will be lost.</div>
        <div style={styles.modalActions}>
          <button type="button" onClick={onCancel} style={styles.cancelButton}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={styles.confirmButton}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    background: "#f5f7fb",
    color: "#0f172a",
    fontFamily: "Inter, 'Segoe UI', sans-serif",
  },
  sidebar: {
    width: 264,
    height: "100vh",
    position: "sticky",
    top: 0,
    flexShrink: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    padding: "22px 16px",
    gap: 12,
    color: "#e2e8f0",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "2px 0 16px rgba(15,23,42,0.14)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
  },
  brandTitle: {
    color: "#f8fafc",
    fontWeight: 800,
    fontSize: 14,
  },
  brandSub: {
    color: "#94a3b8",
    fontSize: 14,
    marginTop: 2,
    lineHeight: 1.3,
  },
  roleCard: {
    background: "#1d4ed8",
    borderRadius: 12,
    padding: "11px 12px",
    fontSize: 14,
    color: "#bfdbfe",
  },
  roleTitle: {
    fontWeight: 800,
    marginBottom: 2,
    color: "#fff",
  },
  roleText: {
    color: "#dbeafe",
    fontSize: 14,
  },
  roleYear: {
    color: "#bfdbfe",
    fontSize: 14,
    marginTop: 6,
    fontWeight: 800,
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.08)",
  },
  navCard: {
    background: "#1e293b",
    borderRadius: 10,
    padding: "12px",
  },
  navLabel: {
    display: "block",
    color: "#94a3b8",
    fontWeight: 800,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  navSelect: {
    width: "100%",
    border: "1px solid #334155",
    borderRadius: 8,
    background: "#0f172a",
    color: "#e2e8f0",
    padding: "9px 10px",
    fontSize: 14,
    fontWeight: 700,
    outline: "none",
  },
  queryCard: {
    margin: "8px 0",
    padding: "10px 12px",
    background: "rgba(37,99,235,0.15)",
    border: "1px solid #2563eb",
    borderRadius: 8,
  },
  queryLabel: {
    color: "#94a3b8",
    fontWeight: 700,
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  queryLink: {
    color: "#60a5fa",
    fontWeight: 600,
    fontSize: 14,
    wordBreak: "break-all",
    textDecoration: "none",
  },
  spacer: {
    flex: 1,
  },
  profileBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingTop: 12,
    borderTop: "1px solid #1e293b",
  },
  profileRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: "#2563eb",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 14,
    flexShrink: 0,
  },
  profileText: {
    minWidth: 0,
  },
  profileName: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  profileMeta: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 2,
    overflowWrap: "anywhere",
  },
  logoutButton: {
    width: "100%",
    border: "1px solid #374151",
    borderRadius: 8,
    background: "transparent",
    color: "#f87171",
    padding: "9px 11px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
    fontFamily: "inherit",
  },
  page: {
    minHeight: "100vh",
    flex: 1,
    background: "#f5f7fb",
    padding: "28px 30px 40px",
    overflowX: "auto",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
  },
  modal: {
    width: "min(380px, 92vw)",
    background: "#fff",
    borderRadius: 12,
    padding: "26px 28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  modalTitle: {
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 18,
    marginBottom: 8,
  },
  modalText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 18,
  },
  modalActions: {
    display: "flex",
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    border: "none",
    borderRadius: 8,
    background: "#f1f5f9",
    color: "#475569",
    padding: 10,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  confirmButton: {
    flex: 1,
    border: "none",
    borderRadius: 8,
    background: "#dc2626",
    color: "#fff",
    padding: 10,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
