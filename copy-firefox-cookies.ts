#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * FirefoxのCookie storeからTwitter/X.comの認証情報をコピーするスクリプト
 *
 * 使用方法:
 *   deno run --allow-read --allow-write --allow-env copy-firefox-cookies.ts
 *   または
 *   ./copy-firefox-cookies.ts
 */

import { Database } from "jsr:@db/sqlite@0.12";
import { parse as parseIni } from "https://deno.land/std@0.224.0/ini/mod.ts";

interface FirefoxCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiry: number;
  isSecure: boolean;
  isHttpOnly: boolean;
  sameSite: string;
}

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

interface AuthData {
  userAgent: string;
  loginTime: string;
  cookies: PlaywrightCookie[];
}

function getFirefoxProfilePath(): string {
  const home = Deno.env.get("HOME");
  if (!home) {
    throw new Error("HOME environment variable not set");
  }

  const firefoxDir = `${home}/.mozilla/firefox`;
  const profilesIniPath = `${firefoxDir}/profiles.ini`;

  try {
    const content = Deno.readTextFileSync(profilesIniPath);
    const ini = parseIni(content) as Record<string, Record<string, string>>;

    // Find the default profile
    for (const section of Object.keys(ini)) {
      if (section.startsWith("Profile") || section.startsWith("Install")) {
        const profile = ini[section];
        if (profile.Default === "1" || profile.Locked === "1") {
          const path = profile.Path;
          if (profile.IsRelative === "1") {
            return `${firefoxDir}/${path}`;
          }
          return path;
        }
      }
    }

    // Fallback: find any profile with .default in name
    for (const section of Object.keys(ini)) {
      if (section.startsWith("Profile")) {
        const profile = ini[section];
        const path = profile.Path;
        if (path && path.includes(".default")) {
          if (profile.IsRelative === "1") {
            return `${firefoxDir}/${path}`;
          }
          return path;
        }
      }
    }

    throw new Error("No default profile found");
  } catch (error) {
    throw new Error(`Failed to read Firefox profiles: ${(error as Error).message}`);
  }
}

function copyCookiesDb(profilePath: string): string {
  // Firefox locks cookies.sqlite, so we need to copy it
  // Also copy WAL files if they exist (Firefox uses WAL mode)
  const originalPath = `${profilePath}/cookies.sqlite`;
  const timestamp = Date.now();
  const tempPath = `/tmp/firefox-cookies-${timestamp}.sqlite`;

  Deno.copyFileSync(originalPath, tempPath);

  // Copy WAL and SHM files if they exist
  const walPath = `${profilePath}/cookies.sqlite-wal`;
  const shmPath = `${profilePath}/cookies.sqlite-shm`;
  const tempWalPath = `/tmp/firefox-cookies-${timestamp}.sqlite-wal`;
  const tempShmPath = `/tmp/firefox-cookies-${timestamp}.sqlite-shm`;

  try {
    Deno.copyFileSync(walPath, tempWalPath);
  } catch {
    // WAL file might not exist
  }

  try {
    Deno.copyFileSync(shmPath, tempShmPath);
  } catch {
    // SHM file might not exist
  }

  return tempPath;
}

function getTwitterCookies(dbPath: string): FirefoxCookie[] {
  const db = new Database(dbPath, { readonly: true });

  try {
    const cookies: FirefoxCookie[] = [];

    // Query cookies for x.com and twitter.com
    const query = `
      SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
      FROM moz_cookies
      WHERE host LIKE '%x.com' OR host LIKE '%twitter.com'
    `;

    const stmt = db.prepare(query);
    for (const row of stmt.all<{ name: string; value: string; host: string; path: string; expiry: number; isSecure: number; isHttpOnly: number; sameSite: number }>()) {
      cookies.push({
        name: row.name,
        value: row.value,
        domain: row.host,
        path: row.path,
        expiry: row.expiry,
        isSecure: row.isSecure === 1,
        isHttpOnly: row.isHttpOnly === 1,
        sameSite: row.sameSite === 2 ? "Strict" : row.sameSite === 1 ? "Lax" : "None",
      });
    }

    return cookies;
  } finally {
    db.close();
  }
}

function convertToPlaywrightFormat(cookies: FirefoxCookie[]): PlaywrightCookie[] {
  const result: PlaywrightCookie[] = [];
  const now = Math.floor(Date.now() / 1000);
  // Default expiry: 1 year from now
  const defaultExpiry = now + 365 * 24 * 60 * 60;

  for (const cookie of cookies) {
    // Firefox stores expiry in a format that may not be standard Unix timestamp
    // For important auth cookies, use a future expiry date
    // For session cookies (expiry <= 0), use -1
    let expires: number;
    if (cookie.expiry <= 0) {
      expires = -1; // Session cookie
    } else if (cookie.expiry < now) {
      // If expiry appears to be in the past (Firefox format issue), use default
      expires = defaultExpiry;
    } else {
      expires = cookie.expiry;
    }

    const baseCookie = {
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      expires,
      httpOnly: cookie.isHttpOnly,
      secure: cookie.isSecure,
      sameSite: cookie.sameSite as "Strict" | "Lax" | "None",
    };

    // Add cookie with original domain
    result.push({ ...baseCookie, domain: cookie.domain });

    // Also add cookies for both x.com and twitter.com domains
    // to ensure compatibility during Twitter's domain migration
    if (cookie.domain.includes("twitter.com")) {
      const xDomain = cookie.domain.replace("twitter.com", "x.com");
      result.push({ ...baseCookie, domain: xDomain });
    } else if (cookie.domain.includes("x.com")) {
      const twitterDomain = cookie.domain.replace("x.com", "twitter.com");
      result.push({ ...baseCookie, domain: twitterDomain });
    }
  }

  return result;
}

function main() {
  console.log("Firefoxのプロファイルを検索中...");

  const profilePath = getFirefoxProfilePath();
  console.log(`プロファイル: ${profilePath}`);

  console.log("Cookieデータベースをコピー中...");
  const tempDbPath = copyCookiesDb(profilePath);

  try {
    console.log("Twitter/X.comのCookieを取得中...");
    const firefoxCookies = getTwitterCookies(tempDbPath);

    if (firefoxCookies.length === 0) {
      console.error("Twitter/X.comのCookieが見つかりませんでした。");
      console.error("Firefoxでx.comにログインしているか確認してください。");
      Deno.exit(1);
    }

    console.log(`${firefoxCookies.length}個のCookieを取得しました`);

    const playwrightCookies = convertToPlaywrightFormat(firefoxCookies);

    const authData: AuthData = {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
      loginTime: new Date().toISOString(),
      cookies: playwrightCookies,
    };

    const outputPath = "./twitter-auth.json";
    Deno.writeTextFileSync(outputPath, JSON.stringify(authData, null, 2));

    console.log(`認証情報を ${outputPath} に保存しました`);

    // Show important cookies for verification
    const importantCookies = ["auth_token", "ct0", "twid"];
    const found = firefoxCookies.filter((c) => importantCookies.includes(c.name));
    console.log("\n重要なCookie:");
    for (const cookie of found) {
      console.log(`  - ${cookie.name}: ${cookie.value.slice(0, 10)}...`);
    }

    if (!found.some((c) => c.name === "auth_token")) {
      console.warn("\n⚠️  auth_token が見つかりません。ログイン状態を確認してください。");
    }

  } finally {
    // Clean up temp files
    const filesToClean = [
      tempDbPath,
      tempDbPath + "-wal",
      tempDbPath + "-shm",
    ];
    for (const file of filesToClean) {
      try {
        Deno.removeSync(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

main();
