export function parseArgs(argv, config = {}) {
  const valueOptions = new Set(config.valueOptions ?? []);
  const booleanOptions = new Set(config.booleanOptions ?? []);
  const aliasMap = config.aliasMap ?? {};
  const options = {};
  const positionals = [];
  let passthrough = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (passthrough) {
      positionals.push(token);
      continue;
    }

    if (token === "--") {
      passthrough = true;
      continue;
    }

    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }

    if (token.startsWith("--")) {
      const [rawKey, inlineValue] = token.slice(2).split("=", 2);
      const key = aliasMap[rawKey] ?? rawKey;

      if (booleanOptions.has(key)) {
        options[key] = inlineValue === undefined ? true : inlineValue !== "false";
        continue;
      }

      if (valueOptions.has(key)) {
        const nextValue = inlineValue ?? argv[index + 1];
        // A flag is never the value of another flag. Taking one would swallow it whole:
        // `--resume-session --fresh` would record `--fresh` as a session id and leave the
        // check that refuses those two together with nothing to refuse. A value that really
        // does begin with `--` is written `--option=--value`, where nothing is ambiguous.
        if (nextValue === undefined || (inlineValue === undefined && String(nextValue).startsWith("--"))) {
          throw new Error(`Missing value for --${rawKey}`);
        }
        options[key] = nextValue;
        if (inlineValue === undefined) {
          index += 1;
        }
        continue;
      }

      positionals.push(token);
      continue;
    }

    const shortKey = token.slice(1);
    const key = aliasMap[shortKey] ?? shortKey;

    if (booleanOptions.has(key)) {
      options[key] = true;
      continue;
    }

    if (valueOptions.has(key)) {
      const nextValue = argv[index + 1];
      if (nextValue === undefined || String(nextValue).startsWith("--")) {
        throw new Error(`Missing value for -${shortKey}`);
      }
      options[key] = nextValue;
      index += 1;
      continue;
    }

    positionals.push(token);
  }

  return { options, positionals };
}

export function splitRawArgumentString(raw) {
  const tokens = [];
  let current = "";
  let quoted = false;
  let started = false;

  // The whole grammar: whitespace separates arguments, a double quote groups until its
  // matching double quote, and every other character stands for itself. An apostrophe is a
  // character because requests contain them — `don't modify the API`, `C:\Users\O'Brien` — and a
  // backslash is a character because paths contain those. Nothing escapes a quote, so
  // `"C:\Program Files\"` ends where it looks like it ends. An unclosed quote is an error:
  // running it to the end would hand the rest of the request to whatever the quote opened.
  for (const character of raw) {
    if (character === '"') {
      quoted = !quoted;
      started = true;
      continue;
    }

    if (!quoted && /\s/.test(character)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }

    current += character;
    started = true;
  }

  if (quoted) {
    throw new Error("Unbalanced double quote in the forwarded arguments.");
  }

  if (started) {
    tokens.push(current);
  }

  return tokens;
}
