#!/usr/bin/env python3
"""Count the prose lines of a design document, excluding Mermaid blocks.

The 300-line limit measures cognitive load, and a diagram is read as a picture
rather than as text, so fenced Mermaid blocks do not count against it.
"""

import sys

MERMAID_INFO = "mermaid"


def parse_fence(line):
    """Split a line into its fence character, run length, and info string.

    Returns None when the line is not a fence. Four or more leading spaces make
    it an indented code block rather than a fence, so it is left as ordinary
    text: mistaking one for a fence would drop real prose from the count and let
    an oversized document slip through.
    """
    marker = line.rstrip()
    indent = len(marker) - len(marker.lstrip(" "))
    if indent > 3:
        return None

    marker = marker[indent:]
    for char in ("`", "~"):
        if marker.startswith(char * 3):
            run = len(marker) - len(marker.lstrip(char))
            return char, run, marker[run:].strip(), indent
    return None


def is_mermaid(char, run, info, indent):
    """Report whether a fence opens a Mermaid block in its canonical form.

    Only exactly three backticks in column one, with the lower-case info string,
    qualify. An indented fence belongs to a list item or blockquote, and telling
    that apart from a top-level fence needs a full container parser, so it counts
    as ordinary text instead. Any other fence still gets tracked as a block, so a
    ```mermaid quoted inside it reads as content.
    """
    return char == "`" and run == 3 and info == MERMAID_INFO and indent == 0


def closes(parsed, fence):
    """Report whether a fence line closes the block currently open.

    A closing fence carries no info string and repeats the opening character at
    least as many times, so a ```mermaid nested inside a ````` block or a bash
    block is read as content rather than as a block of its own.
    """
    if not parsed:
        return False
    char, run, info, _ = parsed
    return char == fence[0] and run >= fence[1] and not info


def count(path):
    """Return the counted lines of one document.

    Raises ValueError when a Mermaid block is never closed, because the count
    that follows such a fence would silently swallow the rest of the file.
    """
    counted = 0
    fence = None

    with open(path, encoding="utf-8-sig") as handle:
        for line in handle:
            parsed = parse_fence(line)

            if fence is None:
                if parsed:
                    char, run, info, indent = parsed
                    fence = (char, run, is_mermaid(char, run, info, indent))
                    if fence[2]:
                        continue
                counted += 1
            elif closes(parsed, fence):
                was_mermaid = fence[2]
                fence = None
                if not was_mermaid:
                    counted += 1
            elif not fence[2]:
                counted += 1

    if fence is not None and fence[2]:
        raise ValueError("unclosed mermaid fence")

    return counted


def main(argv):
    if not argv:
        print("usage: count_lines.py <file>...", file=sys.stderr)
        return 2

    status = 0
    for path in argv:
        try:
            print("{}\t{}".format(count(path), path))
        except (OSError, ValueError) as error:
            print("ERROR {}: {}".format(path, error), file=sys.stderr)
            status = 1

    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
