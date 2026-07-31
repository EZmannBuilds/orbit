// Orbit Axis :: how a function expresses itself.
//
// Every string here has to work as the MIDDLE of a sentence about some other
// planet — "Mercury in Leo expresses this ⟨expression⟩". So the text describes
// a STYLE, never a person: "warmly and with an audience in mind", not "you are
// warm". The moment a sign entry describes the reader directly, the composed
// paragraph starts arguing with the planet layer above it.
//
// `expression` completes "…expresses this ⟨expression⟩".
// `manner` completes "…tends to work ⟨manner⟩".
// `strength` and `growth` are phrases, not sentences, so the composer can
// place them in authored templates.

const sign = (id, element, modality, ruler, data) =>
  Object.freeze({ id, name: id[0].toUpperCase() + id.slice(1), element, modality, ruler, ...data });

export const SIGNS = Object.freeze({
  Aries: sign("aries", "Fire", "Cardinal", "Mars", {
    expression: "directly and without much delay",
    manner: "in bursts, starting before the plan is finished",
    strength: "getting things moving when everyone else is still deliberating",
    growth: "staying with something after the first excitement has worn off",
    keywords: ["direct", "immediate", "competitive"],
  }),
  Taurus: sign("taurus", "Earth", "Fixed", "Venus", {
    expression: "steadily, and at its own pace",
    manner: "by building something solid and then keeping it",
    strength: "outlasting problems that other approaches would rush at",
    growth: "letting go of an arrangement that has stopped working",
    keywords: ["steady", "sensory", "persistent"],
  }),
  Gemini: sign("gemini", "Air", "Mutable", "Mercury", {
    expression: "quickly, and in several directions at once",
    manner: "by talking it through and trying more than one version",
    strength: "making connections between things that looked unrelated",
    growth: "going deep enough into one thing to find out what is under it",
    keywords: ["quick", "curious", "versatile"],
  }),
  Cancer: sign("cancer", "Water", "Cardinal", "Moon", {
    expression: "protectively, with an eye on who is affected",
    manner: "indirectly, moving toward what feels safe",
    strength: "noticing what people need before they say it",
    growth: "asking for care as readily as it is given",
    keywords: ["protective", "receptive", "loyal"],
  }),
  Leo: sign("leo", "Fire", "Fixed", "Sun", {
    expression: "warmly, and with an audience in mind",
    manner: "generously, and with some pride in the result",
    strength: "committing wholeheartedly and bringing other people with it",
    growth: "staying steady when the appreciation does not arrive",
    keywords: ["warm", "expressive", "wholehearted"],
  }),
  Virgo: sign("virgo", "Earth", "Mutable", "Mercury", {
    expression: "carefully, with attention to what is not yet right",
    manner: "by improving the working parts one at a time",
    strength: "seeing the specific fix where others see a vague problem",
    growth: "calling something finished while it is still imperfect",
    keywords: ["precise", "practical", "improving"],
  }),
  Libra: sign("libra", "Air", "Cardinal", "Venus", {
    expression: "considerately, weighing the other side",
    manner: "by looking for the arrangement everyone can live with",
    strength: "holding two fair claims in mind at the same time",
    growth: "naming your own preference before the balancing starts",
    keywords: ["balancing", "relational", "fair-minded"],
  }),
  Scorpio: sign("scorpio", "Water", "Fixed", "Pluto", {
    expression: "intensely, and not always visibly",
    manner: "by going all the way in or not at all",
    strength: "staying present with what other approaches avoid",
    growth: "letting something be ordinary rather than significant",
    keywords: ["intense", "private", "thorough"],
  }),
  Sagittarius: sign("sagittarius", "Fire", "Mutable", "Jupiter", {
    expression: "openly, with an eye on the wider point",
    manner: "by heading toward the bigger version of the question",
    strength: "keeping perspective when the detail gets oppressive",
    growth: "staying for the part that is not an adventure",
    keywords: ["expansive", "candid", "exploratory"],
  }),
  Capricorn: sign("capricorn", "Earth", "Cardinal", "Saturn", {
    expression: "deliberately, with the long run in view",
    manner: "by working out what it costs and then paying it",
    strength: "sustaining effort long past the point of novelty",
    growth: "counting something as enough before the summit",
    keywords: ["deliberate", "durable", "responsible"],
  }),
  Aquarius: sign("aquarius", "Air", "Fixed", "Uranus", {
    expression: "independently, and often against the obvious option",
    manner: "by stepping back far enough to see the system",
    strength: "thinking past the assumption everyone else started from",
    growth: "staying close when detachment would be more comfortable",
    keywords: ["independent", "systemic", "unconventional"],
  }),
  Pisces: sign("pisces", "Water", "Mutable", "Neptune", {
    expression: "fluidly, taking in more than is said",
    manner: "by feel, rather than by a decided plan",
    strength: "sensing the mood in a room before anyone names it",
    growth: "keeping an edge where you end and someone else begins",
    keywords: ["receptive", "imaginative", "permeable"],
  }),
});

export const SIGN_ORDER = Object.freeze(Object.keys(SIGNS));

export function signMeaning(name) {
  return SIGNS[name] || null;
}
