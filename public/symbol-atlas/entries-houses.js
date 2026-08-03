// Orbit Axis :: Symbol Atlas — the twelve houses (Dev Update 3.1).
//
// Every house entry carries the same caveat once, in chartRole: houses need a
// birth time. That is already how the rest of Orbit talks about them (see
// birthTimeNotice in lib/transits) and the Atlas does not get to be vaguer.
//
// A HOUSE IS NOT A SIGN. Houses are areas of life; signs are styles. Modern
// teaching pairs each house with a sign (the 1st with Aries, the 8th with
// Scorpio) and that pairing is genuinely useful as a memory aid — so it is
// recorded, under a fact key that says out loud what it is: "modern teaching
// association". The validator fails any entry that states the association as
// an identity, because "the 8th House is Scorpio" is the single most common
// beginner error the Atlas exists to prevent.
//
// Slugs are "1st-house" … "12th-house"; aliases carry the spoken forms
// ("first house", "house 1") so search meets people where they type.
//
// `arena` is the composition clause. combinations.js reads it as the phrase
// after "…directs that function toward …", so it stays a lowercase noun
// phrase that survives being dropped into someone else's sentence.

/** Angular houses sit on the four angles; succedent follow them; cadent precede the next angle. */
const CLASSIFICATION = { 1: "Angular", 4: "Angular", 7: "Angular", 10: "Angular",
  2: "Succedent", 5: "Succedent", 8: "Succedent", 11: "Succedent",
  3: "Cadent", 6: "Cadent", 9: "Cadent", 12: "Cadent" };

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th",
  "10th", "11th", "12th"];

const HOUSE = (n, ordinal, spoken, entry) => ({
  slug: `${ordinal}-house`,
  category: "houses",
  title: `${ordinal[0].toUpperCase()}${ordinal.slice(1)} House`,
  glyph: String(n),
  aliases: [`${spoken} house`, `house ${n}`, `${ordinal} house`, `house of ${entry.houseOf.toLowerCase()}`],
  keywords: entry.keywords,
  summary: entry.summary,
  arena: entry.arena,
  overview: entry.overview,
  themes: entry.themes,
  everyday: entry.everyday,
  constructive: entry.constructive,
  difficult: entry.difficult,
  whenEmphasized: entry.whenEmphasized,
  reflections: entry.reflections,
  strengths: entry.strengths,
  challenges: entry.challenges,
  chartRole: `${entry.chartRole} Houses depend on an accurate birth time; without one, Orbit leaves house placements out rather than guessing.`,
  advanced: [
    ...(entry.advanced ? [entry.advanced] : []),
    `${ordinal[0].toUpperCase()}${ordinal.slice(1)} House is ${CLASSIFICATION[n].toLowerCase()}: `
    + `${CLASSIFICATION[n] === "Angular"
      ? "it begins at one of the chart's four angles, and planets there are commonly read as the most prominent in a chart"
      : CLASSIFICATION[n] === "Succedent"
        ? "it follows an angular house, and is commonly read as consolidating what the angle before it began"
        : "it completes a quadrant, and is commonly read as distributing and adapting what came before it"}. `
    + `Its opposite house is the ${ORDINALS[((n + 5) % 12) + 1]}, and the pair is usually read together as one axis.`,
  ],
  facts: {
    "modern teaching association": `${entry.naturalSign} (an association, not an equivalence)`,
    classification: CLASSIFICATION[n],
    axis: `${ordinal}–${ORDINALS[((n + 5) % 12) + 1]}`,
  },
  related: entry.related,
});

