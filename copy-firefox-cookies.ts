#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * FirefoxのCookie storeからTwitter/X.comの認証情報をコピーするスクリプト
 *
 * 使用方法:
 *   deno run --allow-read --allow-write --allow-env copy-firefox-cookies.ts
 *   または
 *   ./copy-firefox-cookies.ts
 */

import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
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
  const originalPath = `${profilePath}/cookies.sqlite`;
  const tempPath = `/tmp/firefox-cookies-${Date.now()}.sqlite`;

  Deno.copyFileSync(originalPath, tempPath);
  return tempPath;
}

function getTwitterCookies(dbPath: string): FirefoxCookie[] {
  const db = new DB(dbPath);

  try {
    const cookies: FirefoxCookie[] = [];

    // Query cookies for x.com and twitter.com
    const query = `
      SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
      FROM moz_cookies
      WHERE host LIKE '%x.com' OR host LIKE '%twitter.com'
    `;

    for (const row of db.query<[string, string, string, string, number, number, number, number]>(query)) {
      const [name, value, host, path, expiry, isSecure, isHttpOnly, sameSite] = row;
      cookies.push({
        name,
        value,
        domain: host,
        path,
        expiry,
        isSecure: isSecure === 1,
        isHttpOnly: isHttpOnly === 1,
        sameSite: sameSite === 2 ? "Strict" : sameSite === 1 ? "Lax" : "None",
      });
    }

    return cookies;
  } finally {
    db.close();
  }
}

function convertToPlaywrightFormat(cookies: FirefoxCookie[]): PlaywrightCookie[] {
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expiry * 1000, // Convert to milliseconds
    httpOnly: cookie.isHttpOnly,
    secure: cookie.isSecure,
    sameSite: cookie.sameSite as "Strict" | "Lax" | "None",
  }));
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
    // Clean up temp file
    try {
      Deno.removeSync(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

main();
