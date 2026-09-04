import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getApiErrorMessage } from "../../../api/client";
import { createUser, deleteUser, fetchUsers, updateUser } from "../../../api/users";
import { getAttachmentUrl } from "../../../utils/attachment";
import { formatDateDDMMYYYY } from "../../../utils/dateFormat";
import { LoadingState } from "../components/LoadingState";
import { getUniversitySchools, getUniversityPosts } from "../formStudio/formStudioApi";
import {
  ADMINISTRATIVE_POSTS,
  SCHOOL_OPTIONS,
  canonicalSchoolCode,
  forgetAcademicAuditorSchools,
  getStoredAcademicAuditorSchools,
  normalizeAcademicSchoolCodes,
  rememberAcademicAuditorSchools,
} from "./userManagementConfig";

const emptyForm = {
  accountType: "user",
  category: "",
  auditorType: "",
  school: "",
  schools: [],
  post: "",
  administrativePosts: [],
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const normalizeList = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.users)) return data.users;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const normalizePostList = (value) => {
  if (Array.isArray(value)) return [...new Set(value.filter(Boolean))];
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return [...new Set(parsed.filter(Boolean))];
    } catch {
      return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
    }
  }
  return [];
};
const normalizeSchoolList = (value) => {
  const values = normalizeAcademicSchoolCodes(value);
  return [...new Set(values)];
};
const mergeSchoolLists = (...values) => [...new Set(values.flatMap(normalizeSchoolList))];

const normalizeUser = (user = {}, index = 0) => {
  const role = String(user.role || "").toLowerCase().replaceAll("_", "-");
  const accountType = String(user.accountType || user.userType || user.type || (role.includes("auditor") ? "auditor" : "user")).toLowerCase().replaceAll("_", "-");
  const auditorType = String(user.auditorType || user.auditorCategory || (
    role.includes("external")
      ? "external"
      : role.includes("internal")
        ? "internal"
        : ""
  )).toLowerCase().replaceAll("_", "-");
  const category = user.category || (
    role.includes("academic")
      ? "academic"
      : role.includes("administrative")
        ? "administrative"
        : role === "director"
      ? "academic"
      : role === "administrative"
        ? "administrative"
        : "authority"
  );
  const designation = user.designation || user.post || "";
  const administrativePosts = [
    user.administrativePosts,
    user.assignedPosts,
    user.posts,
  ].map(normalizePostList).find((posts) => posts.length) || [];
  const resolvedAdministrativePosts = accountType === "auditor" && category === "administrative"
    ? (administrativePosts.length ? administrativePosts : normalizePostList(user.post))
    : [];
  const apiAcademicSchools = category === "academic"
    ? mergeSchoolLists(
        user.schools,
        user.assignedSchools,
        user.academicSchools,
        user.schoolCodes,
        user.assignedSchoolCodes,
        user.academicSchoolCodes,
        user.school,
        user.schoolName,
        user.assignment,
      )
    : [];
  const cachedAcademicSchools = accountType === "auditor" && category === "academic"
    ? getStoredAcademicAuditorSchools(user)
    : [];
  const academicSchools = mergeSchoolLists(apiAcademicSchools, cachedAcademicSchools);

  return {
    ...user,
    id: user.id || user.userId || user.email || `user-${index}`,
    name: user.name || user.fullName || "-",
    email: user.email || user.username || "-",
    accountType,
    auditorType,
    category,
    schools: academicSchools,
    school: academicSchools[0] || "",
    administrativePosts: resolvedAdministrativePosts,
    role: accountType === "auditor"
      ? (user.auditorRole || `${category}-${auditorType || "internal"}-auditor`)
      : (role || (category === "academic" ? "director" : "administrative")),
    assignment: category === "academic"
      ? (academicSchools.length ? academicSchools.join(", ") : (user.school || user.schoolName || "-"))
      : resolvedAdministrativePosts.length
        ? resolvedAdministrativePosts.map(postLabelFor).join(", ")
        : (designation || "-"),
    deleted: Boolean(user.deleted),
    status: String(user.status || (user.deleted ? "deleted" : user.active === false ? "inactive" : "active")).toLowerCase(),
  };
};

const postLabelFor = (value) => ADMINISTRATIVE_POSTS.find((post) => post.value === value)?.label || value;
const titleCase = (value = "") => String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const auditorRoleForForm = (form) => `${form.category}-${form.auditorType}-auditor`;
const roleForForm = (form) => form.accountType === "auditor"
  ? auditorRoleForForm(form)
  : form.category === "academic"
    ? "director"
    : "administrative";
const designationForForm = (form) => {
  if (form.accountType === "auditor") return `${titleCase(form.auditorType)} ${titleCase(form.category)} Auditor`;
  return form.category === "academic" ? "Director" : postLabelFor(form.post);
};
const academicAssignmentPayload = (schools = [], isAuditor = false) => {
  const academicSchools = normalizeSchoolList(schools);
  const schoolValue = isAuditor ? academicSchools.join(", ") : academicSchools[0] || "";

  return {
    school: schoolValue,
    schoolName: schoolValue,
    assignment: schoolValue,
    schoolCode: isAuditor ? "" : academicSchools[0] || "",
    schools: isAuditor ? academicSchools : [],
    assignedSchools: isAuditor ? academicSchools : [],
    academicSchools: isAuditor ? academicSchools : [],
    schoolCodes: isAuditor ? academicSchools : [],
    assignedSchoolCodes: isAuditor ? academicSchools : [],
    academicSchoolCodes: isAuditor ? academicSchools : [],
  };
};

const formatDate = (date = new Date()) => formatDateDDMMYYYY(date);

