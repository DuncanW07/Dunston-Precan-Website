// DP-41 catalogue. Names, colors and band options carry over from the original
// Dunston Co. storefront; copy is aligned with the brand handoff.
export const PRICE = 350; // USD. OPEN: confirm launch price with the founders.

export const MODELS = [
  {
    id: 'discipline', name: 'Discipline', color: 'British Racing Green & silver',
    band: 'British Racing Green steel bracelet', leather: 'Brown grained leather strap', defaultBand: 'leather',
    moment: 'For the early alarms, and the habits that build something.',
  },
  {
    id: 'courage', name: 'Courage', color: 'Burgundy & gunmetal',
    band: 'Gunmetal steel bracelet',
    moment: 'For the leap: the move, the launch, the first big risk.',
  },
  {
    id: 'patience', name: 'Patience', color: 'Navy & rose gold',
    leather: 'Navy croc-embossed leather strap', defaultBand: 'leather', leatherOnly: true,
    moment: 'For the long game, and the work that takes years to show.',
  },
  {
    id: 'honor', name: 'Honor', color: 'Black & rose gold',
    band: 'Two-tone black and rose gold bracelet',
    moment: 'For keeping your word when it would be easier not to.',
  },
  {
    id: 'ambition', name: 'Ambition', color: 'Royal purple & black',
    band: 'Black steel bracelet',
    moment: 'For the goal that scares you a little, and the plan to reach it.',
  },
  {
    id: 'resilience', name: 'Resilience', color: 'Desert tan & gunmetal',
    band: 'Gunmetal steel bracelet',
    moment: 'For getting back up after the setback that should have stopped you.',
  },
  {
    id: 'loyalty', name: 'Loyalty', color: 'Cream & espresso',
    band: 'Stainless steel bracelet', leather: 'Espresso suede strap',
    moment: 'For the people who were there before anything worked.',
  },
  {
    id: 'leadership', name: 'Leadership', color: 'Black & silver',
    band: 'Stainless steel bracelet', leather: 'Black grained leather strap',
    moment: 'For the day people start looking to you to lead.',
  },
  {
    id: 'humility', name: 'Humility', color: 'White & silver',
    band: 'Stainless steel bracelet', leather: 'White grained leather strap',
    moment: 'For staying grounded no matter how far you get.',
  },
  {
    id: 'gratitude', name: 'Gratitude', color: 'Ice blue & steel',
    band: 'Stainless steel bracelet', leather: 'White grained leather strap',
    moment: "For remembering how far you've come.",
  },
];

// The three watches shown on the collection ledge, left to right.
export const FEATURED = [
  { id: 'patience', band: 'leather', cutout: 'assets/watches/patience.webp' },
  { id: 'discipline', band: 'leather', cutout: 'assets/watches/discipline.webp' },
  { id: 'gratitude', band: 'bracelet', cutout: 'assets/watches/gratitude.webp' },
];

