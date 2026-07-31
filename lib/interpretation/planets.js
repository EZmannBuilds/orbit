// Orbit Axis :: what each body *does* in a chart.
//
// This layer answers "what function is operating". It never describes a
// personality, because a planet on its own does not have one — the sign says
// how the function expresses itself and the house says where it is felt.
// Keeping that boundary is what stops the composed sentence from saying the
// same thing three times in a row.
//
// `function_` is the one-line role used in headings and summaries.
// `core` is the paragraph shown when a placement is expanded.
// `keywords` drive the aspect and pattern copy; they are adjectives about the
// FUNCTION, never about the reader.

export const PLANETS = Object.freeze({
  Sun: {
    id: "sun",
    name: "Sun",
    function_: "Identity and vitality",
    core: "The Sun describes what you are consciously growing into — the sense "
        + "of self you build on purpose rather than inherit. It tends to show "
        + "up in what energises you, what you want to be recognised for, and "
        + "where you are willing to spend effort without being asked.",
    keywords: ["purpose", "vitality", "self-expression", "recognition"],
    personal: true,
    luminary: true,
  },
  Moon: {
    id: "moon",
    name: "Moon",
    function_: "Emotional needs and instinct",
    core: "The Moon describes what you need in order to feel settled, and how "
        + "you react before you have had time to think. It is the private half "
        + "of the chart — often more visible to the people you live with than "
        + "to people who only meet you at your best.",
    keywords: ["comfort", "instinct", "safety", "memory"],
    personal: true,
    luminary: true,
  },
  Mercury: {
    id: "mercury",
    name: "Mercury",
    function_: "Thinking and communication",
    core: "Mercury describes how you take information in, sort it, and hand it "
        + "back. It covers the pace of your thinking, the kind of detail you "
        + "notice first, and the way you tend to explain something when you "
        + "want to be understood.",
    keywords: ["thinking", "language", "curiosity", "exchange"],
    personal: true,
  },
  Venus: {
    id: "venus",
    name: "Venus",
    function_: "Values, attraction, and taste",
    core: "Venus describes what you find worth having and how you go about "
        + "drawing it closer. It covers taste, affection, and the terms on "
        + "which you are comfortable receiving — which is often the harder "
        + "half.",
    keywords: ["value", "attraction", "harmony", "pleasure"],
    personal: true,
  },
  Mars: {
    id: "mars",
    name: "Mars",
    function_: "Drive and assertion",
    core: "Mars describes how you go after what you want and what you do when "
        + "something is in the way. It covers energy, appetite, and the "
        + "particular style of your frustration — which is usually the clearest "
        + "signal of where this planet is working.",
    keywords: ["drive", "assertion", "courage", "friction"],
    personal: true,
  },
  Jupiter: {
    id: "jupiter",
    name: "Jupiter",
    function_: "Growth and meaning",
    core: "Jupiter describes where you look for a bigger picture, and the kind "
        + "of growth that feels like relief rather than effort. It also tends "
        + "to mark where you overreach, because the same appetite that expands "
        + "something does not always know when to stop.",
    keywords: ["growth", "meaning", "generosity", "excess"],
    social: true,
  },
  Saturn: {
    id: "saturn",
    name: "Saturn",
    function_: "Structure and responsibility",
    core: "Saturn describes where you meet limits, and what you build because "
        + "of them. Its reputation is harsher than its function: this is the "
        + "part of the chart that turns effort into something that lasts, "
        + "usually more slowly than you would like.",
    keywords: ["structure", "discipline", "limit", "mastery"],
    social: true,
  },
  Uranus: {
    id: "uranus",
    name: "Uranus",
    function_: "Change and independence",
    core: "Uranus describes where you need room to do things your own way, and "
        + "where sudden change tends to arrive. It moves slowly enough that it "
        + "marks a whole generation — the house it sits in is what makes it "
        + "personal to you.",
    keywords: ["independence", "disruption", "originality", "freedom"],
    generational: true,
  },
  Neptune: {
    id: "neptune",
    name: "Neptune",
    function_: "Imagination and dissolution",
    core: "Neptune describes where the edges blur — where you are imaginative, "
        + "compassionate, and also where things are hardest to see clearly. It "
        + "is generational, so the house matters more than the sign for "
        + "understanding your own chart.",
    keywords: ["imagination", "compassion", "idealism", "ambiguity"],
    generational: true,
  },
  Pluto: {
    id: "pluto",
    name: "Pluto",
    function_: "Depth and transformation",
    core: "Pluto describes where things change all the way down rather than at "
        + "the surface, and where you encounter power — your own and other "
        + "people's. Like the other slow planets, its sign belongs to a whole "
        + "generation; the house is yours.",
    keywords: ["depth", "transformation", "power", "renewal"],
    generational: true,
  },
});

/** Display order. Luminaries first, then out from the Sun. */
export const PLANET_ORDER = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
]);

export function planetMeaning(name) {
  return PLANETS[name] || null;
}
