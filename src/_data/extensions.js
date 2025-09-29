const loadInstructions = require("../lib/loadInstructions");

module.exports = () => {
  const instructions = loadInstructions();
  const descriptions = {
    "I": "Base Integer",
    "E": "Embedded Base",
    "M": "Integer Multiply/Divide",
    "A": "Atomic Instructions",
    "F": "Single-Precision Floating Point",
    "D": "Double-Precision Floating Point",
    "Q": "Quad-Precision Floating Point",
    "C": "Compressed Instructions",
    "B": "Bit Manipulation",
    "H": "Hypervisor",
    "S": "Supervisor",
    "V": "Vector",
    "Sdext": "Supervisor Debug",
    "Smdbltrp": "Supervisor Multiple Double Trap",
    "Smrnmi": "Supervisor Recursive NMI",
    "Svinval": "Supervisor Virtual Invalidation",
    "Zaamo": "Atomics extensions",
    "Zabha": "Byte/Halfword Atomics",
    "Zacas": "Compare-and-Swap Atomics",
    "Zalasr": "Atomic Logical Shift Right",
    "Zalrsc": "Load-Reserved/Store-Conditional",
    "Zawrs": "Wait-on-Reservation-Set",
    "Zba": "Address Generation Bit-Manip",
    "Zbb": "Basic Bit-Manip",
    "Zbc": "Carry-Less Multiply",
    "Zbkb": "Bit-Manip Crypto B",
    "Zbkx": "Bit-Manip Crypto X",
    "Zbs": "Single-Bit Manipulation",
    "Zcb": "Compressed Bit-Manip",
    "Zcd": "Compressed Double",
    "Zcf": "Compressed Floating Point",
    "Zcmop": "Compressed Micro-Operations",
    "Zcmp": "Compressed Pair",
    "Zfa": "Vector Atomic Floating",
    "Zfbfmin": "Vector BF16 Min",
    "Zfh": "Half-Precision Floating Point",
    "Zicbom": "Cache Block Management",
    "Zicboz": "Zero Cache Block",
    "Zicfilp": "Fetch Line Prefetch",
    "Zicfiss": "Instruction Streaming",
    "Zicond": "Conditional Ops",
    "Zicsr": "CSR Instructions",
    "Zifencei": "Instruction-Fetch Fence",
    "Zimop": "Integer Multiply and Division Ops",
    "Zkn": "Scalar Cryptography",
    "Zknd": "NIST Suite: AES Decryption",
    "Zkne": "NIST Suite: AES Encryption",
    "Zknh": "NIST Suite: Hash",
    "Zks": "Scalar Crypto Suite",
    "Zvbb": "Vector Bitwise",
    "Zvbc": "Vector Carry-less Multiply",
    "Zvfbfmin": "Vector BF16 Min",
    "Zvfbfwma": "Vector BF16 Fused Multiply-Add",
    "Zvkg": "Vector Galois Field",
    "Zvkned": "Vector AES Decryption",
    "Zvknha": "Vector Hash",
    "Zvks": "Vector Crypto Suite"
  };
  const byExtension = new Map();

  for (const inst of instructions) {
    const name = inst.extension || "unknown";
    const slug = inst.extensionSlug || "unknown";
    if (!byExtension.has(name)) {
      byExtension.set(name, {
        name,
        slug,
        description: descriptions[name] || null,
        instructions: []
      });
    }
    byExtension.get(name).instructions.push(inst);
  }

  const list = Array.from(byExtension.values());
  for (const entry of list) {
    entry.instructions.sort((a, b) => a.name.localeCompare(b.name));
    entry.count = entry.instructions.length;
  }

  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
};
