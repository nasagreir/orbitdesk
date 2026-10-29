#!/usr/bin/env node
/**
 * OrbitDesk user CLI — create accounts and recover passwords from the LXC shell.
 *
 * Usage:
 *   orbitdesk-user list
 *   orbitdesk-user create <username> [password]
 *   orbitdesk-user reset-password <username> [password]
 *   orbitdesk-user path
 *
 * Env:
 *   ORBITDESK_DATA_DIR  (default: <app>/data or /opt/orbitdesk/data)
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function resolveDataDir() {
  if (process.env.ORBITDESK_DATA_DIR) return process.env.ORBITDESK_DATA_DIR;
  return path.join(APP_ROOT, "data");
}

const DATA_DIR = resolveDataDir();
const USERS_FILE = path.join(DATA_DIR, "users.json");

async function loadBcrypt() {
  try {
    return require(path.join(APP_ROOT, "node_modules", "bcryptjs"));
  } catch {
    return require("bcryptjs");
  }
}

async function readUsers() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if (error && error.code === "ENOENT") return { users: [] };
    throw error;
  }
}

async function writeUsers(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${USERS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, USERS_FILE);
  try {
    await fs.chmod(USERS_FILE, 0o600);
  } catch {
    /* ignore */
  }
}

async function promptHidden(label) {
  if (!input.isTTY) {
    throw new Error("Password prompt requires an interactive TTY");
  }
  const rl = createInterface({ input, output });
  try {
    // readline can't hide easily everywhere; still better than argv in process list
    const value = await rl.question(label);
    return value;
  } finally {
    rl.close();
  }
}

function generatePassword() {
  return randomBytes(12).toString("base64url");
}

function usage() {
  console.log(`OrbitDesk user admin

Usage:
  orbitdesk-user list
  orbitdesk-user create <username> [password]
  orbitdesk-user reset-password <username> [password]
  orbitdesk-user path

Password recovery (LXC):
  pct enter <CTID>
  orbitdesk-user reset-password admin
`);
}

async function cmdList() {
  const { users } = await readUsers();
  if (users.length === 0) {
    console.log("No users yet. Create one with: orbitdesk-user create admin");
    return;
  }
  for (const u of users) {
    console.log(`${u.username}\tcreated ${u.createdAt}\tupdated ${u.updatedAt}`);
  }
}

async function cmdCreate(username, passwordArg) {
  if (!username) {
    usage();
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username must be 3–32 chars (letters, numbers, . _ -)");
  }
  const bcrypt = await loadBcrypt();
  const data = await readUsers();
  if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error(`User "${username}" already exists`);
  }
  let password = passwordArg;
  let generated = false;
  if (!password) {
    if (input.isTTY) {
      password = await promptHidden("Password (empty = generate): ");
      if (!password) {
        password = generatePassword();
        generated = true;
      }
    } else {
      password = generatePassword();
      generated = true;
    }
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const now = new Date().toISOString();
  data.users.push({
    username,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: now,
    updatedAt: now,
  });
  await writeUsers(data);
  console.log(`Created user "${username}"`);
  if (generated) console.log(`Generated password: ${password}`);
  console.log(`Store: ${USERS_FILE}`);
}

async function cmdReset(username, passwordArg) {
  if (!username) {
    usage();
    process.exit(1);
  }
  const bcrypt = await loadBcrypt();
  const data = await readUsers();
  const idx = data.users.findIndex(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (idx < 0) throw new Error(`User "${username}" not found`);

  let password = passwordArg;
  let generated = false;
  if (!password) {
    if (input.isTTY) {
      password = await promptHidden("New password (empty = generate): ");
      if (!password) {
        password = generatePassword();
        generated = true;
      }
    } else {
      password = generatePassword();
      generated = true;
    }
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  data.users[idx] = {
    ...data.users[idx],
    passwordHash: await bcrypt.hash(password, 12),
    updatedAt: new Date().toISOString(),
  };
  await writeUsers(data);
  console.log(`Password reset for "${data.users[idx].username}"`);
  if (generated) console.log(`Generated password: ${password}`);
  console.log(`Store: ${USERS_FILE}`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "list":
        await cmdList();
        break;
      case "create":
        await cmdCreate(args[0], args[1]);
        break;
      case "reset-password":
      case "reset":
        await cmdReset(args[0], args[1]);
        break;
      case "path":
        console.log(USERS_FILE);
        // also mention opt path for ops docs
        console.log(`DATA_DIR=${DATA_DIR}`);
        break;
      case "help":
      case undefined:
        usage();
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        usage();
        process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
