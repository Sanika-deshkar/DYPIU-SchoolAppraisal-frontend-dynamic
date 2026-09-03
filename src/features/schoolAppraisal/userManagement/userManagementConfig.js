export const SCHOOL_OPTIONS = [];

const normalizeSchoolValue = (value = "") =>
  String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

const rawListValue = (value) => {
  if (Array.isArray(value)) return value.flatMap(rawListValue);
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.flatMap(rawListValue);
      if (parsed && typeof parsed === "object") return [parsed];
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  if (typeof value === "object") return [value];
  return [value];
};

export const canonicalSchoolCode = (value = "") => {
  if (!value) return "";
  const str = String(value).trim();
  const normalized = normalizeSchoolValue(str);
  const school = SCHOOL_OPTIONS.find((option) =>
    normalizeSchoolValue(option.code) === normalized ||
    normalizeSchoolValue(option.name) === normalized
  );

  return school?.code?.toUpperCase() || str.toUpperCase();
};

export const normalizeAcademicSchoolCodes = (value) =>
  uniqueValues(
    rawListValue(value)
      .map((school) => {
        if (school && typeof school === "object") {
          return canonicalSchoolCode(school.code || school.schoolCode || school.school || school.schoolName || school.name);
        }
        return canonicalSchoolCode(school);
      })
      .filter(Boolean)
  );

const ACADEMIC_AUDITOR_SCHOOLS_STORAGE_KEY = "schoolAppraisal.academicAuditorSchools";

const identityKeysForUser = (user = {}) =>
  uniqueValues([user.id, user.userId].map((value) => String(value || "").trim().toLowerCase()));

const fallbackKeysForUser = (user = {}) =>
  uniqueValues([user.email, user.username].map((value) => String(value || "").trim().toLowerCase()));

const storageKeysForUser = (user = {}) =>
  uniqueValues([...identityKeysForUser(user), ...fallbackKeysForUser(user)]);

const readStoredAcademicAuditorSchools = () => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(ACADEMIC_AUDITOR_SCHOOLS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeStoredAcademicAuditorSchools = (value) => {
  try {
    globalThis.localStorage?.setItem(ACADEMIC_AUDITOR_SCHOOLS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage is an enhancement; API data remains the source of truth.
  }
};

export const getStoredAcademicAuditorSchools = (user = {}) => {
  const stored = readStoredAcademicAuditorSchools();
  const identityKeys = identityKeysForUser(user);
  const lookupKeys = identityKeys.length ? identityKeys : fallbackKeysForUser(user);
  const key = lookupKeys.find((item) => stored[item]);
  return key ? normalizeAcademicSchoolCodes(stored[key]) : [];
};

export const rememberAcademicAuditorSchools = (user = {}, schools = []) => {
  const keys = storageKeysForUser(user);
  if (!keys.length) return;

  const stored = readStoredAcademicAuditorSchools();
  const normalizedSchools = normalizeAcademicSchoolCodes(schools);
  keys.forEach((key) => {
    if (normalizedSchools.length) stored[key] = normalizedSchools;
    else delete stored[key];
  });
  writeStoredAcademicAuditorSchools(stored);
};

export const forgetAcademicAuditorSchools = (user = {}) => {
  const keys = storageKeysForUser(user);
  if (!keys.length) return;

  const stored = readStoredAcademicAuditorSchools();
  keys.forEach((key) => delete stored[key]);
  writeStoredAcademicAuditorSchools(stored);
};

export const schoolGroupFor = (value = "") => {
  const normalized = normalizeSchoolValue(value);
  const school = SCHOOL_OPTIONS.find((option) =>
    normalizeSchoolValue(option.code) === normalized ||
    normalizeSchoolValue(option.name) === normalized
  );

  return school?.group || "";
};

export const ADMINISTRATIVE_POSTS = [
  { value: "registrar", label: "Registrar" },
  { value: "hr", label: "HR" },
  { value: "dean-student-welfare", label: "Dean Student Welfare" },
  { value: "dean-placement", label: "Dean Placement" },
];
