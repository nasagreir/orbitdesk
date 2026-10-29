import { promises as fs } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { getDataDir, getUsersFilePath } from "@/lib/auth/paths";

export interface StoredUser {
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface UsersFile {
  users: StoredUser[];
}

async function ensureDataDir() {
  await fs.mkdir(getDataDir(), { recursive: true });
}

async function readUsersFile(): Promise<UsersFile> {
  await ensureDataDir();
  const file = getUsersFilePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as UsersFile;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { users: [] };
    }
    throw error;
  }
}

async function writeUsersFile(data: UsersFile) {
  await ensureDataDir();
  const file = getUsersFilePath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  try {
    await fs.chmod(file, 0o600);
  } catch {
    // best-effort on platforms that ignore chmod
  }
}

export async function listUsers(): Promise<
  Array<Omit<StoredUser, "passwordHash">>
> {
  const { users } = await readUsersFile();
  return users.map(({ username, createdAt, updatedAt }) => ({
    username,
    createdAt,
    updatedAt,
  }));
}

export async function userCount(): Promise<number> {
  const { users } = await readUsersFile();
  return users.length;
}

export async function findUser(
  username: string,
): Promise<StoredUser | undefined> {
  const { users } = await readUsersFile();
  return users.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
  );
}

export async function createUser(username: string, password: string) {
  const trimmed = username.trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(trimmed)) {
    throw new Error(
      "Username must be 3–32 chars (letters, numbers, . _ -)",
    );
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const data = await readUsersFile();
  if (
    data.users.some((u) => u.username.toLowerCase() === trimmed.toLowerCase())
  ) {
    throw new Error(`User "${trimmed}" already exists`);
  }

  const now = new Date().toISOString();
  data.users.push({
    username: trimmed,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: now,
    updatedAt: now,
  });
  await writeUsersFile(data);
  return trimmed;
}

export async function setUserPassword(username: string, password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const data = await readUsersFile();
  const idx = data.users.findIndex(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
  );
  if (idx < 0) {
    throw new Error(`User "${username}" not found`);
  }
  data.users[idx] = {
    ...data.users[idx],
    passwordHash: await bcrypt.hash(password, 12),
    updatedAt: new Date().toISOString(),
  };
  await writeUsersFile(data);
  return data.users[idx].username;
}

export async function verifyUser(
  username: string,
  password: string,
): Promise<StoredUser | null> {
  const user = await findUser(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export function usersFileLocation() {
  return path.resolve(getUsersFilePath());
}
