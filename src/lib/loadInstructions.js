// -----------------------------------------------------------------------------
// RISC-V Unified Database Instruction Loader
// -----------------------------------------------------------------------------

// This script loads RISC-V instruction YAML files from the Unified Database,
// extracts encoding information (match bits + variable positions), and
// generates compact bitfield layouts for visualization using `bit-field`.


const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const render = require("bit-field/lib/render");
const onml = require("onml");

const INST_ROOT = path.join(process.cwd(), "riscv-unified-db", "spec", "std", "isa", "inst");
let cache = null;

function readYamlFile(p) {
  const txt = fs.readFileSync(p, "utf8");
  return yaml.load(txt);
}

/*
Parse a match bit string (e.g., "0100000----------101-----0010011")
into an array of single characters, each representing one bit.

Returns null if the string isn’t 16 or 32 bits long.
*/
function parseMatchBits(matchStr) {
  if (!matchStr) return null;
  if (matchStr.length !== 32 && matchStr.length !== 16) return null;
  return matchStr.split("");
}

/*
Parse a bitfield location string into numeric segments.
Example:
  "31-25|11-7" → [ {from:31,to:25}, {from:11,to:7} ]

Each segment defines one contiguous region of bits, and fields can have
multiple disjoint segments (like immediates in S- or B-type instructions).
*/
function parseLocationSegments(loc) {
  if (loc === undefined || loc === null) return [];
  return String(loc)
    .split("|")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [hiStr, loStr] = part.split("-").map(n => n.trim());
      const hi = parseInt(hiStr, 10);
      const lo = loStr !== undefined && loStr !== "" ? parseInt(loStr, 10) : hi;
      if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
      return {
        from: Math.max(hi, lo),
        to: Math.min(hi, lo)
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.from - a.from) || (b.to - a.to));
}


/*
Extract all variable and constant fields from an instruction definition.

This function handles both flat encodings and multi-variant encodings
(e.g., RV32 / RV64). It returns an array of field descriptors like:

  [
    { label: "funct7=0100000", from: 31, to: 25, width: 7, kind: "const" },
    { label: "rs2", from: 24, to: 20, width: 5, kind: "var" },
    ...
  ]

These field objects describe what appears at each bit position.
*/
function computeFields(doc) {
  const fields = [];
  if (!doc.encoding) return fields;

  let enc = doc.encoding;
  if (!enc.match && !enc.variables) {
    // pick RV32 first, otherwise first available sub-encoding
    const variants = Object.keys(enc); // e.g., ["RV32", "RV64"]
    const chosenKey = variants.includes("RV32") ? "RV32" : variants[0];
    enc = enc[chosenKey] || {};
  }

  const match = parseMatchBits(enc.match || "");
  const vars = Array.isArray(enc.variables) ? enc.variables : [];

  // --- Parse variable fields (e.g., rd, rs1, imm) ---
  for (const v of vars) {
    const segments = parseLocationSegments(v.location);
    if (segments.length === 0) continue;
  // Find the overall high/low bits and width
    const from = Math.max(...segments.map(s => s.from));
    const to = Math.min(...segments.map(s => s.to));
    const width = segments.reduce((sum, s) => sum + (s.from - s.to + 1), 0);
    fields.push({ label: v.name, from, to, width, kind: "var", segments });
  }

  // --- Parse constant bit regions from the match pattern ---
  // (bits that are fixed 0/1, not "-")
  if (match) {
    let bit = match.length - 1;
    while (bit >= 0) {
      const hi = bit;
      while (bit >= 0 && match[match.length - 1 - bit] !== "-") bit--;
      const lo = bit + 1;
      const width = hi - lo + 1;
      if (width <= 0) { bit--; continue; }

      const bits = match.slice(match.length - 1 - hi, match.length - lo).join("");

      // Label common constant fields if their positions match
      let label = bits;
      if (hi === 31 && lo === 25) label = `funct7=${bits}`;
      else if (hi === 14 && lo === 12) label = `funct3=${bits}`;
      else if (hi === 6 && lo === 0) label = `opcode=${bits}`;
      else label = `const=${bits}`;

      fields.push({ label, from: hi, to: lo, width, kind: "const" });
    }
  }

  fields.sort((a, b) => b.from - a.from);
  return fields;
}


function detectEncodingType(doc) {
  if (!doc.encoding || !Array.isArray(doc.encoding.variables)) return undefined;
  const vars = Object.fromEntries(doc.encoding.variables.map(v => [v.name, String(v.location)]));
  const eq = (name, hi, lo) => vars[name] === hi + "-" + lo;
  if (eq("xd", 11, 7) && eq("xs1", 19, 15) && vars["imm"] === "31-20") return "I";
  if (eq("xd", 11, 7) && eq("xs1", 19, 15) && eq("xs2", 24, 20)) return "R";
  if (eq("xs2", 24, 20) && eq("xs1", 19, 15) && eq("imm", 11, 7)) return "S";
  if (vars["imm"] === "31-12" && eq("xd", 11, 7)) return "U";
  if (eq("imm", 31, 12) && eq("xs1", 19, 15)) return "J";
  if (eq("xs2", 24, 20) && eq("xs1", 19, 15) && eq("imm", 11, 7)) return "B";
  return undefined;
}

