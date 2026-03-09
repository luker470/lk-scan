export const ADMIN_UID = "Dpmh3d0Ag5XsuwsJOBAmuR2Gqba2";

export function isAdmin(uid?: string | null) {
  return uid === ADMIN_UID;
}