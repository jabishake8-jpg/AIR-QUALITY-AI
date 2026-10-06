export function deriveProfileFromAge(age) {
  const parsedAge = Number(age);
  if (!Number.isFinite(parsedAge)) return "general";
  if (parsedAge < 18) return "child";
  if (parsedAge >= 65) return "elderly";
  return "general";
}

export function deriveAgeFromProfile(profile) {
  switch (profile) {
    case "child":
      return 12;
    case "elderly":
      return 70;
    case "asthma":
      return 42;
    case "outdoor_worker":
      return 38;
    case "general":
    default:
      return 35;
  }
}

if (typeof window !== "undefined") {
  window.HealthProfile = {
    deriveAgeFromProfile,
    deriveProfileFromAge,
  };
}