function validate(form) {
  const errors = {};
  if (!form.category) errors.category = "Select Academic or Administrative.";
  if (form.accountType === "auditor" && !form.auditorType) errors.auditorType = "Select Internal or External auditor.";
  if (form.category === "academic" && form.accountType === "auditor" && !form.schools.length) errors.schools = "Select at least one school.";
  if (form.category === "academic" && form.accountType !== "auditor" && !canonicalSchoolCode(form.school)) errors.school = "Select a valid school.";
  if (
    form.category === "administrative" &&
    form.accountType === "auditor" &&
    !form.administrativePosts.length
  ) errors.administrativePosts = "Select at least one administrative post.";
  if (form.category === "administrative" && form.accountType !== "auditor" && !form.post) errors.post = "Select an administrative post.";
  if (!form.name.trim()) errors.name = "Enter the user's name.";
  if (!form.email.trim()) errors.email = "Enter an email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (!form.password) errors.password = "Enter a password.";
  else if (form.password.length < 6) errors.password = "Password must contain at least 6 characters.";
  if (!form.confirmPassword) errors.confirmPassword = "Confirm the password.";
  else if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

function validateEdit(form) {
  const errors = {};
  if (!form.category) errors.category = "Select Academic or Administrative.";
  if (form.accountType === "auditor" && !form.auditorType) errors.auditorType = "Select Internal or External auditor.";
  if (form.category === "academic" && form.accountType === "auditor" && !form.schools.length) errors.schools = "Select at least one school.";
  if (form.category === "academic" && form.accountType !== "auditor" && !canonicalSchoolCode(form.school)) errors.school = "Select a valid school.";
  if (
    form.category === "administrative" &&
    form.accountType === "auditor" &&
    !form.administrativePosts.length
  ) errors.administrativePosts = "Select at least one administrative post.";
  if (form.category === "administrative" && form.accountType !== "auditor" && !form.post) errors.post = "Select an administrative post.";
  if (!form.name.trim()) errors.name = "Enter the user's name.";
  if (!form.email.trim()) errors.email = "Enter an email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (form.password && form.password.length < 6) errors.password = "Password must contain at least 6 characters.";
  if (form.password && form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

const editFormFromUser = (user = {}) => {
  const isAuditor = user.accountType === "auditor";
  const isAcademic = user.category === "academic";
  const isAdministrative = user.category === "administrative";
  const currentSchools = isAuditor && isAcademic
    ? (user.schools?.length ? user.schools : getStoredAcademicAuditorSchools(user))
    : [];

  return {
    accountType: user.accountType || "user",
    category: user.category || "",
    auditorType: user.auditorType || "",
    auditorRole: user.auditorRole || "",
    role: user.role || "",
    school: !isAuditor && isAcademic ? user.school || "" : "",
    schools: currentSchools,
    designation: user.designation || "",
    post: !isAuditor && isAdministrative ? user.post || "" : "",
    administrativePosts: !isAcademic && isAuditor ? user.administrativePosts || [] : [],
    name: user.name || "",
    email: user.email || "",
    password: "",
    confirmPassword: "",
  };
};

const canDeleteUser = (user = {}) => user.accountType === "auditor" && !user.deleted;

export default function UserManagementPanel({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [posts, setPosts] = useState(ADMINISTRATIVE_POSTS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("");
  const [loadNotice, setLoadNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErrors, setEditErrors] = useState({});
  const [updatingId, setUpdatingId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [avatarPreviewUser, setAvatarPreviewUser] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const fetchUniversityMetadata = async () => {
    const uId = currentUser?.universityId || sessionStorage.getItem("universityId") || 1;
    try {
      const [schoolData, postData] = await Promise.all([
        getUniversitySchools(uId),
        getUniversityPosts(uId),
      ]);
      setSchools(schoolData || []);
      if (postData && postData.length > 0) {
        setPosts(postData.map((p) => ({ value: p.code.toLowerCase(), label: p.name })));
      }
    } catch (err) {
      console.error("Failed to load university metadata:", err);
    }
  };

  useEffect(() => {
    fetchUniversityMetadata();
  }, [currentUser?.universityId]);
  const filteredUsers = useMemo(() =>
    users.filter((user) =>
      (categoryFilter === "all" || user.category === categoryFilter) &&
      (
        accountFilter === "all" ||
        user.accountType === accountFilter ||
        (accountFilter === "internal-auditor" && user.accountType === "auditor" && user.auditorType === "internal") ||
        (accountFilter === "external-auditor" && user.accountType === "auditor" && user.auditorType === "external")
      )
    ), [accountFilter, categoryFilter, users]);
  const userStats = useMemo(() => ({
    total: users.length,
    academic: users.filter((user) => user.category === "academic").length,
    administrative: users.filter((user) => user.category === "administrative").length,
    auditors: users.filter((user) => user.accountType === "auditor").length,
    active: users.filter((user) => user.status === "active").length,
    deleted: users.filter((user) => user.deleted).length,
  }), [users]);

  useEffect(() => {
    let isActive = true;

    const loadUsers = async () => {
      setLoading(true);
      setLoadNotice("");

      try {
        const { data } = await fetchUsers({ includeDeleted: showDeleted });
        const list = normalizeList(data).map(normalizeUser);
        const filteredByTenant = (currentUser?.universityId || currentUser?.universityCode)
          ? list.filter((u) => {
              if (currentUser.universityId && u.universityId) {
                return String(u.universityId) === String(currentUser.universityId);
              }
              if (currentUser.universityCode && u.universityCode) {
                return u.universityCode.toLowerCase() === currentUser.universityCode.toLowerCase();
              }
              return true;
            })
          : list;
        if (isActive) setUsers(filteredByTenant);
      } catch (error) {
        if (isActive) {
          setUsers([]);
          setLoadNotice(getApiErrorMessage(error, "User API is not connected yet. The backend should provide GET /api/users."));
        }
      } finally {
        if (isActive) setLoading(false);
      }
    };

    loadUsers();
    return () => {
      isActive = false;
    };
  }, [showDeleted]);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "accountType" ? { category: "", auditorType: "", school: "", schools: [], post: "", administrativePosts: [] } : {}),
      ...(field === "category" ? { school: "", schools: [], post: "", administrativePosts: [] } : {}),
    }));
    setErrors((current) => ({
      ...current,
      [field]: "",
      ...(field === "accountType" ? { category: "", auditorType: "", school: "", schools: "", post: "", administrativePosts: "" } : {}),
      ...(field === "category" ? { school: "", schools: "", post: "", administrativePosts: "" } : {}),
    }));
    setStatus("");
  };

  const toggleAcademicSchool = (school) => {
    setForm((current) => ({
      ...current,
      schools: current.schools.includes(school)
        ? current.schools.filter((item) => item !== school)
        : [...current.schools, school],
    }));
    setErrors((current) => ({ ...current, schools: "" }));
    setStatus("");
  };

  const toggleAdministrativePost = (post) => {
    setForm((current) => ({
      ...current,
      administrativePosts: current.administrativePosts.includes(post)
        ? current.administrativePosts.filter((item) => item !== post)
        : [...current.administrativePosts, post],
    }));
    setErrors((current) => ({ ...current, administrativePosts: "" }));
    setStatus("");
  };

  const openCreateForm = (accountType) => {
    setForm({ ...emptyForm, accountType });
    setErrors({});
    setStatus("");
    setShowForm(true);
    fetchUniversityMetadata();
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(emptyForm);
    setErrors({});
    setStatus("");
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const isAcademic = form.category === "academic";
    const academicSchools = isAcademic && form.accountType === "auditor"
      ? form.schools
      : [canonicalSchoolCode(form.school)].filter(Boolean);
    const assignmentPayload = isAcademic
      ? academicAssignmentPayload(academicSchools, form.accountType === "auditor")
      : { school: "Administrative Office", schoolName: "Administrative Office", schools: [] };
    const payload = {
      accountType: form.accountType,
      userType: form.accountType,
      category: form.category,
      auditCategory: form.category,
      auditorType: form.accountType === "auditor" ? form.auditorType : null,
      auditorRole: form.accountType === "auditor" ? auditorRoleForForm(form) : null,
      role: roleForForm(form),
      ...assignmentPayload,
      designation: designationForForm(form),
      post: isAcademic
        ? null
        : form.accountType === "auditor"
          ? form.administrativePosts[0] || null
          : form.post,
      administrativePosts: !isAcademic && form.accountType === "auditor" ? form.administrativePosts : [],
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      universityId: currentUser?.universityId || undefined,
      universityCode: currentUser?.universityCode || undefined,
    };

    setCreating(true);
    setStatus("");

    try {
      const { data } = await createUser(payload);
      const created = data?.data?.user || data?.user || data?.data || data || payload;
      if (payload.accountType === "auditor" && payload.category === "academic") {
        rememberAcademicAuditorSchools({ ...payload, ...created }, academicSchools);
      } else {
        forgetAcademicAuditorSchools({ ...payload, ...created });
      }
      setUsers((current) => [normalizeUser({ ...payload, ...created }), ...current]);
      setStatus(`${form.accountType === "auditor" ? "Auditor" : "User"} account created successfully.`);
      setForm(emptyForm);
      setErrors({});
      setShowForm(false);
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not create the user. The backend should provide POST /api/users."));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (user) => {
    setEditTarget(user);
    setEditForm(editFormFromUser(user));
    setEditErrors({});
    setStatus("");
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditForm(emptyForm);
    setEditErrors({});
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "accountType" ? { category: "", auditorType: "", school: "", schools: [], post: "", administrativePosts: [] } : {}),
      ...(field === "category" ? { school: "", schools: [], post: "", administrativePosts: [] } : {}),
      ...(field === "password" && !value ? { confirmPassword: "" } : {}),
    }));
    setEditErrors((current) => ({
      ...current,
      [field]: "",
      ...(field === "accountType" ? { category: "", auditorType: "", school: "", schools: "", post: "", administrativePosts: "" } : {}),
      ...(field === "category" ? { school: "", schools: "", post: "", administrativePosts: "" } : {}),
    }));
    setStatus("");
  };

  const toggleEditAcademicSchool = (school) => {
    setEditForm((current) => ({
      ...current,
      schools: current.schools.includes(school)
        ? current.schools.filter((item) => item !== school)
        : [...current.schools, school],
    }));
    setEditErrors((current) => ({ ...current, schools: "" }));
    setStatus("");
  };

  const toggleEditAdministrativePost = (post) => {
    setEditForm((current) => ({
      ...current,
      administrativePosts: current.administrativePosts.includes(post)
        ? current.administrativePosts.filter((item) => item !== post)
        : [...current.administrativePosts, post],
    }));
    setEditErrors((current) => ({ ...current, administrativePosts: "" }));
    setStatus("");
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    if (!canDeleteUser(deleteTarget)) {
      setDeleteTarget(null);
      setStatus("Only auditor accounts can be deleted.");
      return;
    }

    setDeletingId(deleteTarget.id);
    setStatus("");

    try {
      await deleteUser(deleteTarget.id);
      forgetAcademicAuditorSchools(deleteTarget);
      setUsers((current) => current.filter((user) => user.id !== deleteTarget.id));
      setStatus(`${deleteTarget.name} deleted successfully.`);
      setDeleteTarget(null);
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not delete the user. The backend should provide DELETE /api/users/:id."));
    } finally {
      setDeletingId("");
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!editTarget?.id) return;

    const nextErrors = validateEdit(editForm);
    setEditErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const isAcademic = editForm.category === "academic";
    const academicSchools = isAcademic && editForm.accountType === "auditor"
      ? editForm.schools
      : [canonicalSchoolCode(editForm.school)].filter(Boolean);
    const assignmentPayload = isAcademic
      ? academicAssignmentPayload(academicSchools, editForm.accountType === "auditor")
      : { school: "Administrative Office", schoolName: "Administrative Office", schools: [] };
    const payload = {
      accountType: editForm.accountType,
      userType: editForm.accountType,
      category: editForm.category,
      auditCategory: editForm.category,
      auditorType: editForm.accountType === "auditor" ? editForm.auditorType : null,
      auditorRole: editForm.accountType === "auditor" ? auditorRoleForForm(editForm) : null,
      role: roleForForm(editForm),
      ...assignmentPayload,
      designation: designationForForm(editForm),
      post: isAcademic
        ? null
        : editForm.accountType === "auditor"
          ? editForm.administrativePosts[0] || null
          : editForm.post,
      administrativePosts: !isAcademic && editForm.accountType === "auditor" ? editForm.administrativePosts : [],
      name: editForm.name.trim(),
      email: editForm.email.trim().toLowerCase(),
      ...(editForm.password ? { password: editForm.password } : {}),
    };

    setUpdatingId(editTarget.id);
    setStatus("");

    try {
      const { data } = await updateUser(editTarget.id, payload);
      const updated = data?.data?.user || data?.user || data?.data || data || payload;
      if (payload.accountType === "auditor" && payload.category === "academic") {
        rememberAcademicAuditorSchools({ ...editTarget, ...payload, ...updated }, academicSchools);
      } else {
        forgetAcademicAuditorSchools({ ...editTarget, ...payload, ...updated });
      }
      setUsers((current) =>
        current.map((user) => user.id === editTarget.id ? normalizeUser({ ...user, ...payload, ...updated }) : user)
      );
      setStatus(`${payload.name} updated successfully.`);
      closeEdit();
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Could not update the user. The backend should provide PUT /api/users/:id."));
    } finally {
      setUpdatingId("");
    }
  };

  const handlePrintUsers = () => {
    window.setTimeout(() => window.print(), 80);
  };
  const resetFilters = () => {
    setCategoryFilter("all");
    setAccountFilter("all");
  };

  return (
    <section style={styles.panel}>
      <div className="user-management-heading" style={styles.headingRow}>
        <div>
          <p style={styles.kicker}>IQAC access only</p>
          <h2 style={styles.title}>User Management</h2>
          <p style={styles.description}>View Academic, Administrative and auditor accounts or create a new account.</p>
        </div>
        <div style={styles.headingActions}>
          <button type="button" className="btn btn-secondary user-management-no-print" onClick={handlePrintUsers} disabled={loading || !users.length}>
            <span aria-hidden="true">⎙</span>
            Print Users
          </button>
          <button type="button" className="btn btn-primary user-management-no-print" onClick={() => showForm ? closeForm() : openCreateForm("user")}>
            {showForm ? "Close Form" : "+ Add New User"}
          </button>
        </div>
      </div>

      {showForm && (
        <form style={styles.formCard} onSubmit={handleCreate}>
          <div style={styles.formHeading}>
            <div>
              <h3 style={styles.formTitle}>Create {form.accountType === "auditor" ? "Auditor" : "User"} Credentials</h3>
              <span style={styles.formHint}>Fill assignment details first, then enter login credentials.</span>
            </div>
            <span style={form.accountType === "auditor" ? styles.auditorPill : styles.userPill}>
              {form.accountType === "auditor" ? "Auditor Account" : "Regular User"}
            </span>
          </div>

          <div style={styles.formSection}>
            <div style={styles.formSectionHeader}>
              <h4 style={styles.sectionTitle}>Assignment Details</h4>
              <span style={styles.sectionHint}>{form.accountType === "auditor" ? "Set audit category and auditor type." : "Set user category and assignment."}</span>
            </div>
            <div className="user-management-field-grid" style={styles.fieldGrid}>
              <Field label="Account Type">
                <select className="audit-control" style={styles.control} value={form.accountType} onChange={(event) => updateField("accountType", event.target.value)}>
                  <option value="user">Regular User</option>
                  <option value="auditor">Auditor</option>
                </select>
              </Field>

              <Field label={form.accountType === "auditor" ? "Audit Category" : "User Category"} error={errors.category}>
                <select className="audit-control" style={styles.control} value={form.category} onChange={(event) => updateField("category", event.target.value)}>
                  <option value="">Select category</option>
                  <option value="academic">Academic</option>
                  <option value="administrative">Administrative</option>
                </select>
              </Field>

              {form.accountType === "auditor" && (
                <Field label="Auditor Type" error={errors.auditorType}>
                  <select className="audit-control" style={styles.control} value={form.auditorType} onChange={(event) => updateField("auditorType", event.target.value)}>
                    <option value="">Select auditor type</option>
                    <option value="internal">Internal</option>
                    <option value="external">External</option>
                  </select>
                </Field>
              )}

              {form.category === "academic" && (
                <Field label={form.accountType === "auditor" ? "Schools" : "School"} error={form.accountType === "auditor" ? errors.schools : errors.school}>
                  {form.accountType === "auditor" ? (
                    <AcademicSchoolMultiSelect
                      selected={form.schools}
                      onToggle={toggleAcademicSchool}
                      schools={schools}
                    />
                  ) : (
                    <select className="audit-control" style={styles.control} value={form.school} onChange={(event) => updateField("school", event.target.value)}>
                      <option value="">{schools.length === 0 ? "-- No schools configured (Add in Form Studio) --" : "Select school"}</option>
                      {schools.map((school) => (
                        <option key={school.code} value={school.code.toUpperCase()}>
                          {school.name} ({school.code})
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}

              {form.category === "administrative" && (
                <Field
                  label={form.accountType === "auditor" ? "Administrative Posts" : "Administrative Post"}
                  error={form.accountType === "auditor" ? errors.administrativePosts : errors.post}
                >
                  {form.accountType === "auditor" ? (
                    <AdministrativePostMultiSelect
                      selected={form.administrativePosts}
                      onToggle={toggleAdministrativePost}
                      posts={posts}
                    />
                  ) : (
                    <select className="audit-control" style={styles.control} value={form.post} onChange={(event) => updateField("post", event.target.value)}>
                      <option value="">Select post</option>
                      {posts.map((post) => <option key={post.value} value={post.value}>{post.label}</option>)}
                    </select>
                  )}
                </Field>
              )}
            </div>
          </div>

          <div style={styles.formSection}>
            <div style={styles.formSectionHeader}>
              <h4 style={styles.sectionTitle}>Credential Details</h4>
              <span style={styles.sectionHint}>These details will be used for login.</span>
            </div>
            <div className="user-management-field-grid" style={styles.fieldGrid}>
              <Field label="Name" error={errors.name}>
                <input className="audit-control" style={styles.control} value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Enter full name" />
              </Field>

              <Field label="Email ID" error={errors.email}>
                <input className="audit-control" style={styles.control} type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="name@dypiu.ac.in" />
              </Field>

              <Field label="Password" error={errors.password}>
                <input className="audit-control" style={styles.control} type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="Minimum 6 characters" />
              </Field>

              <Field label="Confirm Password" error={errors.confirmPassword}>
                <input className="audit-control" style={styles.control} type="password" value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} placeholder="Re-enter password" />
              </Field>
            </div>
          </div>

          <div style={styles.formActions}>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={creating || !form.category || (form.accountType === "auditor" && !form.auditorType)}>
              {creating ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      )}

      {status && <div style={status.includes("successfully") ? styles.successNotice : styles.errorNotice}>{status}</div>}
      {loadNotice && <div style={styles.apiNotice}>{loadNotice}</div>}

      <div style={styles.tableCard}>
        <div style={styles.tableHeading}>
          <div>
            <h3 style={styles.formTitle}>All Users</h3>
            <p style={styles.tableSubtext}>Manage every Academic, Administrative, auditor and authority account from one place.</p>
          </div>
          <div style={styles.tableBadges}>
            <span style={styles.count}>{userStats.total} users</span>
            <span style={styles.count}>{userStats.auditors} auditors</span>
            {showDeleted && <span style={styles.count}>{userStats.deleted} deleted</span>}
            <span style={styles.printHint}>Print-ready report available</span>
          </div>
        </div>

        <div className="user-management-no-print" style={styles.filterBar}>
          <label style={styles.filterField}>
            <span style={styles.label}>Category</span>
            <select className="audit-control" style={styles.filterControl} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All Categories</option>
              <option value="academic">Academic</option>
              <option value="administrative">Administrative</option>
            </select>
          </label>
          <label style={styles.filterField}>
            <span style={styles.label}>Account</span>
            <select className="audit-control" style={styles.filterControl} value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value="all">All Accounts</option>
              <option value="user">Users</option>
              <option value="internal-auditor">Internal Auditors</option>
              <option value="external-auditor">External Auditors</option>
            </select>
          </label>
          <label style={styles.showDeletedField}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => setShowDeleted(event.target.checked)}
              style={styles.multiSelectCheckbox}
            />
            <span style={styles.label}>Show deleted accounts</span>
          </label>
          <button type="button" className="btn btn-secondary" onClick={resetFilters} disabled={categoryFilter === "all" && accountFilter === "all"}>
            Clear Filters
          </button>
        </div>

        <div style={styles.scroller}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["Name", "Email", "Account", "Category", "School / Post", "Role", "Status", "Action"].map((column) => (
                  <th key={column} style={styles.th}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={styles.emptyCell}><LoadingState label="Loading user accounts..." compact /></td></tr>
              ) : filteredUsers.length ? filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td style={styles.td}>
                    <div style={styles.nameCell}>
                      <UserAvatarButton user={user} onClick={() => setAvatarPreviewUser(user)} />
                      <strong>{user.name}</strong>
                    </div>
                  </td>
                  <td style={styles.td}>{user.email}</td>
                  <td style={{ ...styles.td, ...styles.centerCell }}>
                    <span style={user.accountType === "auditor" ? styles.auditorPill : styles.userPill}>
                      {user.accountType === "auditor" ? `${titleCase(user.auditorType)} Auditor` : "User"}
                    </span>
                  </td>
                  <td style={{ ...styles.td, ...styles.centerCell }}><span style={styles.categoryPill}>{user.category}</span></td>
                  <td style={styles.td}>{assignmentCellFor(user)}</td>
                  <td style={{ ...styles.td, ...styles.centerCell }}>{user.role}</td>
                  <td style={{ ...styles.td, ...styles.centerCell }}>
                    <span style={user.status === "active" ? styles.activeStatus : user.status === "deleted" ? styles.deletedStatus : styles.inactiveStatus}>{user.status}</span>
                  </td>
                  <td style={{ ...styles.td, ...styles.actionCell }}>
                    {user.deleted ? (
                      <span style={styles.readOnlyHint}>Read-only</span>
                    ) : (
                    <div style={styles.actionGroup}>
                      <button
                        type="button"
                        className="user-management-action-button user-management-action-button--edit"
                        style={canDeleteUser(user) ? styles.editButton : styles.singleActionButton}
                        onClick={() => openEdit(user)}
                        disabled={updatingId === user.id}
                        aria-label={`Edit ${user.name}`}
                        title={`Edit ${user.name}`}
                      >
                        <span style={styles.editIcon} aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M4 16.5V20h3.5L18.1 9.4l-3.5-3.5L4 16.5Z" fill="currentColor" />
                            <path d="m16 4.5 1.2-1.2a1.7 1.7 0 0 1 2.4 0l1.1 1.1a1.7 1.7 0 0 1 0 2.4L19.5 8 16 4.5Z" fill="currentColor" opacity=".75" />
                          </svg>
                        </span>
                      </button>
                      {canDeleteUser(user) && (
                        <button
                          type="button"
                          className="user-management-action-button user-management-action-button--delete"
                          style={styles.deleteButton}
                          onClick={() => setDeleteTarget(user)}
                          disabled={deletingId === user.id}
                          aria-label={`Delete ${user.name}`}
                          title={`Delete ${user.name}`}
                        >
                          <span style={styles.deleteIcon} aria-hidden="true">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                              <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" fill="currentColor" />
                              <path d="M6.5 9h11l-.7 10.2A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.8L6.5 9Z" fill="currentColor" opacity=".78" />
                            </svg>
                          </span>
                        </button>
                      )}
                    </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="8" style={styles.emptyCell}>{users.length ? "No users match the selected filters." : "No users are available yet."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteUserDialog
        target={deleteTarget}
        deletingId={deletingId}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {shouldRenderInlineDeleteDialog() && deleteTarget && (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
          <div style={styles.modalCard}>
            <div style={styles.warningIcon}>!</div>
            <div>
              <p style={styles.kicker}>Delete user</p>
              <h3 id="delete-user-title" style={styles.modalTitle}>Remove this account?</h3>
              <p style={styles.modalText}>
                This will delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email}) from user management.
              </p>
              <div style={styles.deleteUserPreview}>
                <span style={styles.previewAvatar}>{deleteTarget.name?.charAt(0)?.toUpperCase() || "U"}</span>
                <span>
                  <strong>{deleteTarget.name}</strong>
                  <small style={styles.previewMeta}>{deleteTarget.role} · {deleteTarget.assignment}</small>
                </span>
              </div>
            </div>
            <div style={styles.modalActions}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
              >
                Cancel
              </button>
              <button
                type="button"
                style={styles.confirmDeleteButton}
                onClick={handleDelete}
                disabled={deletingId === deleteTarget.id}
              >
                {deletingId === deleteTarget.id ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && typeof document !== "undefined" && createPortal((
        <div style={styles.editOverlay} role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
          <form style={styles.editModalCard} onSubmit={handleUpdate}>
            <div style={styles.editModalHeader}>
              <span style={styles.editModalIcon} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 16.5V20h3.5L18.1 9.4l-3.5-3.5L4 16.5Z" fill="currentColor" />
                  <path d="m16 4.5 1.2-1.2a1.7 1.7 0 0 1 2.4 0l1.1 1.1a1.7 1.7 0 0 1 0 2.4L19.5 8 16 4.5Z" fill="currentColor" opacity=".75" />
                </svg>
              </span>
              <div>
                <p style={styles.kicker}>Edit user</p>
                <h3 id="edit-user-title" style={styles.modalTitle}>Update account details</h3>
                <p style={styles.modalText}>Correct wrong school/post, name, email or reset password if needed.</p>
              </div>
            </div>

            <div style={styles.formSection}>
              <div style={styles.formSectionHeader}>
                <h4 style={styles.sectionTitle}>Assignment Details</h4>
                <span style={styles.sectionHint}>Update account type, category and assignment.</span>
              </div>
              <div style={styles.editFieldGrid}>
                <Field label="Account Type">
                  <select className="audit-control" style={styles.control} value={editForm.accountType} onChange={(event) => updateEditField("accountType", event.target.value)}>
                    <option value="user">Regular User</option>
                    <option value="auditor">Auditor</option>
                  </select>
                </Field>

                <Field label={editForm.accountType === "auditor" ? "Audit Category" : "User Category"} error={editErrors.category}>
                  <select className="audit-control" style={styles.control} value={editForm.category} onChange={(event) => updateEditField("category", event.target.value)}>
                    <option value="">Select category</option>
                    <option value="academic">Academic</option>
                    <option value="administrative">Administrative</option>
                  </select>
                </Field>

                {editForm.accountType === "auditor" && (
                  <Field label="Auditor Type" error={editErrors.auditorType}>
                    <select className="audit-control" style={styles.control} value={editForm.auditorType} onChange={(event) => updateEditField("auditorType", event.target.value)}>
                      <option value="">Select auditor type</option>
                      <option value="internal">Internal</option>
                      <option value="external">External</option>
                    </select>
                  </Field>
                )}

                {editForm.category === "academic" && (
                <Field label={editForm.accountType === "auditor" ? "Schools" : "School"} error={editForm.accountType === "auditor" ? editErrors.schools : editErrors.school}>
                  {editForm.accountType === "auditor" ? (
                    <AcademicSchoolMultiSelect
                      selected={editForm.schools}
                      onToggle={toggleEditAcademicSchool}
                      schools={schools}
                    />
                  ) : (
                    <select className="audit-control" style={styles.control} value={editForm.school} onChange={(event) => updateEditField("school", event.target.value)}>
                      <option value="">{schools.length === 0 ? "-- No schools configured (Add in Form Studio) --" : "Select school"}</option>
                      {schools.map((school) => (
                        <option key={school.code} value={school.code.toUpperCase()}>
                          {school.name} ({school.code})
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                )}

                {editForm.category === "administrative" && (
                <Field
                  label={editForm.accountType === "auditor" ? "Administrative Posts" : "Administrative Post"}
                  error={editForm.accountType === "auditor" ? editErrors.administrativePosts : editErrors.post}
                >
                  {editForm.accountType === "auditor" ? (
                    <AdministrativePostMultiSelect
                      selected={editForm.administrativePosts}
                      onToggle={toggleEditAdministrativePost}
                      posts={posts}
                    />
                  ) : (
                    <select className="audit-control" style={styles.control} value={editForm.post} onChange={(event) => updateEditField("post", event.target.value)}>
                      <option value="">Select post</option>
                      {posts.map((post) => <option key={post.value} value={post.value}>{post.label}</option>)}
                    </select>
                  )}
                </Field>
                )}
              </div>
            </div>

            <div style={styles.formSection}>
              <div style={styles.formSectionHeader}>
                <h4 style={styles.sectionTitle}>Credential Details</h4>
                <span style={styles.sectionHint}>Leave password blank to keep the existing password.</span>
              </div>
              <div style={styles.editFieldGrid}>
              <Field label="Name" error={editErrors.name}>
                <input className="audit-control" style={styles.control} value={editForm.name} onChange={(event) => updateEditField("name", event.target.value)} placeholder="Enter full name" />
              </Field>

              <Field label="Email ID" error={editErrors.email}>
                <input className="audit-control" style={styles.control} type="email" value={editForm.email} onChange={(event) => updateEditField("email", event.target.value)} placeholder="name@dypiu.ac.in" />
              </Field>

              <Field label="New Password (Optional)" error={editErrors.password}>
                <input className="audit-control" style={styles.control} type="password" value={editForm.password} onChange={(event) => updateEditField("password", event.target.value)} placeholder="Leave blank to keep existing password" />
              </Field>

              <Field label="Confirm New Password" error={editErrors.confirmPassword}>
                <input className="audit-control" style={styles.control} type="password" value={editForm.confirmPassword} onChange={(event) => updateEditField("confirmPassword", event.target.value)} placeholder="Required only when changing password" disabled={!editForm.password} />
              </Field>
              </div>
            </div>

            <div style={styles.modalActions}>
              <button type="button" className="btn btn-secondary" onClick={closeEdit} disabled={updatingId === editTarget.id}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={updatingId === editTarget.id}>
                {updatingId === editTarget.id ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      ), document.body)}

      <AvatarPreviewCard key={avatarPreviewUser?.id || "none"} user={avatarPreviewUser} onClose={() => setAvatarPreviewUser(null)} />

      <PrintableUsersReport users={filteredUsers} stats={userStats} />
    </section>
  );
}

function UserAvatarButton({ user, onClick }) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(user.avatarUrl) && !imgError;

  return (
    <button
      type="button"
      style={{ ...styles.tableAvatarBase, ...(showImage ? styles.tableAvatarPhoto : styles.tableAvatarInitials) }}
      onClick={onClick}
      aria-label={`View ${user.name}'s profile picture`}
    >
      {showImage ? (
        <img src={getAttachmentUrl(user.avatarUrl)} alt="" style={styles.tableAvatarImg} onError={() => setImgError(true)} />
      ) : (
        user.name?.charAt(0)?.toUpperCase() || "U"
      )}
    </button>
  );
}

function AvatarPreviewCard({ user, onClose }) {
  const [imgError, setImgError] = useState(false);

  if (!user || typeof document === "undefined") return null;

  const showImage = Boolean(user.avatarUrl) && !imgError;

  return createPortal(
    <div style={styles.avatarPreviewOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="avatar-preview-name">
      <div style={styles.avatarPreviewCard} onClick={(event) => event.stopPropagation()}>
        {showImage ? (
          <img src={getAttachmentUrl(user.avatarUrl)} alt="" style={styles.avatarPreviewImg} onError={() => setImgError(true)} />
        ) : (
          <div style={styles.avatarPreviewFallback}>{user.name?.charAt(0)?.toUpperCase() || "U"}</div>
        )}
        <h3 id="avatar-preview-name" style={styles.avatarPreviewName}>{user.name}</h3>
        <p style={styles.avatarPreviewMeta}>{user.role} · {user.assignment || user.email}</p>
        {!showImage && <p style={styles.avatarPreviewNoPhoto}>No profile picture uploaded yet.</p>}
        <button type="button" style={styles.avatarPreviewClose} onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body
  );
}

function PrintableUsersReport({ users, stats }) {
  return (
    <section className="user-report-print-area" aria-hidden="true">
      <div className="user-report-sheet">
        <header className="user-report-cover">
          <div>
            <p>DY Patil International University, Akurdi Pune</p>
            <h1>User Management Register</h1>
            <span>IQAC Administrative Access Report</span>
          </div>
          <div className="user-report-date">
            <small>Generated on</small>
            <strong>{formatDate()}</strong>
          </div>
        </header>

        <div className="user-report-summary">
          <ReportStat label="Total Users" value={stats.total} />
          <ReportStat label="Academic" value={stats.academic} />
          <ReportStat label="Administrative" value={stats.administrative} />
          <ReportStat label="Auditors" value={stats.auditors} />
        </div>

        <div className="user-report-section-heading">
          <span>01</span>
          <div>
            <h2>All Registered Users</h2>
            <p>Complete list of accounts configured for the appraisal portal.</p>
          </div>
        </div>

        <table className="user-report-table">
          <thead>
            <tr>
              <th>Sr No</th>
              <th>Name</th>
              <th>Email</th>
              <th>Account</th>
              <th>Category</th>
              <th>School / Post</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.length ? users.map((user, index) => (
              <tr key={user.id}>
                <td>{index + 1}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.accountType === "auditor" ? `${titleCase(user.auditorType)} Auditor` : "User"}</td>
                <td>{user.category}</td>
                <td>{assignmentTextFor(user)}</td>
                <td>{user.role}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="7">No users are available.</td>
              </tr>
            )}
          </tbody>
        </table>

        <footer className="user-report-footer">
          <span>Prepared by IQAC</span>
          <span>School Appraisal Portal</span>
        </footer>
      </div>
    </section>
  );
}

function ReportStat({ label, value }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

const schoolLabelFor = (value, availableSchools = []) => {
  if (!value) return "";
  const school = (availableSchools || []).find((option) => option.code?.toUpperCase() === String(value).toUpperCase());
  return school ? `${school.name} (${school.code})` : String(value);
};

function assignmentTextFor(user = {}) {
  if (user.accountType === "auditor" && user.category === "academic" && user.schools?.length) {
    return user.schools.join(", ");
  }
  return user.assignment;
}

function assignmentCellFor(user = {}) {
  if (user.accountType === "auditor" && user.category === "academic" && user.schools?.length > 1) {
    return (
      <div style={styles.assignmentBadgeList}>
        {user.schools.map((school) => (
          <span key={school} style={styles.assignmentBadge} title={school}>{school}</span>
        ))}
      </div>
    );
  }

  if (user.accountType === "auditor" && user.category === "academic" && user.schools?.length === 1) {
    const [school] = user.schools;
    return <span title={school}>{school}</span>;
  }

  return assignmentTextFor(user);
}

function AcademicSchoolMultiSelect({ selected, onToggle, schools = [] }) {
  const summary = selected.length
    ? `${selected.length} school${selected.length === 1 ? "" : "s"} selected`
    : "Select schools";

  return (
    <details style={styles.multiSelect}>
      <summary style={styles.multiSelectSummary}>
        <span>{summary}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div style={styles.multiSelectMenu}>
        {schools.length === 0 ? (
          <div style={{ padding: "10px 14px", color: "#64748b", fontSize: "13px" }}>
            ⚠️ No schools configured yet. Add schools in <strong>Appraisal Form Studio</strong>.
          </div>
        ) : (
          schools.map((school) => {
            const code = school.code.toUpperCase();
            return (
              <label key={school.code} style={styles.multiSelectOption}>
                <input
                  type="checkbox"
                  checked={selected.includes(code)}
                  onChange={() => onToggle(code)}
                  style={styles.multiSelectCheckbox}
                />
                <span>{school.name}{school.code ? ` (${school.code})` : ""}</span>
              </label>
            );
          })
        )}
      </div>
      {!!selected.length && (
        <div style={styles.selectedPostList}>
          {selected.map((school) => <span key={school}>{school}</span>)}
        </div>
      )}
    </details>
  );
}

function AdministrativePostMultiSelect({ selected, onToggle, posts = ADMINISTRATIVE_POSTS }) {
  const summary = selected.length
    ? `${selected.length} post${selected.length === 1 ? "" : "s"} selected`
    : "Select administrative posts";

  return (
    <details style={styles.multiSelect}>
      <summary style={styles.multiSelectSummary}>
        <span>{summary}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div style={styles.multiSelectMenu}>
        {posts.map((post) => (
          <label key={post.value} style={styles.multiSelectOption}>
            <input
              type="checkbox"
              checked={selected.includes(post.value)}
              onChange={() => onToggle(post.value)}
              style={styles.multiSelectCheckbox}
            />
            <span>{post.label}</span>
          </label>
        ))}
      </div>
      {!!selected.length && (
        <div style={styles.selectedPostList}>
          {selected.map((post) => <span key={post}>{posts.find((p) => p.value === post)?.label || postLabelFor(post)}</span>)}
        </div>
      )}
    </details>
  );
}

function shouldRenderInlineDeleteDialog() {
  return false;
}

function DeleteUserDialog({ target, deletingId, onCancel, onConfirm }) {
  if (!target || typeof document === "undefined") return null;

  return createPortal(
    <div style={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
      <div style={styles.modalCard}>
        <div style={styles.warningIcon}>!</div>
        <div>
          <p style={styles.kicker}>Delete user</p>
          <h3 id="delete-user-title" style={styles.modalTitle}>Remove this account?</h3>
          <p style={styles.modalText}>
            This will delete <strong>{target.name}</strong> ({target.email}) from user management.
          </p>
          <div style={styles.deleteUserPreview}>
            <span style={styles.previewAvatar}>{target.name?.charAt(0)?.toUpperCase() || "U"}</span>
            <span>
              <strong>{target.name}</strong>
              <small style={styles.previewMeta}>{target.role} - {target.assignment}</small>
            </span>
          </div>
        </div>
        <div style={styles.modalActions}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={deletingId === target.id}
          >
            Cancel
          </button>
          <button
            type="button"
            style={styles.confirmDeleteButton}
            onClick={onConfirm}
            disabled={deletingId === target.id}
          >
            {deletingId === target.id ? "Deleting..." : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, error, children }) {
  return (
    <div style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
      {error && <span style={styles.errorText}>{error}</span>}
    </div>
  );
}

const styles = {
  panel: { display: "flex", flexDirection: "column", gap: 18 },
  headingRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, padding: 20, border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", boxShadow: "0 12px 35px rgba(15,23,42,.045)" },
  headingActions: { display: "flex", flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: 10, flexWrap: "wrap" },
  kicker: { margin: "0 0 5px", color: "#2563eb", fontSize: 10, fontWeight: 750, letterSpacing: ".08em", textTransform: "uppercase" },
  title: { margin: "0 0 5px", color: "#0f172a", fontSize: 20, fontWeight: 700 },
  description: { margin: 0, color: "#64748b", fontSize: 12.5 },
  formCard: { display: "flex", flexDirection: "column", gap: 18, padding: 20, border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", boxShadow: "0 12px 35px rgba(15,23,42,.045)" },
  formHeading: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingBottom: 14, borderBottom: "1px solid #edf1f6" },
  formTitle: { margin: 0, color: "#0f172a", fontSize: 17, fontWeight: 700 },
  formHint: { color: "#64748b", fontSize: 11 },
  formSection: { display: "flex", flexDirection: "column", gap: 14, padding: 16, border: "1px solid #e5ebf3", borderRadius: 12, background: "#fbfcfe" },
  formSectionHeader: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingBottom: 10, borderBottom: "1px solid #edf1f6" },
  sectionTitle: { margin: 0, color: "#0f172a", fontSize: 13, fontWeight: 800 },
  sectionHint: { color: "#64748b", fontSize: 11.5 },
  fieldGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(240px, 1fr))", gap: "18px 16px" },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "#334155", fontSize: 12, fontWeight: 650 },
  control: { width: "100%", minHeight: 42, border: "1px solid #d7dee9", borderRadius: 8, padding: "9px 11px", color: "#0f172a", background: "#fbfcfe", outline: "none" },
  multiSelect: { position: "relative", width: "100%" },
  multiSelectSummary: { minHeight: 42, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", border: "1px solid #d7dee9", borderRadius: 8, color: "#0f172a", background: "#fbfcfe", fontSize: 13, cursor: "pointer", listStyle: "none" },
  multiSelectMenu: { display: "grid", gap: 4, marginTop: 6, padding: 7, border: "1px solid #d7dee9", borderRadius: 8, background: "#fff", boxShadow: "0 12px 28px rgba(15,23,42,.12)" },
  multiSelectOption: { minHeight: 38, display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 6, color: "#334155", background: "#f8fafc", fontSize: 12.5, cursor: "pointer" },
  multiSelectCheckbox: { width: 16, height: 16, accentColor: "#2563eb", flex: "0 0 auto" },
  selectedPostList: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, color: "#1d4ed8", fontSize: 10.5, fontWeight: 700 },
  errorText: { color: "#b91c1c", fontSize: 11, fontWeight: 650 },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 2 },
  successNotice: { padding: "10px 12px", border: "1px solid #bbf7d0", borderRadius: 10, color: "#166534", background: "#f0fdf4", fontSize: 12, fontWeight: 700 },
  errorNotice: { padding: "10px 12px", border: "1px solid #fecaca", borderRadius: 10, color: "#991b1b", background: "#fef2f2", fontSize: 12, fontWeight: 700 },
  apiNotice: { padding: "10px 12px", border: "1px solid #bae6fd", borderRadius: 10, color: "#075985", background: "#f0f9ff", fontSize: 12, fontWeight: 650 },
  tableCard: { overflow: "hidden", border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", boxShadow: "0 12px 35px rgba(15,23,42,.045)" },
  tableHeading: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "18px 20px", borderBottom: "1px solid #edf1f6" },
  tableSubtext: { margin: "5px 0 0", color: "#64748b", fontSize: 11.5 },
  tableBadges: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  count: { padding: "5px 8px", borderRadius: 999, color: "#475569", background: "#f1f5f9", fontSize: 10.5, fontWeight: 700 },
  printHint: { padding: "5px 8px", borderRadius: 999, color: "#1d4ed8", background: "#eff6ff", fontSize: 10.5, fontWeight: 750 },
  filterBar: { display: "grid", gridTemplateColumns: "minmax(180px, 240px) minmax(180px, 240px) auto auto", alignItems: "end", justifyContent: "start", gap: 12, padding: "14px 20px", borderBottom: "1px solid #edf1f6", background: "#f8fafc" },
  filterField: { display: "flex", flexDirection: "column", gap: 6 },
  filterControl: { width: "100%", minHeight: 40, border: "1px solid #d7dee9", borderRadius: 8, padding: "8px 10px", color: "#0f172a", background: "#fff", outline: "none" },
  showDeletedField: { display: "flex", alignItems: "center", gap: 8, minHeight: 40, padding: "0 2px", cursor: "pointer" },
  readOnlyHint: { color: "#94a3b8", fontSize: 11, fontStyle: "italic" },
  scroller: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" },
  th: { padding: "10px 11px", borderRight: "1px solid #3a465b", color: "#f8fafc", background: "#1e293b", fontSize: 11.5, fontWeight: 700, textAlign: "left" },
  td: { padding: "11px", borderRight: "1px solid #dfe5ec", borderBottom: "1px solid #dfe5ec", color: "#334155", fontSize: 12, overflowWrap: "anywhere" },
  nameCell: { display: "flex", alignItems: "center", gap: 11 },
  tableAvatarBase: { width: 40, height: 40, flex: "0 0 40px", display: "grid", placeItems: "center", overflow: "hidden", borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800 },
  tableAvatarInitials: { color: "#fff", background: "linear-gradient(135deg, #2563eb, #0ea5e9)" },
  tableAvatarPhoto: { background: "#f1f5f9" },
  tableAvatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  avatarPreviewOverlay: { position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center", padding: 20, background: "rgba(15, 23, 42, .6)", backdropFilter: "blur(4px)" },
  avatarPreviewCard: { width: "min(360px, 92vw)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 24px", borderRadius: 20, background: "#fff", boxShadow: "0 28px 80px rgba(15,23,42,.3)" },
  avatarPreviewImg: { width: 220, height: 220, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 0 4px #eff6ff" },
  avatarPreviewFallback: { width: 220, height: 220, display: "grid", placeItems: "center", borderRadius: "50%", color: "#fff", background: "linear-gradient(135deg, #2563eb, #0ea5e9)", fontSize: 64, fontWeight: 800, boxShadow: "0 0 0 4px #eff6ff" },
  avatarPreviewName: { margin: 0, color: "#0f172a", fontSize: 16, fontWeight: 800, textAlign: "center" },
  avatarPreviewMeta: { margin: 0, color: "#64748b", fontSize: 12.5, textAlign: "center" },
  avatarPreviewNoPhoto: { margin: 0, color: "#94a3b8", fontSize: 11.5, textAlign: "center", fontStyle: "italic" },
  avatarPreviewClose: { marginTop: 6, border: "none", borderRadius: 8, background: "#f1f5f9", color: "#475569", padding: "10px 22px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  centerCell: { textAlign: "center", verticalAlign: "middle" },
  actionCell: { width: 96, textAlign: "center" },
  emptyCell: { padding: 28, color: "#64748b", fontSize: 12, textAlign: "center" },
  categoryPill: { textTransform: "capitalize", color: "#1d4ed8", fontWeight: 700 },
  assignmentBadgeList: { display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 5 },
  assignmentBadge: { display: "inline-flex", maxWidth: "100%", padding: "4px 7px", border: "1px solid #bfdbfe", borderRadius: 999, color: "#1d4ed8", background: "#eff6ff", fontSize: 11, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap" },
  userPill: { display: "inline-flex", padding: "4px 7px", borderRadius: 999, color: "#475569", background: "#f1f5f9", fontSize: 10.5, fontWeight: 750, textTransform: "capitalize" },
  auditorPill: { display: "inline-flex", padding: "4px 7px", borderRadius: 999, color: "#7c2d12", background: "#ffedd5", fontSize: 10.5, fontWeight: 750, textTransform: "capitalize" },
  activeStatus: { display: "inline-flex", padding: "4px 7px", borderRadius: 999, color: "#166534", background: "#dcfce7", fontSize: 10.5, fontWeight: 700, textTransform: "capitalize" },
  inactiveStatus: { display: "inline-flex", padding: "4px 7px", borderRadius: 999, color: "#991b1b", background: "#fee2e2", fontSize: 10.5, fontWeight: 700, textTransform: "capitalize" },
  deletedStatus: { display: "inline-flex", padding: "4px 7px", borderRadius: 999, color: "#64748b", background: "#f1f5f9", fontSize: 10.5, fontWeight: 700, textTransform: "capitalize" },
  actionGroup: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 0, padding: 3, border: "1px solid #dbe4f0", borderRadius: 12, background: "#f8fafc", boxShadow: "inset 0 1px 0 rgba(255,255,255,.9)" },
  editButton: { width: 34, height: 32, display: "grid", placeItems: "center", border: 0, borderRight: "1px solid #e2e8f0", borderRadius: "9px 0 0 9px", color: "#2563eb", background: "transparent", cursor: "pointer", fontFamily: "inherit" },
  singleActionButton: { width: 34, height: 32, display: "grid", placeItems: "center", border: 0, borderRadius: 9, color: "#2563eb", background: "transparent", cursor: "pointer", fontFamily: "inherit" },
  editIcon: { width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 8, color: "inherit", background: "transparent", flex: "0 0 auto" },
  deleteButton: { width: 34, height: 32, display: "grid", placeItems: "center", border: 0, borderRadius: "0 9px 9px 0", color: "#dc2626", background: "transparent", cursor: "pointer", fontFamily: "inherit" },
  deleteIcon: { width: 24, height: 24, display: "grid", placeItems: "center", borderRadius: 8, color: "inherit", background: "transparent", flex: "0 0 auto" },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 20, background: "rgba(15, 23, 42, .52)", backdropFilter: "blur(4px)" },
  modalCard: { width: "min(460px, 100%)", display: "grid", gridTemplateColumns: "48px 1fr", gap: 15, padding: 22, borderRadius: 22, border: "1px solid #fee2e2", background: "linear-gradient(180deg, #fff 0%, #fffafa 100%)", boxShadow: "0 28px 80px rgba(15,23,42,.22)" },
  warningIcon: { width: 46, height: 46, display: "grid", placeItems: "center", borderRadius: 16, color: "#b91c1c", background: "linear-gradient(135deg, #fee2e2, #fecaca)", fontSize: 21, fontWeight: 900, boxShadow: "inset 0 0 0 1px rgba(185,28,28,.08)" },
  modalTitle: { margin: "0 0 8px", color: "#0f172a", fontSize: 18, fontWeight: 800 },
  modalText: { margin: 0, color: "#475569", fontSize: 13, lineHeight: 1.55 },
  deleteUserPreview: { display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: 10, border: "1px solid #fee2e2", borderRadius: 14, background: "#fff", color: "#0f172a", fontSize: 12 },
  previewAvatar: { width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 12, color: "#fff", background: "linear-gradient(135deg, #ef4444, #f97316)", fontWeight: 900 },
  previewMeta: { display: "block", marginTop: 2, color: "#64748b", fontSize: 11 },
  modalActions: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 6 },
  confirmDeleteButton: { border: "1px solid #dc2626", borderRadius: 10, padding: "10px 14px", color: "#fff", background: "linear-gradient(135deg, #ef4444, #b91c1c)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 10px 24px rgba(220, 38, 38, .22)" },
  editOverlay: { position: "fixed", inset: 0, zIndex: 78, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 20px", background: "rgba(15, 23, 42, .48)", backdropFilter: "blur(4px)", overflowY: "auto" },
  editModalCard: { width: "min(780px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, padding: 22, border: "1px solid #dbeafe", borderRadius: 22, background: "linear-gradient(180deg, #fff 0%, #f8fbff 100%)", boxShadow: "0 28px 80px rgba(15,23,42,.22)" },
  editModalHeader: { display: "flex", alignItems: "flex-start", gap: 14, paddingBottom: 14, borderBottom: "1px solid #e2e8f0" },
  editModalIcon: { width: 46, height: 46, flex: "0 0 46px", display: "grid", placeItems: "center", borderRadius: 16, color: "#1d4ed8", background: "linear-gradient(135deg, #dbeafe, #bfdbfe)", boxShadow: "inset 0 0 0 1px rgba(37,99,235,.08)" },
  editCategoryGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  editFieldGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: "15px 14px" },
};
