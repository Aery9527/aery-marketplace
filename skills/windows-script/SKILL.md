---
name: windows-script
description: >-
  Use when writing, modifying, or reviewing any Windows script (.ps1, .bat,
  .cmd), or handling PowerShell encoding, BOM, line endings, Windows
  PowerShell 5.1 compatibility, non-ASCII content, hook scripts, init.ps1,
  or Windows CLI automation. Whenever a task involves .ps1, PowerShell,
  UTF-8, BOM, CRLF/LF, or batch script migration, use this skill first.
---

# Windows Script Development Guidelines

## Quick Navigation

- [Ban .bat / .cmd — Always Rewrite as .ps1](#-ban-bat--cmd--always-rewrite-as-ps1)
- [PowerShell (.ps1) Rules](#powershell-ps1-rules)
- [Script Header Checklist](#script-header-checklist)
- [Common Pitfalls](#common-pitfalls)

## ⛔ Ban .bat / .cmd — Always Rewrite as .ps1

> **This is a hard rule, not a suggestion.**

`.bat` / `.cmd` are legacy technology not worth further investment. When asked to modify, extend, debug, or review a batch script, the default strategy is **not to patch it** — rewrite it as `.ps1` instead.

**PowerShell is the default replacement**: consistent syntax and error handling, UTF-8 friendly, far more readable and maintainable, and better suited for modern CLI, CI, and automation workflows.

**If an existing .bat needs changes → rewrite it as .ps1. Do not patch .bat.**

---

[Back to top](#quick-navigation)

## PowerShell (.ps1) Rules

### 1. Error Handling — Default Is Silent Swallow

PowerShell cmdlets default to `$ErrorActionPreference = 'Continue'`: errors do not throw exceptions and the script keeps running. Any script that needs fail-fast behavior must set this at the top:

```powershell
$ErrorActionPreference = 'Stop'
```

Or per-command:
```powershell
Get-Item "nonexistent" -ErrorAction Stop
```

Failures of external programs (`git`, `go`, etc.) do **not** trigger `$ErrorActionPreference`; check manually:
```powershell
git merge $source
if ($LASTEXITCODE -ne 0) { throw "merge failed: exit $LASTEXITCODE" }
```

---

### 2. `$?` vs `$LASTEXITCODE`

| Variable | Applies to | Type |
|----------|-----------|------|
| `$?` | PowerShell cmdlets | `$true` / `$false` |
| `$LASTEXITCODE` | External executables (.exe / .bat) | Integer exit code |

```powershell
git fetch            # external program
$LASTEXITCODE        # use this

Get-Item "..."       # cmdlet
$?                   # use this
```

---

### 3. String Quotes

- **Single quotes** `'...'`: literal — variables are NOT expanded
- **Double quotes** `"..."`: interpolated — `$var` and escape sequences like `` `n `` are expanded

```powershell
$name = "World"
Write-Host 'Hello $name'   # prints: Hello $name
Write-Host "Hello $name"   # prints: Hello World
```

Paths with spaces must be quoted; invoke executables with spaces using `&`:
```powershell
& "C:\Program Files\Git\bin\git.exe" status
```

---

### 4. Exit Code Propagation

A PowerShell script exits with code 0 by default, even if internal errors occurred. When the caller (.bat or CI) needs a meaningful exit code:

```powershell
# at end of script
exit $LASTEXITCODE

# or explicit
if ($failed) { exit 1 }
exit 0
```

---

### 5. Array Boundaries

Declare empty arrays with `@()`, otherwise `$null` causes `.Count` to return null and throws in strict mode:

```powershell
$items = @()              # safe: $items.Count = 0
$items = $null            # unsafe: $items.Count is null, errors in strict mode
```

When a pipeline returns a single element it may be unwrapped into a plain object; force array type with `@()`:
```powershell
$result = @(Get-ChildItem "." -Filter "*.go")   # always an array
```

---

### 6. File Encoding / BOM — Do Not Save 5.1-Compatible `.ps1` as UTF-8 Without BOM

`pwsh` 7+ handles UTF-8 without BOM correctly. **This does not mean** `powershell.exe` (Windows PowerShell 5.1) does. If a `.ps1` file contains any non-ASCII characters (localized messages, banners, error strings, comments), 5.1 may misdetect the encoding when the file is **UTF-8 without BOM**, causing parse errors, string truncation, or garbled output.

**Hard rules:**

- If the script must support `powershell.exe` 5.1 **and** the file contains non-ASCII characters, **save as UTF-8 with BOM** by default.
- Do not let an editor, formatter, normalizer, or a "whole repo is UTF-8 no BOM" convention silently strip the BOM from such `.ps1` files.
- **BOM and line endings are independent concerns**: needing a BOM does not mean switching to CRLF; line endings still follow the repo's `.gitattributes` / `.editorconfig`.
- If the repo explicitly defines `charset` / `eol` for `*.ps1`, obey that. When undefined, choose **UTF-8 with BOM** conservatively for any 5.1 compatibility requirement.
- Unless you can confirm the script targets `pwsh` 7+ only and the entire file is ASCII, do not downgrade to UTF-8 without BOM.

After editing such a file, verify with 5.1 when the environment allows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\script.ps1
```

---

### 7. Reading External UTF-8 Text Files — Always Use `-Encoding UTF8`

`Get-Content` in Windows PowerShell 5.1 defaults to the system OEM encoding (CP950/Big5 on Traditional Chinese machines, GBK on Simplified Chinese machines) even when the target file is UTF-8. Reading config files, rule files, or data files that contain non-ASCII content without specifying encoding causes **silent content corruption**.

#### The Core Danger: Big5/GBK Decoder Consumes Newlines

When the Big5/GBK decoder encounters a UTF-8 multibyte sequence, it may misinterpret a byte as the second half of a double-byte character whose value is `0x0A` (LF), **consuming the newline as part of a character**. Two physical lines are silently merged into one.

```
# Config file (UTF-8, two separate lines):
# This comment describes the setting below.
some-key    some-value

# Get-Content without -Encoding UTF8 decoded as Big5:
# "# This comment describes the setting below.some-key    some-value"  <- merged into one line!
```

**Consequence**: the merged line starts with `#` → silently skipped by comment-filter logic (`StartsWith('#')` / `continue`) → the config entry **is never loaded**, the feature or guard becomes a no-op with no error message.

#### Hard Rule: Always Add `-Encoding UTF8` to Every `Get-Content` That Reads External Files

```powershell
# unsafe: relies on system OEM encoding; non-ASCII UTF-8 files may have lines eaten
foreach ($line in Get-Content $configFile) { ... }

# safe: explicit UTF-8; byte sequences are decoded correctly, newlines are preserved
foreach ($line in Get-Content $configFile -Encoding UTF8) { ... }
```

Applies to any external file the script reads whose content may contain non-ASCII characters (including UTF-8 comments): `.txt`, `.json`, `.yaml`, `.csv`, config files, rule files, and any other text file.

> **Note**: This issue is independent of Rule 6's `.ps1` BOM issue:
> - Rule 6: The `.ps1` script file itself needs a BOM so 5.1 can **parse the script syntax** correctly.
> - This rule: When **reading external data files**, you must explicitly specify `-Encoding UTF8` — unrelated to how the script file itself is saved.

---

### 8. Non-ASCII / UTF-8 Console Output

Windows PowerShell (5.x) defaults to CP950 (Traditional Chinese) or GBK (Simplified Chinese) for console encoding, which may garble non-ASCII output or truncate `git` output:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding          = [System.Text.Encoding]::UTF8
```

PowerShell 7+ defaults to UTF-8; this is typically not needed there.

---

### 9. CWD Protection — Do Not Pollute the Caller's Working Directory

A bare `Set-Location` at the top level of a script **permanently changes the caller's (terminal's) working directory**. After the script exits, the CWD is no longer the original location and the user must manually `cd` back.

**Correct approach**: save the original location at the top and restore it in a `try/finally`:

```powershell
$originalLocation = Get-Location
Set-Location (Join-Path $PSScriptRoot "..")
try {
    # ... script body ...
} finally {
    Set-Location $originalLocation
}
```

> `exit` inside a `try` block still executes `finally`, so this pattern is safe on all exit paths.

**Do not use `Push-Location` / `Pop-Location`**: if the script has inner `Push-Location $sub` calls for submodules and then exits early via `exit`, `return`, or an error, those inner pushes are not popped, and the `Pop-Location` in `finally` pops the inner push instead of the original location — CWD is still polluted. The `$originalLocation` pattern does not rely on the location stack and is correct on any execution path.

---

### 10. Colored Output — Required for All Interactive Scripts

**Any script that users run directly in a terminal must use `-ForegroundColor` to make output readable.** Pure background / CI scripts are exempt.

**Color standard (must follow):**

| Scenario | Color | Example |
|----------|-------|---------|
| Main title / Banner | `Cyan` | `=== Switch Branch ===` |
| Section header | `Blue` | `--- Summary ---` |
| Success `[OK]` | `Green` | `[OK] Switched to develop` |
| Error `[X] ERROR` | `Red` | `[X] ERROR: checkout failed` |
| Warning `[!]` / Cancel | `Yellow` | `[!] Cancelled` |
| Repo / resource name row | `Cyan` | `  game-go-common` |
| Menu item number `[1]` | `Green` | `[1] develop` |
| Menu special option `[e]` | `Cyan` | `[e] enter branch name` |
| Summary success count | `Green` | `Success: 6` |
| Summary failure count | `Red` | `Failed: 1` |

```powershell
Write-Host "=== Switch Branch ===" -ForegroundColor Cyan
Write-Host "  [OK] Switched to $branch" -ForegroundColor Green
Write-Host "  [X] ERROR: checkout failed" -ForegroundColor Red
Write-Host "  [!] Cancelled by user" -ForegroundColor Yellow
Write-Host "--- Summary ---" -ForegroundColor Blue
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed:  $failCount"  -ForegroundColor Red
```

---

[Back to top](#quick-navigation)

## Script Header Checklist

```powershell
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding          = [System.Text.Encoding]::UTF8

# If the script must support powershell.exe 5.1 and the file contains non-ASCII, save as UTF-8 with BOM.
# CWD protection: use $originalLocation + try/finally; bare Set-Location is forbidden.
$originalLocation = Get-Location
Set-Location (Join-Path $PSScriptRoot "..")
try {
    # ... script body ...
} finally {
    Set-Location $originalLocation
}
```

**Always add `-Encoding UTF8` when reading external text files (see Rule 7):**

```powershell
# correct: reading a config file that may contain non-ASCII content
foreach ($line in Get-Content $configFile -Encoding UTF8) { ... }
$content = Get-Content $dataFile -Raw -Encoding UTF8
```

### Path Separators

Use `Join-Path` or `/` (both work in PowerShell); always quote paths that contain spaces.

```powershell
$path = Join-Path $PSScriptRoot ".." "scripts" "go-mod.ps1"
& "C:\Program Files\Git\bin\git.exe" status
```

[Back to top](#quick-navigation)

## Common Pitfalls

1. **"`pwsh` runs fine, so `powershell.exe` must be fine too."**  
   Wrong. `pwsh` 7+ is much more forgiving about UTF-8 without BOM; 5.1 is not.

2. **"I already set console `OutputEncoding` to UTF-8, so file encoding doesn't matter."**  
   Wrong. Console output encoding and the storage encoding of the `.ps1` file itself are separate concerns.

3. **"If I need a BOM I should also switch to CRLF."**  
   Wrong. BOM and line endings are unrelated; line endings still follow repo rules.

4. **"It's just a one-line comment or Chinese string change — it won't affect script execution."**  
   Wrong. The moment a file changes from all-ASCII to containing non-ASCII, the 5.1 risk applies.

5. **"`Get-Content` reading a UTF-8 config file doesn't need encoding specified — all the meaningful fields look like ASCII anyway."**  
   Wrong. **Chinese comments in the file** are sufficient to cause the Big5/GBK decoder to consume a newline (`0x0A`), merging the comment line with the next config line, which is then silently skipped by comment-filter logic so the config entry never takes effect. Always add `-Encoding UTF8`.

[Back to top](#quick-navigation)
