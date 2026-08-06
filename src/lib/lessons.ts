import type { Route } from "next";

import { CONGRESS_GOV_COMMITTEES } from "@/lib/congress/committees";
import { type BillStage, billStageLabels, billStages } from "@/lib/congress/types";

/**
 * The learning modules reached from `/learn`, and the content of each one.
 *
 * Hand-curated editorial content, not sourced from the Congress.gov API — the same reason `glossary.ts` sits in
 * `src/lib` rather than `src/lib/congress`. What is new here, and what `docs/roadmap.md` gated the second and third
 * modules on, is that **a lesson cites its sources**. A glossary entry is a definition anyone could check in a
 * dictionary; a five-step explanation of how a chamber records a vote is a claim, and a project whose entire premise is
 * that you can verify what it tells you should not make claims a reader cannot follow anywhere.
 *
 * Three rules hold across every lesson below, and the tests beside this file are what keep them:
 *
 * - **Every source is a primary one, and names its publisher.** house.gov, senate.gov, clerk.house.gov, congress.gov,
 *   and the National Archives' transcription of the Constitution. No secondary explainers, and nothing behind a
 *   paywall — a citation a reader cannot open is decoration.
 * - **Every lesson states what it leaves out**, in its own `limits`, rendered on the page rather than left in a doc.
 *   These are simplifications by design; a simplification that doesn't say so is just an inaccuracy.
 * - **A lesson never claims this app shows something it doesn't.** The voting module is the sharp case: Civic Ledger
 *   holds no roll-call data at all, and the lesson says so in the same breath it explains what a recorded vote is, then
 *   sends the reader to the two chambers' own tallies.
 *
 * Content lives here rather than in the route files on the rule `committees.ts` states for display wording: what a
 * reader is told should be somewhere it can be unit-tested, not somewhere reachable only by rendering a page.
 */

/**
 * One citation under a lesson.
 *
 * `publisher` is separate from `title` rather than folded into it because it is the part that does the work: "In
 * Committee" means nothing on its own, and "In Committee — house.gov" tells a reader they are about to leave for the
 * House's own explanation rather than for someone's summary of it.
 */
export type LessonSource = {
  /** The document's own title, as its publisher spells it. */
  title: string;
  /** Who publishes it, in the form a reader would recognize — "house.gov", "U.S. Senate", "National Archives". */
  publisher: string;
  /** The absolute URL. Always https, always a primary source. @see the module comment above. */
  href: string;
};

/**
 * One step of a lesson: a heading, the explanation under it, and — when the step lines up with a stage of the lifecycle
 * the rest of the app already visualizes — the `BillJourney` stage it pins.
 *
 * `stage` is optional because only the first module is *about* those five stages. The other two use it once each, as a
 * "you are here" cue: the committee module pins `committee` on its opening step, and the voting module pins `chamber`
 * on the step that explains what passing one actually consisted of. A reader who has seen the stepper on a bill page
 * meets it again at the moment it is relevant, rather than being shown a second diagram of the same process.
 */
export type LessonStep = {
  /** Unique within its lesson. Becomes the heading's `id`, which the step's `<article>` is labeled by. */
  id: string;
  heading: string;
  copy: string;
  stage?: BillStage;
};

/** The closing "read this next" panel, whose copy differs per lesson because what to do next does. */
export type LessonNext = {
  kicker: string;
  heading: string;
  body: string;
  href: Route;
  linkLabel: string;
};

/** The slugs `/learn/[slug]` serves. A closed union so a mistyped slug is a type error rather than a 404. */
export type LessonSlug = "how-a-bill-becomes-law" | "what-committees-do" | "how-congress-votes";