export const VIRTUES = {
  discipline: "Discipline is doing the work when nobody is watching and nothing is forcing you. It's the early alarm, the extra hour, and the habit you keep long after the motivation wears off. Talent gets attention, but discipline is what actually builds something. Every big result starts as a small promise you keep to yourself, over and over, until it becomes who you are. That's why Discipline is our first watch. It's for the first real routine and the moment you realize the grind is working. Wear it as a reminder that the results you want come from what you do every single day, especially on the days you don't feel like it.",
  courage: "Courage isn't the absence of fear. It's moving anyway. It's sending the pitch, signing the lease, leaving the safe job, or launching the thing you've been sitting on for months. Most people never find out what they're capable of because the first step feels too risky. The ones who build something real are usually the ones who were scared and did it regardless. Courage is for the leap: the move to a new city, the first business, the first big bet on yourself. It's a reminder that every milestone worth having started with a moment where you could have backed out, and didn't.",
  patience: "Patience is the virtue nobody wants to practice and everybody needs. Real things take time. Skills take years, businesses take longer than planned, and progress grows slowly before it grows fast. In a world that rewards quick hits and instant results, patience is what keeps you in the game long enough to win it. It isn't waiting around. It's trusting the process while you keep putting in the work. Patience is for the long game: the business you built slowly, the skill you finally mastered, the goal that took years instead of months. It's a reminder that slow progress is still progress.",
  honor: "Honor is keeping your word when it would be easier not to. It's how you treat people when there's nothing to gain, and how you act when no one would ever find out. Success built on cutting corners never lasts, but a reputation for doing what you say follows you everywhere. In business and in life, people bet on the ones they can trust. Honor is for the milestones that are about character, not just achievement: the promise you kept, the deal you shook on, the moment you chose the right way over the easy way. It's a reminder that who you are matters as much as what you build.",
  ambition: "Ambition is wanting more and being willing to work for it. It's the reason you're up late on a business idea while everyone else is scrolling. Some people treat ambition like a bad word, but every company, record and breakthrough started with someone who refused to settle for average. Real ambition isn't about status. It's about seeing what your life could be and deciding to go get it. Ambition is for the first big goal you said out loud: the startup, the number you want to hit, the thing everyone said was too much. It's a reminder to keep aiming higher than what's comfortable, and to back every big dream with the work it takes.",
  resilience: "Resilience is what happens after you fail. Everyone gets knocked down, whether it's a rejected pitch, a business that didn't work, or a year that went sideways. What separates people isn't whether they fall. It's how fast they get back up and what they learn on the way. Resilience turns setbacks into lessons and lessons into progress. It's quiet and doesn't look impressive in the moment, but it's behind almost every success story you've heard. Resilience is for the comeback: the second attempt, the rebuild, the time you kept going when quitting made sense. It's a reminder that a bad chapter doesn't end the story.",
  loyalty: "Loyalty is sticking with the people who stuck with you. It's the friend who backed your idea when it was still a joke, the family who believed in you first, and the partner who stayed through the hard part. Anyone can show up when things are going well. Loyalty shows up when they aren't. In a world where people switch sides the moment it's convenient, being someone others can count on is rare and valuable. Loyalty is for the people behind your milestones: the co-founder, the best friend, the parent who made it possible. It's a reminder that nobody builds anything great alone.",
  humility: "Humility is staying grounded no matter how much you win. It's knowing there's always more to learn, crediting the people who helped you, and never acting like you're above the work. Confidence gets you in the room, but humility keeps you growing once you're there. The moment you think you've figured it all out is usually the moment you stop improving. Humility is for the milestone where you've made real progress: the first big success, or the first time people start looking up to you. It's a reminder to stay hungry, stay teachable, and remember where you started.",
  gratitude: "Gratitude is taking a moment to notice what you already have. When you're chasing big goals, it's easy to always look at the next thing and forget how far you've come. Gratitude doesn't mean settling. It means appreciating the people, chances and lessons that got you here, while still pushing forward. People who practice it tend to be steadier and easier to work with. Gratitude is for the milestone where you stop and look back: the first big win, the first place of your own, the moment you realize the hard years paid off. It's a reminder that the journey matters as much as the destination.",
  leadership: "Leadership is taking responsibility when it would be easier to wait for someone else. It's setting the standard, making the hard call, and owning the result when things go wrong. Real leaders don't need a title. They're the ones people follow because they show up prepared, stay calm under pressure, and lift the people around them. Whether you're running a team, a business, or just your own life, leadership starts with leading yourself first. Leadership is for the milestone where people start counting on you: the first hire, the captain's role, the first time you're the one in charge. It's a reminder that the best leaders earn trust before they ask for it.",
};

export const byId = (id) => MODELS.find((m) => m.id === id);

// Which bands a colorway can be ordered with.
export function bandsFor(m) {
  if (m.leatherOnly) return [{ id: 'leather', label: 'Leather strap', detail: m.leather }];
  const out = [{ id: 'bracelet', label: 'Steel bracelet', detail: m.band }];
  if (m.leather) out.push({ id: 'leather', label: 'Leather strap', detail: m.leather });
  return out;
}

export function defaultBand(m) {
  return m.leatherOnly ? 'leather' : (m.leather && m.defaultBand) || 'bracelet';
}

// Photos from the original storefront: <id>-<view>[-leather].jpg
export function photo(m, view, band) {
  const leather = band === 'leather' && m.leather;
  return `assets/products/${m.id}-${view}${leather ? '-leather' : ''}.jpg`;
}

export function photoAlt(m, view, band) {
  const label = { front: 'front view', angle: 'angled view', side: 'side view' }[view];
  const desc = band === 'leather' && m.leather ? m.leather.toLowerCase() : 'steel bracelet';
  return `Dunston Precan ${m.name}, ${m.color.toLowerCase()}, ${desc}, ${label}`;
}

export const money = (n) => '$' + n.toLocaleString('en-US');
