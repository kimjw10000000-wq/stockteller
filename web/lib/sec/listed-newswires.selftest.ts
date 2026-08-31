import {
  detectListedNewswire,
  newswireAttributionLine,
  withNewswireAttribution,
} from "./listed-newswires";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(detectListedNewswire("NEW YORK, Aug. 31 (GLOBE NEWSWIRE) --") === "GlobeNewswire", "gnw");
assert(detectListedNewswire("San Francisco--(BUSINESS WIRE)--") === "Business Wire", "bw");
assert(detectListedNewswire("distributed by PR Newswire") === "PR Newswire", "pr");
assert(detectListedNewswire("ACCESSWIRE") === "ACCESSWIRE", "access");
assert(detectListedNewswire("NewMediaWire") === "NewMediaWire", "nmw");
assert(detectListedNewswire("NetworkNewsWire") === "NetworkNewsWire", "nnw");
assert(detectListedNewswire("Exhibit 99.1 Press Release with no wire") == null, "none");

const line = newswireAttributionLine("GlobeNewswire");
assert(line.includes("GlobeNewswire") && line.includes("보도자료"), line);

const once = withNewswireAttribution("첫 문장.", "GlobeNewswire");
const twice = withNewswireAttribution(once, "GlobeNewswire");
assert(once === twice, "should not duplicate");
assert(once.endsWith(line), once);

console.log("listed-newswires.selftest ok");