/** One learning module, in full. @see the module comment for the rules every one of these holds. */
export type Lesson = {
  slug: LessonSlug;
  /** The short name: the browser tab, the search result, the hub card's link. */
  title: string;
  /** The display heading — a full sentence, which is why it is separate from {@link Lesson.title}. */
  heading: string;
  /** One sentence, used as both the page description a crawler reads and the hub card's body copy. */
  summary: string;
  /** The line under the page's own heading. Says why the lesson is worth reading, where `summary` says what it is. */
  intro: string;
  /**
   * What a step is called in this lesson's kickers — "Stage 3 of 5" in the lifecycle module, whose steps really are the
   * stages `BillJourney` draws, and "Step 3 of 5" in the two that describe a process without a stepper.
   */
  stepNoun: "Stage" | "Step";
  steps: LessonStep[];
  /** The heading over {@link Lesson.limits}, named for what this particular lesson is simplifying. */
  limitsHeading: string;
  /** What the lesson, or the app, deliberately does not tell you. Never empty. */
  limits: string[];
  sources: LessonSource[];
  next: LessonNext;
};

/** The two chambers' own walkthroughs of the process, cited by more than one lesson. */
const HOUSE_LEGISLATIVE_PROCESS: LessonSource = {
  title: "The Legislative Process",
  publisher: "house.gov",
  href: "https://www.house.gov/the-house-explained/the-legislative-process",
};

const HOUSE_IN_COMMITTEE: LessonSource = {
  title: "In Committee",
  publisher: "house.gov",
  href: "https://www.house.gov/the-house-explained/the-legislative-process/in-committee",
};

const CONSTITUTION_TRANSCRIPT: LessonSource = {
  title: "The Constitution of the United States: A Transcription",
  publisher: "National Archives",
  href: "https://www.archives.gov/founding-docs/constitution-transcript",
};

/**
 * The lifecycle lesson's copy, keyed by the stage each step pins.
 *
 * Keyed rather than listed so the steps can be *derived* from `billStages` below. That is the load-bearing part: the
 * lesson walks the same five stages `BillJourney` draws on a real bill record, in the same order, under the same
 * labels — and a sixth stage added upstream in `types.ts` becomes a missing-key type error here rather than a lesson
 * that quietly stops covering the process it claims to.
 */
const billLifecycleCopy: Record<BillStage, string> = {
  introduced:
    "A member of Congress formally files the bill's text. It receives a number — like HR 284 or S 917 — that " +
    "identifies it for the rest of this two-year Congress. Other members can sign on as cosponsors, but " +
    "cosponsorship alone does not move a bill forward.",
  committee:
    "The bill is referred to the committee(s) with jurisdiction over its subject. Most bills are never reported " +
    "back out — a committee can hold hearings, rewrite the text, or simply take no further action, which is how " +
    "the large majority of introduced bills quietly end.",
  chamber:
    "If a committee does report the bill, its full chamber — the House or the Senate — can debate, amend, and " +
    "vote on it. Passing one chamber is real progress, but the other chamber still has to pass an identical " +
    "version before the bill can go any further.",
  president:
    "Once both chambers pass the same text, it's presented to the President, who has ten days (Sundays excepted) " +
    "to sign it, let it become law without a signature, or veto it and send it back to Congress with objections.",
  law:
    "A signed (or otherwise enacted) bill becomes a public law and is assigned a public-law number. Congress.gov " +
    "links the original bill to that public-law record once it's available.",
};

/**
 * The lifecycle lesson's steps, derived from `billStages` so their order and headings cannot drift from the stepper the
 * reader meets on every bill page. @see billLifecycleCopy.
 */
const billLifecycleSteps: LessonStep[] = billStages.map(
  (stage: BillStage): LessonStep => ({
    id: stage,
    heading: billStageLabels[stage],
    copy: billLifecycleCopy[stage],
    stage,
  }),
);