export const HOUSE_ENTRIES = Object.freeze([
  HOUSE(1, "1st", "first", {
    houseOf: "Self",
    naturalSign: "Aries",
    arena: "how a person arrives, presents, and is first read by others",
    summary: "The 1st House is commonly read as the house of self — appearance, approach, and the first impression a person leads with.",
    overview: [
      "The 1st House covers the front door: how a person shows up, the manner they lead with, and what a room registers about them before anything is known. It is read as approach rather than essence — the Sun describes who someone is becoming, and the 1st House describes the way they walk in.",
      "It begins at the Ascendant, which makes it the most time-sensitive house in any chart. A birth time out by twenty minutes can move the cusp into a different sign and change the reading entirely, which is why Orbit hides house placements rather than guessing when the time is unknown.",
    ],
    themes: ["identity", "appearance", "beginnings", "instinctive style"],
    everyday: [
      "How you behave in the first two minutes of meeting someone new",
      "The impression people report having of you before they knew you",
      "What you instinctively do at the start of anything",
    ],
    constructive: "Working well, the 1st House is a clear front door: a manner that genuinely represents the person behind it, and enough presence to start things without waiting to be invited. Planets here tend to be visible early, which makes introductions easier and first steps less costly.",
    difficult: "The difficult version is a front that has become a fixture. The manner keeps running after the situation stopped calling for it, image gets maintained at the expense of what it was meant to introduce, and a life can end up organised around the impression rather than the person.",
    whenEmphasized: "Several planets in the 1st House is commonly read as a strongly self-presenting chart — someone whose personal style is a large part of how they operate. Readings then usually look at the other eleven houses to see what else is getting attention.",
    reflections: [
      "What do people consistently assume about you on first meeting?",
      "Where does your usual approach open doors, and where does it close them?",
      "Which parts of yourself do you tend to introduce last?",
    ],
    strengths: ["Clear personal presence", "Instinct for fresh starts", "An approach that gets things moving"],
    challenges: ["Leading with image over substance", "Self-focus crowding out the other eleven rooms", "Difficulty being seen behind the manner"],
    chartRole: "Planets here often colour how a person comes across before anything else is known about them; its cusp is the Ascendant.",
    advanced: "The 1st House begins at the Ascendant, which makes it the most birth-time-sensitive house of all — a few minutes can move its cusp visibly.",
    keywords: ["self", "identity", "appearance", "first impressions", "body", "presence", "how others see me", "approach"],
    related: ["angles/ascendant", "signs/aries", "planets/mars", "houses/7th-house"],
  }),
  HOUSE(2, "2nd", "second", {
    houseOf: "Value",
    naturalSign: "Taurus",
    arena: "money, possessions, and what a person counts as worth having",
    summary: "The 2nd House is commonly read as the house of value — money, possessions, and the resources a person counts on, including self-worth.",
    overview: [
      "The 2nd House covers what a person holds: income, belongings, skills that can be traded, and the sense of worth underneath all of it. Readings treat the financial and the personal senses as one subject on the grounds that how someone handles resources tends to track how they estimate themselves.",
      "It is a succedent house, following the 1st: where the 1st begins something, the 2nd consolidates it into something ownable. Its opposite, the 8th, covers resources held jointly — the pair is usually read together as mine and ours.",
    ],
    themes: ["money", "possessions", "self-worth", "security"],
    everyday: [
      "What you buy without needing to justify it, and what you agonise over",
      "How secure you feel with a given amount in the account",
      "The skill you would fall back on if you had to",
    ],
    constructive: "At its best the 2nd House is a working relationship with resources: earning steadily, spending in line with what you actually value, and holding a sense of worth that survives a bad month. It shows up as practical competence with material life rather than anxiety about it.",
    difficult: "Strained, worth collapses into holdings. Security gets gripped tightly enough that it stops compounding, value gets measured only where it can be counted, and self-esteem starts tracking a balance. The opposite failure is just as common: treating money as beneath attention until it forces the issue.",
    whenEmphasized: "Several planets in the 2nd House is commonly read as a chart where material security and self-worth are recurring subjects rather than background ones. Readings usually ask which of the two is doing the work.",
    reflections: [
      "What do you own that you would be sorry to lose, and what would you barely notice?",
      "Where does your sense of worth depend on something you could lose?",
      "What are you paid for, and what do you do well that nobody pays you for?",
    ],
    strengths: ["A grounded relationship with resources", "Knowing what you actually value", "Skill that holds its value over time"],
    challenges: ["Worth measured in belongings", "Security held so tightly it cannot grow", "Ignoring money until it becomes urgent"],
    chartRole: "Planets here often describe how a person earns, keeps, and values — in both the financial and the personal sense.",
    keywords: ["money", "possessions", "value", "income", "security", "self-worth", "earning", "resources", "finances"],
    related: ["signs/taurus", "planets/venus", "houses/8th-house"],
  }),
  HOUSE(3, "3rd", "third", {
    houseOf: "Communication",
    naturalSign: "Gemini",
    arena: "talking, learning, and the familiar world within easy reach",
    summary: "The 3rd House is commonly read as the house of communication — speech, learning, siblings, and the familiar local world.",
    overview: [
      "The 3rd House covers the near distance: conversation, everyday learning, siblings and the people who function like them, short journeys, and the neighbourhood a life is actually lived in. It is the house of information moving around at close range.",
      "It sits opposite the 9th, and the pair is usually read as the near view against the far one — the fact and the framework, the errand and the pilgrimage. The 3rd supplies the detail the 9th tries to make sense of.",
    ],
    themes: ["communication", "learning", "siblings", "daily movement"],
    everyday: [
      "The messages you send and how much you rewrite them",
      "The route you take often enough to stop noticing",
      "What you read or listen to while doing something else",
    ],
    constructive: "Constructive 3rd House is genuine fluency in the near world: explaining things clearly, learning what you need quickly, and staying properly in touch with the people close at hand. It shows up as being well informed about the things that are actually nearby.",
    difficult: "Under strain the near world gets busy without getting anywhere. Movement and messages accumulate as a substitute for progress, and the important conversation gets talked around rather than had. Scattered attention is the usual cost.",
    whenEmphasized: "Several planets in the 3rd House is commonly read as a chart where words, learning, and local connections carry a lot of the weight. Readings often look for where the depth lives, since the 3rd supplies breadth readily.",
    reflections: [
      "What conversation have you been circling rather than having?",
      "What did you learn recently, and what made it stick?",
      "Who in your immediate circle do you talk to least and think about most?",
    ],
    strengths: ["Ease with words and information", "Curiosity about the immediate world", "Staying genuinely in touch with people nearby"],
    challenges: ["Busy-ness mistaken for progress", "Talking around what needed saying", "Attention split across too many small things"],
    chartRole: "Planets here often describe how a person exchanges information — writing, speaking, studying, and the errands in between.",
    keywords: ["communication", "learning", "siblings", "writing", "short trips", "neighbourhood", "talking", "study", "local"],
    related: ["signs/gemini", "planets/mercury", "houses/9th-house"],
  }),
  HOUSE(4, "4th", "fourth", {
    houseOf: "Home",
    naturalSign: "Cancer",
    arena: "home, family, and the private ground a life is run from",
    summary: "The 4th House is commonly read as the house of home — family, roots, private life, and the ground a person grows from.",
    overview: [
      "The 4th House covers the base: the household, the family a person came from and the one they make, and the private conditions that decide whether the rest of a life is sustainable. Readings extend it to origins in general — the inherited assumptions a person did not choose.",
      "It begins at the Imum Coeli, the lowest point of the chart, directly opposite the Midheaven. The pair is read as one axis: the private root and the public peak, each supporting and constraining the other.",
    ],
    themes: ["home", "family", "roots", "belonging", "endings"],
    everyday: [
      "What has to be true about your home before you can properly relax in it",
      "The family habit you kept, and the one you deliberately did not",
      "Where you go when a week has gone badly",
    ],
    constructive: "Constructive 4th House is a base that actually holds: somewhere to return to, a clear-eyed relationship with where you came from, and enough privacy for the public parts of a life to be recoverable from. It shows up as being genuinely at home somewhere.",
    difficult: "The difficult version is the past furnishing every room. Inherited patterns keep running unexamined, home becomes somewhere to hide from a situation rather than recover for it, and the private world quietly absorbs energy the outward one needed.",
    whenEmphasized: "Several planets in the 4th House is commonly read as a chart where home and family are central rather than background. Readings usually pair that with the 10th, since a heavily weighted base tends to shape what the public life is built on.",
    reflections: [
      "What would need to change for your home to actually restore you?",
      "Which inherited assumption have you kept without examining?",
      "Where do you feel most like you can stop performing?",
    ],
    strengths: ["A strong sense of where you come from", "Care for the private foundations of life", "Somewhere to genuinely retreat to"],
    challenges: ["The past furnishing every room", "Retreating home instead of resolving outward", "Privacy that shades into isolation"],
    chartRole: "Planets here often describe a person's relationship with family, home, and their own inner foundations; its cusp is the Imum Coeli.",
    advanced: "The 4th House begins at the Imum Coeli (IC), the lowest point of the chart, opposite the Midheaven — private root against public peak.",
    keywords: ["home", "family", "roots", "ancestry", "belonging", "foundations", "parents", "private life", "household"],
    related: ["angles/imum-coeli", "signs/cancer", "planets/moon", "houses/10th-house"],
  }),
  HOUSE(5, "5th", "fifth", {
    houseOf: "Creativity",
    naturalSign: "Leo",
    arena: "play, creative work, romance, and whatever is done for its own sake",
    summary: "The 5th House is commonly read as the house of creativity — play, romance, children, and whatever a person makes for the joy of it.",
    overview: [
      "The 5th House covers what a person does because they want to: making things, playing, courting, and the relationship with children if there are any. The common thread is expression that is its own justification rather than a means to something.",
      "It is succedent, following the 4th: where the 4th establishes a base, the 5th spends from it. Its opposite, the 11th, covers the group and the shared cause — the pair is often read as what you make yourself against what you make with others.",
    ],
    themes: ["creativity", "play", "romance", "children", "self-expression"],
    everyday: [
      "The thing you make or do that has no productive justification",
      "How you flirt, or would if you were out of practice",
      "What you were absorbed by as a child that you still recognise",
    ],
    constructive: "Constructive 5th House takes joy seriously. It makes things without waiting for permission or a market, risks looking foolish in the direction of something delightful, and treats play as a real part of a life rather than a reward for finishing work.",
    difficult: "Strained, expression starts requiring an audience to count. The work gets shaped by the response it is hoping for, romance turns into a performance of romance, and drama gets manufactured where a quiet week was available. Creative blocks here often turn out to be fear of the reception rather than of the making.",
    whenEmphasized: "Several planets in the 5th House is commonly read as a chart where creative expression and pleasure are load-bearing. Readings usually ask whether the person is allowed to make things badly, since that is often what unlocks the house.",
    reflections: [
      "What would you make if nobody were going to see it?",
      "When did you last do something purely because it was enjoyable?",
      "Where does wanting a response help your work, and where does it shape it?",
    ],
    strengths: ["Joy taken seriously", "Creative risk that feels like play", "Warmth in courtship and with children"],
    challenges: ["Needing an audience for it to count", "Drama as a hobby", "Creative blocks that are really fear of reception"],
    chartRole: "Planets here often describe how a person plays, creates, and courts — expression for its own sake rather than for duty.",
    keywords: ["creativity", "play", "romance", "children", "pleasure", "art", "games", "dating", "self-expression", "fun"],
    related: ["signs/leo", "planets/sun", "houses/11th-house"],
  }),
  HOUSE(6, "6th", "sixth", {
    houseOf: "Work and Health",
    naturalSign: "Virgo",
    arena: "daily work, routine, and the upkeep a life runs on",
    summary: "The 6th House is commonly read as the house of daily work and health — routines, service, craft, and the body's maintenance.",
    overview: [
      "The 6th House covers the machinery: the working day rather than the career, the habits that carry a life between events, the craft of doing something well, and the body's ordinary upkeep. It is the least glamorous house and the one most days are actually spent in.",
      "It sits opposite the 12th, and the pair is often read as the visible routine against what runs unattended underneath it. Readings here describe habits and daily conditions — they describe neither symptoms nor diagnoses, and are no substitute for medical advice.",
    ],
    themes: ["work", "health", "routine", "service", "craft"],
    everyday: [
      "The first hour of a working day, and whether it has a shape",
      "The routine that quietly holds everything else together",
      "How you help someone — practically, or by being present",
    ],
    constructive: "Constructive 6th House is competence at the level of the ordinary: routines that hold without needing willpower, work done properly because doing it properly is satisfying, and help offered in the specific practical form that was actually needed.",
    difficult: "Under strain, diligence and worry get hard to separate. Routines tighten until they run the person, standards get applied hardest where they matter least, and looking after everyone else becomes a way of not looking after yourself. Overwork tends to be the last thing noticed here.",
    whenEmphasized: "Several planets in the 6th House is commonly read as a chart where daily work and wellbeing carry unusual weight. Readings usually ask what the routine is in service of, since the house supplies the routine readily enough.",
    reflections: [
      "Which of your routines actually serve you, and which have you inherited from a busier period?",
      "Where do you set a standard you would not ask of anyone else?",
      "What would a genuinely sustainable week look like for you?",
    ],
    strengths: ["Routines that actually hold", "Care expressed through useful acts", "Craft taken seriously at ordinary scale"],
    challenges: ["Worry wearing the uniform of diligence", "Serving everyone but the self", "Standards applied hardest where they matter least"],
    chartRole: "Planets here often describe how a person handles daily work, habits, and wellbeing — the unglamorous machinery that makes the rest possible.",
    keywords: ["work", "health", "routine", "habits", "service", "wellness", "daily life", "job", "fitness", "colleagues"],
    related: ["signs/virgo", "planets/mercury", "houses/12th-house"],
  }),
  HOUSE(7, "7th", "seventh", {
    houseOf: "Partnership",
    naturalSign: "Libra",
    arena: "close partnership and what is repeatedly met in significant others",
    summary: "The 7th House is commonly read as the house of partnership — marriage, close collaboration, and the qualities met in significant others.",
    overview: [
      "The 7th House covers the committed one-to-one: marriage and its equivalents, close business partnership, and the formal agreements that bind two parties. Readings extend it to open opposition as well, on the grounds that a declared adversary is also a relationship you are fully engaged in.",
      "It begins at the Descendant, directly opposite the Ascendant, and the axis is usually read as one subject: the way you arrive and the qualities you draw across the table. Traditional practice reads it primarily through marriage and contracts; modern practice widens it to partnership in general.",
    ],
    themes: ["partnership", "marriage", "contracts", "balance", "projection"],
    everyday: [
      "What you look for in someone before you would commit to anything",
      "The trait you keep encountering in partners across different relationships",
      "How you behave when a disagreement becomes formal",
    ],
    constructive: "Constructive 7th House is real partnership: the ability to be one of two without disappearing, fairness maintained in close quarters where it is hardest, and agreements that both parties can actually live inside. It shows up as being genuinely good at being with someone.",
    difficult: "The difficult version outsources a part of the self. Qualities that were harder to own get met in partners instead and then resented there, identity drifts toward whatever the relationship requires, and being unpartnered starts feeling like being incomplete rather than being single.",
    whenEmphasized: "Several planets in the 7th House is commonly read as a chart where partnership is a central life theme rather than one area among many. Readings usually pair it with the 1st, since the axis works as a unit.",
    reflections: [
      "What quality do you keep meeting in partners, and where does it live in you?",
      "What do you need a relationship to supply, and is that fair to ask?",
      "Where do you stay yourself in close quarters, and where do you dissolve?",
    ],
    strengths: ["Genuine capacity for partnership", "Fairness in close quarters", "Agreements that hold for both parties"],
    challenges: ["Completing yourself with someone else", "Meeting your own disowned traits in partners", "Being single mistaken for being incomplete"],
    chartRole: "Planets here often describe what a person seeks — and repeatedly finds — in committed one-to-one relationships; its cusp is the Descendant.",
    advanced: "The 7th House begins at the Descendant, directly opposite the Ascendant — self and significant other as the two ends of one axis.",
    keywords: ["partnership", "marriage", "relationships", "contracts", "commitment", "others", "spouse", "collaboration", "agreements"],
    related: ["angles/descendant", "signs/libra", "planets/venus", "houses/1st-house"],
  }),
  HOUSE(8, "8th", "eighth", {
    houseOf: "Depth and Shared Resources",
    naturalSign: "Scorpio",
    arena: "intimacy, shared resources, and what changes through being merged",
    summary: "The 8th House is commonly read as the house of depth — intimacy, shared resources, crisis, and what transforms through merging.",
    overview: [
      "The 8th House covers what two parties hold jointly: intimacy past the social layer, money that belongs to both, inheritance and debt, and the changes that arrive when something held together has to be renegotiated. Readings treat trust as the underlying subject.",
      "It sits opposite the 2nd — mine against ours — and is succedent to the 7th, consolidating what partnership begins. Older texts associate it with death, and modern practice generally reads that symbolically, as the ending of a phase rather than as a prediction about anyone.",
    ],
    themes: ["intimacy", "shared resources", "transformation", "crisis", "trust"],
    everyday: [
      "How you handle a conversation about money with someone close",
      "What you disclose when a relationship gets past the pleasant stage",
      "How you behave when something you relied on has to end",
    ],
    constructive: "Constructive 8th House is honesty at depth: handling shared stakes straightforwardly, staying present through a difficult passage rather than managing around it, and being able to rely on someone and be relied on in return. It carries real steadiness in situations others find unbearable.",
    difficult: "Strained, trust gets replaced by control. Shared arrangements become leverage, intimacy is tested rather than extended, and a life can start organising itself around intensity — crisis mode maintained in the intervals between actual crises.",
    whenEmphasized: "Several planets in the 8th House is commonly read as a chart where depth, shared resources, and significant change are recurring subjects. Readings usually ask what the person does with ordinary, uneventful stretches.",
    reflections: [
      "What do you find hardest to say to someone you are close to?",
      "Where do you rely on someone, and how does that sit with you?",
      "What ended in your life that you have not fully accounted for?",
    ],
    strengths: ["Courage in life's deep water", "Handling shared stakes honestly", "Steadiness when something has to end"],
    challenges: ["Control where trust was asked for", "Living in crisis mode between crises", "Testing closeness instead of extending it"],
    chartRole: "Planets here often describe how a person handles intimacy, inheritance, debts, and the changes that reshape a life from the inside.",
    keywords: ["intimacy", "shared money", "inheritance", "transformation", "depth", "taboo", "trust", "debt", "joint finances", "endings"],
    related: ["signs/scorpio", "planets/pluto", "houses/2nd-house"],
  }),
  HOUSE(9, "9th", "ninth", {
    houseOf: "Meaning",
    naturalSign: "Sagittarius",
    arena: "belief, higher learning, distance, and the search for a bigger picture",
    summary: "The 9th House is commonly read as the house of meaning — belief, higher learning, long journeys, and the big picture.",
    overview: [
      "The 9th House covers the far distance: what a person believes and how they came to, formal or advanced study, travel that changes the traveller, and the frameworks used to decide what a run of events adds up to. Teaching, publishing, and law fall here as ways of putting a framework into circulation.",
      "It sits opposite the 3rd, and the pair works as detail against meaning. The 3rd gathers facts about what is near; the 9th tries to build something from them that holds at a distance.",
    ],
    themes: ["belief", "education", "travel", "philosophy", "publishing"],
    everyday: [
      "The trip that changed how you think about something",
      "What you believe that you could not fully argue for",
      "The subject you would study properly if there were time",
    ],
    constructive: "Constructive 9th House is a working philosophy: a framework that has actually been tested against experience, curiosity that travels — literally or intellectually — and a willingness to teach what you know without needing to be the authority on it.",
    difficult: "Over-extended, the framework stops meeting the facts. Conviction gets preached past the point anyone is listening, and the horizon becomes a way of not dealing with the foreground — the next country, the next course, the next big idea, each one arriving before the last was finished.",
    whenEmphasized: "Several planets in the 9th House is commonly read as a chart oriented toward meaning, study, or distance. Readings usually look for where the chart handles the specifics, since the 9th supplies the framework more readily than the detail.",
    reflections: [
      "What do you believe now that you did not five years ago, and what changed it?",
      "Where does your search for the big picture help, and where does it skip the present one?",
      "What would you want to understand properly before the end of your life?",
    ],
    strengths: ["A working philosophy of life", "Growth through distance — literal or intellectual", "Teaching without needing to be the authority"],
    challenges: ["Preaching past the congregation", "The horizon as an escape from the foreground", "Frameworks kept past the evidence"],
    chartRole: "Planets here often describe how a person builds meaning — study, faith, travel, teaching — and how far they roam to find it.",
    keywords: ["philosophy", "travel", "higher education", "belief", "law", "publishing", "foreign", "meaning", "university", "teaching"],
    related: ["signs/sagittarius", "planets/jupiter", "houses/3rd-house"],
  }),
  HOUSE(10, "10th", "tenth", {
    houseOf: "Vocation",
    naturalSign: "Capricorn",
    arena: "public direction, reputation, and the role a life is seen through",
    summary: "The 10th House is commonly read as the house of vocation — career, reputation, and the public role a person builds over time.",
    overview: [
      "The 10th House covers the visible life: the direction a career takes, the reputation that accumulates around it, and the person's relationship with authority — both the authority they answer to and the authority they end up holding. It describes the role a life is seen through rather than the daily work of doing it.",
      "It begins at the Midheaven, the highest point of the chart, opposite the Imum Coeli. The two are read as one axis: what is visible and what it is built on. A public life without a private base is a common reading here, and rarely a comfortable one.",
    ],
    themes: ["career", "reputation", "authority", "achievement", "public life"],
    everyday: [
      "What you say when someone asks what you do",
      "How you behave toward the person in charge",
      "What you want on the record about your working life",
    ],
    constructive: "Constructive 10th House is direction that compounds: a track record that means something, comfort with authority that has actually been earned, and public work that the person would still choose privately. It shows up as being recognisably good at something over time.",
    difficult: "The difficult version lets the role absorb the person. Identity collapses into a job title, the summit is reached and photographed rather than enjoyed, and choices start being made for how they will read rather than for what they are. Reputation begins steering the person who earned it.",
    whenEmphasized: "Several planets in the 10th House is commonly read as a chart where public direction is a central concern. Readings usually pair that with the 4th, since a strongly weighted public life raises the question of what it is standing on.",
    reflections: [
      "Whose approval are you working toward, and did you choose them?",
      "What would you still want to be known for if nobody were keeping score?",
      "Where does your public role fit you, and where do you perform it?",
    ],
    strengths: ["A visible track record", "Comfort with earned authority", "Direction that holds over years"],
    challenges: ["Identity collapsed into job title", "The summit photographed but not enjoyed", "Choices made for how they will read"],
    chartRole: "Planets here often describe a person's public direction and how they meet authority — their own and other people's; its cusp is the Midheaven.",
    advanced: "The 10th House begins at the Midheaven (MC), the highest point of the chart — commonly read as the most visible degree a chart has.",
    keywords: ["career", "vocation", "reputation", "ambition", "status", "authority", "public image", "job title", "promotion", "boss"],
    related: ["angles/midheaven", "signs/capricorn", "planets/saturn", "houses/4th-house"],
  }),
  HOUSE(11, "11th", "eleventh", {
    houseOf: "Community",
    naturalSign: "Aquarius",
    arena: "friendship, groups, shared causes, and hopes for what comes next",
    summary: "The 11th House is commonly read as the house of community — friends, groups, causes, and hopes for the future.",
    overview: [
      "The 11th House covers belonging to something larger: friendships that are chosen rather than inherited, groups and movements, professional networks, and the hopes a person holds for a future they will share with other people.",
      "It is succedent to the 10th, and the pair reads as the position reached and the people it is shared with. Its opposite, the 5th, covers what a person makes alone — the axis is often used to discuss individual expression against collective purpose.",
    ],
    themes: ["friendship", "groups", "causes", "hopes", "networks"],
    everyday: [
      "The group chat you actually read",
      "A cause you would give time to rather than money",
      "What you hope will be true in ten years for people other than yourself",
    ],
    constructive: "Constructive 11th House is friendship as a real skill: keeping people over years, being useful inside a shared effort without needing to run it, and holding a picture of the future that other people can join. It tends to show up as being genuinely well connected rather than merely known.",
    difficult: "Strained, the group starts speaking for the person. Positions get adopted because the circle holds them, individual wants get postponed in favour of collective ones, and a future keeps being planned while the present goes unattended. The lonely version is also common: many acquaintances, little contact.",
    whenEmphasized: "Several planets in the 11th House is commonly read as a chart where friendship and shared purpose are central. Readings usually look for where the person's own voice sits, since the house supplies the collective one readily.",
    reflections: [
      "Which friendships have you kept, and what maintained them?",
      "Where do you go along with a group, and where do you differ quietly?",
      "What are you hoping for that you have not said to anyone?",
    ],
    strengths: ["Friendship as a genuine skill", "Working well inside a shared cause", "A future picture others can join"],
    challenges: ["The group's voice replacing your own", "Futures planned, presents postponed", "Wide acquaintance with little real contact"],
    chartRole: "Planets here often describe how a person belongs to things larger than themselves — friendships, movements, and long-range hopes.",
    keywords: ["friends", "community", "groups", "causes", "hopes", "networks", "society", "friendship", "belonging", "future"],
    related: ["signs/aquarius", "planets/uranus", "houses/5th-house"],
  }),
  HOUSE(12, "12th", "twelfth", {
    houseOf: "The Unseen",
    naturalSign: "Pisces",
    arena: "solitude, the unexamined, and what runs quietly in the background",
    summary: "The 12th House is commonly read as the house of the unseen — solitude, endings, the unconscious, and what works behind the scenes.",
    overview: [
      "The 12th House covers what is not on display: solitude and retreat, the patterns running underneath deliberate behaviour, work done out of sight, and the closing of a cycle before the next begins. Older texts associate it with confinement and large institutions; modern practice reads it more often as interiority.",
      "It is the last house and cadent, completing the wheel before the Ascendant begins it again. Its opposite, the 6th, covers the visible routine — the axis is often read as what a life does openly against what it does without noticing.",
    ],
    themes: ["solitude", "unconscious", "endings", "retreat", "compassion"],
    everyday: [
      "What you do with genuine solitude when you get it",
      "The pattern in your behaviour that someone else pointed out first",
      "Work you do that nobody sees the doing of",
    ],
    constructive: "Constructive 12th House is a real interior life: solitude that restores rather than isolates, compassion extended to what other people write off, and the ability to notice a pattern in yourself without needing it to be a crisis first. Behind-the-scenes work is done here well and without fuss.",
    difficult: "The difficult version runs unattended. Habits keep operating without ever being examined, retreat extends past restoration into avoidance, and a person can end up absent from a life that wanted them present. What is unexamined here tends to be acted out rather than thought about.",
    whenEmphasized: "Several planets in the 12th House is commonly read as a chart with a large private interior — someone whose visible life accounts for less of them than it appears to. Readings usually ask where they are properly known.",
    reflections: [
      "What restores you about being alone, and when does it stop restoring you?",
      "Which pattern of yours did someone else notice before you did?",
      "What are you carrying that you have not talked to anyone about?",
    ],
    strengths: ["A rich interior life", "Compassion for what others discard", "Behind-the-scenes work done well"],
    challenges: ["Patterns running unattended in the background", "Retreat extending past restoration", "Being absent from a life that wanted you present"],
    chartRole: "Planets here often describe what a person keeps private — including from themselves — and where retreat restores or isolates them.",
    keywords: ["unconscious", "solitude", "secrets", "endings", "retreat", "dreams", "institutions", "privacy", "behind the scenes", "alone"],
    related: ["signs/pisces", "planets/neptune", "houses/6th-house"],
  }),
]);
