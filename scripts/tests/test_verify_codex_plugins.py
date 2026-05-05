import json
import pathlib
import sys
import tempfile
import unittest


SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

from verify_codex_plugins import verify_repo  # type: ignore


class VerifyCodexPluginsTests(unittest.TestCase):
    def test_passes_when_target_matches_source_without_zh_tw_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "skills" / "alpha" / "SKILL_zhTW.md", "# zh\n")
            self._write_text(repo / "skills" / "alpha" / "references" / "guide.md", "guide\n")
            self._write_text(
                repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md",
                "# alpha\n",
            )
            self._write_text(
                repo / "codex-plugins" / "demo" / "skills" / "alpha" / "references" / "guide.md",
                "guide\n",
            )

            errors = verify_repo(repo)

        self.assertEqual(errors, [])

    def test_fails_when_target_contains_extra_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "alpha" / "extra.md", "extra\n")

            errors = verify_repo(repo)

        self.assertTrue(any("Unexpected file" in error for error in errors))

    def test_fails_when_target_is_missing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "skills" / "alpha" / "references" / "guide.md", "guide\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md", "# alpha\n")

            errors = verify_repo(repo)

        self.assertTrue(any("Missing file" in error for error in errors))

    def test_fails_when_file_content_differs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md", "# beta\n")

            errors = verify_repo(repo)

        self.assertTrue(any("Content mismatch" in error for error in errors))

    def test_fails_when_target_contains_undeclared_skill_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "beta" / "SKILL.md", "# beta\n")

            errors = verify_repo(repo)

        self.assertTrue(any("Unexpected skill directory" in error for error in errors))

    def test_fails_when_target_contains_extra_empty_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            (repo / "codex-plugins" / "demo" / "skills" / "alpha" / "extra-dir").mkdir(parents=True)

            errors = verify_repo(repo)

        self.assertTrue(any("Unexpected directory" in error for error in errors))

    def test_fails_when_target_skills_root_contains_extra_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(repo / "codex-plugins" / "demo" / "skills" / "README.md", "unexpected\n")

            errors = verify_repo(repo)

        self.assertTrue(any("Unexpected file in skills root" in error for error in errors))

    def _write_marketplace(self, repo: pathlib.Path, plugins: list[dict[str, object]]) -> None:
        content = {
            "metadata": {"version": "0.2.0"},
            "plugins": plugins,
        }
        self._write_text(
            repo / ".claude-plugin" / "marketplace.json",
            json.dumps(content, indent=2) + "\n",
        )

    def _write_text(self, path: pathlib.Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
