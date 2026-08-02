#!/usr/bin/env python3
"""List the links in a design document whose target does not exist yet.

Phase 1 marks such a link with (planned) and Phase 2 clears it once the target
is real. Only a marker following an inline Markdown link counts, so the word
appearing in ordinary prose is never reported as an open promise.

Recognizes the canonical form the skill requires: a single-line inline link
whose destination carries no space or parenthesis. Reference-style links and
destinations needing escapes are out of contract, which is why the skill
forbids them for planned links — a missed promise would read as a kept one.
"""

import re
import sys

# An inline Markdown link, an optional title, then the marker. Requiring the
# opening bracket keeps a stray fragment from matching, and the lookbehind
# keeps image syntax out.
PLANNED = re.compile(
    r'(?<!!)\[[^\]]*\]\((?P<target>[^)\s]+)(?:\s+"[^"]*")?\)\s*\(planned\)'
)


INLINE_CODE = re.compile(r"`[^`]*`")


def blank_inline_code(line):
    """Blank out inline code so a link quoted as an example is not a promise."""
    return INLINE_CODE.sub(lambda match: " " * len(match.group()), line)


def find(path):
    """Yield (line number, link target) for every planned link in one file."""
    with open(path, encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, start=1):
            for match in PLANNED.finditer(blank_inline_code(line.rstrip("\n"))):
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
