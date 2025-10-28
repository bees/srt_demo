import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

type ExecutionRequest = {
  code: string;
};

type ExecutionResponse =
  | { status: "ok"; value: unknown }
  | { status: "error"; error: string };

const serializeRequest = (request: ExecutionRequest) =>
  Buffer.from(JSON.stringify(request), "utf8").toString("base64");

const deserializeResponse = (raw: string): ExecutionResponse | null => {
  try {
    return JSON.parse(raw) as ExecutionResponse;
  } catch {
    return null;
  }
};

const run = async () => {
  await SandboxManager.initialize();

  // TODO: inline the arbitrary code here
  // by default network requests should fail and any FS writes will fail.
  const request: ExecutionRequest = {
    code: `
      (() => {
        const nums = [1, 2, 3, 4];
        return nums.map((value) => value * value).reduce((acc, curr) => acc + curr);
      })()
    `,
  };

  const serializedRequest = serializeRequest(request);

  const runtimePath = process.execPath;
  const modulePath = fileURLToPath(import.meta.url);
  const scriptPath = path.resolve(path.dirname(modulePath), "child.js");

  const sandboxedCommand = await SandboxManager.wrapWithSandbox(
    `${JSON.stringify(runtimePath)} ${JSON.stringify(scriptPath)} ${JSON.stringify(serializedRequest)}`,
  );

  const child = spawn(sandboxedCommand, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const exitCode: number | null = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code));
    });

    const trimmedStdout = stdout.trim();
    if (trimmedStdout.length > 0) {
      const response = deserializeResponse(trimmedStdout);

      if (response) {
        if (response.status === "ok") {
          console.log("Child result:", response.value);
        } else {
          console.error("Child reported error:", response.error);
        }
      } else {
        console.log("Child output:", trimmedStdout);
      }
    }

    if (stderr.trim().length > 0) {
      console.error("Child stderr:", stderr.trim());
    }

    console.log(`Command exited with code ${exitCode}`);
  } finally {
    await SandboxManager.reset();
  }
};

run().catch((error) => {
  console.error("Failed to execute sandboxed child:", error);
  process.exitCode = 1;
});