function normalizeDefinedBy(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    if (Array.isArray(value.anyOf)) return value.anyOf.join(" or ");
    if (Array.isArray(value.allOf)) return value.allOf.join(" and ");
    if (typeof value.name === "string") return value.name;
  }
  return fallback;
}

function slugifyExtension(ext) {
  return ext
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}
/*
Example of expanding multi-segment fields into individual contiguous entries.

Before expansion:
fields = [
  { label: "imm", from: 31, to: 7, segments: [ { from: 31, to: 25 }, { from: 11, to: 7 } ] },
]

After expansion:
expanded = [
  { label: "imm", from: 31, to: 25 },
  { label: "imm", from: 11, to: 7 }
]

This ensures that each disjoint bit range (like imm[31:25] and imm[11:7])
is rendered as its own segment in the bitfield diagram rather than one
continuous bar spanning bits 31–7.
*/

function expandBitfieldFields(fields, totalBits = 32) {
  const expanded = [];

  // Expand multi-segment fields into individual entries
  for (const field of fields) {
    const segments = Array.isArray(field.segments) && field.segments.length
      ? field.segments
      : [{ from: field.from, to: field.to }];

    for (const seg of segments) {
      const hi = seg.from;
      const lo = seg.to;
      const width = hi - lo + 1;
      if (width <= 0) continue;
      const label =
        segments.length > 1
          ? `${field.label}`
          : field.label;
      expanded.push({
        label,
        from: hi,
        to: lo,
        width,
        kind: field.kind
      });
    }
  }
   expanded.sort((a, b) => b.from - a.from);
  return expanded;
}


module.exports = function loadInstructions() {
  if (cache) return cache;

  if (!fs.existsSync(INST_ROOT)) {
    console.warn("UDB instruction directory not found:", INST_ROOT);
    cache = [];
    return cache;
  }

  const instructions = [];
  const entries = fs.readdirSync(INST_ROOT, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const extension = entry.name;
    const extDir = path.join(INST_ROOT, extension);
    const files = fs
      .readdirSync(extDir)
      .filter(fileName => fileName.endsWith(".yaml"));

    for (const fileName of files) {
      const filePath = path.join(extDir, fileName);
      const doc = readYamlFile(filePath);
      const name = doc.name;
      const longName = doc.long_name || name;
      const desc = doc.description || "";
      const definedByRaw = doc.definedBy;
      const definedBy = normalizeDefinedBy(definedByRaw, extension);
      const base = doc.base || 32;
      const assemblyArgs = typeof doc.assembly === "string"
        ? doc.assembly
        : Array.isArray(doc.assembly)
        ? doc.assembly.join(", ")
        : "";
      const syntax = (name + " " + assemblyArgs).trim();
      const fields = computeFields(doc);
      const encType = detectEncodingType(doc);

      let opcode;
      let funct3;
      let funct7;
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

      const totalBits = doc.encoding?.match?.length === 16 ? 16 : 32;
      const filledFields = expandBitfieldFields(fields, totalBits);
      const bitfieldJSON = {
        reg: filledFields.map(f => {
          let name = f.label;
          // Constant fields have their label part before "=" removed (e.g., "funct7=0000000" → "0000000").
          if (f.kind === "const" && typeof name === "string") {
            const idx = name.indexOf("=");
            if (idx !== -1 && idx + 1 < name.length) {
              name = name.slice(idx + 1);
            }
          }
          return {
            name,
            bits: f.width
          };
        })
      };

      let bitfieldSVG = "";
      try {
        const segments = bitfieldJSON.reg.slice().reverse();
        const jsonml = render(segments, { bits: totalBits, vflip: false }); // MSB→LSB order
        bitfieldSVG = onml.stringify(jsonml);
      } catch (err) {
        console.warn(`Failed to render SVG for ${name}:`, err);
      }

      instructions.push({
        name,
        longName,
        description: desc,
        definedBy,
        definedByRaw,
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
        extension,
        extensionSlug: slugifyExtension(extension),
        bitfieldSVG
      });
    }
  }

  instructions.sort((a, b) => {
    const extDiff = a.extension.localeCompare(b.extension);
    if (extDiff !== 0) return extDiff;
    return a.name.localeCompare(b.name);
  });

  cache = instructions;
  return cache;
};
