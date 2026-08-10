#!/usr/bin/env python3
"""List deferred module-change plans below repository paths.

An sd-*-plan.md file is intentionally outside the design-document graph. This
search is its discovery mechanism, so plans may remain unlinked until a user
chooses one for execution.
"""

import os
import re
import sys
from pathlib import Path

PLAN_NAME = re.compile(r"^sd-.+-plan\.md$")
SKIPPED_DIRECTORIES = frozenset({".git", ".hg", ".svn", ".worktree"})


def is_plan(path):
    """Report whether a path uses the deferred-plan filename contract."""
    return path.is_file() and PLAN_NAME.fullmatch(path.name) is not None


def raise_walk_error(error):
    """Turn an unreadable subtree into a visible search failure."""
    raise error


def find(root):
    """Yield deferred plans below one file or directory in stable order."""
    root = Path(root)
    if not root.exists():
        raise FileNotFoundError(root)
    if root.is_file():
        if is_plan(root):
            yield root
        return

    matches = []
    for current, directories, files in os.walk(root, onerror=raise_walk_error):
        directories[:] = sorted(
            name for name in directories if name not in SKIPPED_DIRECTORIES
        )
        current = Path(current)
        matches.extend(
            current / name for name in files if PLAN_NAME.fullmatch(name)
        )

    yield from sorted(matches, key=lambda path: path.as_posix().casefold())


def main(argv):
    roots = argv or ["."]
    status = 0
    seen = set()

    for root in roots:
        try:
            for plan in find(root):
                identity = plan.resolve()
                if identity in seen:
                    continue
                seen.add(identity)
                print(plan.as_posix())
        except OSError as error:
            print("ERROR {}: {}".format(root, error), file=sys.stderr)
            status = 1

    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
