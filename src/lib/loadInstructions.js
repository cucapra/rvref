const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const INST_ROOT = path.join(process.cwd(), "riscv-unified-db", "spec", "std", "isa", "inst");
let cache = null;

function readYamlFile(p) {
  const txt = fs.readFileSync(p, "utf8");
  return yaml.load(txt);
}

function parseMatchBits(matchStr) {
  if (!matchStr || matchStr.length !== 32) return null;
  return matchStr.split("");
}

function computeFields(doc) {
  const fields = [];
  if (!doc.encoding) return fields;
  const match = parseMatchBits(doc.encoding.match || "");
  const vars = Array.isArray(doc.encoding.variables) ? doc.encoding.variables : [];
  for (const v of vars) {
    const loc = String(v.location);
    let hi;
    let lo;
    if (loc.includes("-")) {
      [hi, lo] = loc.split("-").map(n => parseInt(n, 10));
    } else {
      hi = lo = parseInt(loc, 10);
    }
    const width = hi - lo + 1;
    fields.push({ label: v.name, from: hi, to: lo, width, kind: "var" });
  }
  if (match) {
    const sliceBits = (hi, lo) => match.slice(31 - hi, 32 - lo).join("");
    const opcode = sliceBits(6, 0);
    if (/^[01]{7}$/.test(opcode)) {
      fields.push({ label: "opcode=" + opcode, from: 6, to: 0, width: 7, kind: "const" });
    }
    const funct3 = sliceBits(14, 12);
    if (/^[01]{3}$/.test(funct3)) {
      fields.push({ label: "funct3=" + funct3, from: 14, to: 12, width: 3, kind: "const" });
    }
    const funct7 = sliceBits(31, 25);
    if (/^[01]{7}$/.test(funct7) && !/^[-]{7}$/.test(funct7)) {
      fields.push({ label: "funct7=" + funct7, from: 31, to: 25, width: 7, kind: "const" });
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
  /*
    Construct a compact JSON description of the instruction bitfield layout.
    This format is mainly for visualization of the bitfield diagram.
    Example input from computeFields():
    [
      { label: "funct7=0000000", from: 31, to: 25, width: 7, kind: "const" },
      { label: "rs2", from: 24, to: 20, width: 5, kind: "var" },
      { label: "rs1", from: 19, to: 15, width: 5, kind: "var" },
      { label: "funct3=000", from: 14, to: 12, width: 3, kind: "const" },
      { label: "rd", from: 11, to: 7, width: 5, kind: "var" },
      { label: "opcode=0110011", from: 6, to: 0, width: 7, kind: "const" }
    ]
    
    We simplify that into a structure like:
    {
      reg: [
        { name: "0000000", bits: 7 },
        { name: "rs2", bits: 5 },
        { name: "rs1", bits: 5 },
        { name: "000", bits: 3 },
        { name: "rd", bits: 5 },
        { name: "0110011", bits: 7 }
      ]
    }
    */
      const bitfieldJSON = {
        reg: fields.map(f => {
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
        bitfieldJSON
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
