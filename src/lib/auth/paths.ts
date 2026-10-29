import path from "node:path";

export function getDataDir() {
  return (
    process.env.ORBITDESK_DATA_DIR ?? path.join(process.cwd(), "data")
  );
}

export function getUsersFilePath() {
  return path.join(getDataDir(), "users.json");
}
