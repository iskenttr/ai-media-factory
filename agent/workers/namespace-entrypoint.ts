import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function valueAfter(flag: string, args: string[]) {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`missing_sandbox_argument:${flag}`);
  return args[index + 1];
}

function run(executable: string, args: string[]) {
  const result = spawnSync(executable, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`sandbox_setup_failed:${executable}:${args.join(" ")}:${result.stderr}`);
}

function bind(source: string, target: string, readOnly = true) {
  run("/usr/bin/mount", ["--bind", source, target]);
  if (readOnly) run("/usr/bin/mount", ["-o", "remount,bind,ro,nosuid,nodev", target]);
}

async function main() {
  const args = process.argv.slice(2);
  const separator = args.indexOf("--");
  if (separator < 0 || !args[separator + 1]) throw new Error("sandbox_command_missing");
  const root = path.resolve(valueAfter("--root", args));
  const worktree = path.resolve(valueAfter("--worktree", args));
  const artifacts = path.resolve(valueAfter("--artifacts", args));
  const command = args.slice(separator + 1);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true, mode: 0o700 });
  run("/usr/bin/mount", ["-t", "tmpfs", "-o", "mode=0755,nosuid,nodev", "tmpfs", root]);
  const directories = ["usr", "bin", "lib", "lib64", "etc", "dev", "proc", "tmp", "workspace", "artifacts", "deps"];
  for (const directory of directories) await mkdir(path.join(root, directory), { recursive: true });
  await mkdir(path.join(root, "etc/ssl"), { recursive: true });
  await mkdir(path.join(root, "etc/alternatives"), { recursive: true });
  for (const file of ["passwd", "group", "nsswitch.conf", "hosts"]) await writeFile(path.join(root, "etc", file), "", { mode: 0o644 });
  for (const file of ["null", "zero", "random", "urandom"]) await writeFile(path.join(root, "dev", file), "", { mode: 0o600 });
  run("/usr/bin/mount", ["--bind", root, root]);
  run("/usr/bin/mount", ["-o", "remount,bind,ro", root]);
  for (const directory of ["usr", "bin", "lib", "lib64"]) {
    try { bind(`/${directory}`, path.join(root, directory)); } catch (error) {
      if (directory !== "lib64") throw error;
    }
  }
  for (const file of ["passwd", "group", "nsswitch.conf", "hosts"]) {
    try { bind(`/etc/${file}`, path.join(root, "etc", file)); } catch { /* optional host file */ }
  }
  try { bind("/etc/ssl", path.join(root, "etc/ssl")); } catch { /* no TLS files required for offline execution */ }
  // /etc/alternatives contains symlinks that libblas.so.3, liblapack.so.3, and similar
  // update-alternatives-managed libraries resolve through. Without this mount the dynamic
  // linker cannot follow the symlink chain inside the chroot and ffmpeg fails with
  // "error while loading shared libraries: libblas.so.3: cannot open shared object file".
  try { bind("/etc/alternatives", path.join(root, "etc/alternatives")); } catch { /* host may not use update-alternatives; non-fatal */ }
  for (const file of ["null", "zero", "random", "urandom"]) bind(`/dev/${file}`, path.join(root, "dev", file));
  bind(worktree, path.join(root, "workspace"), false);
  bind(path.join(worktree, ".git"), path.join(root, "workspace/.git"));
  bind(artifacts, path.join(root, "artifacts"), false);
  const dependencies = path.join(process.env.AMF_AGENT_REPOSITORY_ROOT ?? "", "node_modules");
  bind(dependencies, path.join(root, "deps"));
  await mkdir(path.join(root, "workspace/node_modules"), { recursive: true });
  bind(dependencies, path.join(root, "workspace/node_modules"));
  run("/usr/bin/mount", ["-t", "tmpfs", "-o", "mode=1777,nosuid,nodev", "tmpfs", path.join(root, "tmp")]);
  const env = [
    "-C", "/workspace", "-i", "HOME=/tmp/home", "TMPDIR=/tmp", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "CI=1", "NODE_ENV=test",
    "PATH=/workspace/node_modules/.bin:/deps/.bin:/usr/local/bin:/usr/bin:/bin", "NODE_PATH=/workspace/node_modules:/deps",
  ];
  const chroot = "/usr/sbin/chroot";
  const result = spawnSync(chroot, [
    root, "/usr/bin/setpriv", "--no-new-privs", "--bounding-set=-all", "--inh-caps=-all", "--ambient-caps=-all",
    "/usr/bin/env", ...env, ...command,
  ], { cwd: root, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
