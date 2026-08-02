#!/usr/bin/env python3
"""List the links in a design document whose target does not exist yet.

Phase 1 marks such a link with (planned) and Phase 2 clears it once the target
is real. Only a marker following an inline Markdown link counts, so the word
appearing in ordinary prose is never reported as an open promise.

Recognizes the canonical form the skill requires: a single-line inline link,
no title, whose label carries no bracket and whose destination carries no space
or parenthesis. Anything else is out of contract, which is why the skill forbids
it for planned links — a missed promise would read as a kept one.

Makes no attempt to tell a real link from one quoted as an example. The skill
forbids writing the planned-link shape anywhere it is not a genuine promise,
which is a rule a document can follow and a partial Markdown parser cannot
enforce without producing false negatives.
"""

import re
import sys

# An inline Markdown link followed by the marker. Requiring the opening bracket
# keeps a stray fragment from matching, and the lookbehind keeps image syntax
# out. No title is accepted, so the destination is the whole of the parentheses.
PLANNED = re.compile(
    r"(?<!!)\[[^\][]*\]\((?P<target>[^)\s]+)\)\s*\(planned\)"
)


def find(path):
    """Yield (line number, link target) for every planned link in one file."""
    with open(path, encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, start=1):
            for match in PLANNED.finditer(line.rstrip("\n")):
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
