// Orbit Axis :: where a function is experienced.
//
// Houses are life areas, not places. Every string completes "…directs this
// toward ⟨area⟩" or stands alone as the house's own description, so the text
// describes a DOMAIN and never a trait.
//
// Nothing in this file may be shown unless the engine returned a house for the
// planet. Houses depend entirely on a reliable birth time; with an unknown
// time `planet_houses` is empty and none of this is reachable.

const house = (number, title, data) => Object.freeze({ number, title, ...data });

export const HOUSES = Object.freeze({
  1: house(1, "Self and approach", {
    area: "how you meet the world and how it first reads you",
    detail: "The first house covers your approach — the manner you lead with, "
          + "before anyone knows anything else about you.",
  }),
  2: house(2, "Resources and worth", {
    area: "what you own, earn, and count as valuable",
    detail: "The second house covers resources and self-worth together, which "
          + "is less strange than it sounds: both are questions about what you "
          + "treat as yours and worth keeping.",
  }),
  3: house(3, "Communication and immediate world", {
    area: "conversation, learning, and the places you move through daily",
    detail: "The third house covers the near environment — siblings, "
          + "neighbours, short journeys, and the everyday exchange of "
          + "information.",
  }),
  4: house(4, "Home and roots", {
    area: "home, family, and where you come from",
    detail: "The fourth house covers your private base: the household you grew "
          + "up in, the one you make, and what you need from a place before it "
          + "counts as home.",
  }),
  5: house(5, "Creativity and play", {
    area: "creative work, play, romance, and children",
    detail: "The fifth house covers what you make for the pleasure of making "
          + "it — including creative work, risk taken for enjoyment, and the "
          + "part of romance that is delight rather than partnership.",
  }),
  6: house(6, "Work and routine", {
    area: "daily work, habits, health, and service",
    detail: "The sixth house covers the ordinary maintenance of a life: the "
          + "job rather than the career, the routine rather than the goal, and "
          + "the body's day-to-day upkeep.",
  }),
  7: house(7, "Partnership", {
    area: "close partnerships and one-to-one dealings",
    detail: "The seventh house covers committed one-to-one relationships of "
          + "every kind — partners, collaborators, and the people you "
          + "negotiate directly with.",
  }),
  8: house(8, "Shared resources and depth", {
    area: "shared resources, intimacy, and things that transform",
    detail: "The eighth house covers what is held jointly — money, trust, "
          + "vulnerability — and the experiences that change you rather than "
          + "adding to you.",
  }),
  9: house(9, "Meaning and distance", {
    area: "belief, study, travel, and the wider view",
    detail: "The ninth house covers the search for meaning: higher study, "
          + "long-distance travel, and the frameworks you use to make sense of "
          + "things.",
  }),
  10: house(10, "Vocation and public role", {
    area: "career, reputation, and what you are known for",
    detail: "The tenth house covers your public standing — the work you are "
          + "recognised by and the direction you are understood to be heading.",
  }),
  11: house(11, "Community and hopes", {
    area: "friendships, groups, and long-range hopes",
    detail: "The eleventh house covers the wider network rather than the close "
          + "pair: friends, communities, and the future you are working "
          + "toward with other people.",
  }),
  12: house(12, "Inner life and retreat", {
    area: "solitude, the unconscious, and what happens out of view",
    detail: "The twelfth house covers what is not on display — rest, retreat, "
          + "private processing, and the parts of yourself you meet alone.",
  }),
});

export function houseMeaning(number) {
  return HOUSES[Number(number)] || null;
}
