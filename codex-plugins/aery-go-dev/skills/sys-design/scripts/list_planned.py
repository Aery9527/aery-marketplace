#!/usr/bin/env python3
"""List the links in a design document whose target does not exist yet.

Phase 1 marks such a link with (planned) and Phase 2 clears it once the target
is real. Only a marker following a Markdown link counts, so the word appearing
in ordinary prose is never reported as an open promise.
"""

import re
import sys

PLANNED = re.compile(r"\]\((?P<target>[^)\s]+)[^)]*\)\s*\(planned\)")


def find(path):
    """Yield (line number, link target) for every planned link in one file."""
    with open(path, encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, start=1):
            for match in PLANNED.finditer(line):
                yield number, match.group("target")


def main(argv):
    if not argv:
        print("usage: list_planned.py <file>...", file=sys.stderr)
        return 2

    status = 0
    for path in argv:
        try:
            for number, target in find(path):
                print("{}:{}\t{}".format(path, number, target))
        except OSError as error:
            print("ERROR {}: {}".format(path, error), file=sys.stderr)
            status = 1

    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
