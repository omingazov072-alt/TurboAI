const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const localPython = path.join(
  __dirname,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python"
);
const python = existsSync(localPython) ? localPython : "python";
const child = spawn(python, ["-m", "uvicorn", "app:app", "--app-dir", __dirname, ...process.argv.slice(2)], {
  cwd: __dirname,
  stdio: "inherit"
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", code => process.exit(code ?? 0));
child.on("error", error => {
  console.error(`Не удалось запустить Python: ${error.message}`);
  process.exit(1);
});