/**
 * Every learning module, in reading order.
 *
 * The order is the lesson numbering: a module's position here is what the hub prints as "Lesson 2" and what its own
 * page prints in its eyebrow, so the number is never written down anywhere it can disagree with the sequence.
 *
 * The sequence itself is an argument. The lifecycle comes first because it is the frame the other two sit inside.
 * Committees come second because that is where the large majority of bills actually end, which the first lesson states
 * and does not explain. Voting comes last because it is the one most likely to be read for a specific bill, and it is
 * the most honest to read *after* knowing how little of the process is settled by a vote at all.
 */
export const lessons: readonly Lesson[] = [
  {
    slug: "how-a-bill-becomes-law",
    title: "How a Bill Becomes a Law",
    heading: "The Path From an Introduced Bill to a Public Law.",
    summary: "The five stages every bill passes through, from introduction to enactment, walked one step at a time.",
    intro:
      "Most bills never reach the last step. Seeing why, stage by stage, makes a bill's progress cue easier to read " +
      "anywhere else in this app.",
    stepNoun: "Stage",
    steps: billLifecycleSteps,
    limitsHeading: "What This Simplification Leaves Out",
    limits: [
      "A veto is not a stage of its own here. Congress can override one with a two-thirds vote in both chambers, and " +
        "a bill the President neither signs nor returns before Congress adjourns fails without a veto ever being cast.",
      "The two chambers rarely pass identical text on the first try. Amendments traded back and forth — and the " +
        "conference committees that sometimes settle them — all happen inside the single step labeled “Passed a Chamber.”",
      "The stage shown on a bill page is inferred from the wording of its latest action, not read from a legal " +
        "determination. It can orient you; the official record decides.",
    ],
    sources: [
      HOUSE_LEGISLATIVE_PROCESS,
      {
        title: "Introduction & Referral",
        publisher: "house.gov",
        href: "https://www.house.gov/the-house-explained/the-legislative-process/introduction-referral",
      },
      HOUSE_IN_COMMITTEE,
      {
        title: "To the President",
        publisher: "house.gov",
        href: "https://www.house.gov/the-house-explained/the-legislative-process/to-the-president",
      },
      CONSTITUTION_TRANSCRIPT,
    ],
    next: {
      kicker: "Now See It in a Real Bill",
      heading: "Every Stage Here Maps to the Same Stepper on a Live Bill Record.",
      body: "Open any bill in the directory and watch this same five-step journey track its actual, source-linked progress.",
      href: "/bills" as Route,
      linkLabel: "Explore Bills",
    },
  },
  {
    slug: "what-committees-do",
    title: "What a Committee Actually Does",
    // Headings on this page are set at the display clamp `PageHeader` uses, so they are kept to a few words. The full
    // claim lives in `summary` and `intro`, which are set at reading size.
    heading: "Where Most Bills Quietly End.",
    summary:
      "Referral, subcommittee, hearings, markup, and the silence that ends most bills — what happens between “Introduced” and a floor vote.",
    intro:
      "“In Committee” is one word on a stepper and months of the process. It is also the stage where the large " +
      "majority of bills stop, which makes it the one most worth understanding.",
    stepNoun: "Step",
    steps: [
      {
        id: "referral",
        heading: "Referral",
        copy:
          "Right after introduction, the bill is referred to the committee(s) whose jurisdiction covers its subject " +
          "— by the Speaker in the House and the presiding officer in the Senate, both acting on long-settled rules " +
          "rather than on the bill's merits. A bill touching several subjects can be referred to several committees " +
          "at once. Referral is routing, not endorsement.",
        stage: "committee",
      },
      {
        id: "subcommittee",
        heading: "Down to a Subcommittee",
        copy:
          "Most committees divide their jurisdiction among subcommittees, and most of the detailed work happens " +
          "there first. A subcommittee only means anything in relation to its parent, which is why this app folds " +
          "them into the parent's page rather than listing them beside it as though the two were comparable bodies.",
      },
      {
        id: "hearings",
        heading: "Hearings",
        copy:
          "A committee can call witnesses — agency officials, subject experts, affected people — to testify on the " +
          "record. A hearing is a way of building a record, not a vote on the bill, and a bill can be the subject of " +
          "hearings for years without ever being voted on.",
      },
      {
        id: "markup",
        heading: "Markup",
        copy:
          "In a markup, the committee goes through the bill and amends it. This is the step that most often makes the " +
          "text you read at introduction different from the text a chamber eventually votes on — sometimes " +
          "unrecognizably so, when a committee replaces the whole thing with a substitute.",
      },
      {
        id: "reported",
        heading: "Reported, or Not",
        copy:
          "If the committee votes to advance the bill, it reports it back to the chamber, usually with a written " +
          "report explaining what it changed and why. If it doesn't, nothing happens — no rejection, no vote, no " +
          "record of a decision. That silence is the ordinary end of an introduced bill. The House offers one way " +
          "around it: a discharge petition signed by a majority of members, 218, can force a bill out of committee, " +
          "and it very rarely succeeds.",
      },
    ],
    limitsHeading: "What This App Cannot Tell You About a Committee",
    limits: [
      "Who sits on one. Congress.gov's committee endpoints publish no roster, and this project will not assemble one " +
        "by inference — a list of names under a committee heading reads as a fact whatever caveat sits beside it.",
      "What it is doing this week. Hearing schedules, witness lists, and transcripts are published elsewhere and are " +
        "not part of what this app reads.",
      "Which subcommittee a specific bill went to. The referral this app shows names the committee; the level below " +
        "it is not in the record it reads.",
    ],
    sources: [
      HOUSE_IN_COMMITTEE,
      { title: "Committees", publisher: "house.gov", href: "https://www.house.gov/committees" },
      { title: "Committees", publisher: "U.S. Senate", href: "https://www.senate.gov/committees/" },
      { title: "Committees of the U.S. Congress", publisher: "Congress.gov", href: CONGRESS_GOV_COMMITTEES },
    ],
    next: {
      kicker: "Now Find One",
      heading: "Every Committee of This Congress, With Its Subcommittees and Its Name History.",
      body: "The directory lists parent committees and folds subcommittees into them — including the renamings that record a change in what a committee covers.",
      href: "/committees" as Route,
      linkLabel: "Browse Committees",
    },
  },
  {
    slug: "how-congress-votes",
    title: "How Congress Votes",
    heading: "What “Passed” Is a Majority Of.",
    summary:
      "Quorums, voice votes, recorded votes, cloture, and the two-thirds threshold — why “passed” can mean several different arithmetics.",
    intro:
      "A tally looks like the most objective fact in the legislative process. What it is a majority of is the part " +
      "that varies, and this app shows none of these numbers — it names the votes and links the chambers' own " +
      "records, so this lesson also says where to find them.",
    stepNoun: "Step",
    steps: [
      {
        id: "quorum",
        heading: "A Quorum First",
        copy:
          "The Constitution sets a majority of each chamber as the quorum needed to do business (Article I, " +
          "Section 5). In practice both chambers proceed as though a quorum is present until someone questions it, " +
          "which is itself a procedural move rather than a neutral observation.",
      },
      {
        id: "voice-and-recorded",
        heading: "Voice Votes and Recorded Votes",
        copy:
          "Most questions are settled by voice: the presiding officer asks for the ayes and noes and rules on which " +
          "was louder, and no individual position is recorded at all. Names go on the record only when a recorded " +
          "vote is demanded — the Constitution lets one-fifth of the members present require it, and each chamber's " +
          "rules add their own mechanics. So a bill can pass a chamber without any member having cast a vote anyone " +
          "can look up.",
        stage: "chamber",
      },
      {
        id: "denominator",
        heading: "A Majority of Whom",
        copy:
          "Ordinary passage takes a majority of those present and voting, not of the chamber's full membership. That " +
          "is why 217–210 and 51–49 are both majorities, and why absences change the number a bill needs rather than " +
          "just the number it gets. A tally with no denominator beside it is half a fact.",
      },
      {
        id: "cloture",
        heading: "The Senate's Extra Threshold",
        copy:
          "Passing a bill in the Senate takes a simple majority; reaching the vote usually takes more. Ending " +
          "debate under the Senate's cloture rule takes three-fifths of all senators — 60 when every seat is filled " +
          "— which is why a bill with 55 declared supporters can stall without ever losing a vote. Nothing in a bill's " +
          "record labels this; it shows up as a bill that stops moving.",
      },
      {
        id: "two-thirds",
        heading: "Two-Thirds, Twice",
        copy:
          "If the President vetoes a bill, Congress can enact it anyway — but only with a two-thirds vote in both " +
          "chambers, not the majority that passed it the first time. The same two-thirds threshold appears elsewhere " +
          "in the Constitution, which is a useful reminder that “Congress voted” describes several different bars.",
        stage: "president",
      },
    ],
    limitsHeading: "What This App Does Not Show About a Vote",
    limits: [
      "Roll-call tallies, and who voted which way. A bill's page names each recorded vote taken on it and links the " +
        "chamber's own record, but the arithmetic — the counts, the margins, the individual positions — stays there. " +
        "The sources below are those records, and they are the answer to every question of this kind.",
      "Any vote not taken on a bill. Procedural votes, votes on nominations, and votes on motions that never attach " +
        "to a measure are not reachable from the records this app reads, because it reaches votes through bills.",
      "Why a bill stopped. A bill that failed cloture and a bill nobody scheduled look identical in the record this " +
        "app reads: an action history that stopped growing.",
    ],
    sources: [
      {
        title: "About Voting",
        publisher: "U.S. Senate",
        href: "https://www.senate.gov/about/powers-procedures/voting.htm",
      },
      {
        title: "About Filibusters and Cloture",
        publisher: "U.S. Senate",
        href: "https://www.senate.gov/about/powers-procedures/filibusters-cloture.htm",
      },
      { title: "Roll Call Votes", publisher: "U.S. Senate", href: "https://www.senate.gov/legislative/votes_new.htm" },
      { title: "Roll Call Votes", publisher: "Office of the Clerk, U.S. House", href: "https://clerk.house.gov/Votes" },
      {
        title: "House Floor",
        publisher: "house.gov",
        href: "https://www.house.gov/the-house-explained/the-legislative-process/house-floor",
      },
      CONSTITUTION_TRANSCRIPT,
    ],
    next: {
      kicker: "See What the Record Does Say",
      heading: "A Bill's Own Page Names Every Recorded Vote Taken on It.",
      body: "Open a bill and read its action history — then follow each roll call to the chamber's own tally for the numbers.",
      href: "/bills" as Route,
      linkLabel: "Explore Bills",
    },
  },
];

/**
 * Finds the lesson a `/learn/[slug]` request names.
 *
 * @param slug - The raw route param, which arrives from the URL bar and is therefore untrusted.
 * @returns The lesson, or `undefined` for anything the registry doesn't name — which the route turns into a 404 rather
 *   than an empty page.
 */
export function findLesson(slug: string): Lesson | undefined {
  const value: string = slug.trim().toLowerCase();
  return lessons.find((lesson: Lesson): boolean => lesson.slug === value);
}

/**
 * A lesson's number, as the hub and the lesson's own eyebrow print it.
 *
 * Derived from position in {@link lessons} rather than stored on the lesson, so inserting a module renumbers the ones
 * after it instead of leaving two lessons both calling themselves the third.
 *
 * @param lesson - The lesson to number.
 * @returns Its one-based position, or `0` for a lesson not in the registry — which no caller can construct, since the
 *   only way to obtain a `Lesson` is to read one out of it.
 */
export function lessonNumber(lesson: Lesson): number {
  return lessons.indexOf(lesson) + 1;
}
