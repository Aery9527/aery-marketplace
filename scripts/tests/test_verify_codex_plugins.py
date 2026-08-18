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

    def test_passes_when_overlay_is_lifted_to_plugin_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_overlay_fixture(repo)
            self._write_text(repo / "codex-plugins" / "demo" / "hooks.json", "{}\n")
            self._write_text(
                repo / "codex-plugins" / "demo" / "commands" / "run.md", "# run\n"
            )

            errors = verify_repo(repo)

        self.assertEqual(errors, [])

    def test_fails_when_overlay_entry_is_missing_from_plugin_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_overlay_fixture(repo)
            self._write_text(repo / "codex-plugins" / "demo" / "hooks.json", "{}\n")

            errors = verify_repo(repo)

        self.assertTrue(any("Missing overlay entry" in error for error in errors))

    def test_fails_when_plugin_root_keeps_a_stale_entry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_overlay_fixture(repo)
            self._write_text(repo / "codex-plugins" / "demo" / "hooks.json", "{}\n")
            self._write_text(
                repo / "codex-plugins" / "demo" / "commands" / "run.md", "# run\n"
            )
            self._write_text(repo / "codex-plugins" / "demo" / "NOTICE", "stale\n")

            errors = verify_repo(repo)

        self.assertTrue(any("Unexpected plugin root entry" in error for error in errors))

    def test_overlay_zh_tw_file_is_not_expected_at_plugin_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_overlay_fixture(repo)
            self._write_text(
                repo / "skills" / "alpha" / "codex-plugin" / "NOTICE_zhTW.md", "# zh\n"
            )
            self._write_text(repo / "codex-plugins" / "demo" / "hooks.json", "{}\n")
            self._write_text(
                repo / "codex-plugins" / "demo" / "commands" / "run.md", "# run\n"
            )

            errors = verify_repo(repo)

        self.assertEqual(errors, [])

    def test_fails_when_two_skills_declare_the_same_overlay_entry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[
                    {
                        "name": "demo",
                        "source": "./skills",
                        "skills": ["./alpha", "./beta"],
                    }
                ],
            )
            for skill in ("alpha", "beta"):
                self._write_text(repo / "skills" / skill / "SKILL.md", f"# {skill}\n")
                self._write_text(
                    repo / "skills" / skill / "codex-plugin" / "hooks.json", "{}\n"
                )
                self._write_text(
                    repo / "codex-plugins" / "demo" / "skills" / skill / "SKILL.md",
                    f"# {skill}\n",
                )
            self._write_text(repo / "codex-plugins" / "demo" / "hooks.json", "{}\n")

            errors = verify_repo(repo)

        self.assertTrue(
            any("declared by more than one skill" in error for error in errors)
        )

    def test_verifies_a_bundle_declared_only_for_codex(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = pathlib.Path(tmp_dir)
            self._write_marketplace(
                repo,
                plugins=[],
                codex_only_plugins=[
                    {
                        "name": "codex-only",
                        "source": "./skills",
                        "skills": ["./alpha"],
                    }
                ],
            )
            self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
            self._write_text(
                repo / "codex-plugins" / "codex-only" / "skills" / "alpha" / "SKILL.md",
                "# drifted\n",
            )

            errors = verify_repo(repo)

        self.assertEqual(len(errors), 1)
        self.assertIn("Content mismatch", errors[0])

    def _write_overlay_fixture(self, repo: pathlib.Path) -> None:
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
        self._write_plugin_manifest(repo, "demo", hooks=True)
        self._write_text(repo / "skills" / "alpha" / "SKILL.md", "# alpha\n")
        self._write_text(repo / "skills" / "alpha" / "codex-plugin" / "hooks.json", "{}\n")
        self._write_text(
            repo / "skills" / "alpha" / "codex-plugin" / "commands" / "run.md", "# run\n"
        )
        self._write_text(
            repo / "codex-plugins" / "demo" / "skills" / "alpha" / "SKILL.md", "# alpha\n"
        )

    def _write_marketplace(
        self,
        repo: pathlib.Path,
        plugins: list[dict[str, object]],
        codex_only_plugins: list[dict[str, object]] | None = None,
    ) -> None:
        codex_only_plugins = codex_only_plugins or []
        content = {
            "metadata": {"version": "0.2.0"},
            "plugins": plugins,
        }
        self._write_text(
            repo / ".claude-plugin" / "marketplace.json",
            json.dumps(content, indent=2) + "\n",
        )
        self._write_text(
            repo / ".agents" / "plugins" / "codex-only-bundles.json",
            json.dumps({"plugins": codex_only_plugins}, indent=2) + "\n",
        )
        for plugin in [*plugins, *codex_only_plugins]:
            self._write_plugin_manifest(repo, str(plugin["name"]))

    def _write_plugin_manifest(
        self, repo: pathlib.Path, plugin_name: str, hooks: bool = False
    ) -> None:
        manifest: dict[str, object] = {"name": plugin_name, "version": "0.2.0"}
        if hooks:
            manifest["hooks"] = "./hooks.json"
        self._write_text(
            repo / "codex-plugins" / plugin_name / ".codex-plugin" / "plugin.json",
            json.dumps(manifest, indent=2) + "\n",
        )

    def _write_text(self, path: pathlib.Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
