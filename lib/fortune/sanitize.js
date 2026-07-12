// Orbit Axis :: birth-input validation for the stateless fortune preview.
// Mirrors the charts service's rules without pulling in its store.

const TIME_ACCURACIES = new Set(["exact", "reported", "approximate", "unknown"]);
const FIELDS = [
  "birth_date", "birth_time", "time_accuracy", "birthplace_name",
  "latitude", "longitude", "timezone_name", "utc_offset_at_birth",
  "zodiac_system", "house_system",
];

export function sanitizePreviewInput(input) {
  const out = {};
  for (const f of FIELDS) if (input[f] !== undefined) out[f] = input[f];
  if (!out.birth_date) throw new Error("birth_date is required");
  const acc = out.time_accuracy || "unknown";
  if (!TIME_ACCURACIES.has(acc)) throw new Error(`time_accuracy must be one of ${[...TIME_ACCURACIES].join(", ")}`);
  out.time_accuracy = acc;
  if (out.latitude == null || out.longitude == null) throw new Error("latitude and longitude are required");
  out.latitude = Number(out.latitude);
  out.longitude = Number(out.longitude);
  out.zodiac_system = out.zodiac_system || "tropical";
  out.house_system = out.house_system || "placidus";
  return out;
}
