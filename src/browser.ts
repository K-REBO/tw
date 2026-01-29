/**
 * Browser detection module for Firefox and Chromium support
 *
 * Environment variables:
 * - TW_BROWSER: "chromium" (default) or "firefox"
 * - FIREFOX_PATH: Explicit path to Firefox executable
 * - CHROMIUM_PATH: Explicit path to Chromium executable
 */

export type BrowserType = "firefox" | "chromium";

export interface BrowserConfig {
  type: BrowserType;
  executablePath: string;
}

export interface BrowserDetectionResult {
  found: boolean;
  path?: string;
  error?: string;
}

const FIREFOX_PATHS = [
  "/usr/bin/firefox",
  "/usr/bin/firefox-esr",
  "/usr/local/bin/firefox",
  "/snap/bin/firefox",
  "/Applications/Firefox.app/Contents/MacOS/firefox",
];

const CHROMIUM_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/local/bin/chromium",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch {
    return false;
  }
}

async function which(command: string): Promise<string | null> {
  try {
    const process = new Deno.Command("which", {
      args: [command],
      stdout: "piped",
      stderr: "null",
    });
    const { code, stdout } = await process.output();
    if (code === 0) {
      return new TextDecoder().decode(stdout).trim();
    }
  } catch {
    // which command failed
  }
  return null;
}

export async function detectBrowser(type: BrowserType): Promise<BrowserDetectionResult> {
  if (type === "firefox") {
    // 1. Check FIREFOX_PATH environment variable
    const envPath = Deno.env.get("FIREFOX_PATH");
    if (envPath) {
      if (await fileExists(envPath)) {
        return { found: true, path: envPath };
      }
      return { found: false, error: `FIREFOX_PATH set but file not found: ${envPath}` };
    }

    // 2. Check system paths
    for (const path of FIREFOX_PATHS) {
      if (await fileExists(path)) {
        return { found: true, path };
      }
    }

    // 3. Try which command
    const whichPath = await which("firefox");
    if (whichPath) {
      return { found: true, path: whichPath };
    }

    return { found: false, error: "Firefox not found" };
  }

  if (type === "chromium") {
    // 1. Check CHROMIUM_PATH environment variable
    const envPath = Deno.env.get("CHROMIUM_PATH");
    if (envPath) {
      if (await fileExists(envPath)) {
        return { found: true, path: envPath };
      }
      return { found: false, error: `CHROMIUM_PATH set but file not found: ${envPath}` };
    }

    // 2. Check system paths
    for (const path of CHROMIUM_PATHS) {
      if (await fileExists(path)) {
        return { found: true, path };
      }
    }

    // 3. Try which commands
    for (const cmd of ["chromium", "chromium-browser", "google-chrome"]) {
      const whichPath = await which(cmd);
      if (whichPath) {
        return { found: true, path: whichPath };
      }
    }

    return { found: false, error: "Chromium not found" };
  }

  return { found: false, error: `Unknown browser type: ${type}` };
}

export async function getBrowserConfig(): Promise<BrowserConfig> {
  const browserEnv = Deno.env.get("TW_BROWSER")?.toLowerCase() || "chromium";
  const type: BrowserType = browserEnv === "firefox" ? "firefox" : "chromium";

  const result = await detectBrowser(type);

  if (result.found && result.path) {
    return { type, executablePath: result.path };
  }

  // Browser not found, show helpful error message
  const alternativeType: BrowserType = type === "firefox" ? "chromium" : "firefox";
  const alternativeResult = await detectBrowser(alternativeType);

  let errorMessage = `${type === "firefox" ? "Firefox" : "Chromium"} not found.\n\n`;
  errorMessage += "Recommended: nix develop\n\n";

  if (alternativeResult.found) {
    errorMessage += `Or set TW_BROWSER=${alternativeType} to use ${alternativeType === "firefox" ? "Firefox" : "Chromium"} instead.\n`;
  } else {
    errorMessage += "No supported browsers found. Please install Firefox or Chromium.\n";
  }

  throw new Error(errorMessage);
}
