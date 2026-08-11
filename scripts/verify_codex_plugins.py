import json
import pathlib


def normalize_relative_path(path: str) -> pathlib.Path:
    if path.startswith("./") or path.startswith(".\\"):
        trimmed = path[2:]
    else:
        trimmed = path
    if not trimmed:
        raise ValueError(f"Relative path cannot be empty: {path!r}")
    return pathlib.Path(trimmed.replace("\\", "/"))


# A skill may carry an overlay directory that sync lifts to the Codex plugin root
# instead of copying it into the packaged skill.
OVERLAY_DIR_NAME = "codex-plugin"

# The plugin root is a closed set: these two entries are owned by the sync script,
# and every other entry must come from an overlay.
RESERVED_PLUGIN_ROOT_ENTRIES = frozenset({".codex-plugin", "skills"})


def collect_entries(
    root: pathlib.Path,
    *,
    exclude_zh_tw: bool,
    exclude_top_level: str | None = None,
) -> tuple[set[pathlib.Path], set[pathlib.Path]]:
    directories: set[pathlib.Path] = set()
    files: set[pathlib.Path] = set()
    for path in sorted(root.rglob("*")):
        relative_path = path.relative_to(root)
        if exclude_top_level is not None and relative_path.parts[0] == exclude_top_level:
            continue
        if path.is_dir():
            directories.add(relative_path)
        elif not (exclude_zh_tw and path.name.endswith("_zhTW.md")):
            files.add(relative_path)
    return directories, files


def compare_trees(
    source_root: pathlib.Path,
    target_root: pathlib.Path,
    repo_root: pathlib.Path,
    *,
    exclude_top_level: str | None = None,
) -> list[str]:
    errors: list[str] = []
    expected_directories, expected_files = collect_entries(
        source_root, exclude_zh_tw=True, exclude_top_level=exclude_top_level
    )
    actual_directories, actual_files = collect_entries(target_root, exclude_zh_tw=False)

    for relative_path in sorted(expected_directories - actual_directories):
        errors.append(
            "Missing directory: "
            f"{(target_root / relative_path).relative_to(repo_root)} "
            f"(expected from {(source_root / relative_path).relative_to(repo_root)})"
        )

    for relative_path in sorted(actual_directories - expected_directories):
        errors.append(f"Unexpected directory: {(target_root / relative_path).relative_to(repo_root)}")

    for relative_path in sorted(expected_files - actual_files):
        errors.append(
            "Missing file: "
            f"{(target_root / relative_path).relative_to(repo_root)} "
            f"(expected from {(source_root / relative_path).relative_to(repo_root)})"
        )

    for relative_path in sorted(actual_files - expected_files):
        errors.append(f"Unexpected file: {(target_root / relative_path).relative_to(repo_root)}")

    for relative_path in sorted(expected_files & actual_files):
        source_file = source_root / relative_path
        target_file = target_root / relative_path
        if source_file.read_bytes() != target_file.read_bytes():
            errors.append(
                "Content mismatch: "
                f"{target_file.relative_to(repo_root)} != {source_file.relative_to(repo_root)}"
            )

    return errors


def verify_overlay(
    overlay_root: pathlib.Path,
    plugin_root: pathlib.Path,
    repo_root: pathlib.Path,
) -> tuple[list[str], set[str]]:
    """Compare one overlay against the plugin root, and report which root entries it owns."""
    errors: list[str] = []
    owned_names: set[str] = set()
    for source_entry in sorted(overlay_root.iterdir()):
        if source_entry.is_file() and source_entry.name.endswith("_zhTW.md"):
            continue

        owned_names.add(source_entry.name)
        target_entry = plugin_root / source_entry.name
        if not target_entry.exists():
            errors.append(
                f"Missing overlay entry: {target_entry.relative_to(repo_root)} "
                f"(expected from {source_entry.relative_to(repo_root)})"
            )
            continue

        if source_entry.is_dir():
            errors.extend(compare_trees(source_entry, target_entry, repo_root))
        elif source_entry.read_bytes() != target_entry.read_bytes():
            errors.append(
                "Content mismatch: "
                f"{target_entry.relative_to(repo_root)} != {source_entry.relative_to(repo_root)}"
            )

    return errors, owned_names


def verify_repo(repo_root: pathlib.Path) -> list[str]:
    marketplace_path = repo_root / ".claude-plugin" / "marketplace.json"
    marketplace = json.loads(marketplace_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    for plugin in marketplace.get("plugins", []):
        plugin_name = str(plugin["name"])
        plugin_source_root = repo_root / normalize_relative_path(str(plugin["source"]))
        plugin_root = repo_root / "codex-plugins" / plugin_name
        target_skills_root = plugin_root / "skills"

        if not target_skills_root.is_dir():
            errors.append(f"Missing skills directory: {target_skills_root.relative_to(repo_root)}")
            continue

        declared_skill_names: set[str] = set()
        overlay_owned_names: set[str] = set()
        for skill_path in plugin.get("skills", []):
            normalized_skill_path = normalize_relative_path(str(skill_path))
            skill_name = normalized_skill_path.name
            declared_skill_names.add(skill_name)

            source_skill_root = plugin_source_root / normalized_skill_path
            target_skill_root = target_skills_root / skill_name

            if not source_skill_root.is_dir():
                errors.append(f"Missing source skill directory: {source_skill_root.relative_to(repo_root)}")
                continue

            if not target_skill_root.is_dir():
                errors.append(f"Missing target skill directory: {target_skill_root.relative_to(repo_root)}")
                continue

            errors.extend(
                compare_trees(
                    source_skill_root,
                    target_skill_root,
                    repo_root,
                    exclude_top_level=OVERLAY_DIR_NAME,
                )
            )

            overlay_root = source_skill_root / OVERLAY_DIR_NAME
            if overlay_root.is_dir():
                overlay_errors, owned_names = verify_overlay(
                    overlay_root, plugin_root, repo_root
                )
                errors.extend(overlay_errors)
                for name in sorted(owned_names & overlay_owned_names):
                    errors.append(
                        f"Overlay entry '{name}' is declared by more than one skill "
                        f"in plugin '{plugin_name}'"
                    )
                overlay_owned_names |= owned_names

        for path in sorted(target_skills_root.iterdir()):
            if path.is_dir() and path.name not in declared_skill_names:
                errors.append(f"Unexpected skill directory: {path.relative_to(repo_root)}")
            elif path.is_file():
                errors.append(f"Unexpected file in skills root: {path.relative_to(repo_root)}")

        for path in sorted(plugin_root.iterdir()):
            if path.name in RESERVED_PLUGIN_ROOT_ENTRIES:
                continue
            if path.name not in overlay_owned_names:
                errors.append(f"Unexpected plugin root entry: {path.relative_to(repo_root)}")

    return errors


def main() -> int:
    repo_root = pathlib.Path(__file__).resolve().parents[1]
    errors = verify_repo(repo_root)
    if errors:
        print("Codex plugin verification failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Codex plugin verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
