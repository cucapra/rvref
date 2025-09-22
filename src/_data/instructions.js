const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// Root to UDB I-extension instruction YAMLs
const I_DIR = path.join(process.cwd(), "udb", "spec", "std", "isa", "inst", "I");

function readYamlFile(p) {
  const txt = fs.readFileSync(p, "utf8");
  return yaml.load(txt);
}

// Returns array of 32 entries (bit 31..0), each entry is either '0'/'1' or '-'
function parseMatchBits(matchStr) {
  if (!matchStr || matchStr.length !== 32) return null;
  return matchStr.split("");
}

function computeFields(doc) {
  // Returns field descriptors with label, from, to, width, kind
  const fields = [];
  if (!doc.encoding) return fields;
  const match = parseMatchBits(doc.encoding.match || "");
  // Variables with explicit ranges
  const vars = Array.isArray(doc.encoding.variables) ? doc.encoding.variables : [];
  for (const v of vars) {
    // location format: "hi-lo" or single number
    const loc = String(v.location);
    let hi, lo;
    if (loc.includes("-")) {
      [hi, lo] = loc.split("-").map(n => parseInt(n, 10));
    } else {
      hi = lo = parseInt(loc, 10);
    }
    const width = hi - lo + 1;
    fields.push({ label: v.name, from: hi, to: lo, width, kind: "var" });
  }
  // Constants: opcode (6..0), funct3 (14..12), possibly funct7 (31..25)
  if (match) {
    const sliceBits = (hi, lo) => match.slice(31 - hi, 32 - lo).join("");
    const opcode = sliceBits(6, 0);
    if (/^[01]{7}$/.test(opcode)) {
      fields.push({ label: `opcode=${opcode}`, from: 6, to: 0, width: 7, kind: "const" });
    }
    const funct3 = sliceBits(14, 12);
    if (/^[01]{3}$/.test(funct3)) {
      fields.push({ label: `funct3=${funct3}`, from: 14, to: 12, width: 3, kind: "const" });
    }
    const funct7 = sliceBits(31, 25);
    if (/^[01]{7}$/.test(funct7) && !/^[-]{7}$/.test(funct7)) {
      fields.push({ label: `funct7=${funct7}`, from: 31, to: 25, width: 7, kind: "const" });
    }
  }
  // Sort by descending bit index
  fields.sort((a, b) => b.from - a.from);
  return fields;
}

function detectEncodingType(doc) {
  // Heuristic for base-I encodings
  if (!doc.encoding || !Array.isArray(doc.encoding.variables)) return undefined;
  const vars = Object.fromEntries(doc.encoding.variables.map(v => [v.name, String(v.location)]));
  const eq = (name, hi, lo) => vars[name] === `${hi}-${lo}`;
  if (eq("xd", 11, 7) && eq("xs1", 19, 15) && vars["imm"] === "31-20") return "I";
  if (eq("xd", 11, 7) && eq("xs1", 19, 15) && eq("xs2", 24, 20)) return "R";
  if (eq("xs2", 24, 20) && eq("xs1", 19, 15) && eq("imm", 11, 7)) return "S";
  if (vars["imm"] === "31-12" && eq("xd", 11, 7)) return "U";
  if (eq("imm", 31, 12) && eq("xs1", 19, 15)) return "J"; // heuristic
  if (eq("xs2", 24, 20) && eq("xs1", 19, 15) && eq("imm", 11, 7)) return "B";
  return undefined;
}

module.exports = () => {
  if (!fs.existsSync(I_DIR)) {
    console.warn("UDB I-extension directory not found:", I_DIR);
    return [];
  }
  const files = fs
    .readdirSync(I_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => path.join(I_DIR, f));

  const items = files.map(fp => {
    const doc = readYamlFile(fp);
    const name = doc.name;
    const longName = doc.long_name || name;
    const desc = doc.description || "";
    const definedBy = doc.definedBy || "";
    const base = doc.base || 32; // 32 unless stated 64 for RV64-only
    const assemblyArgs = typeof doc.assembly === 'string' ? doc.assembly : Array.isArray(doc.assembly) ? doc.assembly.join(', ') : '';
    const syntax = `${name} ${assemblyArgs}`.trim();
    const fields = computeFields(doc);
    const encType = detectEncodingType(doc);

    // Extract common constants for display
    let opcode, funct3, funct7;
    if (doc.encoding && doc.encoding.match) {
      const m = parseMatchBits(doc.encoding.match);
      if (m) {
        const sliceBits = (hi, lo) => m.slice(31 - hi, 32 - lo).join("");
        opcode = sliceBits(6, 0);
        funct3 = sliceBits(14, 12);
        const f7 = sliceBits(31, 25);
        funct7 = /^[01]{7}$/.test(f7) ? f7 : undefined;
      }
    }

    return {
      name,
      longName,
      description: desc,
      definedBy,
      base,
      syntax,
      encodingType: encType,
      encoding: {
        match: doc.encoding?.match || null,
        variables: doc.encoding?.variables || [],
        fields,
        opcode,
        funct3,
        funct7
      },
    };
  });

  // Filter MVP: base I extension only
  const filtered = items.filter(x => x.definedBy === 'I');
  // Sort by mnemonic
  filtered.sort((a, b) => a.name.localeCompare(b.name));
  return filtered;
};
