# Acceptance and repair playbook

These commands prove source behavior, package contents, installation, exit
codes, and release checksums. Run them from the repository root.

## 1. Clean dependency install

```bash
npm ci
npm audit --omit=dev
```

Expected: install succeeds and audit reports zero known vulnerabilities.

If it fails:

- Confirm Node.js is 20 or newer with `node --version`.
- Confirm `.npmrc` points to `https://registry.npmjs.org/`.
- Remove only this repository's `node_modules` directory, then rerun
  `npm ci`. Do not edit the lockfile to hide a resolution failure.

## 2. Full source gate

```bash
npm run verify
npm run benchmark
```

Expected: all tests pass, the safe fixture has zero findings, the tangled
fixture produces both severities, replay reaches its bound, secret scan passes,
and `npm pack --dry-run` lists only distributable files.

If it fails:

| Failure | Repair |
| --- | --- |
| text hygiene | Open the named file/line, remove trailing whitespace, add the final newline, or repair invalid JSON |
| syntax check | Run `node --check <file>` and fix the first parser error |
| test | Run `node --test test/<name>.test.js`; preserve the smallest failing fixture |
| safe demo has findings | Inspect `artifacts/demo/safe-report.txt`; fix the false positive, not the assertion |
| tangled demo lacks findings | Check the normalized trigger/write model and rule evidence |
| secret scan | Remove and rotate the credential; never add an allowlist for a real secret |
| package dry run | Check `package.json#files` and `.gitignore` |

## 3. Expected CLI contracts

```bash
node bin/hasstangle.js scan \
  examples/safe-home/automations.yaml \
  --entities examples/safe-home/entities.json
```

Expected exit code: `0`.

```bash
node bin/hasstangle.js scan \
  examples/tangled-home/automations.yaml \
  --entities examples/tangled-home/entities.json
```

Expected exit code: `1`, with HT001/HT002 findings.

```bash
node bin/hasstangle.js scan missing.yaml
```

Expected exit code: `2`, with an actionable input error.

PowerShell exposes the last code as `$LASTEXITCODE`; POSIX shells use `$?`.

## 4. Reproducible release bundle

POSIX:

```bash
SOURCE_DATE_EPOCH=1785398400 npm run release:build
```

PowerShell:

```powershell
$env:SOURCE_DATE_EPOCH = "1785398400"
npm run release:build
```

Expected files under `release/`:

- `hasstangle-0.1.1.tgz`;
- `hasstangle-sbom.cdx.json` (CycloneDX 1.6);
- HTML, SARIF, Mermaid, and replay demo artifacts;
- `release-manifest.json`;
- `SHA256SUMS.txt`.

Verify on Linux/macOS:

```bash
cd release
sha256sum --check SHA256SUMS.txt
```

Verify on PowerShell:

```powershell
Get-Content release/SHA256SUMS.txt | ForEach-Object {
  $expected, $name = $_ -split "  ", 2
  $actual = (Get-FileHash "release/$name" -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected) { throw "Checksum mismatch: $name" }
}
```

## 5. Fresh-install smoke

Create a temporary directory outside the source checkout:

```bash
mkdir hasstangle-smoke && cd hasstangle-smoke
npm init -y
npm install /path/to/hasstangle/release/hasstangle-0.1.1.tgz \
  --registry=https://registry.npmjs.org/
npx hasstangle --version
npx hasstangle rules --format json
```

Then copy the safe fixture into the temporary directory and scan it. Expected
version is `0.1.1`; the safe scan exits `0`.

If the binary is missing, inspect:

```bash
npm pack --dry-run
tar -tf release/hasstangle-0.1.1.tgz
```

The archive must contain `package/bin/hasstangle.js`, `package/src/`, README,
license, and changelog.

## 6. Public release verification

After publication:

```bash
gh repo view KanadeK/hasstangle
gh run list --repo KanadeK/hasstangle
gh release view v0.1.1 --repo KanadeK/hasstangle
gh release download v0.1.1 --repo KanadeK/hasstangle --dir downloaded
```

Verify downloaded hashes against the downloaded `SHA256SUMS.txt`, not the local
pre-upload copy. Also verify the tag targets the tested commit and the GitHub
contributors page contains only intended authors.
